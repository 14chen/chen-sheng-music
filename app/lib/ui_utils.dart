// ignore: deprecated_member_use
import 'package:flutter/material.dart';

/// 全局 SnackBar 通道：不依赖任何页面 BuildContext，
/// 因此 async gap 之后弹提示也不会出现 use_build_context_synchronously。
final GlobalKey<ScaffoldMessengerState> appMessengerKey =
    GlobalKey<ScaffoldMessengerState>();

void showSnack(String message, {Duration? duration}) {
  final messenger = appMessengerKey.currentState;
  if (messenger == null) return;
  messenger.showSnackBar(SnackBar(
    content: Text(message),
    duration: duration ?? const Duration(seconds: 4),
  ));
}
