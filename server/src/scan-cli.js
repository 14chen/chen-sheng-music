import { scanLibrary } from './library.js';
import { config } from './config.js';

console.log(`扫描曲库: ${config.musicDir}`);
const r = await scanLibrary();
console.log(`完成: ${r.total} 首曲目`);
