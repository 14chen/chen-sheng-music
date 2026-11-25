import 'dart:async';
import 'dart:io';
// ignore: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:file_picker/file_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'local_audio_io.dart' if (dart.library.html) 'local_audio_web.dart' as local_audio;
import 'dart:convert' show jsonEncode, jsonDecode;
import 'package:cheng_sheng_music/playlist_controller.dart';
import 'package:cheng_sheng_music/track.dart';
import 'package:cheng_sheng_music/playback_state.dart';
import 'package:cheng_sheng_music/play_token.dart';
import 'package:cheng_sheng_music/format.dart';
import 'package:cheng_sheng_music/ui_utils.dart';
import 'package:cheng_sheng_music/lyrics_parser.dart';
import 'package:cheng_sheng_music/lyrics_panel.dart';
import 'package:cheng_sheng_music/audio_service_handler.dart';

// 阶段三：全局共享 AudioPlayer（后台服务与 UI 共用同一个实例）
final AudioPlayer sharedPlayer = AudioPlayer();
MyAudioHandler? audioHandler;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 先渲染 UI（白屏时间最小化），后台服务异步初始化不阻塞启动
  runApp(const MyApp());
  if (!kIsWeb) {
    // 不 await：Service 创建/通知渠道初始化在后台完成
    initAudioService(sharedPlayer).then((h) { audioHandler = h; }).catchError((Object e, StackTrace s) {
      // 后台服务初始化失败不影响 UI 使用（仅失去通知栏控制）
      debugPrint('audio_service init failed: $e');
      return null;
    });
  }
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '橙声君',
      scaffoldMessengerKey: appMessengerKey,
      themeMode: ThemeMode.system, // 跟随系统亮/暗
      // 全局橙色主题（浅色/深色自动适配）
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.deepOrange),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.deepOrange,
        brightness: Brightness.dark,
      ),
      home: const HomePage(),
      debugShowCheckedModeBanner: false,
    );
  }
}

// 曲目模型已抽到 track.dart；这里补上依赖 Api 的 streamUrl 计算
extension TrackStreamUrl on Track {
  String get streamUrl {
    final u = remoteUrl;
    if (u == null) return Api.instance.streamUrl(id);
    if (u.startsWith('/')) {
      final k = Api.instance.accessKey;
      final sep = u.contains('?') ? '&' : '?';
      return '${Api.instance.baseUrl}$u${k.isNotEmpty ? "$sep key=${Uri.encodeComponent(k)}" : ''}';
    }
    return u;
  }

  // Web 端外链封面需走服务器代理（浏览器 XHR 受 CORS 限制）；
  // 原生端直接加载外链，data: 内嵌封面两端都可用。
  String? get displayCover {
    final c = cover;
    if (c == null || c.isEmpty) return null;
    if (!kIsWeb || c.startsWith('data:') || !c.startsWith('http')) return c;
    final k = Api.instance.accessKey;
    final q = k.isNotEmpty ? '&key=${Uri.encodeComponent(k)}' : '';
    return '${Api.instance.baseUrl}/api/cover?url=${Uri.encodeComponent(c)}$q';
  }
}

