'use strict';

const express = require('express');

const config = require('../config');
const {
  AppError,
  ERROR_CODES,
  emailTaken,
  isUniqueConstraintError,
} = require('../errors');
const { hashPassword, signToken, verifyPassword } = require('../security');
const { assertValidLogin, assertValidRegister, normalizeEmail } = require('../validate');
const { deriveUsername, toPublicUser } = require('../db');
const { requireAuth } = require('../middleware');

/** POST /auth/register */
function register(repo) {
  return (req, res, next) => {
    try {
      assertValidRegister(req.body);

      const email = normalizeEmail(req.body.email);
      if (repo.findByEmail(email)) throw emailTaken();

      let user;
      try {
        user = repo.create({
          username: deriveUsername(email),
          email,
          name: req.body.name.trim(),
          passwordHash: hashPassword(req.body.password),
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) throw emailTaken();
        throw err;
      }

      res.status(201).json(toPublicUser(user));
    } catch (err) {
      next(err);
    }
  };
}

/** POST /auth/login */
function login(repo) {
  return (req, res, next) => {
    try {
      assertValidLogin(req.body);

      const user = repo.findByEmail(normalizeEmail(req.body.email));
      if (!user || !verifyPassword(req.body.password, user.password_hash)) {
        throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');
      }

      res.json({
        token: signToken(user),
        tokenType: 'Bearer',
        expiresIn: config.jwtExpiresInSeconds,
        user: toPublicUser(user),
      });
    } catch (err) {
      next(err);
    }
  };
}

/** GET /auth/validate */
function validate(repo) {
  return [
    requireAuth(repo),
    (req, res) => {
      res.json({ valid: true, user: toPublicUser(req.user) });
    },
  ];
}

module.exports = function createAuthRouter(repo) {
  const router = express.Router();
  router.post('/register', register(repo));
  router.post('/login', login(repo));
  router.get('/validate', ...validate(repo));
  return router;
};
