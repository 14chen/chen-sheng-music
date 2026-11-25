import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL,
    rel_path    TEXT,
    title       TEXT,
    artist      TEXT,
    album       TEXT,
    duration    REAL,
    size        INTEGER,
    mime        TEXT,
    cover       TEXT,
    extra       TEXT,
    updated_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_tracks_source ON tracks(source);
  CREATE INDEX IF NOT EXISTS idx_tracks_title  ON tracks(title);
  CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
`);

const upsertSql = `
  INSERT INTO tracks
    (id, source, rel_path, title, artist, album, duration, size, mime, cover, extra, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    rel_path = excluded.rel_path,
    title = excluded.title,
    artist = excluded.artist,
    album = excluded.album,
    duration = excluded.duration,
    size = excluded.size,
    mime = excluded.mime,
    cover = excluded.cover,
    extra = excluded.extra,
    updated_at = excluded.updated_at
`;
const upsertStmt = db.prepare(upsertSql);

export function upsertTrack(t) {
  upsertStmt.run(
    t.id, t.source, t.rel_path, t.title, t.artist, t.album,
    t.duration, t.size, t.mime, t.cover, t.extra, t.updated_at,
  );
}