// ---------- API ----------
class Api {
  Api._();
  static final Api instance = Api._();
  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 3),  // 启动优化：快速失败，不长时间等待
    receiveTimeout: const Duration(seconds: 15),
  ));
  // 默认地址：真机用局域网（用户设置里读），模拟器才用 10.0.2.2
  String baseUrl = kIsWeb ? 'http://127.0.0.1:18080' : 'http://192.168.1.15:18080';
  String accessKey = '';
  PlayMode playMode = PlayMode.sequence;

  Future<void> init() async {
    final sp = await SharedPreferences.getInstance();
    baseUrl = sp.getString('server_url') ?? baseUrl;
    accessKey = sp.getString('access_key') ?? '';
    playMode = _modeFromString(sp.getString('play_mode'));
    // Web 预览专用：允许从 URL 注入地址/口令（如 ?key=xxx&url=http://...），
    // 仅用于无头浏览器验证；Android 不受影响。
    if (kIsWeb) {
      try {
        final q = Uri.base.queryParameters;
        if (q['url'] != null && q['url']!.isNotEmpty) baseUrl = q['url']!;
        if (q['key'] != null && q['key']!.isNotEmpty) accessKey = q['key']!;
      } catch (_) {}
    }
    _applyKey();
  }

  Future<void> setPlayMode(PlayMode mode) async {
    playMode = mode;
    final sp = await SharedPreferences.getInstance();
    await sp.setString('play_mode', mode.name);
  }

  PlayMode _modeFromString(String? s) =>
      PlayMode.values.firstWhere((m) => m.name == s, orElse: () => PlayMode.sequence);

  void _applyKey() {
    _dio.options.headers.remove('X-Access-Key');
    if (accessKey.isNotEmpty) _dio.options.headers['X-Access-Key'] = accessKey;
  }

  Future<void> setConfig(String url, String key) async {
    baseUrl = url.trim();
    accessKey = key.trim();
    _applyKey();
    final sp = await SharedPreferences.getInstance();
    await sp.setString('server_url', baseUrl);
    await sp.setString('access_key', accessKey);
  }

  // just_audio 无法设置自定义头，流端点靠 query 传口令（服务端仅对该端点放行）
  String streamUrl(String id) {
    final q = accessKey.isNotEmpty ? '?key=${Uri.encodeComponent(accessKey)}' : '';
    return '$baseUrl/api/tracks/${Uri.encodeComponent(id)}/stream$q';
  }

  Future<List<Track>> fetchTracks({String source = 'local', String q = ''}) async {
    final res = await _dio.get('$baseUrl/api/tracks',
        queryParameters: {'source': source, 'q': q, 'limit': 100});
    return (res.data['items'] as List? ?? [])
        .map((e) => Track.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<String>> fetchSources() async {
    try {
      final res = await _dio.get('$baseUrl/api/sources');
      return ((res.data['sources'] as List? ?? [])
          .where((e) => e['enabled'] == true)
          .map((e) => e['id'] as String)).toList();
    } catch (_) { return ['local']; }
  }

  // 音源显示名（下拉里显示「音源J / 音源B / 音源W / 音源K / 音源N / 音源Q」）
  Future<Map<String, String>> fetchSourceNames() async {
    try {
      final res = await _dio.get('$baseUrl/api/sources');
      return {for (final e in (res.data['sources'] as List? ?? []))
        (e['id'] as String).toString(): (e['name'] ?? e['id']).toString()};
    } catch (_) { return {}; }
  }

  Future<List<Map<String, String>>> fetchQualities(String id) async {
    final res = await _dio.get('$baseUrl/api/download/qualities',
        queryParameters: {'id': id});
    return ((res.data['qualities'] as List? ?? []))
        .map((e) => {'id': e['id'].toString(), 'label': e['label'].toString()})
        .toList();
  }

  Future<bool> saveLyrics(String id, String text, bool synced) async {
    try {
      await _dio.post('$baseUrl/api/lyrics/custom', data: {
        'id': id, 'text': text, 'synced': synced,
      });
      return true;
    } catch (_) { return false; }
  }

  Future<bool> deleteLyrics(String id) async {
    try {
      await _dio.delete('$baseUrl/api/lyrics/custom', queryParameters: {'id': id});
      return true;
    } catch (_) { return false; }
  }

  Future<LyricData> fetchLyrics(Track t) async {
    try {
      final res = await _dio.get('$baseUrl/api/lyrics', queryParameters: {
        'id': t.id, 'title': t.title, 'artist': t.artist,
        if (t.duration != null) 'duration': t.duration!.round(),
      });
      // 优先使用结构化 entries（阶段二新数据契约）
      final rawEntries = res.data['entries'] as List?;
      if (rawEntries != null) {
        return LyricData(
          entries: parseLyricEntries(rawEntries),
          source: (res.data['source'] ?? '未知').toString(),
          lang: (res.data['lang'] ?? 'zh').toString(),
          stats: Map<String, int>.from(
            (res.data['stats'] as Map? ?? {}).map((k, v) => MapEntry(k.toString(), (v as num).toInt()))),
        );
      }
      // 兼容旧版：无 entries 时用 lines 构造
      final parsed = parseLyricLines(res.data['lines'] as List?);
      return LyricData(
        entries: parsed.map((l) => LyricEntry(
          time: l.time, endTime: l.time + 5, original: l.text,
          translation: null, status: 'not_required')).toList(),
        source: (res.data['source'] ?? '未知').toString(),
        lang: 'zh', stats: {},
      );
    } catch (_) {
      return const LyricData(entries: [], source: '', lang: 'zh', stats: {});
    }
  }
}

// ---------- 首页 ----------
// 手机本地音乐（加入歌单用）
class LocalSong {
  final String name;
  final String path;
  final double? duration;
  final String title;
  final String artist;
  final String? localUrl; // Web Blob URL
  const LocalSong({
    required this.name, required this.path, this.duration,
    String? title, String? artist, this.localUrl,
  })  : title = title ?? name,
        artist = artist ?? '未知艺术家';

  Map<String, dynamic> toJson() => {
    'name': name, 'path': path,
    if (duration != null) 'duration': duration,
    'title': title, 'artist': artist,
    // 注意：不持久化 localUrl（Web 的 blob: URL 刷新后即失效）
  };
  factory LocalSong.fromJson(Map<String, dynamic> j) => LocalSong(
    name: (j['name'] ?? '').toString(),
    path: (j['path'] ?? '').toString(),
    duration: (j['duration'] as num?)?.toDouble(),
    title: j['title']?.toString(),
    artist: j['artist']?.toString(),
    localUrl: j['localUrl']?.toString(),
  );
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final AudioPlayer _player = sharedPlayer; // 阶段三：复用后台服务的同一个 Player
  // P0-2：唯一状态源，传给 PlayerPage 监听，切歌后播放页自动刷新
  final PlaybackState _playback = PlaybackState();
  final TextEditingController _searchCtrl = TextEditingController();
  List<Track> _tracks = [];
  List<String> _sources = ['local'];
  final Map<String, String> _sourceNames = {};
  String _source = 'local';
  String _query = '';
  int _tabIndex = 0; // 0=本地音乐 1=下载管理 2=最近播放 3=我的歌单
  final List<Track> _recent = []; // 最近播放
  // 播放队列：当前正在播放的上下文（本地列表 / 歌单 / 最近播放），
  // 下一首/上一首/自动续播都基于它，避免从歌单播放时错跳到曲库列表。
  List<Track> _queue = [];
  int _queueIndex = -1;
  // 歌单：第一个是"我喜欢"，第二个固定为手机本地音乐默认歌单
  static const String localPlaylistName = '大人，这是您的音乐';
  static const String oldLocalPlaylistName = '大人，这是您本机上的音乐';
  List<String> _playlists = ['我喜欢', localPlaylistName];
  final Map<String, List<LocalSong>> _playlistSongs = {};
  final List<LocalSong> _scannedSongs = [];
  bool _scanning = false;
  bool _loading = false;
  String? _error;
  Track? _current;
  bool _initialized = false;
  int _loadSeq = 0; // P2 M4：列表请求序列，丢弃过期响应
  // 纯逻辑控制器：洗牌袋、模式切换、下一首计算都在这里（已单测覆盖）
  late final PlaylistController _playlist;
  // P1 H2：保存订阅以便 dispose 取消；代次令牌防止并发切歌旧请求覆盖新请求
  StreamSubscription<PlayerState>? _stateSub;
  final PlayToken _playToken = PlayToken();

  @override
  void initState() {
    super.initState();
    _playlist = PlaylistController(Api.instance.playMode);
    _stateSub = _player.playerStateStream.listen(_onPlayerState); // 监听播完事件
    // 阶段三：通知栏/锁屏的上一首/下一首按钮回调
    audioHandler?.setSkipCallbacks(
      next: () => _manualNext(1),
      prev: () => _manualNext(-1),
    );
    _init();
  }

  @override
  void dispose() {
    _stateSub?.cancel(); // P1 H2：先取消订阅再销毁
    _playback.dispose();
    // sharedPlayer 是全局单例（后台通知栏服务也在用），由进程持有，
    // 页面销毁时不能 dispose，否则会破坏后台播放。
    super.dispose();
  }

  // 当前曲目自然播放结束时，按模式决定下一首；不打断当前播放流，直接切源
  void _onPlayerState(PlayerState state) {
    if (state.processingState == ProcessingState.completed && _current != null) {
      _autoNext();
    }
  }

  PlayMode get _mode => _playback.mode.value;

  void _cycleMode() async {
    final next = _mode.next;
    // P0-2：先同步更新共享状态与控制器（立即生效），再异步持久化
    _playback.setMode(next);
    _playlist.setMode(next);
    await Api.instance.setPlayMode(next);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('播放模式：${next.label}'), duration: const Duration(seconds: 1)));
  }

  Future<void> _autoNext() async {
    final cur = _queueCursor;
    // 自动播完：single 重播当前曲、sequence 末尾停止 —— 均由 controller 决定
    final next = _playlist.nextIndex(cur, _queue.length,
        manual: false, ids: _queue.map((t) => t.id).toList());
    if (next == null) return;
    // P2 M1：单曲循环自动重播用 seek 回到开头，避免每次重新走网络 setUrl
    if (next == cur) {
      try {
        await _player.seek(Duration.zero);
        await _player.play();
      } catch (_) {}
      return;
    }
    await _play(_queue[next], push: false, queue: _queue, index: next);
  }

  // 当前播放在队列中的位置（-1 表示不在队列里）
  int get _queueCursor {
    if (_queueIndex >= 0 &&
        _queueIndex < _queue.length &&
        _queue[_queueIndex].id == _current?.id) {
      return _queueIndex;
    }
    return _queue.indexWhere((t) => t.id == _current?.id);
  }

  Future<void> _manualNext(int delta) async {
    if (_queue.isEmpty) return;
    final cur = _queueCursor;
    if (cur < 0) return;
    int? idx;
    if (delta > 0) {
      // 手动点下一首：所有模式都按列表前进，single 模式不会死锁
      idx = _playlist.nextIndex(cur, _queue.length,
          manual: true, ids: _queue.map((t) => t.id).toList());
    } else {
      // 上一首始终按列表顺序回退，不受随机/单曲模式影响
      idx = (cur - 1 + _queue.length) % _queue.length;
    }
    if (idx != null) await _play(_queue[idx], push: false, queue: _queue, index: idx);
  }

  Future<void> _init() async {
    await Api.instance.init();
    _playlist.setMode(Api.instance.playMode);
    _playback.setMode(Api.instance.playMode);
    if (!mounted) return;
    setState(() => _initialized = true);
    // 启动优化：两个网络请求并行，不串行等待
    await Future.wait([_loadSources(), _loadTracks()]);
    await _loadPlaylists();
  }

  Future<void> _loadPlaylists() async {
    final sp = await SharedPreferences.getInstance();
    final custom = sp.getStringList('custom_playlists') ?? <String>[];
    final songsRaw = sp.getString('playlist_songs_json');
    if (!mounted) return;
    final loaded = <String, List<LocalSong>>{};
    if (songsRaw != null && songsRaw.isNotEmpty) {
      try {
        final decoded = jsonDecode(songsRaw) as Map<String, dynamic>;
        decoded.forEach((k, v) {
          loaded[k] = (v as List<dynamic>)
              .whereType<Map>()
              .map((m) => LocalSong.fromJson(Map<String, dynamic>.from(m)))
              .toList();
        });
      } catch (_) {}
    }
    setState(() {
      _playlists = ['我喜欢', localPlaylistName,
        ...custom.where((n) => n != '我喜欢' && n != localPlaylistName &&
            n != oldLocalPlaylistName)];
      _playlistSongs
        ..clear()
        ..addAll(loaded);
      // 兼容旧名称：把旧歌单里的本地歌曲迁移到新名称
      final legacy = _playlistSongs.remove(oldLocalPlaylistName);
      if (legacy != null) {
        _playlistSongs.putIfAbsent(localPlaylistName, () => <LocalSong>[]);
        for (final s in legacy) {
          if (!_playlistSongs[localPlaylistName]!.any((x) => x.path == s.path)) {
            _playlistSongs[localPlaylistName]!.add(s);
          }
        }
      }
      _playlistSongs.putIfAbsent(localPlaylistName, () => <LocalSong>[]);
    });
  }

  Future<void> _savePlaylists() async {
    final sp = await SharedPreferences.getInstance();
    await sp.setStringList('custom_playlists',
        _playlists.where((n) => n != '我喜欢' && n != localPlaylistName).toList());
    await sp.setString('playlist_songs_json', jsonEncode(
        _playlistSongs.map((k, v) => MapEntry(k, v.map((s) => s.toJson()).toList()))));
  }

  Future<void> _loadSources() async {
    final results = await Future.wait([
      Api.instance.fetchSources(),
      Api.instance.fetchSourceNames(),
    ]);
    if (!mounted) return;
    setState(() {
      _sources = results[0] as List<String>;
      _sourceNames
        ..clear()
        ..addAll(results[1] as Map<String, String>);
      // 音源被下线/改名后，回落到第一个可用音源
      if (_sources.isNotEmpty && !_sources.contains(_source)) {
        _source = _sources.first;
      }
    });
  }

  Future<void> _loadTracks() async {
    final seq = ++_loadSeq;
    if (mounted) setState(() { _loading = true; _error = null; });
    try {
      final list = await Api.instance.fetchTracks(source: _source, q: _query);
      if (seq != _loadSeq || !mounted) return; // P2 M4：丢弃过期响应
      setState(() => _tracks = list);
    } catch (e) {
      if (seq != _loadSeq || !mounted) return;
      // 友好错误提示：不含冗长英文异常
      final msg = e.toString();
      setState(() => _error = msg.contains('timeout') || msg.contains('Timeout')
          ? '连接服务器超时（请检查地址与网络）'
          : msg.contains('401') ? '访问口令错误（请在设置里填写正确口令）'
          : '无法连接服务器（请检查地址与网络）');
    } finally {
      if (seq == _loadSeq && mounted) setState(() => _loading = false);
    }
  }

  Future<void> _play(Track t, {bool push = true, List<Track>? queue, int? index}) async {
    // Web：持久化过的本地歌曲没有可用的 blob URL，直接提示重新扫描
    if (t.source == 'localfile' && t.localUrl == null && t.localPath == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('网页版刷新后本地文件已失效，请在「搜索本地手机音乐」里重新添加'),
          duration: Duration(seconds: 4)));
      }
      return;
    }
    // 维护播放队列：显式传入 > 当前曲库列表 > 现有队列 > 单曲
    if (queue != null) {
      _queue = List<Track>.from(queue);
      _queueIndex = index ?? _queue.indexWhere((x) => x.id == t.id);
    } else {
      final inTracks = _tracks.indexWhere((x) => x.id == t.id);
      if (inTracks >= 0) {
        _queue = List<Track>.from(_tracks);
        _queueIndex = inTracks;
      } else {
        final inQueue = _queue.indexWhere((x) => x.id == t.id);
        if (inQueue >= 0) {
          _queueIndex = inQueue;
        } else {
          _queue = [t];
          _queueIndex = 0;
        }
      }
    }
    // P1 H2：每次切歌领一个代次；await 之后若已被更新的切歌取代则放弃本分支
    final token = _playToken.next();
    // P0-2：更新唯一状态源，前台播放页会收到通知并刷新（含下载/歌词目标）
    _current = t;
    _playback.setCurrent(t);
    // 最近播放：去重后置顶
    _recent.removeWhere((x) => x.id == t.id);
    _recent.insert(0, t);
    if (_recent.length > 100) _recent.removeLast();
    if (!mounted) return;
    setState(() {});
    // 先进入播放页（歌词速览等 UI 不依赖音频能否播放），再尝试播放。
    // 这样即使音频加载失败，用户仍能看到歌词与界面，而不是卡在列表。
    if (push && mounted) _openPlayer();
    try {
      // 阶段三：设置媒体项，通知栏/锁屏显示标题、歌手、封面
      await audioHandler?.setMediaItem(MediaItemState(
        id: t.id, title: t.title, artist: t.artist,
        artwork: t.cover, duration: t.duration != null ? Duration(seconds: t.duration!.round()) : null,
      ).toMediaItem());
      // 手机本地音乐：Web 用 Blob URL，原生用文件路径；其余走服务器流
      if (t.localUrl != null) {
        await _player.setUrl(t.localUrl!);
      } else if (t.localPath != null) {
        await _player.setFilePath(t.localPath!);
      } else {
        await _player.setUrl(t.streamUrl);
      }
      if (!_playToken.isCurrent(token) || !mounted) return; // 已被新请求取代
      await _player.play();
    } catch (e) {
      if (_playToken.isCurrent(token) && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('播放失败: $e')));
      }
    }
  }


  Future<void> _openSettings() async {
    final urlCtrl = TextEditingController(text: Api.instance.baseUrl);
    final keyCtrl = TextEditingController(text: Api.instance.accessKey);
    final sp = await SharedPreferences.getInstance();
    final pathCtrl = TextEditingController(
      text: sp.getString('download_path') ?? '（默认：Documents/橙声君）');
    final cacheSize = await _cacheSize();
    String selectedSource = _sources.contains(_source) ? _source
        : (_sources.isNotEmpty ? _sources.first : 'local');

    if (!mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) => AlertDialog(
        title: const Text('设置'),
        content: SingleChildScrollView(child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('音源选择', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            SizedBox(width: double.infinity,
              child: DropdownButton<String>(
                isExpanded: true,
                value: _sources.contains(selectedSource) ? selectedSource : null,
                hint: const Text('无音源'),
                items: _sources.map((s) => DropdownMenuItem(
                  value: s, child: Text(_sourceNames[s] ?? s))).toList(),
                onChanged: (v) { if (v != null) setSheet(() => selectedSource = v); },
              ),
            ),
            const SizedBox(height: 12),
            const Text('服务器地址', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            TextField(controller: urlCtrl, decoration: const InputDecoration(
              hintText: 'http://192.168.1.15:18080', border: OutlineInputBorder(), isDense: true)),
            const SizedBox(height: 12),
            const Text('公网访问口令', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            TextField(controller: keyCtrl, obscureText: true, decoration: const InputDecoration(
              hintText: 'ACCESS_KEY', border: OutlineInputBorder(), isDense: true)),
            const SizedBox(height: 12),
            const Text('下载路径', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            TextField(controller: pathCtrl, decoration: const InputDecoration(
              border: OutlineInputBorder(), isDense: true)),
            const SizedBox(height: 12),
            const Text('缓存管理', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Row(children: [
              Text('缓存大小：$cacheSize', style: const TextStyle(fontSize: 13)),
              const Spacer(),
              TextButton.icon(icon: const Icon(Icons.delete_sweep, size: 18),
                label: const Text('清除缓存'), onPressed: () async {
                  final cleared = await _clearCache();
                  if (ctx.mounted) Navigator.pop(ctx, false);
                  if (!mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('已清除 $cleared')));
                  _openSettings(); // 重开以刷新缓存大小
                }),
            ]),
          ],
        )),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('保存')),
        ],
      )),
    );
    if (ok == true && mounted) {
      await Api.instance.setConfig(urlCtrl.text, keyCtrl.text);
      await sp.setString('download_path', pathCtrl.text);
      if (selectedSource != _source) {
        setState(() => _source = selectedSource);
      }
      await _loadSources();
      await _loadTracks();
    }
    // ok == null 表示用户用返回键/点遮罩关闭：直接关闭，不再自动重开
  }

  // 计算缓存大小（临时目录 + 图片缓存）
  Future<String> _cacheSize() async {
    try {
      final dir = await getTemporaryDirectory();
      int bytes = 0;
      final entities = dir.listSync(recursive: true, followLinks: false);
      for (final e in entities) {
        if (e is File) bytes += await e.length();
      }
      if (bytes < 1024) return '$bytes B';
      if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
      return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
    } catch (_) { return '未知'; }
  }

  // 清除缓存
  Future<String> _clearCache() async {
    try {
      final dir = await getTemporaryDirectory();
      for (final e in dir.listSync(recursive: true, followLinks: false)) {
        if (e is File) await e.delete();
      }
      return '完成';
    } catch (e) { return '失败: $e'; }
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.of(context).size.width > 768;
    return Scaffold(
      appBar: AppBar(title: const Text('橙声君'), actions: [
        IconButton(icon: const Icon(Icons.settings), onPressed: _openSettings),
      ]),
      body: !_initialized
          ? const Center(child: CircularProgressIndicator())
          : Row(children: [
              // 宽屏：左侧导航栏
              if (wide) _buildNavRail(),
              // 主内容区
              Expanded(child: _buildTabContent()),
            ]),
      // 迷你播放条 + 底部导航（窄屏）
      bottomNavigationBar: Column(mainAxisSize: MainAxisSize.min, children: [
        // 阶段四：迷你播放条 —— 点击或上滑展开为全屏播放页（250ms 动画）
        if (_current != null) SafeArea(child: GestureDetector(
        onVerticalDragEnd: (d) {
          if (d.primaryVelocity != null && d.primaryVelocity! < -400) _openPlayer();
        },
        child: ListTile(
          leading: _miniCover(_current!),
          title: Text(_current!.title, maxLines: 1),
          subtitle: Text(_current!.artist, maxLines: 1),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            IconButton(
              icon: Icon(_mode.icon, size: 20),
              tooltip: '播放模式：${_mode.label}',
              onPressed: _cycleMode,
            ),
            StreamBuilder<bool>(
              stream: _player.playerStateStream.map((s) => s.playing),
              initialData: false,
              builder: (_, snap) => IconButton(
                icon: Icon(snap.data == true ? Icons.pause : Icons.play_arrow),
                onPressed: () => snap.data == true ? _player.pause() : _player.play()),
            ),
          ]),
          onTap: _openPlayer,
        ),
      )),
        // 窄屏：底部导航栏
        if (!wide) NavigationBar(
          selectedIndex: _tabIndex,
          onDestinationSelected: (i) => setState(() => _tabIndex = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.library_music), label: '本地音乐'),
            NavigationDestination(icon: Icon(Icons.download), label: '下载管理'),
            NavigationDestination(icon: Icon(Icons.history), label: '最近播放'),
            NavigationDestination(icon: Icon(Icons.playlist_play), label: '我的歌单'),
          ],
        ),
      ]),
    );
  }

  // 宽屏左侧导航
  Widget _buildNavRail() => NavigationRail(
        selectedIndex: _tabIndex,
        onDestinationSelected: (i) => setState(() => _tabIndex = i),
        labelType: NavigationRailLabelType.all,
        destinations: const [
          NavigationRailDestination(icon: Icon(Icons.library_music), label: Text('本地音乐')),
          NavigationRailDestination(icon: Icon(Icons.download), label: Text('下载管理')),
          NavigationRailDestination(icon: Icon(Icons.history), label: Text('最近播放')),
          NavigationRailDestination(icon: Icon(Icons.playlist_play), label: Text('我的歌单')),
        ],
      );

  // 各 Tab 内容
  Widget _buildTabContent() {
    switch (_tabIndex) {
      case 1: return _pageShell(_buildDownloadsTab());
      case 2: return _pageShell(_buildRecentTab());
      case 3: return _pageShell(_buildPlaylistsTab());
      default: return _buildLocalTab();
    }
  }

  // 统一的页面内容宽度（宽屏不再把卡片拉到整屏）
  Widget _pageShell(Widget child) => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: child,
        ),
      );

  // 本地音乐（原曲目列表）
  Widget _buildLocalTab() => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: Column(children: [
            // 搜索栏独占一行；音源选择已移入「设置」
            Padding(padding: const EdgeInsets.all(12), child: TextField(
              controller: _searchCtrl,
              decoration: const InputDecoration(
                hintText: '搜索歌曲 / 歌手', prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(), isDense: true),
              onSubmitted: (v) { _query = v.trim(); _loadTracks(); },
            )),
            if (_error != null)
              Padding(padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text('$_error（设置里可改服务器地址/口令）',
                    style: const TextStyle(color: Colors.red))),
            Expanded(child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _tracks.isEmpty
                    ? const Center(child: Text('没有曲目：放音乐文件进 music 目录，或在设置里切换在线音源后搜索'))
                    : ListView.builder(
                        itemCount: _tracks.length,
                        itemBuilder: (_, i) {
                          final t = _tracks[i];
                          final active = t.id == _current?.id;
                          return ListTile(
                            leading: _cover(t),
                            title: Text(t.title, style: TextStyle(color: active ? Theme.of(context).colorScheme.primary : null)),
                            subtitle: Text('${t.artist}${t.album.isNotEmpty ? ' · ${t.album}' : ''}'),
                            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                              if (t.hasLyrics)
                                Padding(padding: const EdgeInsets.only(right: 6),
                                  child: Icon(Icons.lyrics_outlined, size: 16,
                                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
                              if (t.duration != null)
                                Text(fmtDuration(Duration(seconds: t.duration!.round()))),
                            ]),
                            onTap: () => _play(t, queue: _tracks, index: i),
                          );
                        },
                      )),
          ]),
        ),
      );

  // 下载管理
  Widget _buildDownloadsTab() => Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.download_done, size: 64, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 16),
          Text('下载管理', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          const Text('已下载的歌曲保存在服务器 downloads 目录'),
          const SizedBox(height: 8),
          FilledButton.icon(onPressed: _openSettings,
            icon: const Icon(Icons.folder), label: const Text('查看/修改下载路径')),
        ]),
      );

  // 最近播放
  Widget _buildRecentTab() => _recent.isEmpty
      ? const Center(child: Text('暂无最近播放'))
      : ListView.builder(
          itemCount: _recent.length,
          itemBuilder: (_, i) {
            final t = _recent[i];
            return ListTile(
              leading: _cover(t),
              title: Text(t.title),
              subtitle: Text(t.artist),
              onTap: () => _play(t, queue: _recent, index: i),
            );
          },
        );

  // 我的歌单
  Widget _buildPlaylistsTab() => Column(children: [
        Padding(padding: const EdgeInsets.all(12),
          child: Row(children: [
            Text('我的歌单', style: Theme.of(context).textTheme.titleLarge),
            const Spacer(),
            IconButton(icon: const Icon(Icons.add), tooltip: '新建歌单',
              onPressed: _createPlaylist),
          ])),
        // 任务四：搜索本地手机音乐入口
        Padding(padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Card(
            color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.45),
            child: ListTile(
              leading: _scanning
                  ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(Icons.folder_open, color: Theme.of(context).colorScheme.primary),
              title: Text(_scanning ? '正在扫描本机音频…' : '搜索本地手机音乐'),
              subtitle: const Text('自动扫描 2–8 分钟歌曲（排除录音），勾选加入歌单'),
              trailing: const Icon(Icons.chevron_right),
              onTap: _scanning ? null : _scanLocalMusic,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Expanded(child: ListView.builder(
          itemCount: _playlists.length,
          itemBuilder: (_, i) {
            final name = _playlists[i];
            final isLocal = name == localPlaylistName;
            final count = isLocal ? (_playlistSongs[name]?.length ?? 0) : 0;
            return ListTile(
              leading: Icon(i == 0 ? Icons.favorite : (isLocal ? Icons.phone_android : Icons.queue_music),
                color: Theme.of(context).colorScheme.primary),
              title: Text(name),
              subtitle: Text(i == 0 ? '默认歌单' : (isLocal ? '本机音乐 · $count 首' : '自定义歌单')),
              onTap: () => _showPlaylist(name),
            );
          },
        )),
      ]);

  // ---- 本地自动扫描：只取 2~8 分钟的音频，排除录音等非歌曲 ----
  static const Set<String> _audioExt = {'.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus'};
  static const double _minSongSeconds = 120; // 2 分钟
  static const double _maxSongSeconds = 480; // 8 分钟

  bool _looksLikeRecording(String name) => RegExp(
    r'(录音|录制|语音|voice|record(ing)?|memo|whatsapp|微信|audio_?\d|amr|tmp|temp|缓存|cache)',
    caseSensitive: false,
  ).hasMatch(name);

  Map<String, String> _parseSongName(String name) {
    final base = name.replaceAll(RegExp(r'\.[^.]+$'), '').trim();
    final m = RegExp(r'^\s*(.+?)\s*[-–—_]\s*(.+?)\s*$').firstMatch(base);
    if (m != null) {
      return {'artist': m.group(1)!.trim(), 'title': m.group(2)!.trim()};
    }
    return {'artist': '未知艺术家', 'title': base};
  }

  // Android 13+ 用 READ_MEDIA_AUDIO，旧版本用 READ_EXTERNAL_STORAGE；
  // 被拒绝时返回 false，调用方回退到系统多选文件（仍可正常导入）。
  Future<bool> _ensureAndroidMediaPermission() async {
    try {
      if (await Permission.audio.request().isGranted) return true;
      if (await Permission.storage.request().isGranted) return true;
      return false;
    } catch (_) {
      return true; // 旧系统/无权限插件实现：由目录读取失败后自行回退
    }
  }

  // 用独立的 AudioPlayer 探测时长，避免干扰正在播放的歌曲
  Future<double?> _probeDuration({
    required String path, String? url,
  }) async {
    final probe = AudioPlayer();
    try {
      if (url != null) {
        await probe.setUrl(url).timeout(const Duration(seconds: 4));
      } else {
        await probe.setFilePath(path).timeout(const Duration(seconds: 4));
      }
      final d = await probe.durationStream
          .firstWhere((x) => x != null && x.inMilliseconds > 0)
          .timeout(const Duration(seconds: 4));
      return (d?.inMilliseconds ?? 0) / 1000.0;
    } catch (_) {
      return null;
    } finally {
      await probe.dispose();
    }
  }

  Future<void> _scanLocalMusic() async {
    if (_scanning) return;
    // Web 必须在用户手势内同步触发文件选择器，否则浏览器会拒绝（丢手势）。
    final Future<FilePickerResult?>? webPick = kIsWeb
        ? FilePicker.platform.pickFiles(type: FileType.audio, allowMultiple: true, withData: true)
        : null;
    setState(() => _scanning = true);
    try {
      final candidates = <Map<String, dynamic>>[]; // {name, path, bytes}
      // 移动端/桌面端：用户选一个文件夹，自动递归扫描全部音频
      if (!kIsWeb) {
        String? dir;
        try { dir = await FilePicker.platform.getDirectoryPath(); } catch (_) {}
        if (dir != null && dir.isNotEmpty) {
          // Android 11+ 分区存储：没有媒体权限无法直接遍历目录。
          // 先申请权限；被拒绝也不报错，直接回退到系统多选文件。
          var canRead = true;
          if (Platform.isAndroid) {
            canRead = await _ensureAndroidMediaPermission();
          }
          if (canRead) {
            try {
              await for (final entity in Directory(dir).list(recursive: true, followLinks: false)) {
                if (entity is! File) continue;
                final name = entity.uri.pathSegments.last;
                final dot = name.lastIndexOf('.');
                if (dot < 0 || !_audioExt.contains(name.substring(dot).toLowerCase())) continue;
                if (_looksLikeRecording(name)) continue;
                candidates.add({'name': name, 'path': entity.path, 'bytes': null});
              }
            } catch (e) {
              // 目录不可读时回退多选，避免整个扫描直接失败
              debugPrint('目录扫描失败，回退多选: $e');
            }
          }
        }
      }
      // Web 或用户未选文件夹：退回系统多选文件
      if (candidates.isEmpty) {
        final res = webPick != null
            ? await webPick
            : await FilePicker.platform.pickFiles(
                type: FileType.audio, allowMultiple: true, withData: false);
        if (res == null || res.files.isEmpty) {
          if (mounted) setState(() => _scanning = false);
          return;
        }
        for (final f in res.files) {
          final name = f.name;
          if (_looksLikeRecording(name)) continue;
          final path = kIsWeb ? name : (f.path ?? name);
          final url = local_audio.makeLocalAudioUrl(path, name, kIsWeb ? f.bytes : null);
          candidates.add({'name': name, 'path': path, 'bytes': f.bytes, 'url': url});
        }
      }

      final songs = <LocalSong>[];
      for (final c in candidates) {
        final name = c['name'] as String;
        final path = c['path'] as String;
        final url = c['url'] as String?;
        final seconds = await _probeDuration(path: path, url: url);
        // 仅保留 2~8 分钟、时长可解析的歌曲
        if (seconds == null || seconds < _minSongSeconds || seconds > _maxSongSeconds) continue;
        final parts = _parseSongName(name);
        songs.add(LocalSong(
          name: name, path: path, duration: seconds,
          title: parts['title'], artist: parts['artist'], localUrl: url,
        ));
      }
      if (!mounted) return;
      // Web：释放上一轮扫描创建的 blob URL，避免反复扫描内存只增不减
      if (kIsWeb) {
        for (final s in _scannedSongs) {
          local_audio.releaseLocalUrl(s.localUrl);
        }
      }
      setState(() {
        _scannedSongs
          ..clear()
          ..addAll(songs);
        _scanning = false;
      });
      if (songs.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('未找到 2~8 分钟的歌曲（已排除录音/短音频，可换个文件夹再试）'),
          duration: Duration(seconds: 5),
        ));
        return;
      }
      await _showLocalSongPicker();
    } catch (e) {
      if (mounted) setState(() => _scanning = false);
      showSnack('自动扫描失败：$e');
    }
  }

  // 本地歌曲 → 可播放 Track（歌词会按标题/歌手/时长自动匹配）
  Track _trackFromLocalSong(LocalSong s) => Track(
    id: 'localfile:${s.path.hashCode.abs().toRadixString(16)}',
    source: 'localfile',
    title: s.title,
    artist: s.artist,
    album: '',
    duration: s.duration,
    localPath: kIsWeb ? null : s.path,
    localUrl: s.localUrl,
  );

  // 勾选本地歌曲 → 追加到默认歌单「大人，这是您本机上的音乐」
  Future<void> _showLocalSongPicker() async {
    final selected = List<bool>.filled(_scannedSongs.length, false);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) {
        return SafeArea(child: SizedBox(
          height: MediaQuery.of(ctx).size.height * 0.72,
          child: Column(children: [
            Padding(padding: const EdgeInsets.all(14),
              child: Row(children: [
                Text('扫描到 ${_scannedSongs.length} 首歌曲（2–8 分钟）',
                    style: Theme.of(ctx).textTheme.titleMedium),
                const Spacer(),
                TextButton(onPressed: () => setSheet(() {
                  for (var i = 0; i < selected.length; i++) { selected[i] = true; }
                }), child: const Text('全选')),
              ])),
            Expanded(child: ListView.builder(
              itemCount: _scannedSongs.length,
              itemBuilder: (_, i) => CheckboxListTile(
                value: selected[i],
                title: Text(_scannedSongs[i].title, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text('${_scannedSongs[i].artist} · ${fmtDuration(Duration(seconds: (_scannedSongs[i].duration ?? 0).round()))}\n${_scannedSongs[i].name}',
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11)),
                onChanged: (v) => setSheet(() => selected[i] = v ?? false),
              ),
            )),
            Padding(padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                icon: const Icon(Icons.playlist_add),
                label: const Text('添加到「大人，这是您的音乐」'),
                onPressed: () async {
                  final picked = <LocalSong>[];
                  for (var i = 0; i < selected.length; i++) {
                    if (selected[i]) picked.add(_scannedSongs[i]);
                  }
                  if (picked.isEmpty) {
                    Navigator.pop(ctx);
                    return;
                  }
                  _playlistSongs.putIfAbsent(localPlaylistName, () => <LocalSong>[]);
                  final existing = _playlistSongs[localPlaylistName]!;
                  for (final s in picked) {
                    if (!existing.any((x) => x.path == s.path)) existing.add(s);
                  }
                  await _savePlaylists();
                  if (mounted) setState(() {});
                  if (ctx.mounted) Navigator.pop(ctx);
                  showSnack('已添加 ${picked.length} 首到「$localPlaylistName」');
                },
              ),
            ),
          ]),
        ));
      }),
    );
  }

  void _createPlaylist() async {
    final ctrl = TextEditingController();
    final name = await showDialog<String>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('新建歌单'),
      content: TextField(controller: ctrl, decoration: const InputDecoration(hintText: '歌单名称')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
        TextButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('创建')),
      ],
    ));
    if (name != null && name.isNotEmpty && mounted) {
      if (!_playlists.contains(name)) {
        setState(() => _playlists.add(name));
        await _savePlaylists();
      }
    }
  }

  void _showPlaylist(String name) {
    final songs = _playlistSongs[name] ?? <LocalSong>[];
    // 歌单播放上下文：下一首/上一首都在本歌单内循环，不会跳回曲库
    final tracks = songs.map(_trackFromLocalSong).toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(child: SizedBox(
        height: MediaQuery.of(ctx).size.height * 0.7,
        child: Column(children: [
          Padding(padding: const EdgeInsets.all(14),
            child: Row(children: [
              Text('歌单「$name」', style: Theme.of(ctx).textTheme.titleMedium),
              const Spacer(),
              Text('${songs.length} 首', style: TextStyle(
                color: Theme.of(ctx).colorScheme.onSurfaceVariant)),
            ])),
          Expanded(child: songs.isEmpty
              ? const Center(child: Text('暂无歌曲：可在「搜索本地手机音乐」中添加'))
              : ListView.builder(
                  itemCount: songs.length,
                  itemBuilder: (_, i) => ListTile(
                    leading: const Icon(Icons.audiotrack),
                    title: Text(songs[i].title),
                    subtitle: Text('${songs[i].artist}${songs[i].duration != null
                        ? ' · ${fmtDuration(Duration(seconds: songs[i].duration!.round()))}' : ''}\n${songs[i].path}',
                        maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11)),
                    onTap: () {
                      if (ctx.mounted) Navigator.pop(ctx);
                      _play(tracks[i], push: true, queue: tracks, index: i);
                    },
                    trailing: IconButton(icon: const Icon(Icons.delete_outline),
                      onPressed: () async {
                        songs.removeAt(i);
                        await _savePlaylists();
                        if (ctx.mounted) Navigator.pop(ctx);
                        if (mounted) setState(() {});
                        _showPlaylist(name);
                      },
                    ),
                  ),
                )),
        ]),
      )),
    );
  }

  // 阶段四：迷你条展开全屏播放页（250ms ease-in-out）
  void _openPlayer() {
    if (_current == null || !mounted) return;
    Navigator.of(context).push(PageRouteBuilder(
      transitionDuration: const Duration(milliseconds: 250),
      pageBuilder: (_, anim, _) => FadeTransition(
        opacity: CurvedAnimation(parent: anim, curve: Curves.easeInOut),
        child: PlayerPage(
          player: _player, track: _current!,
          playback: _playback,
          onNext: () => _manualNext(1),
          onPrev: () => _manualNext(-1),
          onCycleMode: _cycleMode,
        ),
      ),
    ));
  }

  // 迷你条缩略封面（阶段四：图四样式要求展示缩略图）
  Widget _miniCover(Track t) {
    final cover = t.displayCover;
    if (cover != null) {
      return ClipRRect(borderRadius: BorderRadius.circular(6),
        child: Image.network(cover, width: 44, height: 44, fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _miniCoverPlaceholder()));
    }
    return _miniCoverPlaceholder();
  }

  Widget _miniCoverPlaceholder() => Container(width: 44, height: 44,
    decoration: BoxDecoration(color: Theme.of(context).colorScheme.primaryContainer,
      borderRadius: BorderRadius.circular(6)),
    child: Icon(Icons.music_note, size: 22,
      color: Theme.of(context).colorScheme.primary));

  Widget _cover(Track t) {
    final cover = t.displayCover;
    if (cover != null) {
      return ClipRRect(borderRadius: BorderRadius.circular(4),
        child: Image.network(cover, width: 44, height: 44, fit: BoxFit.cover,
            errorBuilder: (_, _, _) => const Icon(Icons.album)));
    }
    return const CircleAvatar(child: Icon(Icons.music_note));
  }

}

