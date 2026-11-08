'use strict';

/**
 * Error codes exposed by the service. The set matches the `Error.error.code`
 * enum in contract/openapi.yaml.
 */
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details && details.length) this.details = details;
  }

  toBody() {
    const error = { code: this.code, message: this.message };
    if (this.details) error.details = this.details;
    return { error };
  }
}

function validationError(details) {
  return new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', details);
}

function userNotFound() {
  return new AppError(404, ERROR_CODES.USER_NOT_FOUND, 'User not found');
}

function emailTaken() {
  return new AppError(409, ERROR_CODES.EMAIL_TAKEN, 'Email is already registered');
}

function unauthorized() {
  return new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Missing or invalid bearer token');
}

/**
 * Detects a UNIQUE constraint violation. Node's built-in `node:sqlite` reports
 * `code: ERR_SQLITE_ERROR` with `errcode` 2067 (UNIQUE) / 1555 (PRIMARY KEY),
 * while better-sqlite3 uses a `SQLITE_CONSTRAINT_*` code.
 */
function isUniqueConstraintError(err) {
  if (!err) return false;
  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) return true;
  if (err.errcode === 2067 || err.errcode === 1555) return true;
  return typeof err.message === 'string' && /UNIQUE constraint failed/i.test(err.message);
}

module.exports = {
  AppError,
  ERROR_CODES,
  validationError,
  userNotFound,
  emailTaken,
  unauthorized,
  isUniqueConstraintError,
};
