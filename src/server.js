import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { recipients } from './db.js';
import { uniqueSlug } from '../public/shared/slug.js';
import { avatarUpload, saveAvatar, deleteAvatar } from './avatar-upload.js';
import {
  isAuthenticated, requireAuth, startSession, endSession, isLockedOut, checkCredentials,
} from './auth.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewsDir = path.join(rootDir, 'views');
const templates = Object.fromEntries(
  ['gift', 'login', 'admin', 'not-found'].map((name) => [
    name,
    fs.readFileSync(path.join(viewsDir, `${name}.html`), 'utf8'),
  ]),
);

const RESERVED_SLUGS = new Set([config.adminPath, 'static', 'uploads', 'healthz', 'robots.txt', 'favicon.ico']);
const MAX_NAME_LENGTH = 80;
const base = `/${config.adminPath}`;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
// JSON embedded in <script> must not be able to close the tag.
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const render = (name, vars = {}) => templates[name].replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
const avatarUrl = (fileName) => (fileName ? `/uploads/${fileName}` : null);
const toDto = (r) => ({ ...r, avatar: avatarUrl(r.avatar) });

function renderGift(recipient) {
  const name = recipient?.name ?? '';
  return render('gift', {
    TITLE: escapeHtml(name ? `Một bó hoa dành tặng ${name} 💐` : 'Chúc mừng ngày Phụ nữ Việt Nam 20/10 💐'),
    GIFT_JSON: safeJson({ name, avatar: avatarUrl(recipient?.avatar) }),
  });
}

const app = express();
app.disable('x-powered-by');
// One reverse-proxy hop (Coolify's Traefik/Caddy); keeps req.ip and req.secure trustworthy.
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  next();
});

app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'));
app.use('/static', express.static(path.join(rootDir, 'public'), { maxAge: '1h', index: false }));
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d', index: false }));

// ---- Hidden admin area (path comes from ADMIN_PATH) ----
const admin = express.Router();
admin.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

admin.get('/', (req, res) => {
  if (isAuthenticated(req)) return res.send(render('admin', { BASE: base }));
  res.send(render('login', { BASE: base, ERROR: '' }));
});

admin.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
  const showError = (status, message) => res.status(status).send(
    render('login', { BASE: base, ERROR: `<p class="error" role="alert">${message}</p>` }),
  );
  if (isLockedOut(req.ip)) return showError(429, 'Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau 15 phút.');
  if (!checkCredentials(req.ip, req.body?.username, req.body?.password)) {
    return showError(401, 'Tài khoản hoặc mật khẩu không đúng.');
  }
  startSession(req, res);
  res.redirect(303, base);
});

admin.post('/logout', (req, res) => {
  endSession(req, res);
  res.redirect(303, base);
});

admin.get('/api/recipients', requireAuth, (req, res) => {
  res.json(recipients.list().map(toDto));
});

admin.post('/api/recipients', requireAuth, avatarUpload.single('avatar'), async (req, res) => {
  const name = String(req.body?.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên người nhận' });
  if (name.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Tên tối đa ${MAX_NAME_LENGTH} ký tự` });
  }

  let avatar = null;
  try {
    if (req.file) avatar = await saveAvatar(req.file);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const slug = uniqueSlug(name, (s) => RESERVED_SLUGS.has(s) || recipients.slugExists(s));
  res.status(201).json(toDto(recipients.create({ slug, name, avatar })));
});

admin.delete('/api/recipients/:id', requireAuth, async (req, res) => {
  const recipient = recipients.findById(Number(req.params.id));
  if (!recipient) return res.status(404).json({ error: 'Không tìm thấy người nhận' });
  recipients.remove(recipient.id);
  await deleteAvatar(recipient.avatar);
  res.status(204).end();
});

admin.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `Ảnh tối đa ${config.maxAvatarBytes / 1024 / 1024}MB`
      : 'Tệp tải lên không hợp lệ';
    return res.status(400).json({ error: message });
  }
  next(err);
});

app.use(base, admin);

// ---- Public gift pages ----
app.get('/', (req, res) => res.send(renderGift(null)));

app.get('/:slug', (req, res, next) => {
  const recipient = recipients.findBySlug(req.params.slug.toLowerCase());
  if (!recipient) return next();
  res.send(renderGift(recipient));
});

app.use((req, res) => res.status(404).send(render('not-found')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).type('text').send('Đã có lỗi xảy ra');
});

app.listen(config.port, () => {
  console.log(`Gift server listening on port ${config.port}`);
});
