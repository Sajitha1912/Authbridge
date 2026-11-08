'use strict';

const { validationError } = require('./errors');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const registerSchema = {
  name: { required: true, minLength: 1, maxLength: 100 },
  email: { required: true, maxLength: 254, format: 'email' },
  password: { required: true, minLength: 8, maxLength: 128, trim: false },
};

const loginSchema = {
  email: { required: true, format: 'email' },
  password: { required: true, trim: false },
};

const updateSchema = {
  name: { minLength: 1, maxLength: 100 },
  email: { maxLength: 254, format: 'email' },
  password: { minLength: 8, maxLength: 128, trim: false },
};

const UPDATE_FIELDS = Object.keys(updateSchema);

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Minimal schema validator. Returns a list of { field, issue } details so the
 * response matches the contract's VALIDATION_ERROR shape.
 */
function collectDetails(schema, input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return [{ field: 'body', issue: 'must be a JSON object' }];
  }

  const details = [];

  for (const key of Object.keys(input)) {
    if (!hasOwn(schema, key)) details.push({ field: key, issue: 'is not allowed' });
  }

  for (const [field, rule] of Object.entries(schema)) {
    const value = input[field];

    if (value === undefined) {
      if (rule.required) details.push({ field, issue: 'is required' });
      continue;
    }
    if (typeof value !== 'string') {
      details.push({ field, issue: 'must be a string' });
      continue;
    }

    const comparable = rule.trim === false ? value : value.trim();
    if (rule.minLength && comparable.length < rule.minLength) {
      details.push({ field, issue: `must be at least ${rule.minLength} characters` });
    }
    if (rule.maxLength && comparable.length > rule.maxLength) {
      details.push({ field, issue: `must be at most ${rule.maxLength} characters` });
    }
    if (rule.format === 'email' && !EMAIL_PATTERN.test(comparable)) {
      details.push({ field, issue: 'must be a valid email address' });
    }
  }

  return details;
}

function assertValid(schema, input) {
  const details = collectDetails(schema, input);
  if (details.length) throw validationError(details);
}

function assertValidRegister(body) {
  assertValid(registerSchema, body);
}

function assertValidLogin(body) {
  assertValid(loginSchema, body);
}

/** PUT /users/{id}: a partial update, but at least one known field is required. */
function assertValidUpdate(body) {
  assertValid(updateSchema, body);
  const provided = UPDATE_FIELDS.filter((field) => hasOwn(body, field));
  if (!provided.length) {
    throw validationError([
      { field: 'body', issue: `at least one of ${UPDATE_FIELDS.join(', ')} must be provided` },
    ]);
  }
}

function parseUserId(raw) {
  const issue = [{ field: 'id', issue: 'must be a positive integer' }];
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw validationError(issue);
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw validationError(issue);
  return id;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

module.exports = {
  registerSchema,
  loginSchema,
  updateSchema,
  assertValidRegister,
  assertValidLogin,
  assertValidUpdate,
  parseUserId,
  normalizeEmail,
};
