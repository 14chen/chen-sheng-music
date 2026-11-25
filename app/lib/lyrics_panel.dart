import 'dart:async';
// ignore: deprecated_member_use
import 'package:flutter/material.dart';

// 歌词数据模型：词条 = 原文行 + 翻译行 + 时间区间
class LyricEntry {
  final double time;
  final double endTime;
  final String original;
  final String? translation;
  final String status; // translated / untranslated / not_required

  const LyricEntry({
    required this.time,
    required this.endTime,
    required this.original,
    required this.translation,
    required this.status,
  });
}

List<LyricEntry> parseLyricEntries(List<dynamic>? raw) {
  if (raw == null) return const [];
  return raw.whereType<Map>().map((m) {
    return LyricEntry(
      time: (m['time'] as num?)?.toDouble() ?? 0,
      endTime: (m['endTime'] as num?)?.toDouble() ?? 0,
      original: (m['original'] ?? '').toString(),
      translation: m['translation']?.toString(),
      status: (m['status'] ?? 'not_required').toString(),
    );
  }).toList();
}

// 缺译绝不回退原文：明确标注"无翻译"；中文歌（not_required）不显示译文
String displayTranslation(LyricEntry e) {
  if (e.status == 'not_required') return '';
  if (e.status == 'translated' && e.translation != null && e.translation!.isNotEmpty) {
    return e.translation!;
  }
  return '无翻译';
}

// 按播放进度定位当前词条
int lyricIndexAt(List<LyricEntry> entries, double position) {
  if (entries.isEmpty) return -1;
  for (var i = 0; i < entries.length; i++) {
    if (position >= entries[i].time && position < entries[i].endTime) return i;
  }
  int idx = 0;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].time <= position) idx = i;
  }
  return idx;
}

class LyricData {
  final List<LyricEntry> entries;
  final String source;
  final String lang;
  final Map<String, int> stats;
  const LyricData({required this.entries, required this.source,
    required this.lang, required this.stats});
}

// 歌词视觉风格：standard=通用深色高亮；figureTwo=《02的爱恋》图二复刻（桃色卡片+左对齐双语）
enum LyricVisualStyle { standard, figureTwo }

// ===== 歌词面板：5 行可见（当前行居中 ±2 行）+ 滑动预览 - 按钮确认 - 超时回弹 =====
class LyricsPanel extends StatefulWidget {
  final List<LyricEntry> entries;
  final double position;                       // 真实播放进度（秒，含 offset 校准）
  final void Function(double seconds) onSeek;  // 仅"确认跳转"时才调用（真正 seek）
  final void Function(double? seconds) onPreviewChanged; // 预览态通知父级切换按钮
  final VoidCallback? onToggleCollapse;
  final bool collapsed;
  // 图二复刻相关
  final LyricVisualStyle style;
  final String title;
  final Map<String, int> stats;

  const LyricsPanel({
    super.key,
    required this.entries,
    required this.position,
    required this.onSeek,
    required this.onPreviewChanged,
    this.onToggleCollapse,
    this.collapsed = false,
    this.style = LyricVisualStyle.standard,
    this.title = '',
    this.stats = const {},
  });

  @override
  LyricsPanelState createState() => LyricsPanelState();
}

