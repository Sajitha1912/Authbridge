'use strict';

const express = require('express');

const { notFound, validationError } = require('../errors');

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

module.exports = function createLoansRouter(repo) {
  const router = express.Router();

  /** GET /api/loans — the signed-in user's loans only */
  router.get('/', (req, res) => {
    res.json({ loans: repo.listLoansForUser(req.user.id) });
  });

  /** POST /api/loans/:id/return */
  router.post('/:id/return', (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      const returned = repo.returnLoan(loanId, req.user.id);

      if (!returned) throw notFound(`Open loan ${loanId} not found for this user`);

      res.json({ loan: repo.findLoan(loanId) });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
