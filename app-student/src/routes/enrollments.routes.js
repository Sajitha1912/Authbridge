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

module.exports = function createEnrollmentsRouter(repo) {
  const router = express.Router();

  /** GET /api/enrollments — the signed-in user's enrollments only */
  router.get('/', (req, res) => {
    res.json({ enrollments: repo.listEnrollmentsForUser(req.user.id) });
  });

  /** POST /api/enrollments/:id/drop */
  router.post('/:id/drop', (req, res, next) => {
    try {
      const enrollmentId = parseId(req.params.id);
      const dropped = repo.drop(enrollmentId, req.user.id);

      if (!dropped) throw notFound(`Active enrollment ${enrollmentId} not found for this user`);

      res.json({ enrollment: repo.findEnrollment(enrollmentId) });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
