import { localSource } from './local.js';
import { jamendoSource } from './jamendo.js';
import { musicFreeSources, getMusicFreeSource } from '../musicfree-sources.js';

// 已移除 iTunes 试听、元力KG 与"自定义音乐源"功能。
// 在线音源：音源J（Jamendo CC）/ 音源B / 音源W / 音源K / 音源N / 音源Q
export const sources = [localSource, jamendoSource, ...musicFreeSources];

export function getSource(id) {
  return sources.find((s) => s.id === id) || getMusicFreeSource(id) || null;
}

export function listSources() {
  return sources.map((s) => ({ id: s.id, name: s.name, enabled: s.enabled }));
}
