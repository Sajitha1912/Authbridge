'use strict';

const express = require('express');

const authClient = require('../authClient');
const { validationError } = require('../errors');

const EDITABLE_FIELDS = ['name', 'email'];

/** Builds the auth-service payload from the request body, ignoring anything else. */
function buildPatch(body) {
  const patch = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) patch[field] = body[field];
  }
  return patch;
}

module.exports = function createProfileRouter() {
  const router = express.Router();

  /** GET /api/profile — profile read from the auth service */
  router.get('/', (req, res, next) => {
    authClient
      .getUser(req.user.id, req.token)
      .then((user) => res.json({ user }))
      .catch(next);
  });

  /** PUT /api/profile — name/email update delegated to PUT /users/{id} */
  router.put('/', (req, res, next) => {
    const body = req.body || {};
    const patch = buildPatch(body);

    if (!Object.keys(patch).length) {
      next(
        validationError([
          { field: 'body', issue: `at least one of ${EDITABLE_FIELDS.join(', ')} must be provided` },
        ]),
      );
      return;
    }

    authClient
      .updateUser(req.user.id, patch, req.token)
      .then((user) => res.json({ user }))
      .catch(next);
  });

  return router;
};
