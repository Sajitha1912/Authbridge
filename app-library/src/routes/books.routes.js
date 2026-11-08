'use strict';

const express = require('express');

const { AppError, ERROR_CODES, notFound, validationError } = require('../errors');

function parseId(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw validationError([{ field: 'id', issue: 'must be a positive integer' }]);
  }
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw validationError([{ field: 'id', issue: 'must be a positive integer' }]);
  }
  return id;
}

module.exports = function createBooksRouter(repo) {
  const router = express.Router();

  /** GET /api/books — catalogue with live availability */
  router.get('/', (req, res) => {
    res.json({ books: repo.listBooks() });
  });

  /** POST /api/books/:id/loans — borrow a copy for the current user */
  router.post('/:id/loans', (req, res, next) => {
    try {
      const bookId = parseId(req.params.id);
      const book = repo.findBook(bookId);

      if (!book) throw notFound(`Book ${bookId} not found`);
      if (book.availableCopies < 1) {
        throw new AppError(409, ERROR_CODES.NO_COPIES_AVAILABLE, `No copies of "${book.title}" are available`);
      }

      const loanId = repo.borrow(bookId, req.user.id);
      res.status(201).json({ loan: repo.findLoan(loanId) });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
