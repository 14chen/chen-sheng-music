// 内置 MusicFree 兼容音源（插件文件放在 server/custom-plugins/）
// 接口：search(keyword,page,type) / getMediaSource(musicItem)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 基于本文件位置解析，避免依赖启动目录（node src/index.js / supervisor 均可）
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(HERE, '..', 'custom-plugins');

// 插件均为 CommonJS（部分为 Parcel 构建，ESM import() 取不到具名导出），
// 统一用 createRequire 加载，兼容所有格式。
const require = createRequire(import.meta.url);

// 搜索结果缓存上限：插件取流需要原始 musicItem，但无限增长会泄漏内存
const MAX_ITEM_CACHE = 800;

// 第三方插件偶尔会卡在死接口上，统一加超时避免请求永久挂起
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}超时（${ms}ms）`)), ms)),
  ]);
}

async function loadPlugin(file) {
  const target = path.join(PLUGIN_DIR, file);
  if (!fs.existsSync(target)) return null;
  try {
    // 每次加载前清缓存，插件文件更新后无需重启也能生效
    const resolved = require.resolve(target);
    delete require.cache[resolved];
    const mod = require(target);
    const plugin = mod.default || mod.source || mod;
    if (!plugin || typeof plugin.search !== 'function') return null;
    return plugin;
  } catch (e) {
    console.warn(`[plugin] 加载失败 ${file}:`, e?.message || e);
    return null;
  }
}

function toTrack(sourceId, item, index) {
  const rawId = item.id ?? item.bvid ?? item.aid ?? item.hash ?? item.cid ?? String(index);
  return {
    id: `${sourceId}:${encodeURIComponent(String(rawId))}`,
    source: sourceId,
    title: item.title || item.songName || item.name || '未知曲目',
    artist: item.artist || item.author || item.singerName || item.singername || '未知艺术家',
    album: item.album || item.album_name || '',
    duration: Number(item.duration) || null,
    cover: item.artwork || item.cover || item.img || item.Image || null,
    hasLyrics: false,
  };
}

function makeSource(id, file, displayName) {
  let pluginPromise = null;
  const itemCache = new Map(); // 短 id → 原始 musicItem（供 getMediaSource 使用）
  const getPlugin = () => (pluginPromise ??= loadPlugin(file));

  return {
    id,
    name: displayName,
    enabled: true,
    builtInPlugin: true,
    async list({ q = '', offset = 0, limit = 50 } = {}) {
      const plugin = await getPlugin();
      if (!plugin) throw new Error(`${displayName} 插件文件缺失或格式错误`);
      // 空关键词时第三方源通常报错，直接返回空列表
      if (!String(q || '').trim()) return { total: 0, items: [] };
      const page = Math.floor(offset / limit) + 1;
      let result;
      try {
        result = await withTimeout(plugin.search(String(q), page, 'music'), 25000, '搜索');
      } catch (e) {
        // 上游接口不稳定时返回空列表，不让整个 API 500
        console.warn(`[${displayName}] 搜索失败:`, e?.message || e);
        return { total: 0, items: [], warning: `${displayName} 搜索暂不可用：${e?.message || '上游异常'}` };
      }
      const data = Array.isArray(result?.data) ? result.data : [];
      const items = data.map((item, i) => {
        const t = toTrack(id, item, i);
        itemCache.set(t.id, item);
        return t;
      });
      // 控制缓存大小（Map 保持插入顺序，超限时淘汰最早的条目）
      while (itemCache.size > MAX_ITEM_CACHE) {
        const oldest = itemCache.keys().next().value;
        if (oldest === undefined) break;
        itemCache.delete(oldest);
      }
      return { total: result?.isEnd ? items.length : items.length + 1, items };
    },
    async resolve(trackId) {
      const plugin = await getPlugin();
      if (!plugin) return null;
      const item = itemCache.get(trackId);
      if (!item) return null;
      let lastError = null;
      // 部分插件的上游接口不稳定，逐个质量等级尝试，避免单个失败导致 500
      for (const quality of ['high', 'standard', 'low', 'super']) {
        try {
          const src = await withTimeout(
            plugin.getMediaSource(item, quality), 12000, '取流');
          if (src && src.url) {
            return { streamUrl: src.url, streamHeaders: src.headers || null };
          }
          lastError = '上游未返回播放地址';
        } catch (e) {
          lastError = e?.message || '上游接口异常';
        }
      }
      return { streamError: `${displayName} 暂无法获取播放链接（${lastError}）` };
    },
  };
}

// 插件为 CommonJS（module.exports），服务器 package.json 为 ESM，故使用 .cjs 扩展名加载。
// 显示名按用户要求统一为「音源X」；id 保持稳定，避免客户端缓存失效。
export const musicFreeSources = [
  makeSource('bilibili', 'bilibili.cjs', '音源B'),
  makeSource('netease', 'netease.cjs', '音源W'),
  makeSource('kuwo', 'kuwo.cjs', '音源K'),
  makeSource('kuwo-nianxin', 'kuwo-nianxin.cjs', '音源N'),
  makeSource('haoting', 'haoting.cjs', '音源Q'),
];

export function getMusicFreeSource(id) {
  return musicFreeSources.find((s) => s.id === id) || null;
}
