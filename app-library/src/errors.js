'use strict';

/**
 * Error codes used by app-library. Codes coming back from auth-service
 * (INVALID_CREDENTIALS, EMAIL_TAKEN, TOKEN_EXPIRED, USER_NOT_FOUND, ...) are
 * passed through untouched.
 */
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  NOT_FOUND: 'NOT_FOUND',
  NO_COPIES_AVAILABLE: 'NO_COPIES_AVAILABLE',
  AUTH_SERVICE_UNAVAILABLE: 'AUTH_SERVICE_UNAVAILABLE',
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

const notFound = (message = 'Resource not found') =>
  new AppError(404, ERROR_CODES.NOT_FOUND, message);

const unauthorized = (message = 'Missing or invalid bearer token') =>
  new AppError(401, ERROR_CODES.UNAUTHORIZED, message);

const validationError = (details) =>
  new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', details);

module.exports = { AppError, ERROR_CODES, notFound, unauthorized, validationError };
