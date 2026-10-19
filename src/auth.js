import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE_NAME = 'hwd_admin';
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failedLogins = new Map();

const sign = (value) => crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');

/** Constant-time comparison that does not leak the length of the expected value. */
function safeEqual(a, b) {
  const hash = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function isAuthenticated(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || !safeEqual(signature, sign(expires))) return false;
  return Number(expires) > Date.now();
}

export function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: `/${config.adminPath}`,
  };
}

export function startSession(req, res) {
  const expires = String(Date.now() + config.sessionMaxAgeMs);
  res.cookie(COOKIE_NAME, `${expires}.${sign(expires)}`, {
    ...cookieOptions(req),
    maxAge: config.sessionMaxAgeMs,
  });
}

export function endSession(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions(req));
}

export function isLockedOut(ip) {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (entry.until && entry.until < Date.now()) {
    failedLogins.delete(ip);
    return false;
  }
  return Boolean(entry.until);
}

export function checkCredentials(ip, username, password) {
  const ok = safeEqual(username ?? '', config.adminUsername) & safeEqual(password ?? '', config.adminPassword);
  if (ok) {
    failedLogins.delete(ip);
    return true;
  }
  const entry = failedLogins.get(ip) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_LOGINS) entry.until = Date.now() + LOCKOUT_MS;
  failedLogins.set(ip, entry);
  return false;
}
