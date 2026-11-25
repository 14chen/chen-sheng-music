// P2 复现测试：歌词解析容错（单条坏数据不应导致整首歌词丢失）
import 'package:flutter_test/flutter_test.dart';
import 'package:cheng_sheng_music/lyrics_parser.dart';

void main() {
  test('正常同步歌词解析', () {
    final lines = parseLyricLines([
      {'time': 0.1, 'text': '第一句'},
      {'time': 2.76, 'text': "Don't make it bad"},
    ]);
    expect(lines.length, 2);
    expect(lines[0].text, '第一句');
    expect(lines[1].time, closeTo(2.76, 0.01));
  });

  test('单条 time 为字符串/缺失时跳过该行，不整体失败', () {
    final lines = parseLyricLines([
      {'time': 'bad', 'text': '坏行1'},
      {'text': '坏行2'},
      {'time': 1.5, 'text': '好行'},
    ]);
    expect(lines.length, 1);
    expect(lines[0].text, '好行');
  });

  test('null 或非 Map 条目被跳过', () {
    final lines = parseLyricLines([
      null,
      '字符串',
      {'time': 1.0, 'text': '好行'},
    ]);
    expect(lines.length, 1);
  });

  test('格式化 LRC 使用厘秒精度 [mm:ss.xx]', () {
    final lines = parseLyricLines([
      {'time': 65.25, 'text': '某句'},
    ]);
    final out = formatLrc(lines, true, 'LRCLIB');
    expect(out, contains('[01:05.25]'));
    expect(out, contains('LRCLIB'));
  });

  test('非中文歌词：译文显示在原文下面', () {
    final lines = parseLyricLines([
      {'time': 1.0, 'text': '夜よ抱きしめて'},
    ]);
    final out = formatLrc(lines, true, '本地 .lrc', ['拥抱黑夜吧']);
    expect(out, contains('夜よ抱きしめて'));
    expect(out, contains('拥抱黑夜吧'));
    // 译文应在原文之后
    expect(out.indexOf('拥抱黑夜吧') > out.indexOf('夜よ抱きしめて'), true);
  });

  test('译文为空时不追加', () {
    final lines = parseLyricLines([
      {'time': 1.0, 'text': '你好'},
    ]);
    final out = formatLrc(lines, true, '本地 .lrc', []);
    expect(out.contains('译文'), false);
  });
}
