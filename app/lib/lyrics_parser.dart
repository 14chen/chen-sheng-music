// P2 M-5：歌词解析容错。单条坏数据跳过，不导致整首歌词丢失。
class LyricLine {
  final double time;
  final String text;
  const LyricLine({required this.time, required this.text});
}

List<LyricLine> parseLyricLines(List<dynamic>? lines) {
  if (lines == null) return const [];
  final out = <LyricLine>[];
  for (final item in lines) {
    if (item is! Map) continue;
    final timeVal = item['time'];
    final textVal = item['text'];
    if (textVal == null) continue;
    double? time;
    if (timeVal is num) {
      time = timeVal.toDouble();
    } else if (timeVal is String) {
      time = double.tryParse(timeVal);
    }
    if (time == null || !time.isFinite) continue;
    out.add(LyricLine(time: time, text: textVal.toString()));
  }
  out.sort((a, b) => a.time.compareTo(b.time));
  return out;
}

// 格式化为 LRC。同步歌词带 [mm:ss.xx] 厘秒精度，普通歌词仅文本。
// translated: 中文译文数组（与 lines 一一对应），非空时每句下面附译文。
String formatLrc(List<LyricLine> lines, bool synced, String source,
    [List<String> translated = const []]) {
  final sb = StringBuffer('来源: $source${synced ? ' · 同步' : ''}\n\n');
  for (var i = 0; i < lines.length; i++) {
    final l = lines[i];
    String head = '';
    if (synced) {
      final m = l.time.floor() ~/ 60;
      final s = l.time - m * 60;
      head = '[${m.toString().padLeft(2, '0')}:${s.toStringAsFixed(2).padLeft(5, '0')}] ';
    }
    sb.writeln('$head${l.text}');
    // 非中文歌词：原文下面追加中文翻译
    if (i < translated.length && translated[i].isNotEmpty && translated[i] != l.text) {
      sb.writeln('${' ' * head.length}${translated[i]}');
    }
  }
  return sb.toString();
}
