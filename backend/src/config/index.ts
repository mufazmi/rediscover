import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, '.secret');

function loadOrGenerateSecret(): string {
  // Check APP_SECRET environment variable first
  if (process.env.APP_SECRET) {
    return process.env.APP_SECRET;
  }
  
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  // Check if .secret file exists
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  }
  
  // Generate new 64-character hexadecimal secret
  const secret = crypto.randomBytes(32).toString('hex');
  
  // Write to .secret file with 0600 permissions
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  
  console.log('[Config] Generated new app secret and saved to', SECRET_FILE);
  
  return secret;
}

export const config = {
  port: parseInt(process.env.PORT ?? '6377', 10),
  nodeEnv: process.env.NODE_ENV ?? 'production',
  dataDir: DATA_DIR,
  databasePath: process.env.DATABASE_PATH ?? path.join(DATA_DIR, 'rediscover.db'),
  appSecret: loadOrGenerateSecret(),
  jwtExpiration: process.env.JWT_EXPIRATION ?? '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:6378',
};
