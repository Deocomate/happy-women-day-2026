import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxAvatarBytes, files: 1 },
});

/** Detects the real image type from magic bytes instead of trusting the client mimetype. */
function detectImageExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return null;
}

/** Saves an uploaded avatar and returns its stored file name, or throws a user-facing error. */
export async function saveAvatar(file) {
  const ext = detectImageExt(file.buffer);
  if (!ext) throw new Error('Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF thôi nha');
  const fileName = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(config.uploadsDir, fileName), file.buffer);
  return fileName;
}

export async function deleteAvatar(fileName) {
  if (!fileName) return;
  await fs.rm(path.join(config.uploadsDir, path.basename(fileName)), { force: true });
}
