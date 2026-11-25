// 统一读取访问口令：优先环境变量，其次 server/.env。
// 目的是避免把口令明文写进任何脚本或交付报告。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(HERE, '..', 'server', '.env');

let key = process.env.ACCESS_KEY || '';
if (!key) {
  try {
    const m = fs.readFileSync(ENV_PATH, 'utf-8').match(/^\s*ACCESS_KEY\s*=\s*(.+)\s*$/m);
    if (m) key = m[1].trim();
  } catch {}
}

export const KEY = key;
export const APP_BASE = process.env.APP_BASE || 'http://127.0.0.1:8082';
export const API_BASE = process.env.API_BASE || 'http://127.0.0.1:18080';
