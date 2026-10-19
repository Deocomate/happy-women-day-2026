import { slugify } from '/static/shared/slug.js';

const AVATAR_SIZE = 512;
const base = document.body.dataset.base;
const api = `${base}/api/recipients`;
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
    throw new Error('Phiên đăng nhập đã hết hạn');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Có lỗi xảy ra, vui lòng thử lại');
  }
  return res.status === 204 ? null : res.json();
}

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
  toast('Đã sao chép đường dẫn');
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
    type: 'button', className: 'btn btn-ghost btn-small', textContent: 'Sao chép',
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
  if (!confirm(`Xoá đường dẫn tặng hoa cho "${r.name}"? Người nhận sẽ không mở được nữa.`)) return;
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
    showError('Không đọc được ảnh này. Hãy thử ảnh JPG hoặc PNG.');
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
    showError('Vui lòng nhập tên người nhận');
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

loadList().catch((err) => toast(err.message));
