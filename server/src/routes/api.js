import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeWithErrorHandling } from '../stream-utils.js';
import { Router } from 'express';
import { sources, getSource, listSources } from '../sources/index.js';
import { scanLibrary } from '../library.js';
import { getQualities, prepareLocalDownload, getJamendoDownloadUrl } from '../download.js';
import { getLyrics, saveCustomLyrics, deleteCustomLyrics } from '../lyrics.js';
import { db } from '../db.js';
import { parseRange } from '../range.js';
import { translateLyrics } from '../lyrics-translate.js';
import { detectLang } from '../lyrics-translate.js';
import { buildEntries, alignTranslations, validateAlignment } from '../lyrics-structure.js';

const router = Router();

// 自定义音源功能已彻底移除，仅返回内置音源
router.get('/sources', (_req, res) => {
  res.json({ sources: listSources() });
});

router.get('/tracks', async (req, res, next) => {
  try {
    const sourceId = String(req.query.source || 'local');
    const source = getSource(sourceId);
    if (!source) return res.status(404).json({ error: `未知音源: ${sourceId}` });
    if (!source.enabled) return res.status(400).json({ error: `音源未启用: ${sourceId}` });
    const q = String(req.query.q || '');
    const offset = Math.max(0, Number(req.query.offset || 0));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const result = await source.list({ q, offset, limit });
    res.json({ source: sourceId, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/tracks/:id/stream', async (req, res, next) => {
  try {
    const trackId = req.params.id;
    const sourceId = trackId.includes(':') ? trackId.split(':')[0] : 'local';
    const source = getSource(sourceId);
    if (!source) return res.status(404).json({ error: '未知音源' });

    const resolved = await source.resolve(trackId);
    if (!resolved) return res.status(404).json({ error: '曲目不存在' });
    if (resolved.streamError) {
      return res.status(502).json({ error: resolved.streamError });
    }

    if (resolved.streamUrl) {
      // 插件源往往需要 Referer/Host 等自定义头，302 跳转无法携带 → 服务器端带头代理；
      // 部分源（如 Jamendo）虽不需要头，也走代理以获得同源/可重试的稳定播放。
      if (resolved.streamHeaders || resolved.proxy) {
        const headers = { ...(resolved.streamHeaders || {}) };
        if (req.headers.range) headers.Range = req.headers.range;
        const upstream = await fetch(resolved.streamUrl, {
          headers, redirect: 'manual', signal: AbortSignal.timeout(45000),
        });
        if (!upstream.ok && upstream.status !== 206) {
          return res.status(502).json({ error: `上游音频 HTTP ${upstream.status}` });
        }
        res.status(upstream.status);
        for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          const v = upstream.headers.get(k);
          if (v) res.setHeader(k, v);
        }
        if (upstream.body) pipeWithErrorHandling(Readable.fromWeb(upstream.body), res);
        else res.end();
        return;
      }
      return res.redirect(302, resolved.streamUrl);
    }

    const { filePath, mime, size } = resolved;
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mime === 'mp3' ? 'audio/mpeg' : `audio/${mime}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const parsed = parseRange(range, fileSize);
    if (parsed && parsed.status === 416) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }
    if (parsed) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.end}/${fileSize}`);
      res.setHeader('Content-Length', parsed.end - parsed.start + 1);
      pipeWithErrorHandling(fs.createReadStream(filePath, { start: parsed.start, end: parsed.end }), res);
    } else {
      res.setHeader('Content-Length', fileSize);
      pipeWithErrorHandling(fs.createReadStream(filePath), res);
    }
  } catch (err) {
    next(err);
  }
});

// ---- 外链封面代理：Web 端 Image.network 走 XHR，外站图片会被 CORS 拦截 ----
router.get('/cover', async (req, res, next) => {
  try {
    const raw = String(req.query.url || '');
    let u;
    try { u = new URL(raw); } catch { return res.status(400).json({ error: '无效图片地址' }); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return res.status(400).json({ error: '仅支持 http(s) 图片' });
    }
    const upstream = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0 (ChengShengMusic cover proxy)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return res.status(502).json({ error: `图片源 HTTP ${upstream.status}` });
    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    if (!ct.startsWith('image/')) return res.status(415).json({ error: '不是图片' });
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (upstream.body) pipeWithErrorHandling(Readable.fromWeb(upstream.body), res);
    else res.end();
  } catch (err) {
    next(err);
  }
});

