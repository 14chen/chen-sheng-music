// 阶段三 TDD：歌词同步逻辑测试
// 生产路径使用 lyrics_panel.dart 的 lyricIndexAt（LyricsPanel 实际调用的实现），
// 因此这里直接测试它，避免"测试了另一套引擎"的验证失真。
import 'package:flutter_test/flutter_test.dart';
import 'package:cheng_sheng_music/lyrics_panel.dart';

List<LyricEntry> buildSong() => const [
      LyricEntry(time: 0, endTime: 15, original: 'L0', translation: null, status: 'not_required'),
      LyricEntry(time: 15, endTime: 32, original: 'L1', translation: null, status: 'not_required'),
      LyricEntry(time: 32, endTime: 50, original: 'L2', translation: null, status: 'not_required'),
      LyricEntry(time: 50, endTime: 72, original: 'L3', translation: null, status: 'not_required'),
      LyricEntry(time: 72, endTime: 95, original: 'L4', translation: null, status: 'not_required'),
      LyricEntry(time: 95, endTime: 120, original: 'L5', translation: null, status: 'not_required'),
    ];

// offsetMs：正数=歌词整体延后，负数=提前
int indexAt(List<LyricEntry> entries, int positionMs, {int offsetMs = 0}) =>
    lyricIndexAt(entries, (positionMs - offsetMs) / 1000.0);

void main() {
  test('5 个采样时间点：高亮行正确且偏差在 ±200ms', () {
    final song = buildSong();
    // 采样点选在每行起始时间 + 少量偏移（模拟真实播放）
    final samples = [100, 15100, 32100, 50150, 95120];
    final expected = [0, 1, 2, 3, 5];
    for (var i = 0; i < samples.length; i++) {
      final idx = indexAt(song, samples[i]);
      expect(idx, expected[i], reason: '采样 ${samples[i]}ms 应高亮第 ${expected[i]} 行');
      final dev = ((song[idx].time * 1000).round() - samples[i]).abs();
      expect(dev <= 200, true, reason: '偏差 $dev ms 应 ≤200ms');
    }
  });

  test('seek 跳转后立即对齐，不等自然滚动', () {
    final song = buildSong();
    expect(indexAt(song, 0), 0);
    expect(indexAt(song, 50000), 3); // 跳到 50s → 立即第 3 行
    expect(indexAt(song, 95000), 5); // 跳到 95s → 立即第 5 行
    expect(indexAt(song, 120000), 5); // 末尾保持
  });

  test('offset 校准：+500ms 延后，-300ms 提前', () {
    final song = buildSong();
    expect(indexAt(song, 15200), 1); // 无 offset：15.2s 已是第1行
    expect(indexAt(song, 15200, offsetMs: 500), 0); // 延后500ms → 仍第0行
    expect(indexAt(song, 15550, offsetMs: 500), 1); // 到 15.55s 才第1行
    expect(indexAt(song, 14750, offsetMs: -300), 1); // 提前300ms → 14.75s 已第1行
  });

  test('暂停在两行之间：保持当前行不跳变', () {
    final song = buildSong();
    expect(indexAt(song, 31000), 1); // 1行区间内
    expect(indexAt(song, 31999), 1); // 仍在1行
    expect(indexAt(song, 32000), 2); // 到边界切2行
  });

  test('空歌词安全返回 -1', () {
    expect(lyricIndexAt(const [], 1.0), -1);
  });
}