// ---------- 歌词编辑器 ----------
class LyricsEditor extends StatefulWidget {
  final Track track;
  final String initial;
  const LyricsEditor({super.key, required this.track, required this.initial});
  @override
  State<LyricsEditor> createState() => _LyricsEditorState();
}

class _LyricsEditorState extends State<LyricsEditor> {
  late final TextEditingController _ctrl;
  bool _synced = false;

  @override
  void initState() {
    super.initState();
    // 若初始歌词里已有时间轴，默认勾选同步
    _synced = RegExp(r'\[\d{2}:\d{2}').hasMatch(widget.initial);
    _ctrl = TextEditingController(text: widget.initial);
  }

  Future<void> _save() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) { Navigator.pop(context, false); return; }
    final ok = await Api.instance.saveLyrics(widget.track.id, text, _synced);
    if (mounted) Navigator.pop(context, ok);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('编辑歌词 · ${widget.track.title}')),
      body: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
        Row(children: [
          Checkbox(value: _synced, onChanged: (v) => setState(() => _synced = v ?? false)),
          const Text('时间轴同步歌词（每行 [分:秒.厘秒]歌词）'),
        ]),
        const SizedBox(height: 8),
        const Text('提示：留空时间轴则为普通歌词，例如直接每行一句。', style: TextStyle(fontSize: 12, color: Colors.grey)),
        const SizedBox(height: 8),
        Expanded(child: TextField(controller: _ctrl, maxLines: null, expands: true,
          textAlignVertical: TextAlignVertical.top,
          decoration: const InputDecoration(border: OutlineInputBorder(), hintText: '[00:00.00]第一句\n[00:04.50]第二句'),
          style: const TextStyle(fontSize: 15, height: 1.6))),
        const SizedBox(height: 12),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('取消')),
          FilledButton(onPressed: _save, child: const Text('保存到服务器')),
        ]),
      ])),
    );
  }
}

