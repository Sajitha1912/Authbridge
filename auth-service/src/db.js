'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const config = require('./config');
const { hashPassword } = require('./security');

/**
 * Schema for users.db. This database is owned exclusively by the auth service;
 * no other application opens it.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL,
  email         TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
`;

/** Two accounts so the demo apps have something to log in with. */
const DEMO_USERS = [
  { name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' },
  { name: 'Alan Turing', email: 'alan@example.com', password: 'password123' },
];

/** Username is an internal handle derived from the email; it is not part of the API. */
function deriveUsername(email) {
  const local = String(email).split('@')[0] || 'user';
  const cleaned = local.replace(/[^a-z0-9._-]/gi, '').toLowerCase();
  return cleaned || 'user';
}

/** Maps a database row to the contract's `User` schema (never leaks the hash). */
function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createDb(dbPath = config.dbPath) {
  const inMemory = dbPath === ':memory:';

  if (!inMemory) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  if (!inMemory) db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);

  return db;
}

function createUserRepository(db) {
  const insert = db.prepare(`
    INSERT INTO users (username, email, name, password_hash, created_at, updated_at)
    VALUES (@username, @email, @name, @password_hash, @created_at, @updated_at)
  `);
  const selectById = db.prepare('SELECT * FROM users WHERE id = ?');
  const selectByEmail = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
  const countAll = db.prepare('SELECT COUNT(*) AS total FROM users');

  function create({ username, email, name, passwordHash }) {
    const now = new Date().toISOString();
    const info = insert.run({
      username,
      email,
      name,
      password_hash: passwordHash,
      created_at: now,
      updated_at: now,
    });
    return selectById.get(Number(info.lastInsertRowid));
  }

  function update(id, changes) {
    const assignments = [];
    const params = { id };

    if (changes.name !== undefined) {
      assignments.push('name = @name');
      params.name = changes.name;
    }
    if (changes.email !== undefined) {
      assignments.push('email = @email');
      params.email = changes.email;
    }
    if (changes.passwordHash !== undefined) {
      assignments.push('password_hash = @password_hash');
      params.password_hash = changes.passwordHash;
    }
    if (!assignments.length) return selectById.get(id);

    assignments.push('updated_at = @updated_at');
    params.updated_at = new Date().toISOString();

    db.prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = @id`).run(params);
    return selectById.get(id);
  }

  return {
    create,
    update,
    findById: (id) => selectById.get(id),
    findByEmail: (email) => selectByEmail.get(email),
    count: () => countAll.get().total,
  };
}

/** Seeds the demo accounts once, only when the table is empty. */
function seedDemoUsers(db) {
  const repo = createUserRepository(db);
  let created = 0;

  if (repo.count() > 0) return created;

  for (const demo of DEMO_USERS) {
    repo.create({
      username: deriveUsername(demo.email),
      email: demo.email,
      name: demo.name,
      passwordHash: hashPassword(demo.password),
    });
    created += 1;
  }

  return created;
}

module.exports = {
  DEMO_USERS,
  createDb,
  createUserRepository,
  seedDemoUsers,
  toPublicUser,
  deriveUsername,
};
