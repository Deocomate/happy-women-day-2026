import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { recipients, users } from './db.js';
import { uniqueSlug } from '../public/shared/slug.js';
import { avatarUpload, saveAvatar, deleteAvatar } from './avatar-upload.js';
import {
  currentUser, requireAuth, requireOwner, startSession, endSession, isLockedOut, login,
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
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const base = `/${config.adminPath}`;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
// JSON embedded in <script> must not be able to close the tag.
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
// Changes on every deploy so browsers drop the 1h-cached /static files instead of mixing old JS with new HTML.
const assetVersion = Date.now().toString(36);
const render = (name, vars = {}) => templates[name].replace(
  /\{\{(\w+)\}\}/g,
  (_, key) => ({ ASSET_VERSION: assetVersion, ...vars })[key] ?? '',
);
const avatarUrl = (fileName) => (fileName ? `/uploads/${fileName}` : null);
const toDto = (r) => ({ ...r, avatar: avatarUrl(r.avatar) });

function renderGift(recipient) {
  const name = recipient?.name ?? '';
  return render('gift', {
    TITLE: escapeHtml(name ? `Có hoa gửi ${name} nè 💐` : 'Có hoa gửi bạn nè 💐'),
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
  const user = currentUser(req);
  if (!user) return res.send(render('login', { BASE: base, ERROR: '' }));
  res.send(render('admin', {
    BASE: base,
    USERNAME: escapeHtml(user.username),
    IS_OWNER: user.is_owner ? 'true' : 'false',
  }));
});

admin.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
  const showError = (status, message) => res.status(status).send(
    render('login', { BASE: base, ERROR: `<p class="error" role="alert">${message}</p>` }),
  );
  if (isLockedOut(req.ip)) return showError(429, 'Sai hơi nhiều lần rồi, đợi 15 phút rồi thử lại nha.');
  const user = login(req.ip, req.body?.username, req.body?.password);
  if (!user) return showError(401, 'Sai tài khoản hoặc mật khẩu rồi, kiểm tra lại giúp mình nhé.');
  startSession(req, res, user);
  res.redirect(303, base);
});

admin.post('/logout', (req, res) => {
  endSession(req, res);
  res.redirect(303, base);
});

const api = express.Router();
api.use(requireAuth, express.json({ limit: '4kb' }));

/** Returns an error message, or null when the password is acceptable. */
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return `Mật khẩu dài quá, tối đa ${MAX_PASSWORD_LENGTH} ký tự thôi`;
  return null;
}

api.put('/me/password', (req, res) => {
  if (req.user.is_owner) {
    return res.status(400).json({ error: 'Mật khẩu chủ app được đặt bằng biến ADMIN_PASSWORD' });
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (!users.authenticate(req.user.username, currentPassword)) {
    return res.status(400).json({ error: 'Mật khẩu hiện tại chưa đúng' });
  }
  const problem = passwordProblem(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  users.setPassword(req.user.id, newPassword);
  // The token_version bump signs out every other device; re-issue the cookie to keep this one.
  startSession(req, res, users.findById(req.user.id));
  res.status(204).end();
});

api.get('/recipients', (req, res) => {
  res.json(recipients.listFor(req.user.id).map(toDto));
});

api.post('/recipients', avatarUpload.single('avatar'), async (req, res) => {
  const name = String(req.body?.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return res.status(400).json({ error: 'Nhập tên người nhận trước đã nhé' });
  if (name.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Tên dài quá, tối đa ${MAX_NAME_LENGTH} ký tự thôi` });
  }

  let avatar = null;
  try {
    if (req.file) avatar = await saveAvatar(req.file);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const slug = uniqueSlug(name, (s) => RESERVED_SLUGS.has(s) || recipients.slugExists(s));
  res.status(201).json(toDto(recipients.create(req.user.id, { slug, name, avatar })));
});

api.delete('/recipients/:id', async (req, res) => {
  const recipient = recipients.findForUser(Number(req.params.id), req.user.id);
  if (!recipient) return res.status(404).json({ error: 'Không tìm thấy người này' });
  recipients.removeForUser(recipient.id, req.user.id);
  await deleteAvatar(recipient.avatar);
  res.status(204).end();
});

// ---- Account management, owner only ----
const toUserDto = (u) => ({
  id: u.id,
  username: u.username,
  isOwner: Boolean(u.is_owner),
  recipientCount: u.recipient_count ?? 0,
  createdAt: u.created_at,
});

/** Loads the account in :id, refusing the owner account, which is managed through env vars. */
function findManagedUser(req, res) {
  const user = users.findById(Number(req.params.id));
  if (!user) {
    res.status(404).json({ error: 'Không tìm thấy tài khoản này' });
    return null;
  }
  if (user.is_owner) {
    res.status(400).json({ error: 'Tài khoản chủ app không sửa ở đây được' });
    return null;
  }
  return user;
}

api.get('/users', requireOwner, (req, res) => {
  res.json(users.list().map(toUserDto));
});

api.post('/users', requireOwner, (req, res) => {
  const username = String(req.body?.username ?? '').trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    return res.status(400).json({
      error: 'Tên đăng nhập dài 3 đến 32 ký tự, chỉ dùng chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới',
    });
  }
  if (users.usernameExists(username)) return res.status(409).json({ error: 'Tên đăng nhập này có người dùng rồi' });
  const problem = passwordProblem(req.body?.password);
  if (problem) return res.status(400).json({ error: problem });
  res.status(201).json(toUserDto(users.create(username, req.body.password)));
});

api.put('/users/:id/password', requireOwner, (req, res) => {
  const user = findManagedUser(req, res);
  if (!user) return;
  const problem = passwordProblem(req.body?.password);
  if (problem) return res.status(400).json({ error: problem });
  users.setPassword(user.id, req.body.password);
  res.status(204).end();
});

api.delete('/users/:id', requireOwner, async (req, res) => {
  const user = findManagedUser(req, res);
  if (!user) return;
  const avatars = users.remove(user.id) ?? [];
  await Promise.all(avatars.map(deleteAvatar));
  res.status(204).end();
});

admin.use('/api', api);

admin.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `Ảnh nặng quá, tối đa ${config.maxAvatarBytes / 1024 / 1024}MB thôi`
      : 'File tải lên không hợp lệ';
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
  res.status(500).type('text').send('Có gì đó trục trặc rồi, thử lại sau nhé');
});

app.listen(config.port, () => {
  console.log(`Gift server listening on port ${config.port}`);
});
