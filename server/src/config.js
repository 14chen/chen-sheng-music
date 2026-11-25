import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  musicDir: process.env.MUSIC_DIR
    ? path.resolve(process.env.MUSIC_DIR)
    : path.resolve(process.cwd(), 'music'),
  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(process.cwd(), 'data', 'library.db'),
  downloadDir: process.env.DOWNLOAD_DIR
    ? path.resolve(process.env.DOWNLOAD_DIR)
    : path.resolve(process.cwd(), 'downloads'),
  // 对外基址：用于生成返回给客户端的绝对 URL（避免反射客户端 Host 头）
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  accessKey: process.env.ACCESS_KEY || '',
  autoScanInterval: Number(process.env.AUTO_SCAN_INTERVAL || 15),
  jamendo: {
    clientId: process.env.JAMENDO_CLIENT_ID || '',
    enabled: Boolean(process.env.JAMENDO_CLIENT_ID),
  },
};
