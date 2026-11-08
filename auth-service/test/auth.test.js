'use strict';

process.env.NODE_ENV = 'test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const config = require('../src/config');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');

const DEMO = { email: 'ada@example.com', password: 'password123' };
const DEMO_USER_ID = 1;

let db;
let app;

before(() => {
  db = createDb(':memory:');
  app = createApp({ db });
});

after(() => {
  db.close();
});

function uniqueEmail(prefix) {
  return `${prefix}.${Math.random().toString(16).slice(2)}@example.com`;
}

/** Registers a throwaway user and returns { user, password }. */
async function registerUser(overrides = {}) {
  const payload = {
    name: 'Test User',
    email: uniqueEmail('user'),
    password: 'password123',
    ...overrides,
  };
  const res = await request(app).post('/auth/register').send(payload);
  assert.equal(res.status, 201, `expected registration to succeed: ${JSON.stringify(res.body)}`);
  return { user: res.body, password: payload.password };
}

/** Registers a user and logs in, returning a usable bearer token. */
async function authContext(overrides = {}) {
  const { user, password } = await registerUser(overrides);
  const res = await request(app).post('/auth/login').send({ email: user.email, password });
  assert.equal(res.status, 200);
  return { user, password, token: res.body.token };
}

function signToken(payload, options = {}) {
  return jwt.sign(payload, config.jwtSecret, {
    issuer: config.jwtIssuer,
    expiresIn: 3600,
    ...options,
  });
}

describe('GET /health', () => {
  it('reports the service as healthy', async () => {
    const res = await request(app).get('/health');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'auth-service');
    assert.equal(res.body.version, '1.0.0');
    assert.ok(!Number.isNaN(Date.parse(res.body.timestamp)));
  });
});

