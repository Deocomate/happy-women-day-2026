import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { hashPassword, verifyPassword } from './password.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });

const db = new DatabaseSync(config.dbFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    is_owner      INTEGER NOT NULL DEFAULT 0,
    -- Bumped on every password change so older session cookies stop working.
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS recipients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    avatar     TEXT,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

/** The ADMIN_USERNAME/ADMIN_PASSWORD account owns the app and is re-synced from env on every start. */
function syncOwner() {
  const owner = db.prepare('SELECT id, password_hash FROM users WHERE is_owner = 1').get();
  if (!owner) {
    return Number(db.prepare('INSERT INTO users (username, password_hash, is_owner) VALUES (?, ?, 1)')
      .run(config.adminUsername, hashPassword(config.adminPassword)).lastInsertRowid);
  }
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(config.adminUsername, owner.id);
  if (!verifyPassword(config.adminPassword, owner.password_hash)) {
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
      .run(hashPassword(config.adminPassword), owner.id);
  }
  return owner.id;
}

const ownerId = syncOwner();

let backedUp = false;
/** Adds a column once; the first schema change of a start backs up a non-empty database. */
function ensureColumn(table, column, definition) {
  if (db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column)) return false;
  if (!backedUp && db.prepare('SELECT 1 FROM recipients LIMIT 1').get()) {
    const backup = path.join(config.dataDir, `gifts.before-migration.${Date.now()}.db`);
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    console.log(`[db] Backed up database to ${backup}`);
  }
  backedUp = true;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

// Recipients created before accounts existed belong to the owner.
if (ensureColumn('recipients', 'user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE')) {
  db.prepare('UPDATE recipients SET user_id = ? WHERE user_id IS NULL').run(ownerId);
}
db.exec('CREATE INDEX IF NOT EXISTS recipients_user_id ON recipients (user_id)');
// Custom wishes: NULL falls back to the account's wish, then to the app default.
for (const table of ['users', 'recipients']) {
  ensureColumn(table, 'letter_wish', 'TEXT');
  ensureColumn(table, 'garden_wish', 'TEXT');
}

// Verified against unknown usernames so a login takes the same time whether the account exists or not.
const DUMMY_HASH = hashPassword(crypto.randomUUID());
const USER_COLUMNS = 'id, username, is_owner, token_version, created_at';
const RECIPIENT_COLUMNS = 'id, slug, name, avatar, letter_wish, garden_wish, created_at';

const stmt = {
  listUsers: db.prepare(`SELECT ${USER_COLUMNS},
    (SELECT COUNT(*) FROM recipients r WHERE r.user_id = users.id) AS recipient_count
    FROM users ORDER BY is_owner DESC, id`),
  userById: db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`),
  userCredentials: db.prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE username = ?`),
  usernameExists: db.prepare('SELECT 1 FROM users WHERE username = ?'),
  insertUser: db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)'),
  setPassword: db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?'),
  removeUser: db.prepare('DELETE FROM users WHERE id = ? AND is_owner = 0'),
  userWishes: db.prepare('SELECT letter_wish, garden_wish FROM users WHERE id = ?'),
  setUserWishes: db.prepare('UPDATE users SET letter_wish = ?, garden_wish = ? WHERE id = ?'),

  giftBySlug: db.prepare(`SELECT r.name, r.avatar,
    COALESCE(r.letter_wish, u.letter_wish) AS letter_wish, COALESCE(r.garden_wish, u.garden_wish) AS garden_wish
    FROM recipients r JOIN users u ON u.id = r.user_id WHERE r.slug = ?`),
  setRecipientWishes: db.prepare('UPDATE recipients SET letter_wish = ?, garden_wish = ? WHERE id = ? AND user_id = ?'),
  listRecipients: db.prepare(`SELECT ${RECIPIENT_COLUMNS} FROM recipients WHERE user_id = ? ORDER BY id DESC`),
  avatarsOfUser: db.prepare('SELECT avatar FROM recipients WHERE user_id = ? AND avatar IS NOT NULL'),
  recipientOfUser: db.prepare(`SELECT ${RECIPIENT_COLUMNS} FROM recipients WHERE id = ? AND user_id = ?`),
  recipientById: db.prepare(`SELECT ${RECIPIENT_COLUMNS} FROM recipients WHERE id = ?`),
  slugExists: db.prepare('SELECT 1 FROM recipients WHERE slug = ?'),
  insertRecipient: db.prepare(`INSERT INTO recipients (user_id, slug, name, avatar, letter_wish, garden_wish)
    VALUES (?, ?, ?, ?, ?, ?)`),
  removeRecipient: db.prepare('DELETE FROM recipients WHERE id = ? AND user_id = ?'),
};

export const users = {
  list: () => stmt.listUsers.all(),
  findById: (id) => stmt.userById.get(id),
  /** Returns the user only when the password matches. */
  authenticate(username, password) {
    const row = stmt.userCredentials.get(String(username ?? '').trim());
    if (!verifyPassword(password, row?.password_hash ?? DUMMY_HASH) || !row) return null;
    const { password_hash: _, ...user } = row;
    return user;
  },
  usernameExists: (username) => Boolean(stmt.usernameExists.get(username)),
  create(username, password) {
    const { lastInsertRowid } = stmt.insertUser.run(username, hashPassword(password));
    return stmt.userById.get(lastInsertRowid);
  },
  setPassword: (id, password) => stmt.setPassword.run(hashPassword(password), id).changes > 0,
  /** Deletes a non-owner account with all its recipients; returns their avatar files for cleanup. */
  remove(id) {
    const avatars = stmt.avatarsOfUser.all(id).map((r) => r.avatar);
    return stmt.removeUser.run(id).changes > 0 ? avatars : null;
  },
  wishesOf: (id) => stmt.userWishes.get(id),
  setWishes: (id, { letterWish, gardenWish }) => stmt.setUserWishes.run(letterWish, gardenWish, id),
};

// Every query that reads or deletes is scoped by the owning user, so accounts never see each other's data.
export const recipients = {
  listFor: (userId) => stmt.listRecipients.all(userId),
  /** Public gift data with the recipient's own wishes, falling back to the sender account's. */
  findGiftBySlug: (slug) => stmt.giftBySlug.get(slug),
  findForUser: (id, userId) => stmt.recipientOfUser.get(id, userId),
  slugExists: (slug) => Boolean(stmt.slugExists.get(slug)),
  create(userId, { slug, name, avatar, letterWish, gardenWish }) {
    const { lastInsertRowid } = stmt.insertRecipient.run(userId, slug, name, avatar ?? null, letterWish, gardenWish);
    return stmt.recipientById.get(lastInsertRowid);
  },
  setWishesForUser(id, userId, { letterWish, gardenWish }) {
    stmt.setRecipientWishes.run(letterWish, gardenWish, id, userId);
    return stmt.recipientOfUser.get(id, userId);
  },
  removeForUser: (id, userId) => stmt.removeRecipient.run(id, userId).changes > 0,
};
