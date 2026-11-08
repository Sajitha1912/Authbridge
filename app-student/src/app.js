'use strict';

const express = require('express');

const config = require('./config');
const { createCourseRepository, createDb, seedDemoCourses } = require('./db');
const { errorHandler, notFoundHandler, requireAuth } = require('./middleware');
const createSessionRouter = require('./routes/session.routes');
const createCoursesRouter = require('./routes/courses.routes');
const createEnrollmentsRouter = require('./routes/enrollments.routes');
const createProfileRouter = require('./routes/profile.routes');

/**
 * Builds the app-student Express application. The database is injected so it
 * can be swapped for an in-memory instance.
 */
function createApp(options = {}) {
  const db = options.db || createDb(options.dbPath);
  if (options.seed !== false) seedDemoCourses(db);

  const repo = createCourseRepository(db);
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: config.serviceName,
      version: config.serviceVersion,
      timestamp: new Date().toISOString(),
    });
  });

  // Public: the browser signs in here; the credentials go straight to auth-service.
  app.use('/api/session', createSessionRouter());

  // Protected: every route below re-validates the bearer token against auth-service.
  app.use('/api/courses', requireAuth, createCoursesRouter(repo));
  app.use('/api/enrollments', requireAuth, createEnrollmentsRouter(repo));
  app.use('/api/profile', requireAuth, createProfileRouter());

  // The UI is served by this same process (same origin as the API).
  app.get('/', (req, res) => res.redirect('/dashboard.html'));
  app.use(express.static(config.publicDir, { extensions: ['html'] }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
