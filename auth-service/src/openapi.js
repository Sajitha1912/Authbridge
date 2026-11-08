'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const config = require('./config');

/** The single source of truth for this service's HTTP API. */
const CONTRACT_PATH = path.join(config.rootDir, '..', 'contract', 'openapi.yaml');

function loadOpenApiDocument() {
  return yaml.load(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}

module.exports = { CONTRACT_PATH, loadOpenApiDocument };
