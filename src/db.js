import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });

const db = new DatabaseSync(config.dbFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS recipients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    avatar     TEXT,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

const stmt = {
  list: db.prepare('SELECT id, slug, name, avatar, created_at FROM recipients ORDER BY id DESC'),
  bySlug: db.prepare('SELECT id, slug, name, avatar FROM recipients WHERE slug = ?'),
  byId: db.prepare('SELECT id, slug, name, avatar FROM recipients WHERE id = ?'),
  slugExists: db.prepare('SELECT 1 FROM recipients WHERE slug = ?'),
  insert: db.prepare('INSERT INTO recipients (slug, name, avatar) VALUES (?, ?, ?)'),
  remove: db.prepare('DELETE FROM recipients WHERE id = ?'),
};

export const recipients = {
  list: () => stmt.list.all(),
  findBySlug: (slug) => stmt.bySlug.get(slug),
  findById: (id) => stmt.byId.get(id),
  slugExists: (slug) => Boolean(stmt.slugExists.get(slug)),
  create({ slug, name, avatar }) {
    const { lastInsertRowid } = stmt.insert.run(slug, name, avatar ?? null);
    return stmt.byId.get(lastInsertRowid);
  },
  remove: (id) => stmt.remove.run(id).changes > 0,
};
