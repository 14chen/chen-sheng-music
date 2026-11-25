import 'package:flutter/foundation.dart';

import 'playlist_controller.dart';
import 'track.dart';

/// P0-2：当前曲目与播放模式的唯一状态源。
/// HomePage 切歌/切模式时更新这里，PlayerPage 监听后自动刷新，
/// 彻底解决"路由 builder 闭包捕获旧 t 导致播放页显示上一首"的问题。
class PlaybackState {
  final ValueNotifier<Track?> current = ValueNotifier<Track?>(null);
  final ValueNotifier<PlayMode> mode = ValueNotifier<PlayMode>(PlayMode.sequence);

  void setCurrent(Track track) => current.value = track;
  void setMode(PlayMode playMode) => mode.value = playMode;

  void dispose() {
    current.dispose();
    mode.dispose();
  }
}
