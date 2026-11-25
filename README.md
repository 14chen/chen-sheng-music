# 橙声君 App（独立开发）

自己电脑当服务器的音乐播放器。Android 客户端用 Flutter 写，后端用 Node.js。
架构参考了逆向分析得到的**模块划分思路**，但代码、品牌、UI 全部独立实现；
音源只接**本地曲库**和**合规在线源**，不含任何绕过付费/版权保护的逻辑。

## 目录

```
music-app/
├── server/    # Node.js 服务器（你电脑上运行）
├── app/       # Flutter Android 客户端
└── README.md  # 本文件
```

## 快速启动

### 1. 启动服务器（你的电脑）

```powershell
cd D:\work\music-app\server
npm install
npm start
```

- 默认监听 `18080` 端口（8080 被其它程序占用）。
- 把你自己的音乐文件（mp3/flac/m4a/wav 等）放进 `server\music\`。
- 启动时自动扫描；也可运行时 `POST http://127.0.0.1:18080/api/scan` 重新扫描。

### 2. 安装 APK 到手机

Debug APK 构建命令：

```powershell
$env:ANDROID_HOME='D:\Android\Sdk'
$env:ANDROID_SDK_ROOT='D:\Android\Sdk'
cd D:\work\music-app\app
flutter build apk --debug
```

产物：`app\build\app\outputs\flutter-apk\app-debug.apk`

安装：`adb install -r <apk路径>`（adb 在 `D:\Android\Sdk\platform-tools`）。

### 3. 手机连接服务器

打开 App → 右上角设置 → 填服务器地址：

| 场景 | 地址 |
|---|---|
| Android 模拟器 | `http://10.0.2.2:18080` |
| 真机（同一 WiFi） | `http://<电脑局域网IP>:18080`，例如 `http://192.168.1.10:18080` |

查电脑局域网 IP：`ipconfig` 看「无线局域网适配器 WLAN」的 IPv4 地址。

### 4. 公网访问（可选）

手机不在同一 WiFi 时，用内网穿透（任选其一）：

- **Cloudflare Tunnel**（免费、无需公网 IP）：`cloudflared tunnel --url http://localhost:18080`
- **frp / 蒲公英 / ZeroTier** 等

> 安全提醒：不要把 18080 直接在路由器做端口映射裸奔公网。用 Tunnel 或至少加一层认证。

## 音源

- **本地曲库**：默认启用。扫描你自己的音乐文件，提供播放和 Range 流媒体。
- **Jamendo（CC 授权在线音乐）**：可选。去 https://developer.jamendo.com/ 免费注册 client_id，
  填到 `server\.env` 的 `JAMENDO_CLIENT_ID`，重启服务器即可在 App 音源下拉框切换。

添加新音源：在 `server\src\sources\` 新建文件，实现
`{ id, name, enabled, list({q,offset,limit}), resolve(trackId) }` 接口，
再注册到 `server\src\sources\index.js` 的 `sources` 数组。

> 本项目不实现任何绕过平台技术保护措施的音源。

## 已验证

- 服务器 API：`/api/health`、`/api/sources`、`/api/tracks`、`/api/tracks/:id/stream`（206 Range）、`POST /api/scan` 全部通过。
- 流媒体断点续传：`Content-Range: bytes 0-99/...` 返回 206，正确。
- APK 构建成功：`app\build\app\outputs\flutter-apk\app-debug.apk`（约 150 MB，包名保留 `com.myapp.my_music_app`（内部标识，避免与已装旧版冲突），显示名为「橙声君」，minSdk 24 / targetSdk 36）。

## v2.0 新增功能（已实测）

| 功能 | 说明 |
|---|---|
| **公网访问口令** | 配置 `ACCESS_KEY` 后所有 API 校验 `X-Access-Key`（App 设置里填）；未配置时不做校验。实测：无口令 401 / 有口令 200 |
| **分音质下载** | 本地曲库用 ffmpeg 转 128/192/320kbps（+原始），Jamendo 用官方码率；`GET /api/download/qualities` 和 `/api/download` |
| **歌词** | 本地 `.lrc` 优先，其次 [LRCLIB](https://lrclib.net) 公开歌词库（无需 key）；实测 Hey Jude 拿到 101 行同步歌词 |
| **曲库自动刷新** | 每 15 秒检测文件变化自动重扫；实测加文件 3→4、删文件 4→3，均自动生效 |

> 音质边界：不做各平台"无损"绕过，只做自有文件的转码和有明确授权的源。

## 音源列表（v2.2 起）

| 显示名 | 说明 |
|---|---|
| 本地曲库 | 服务器 `music/` 目录，支持 `.lrc` 歌词与 ffmpeg 转码下载 |
| 音源J | Jamendo（CC 授权，需 `JAMENDO_CLIENT_ID`） |
| 音源B | 哔哩哔哩（MusicFree 插件） |
| 音源W | 网易（MusicFree 插件，免费曲目） |
| 音源K | 酷我（MusicFree 插件） |
| 音源N | 酷我·念心（MusicFree 插件） |
| 音源Q | 好听轻音乐（MusicFree 插件） |

> iTunes 试听与元力KG 已移除。第三方插件音源的可用性、曲目版权与音质由上游决定；
> 插件文件放在 `server/custom-plugins/`，依赖 `axios / cheerio / crypto-js / dayjs / he / qs / big-integer`。
>
> 稳定性：插件搜索 25 秒、取流 12 秒超时；单个上游失败返回可读错误，不会让整个 API 500。
> 下载能力仅本地曲库（转码）与 Jamendo（官方直链），其它音源返回“不支持下载”。

## 构建环境排错记录（本机实际遇到并已解决）

| 问题 | 解决 |
|---|---|
| Gradle 下载 SSL 证书失败（PKIX path building failed）| 下载 Gradle 9.5.0 到 `D:\gradle-9.5.0-all.zip`，把 `android/gradle/wrapper/gradle-wrapper.properties` 的 `distributionUrl` 改为 `file\:///D:/gradle-9.5.0-all.zip` |
| `No Android SDK found` / 缺 NDK、CMake、Build-Tools 36 | 装 SDK 后构建会自动补装 Build-Tools 36 / Platform 36 / CMake 3.22.1；NDK 用 `android sdk install 'ndk;28.2.13676358'` 预装 |
| Kotlin 增量编译缓存损坏（Could not close incremental caches）| `flutter clean` + 在 `android/gradle.properties` 加 `kotlin.incremental=false` |
| 构建命令需显式环境变量 | 每条构建命令都设 `ANDROID_HOME` / `ANDROID_SDK_ROOT` / `PUB_HOSTED_URL`（当前 shell 不继承用户级变量）|

Flutter 3.50.1 / Dart 3.14.0，SDK 在 `D:\flutter`；Android SDK 在 `D:\Android\Sdk`。
