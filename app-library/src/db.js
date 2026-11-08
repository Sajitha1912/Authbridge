'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const config = require('./config');

/**
 * library.db is owned exclusively by app-library and holds ONLY domain data.
 * There are exactly two tables, and neither of them stores credentials:
 * users live in auth-service's users.db and are referenced by id only.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  author       TEXT    NOT NULL,
  isbn         TEXT    NOT NULL UNIQUE,
  copies_total INTEGER NOT NULL DEFAULT 1 CHECK (copies_total >= 0),
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS loans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES books (id),
  user_id     INTEGER NOT NULL,             -- logical reference to auth-service users.id
  borrowed_at TEXT    NOT NULL,
  returned_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_loans_user_active ON loans (user_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_loans_book_active ON loans (book_id, returned_at);
`;

const DEMO_BOOKS = [
  { title: 'Structure and Interpretation of Computer Programs', author: 'Abelson & Sussman', isbn: '9780262510875', copiesTotal: 3 },
  { title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', isbn: '9781449373320', copiesTotal: 2 },
  { title: 'The Pragmatic Programmer', author: 'Hunt & Thomas', isbn: '9780135957059', copiesTotal: 4 },
  { title: 'Refactoring', author: 'Martin Fowler', isbn: '9780134757599', copiesTotal: 2 },
  { title: 'Introduction to Algorithms', author: 'Cormen et al.', isbn: '9780262046305', copiesTotal: 5 },
  { title: 'A Pattern Language', author: 'Christopher Alexander', isbn: '9780195019193', copiesTotal: 1 },
];

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

function seedDemoBooks(db) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM books').get();
  if (total > 0) return 0;

  const insert = db.prepare(`
    INSERT INTO books (title, author, isbn, copies_total, created_at)
    VALUES (@title, @author, @isbn, @copies_total, @created_at)
  `);
  const now = new Date().toISOString();

  for (const book of DEMO_BOOKS) {
    insert.run({
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      copies_total: book.copiesTotal,
      created_at: now,
    });
  }

  return DEMO_BOOKS.length;
}

/** Maps a books row (plus computed availability) to the API shape. */
function toPublicBook(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    copiesTotal: row.copies_total,
    availableCopies: Number(row.available_copies),
  };
}

/** Maps a loans row (joined with its book) to the API shape. */
function toPublicLoan(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    bookTitle: row.book_title,
    bookAuthor: row.book_author,
    userId: row.user_id,
    borrowedAt: row.borrowed_at,
    returnedAt: row.returned_at,
  };
}

const BOOKS_WITH_AVAILABILITY = `
  SELECT b.*,
         (b.copies_total - COALESCE((
           SELECT COUNT(*) FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL
         ), 0)) AS available_copies
  FROM books b
`;

const LOANS_WITH_BOOK = `
  SELECT l.*, b.title AS book_title, b.author AS book_author
  FROM loans l
  JOIN books b ON b.id = l.book_id
`;

function createLibraryRepository(db) {
  const listBooksStmt = db.prepare(`${BOOKS_WITH_AVAILABILITY} ORDER BY b.title`);
  const bookByIdStmt = db.prepare(`${BOOKS_WITH_AVAILABILITY} WHERE b.id = ?`);
  const insertLoanStmt = db.prepare(`
    INSERT INTO loans (book_id, user_id, borrowed_at) VALUES (@book_id, @user_id, @borrowed_at)
  `);
  const returnLoanStmt = db.prepare(`
    UPDATE loans SET returned_at = @returned_at
    WHERE id = @id AND user_id = @user_id AND returned_at IS NULL
  `);
  const loansByUserStmt = db.prepare(`${LOANS_WITH_BOOK} WHERE l.user_id = ? ORDER BY l.id DESC`);

  return {
    listBooks: () => listBooksStmt.all().map(toPublicBook),
    findBook: (id) => {
      const row = bookByIdStmt.get(id);
      return row ? toPublicBook(row) : null;
    },
    listLoansForUser: (userId) => loansByUserStmt.all(userId).map(toPublicLoan),
    borrow: (bookId, userId) => {
      const info = insertLoanStmt.run({
        book_id: bookId,
        user_id: userId,
        borrowed_at: new Date().toISOString(),
      });
      return Number(info.lastInsertRowid);
    },
    findLoan: (loanId) => {
      const row = db
        .prepare(`${LOANS_WITH_BOOK} WHERE l.id = ?`)
        .get(loanId);
      return row ? toPublicLoan(row) : null;
    },
    returnLoan: (loanId, userId) => {
      const info = returnLoanStmt.run({
        id: loanId,
        user_id: userId,
        returned_at: new Date().toISOString(),
      });
      return Number(info.changes) > 0;
    },
  };
}

module.exports = { createDb, createLibraryRepository, seedDemoBooks, toPublicBook, toPublicLoan };
