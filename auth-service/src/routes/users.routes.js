'use strict';

const express = require('express');

const { emailTaken, isUniqueConstraintError, userNotFound } = require('../errors');
const { hashPassword } = require('../security');
const { assertValidUpdate, normalizeEmail, parseUserId } = require('../validate');
const { toPublicUser } = require('../db');
const { requireAuth } = require('../middleware');

/** GET /users/{id} */
function getUser(repo) {
  return (req, res, next) => {
    try {
      const id = parseUserId(req.params.id);
      const user = repo.findById(id);
      if (!user) throw userNotFound();

      res.json(toPublicUser(user));
    } catch (err) {
      next(err);
    }
  };
}

/** PUT /users/{id} */
function updateUser(repo) {
  return (req, res, next) => {
    try {
      const id = parseUserId(req.params.id);
      assertValidUpdate(req.body);

      const user = repo.findById(id);
      if (!user) throw userNotFound();

      const changes = {};

      if (req.body.name !== undefined) {
        changes.name = req.body.name.trim();
      }
      if (req.body.email !== undefined) {
        const email = normalizeEmail(req.body.email);
        const owner = repo.findByEmail(email);
        if (owner && owner.id !== id) throw emailTaken();
        changes.email = email;
      }
      if (req.body.password !== undefined) {
        changes.passwordHash = hashPassword(req.body.password);
      }

      let updated;
      try {
        updated = repo.update(id, changes);
      } catch (err) {
        if (isUniqueConstraintError(err)) throw emailTaken();
        throw err;
      }

      res.json(toPublicUser(updated));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = function createUsersRouter(repo) {
  const router = express.Router();
  router.get('/:id', requireAuth(repo), getUser(repo));
  router.put('/:id', requireAuth(repo), updateUser(repo));
  return router;
};
