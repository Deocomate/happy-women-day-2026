import crypto from 'node:crypto';
import path from 'node:path';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const adminPath = required('ADMIN_PATH').replace(/^\/+|\/+$/g, '');
if (!/^[a-zA-Z0-9_-]{6,64}$/.test(adminPath)) {
  console.error('[config] ADMIN_PATH must be 6-64 characters of letters, digits, "-" or "_"');
  process.exit(1);
}

const sessionSecret = process.env.SESSION_SECRET?.trim();
if (!sessionSecret) {
  console.warn('[config] SESSION_SECRET is not set; admin sessions will reset on every restart');
}

const dataDir = path.resolve(process.env.DATA_DIR || 'data');

export const config = {
  port: Number(process.env.PORT) || 3000,
  adminPath,
  adminUsername: required('ADMIN_USERNAME'),
  adminPassword: required('ADMIN_PASSWORD'),
  sessionSecret: sessionSecret || crypto.randomBytes(32).toString('hex'),
  sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  dbFile: path.join(dataDir, 'gifts.db'),
  maxAvatarBytes: 5 * 1024 * 1024,
};
