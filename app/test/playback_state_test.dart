// P0-2 复现测试：切歌/模式变化必须广播给所有监听者（PlayerPage 据此刷新）
import 'package:flutter_test/flutter_test.dart';
import 'package:cheng_sheng_music/playback_state.dart';
import 'package:cheng_sheng_music/playlist_controller.dart';
import 'package:cheng_sheng_music/track.dart';

Track _t(String id) => Track(
      id: id, source: 'local', title: '歌$id', artist: '', album: '',
    );

void main() {
  test('切歌后所有监听者收到新曲目（播放页据此刷新标题/歌词/下载目标）', () {
    final state = PlaybackState();
    final ids = <String?>[];
    state.current.addListener(() => ids.add(state.current.value?.id));

    state.setCurrent(_t('a'));
    state.setCurrent(_t('b'));

    expect(ids, ['a', 'b']);
  });

  test('模式切换后所有监听者收到新模式', () {
    final state = PlaybackState();
    final modes = <PlayMode>[];
    state.mode.addListener(() => modes.add(state.mode.value));

    state.setMode(PlayMode.single);
    state.setMode(PlayMode.sequence);

    expect(modes, [PlayMode.single, PlayMode.sequence]);
  });

  test('当前曲目与模式是两个独立通知通道', () {
    final state = PlaybackState();
    var trackUpdates = 0;
    var modeUpdates = 0;
    state.current.addListener(() => trackUpdates++);
    state.mode.addListener(() => modeUpdates++);

    state.setCurrent(_t('x'));
    expect(trackUpdates, 1);
    expect(modeUpdates, 0);

    state.setMode(PlayMode.shuffle);
    expect(trackUpdates, 1);
    expect(modeUpdates, 1);
  });
}
