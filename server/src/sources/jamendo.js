import { config } from '../config.js';

// 合法在线音源：Jamendo（CC 授权音乐，需免费注册 client_id）
// 注册地址：https://developer.jamendo.com/
// 未配置 JAMENDO_CLIENT_ID 时该源自动禁用，不影响本地曲库。
export const jamendoSource = {
  id: 'jamendo',
  name: '音源J',
  enabled: config.jamendo.enabled,

  async list({ q = '', offset = 0, limit = 30 } = {}) {
    if (!config.jamendo.enabled) return { total: 0, items: [] };
    const params = new URLSearchParams({
      client_id: config.jamendo.clientId,
      format: 'json',
      limit: String(Math.min(limit, 100)),
      offset: String(offset),
      include: 'musicinfo',
    });
    if (q) params.set('search', q);
    const url = `https://api.jamendo.com/v3.0/tracks/?${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Jamendo HTTP ${res.status}`);
    const json = await res.json();
    const items = (json.results || []).map((t) => ({
      id: `jamendo:${t.id}`,
      source: 'jamendo',
      title: t.name,
      artist: t.artist_name || '未知艺术家',
      album: t.album_name || '',
      duration: t.duration || null,
      size: null,
      mime: t.audio_format || 'mp3',
      cover: t.album_image || t.image || null,
      license: t.license || 'CC',
    }));
    return { total: json.headers?.results_count ?? items.length, items };
  },

  async resolve(trackId) {
    if (!trackId.startsWith('jamendo:')) return null;
    const id = trackId.slice('jamendo:'.length);
    const params = new URLSearchParams({
      client_id: config.jamendo.clientId,
      format: 'json',
      id: id,
      include: 'musicinfo',
    });
    const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const t = (json.results || [])[0];
    if (!t) return null;
    return {
      streamUrl: t.audio || t.stream || null,
      mime: t.audio_format || 'mp3',
      title: t.name,
      size: null,
      // 经服务器代理：Web 端同源、可透传 Range，避免直连 CDN 慢/被 CORS 限制
      proxy: true,
    };
  },
};
