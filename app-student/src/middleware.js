'use strict';

const authClient = require('./authClient');
const { ERROR_CODES, unauthorized } = require('./errors');

function parseBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const parts = headerValue.split(' ');
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  if (scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Protected-route guard. app-student keeps no local session state: on every
 * protected request the bearer token is validated by auth-service, which also
 * returns the user. A 401 from the service is propagated as-is.
 */
function requireAuth(req, res, next) {
  const token = parseBearerToken(req.get('authorization'));

  if (!token) {
    next(unauthorized());
    return;
  }

  authClient
    .validate(token)
    .then((result) => {
      req.token = token;
      req.user = result.user;
      next();
    })
    .catch(next);
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: ERROR_CODES.NOT_FOUND, message: `Route not found: ${req.method} ${req.path}` },
  });
}

/* eslint-disable-next-line no-unused-vars */
function errorHandler(err, req, res, next) {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'body', issue: 'must be valid JSON' }],
      },
    });
  }

  // App errors and errors relayed from auth-service share one envelope, so the
  // UI needs a single error path.
  if (err && typeof err.status === 'number' && typeof err.code === 'string') {
    const body = { error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;
    return res.status(err.status).json(body);
  }

  console.error('[app-student] unexpected error:', err);
  return res.status(500).json({
    error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
  });
}

module.exports = { requireAuth, notFoundHandler, errorHandler };