class LyricsPanelState extends State<LyricsPanel>
    with AutomaticKeepAliveClientMixin {
  // 5 行可见：当前行严格居中，上下各 2 行
  static const int visibleLines = 5;
  static const double itemExtent = 84.0;
  static const double viewportH = visibleLines * itemExtent; // 420

  late final ScrollController _scroll;
  Timer? _confirmTimer;        // 唯一的 1 秒确认定时器（每次操作前先取消，杜绝叠加）
  bool _dragging = false;
  bool _hasMoved = false;      // 超过阈值才算滑动（避免点击误触）
  bool _pendingConfirm = false; // 松手后的 1 秒待确认期：禁止自动居中
  double? _previewSeconds;     // 当前预览时间点（null = 非预览态）
  double _dragStartY = 0;
  double _dragStartPos = 0;
  double _dragStartOffset = 0;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _scroll = ScrollController();
  }

  @override
  void dispose() {
    _confirmTimer?.cancel();   // 防止定时器泄漏
    _confirmTimer = null;
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoScrollToCurrent(animated: false));
  }

  @override
  void didUpdateWidget(LyricsPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 歌曲正常播放时持续居中；滑动/待确认期间绝不回弹（不打断音乐）
    if (oldWidget.position != widget.position && !_dragging && !_pendingConfirm) {
      _autoScrollToCurrent();
    }
  }

  // 当前行严格居中：padding =(视口高 - 行高)/2，目标偏移 = idx * 行高
  void _autoScrollToCurrent({bool animated = true}) {
    if (!_scroll.hasClients || widget.entries.isEmpty) return;
    final idx = lyricIndexAt(widget.entries, widget.position);
    if (idx < 0) return;
    final target = (idx * itemExtent).clamp(0.0, _scroll.position.maxScrollExtent);
    if (animated) {
      _scroll.animateTo(target, duration: const Duration(milliseconds: 320),
          curve: Curves.easeInOutCubic);
    } else {
      _scroll.jumpTo(target);
    }
  }

  void _setPreview(double? s) {
    if (_previewSeconds == s) return;
    _previewSeconds = s;
    if (mounted) {
      setState(() {});
      widget.onPreviewChanged(s);
    }
  }

  // ---- 手势：手指跟随滚动 + 预览，不 seek、不暂停 ----
  void _onDragStart(DragStartDetails d) {
    _confirmTimer?.cancel();   // 关键：取消上一次的待确认定时器，避免叠加
    _confirmTimer = null;
    _pendingConfirm = false;
    _dragging = true;
    _hasMoved = false;
    _dragStartY = d.globalPosition.dy;
    _dragStartPos = widget.position;
    _dragStartOffset = _scroll.hasClients ? _scroll.offset : 0;
  }

  void _onDragUpdate(DragUpdateDetails d) {
    final dy = d.globalPosition.dy - _dragStartY;
    if (!_hasMoved && dy.abs() < 8) return; // 阈值：纯点击不进入预览
    _hasMoved = true;
    final maxTime = widget.entries.isNotEmpty ? widget.entries.last.endTime : 0.0;
    final target = (_dragStartPos - dy * 0.25).clamp(0.0, maxTime);
    // 歌词列表跟随手指滚动（手动查看非当前行）
    if (_scroll.hasClients) {
      final offset = (_dragStartOffset - dy).clamp(0.0, _scroll.position.maxScrollExtent);
      _scroll.jumpTo(offset);
    }
    _setPreview(target);
  }

  void _onDragEnd(DragEndDetails d) {
    _dragging = false;
    if (!_hasMoved || _previewSeconds == null) {
      _hasMoved = false;
      return;
    }
    // 松手 → 1 秒待确认：UI 保持预览，音乐继续正常播放
    _pendingConfirm = true;
    _confirmTimer?.cancel();
    _confirmTimer = Timer(const Duration(seconds: 1), () {
      _confirmTimer = null;
      _pendingConfirm = false;
      _setPreview(null);          // 按钮恢复播放/暂停
      _autoScrollToCurrent();     // 平滑回弹到音乐实际进度行
    });
  }

  // 外部【确认跳转】按钮调用：执行真正 seek 并复位
  void confirmSeek() {
    final target = _previewSeconds;
    _confirmTimer?.cancel();
    _confirmTimer = null;
    _pendingConfirm = false;
    _setPreview(null);
    if (target != null) widget.onSeek(target);
    _autoScrollToCurrent();
  }


  // ===== 图二复刻：桃色圆角卡片 + 标题/统计 + 左对齐双语（原文大、译文小灰）=====
  Widget _buildFigureTwo(BuildContext context, int current) {
    const card = Color(0xFFFCE9DE);      // 图二浅桃色卡片
    const ink = Color(0xFF2B2522);       // 原文深棕黑
    const subInk = Color(0xFF8C7D74);    // 译文灰
    const active = Color(0xFFA44E28);    // 当前行高亮棕橙
    const activeSub = Color(0xFFB76A46); // 当前行译文棕橙

    final originalLines = widget.stats['originalLines'] ?? widget.entries.length;
    final translated = widget.stats['translatedLines'] ?? 0;
    final empty = widget.stats['emptyTranslations'] ?? 0;

    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12),
        padding: const EdgeInsets.fromLTRB(26, 20, 26, 18),
        decoration: BoxDecoration(
          color: card,
          borderRadius: BorderRadius.circular(28),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 24)],
        ),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('歌词 · ${widget.title}',
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: ink)),
          const SizedBox(height: 8),
          Text('原文 $originalLines 行 · 已译 $translated 行 · 空译 $empty 行',
            style: const TextStyle(fontSize: 16, color: subInk)),
          const SizedBox(height: 16),
          GestureDetector(
            behavior: HitTestBehavior.translucent,
            onVerticalDragStart: _onDragStart,
            onVerticalDragUpdate: _onDragUpdate,
            onVerticalDragEnd: _onDragEnd,
            child: SizedBox(
              height: viewportH,
              width: double.infinity,
              child: ListView.builder(
                controller: _scroll,
                itemExtent: itemExtent,
                padding: const EdgeInsets.symmetric(vertical: (viewportH - itemExtent) / 2),
                itemCount: widget.entries.length,
                itemBuilder: (context, i) {
                  final entry = widget.entries[i];
                  final isCurrent = i == current;
                  final dist = (i - current).abs();
                  final opacity = dist == 0 ? 1.0 : (dist == 1 ? 0.62 : 0.32);
                  final scale = dist == 0 ? 1.0 : (dist == 1 ? 0.97 : 0.94);
                  final trans = displayTranslation(entry);
                  return Align(
                    alignment: Alignment.centerLeft,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 220),
                      opacity: opacity,
                      child: AnimatedScale(
                        duration: const Duration(milliseconds: 220),
                        scale: scale,
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 10),
                          decoration: isCurrent
                              ? BoxDecoration(color: active.withValues(alpha: 0.10),
                                  borderRadius: BorderRadius.circular(12))
                              : null,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(entry.original, maxLines: 2, overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: isCurrent ? 24 : 22,
                                  fontWeight: FontWeight.w600,
                                  height: 1.25,
                                  color: isCurrent ? active : ink)),
                              if (trans.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 3),
                                  child: Text(trans, maxLines: 2, overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: isCurrent ? 18 : 17,
                                      height: 1.25,
                                      color: isCurrent ? activeSub : subInk)),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (widget.collapsed) {
      return GestureDetector(
        onTap: widget.onToggleCollapse,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(12)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.lyrics, size: 16), const SizedBox(width: 6),
            Text('展开歌词', style: TextStyle(fontSize: 13,
              color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ]),
        ),
      );
    }
    if (widget.entries.isEmpty) {
      return Center(child: Padding(padding: const EdgeInsets.symmetric(vertical: 24),
        child: Text('暂无歌词', style: TextStyle(fontSize: 14,
          color: Theme.of(context).colorScheme.onSurfaceVariant))));
    }

    final cs = Theme.of(context).colorScheme;
    final current = lyricIndexAt(widget.entries, widget.position);

    if (widget.style == LyricVisualStyle.figureTwo) {
      return _buildFigureTwo(context, current);
    }

    return Center(
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onVerticalDragStart: _onDragStart,
        onVerticalDragUpdate: _onDragUpdate,
        onVerticalDragEnd: _onDragEnd,
        child: SizedBox(
        height: viewportH,
        width: double.infinity,
        child: ListView.builder(
          controller: _scroll,
          itemExtent: itemExtent,
          padding: const EdgeInsets.symmetric(vertical: (viewportH - itemExtent) / 2),
          itemCount: widget.entries.length,
          itemBuilder: (context, i) {
            final entry = widget.entries[i];
            final isCurrent = i == current;
            final dist = (i - current).abs();
            // 5 行：当前行最大最亮，相邻渐隐，最远最淡
            final opacity = dist == 0 ? 1.0 : (dist == 1 ? 0.66 : 0.34);
            final scale = dist == 0 ? 1.0 : (dist == 1 ? 0.94 : 0.88);
            final fontSize = dist == 0 ? 23.0 : (dist == 1 ? 19.0 : 17.0);
            final trans = displayTranslation(entry);
            return Center(
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 220),
                opacity: opacity,
                child: AnimatedScale(
                  duration: const Duration(milliseconds: 220),
                  scale: scale,
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(entry.original, textAlign: TextAlign.center, maxLines: 2,
                      style: TextStyle(
                        fontSize: fontSize,
                        fontWeight: isCurrent ? FontWeight.w800 : FontWeight.w600,
                        color: isCurrent ? cs.primary : cs.onSurface,
                        height: 1.25,
                        shadows: isCurrent
                            ? [Shadow(blurRadius: 20, color: cs.primary.withValues(alpha: 0.4))]
                            : null)),
                    if (trans.isNotEmpty)
                      Padding(padding: const EdgeInsets.only(top: 3),
                        child: Text(trans, textAlign: TextAlign.center, maxLines: 2,
                          style: TextStyle(fontSize: isCurrent ? 13 : 11.5,
                            color: isCurrent ? cs.onSurface.withValues(alpha: 0.85) : cs.onSurfaceVariant,
                            fontStyle: entry.status == 'untranslated' ? FontStyle.italic : FontStyle.normal))),
                  ]),
                ),
              ),
            );
          },
        ),
        ),
      ),
    );
  }
}
