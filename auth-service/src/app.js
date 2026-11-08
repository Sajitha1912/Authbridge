'use strict';

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const config = require('./config');
const { createDb, createUserRepository, seedDemoUsers } = require('./db');
const createAuthRouter = require('./routes/auth.routes');
const createUsersRouter = require('./routes/users.routes');
const { errorHandler, notFoundHandler } = require('./middleware');
const { loadOpenApiDocument } = require('./openapi');

/**
 * Builds the Express app. The database is injected so tests can use an
 * in-memory instance without touching users.db.
 */
function createApp(options = {}) {
  const db = options.db || createDb(options.dbPath);
  if (options.seed !== false) seedDemoUsers(db);

  const repo = createUserRepository(db);
  const app = express();

  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: config.serviceName,
      version: config.serviceVersion,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/auth', createAuthRouter(repo));
  app.use('/users', createUsersRouter(repo));

  // Interactive documentation generated from contract/openapi.yaml
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(loadOpenApiDocument()));

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
