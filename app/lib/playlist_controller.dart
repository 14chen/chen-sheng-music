import 'dart:math';

// ignore: deprecated_member_use
import 'package:flutter/material.dart';

/// 播放模式。
/// sequence: 顺序播放，播完列表末尾停止
/// loop:     列表循环，播完末尾回到开头
/// shuffle:  随机播放（洗牌袋，一轮内不重复、不连续重播）
/// single:   单曲循环，播完自动重播当前曲；手动切歌仍按列表逻辑
enum PlayMode { sequence, loop, shuffle, single }

extension PlayModeX on PlayMode {
  String get label => switch (this) {
        PlayMode.sequence => '顺序播放',
        PlayMode.loop => '列表循环',
        PlayMode.shuffle => '随机播放',
        PlayMode.single => '单曲循环',
      };

  IconData get icon => switch (this) {
        PlayMode.sequence => Icons.arrow_forward,
        PlayMode.loop => Icons.repeat,
        PlayMode.shuffle => Icons.shuffle,
        PlayMode.single => Icons.repeat_one,
      };

  PlayMode get next => switch (this) {
        PlayMode.sequence => PlayMode.loop,
        PlayMode.loop => PlayMode.shuffle,
        PlayMode.shuffle => PlayMode.single,
        PlayMode.single => PlayMode.sequence,
      };
}

/// 纯逻辑的播放队列控制器（无 I/O、可单测）。
/// UI 层把"自动播完"与"手动点下一首"区分开：
/// - manual=false（自动）：sequence 末尾停止、single 重播当前曲。
/// - manual=true（手动）：所有模式都按列表前进，避免单曲循环死锁。
class PlaylistController {
  PlaylistController(this.mode, {Random? random})
      : _random = random ?? Random();

  PlayMode mode;
  final Random _random;
  final List<int> _shuffleBag = [];
  String? _lastPlayedId;

  void setMode(PlayMode m) {
    mode = m;
    _shuffleBag.clear();
    _lastPlayedId = null;
  }

  /// 返回下一首下标；null 表示"停止"（仅 sequence 自动播完末尾时）。
  /// [ids] 用于随机模式避免连续重复同一首。
  int? nextIndex(int cur, int length,
      {required bool manual, List<String>? ids}) {
    if (length <= 0) return null;
    if (cur < 0 || cur >= length) return 0;
    switch (mode) {
      case PlayMode.sequence:
        if (cur + 1 >= length) return manual ? 0 : null;
        return cur + 1;
      case PlayMode.loop:
        return (cur + 1) % length;
      case PlayMode.single:
        // 自动播完 → 重播当前；手动点下一首 → 列表前进
        return manual ? (cur + 1) % length : cur;
      case PlayMode.shuffle:
        return _shufflePick(cur, length, ids ?? const []);
    }
  }

  int _shufflePick(int cur, int length, List<String> ids) {
    if (_shuffleBag.isEmpty) {
      _shuffleBag.addAll(List<int>.generate(length, (i) => i));
      // Fisher-Yates 洗牌
      for (int i = _shuffleBag.length - 1; i > 0; i--) {
        final j = _random.nextInt(i + 1);
        final tmp = _shuffleBag[i];
        _shuffleBag[i] = _shuffleBag[j];
        _shuffleBag[j] = tmp;
      }
      if (_shuffleBag.isNotEmpty && _shuffleBag.first == cur) {
        _shuffleBag.add(_shuffleBag.removeAt(0));
      }
    }
    var pick = _shuffleBag.removeAt(0);
    final pickId = pick < ids.length ? ids[pick] : null;
    // 不连续重复：抽到刚播过的就放回袋尾再抽一次
    if (pickId != null && pickId == _lastPlayedId && _shuffleBag.isNotEmpty) {
      _shuffleBag.add(pick);
      pick = _shuffleBag.removeAt(0);
    }
    if (pick == cur && _shuffleBag.isNotEmpty) {
      _shuffleBag.add(pick);
      pick = _shuffleBag.removeAt(0);
    }
    final finalId = pick < ids.length ? ids[pick] : null;
    if (finalId != null) _lastPlayedId = finalId;
    return pick;
  }
}
