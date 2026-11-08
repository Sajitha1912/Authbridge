'use strict';

const express = require('express');

const authClient = require('../authClient');
const { validationError } = require('../errors');

/**
 * POST /api/session/login
 *
 * The browser posts credentials here; app-student forwards them to
 * auth-service via authClient and returns the JWT. No password is stored,
 * compared or hashed in this application.
 */
function login(req, res, next) {
  const { email, password } = req.body || {};
  const details = [];

  if (typeof email !== 'string' || !email.trim()) details.push({ field: 'email', issue: 'is required' });
  if (typeof password !== 'string' || !password) details.push({ field: 'password', issue: 'is required' });
  if (details.length) {
    next(validationError(details));
    return;
  }

  authClient
    .login(email.trim().toLowerCase(), password)
    .then((session) => res.json(session))
    .catch(next);
}

module.exports = function createSessionRouter() {
  const router = express.Router();
  router.post('/login', login);
  return router;
};