describe('POST /auth/register', () => {
  it('creates a user and returns the public shape', async () => {
    const email = uniqueEmail('create');
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Grace Hopper', email, password: 'password123' });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.id, 'number');
    assert.equal(res.body.name, 'Grace Hopper');
    assert.equal(res.body.email, email);
    assert.deepEqual(Object.keys(res.body).sort(), ['createdAt', 'email', 'id', 'name', 'updatedAt']);
    assert.ok(!Number.isNaN(Date.parse(res.body.createdAt)));
    assert.ok(!Number.isNaN(Date.parse(res.body.updatedAt)));
  });

  it('normalises the email to lower case', async () => {
    const email = uniqueEmail('MixedCase');
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Ada', email: email.toUpperCase(), password: 'password123' });

    assert.equal(res.status, 201);
    assert.equal(res.body.email, email.toLowerCase());
  });

  it('returns 409 when the email is already registered', async () => {
    const { user } = await registerUser();
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Someone Else', email: user.email, password: 'password123' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
    assert.equal(typeof res.body.error.message, 'string');
  });

  it('treats a differently-cased email as a duplicate', async () => {
    const { user } = await registerUser();
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Someone Else', email: user.email.toUpperCase(), password: 'password123' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request(app).post('/auth/register').send({ email: uniqueEmail('nos') });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    const fields = res.body.error.details.map((detail) => detail.field);
    assert.ok(fields.includes('name'));
    assert.ok(fields.includes('password'));
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Shorty', email: uniqueEmail('short'), password: 'short' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.some((detail) => detail.field === 'password'));
  });

  it('rejects an invalid email address', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Bad Email', email: 'not-an-email', password: 'password123' });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.some((detail) => detail.field === 'email'));
  });

  it('rejects unknown properties to honour additionalProperties: false', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Ada', email: uniqueEmail('extra'), password: 'password123', role: 'admin' });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.some((detail) => detail.field === 'role'));
  });

  it('rejects a malformed JSON body with 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"name": "Ada",');

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  it('returns a JWT for a seeded demo user', async () => {
    const res = await request(app).post('/auth/login').send(DEMO);

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, 'string');
    assert.equal(res.body.tokenType, 'Bearer');
    assert.equal(res.body.expiresIn, config.jwtExpiresInSeconds);
    assert.equal(res.body.user.email, DEMO.email);
    assert.equal(res.body.user.name, 'Ada Lovelace');

    const payload = jwt.verify(res.body.token, config.jwtSecret, { issuer: config.jwtIssuer });
    assert.equal(payload.sub, String(res.body.user.id));
  });

  it('returns 401 for a wrong password', async () => {
    const res = await request(app).post('/auth/login').send({ ...DEMO, password: 'wrong-password' });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  it('returns 401 for an unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: uniqueEmail('ghost'), password: 'password123' });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  it('returns 400 when the password is missing', async () => {
    const res = await request(app).post('/auth/login').send({ email: DEMO.email });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});

describe('GET /auth/validate', () => {
  it('returns the user for a valid token', async () => {
    const { token, user } = await authContext();
    const res = await request(app).get('/auth/validate').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.user.id, user.id);
    assert.equal(res.body.user.email, user.email);
  });

  it('returns 401 when the token is missing', async () => {
    const res = await request(app).get('/auth/validate');

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('returns 401 for a malformed bearer token', async () => {
    const res = await request(app).get('/auth/validate').set('Authorization', 'Bearer not-a-jwt');

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('returns 401 for a token signed with a different secret', async () => {
    const token = jwt.sign({ sub: String(DEMO_USER_ID) }, 'some-other-secret', {
      issuer: config.jwtIssuer,
      expiresIn: 3600,
    });
    const res = await request(app).get('/auth/validate').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('returns 401 TOKEN_EXPIRED for an expired token', async () => {
    const token = signToken({ sub: String(DEMO_USER_ID) }, { expiresIn: -10 });
    const res = await request(app).get('/auth/validate').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
  });

  it('returns 401 when the token subject no longer exists', async () => {
    const token = signToken({ sub: '424242' });
    const res = await request(app).get('/auth/validate').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });
});

describe('GET /users/{id}', () => {
  it('returns the user for a valid token', async () => {
    const { token, user } = await authContext();
    const res = await request(app).get(`/users/${user.id}`).set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.id, user.id);
    assert.equal(res.body.email, user.email);
    assert.equal(res.body.password_hash, undefined);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(`/users/${DEMO_USER_ID}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('returns 404 for an unknown user', async () => {
    const token = signToken({ sub: String(DEMO_USER_ID) });
    const res = await request(app).get('/users/987654').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'USER_NOT_FOUND');
  });

  it('returns 400 for a non-numeric id', async () => {
    const token = signToken({ sub: String(DEMO_USER_ID) });
    const res = await request(app).get('/users/abc').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});

describe('PUT /users/{id}', () => {
  it('updates the name', async () => {
    const { token, user } = await authContext();
    const res = await request(app)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ada Byron' });

    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Ada Byron');
    assert.equal(res.body.email, user.email);
  });

  it('updates the email', async () => {
    const { token, user } = await authContext();
    const nextEmail = uniqueEmail('renamed');
    const res = await request(app)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: nextEmail });

    assert.equal(res.status, 200);
    assert.equal(res.body.email, nextEmail);

    const login = await request(app).post('/auth/login').send({ email: nextEmail, password: 'password123' });
    assert.equal(login.status, 200);
  });

  it('updates the password and invalidates the old one', async () => {
    const { token, user } = await authContext();
    const res = await request(app)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'brand-new-password' });

    assert.equal(res.status, 200);

    const oldPassword = await request(app).post('/auth/login').send({ email: user.email, password: 'password123' });
    assert.equal(oldPassword.status, 401);

    const newPassword = await request(app).post('/auth/login').send({ email: user.email, password: 'brand-new-password' });
    assert.equal(newPassword.status, 200);
  });

  it('returns 409 when the new email belongs to someone else', async () => {
    const first = await authContext();
    const second = await authContext();

    const res = await request(app)
      .put(`/users/${second.user.id}`)
      .set('Authorization', `Bearer ${second.token}`)
      .send({ email: first.user.email });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  });

  it('allows a user to re-submit their own email', async () => {
    const { token, user } = await authContext();
    const res = await request(app)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: user.email });

    assert.equal(res.status, 200);
    assert.equal(res.body.email, user.email);
  });

  it('returns 400 for an empty body', async () => {
    const { token, user } = await authContext();
    const res = await request(app)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('returns 400 for an invalid email', async () => {
    const { token, user } = await authContext();
    const res = await request(app)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'nope' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('returns 401 without a token', async () => {
    const { user } = await authContext();
    const res = await request(app).put(`/users/${user.id}`).send({ name: 'Hacker' });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('returns 404 for an unknown user', async () => {
    const token = signToken({ sub: String(DEMO_USER_ID) });
    const res = await request(app)
      .put('/users/987654')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nobody' });

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'USER_NOT_FOUND');
  });
});

describe('unknown routes', () => {
  it('returns the error envelope with 404', async () => {
    const res = await request(app).get('/does-not-exist');

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});

describe('documentation', () => {
  it('serves Swagger UI on /docs', async () => {
    const res = await request(app).get('/docs/');

    assert.equal(res.status, 200);
    assert.match(res.text, /swagger-ui/);
  });
});
