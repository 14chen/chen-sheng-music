// 阶段二 TDD：歌词面板数据模型与滚动定位逻辑
import 'package:flutter_test/flutter_test.dart';
import 'package:cheng_sheng_music/lyrics_panel.dart';

LyricEntry e(double t, String o, String? tr, String st) =>
    LyricEntry(time: t, endTime: t + 3, original: o, translation: tr, status: st);

void main() {
  test('parse entries from API: 结构化词条正确解析', () {
    final list = [
      {'time': 1.0, 'endTime': 4.0, 'original': '夜よ抱きしめて',
       'translation': '拥抱黑夜吧', 'status': 'translated'},
      {'time': 4.0, 'endTime': 7.0, 'original': 'キリが無い',
       'translation': null, 'status': 'untranslated'},
    ];
    final entries = parseLyricEntries(list);
    expect(entries.length, 2);
    expect(entries[0].translation, '拥抱黑夜吧');
    expect(entries[1].translation, isNull);
    expect(entries[1].status, 'untranslated');
  });

  test('缺译状态显示占位，不静默复用原文', () {
    final entry = e(1, '原文A', null, 'untranslated');
    expect(displayTranslation(entry), '无翻译');
    expect(displayTranslation(entry) == entry.original, false);
  });

  test('not_required（中文歌）显示空，不冒充翻译', () {
    final entry = e(1, '因为无心的三言两语', null, 'not_required');
    expect(displayTranslation(entry), '');
  });

  test('有译文时显示译文', () {
    expect(displayTranslation(e(1, 'a', '译文A', 'translated')), '译文A');
  });

  test('lyricIndexAt: 按播放进度定位词条（含 endTime 边界）', () {
    final entries = [e(0, 'a', null, 'not_required'), e(3, 'b', null, 'not_required'), e(6, 'c', null, 'not_required')];
    expect(lyricIndexAt(entries, 0.5), 0);
    expect(lyricIndexAt(entries, 3.5), 1);
    expect(lyricIndexAt(entries, 6.5), 2);
    expect(lyricIndexAt(entries, 99), 2); // 超出末尾保持最后一行
    expect(lyricIndexAt([], 5), -1); // 空歌词返回 -1
  });

  test('词条整体：原文+译文同属一个 entry，不分离', () {
    final entry = e(1, '原文', '译文', 'translated');
    // 一个 entry 同时持有 original 与 translation，随进度整体轮播
    expect(entry.original, '原文');
    expect(entry.translation, '译文');
    expect(entry.time, 1);
    expect(entry.endTime, 4);
  });
}
