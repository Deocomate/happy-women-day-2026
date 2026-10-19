import { createBouquet } from './bouquet.js';
import { createPetalSky } from './petal-sky.js';

const TYPE_SPEED_MS = 38;
const MUSIC_URL = '/static/musics/2026.mp3';
const MUSIC_VOLUME = 0.8;
const MUSIC_FADE_MS = 2500;
const gift = window.__GIFT__ || {};
const hasName = Boolean(gift.name?.trim());
const name = hasName ? gift.name.trim() : 'bạn';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const letterWish = `Chúc ${name} một ngày 20/10 thật rực rỡ 🌸 Mong ${name} luôn xinh đẹp, bình an và hạnh phúc — `
  + 'mỗi ngày đều dịu dàng như những đóa hoa, và luôn có thật nhiều yêu thương ở bên 💖';
const gardenWish = `Gửi tặng ${name} cả một mùa hoa — vì ${name} xứng đáng với những điều dịu dàng nhất.`;

const $ = (id) => document.getElementById(id);
const intro = $('intro');
const letter = $('letter');
const garden = $('garden');
const envelope = $('envelope');
const wishEl = $('wish');
const receiveBtn = $('receive');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : ms));
const centerOf = (node) => {
  const box = node.getBoundingClientRect();
  return [box.left + box.width / 2, box.top + box.height / 2];
};

document.querySelectorAll('.js-name').forEach((node) => { node.textContent = name; });
$('garden-wish').textContent = gardenWish;

const letterAvatar = $('letter-avatar');
if (gift.avatar) {
  const img = new Image();
  img.src = gift.avatar;
  img.alt = name;
  letterAvatar.append(img);
} else {
  letterAvatar.textContent = hasName ? Array.from(name)[0].toUpperCase() : '❀';
}

const sky = createPetalSky($('sky'), { reducedMotion });
sky.setDensity(0.35);

const bouquet = createBouquet({
  avatarUrl: gift.avatar,
  initial: hasName ? Array.from(name)[0].toUpperCase() : '♥',
});
$('bouquet').append(bouquet.svg);

const music = new Audio(MUSIC_URL);
music.loop = true;
music.preload = 'auto';

/** Must run inside a tap handler: browsers only allow audio started by a user gesture. */
function startMusic() {
  music.volume = 0;
  music.play().catch(() => {});
  const startedAt = performance.now();
  const fadeIn = (now) => {
    const progress = Math.min(1, (now - startedAt) / MUSIC_FADE_MS);
    music.volume = MUSIC_VOLUME * progress;
    if (progress < 1) requestAnimationFrame(fadeIn);
  };
  requestAnimationFrame(fadeIn);
}

function goTo(from, to) {
  from.classList.add('is-leaving');
  from.classList.remove('is-active');
  to.classList.add('is-active');
}

function typeWish() {
  return new Promise((resolve) => {
    const chars = Array.from(letterWish);
    let index = 0;
    let timer = 0;
    const finish = () => {
      clearInterval(timer);
      wishEl.textContent = letterWish;
      wishEl.classList.remove('is-typing');
      letter.removeEventListener('click', finish);
      resolve();
    };
    if (reducedMotion) return finish();
    wishEl.classList.add('is-typing');
    letter.addEventListener('click', finish);
    timer = setInterval(() => {
      index += 1;
      wishEl.textContent = chars.slice(0, index).join('');
      if (index >= chars.length) finish();
    }, TYPE_SPEED_MS);
  });
}

envelope.addEventListener('click', async () => {
  if (envelope.classList.contains('is-open')) return;
  envelope.classList.add('is-open');
  intro.classList.add('is-opening');
  startMusic();
  sky.burst(...centerOf(envelope.querySelector('.env-seal')), 18, 0.6);
  await wait(1500);
  goTo(intro, letter);
  await wait(800);
  await typeWish();
  receiveBtn.classList.add('is-visible');
  receiveBtn.focus({ preventScroll: true });
});

receiveBtn.addEventListener('click', async () => {
  receiveBtn.disabled = true;
  sky.burst(...centerOf(receiveBtn), 40, 1.1);
  goTo(letter, garden);
  sky.setDensity(1);
  await wait(500);
  bouquet.play();
  await wait(bouquet.duration * 1000 - 1200);
  garden.classList.add('is-revealed');
  sky.burst(...centerOf($('bouquet')), 50, 1.4);
});

$('bouquet').addEventListener('pointerdown', (event) => {
  sky.burst(event.clientX, event.clientY, 18, 0.8);
});
