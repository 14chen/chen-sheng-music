// Web：沙盒无文件路径，用选中的字节创建 Blob URL 供 just_audio 播放
// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:typed_data';
import 'dart:html' as html;

String? makeLocalAudioUrl(String path, String name, List<int>? bytes) {
  if (bytes == null || bytes.isEmpty) return null;
  final data = bytes is Uint8List ? bytes : Uint8List.fromList(bytes);
  return html.Url.createObjectUrl(html.Blob([data]));
}

// 释放扫描过程中创建的 Blob URL，避免内存只增不减
void releaseLocalUrl(String? url) {
  if (url == null || url.isEmpty) return;
  if (url.startsWith('blob:')) html.Url.revokeObjectUrl(url);
}
