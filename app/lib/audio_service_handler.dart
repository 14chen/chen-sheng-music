// 阶段三：后台播放服务（audio_service 封装 Android Media3 MediaSessionService
// 与 iOS AVAudioSession，提供通知栏/锁屏控制）
import 'dart:ui' show VoidCallback;
import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';

class MediaItemState {
  final String id;
  final String title;
  final String artist;
  final String? artwork;
  final Duration? duration;
  const MediaItemState({required this.id, required this.title,
    required this.artist, this.artwork, this.duration});

  MediaItem toMediaItem() => MediaItem(
    id: id,
    title: title,
    artist: artist,
    artUri: artwork != null ? Uri.tryParse(artwork!) : null,
    duration: duration,
  );
}

/// 后台音频处理器：持有 AudioPlayer，处理播放/暂停/切歌/seek，
/// audio_service 负责把它包装成 MediaSessionService 并生成通知栏/锁屏控制。
class MyAudioHandler extends BaseAudioHandler {
  final AudioPlayer player;
  MyAudioHandler(this.player) {
    // 播放状态 → mediaState（通知栏按钮/进度）
    player.playerStateStream.listen((state) {
      playbackState.add(PlaybackState(
        controls: const [
          MediaControl.skipToPrevious,
          MediaControl.play,
          MediaControl.pause,
          MediaControl.stop,
          MediaControl.skipToNext,
        ],
        systemActions: const {MediaAction.seek},
        playing: state.playing,
        processingState: _toProcessing(state.processingState),
        updatePosition: player.position,
        bufferedPosition: player.bufferedPosition,
        speed: 1.0,
      ));
    });
    // 位置变化持续更新（通知栏进度条）
    player.positionStream.listen((pos) {
      final s = playbackState.value;
      playbackState.add(s.copyWith(updatePosition: pos));
    });
  }

  static AudioProcessingState _toProcessing(ProcessingState p) => switch (p) {
        ProcessingState.idle => AudioProcessingState.idle,
        ProcessingState.loading => AudioProcessingState.loading,
        ProcessingState.buffering => AudioProcessingState.buffering,
        ProcessingState.ready => AudioProcessingState.ready,
        ProcessingState.completed => AudioProcessingState.completed,
      };

  @override
  Future<void> play() => player.play();
  @override
  Future<void> pause() => player.pause();
  @override
  Future<void> stop() => player.stop();
  @override
  Future<void> seek(Duration position) => player.seek(position);
  @override
  Future<void> skipToNext() async {
    // 由外部设置的回调处理（UI 层维护队列）
    _onNext?.call();
  }
  @override
  Future<void> skipToPrevious() async {
    _onPrev?.call();
  }
  // 注意：BaseAudioHandler 没有 setMediaItem 方法，这里只是更新媒体项，
  // 不能标 @override（否则 analyzer 报 override_on_non_overriding_member）。
  Future<void> setMediaItem(MediaItem item) async {
    mediaItem.add(item);
  }

  /// 设置当前曲目并切源（UI 调用）
  Future<void> setTrack(MediaItemState t, String url) async {
    mediaItem.add(t.toMediaItem());
    await player.setUrl(url);
  }

  // 切歌回调（由 UI 注入，避免 handler 持有队列）
  VoidCallback? _onNext;
  VoidCallback? _onPrev;
  void setSkipCallbacks({VoidCallback? next, VoidCallback? prev}) {
    _onNext = next;
    _onPrev = prev;
  }
}

Future<MyAudioHandler> initAudioService(AudioPlayer player) async {
  late MyAudioHandler h;
  await AudioService.init(
    builder: () {
      h = MyAudioHandler(player);
      return h;
    },
    config: AudioServiceConfig(
      androidNotificationChannelId: 'com.myapp.chengsheng.audio',
      androidNotificationChannelName: '橙声君播放控制',
      androidNotificationOngoing: true,
      androidStopForegroundOnPause: false, // 暂停时保留通知，便于恢复
      artDownscaleWidth: 256,
      artDownscaleHeight: 256,
    ),
  );
  return h;
}
