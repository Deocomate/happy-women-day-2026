import { slugify } from '/static/shared/slug.js';

const AVATAR_SIZE = 512;
const base = document.body.dataset.base;
const isOwner = document.body.dataset.owner === 'true';
const api = `${base}/api/recipients`;
const usersApi = `${base}/api/users`;
const $ = (id) => document.getElementById(id);

const form = $('create-form');
const nameInput = $('name-input');
const avatarInput = $('avatar-input');
const avatarPreview = $('avatar-preview');
const avatarClear = $('avatar-clear');
const formError = $('form-error');
const createBtn = $('create-btn');
const list = $('list');
let avatarBlob = null;

const giftUrl = (slug) => `${location.origin}/${slug}`;

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

async function request(url, options) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  if (res.status === 401) {
    location.reload();
    throw new Error('Phiên đăng nhập hết hạn rồi, đăng nhập lại nhé');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Có gì đó trục trặc, thử lại giúp mình nha');
  }
  return res.status === 204 ? null : res.json();
}

const sendJson = (url, method, body) => request(url, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const tmp = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(tmp);
    tmp.select();
    document.execCommand('copy');
    tmp.remove();
  }
  toast('Đã copy link');
}

/** Center-crops any browser-decodable image to a square JPEG so uploads stay small. */
async function toSquareJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(AVATAR_SIZE, side);
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    canvas.getContext('2d').drawImage(
      img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size,
    );
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function setAvatar(blob) {
  avatarBlob = blob;
  avatarClear.hidden = !blob;
  avatarPreview.replaceChildren();
  if (blob) {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    img.alt = '';
    avatarPreview.append(img);
  } else {
    avatarPreview.innerHTML = '<span class="avatar-placeholder">＋</span>';
    avatarInput.value = '';
  }
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

function renderItem(r) {
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.id = r.id;

  const avatar = r.avatar ? document.createElement('img') : document.createElement('span');
  avatar.className = 'item-avatar';
  if (r.avatar) {
    avatar.src = r.avatar;
    avatar.alt = '';
    avatar.loading = 'lazy';
  } else {
    avatar.textContent = r.name.trim().charAt(0).toUpperCase();
  }

  const body = document.createElement('div');
  body.className = 'item-body';
  const name = Object.assign(document.createElement('div'), { className: 'item-name', textContent: r.name });
  const link = Object.assign(document.createElement('a'), {
    className: 'item-link', href: giftUrl(r.slug), target: '_blank', rel: 'noopener', textContent: `/${r.slug}`,
  });
  body.append(name, link);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  const copyBtn = Object.assign(document.createElement('button'), {
    type: 'button', className: 'btn btn-ghost btn-small', textContent: 'Copy',
  });
  copyBtn.addEventListener('click', () => copy(giftUrl(r.slug)));
  const deleteBtn = Object.assign(document.createElement('button'), {
    type: 'button', className: 'btn btn-danger btn-small', textContent: 'Xoá',
  });
  deleteBtn.addEventListener('click', () => removeRecipient(r, li));
  actions.append(copyBtn, deleteBtn);

  li.append(avatar, body, actions);
  return li;
}

function updateCount() {
  const count = list.children.length;
  $('count').textContent = count;
  $('empty').hidden = count > 0;
}

async function loadList() {
  const items = await request(api);
  list.replaceChildren(...items.map(renderItem));
  updateCount();
}

async function removeRecipient(r, li) {
  if (!confirm(`Xoá link tặng hoa của "${r.name}"? Người nhận sẽ không mở được nữa.`)) return;
  try {
    await request(`${api}/${r.id}`, { method: 'DELETE' });
    li.remove();
    updateCount();
    toast('Đã xoá');
  } catch (err) {
    toast(err.message);
  }
}

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  showError('');
  try {
    setAvatar(await toSquareJpeg(file));
  } catch {
    setAvatar(null);
    showError('Ảnh này app không đọc được, thử ảnh JPG hoặc PNG xem sao.');
  }
});

avatarClear.addEventListener('click', () => setAvatar(null));

nameInput.addEventListener('input', () => {
  const value = nameInput.value.trim();
  $('slug-preview').textContent = value ? `/${slugify(value)}` : '/…';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showError('Nhập tên người nhận trước đã nhé');
    nameInput.focus();
    return;
  }
  showError('');
  createBtn.disabled = true;

  const data = new FormData();
  data.append('name', name);
  if (avatarBlob) data.append('avatar', avatarBlob, 'avatar.jpg');

  try {
    const created = await request(api, { method: 'POST', body: data });
    list.prepend(renderItem(created));
    updateCount();
    $('created-name').textContent = created.name;
    $('created-link').value = giftUrl(created.slug);
    $('created').hidden = false;
    form.reset();
    setAvatar(null);
    $('slug-preview').textContent = '/…';
  } catch (err) {
    showError(err.message);
  } finally {
    createBtn.disabled = false;
  }
});

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-copy-target]');
  if (target) copy($(target.dataset.copyTarget).value);
});

