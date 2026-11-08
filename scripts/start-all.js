'use strict';

/**
 * Starts the whole SOA demo stack with a single command: `npm run start:all`.
 *
 * Each service is a child process running its own `src/server.js`. They share
 * nothing but the HTTP contract exposed by auth-service.
 */

const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

const SERVICES = [
  { name: 'auth-service', dir: 'auth-service', port: 4000, url: 'http://localhost:4000/docs' },
  { name: 'app-library', dir: 'app-library', port: 5001, url: 'http://localhost:5001/login.html' },
  { name: 'app-student', dir: 'app-student', port: 5002, url: 'http://localhost:5002/login.html' },
];

const children = [];
let shuttingDown = false;

function pipeWithPrefix(name, stream) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line.length) console.log(`[${name}] ${line}`);
    }
  });
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nStopping all services...');
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(exitCode), 300);
}

function start(service) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(ROOT, service.dir),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pipeWithPrefix(service.name, child.stdout);
  pipeWithPrefix(service.name, child.stderr);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[${service.name}] exited unexpectedly (code=${code}, signal=${signal})`);
    shutdown(typeof code === 'number' ? code : 1);
  });

  children.push(child);
}

console.log('Starting SOA demo stack (Ctrl+C to stop all):\n');
for (const service of SERVICES) {
  start(service);
  console.log(`  ${service.name.padEnd(13)} http://localhost:${service.port}`);
}
console.log('');

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
