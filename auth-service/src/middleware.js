'use strict';

const { AppError, ERROR_CODES, unauthorized } = require('./errors');
const { verifyToken } = require('./security');

function parseBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const parts = headerValue.split(' ');
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  if (scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Contract `bearerAuth`: the token must be present, well-formed, unexpired and
 * still resolve to an existing user.
 */
function requireAuth(repo) {
  return (req, res, next) => {
    try {
      const token = parseBearerToken(req.get('authorization'));
      if (!token) throw unauthorized();

      const payload = verifyToken(token);
      const user = repo.findById(Number(payload.sub));
      if (!user) throw unauthorized();

      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `Route not found: ${req.method} ${req.path}`,
    },
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

  if (err instanceof AppError) {
    return res.status(err.status).json(err.toBody());
  }

  console.error('[auth-service] unexpected error:', err);
  return res.status(500).json({
    error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
  });
}

module.exports = { requireAuth, notFoundHandler, errorHandler };