// ---- 歌词 ----
router.get('/lyrics', async (req, res, next) => {
  try {
    const id = String(req.query.id || '');
    const meta = {
      title: String(req.query.title || ''),
      artist: String(req.query.artist || ''),
      duration: Number(req.query.duration || 0) || null,
    };
    if (!id) return res.status(400).json({ error: '缺少 id' });
    const result = await getLyrics(id, meta);
    const lines = result.lines || [];
    // 结构化词条：原文 + 时间轴（bind 翻译用）
    const lang = lines.length ? detectLang(lines.map((l) => l.text).join(' ')) : 'zh';
    let translated = [];
    try {
      translated = await translateLyrics(id, lines);
    } catch (e) {
      translated = [];
    }
    const entries = alignTranslations(
      buildEntries(lines, meta.duration || null), translated, lang);
    const validation = validateAlignment(entries);
    res.json({
      ...result,
      lang,
      entries,                       // 新：结构化词条（前端歌词面板用）
      stats: validation.stats,       // 新：对齐校验统计
      alignmentValid: validation.valid,
      translated,                    // 兼容旧版
    });
  } catch (err) {
    next(err);
  }
});

// ---- 自定义歌词：保存 / 删除 ----
router.post('/lyrics/custom', async (req, res, next) => {
  try {
    const id = String(req.body?.id || '');
    const text = String(req.body?.text || '');
    const synced = req.body?.synced === true;
    if (!id || !text.trim()) return res.status(400).json({ error: '缺少 id 或歌词内容' });
    const r = await saveCustomLyrics(id, text, synced);
    res.json({ ok: true, ...r });
  } catch (err) { next(err); }
});

router.delete('/lyrics/custom', (req, res) => {
  const id = String(req.query.id || '');
  if (!id) return res.status(400).json({ error: '缺少 id' });
  res.json({ ok: true, deleted: deleteCustomLyrics(id) });
});

// ---- 下载：可用音质 ----
router.get('/download/qualities', (req, res) => {
  const id = String(req.query.id || '');
  if (!id) return res.status(400).json({ error: '缺少 id' });
  res.json({ id, qualities: getQualities(id) });
});

// ---- 下载：文件（本地转码）或 Jamendo 官方链接 ----
router.get('/download', async (req, res, next) => {
  try {
    const id = String(req.query.id || '');
    const quality = String(req.query.quality || 'original');
    if (!id) return res.status(400).json({ error: '缺少 id' });
    const source = id.includes(':') ? id.split(':')[0] : 'local';

    if (source === 'jamendo') {
      const r = await getJamendoDownloadUrl(id, quality);
      return res.json({ type: 'redirect', ...r });
    }

    const r = await prepareLocalDownload(id, quality);
    // P2 M2：info=1 只返回元信息，前端据此获得文件名，不再重复下载整首歌
    if (req.query.info === '1') {
      return res.json({ type: 'file', filename: r.filename, quality: r.quality });
    }
    res.setHeader('Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(r.filename)}`);
    res.setHeader('Content-Type', r.mime);
    pipeWithErrorHandling(fs.createReadStream(r.filePath), res);
  } catch (err) {
    next(err);
  }
});

router.post('/scan', async (_req, res, next) => {
  try {
    const result = await scanLibrary();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

// 曲库统计（含文件数，供状态页/App 显示）
router.get('/stats', (_req, res) => {
  const row = db.prepare("SELECT COUNT(*) AS n FROM tracks WHERE source='local'").get();
  const songs = db.prepare("SELECT COUNT(*) AS n FROM tracks").get();
  res.json({ local: row.n, total: songs.n });
});

router.get('/health', (_req, res) => res.json({ ok: true, now: Date.now() }));

export default router;
