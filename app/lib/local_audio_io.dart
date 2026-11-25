// 移动端/桌面端：直接使用文件系统路径播放本地音频
String? makeLocalAudioUrl(String path, String name, List<int>? bytes) => path;

// 原生端没有 Blob URL，无需释放
void releaseLocalUrl(String? url) {}
