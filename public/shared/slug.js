const FALLBACK_SLUG = 'nguoi-dac-biet';

/** Turns a Vietnamese name into an ASCII kebab-case slug: "Nguyễn Thị Đào" -> "nguyen-thi-dao". */
export function slugify(name) {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || FALLBACK_SLUG;
}

/** Appends -2, -3, ... until the slug is neither taken nor reserved. */
export function uniqueSlug(name, isTaken) {
  const base = slugify(name);
  let candidate = base;
  for (let n = 2; isTaken(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}
