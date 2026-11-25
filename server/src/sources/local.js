import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { localTrackPath } from '../library.js';
import { findLrcPath } from '../lrc-path.js';

export const localSource = {
  id: 'local',
  name: '本地曲库',
  enabled: true,

  async list({ q = '', offset = 0, limit = 50 } = {}) {
    const like = `%${q}%`;
    const rows = db.prepare(`
      SELECT id, source, rel_path, title, artist, album, duration, size, mime, cover
      FROM tracks
      WHERE source = 'local'
        AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)
      ORDER BY title COLLATE NOCASE
      LIMIT ? OFFSET ?
    `).all(like, like, like, limit, offset);
    const total = db.prepare(`
      SELECT COUNT(*) AS n FROM tracks
      WHERE source = 'local'
        AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)
    `).get(like, like, like).n;
    return {
      total,
      items: rows.map((r) => {
        const audio = localTrackPath(r.rel_path);
        // 与读取逻辑保持一致：集中歌词目录（新/旧命名）与音频同目录都算有歌词
        const lrc = findLrcPath(audio);
        const custom = path.join(config.downloadDir, 'lyrics',
          'custom-' + crypto.createHash('md5').update(r.id).digest('hex') + '.json');
        return {
          id: r.id, source: r.source, title: r.title, artist: r.artist,
          album: r.album, duration: r.duration, size: r.size, mime: r.mime,
          cover: r.cover || null,
          hasLyrics: Boolean(lrc) || fs.existsSync(custom),
        };
      }),
    };
  },

  resolve(trackId) {
    const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND source = 'local'").get(trackId);
    if (!row) return null;
    const filePath = localTrackPath(row.rel_path);
    if (!fs.existsSync(filePath)) return null;
    return { filePath, mime: row.mime, title: row.title, size: row.size };
  },
};
