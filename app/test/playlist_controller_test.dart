import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:cheng_sheng_music/playlist_controller.dart';

void main() {
  group('PlaylistController 播放模式', () {
    test('sequence：自动播完末尾应停止（返回 null）', () {
      final c = PlaylistController(PlayMode.sequence);
      expect(c.nextIndex(2, 3, manual: false), isNull);
    });

    test('sequence：手动点下一首，在末尾应回到第一首（不死锁）', () {
      final c = PlaylistController(PlayMode.sequence);
      expect(c.nextIndex(2, 3, manual: true), 0);
    });

    test('loop：播完末尾回到开头', () {
      final c = PlaylistController(PlayMode.loop);
      expect(c.nextIndex(2, 3, manual: false), 0);
    });

    test('single：自动播完应重播当前曲（返回当前下标）', () {
      final c = PlaylistController(PlayMode.single);
      expect(c.nextIndex(1, 3, manual: false), 1);
    });

    test('single：手动点下一首仍按列表前进（关键边界：不能死锁）', () {
      final c = PlaylistController(PlayMode.single);
      expect(c.nextIndex(1, 3, manual: true), 2);
      expect(c.nextIndex(2, 3, manual: true), 0);
    });

    test('长度<=0 或越界 cur 时安全返回', () {
      final c = PlaylistController(PlayMode.loop);
      expect(c.nextIndex(0, 0, manual: true), isNull);
      expect(c.nextIndex(5, 3, manual: true), 0);
    });

    test('shuffle：连续多次随机不返回当前曲', () {
      final c = PlaylistController(PlayMode.shuffle, random: Random(42));
      final ids = ['a', 'b', 'c', 'd'];
      int cur = 0;
      for (int i = 0; i < 12; i++) {
        final next = c.nextIndex(cur, ids.length, manual: false, ids: ids)!;
        expect(next, isNot(cur), reason: '第 $i 次随机不应返回当前曲 $cur');
        cur = next;
      }
    });

    test('shuffle：不连续重复同一首（按 id 判定）', () {
      final c = PlaylistController(PlayMode.shuffle, random: Random(7));
      final ids = ['a', 'b', 'c', 'd'];
      int cur = 0;
      String? lastId;
      for (int i = 0; i < 12; i++) {
        final next = c.nextIndex(cur, ids.length, manual: false, ids: ids)!;
        expect(ids[next], isNot(lastId), reason: '不应连续播放同一 id');
        lastId = ids[next];
        cur = next;
      }
    });

    test('模式循环顺序包含 single：sequence→loop→shuffle→single→sequence', () {
      final modes = <PlayMode>[];
      var m = PlayMode.sequence;
      for (int i = 0; i < 4; i++) {
        modes.add(m);
        m = m.next;
      }
      expect(modes, [
        PlayMode.sequence,
        PlayMode.loop,
        PlayMode.shuffle,
        PlayMode.single,
      ]);
      expect(m, PlayMode.sequence);
    });

    test('setMode 切换后行为立即改变', () {
      final c = PlaylistController(PlayMode.sequence);
      expect(c.nextIndex(2, 3, manual: false), isNull);
      c.setMode(PlayMode.single);
      expect(c.nextIndex(2, 3, manual: false), 2);
    });
  });
}
