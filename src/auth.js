import crypto from 'node:crypto';
import { config } from './config.js';
import { users } from './db.js';

const COOKIE_NAME = 'hwd_session';
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

/** Returns the signed-in user, or null. Cookie format: "<userId>.<tokenVersion>.<expires>.<signature>". */
export function currentUser(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  const [userId, version, expires, signature] = token.split('.');
  const payload = `${userId}.${version}.${expires}`;
  if (!signature || !safeEqual(signature, sign(payload)) || Number(expires) <= Date.now()) return null;
  const user = users.findById(Number(userId));
  return user && user.token_version === Number(version) ? user : null;
}

export function requireAuth(req, res, next) {
  req.user = currentUser(req);
  if (req.user) return next();
  res.status(401).json({ error: 'Phiên đăng nhập hết hạn rồi, đăng nhập lại nhé' });
}

export function requireOwner(req, res, next) {
  if (req.user?.is_owner) return next();
  res.status(403).json({ error: 'Chỉ chủ app mới làm được việc này' });
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: `/${config.adminPath}`,
  };
}

export function startSession(req, res, user) {
  const expires = Date.now() + config.sessionMaxAgeMs;
  const payload = `${user.id}.${user.token_version}.${expires}`;
  res.cookie(COOKIE_NAME, `${payload}.${sign(payload)}`, {
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

/** Returns the user for valid credentials; counts failures per IP for the lockout. */
export function login(ip, username, password) {
  const user = users.authenticate(username, password);
  if (user) {
    failedLogins.delete(ip);
    return user;
  }
  const entry = failedLogins.get(ip) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_LOGINS) entry.until = Date.now() + LOCKOUT_MS;
  failedLogins.set(ip, entry);
  return null;
}
