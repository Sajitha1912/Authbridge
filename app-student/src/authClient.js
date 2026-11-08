'use strict';

const config = require('./config');

/**
 * Thin HTTP client for the shared auth/user service.
 *
 * app-student has no authentication code of its own: no password hashing, no
 * token decoding, no user table. Every credential check, token check and
 * profile read/write is an HTTP call to auth-service implementing
 * /contract/openapi.yaml.
 */
class AuthServiceError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AuthServiceError';
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

async function callAuthService(pathname, { method = 'GET', token, body } = {}) {
  const url = new URL(pathname, `${config.authServiceUrl}/`);
  const headers = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.authServiceTimeoutMs),
    });
  } catch (err) {
    throw new AuthServiceError(
      503,
      'AUTH_SERVICE_UNAVAILABLE',
      `Auth service is unreachable at ${config.authServiceUrl}`,
    );
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (err) {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = (payload && payload.error) || {};
    throw new AuthServiceError(
      response.status,
      error.code || 'AUTH_SERVICE_ERROR',
      error.message || `Auth service responded with ${response.status}`,
      error.details,
    );
  }

  return payload;
}

/** POST /auth/login -> { token, tokenType, expiresIn, user } */
function login(email, password) {
  return callAuthService('/auth/login', { method: 'POST', body: { email, password } });
}

/** GET /auth/validate -> { valid, user } */
function validate(token) {
  return callAuthService('/auth/validate', { token });
}

/** GET /users/{id} -> user */
function getUser(id, token) {
  return callAuthService(`/users/${encodeURIComponent(id)}`, { token });
}

/** PUT /users/{id} -> updated user (patch may contain name and/or email) */
function updateUser(id, patch, token) {
  return callAuthService(`/users/${encodeURIComponent(id)}`, { method: 'PUT', token, body: patch });
}

module.exports = { AuthServiceError, login, validate, getUser, updateUser };
