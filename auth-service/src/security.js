'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const config = require('./config');
const { AppError, ERROR_CODES } = require('./errors');

/**
 * Password hashing and storage.
 *
 * This is a purely internal concern of the auth service: no other component
 * knows how passwords are stored. The stored format is versioned so the scheme
 * can be swapped without changing the HTTP contract — and therefore without
 * touching app-library or app-student.
 *
 * Scheme: Node's built-in scrypt (replacing bcrypt), stored as
 *   scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>
 */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 64;
const SALT_BYTES = 16;

function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(plainPassword, salt, KEY_BYTES, SCRYPT_PARAMS);

  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

function verifyPassword(plainPassword, storedHash) {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(storedHash).split('$');
    if (scheme !== 'scrypt') return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = crypto.scryptSync(plainPassword, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch (err) {
    return false;
  }
}

function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, config.jwtSecret, {
    issuer: config.jwtIssuer,
    expiresIn: config.jwtExpiresInSeconds,
  });
}

/**
 * Verifies signature, expiry and issuer. Throws AppError(401) so the error
 * handler renders the contract's error envelope.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { issuer: config.jwtIssuer });
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      throw new AppError(401, ERROR_CODES.TOKEN_EXPIRED, 'Token has expired');
    }
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Missing or invalid bearer token');
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
