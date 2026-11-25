# 橙声君服务器

你电脑就是服务器。默认扫描 `./music` 目录里你自己的音乐文件，提供 REST API 和 HTTP 流媒体（支持断点续传）。音源可插拔，默认只有完全合法的本地曲库；可选接入 Jamendo（CC 授权在线音乐）。

## 启动

```powershell
cd D:\work\music-app\server
npm install
Copy-Item .env.example .env   # 按需修改
npm run scan                  # 扫描曲库（也可在启动时自动扫描）
npm start
```

启动后：`http://127.0.0.1:8080/api/health` 应返回 `{"ok":true}`。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/sources` | 列出可用音源 |
| GET | `/api/tracks?source=local&q=&offset=0&limit=50` | 曲目列表/搜索 |
| GET | `/api/tracks/:id/stream` | 播放（支持 `Range` 头） |
| POST | `/api/scan` | 重新扫描本地曲库 |

## 音源扩展

`src/sources/` 下每个音源实现统一接口：
```js
{ id, name, enabled, async list({q,offset,limit}), async resolve(trackId) }
```
`resolve()` 返回 `{ filePath, mime, size }`（本地）或 `{ streamUrl, mime }`（在线，会 302 重定向）。把新文件加入 `src/sources/index.js` 的 `sources` 数组即可。

> 注意：本项目不实现任何绕过平台付费/版权保护的逻辑。要接在线音源请使用有明确授权或官方开放平台许可的来源。

## 公网访问（可选）

局域网内手机用 `http://<电脑局域网IP>:8080` 直连。公网访问可用 Cloudflare Tunnel / frp 等内网穿透，不要在路由器直接裸暴露端口。