// ---- Passwords: your own, or an account the owner manages ----
const passwordDialog = $('password-dialog');
const passwordError = $('password-error');
let passwordTarget = null;

function openPasswordDialog(account) {
  passwordTarget = account;
  $('password-title').textContent = account ? `Đặt lại mật khẩu cho ${account.username}` : 'Đổi mật khẩu';
  $('current-password-field').hidden = Boolean(account);
  $('password-form').reset();
  passwordError.hidden = true;
  passwordDialog.showModal();
  (account ? $('new-password') : $('current-password')).focus();
}

$('password-cancel').addEventListener('click', () => passwordDialog.close());

$('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('password-submit');
  submit.disabled = true;
  passwordError.hidden = true;
  const newPassword = $('new-password').value;
  try {
    if (passwordTarget) {
      await sendJson(`${usersApi}/${passwordTarget.id}/password`, 'PUT', { password: newPassword });
      toast(`Đã đặt lại mật khẩu cho ${passwordTarget.username}`);
    } else {
      await sendJson(`${base}/api/me/password`, 'PUT', { currentPassword: $('current-password').value, newPassword });
      toast('Đổi mật khẩu xong rồi');
    }
    passwordDialog.close();
  } catch (err) {
    passwordError.textContent = err.message;
    passwordError.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

const changePasswordBtn = $('change-password');
changePasswordBtn.hidden = isOwner;
changePasswordBtn.addEventListener('click', () => openPasswordDialog(null));

// ---- Accounts, owner only ----
const accountList = $('account-list');
const accountError = $('account-error');

function renderAccount(account) {
  const li = document.createElement('li');
  li.className = 'item';

  const avatar = Object.assign(document.createElement('span'), {
    className: 'item-avatar', textContent: account.username.charAt(0).toUpperCase(),
  });
  const body = document.createElement('div');
  body.className = 'item-body';
  const name = Object.assign(document.createElement('div'), { className: 'item-name', textContent: account.username });
  const meta = Object.assign(document.createElement('div'), {
    className: 'item-meta',
    textContent: account.isOwner ? 'Chủ app' : `${account.recipientCount} người nhận`,
  });
  body.append(name, meta);
  li.append(avatar, body);

  if (!account.isOwner) {
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const resetBtn = Object.assign(document.createElement('button'), {
      type: 'button', className: 'btn btn-ghost btn-small', textContent: 'Đặt lại mật khẩu',
    });
    resetBtn.addEventListener('click', () => openPasswordDialog(account));
    const deleteBtn = Object.assign(document.createElement('button'), {
      type: 'button', className: 'btn btn-danger btn-small', textContent: 'Xoá',
    });
    deleteBtn.addEventListener('click', () => removeAccount(account, li));
    actions.append(resetBtn, deleteBtn);
    li.append(actions);
  }
  return li;
}

function updateAccountCount() {
  $('account-count').textContent = accountList.children.length;
}

async function loadAccounts() {
  const accounts = await request(usersApi);
  accountList.replaceChildren(...accounts.map(renderAccount));
  updateAccountCount();
}

async function removeAccount(account, li) {
  const warning = `Xoá tài khoản "${account.username}"? Toàn bộ ${account.recipientCount} link tặng hoa của tài khoản này cũng mất luôn.`;
  if (!confirm(warning)) return;
  try {
    await request(`${usersApi}/${account.id}`, { method: 'DELETE' });
    li.remove();
    updateAccountCount();
    toast('Đã xoá tài khoản');
  } catch (err) {
    toast(err.message);
  }
}

$('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('account-btn');
  submit.disabled = true;
  accountError.hidden = true;
  try {
    const created = await sendJson(usersApi, 'POST', {
      username: $('account-username').value,
      password: $('account-password').value,
    });
    accountList.append(renderAccount(created));
    updateAccountCount();
    event.target.reset();
    toast(`Đã tạo tài khoản ${created.username}`);
  } catch (err) {
    accountError.textContent = err.message;
    accountError.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

if (isOwner) {
  $('accounts').hidden = false;
  loadAccounts().catch((err) => toast(err.message));
}

loadList().catch((err) => toast(err.message));