// ---------- 播放页（带下载 + 歌词入口） ----------
class PlayerPage extends StatefulWidget {
  final AudioPlayer player;
  final Track track;
  final PlaybackState playback; // P0-2：共享状态源
  final VoidCallback onNext;
  final VoidCallback onPrev;
  final VoidCallback onCycleMode;
  const PlayerPage({super.key, required this.player, required this.track,
    required this.playback,
    required this.onNext, required this.onPrev, required this.onCycleMode});
  @override
  State<PlayerPage> createState() => _PlayerPageState();
}

class _PlayerPageState extends State<PlayerPage> {
  late Track _track;
  late PlayMode _mode;
  Future<LyricData>? _lyricsFuture; // 歌词速览：进播放页即预取
  // 阶段二：封面/歌词切换
  final PageController _viewPage = PageController();
  int _viewIndex = 0; // 0=封面, 1=歌词
  // 阶段三：歌词同步偏移校准（毫秒），持久化
  int _lyricOffsetMs = 0;
  // 任务一：滑动预览 → 确认跳转 → 超时回弹
  final GlobalKey<LyricsPanelState> _lyricsKeyFull = GlobalKey<LyricsPanelState>();
  final GlobalKey<LyricsPanelState> _lyricsKeyMini = GlobalKey<LyricsPanelState>();
  double? _seekPreview;
  // 当前曲目的真实时长（来自 player.durationStream）；切歌时清空，
  // 避免列表未提供时长时短暂显示上一首的时长。
  Duration? _playerDuration;
  StreamSubscription<Duration?>? _durationSub;

