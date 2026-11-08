'use strict';

const config = require('./config');
const { createApp } = require('./app');

const app = createApp();

app.listen(config.port, () => {
  console.log(`${config.serviceName} v${config.serviceVersion} listening on http://localhost:${config.port}`);
  console.log(`UI:           http://localhost:${config.port}/dashboard.html`);
  console.log(`Database:     ${config.dbPath}`);
  console.log(`Auth service: ${config.authServiceUrl}`);
});
