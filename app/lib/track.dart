// 曲目数据模型（纯数据，不含网络逻辑，便于测试与跨组件共享）
class Track {
  final String id;
  final String source;
  final String title;
  final String artist;
  final String album;
  final double? duration;
  final String? cover;
  final String? remoteUrl;
  final bool hasLyrics;
  // 手机本地音乐：localPath=native 文件路径；localUrl=Web Blob URL
  final String? localPath;
  final String? localUrl;

  const Track({
    required this.id,
    required this.source,
    required this.title,
    required this.artist,
    required this.album,
    this.duration,
    this.cover,
    this.remoteUrl,
    this.hasLyrics = false,
    this.localPath,
    this.localUrl,
  });

  factory Track.fromJson(Map<String, dynamic> j) => Track(
        id: j['id'] ?? '',
        source: j['source'] ?? 'local',
        title: j['title'] ?? '未知曲目',
        artist: j['artist'] ?? '未知艺术家',
        album: j['album'] ?? '',
        duration: (j['duration'] as num?)?.toDouble(),
        cover: j['cover'] as String?,
        remoteUrl: j['streamUrl'] as String?,
        hasLyrics: j['hasLyrics'] == true,
        localPath: j['localPath'] as String?,
        localUrl: j['localUrl'] as String?,
      );
}
