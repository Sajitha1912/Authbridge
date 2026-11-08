'use strict';

const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

function resolveDbPath(value) {
  if (!value) return path.join(rootDir, 'student.db');
  if (value === ':memory:') return value;
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

const config = {
  rootDir,
  publicDir: path.join(rootDir, 'public'),
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5002),
  authServiceUrl: (process.env.AUTH_SERVICE_URL || 'http://localhost:4000').replace(/\/+$/, ''),
  authServiceTimeoutMs: Number(process.env.AUTH_SERVICE_TIMEOUT_MS || 5000),
  dbPath: resolveDbPath(process.env.DB_PATH || 'student.db'),
  serviceName: 'app-student',
  serviceVersion: '1.0.0',
};

module.exports = config;
