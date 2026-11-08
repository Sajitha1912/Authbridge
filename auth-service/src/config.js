'use strict';

const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

function resolveDbPath(value) {
  if (!value) return path.join(rootDir, 'users.db');
  if (value === ':memory:') return value;
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

const config = {
  rootDir,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.AUTH_JWT_SECRET,
  jwtIssuer: 'auth-service',
  jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN_SECONDS || 86400),
  dbPath: resolveDbPath(process.env.DB_PATH || 'users.db'),
  serviceName: 'auth-service',
  serviceVersion: '1.0.0',
};

module.exports = config;