  @override
  void initState() {
    super.initState();
    _track = widget.track;
    _mode = widget.playback.mode.value;
    _lyricsFuture = Api.instance.fetchLyrics(_track);
    _loadOffset();
    _playerDuration = widget.player.duration;
    _durationSub = widget.player.durationStream.listen((d) {
      if (mounted && d != null && d > Duration.zero) {
        setState(() => _playerDuration = d);
      }
    });
    // P0-2：监听共享状态，切歌/切模式后本页自动刷新
    widget.playback.current.addListener(_onPlaybackChanged);
    widget.playback.mode.addListener(_onPlaybackChanged);
  }

  @override
  void dispose() {
    widget.playback.current.removeListener(_onPlaybackChanged);
    widget.playback.mode.removeListener(_onPlaybackChanged);
    _durationSub?.cancel();
    _viewPage.dispose();
    super.dispose();
  }

  Future<void> _loadOffset() async {
    final sp = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() => _lyricOffsetMs = sp.getInt('lyric_offset_ms') ?? 0);
  }

  Future<void> _setOffset(int delta) async {
    final v = (_lyricOffsetMs + delta).clamp(-5000, 5000);
    final sp = await SharedPreferences.getInstance();
    await sp.setInt('lyric_offset_ms', v);
    if (mounted) setState(() => _lyricOffsetMs = v);
  }

  // 封面/歌词切换：动画 250ms
  void _switchView(int index) {
    _viewPage.animateToPage(index,
      duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    setState(() => _viewIndex = index);
  }

  void _onPlaybackChanged() {
    if (!mounted) return;
    setState(() {
      final newTrack = widget.playback.current.value ?? _track;
      if (newTrack.id != _track.id) {
        _track = newTrack;
        _playerDuration = null; // 等待新曲目的真实时长
        _lyricsFuture = Api.instance.fetchLyrics(_track); // 切歌后重新预取歌词
      }
      _mode = widget.playback.mode.value;
    });
  }

  // 模式切换由父级统一处理（同步更新共享状态 → 本页监听器自动刷新）
  void _cycleMode() => widget.onCycleMode();

  // 切歌交给父级 HomePage 统一处理（它持有队列和播放模式状态）；
  // onChanged 回调会更新这里显示的 _track。
  void _switch(int delta) {
    if (delta > 0) {
      widget.onNext();
    } else {
      widget.onPrev();
    }
  }

  void _openDownload() async {
    String? quality;
    try {
      final qs = await Api.instance.fetchQualities(_track.id);
      if (!mounted) return;
      if (qs.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('该音源不支持下载')));
        return;
      }
      quality = await showDialog<String>(
        context: context,
        builder: (ctx) => SimpleDialog(
          title: Text('下载 · ${_track.title}'),
          children: qs.map((q) => SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, q['id']),
            child: Text(q['label'] ?? ''),
          )).toList(),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('获取音质失败: $e')));
      }
      return;
    }
    if (quality == null || !mounted) return;
    _doDownload(quality);
  }

  Future<void> _doDownload(String quality) async {
    // P2 M2：先只探测响应头（ResponseType.headers），不再把整首歌下进内存两次
    String? suggestedName;
    try {
      // 用 info=1 让服务器只返回小 JSON 元信息（不下载文件体，避免双倍流量）
      final info = await Api.instance._dio.get(
        '${Api.instance.baseUrl}/api/download',
        queryParameters: {'id': _track.id, 'quality': quality, 'info': '1'},
      );
      final data = info.data;
      if (data is Map && data['type'] == 'redirect') {
        final rawUrl = data['streamUrl'];
        if (rawUrl is! String || rawUrl.isEmpty) {
          showSnack('下载链接无效');
          return;
        }
        final url = rawUrl.startsWith('http') ? rawUrl : '${Api.instance.baseUrl}$rawUrl';
        await Clipboard.setData(ClipboardData(text: url));
        showSnack('该源需在浏览器打开下载，直链已复制到剪贴板');
        return;
      }
      if (data is Map && data['type'] == 'error') {
        showSnack('${data['error']}');
        return;
      }
      // 本地源：从 info JSON 取服务器建议文件名
      if (data is Map && data['filename'] is String) {
        suggestedName = data['filename'] as String;
      }
    } catch (e) {
      // 探测失败不直接返回，继续走字节下载（它会给出具体失败原因）
      debugPrint('download info probe failed: ${_explainDownloadError(e)}');
    }
    await _doDownloadBytes(quality, suggestedName);
  }

  Future<void> _doDownloadBytes(String quality, [String? suggestedName]) async {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('正在准备下载...')));
    try {
      final url = '${Api.instance.baseUrl}/api/download?id=${Uri.encodeComponent(_track.id)}&quality=${Uri.encodeComponent(quality)}';
      // 复用带超时的 Dio 实例
      final res = await Api.instance._dio.get<List<int>>(url,
        options: Options(responseType: ResponseType.bytes,
          headers: Api.instance.accessKey.isNotEmpty ? {'X-Access-Key': Api.instance.accessKey} : null),
      );
      if (res.statusCode != 200 || res.data == null || res.data!.isEmpty) {
        throw '服务器返回空文件';
      }
      // P2 M2：iOS 上 getExternalStorageDirectory 抛 UnsupportedError，改用 documents 目录
      final dir = Platform.isIOS || kIsWeb
          ? await getApplicationDocumentsDirectory()
          : (await getExternalStorageDirectory() ?? await getApplicationDocumentsDirectory());
      final safe = suggestedName ?? _safeDownloadName(quality);
      final file = File('${dir.path}/$safe');
      await file.writeAsBytes(res.data!);
      showSnack('已保存: ${file.path.split(Platform.pathSeparator).last}');
    } catch (e) {
      showSnack(_explainDownloadError(e), duration: const Duration(seconds: 5));
    }
  }

  // 下载失败原因细化：把异常转成用户能看懂的具体提示
  String _explainDownloadError(Object e) {
    final s = e.toString();
    if (e is DioException) {
      switch (e.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return '下载超时：服务器响应过慢，请检查网络或稍后重试';
        case DioExceptionType.connectionError:
          return '网络错误：无法连接服务器（检查地址/口令/网络）';
        case DioExceptionType.badResponse:
          final code = e.response?.statusCode;
          if (code == 401) return '口令错误：请在设置里填写正确的访问口令';
          if (code == 404) return '资源不存在：服务器没有该歌曲文件';
          if (code == 403) return '无权限：服务器拒绝访问该资源';
          return 'HTTP $code：服务器返回错误';
        case DioExceptionType.cancel:
          return '下载已取消';
        default:
          return '请求失败：${e.message ?? s}';
      }
    }
    if (s.contains('SocketException') || s.contains('Failed host resolve')) {
      return 'DNS/网络错误：无法解析服务器地址';
    }
    if (s.contains('FileSystemException') || s.contains('Permission denied')) {
      return '文件写入失败：无存储权限或目录不可写';
    }
    if (s.contains('FormatException') || s.contains('typeDecode') || s.contains('Unexpected character')) {
      return '数据解析失败：服务器返回的格式不正确';
    }
    return '下载失败：$s';
  }

  String _safeDownloadName(String quality) {
    final base = _track.title.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
    final ext = quality == 'original' ? '.original' : '.mp3';
    return '$base-$quality$ext';
  }

  void _openLyrics() async {
    final data = await Api.instance.fetchLyrics(_track);
    if (!mounted) return;
    final originalText = data.entries.map((e) => e.original).join('\n');
    final stats = data.stats;
    final summary = stats.isNotEmpty
        ? '原文 ${stats['originalLines'] ?? data.entries.length} 行 · '
          '已译 ${stats['translatedLines'] ?? 0} 行 · '
          '空译 ${stats['emptyTranslations'] ?? 0} 行'
        : '来源 ${data.source}';

    final shown = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('歌词 · ${_track.title}'),
        content: SizedBox(width: double.maxFinite, height: 400,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.only(bottom: 8),
              child: Text(summary, style: TextStyle(fontSize: 12,
                color: Theme.of(ctx).colorScheme.onSurfaceVariant))),
            Expanded(child: SingleChildScrollView(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: data.entries.isEmpty
                  ? [const Text('暂无歌词')]
                  : data.entries.map((e) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(e.original, style: const TextStyle(fontSize: 14)),
                        Text(displayTranslation(e), style: TextStyle(fontSize: 12,
                          fontStyle: e.status == 'untranslated' ? FontStyle.italic : FontStyle.normal,
                          color: Theme.of(ctx).colorScheme.onSurfaceVariant)),
                      ]),
                    )).toList(),
            ))),
          ]),
        ),
        actions: [
          TextButton.icon(icon: const Icon(Icons.delete_outline),
            label: const Text('删除自定义'),
            onPressed: () async {
              final ok = await Api.instance.deleteLyrics(_track.id);
              if (ctx.mounted) Navigator.pop(ctx, ok);
            }),
          TextButton.icon(icon: const Icon(Icons.edit),
            label: const Text('编辑/添加'),
            onPressed: () async {
              final saved = await Navigator.push<bool>(ctx, MaterialPageRoute(
                builder: (_) => LyricsEditor(track: _track, initial: originalText)));
              if (ctx.mounted) Navigator.pop(ctx, saved);
            }),
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('关闭')),
        ],
      ),
    );
    if (shown == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('歌词已保存')));
    }
  }

  @override
  Widget build(BuildContext context) {
    // 阶段四：全屏播放页下滑收缩回迷你条（阈值 120px）
    return GestureDetector(
      onVerticalDragEnd: (d) {
        if (d.primaryVelocity != null && d.primaryVelocity! > 400) {
          Navigator.pop(context); // 下滑 → 收缩
        }
      },
      child: Scaffold(
      appBar: AppBar(title: const Text('正在播放'), actions: [
        _iconBtn(Icon(_mode.icon), '播放模式：${_mode.label}', _cycleMode),
        _iconBtn(const Icon(Icons.download), '下载', _openDownload),
        _iconBtn(const Icon(Icons.lyrics), '歌词', _openLyrics),
      ]),
      body: SafeArea(
        child: LayoutBuilder(builder: (context, c) {
          // 阶段四响应式：>768px 左右分栏；≤768px 单视图滑动切换
          final wide = c.maxWidth > 768;
          return wide ? _buildWide(c) : _buildNarrow(c);
        }),
      ),
      ),
    );
  }

  // ===== 窄屏：PageView 封面/歌词两个并列主视图，左右滑动 + 点击切换 =====
  Widget _buildNarrow(BoxConstraints c) {
    final size = c.maxWidth;
    final artworkSize = size < 360 ? 220.0 : 260.0;
    return Column(children: [
      Expanded(
        child: PageView(
          controller: _viewPage,
          // 点击切换由 _switchView 的 animateToPage(250ms) 控制；
          // 手势滑动由 PageView 原生手势驱动，无内置 duration 参数
          onPageChanged: (i) => setState(() => _viewIndex = i),
          children: [
            // 页0：封面视图（完整展示 + 旋转），点击切到歌词
            GestureDetector(
              onTap: () => _switchView(1),
              child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                _rotatingArtwork(artworkSize),
                const SizedBox(height: 20),
                _trackInfo(),
              ])),
            ),
            // 页1：歌词视图（占据原封面区域），点击切回封面
            GestureDetector(
              onTap: () => _switchView(0),
              child: _lyricsView(fullHeight: true, panelKey: _lyricsKeyFull),
            ),
          ],
        ),
      ),
      // 视图指示器
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _dot(0), const SizedBox(width: 8), _dot(1),
      ]),
      const SizedBox(height: 4),
      _offsetControl(),
      _progress(),
      const SizedBox(height: 8),
      _controls(),
      _modeLabel(),
    ]);
  }

  Widget _dot(int i) => GestureDetector(
        onTap: () => _switchView(i),
        child: Container(width: 8, height: 8, decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: _viewIndex == i
              ? Theme.of(context).colorScheme.primary
              : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3))),
      );

  // ===== 宽屏：左封面 / 右歌词，左右分栏同时展示 =====
  Widget _buildWide(BoxConstraints c) {
    return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      // 左：封面 + 信息
      Expanded(child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        _rotatingArtwork(300),
        const SizedBox(height: 24),
        _trackInfo(),
      ]))),
      // 右：歌词（max-width 居中，避免单行过长）+ 播控
      Expanded(child: Column(children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: _lyricsView(fullHeight: false, panelKey: _lyricsKeyMini),
        ),
        _offsetControl(),
        _progress(),
        const SizedBox(height: 8),
        _controls(),
        _modeLabel(),
      ])),
    ]);
  }

  // 封面旋转动画组件（切回不重新加载/不闪烁：用 AnimatedRotation 基于播放状态）
  Widget _rotatingArtwork(double size) {
    final cover = _track.displayCover;
    Widget img = cover != null
        ? Image.network(cover, width: size, height: size, fit: BoxFit.cover,
            errorBuilder: (_, _, _) => _placeholderArt(size))
        : _placeholderArt(size);
    return ClipRRect(borderRadius: BorderRadius.circular(20), child: img);
  }

  Widget _placeholderArt(double size) => Container(width: size, height: size,
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.primaryContainer,
      borderRadius: BorderRadius.circular(20)),
    child: Icon(Icons.album, size: size * 0.45,
      color: Theme.of(context).colorScheme.primary));

  // 歌词视图：用 positionStream 驱动（高频读真实播放进度），绑定 offset
  Widget _lyricsView({required bool fullHeight, required GlobalKey<LyricsPanelState> panelKey}) {
    final future = _lyricsFuture;
    // 《02的爱恋》使用图二复刻样式
    final figureTwo = _track.title.contains('02的爱恋');
    if (future == null) return const SizedBox.shrink();
    return FutureBuilder<LyricData>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator(strokeWidth: 2));
        }
        final data = snap.data ?? const LyricData(entries: [], source: '', lang: 'zh', stats: {});
        return StreamBuilder<Duration>(
          stream: widget.player.positionStream,
          initialData: Duration.zero,
          builder: (context, posSnap) {
            // 阶段三：用真实播放进度 + offset 校准，seek/暂停恢复都会触发 rebuild 立即对齐
            final posMs = (posSnap.data ?? Duration.zero).inMilliseconds;
            final alignedPos = (posMs - _lyricOffsetMs) / 1000.0;
            return SizedBox(
              // 宽屏分栏需容纳 5 行歌词面板；图二样式含标题/统计头需更高
              height: fullHeight ? double.maxFinite : (figureTwo ? 580 : 460),
              child: LyricsPanel(
                key: panelKey,
                entries: data.entries,
                position: alignedPos,
                // 仅在用户点击【确认跳转】后才真正 seek；滑动预览期间音乐照常播放
                onSeek: (seconds) {
                  final real = (seconds * 1000).round() + _lyricOffsetMs;
                  widget.player.seek(Duration(milliseconds: real < 0 ? 0 : real));
                },
                onPreviewChanged: (seconds) {
                  if (mounted) setState(() => _seekPreview = seconds);
                },
                style: figureTwo ? LyricVisualStyle.figureTwo : LyricVisualStyle.standard,
                title: _track.title,
                stats: data.stats,
              ),
            );
          },
        );
      },
    );
  }

  // offset 校准控件（毫秒），±100ms 步进
  Widget _offsetControl() => Row(mainAxisAlignment: MainAxisAlignment.center, children: [
    _iconBtn(const Icon(Icons.replay_10), '歌词提前100ms', () => _setOffset(-100)),
    Text('校准 ${_lyricOffsetMs >= 0 ? '+' : ''}${_lyricOffsetMs}ms',
      style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
    _iconBtn(const Icon(Icons.forward_10), '歌词延后100ms', () => _setOffset(100)),
  ]);

  // 触摸热区 ≥48dp；hoverColor 仅在桌面端生效（手机无 hover，自动忽略）
  Widget _iconBtn(Widget icon, String tip, VoidCallback onPressed) => SizedBox(
        width: 48, height: 48,
        child: IconButton(
          icon: icon, tooltip: tip, onPressed: onPressed,
          hoverColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
          splashRadius: 28,
        ),
      );

  Widget _trackInfo() => Column(children: [
        Text(_track.title, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
        const SizedBox(height: 6),
        Text(_track.artist, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ]);

  Widget _progress() => StreamBuilder<Duration>(
        stream: widget.player.positionStream, initialData: Duration.zero,
        builder: (_, snap) {
          final pos = snap.data ?? Duration.zero;
          // 优先使用曲目元数据；没有则等 player 上报的真实时长（切歌时已清空）
          final known = _track.duration != null
              ? Duration(seconds: _track.duration!.round())
              : null;
          final dur = known ?? _playerDuration ?? Duration.zero;
          return Column(children: [
            Slider(value: dur.inMilliseconds > 0
                ? (pos.inMilliseconds / dur.inMilliseconds).clamp(0.0, 1.0) : 0.0,
              onChanged: (v) { if (dur.inMilliseconds > 0) widget.player.seek(dur * v); }),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text(fmtDuration(pos)),
              Text(dur > Duration.zero ? fmtDuration(dur) : '--:--')]),
          ]);
        },
      );

  Widget _controls() => Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _iconBtn(Icon(_mode.icon, color: Theme.of(context).colorScheme.primary),
            '${_mode.label}（点击切换）', _cycleMode),
        const SizedBox(width: 4),
        _iconBtn(const Icon(Icons.skip_previous, size: 34), '上一首', () => _switch(-1)),
        const SizedBox(width: 10),
        // 任务一：滑动预览期间，播放/暂停按钮临时变为【确认跳转】按钮
        // 按钮上方实时显示预览时间点；音乐始终按原进度播放，不暂停不跳转。
        _seekPreview != null ? _confirmButton() : _playPauseButton(),
        const SizedBox(width: 10),
        _iconBtn(const Icon(Icons.skip_next, size: 34), '下一首', () => _switch(1)),
        const SizedBox(width: 4),
        _iconBtn(Icon(Icons.replay, color: Theme.of(context).colorScheme.primary),
            '重新播放本曲', () => widget.player.seek(Duration.zero).then((_) => widget.player.play())),
      ]);

  Widget _playPauseButton() => StreamBuilder<bool>(
        stream: widget.player.playerStateStream.map((s) => s.playing),
        initialData: false,
        builder: (_, snap) => SizedBox(width: 64, height: 64, child: CircleAvatar(
          child: IconButton(
            icon: Icon(snap.data == true ? Icons.pause : Icons.play_arrow, size: 36),
            tooltip: snap.data == true ? '暂停' : '播放',
            onPressed: () => snap.data == true ? widget.player.pause() : widget.player.play(),
          ))));

  Widget _confirmButton() {
    final cs = Theme.of(context).colorScheme;
    final useFull = MediaQuery.of(context).size.width <= 768 && _viewIndex == 1;
    final panelKey = useFull ? _lyricsKeyFull : _lyricsKeyMini;
    return SizedBox(width: 64, height: 84, child: Column(
      mainAxisSize: MainAxisSize.min, children: [
      // 紧贴按钮上方的预览时间
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: cs.primary.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(10)),
        child: Text(fmtDuration(Duration(seconds: _seekPreview!.round())),
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: cs.primary)),
      ),
      const SizedBox(height: 2),
      CircleAvatar(
        backgroundColor: cs.primary,
        radius: 24,
        child: IconButton(
          icon: const Icon(Icons.check, color: Colors.white, size: 30),
          tooltip: '确认跳转到该时间',
          onPressed: () => panelKey.currentState?.confirmSeek(),
        )),
    ]));
  }

  Widget _modeLabel() => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text('当前模式：${_mode.label}',
            style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)));

}
