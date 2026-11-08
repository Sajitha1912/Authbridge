'use strict';

/**
 * Drives a real browser (installed Chrome/Edge via puppeteer-core) through the
 * SOA demo and saves screenshots to docs/screenshots.
 *
 * Usage:
 *   node scripts/screenshots.js --phase=main          (default)
 *   node scripts/screenshots.js --phase=decoupled     (app-library stopped)
 *   node scripts/screenshots.js --phase=post-change   (after auth-service change)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots');

const URLS = {
  auth: 'http://localhost:4000',
  library: 'http://localhost:5001',
  student: 'http://localhost:5002',
};

const CREDS = { email: 'ada@example.com', password: 'password123' };
const RENAMED = 'Ada Lovelace (renamed in app-library)';

const phaseArg = process.argv.find((a) => a.startsWith('--phase='));
const PHASE = phaseArg ? phaseArg.split('=')[1] : 'main';

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found. Set CHROME_PATH to a Chromium executable.');
  return found;
}

async function shot(page, fileName) {
  const file = path.join(OUT_DIR, fileName);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved docs/screenshots/${fileName}`);
}

function waitForDashboard(page) {
  return page.waitForFunction(() => location.pathname.endsWith('/dashboard.html'), { timeout: 20000 });
}

function waitForGreeting(page) {
  return page.waitForFunction(
    () => {
      const el = document.querySelector('#greeting');
      return !!el && /^Welcome, .+/.test(el.textContent.trim());
    },
    { timeout: 20000 },
  );
}

/** Signs in through an app's own login page and waits for its dashboard. */
async function loginThrough(page, base, creds = CREDS) {
  await page.goto(`${base}/login.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#email');
  await page.type('#email', creds.email);
  await page.type('#password', creds.password);
  await Promise.all([waitForDashboard(page), page.click('#submit')]);
  await waitForGreeting(page);
}

async function readStudentAccount(page) {
  return {
    name: await page.$eval('#user-name', (el) => el.textContent.trim()),
    email: await page.$eval('#user-email', (el) => el.textContent.trim()),
  };
}

async function runMain(browser) {
  const page = await browser.newPage();

  // Step 1 — app-library sign-in page.
  await page.goto(`${URLS.library}/login.html`, { waitUntil: 'networkidle0' });
  await shot(page, '01-library-login.png');

  // Step 2 — sign in and land on the dashboard.
  await page.type('#email', CREDS.email);
  await page.type('#password', CREDS.password);
  await Promise.all([waitForDashboard(page), page.click('#submit')]);
  await waitForGreeting(page);
  const before = await page.$eval('#greeting', (el) => el.textContent.trim());
  await shot(page, '02-library-dashboard.png');

  // Step 3 — change the display name on the profile page.
  await page.goto(`${URLS.library}/profile.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => {
    const el = document.querySelector('#name');
    return !!el && el.value.trim().length > 0;
  }, { timeout: 20000 });
  await shot(page, '03-library-profile-before.png');

  await page.click('#name', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#name', RENAMED);
  await page.click('#save');
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#notice');
      return !!el && el.classList.contains('success');
    },
    { timeout: 20000 },
  );
  await shot(page, '04-library-profile-after-rename.png');

  // Step 4 — open app-student and sign in with the same credentials.
  await page.goto(`${URLS.student}/login.html`, { waitUntil: 'networkidle0' });
  await shot(page, '05-student-login.png');
  await page.type('#email', CREDS.email);
  await page.type('#password', CREDS.password);
  await Promise.all([waitForDashboard(page), page.click('#submit')]);
  await waitForGreeting(page);
  await shot(page, '06-student-dashboard-renamed.png');

  const account = await readStudentAccount(page);
  console.log(`\nRESULT: library greeting was "${before}"`);
  console.log(`RESULT: app-student shows name="${account.name}" email="${account.email}"`);
  if (account.name !== RENAMED) {
    throw new Error(`Expected app-student to show "${RENAMED}" but saw "${account.name}"`);
  }
  if (account.email !== CREDS.email) {
    throw new Error(`Expected app-student to show "${CREDS.email}" but saw "${account.email}"`);
  }
  console.log('OK: app-student reflects the name changed in app-library with no change to app-student.\n');

  await page.close();
}

async function runDecoupled(browser) {
  const page = await browser.newPage();

  // app-library is stopped: app-student must still work end to end.
  await loginThrough(page, URLS.student);
  await shot(page, '07-app-student-works-library-down.png');
  const account = await readStudentAccount(page);

  // The auth service still answers on its own.
  await page.goto(`${URLS.auth}/health`, { waitUntil: 'domcontentloaded' });
  await shot(page, '08-auth-service-health-library-down.png');

  console.log(`\nRESULT: with app-library stopped, app-student still works (name="${account.name}").`);
  console.log('OK: app-student + auth-service are unaffected by app-library being down.\n');

  await page.close();
}

async function runPostChange(browser) {
  const page = await browser.newPage();

  // Both apps must still authenticate after the auth service changed its
  // internal password hashing. Neither app was modified.
  await loginThrough(page, URLS.student);
  await shot(page, '09-app-student-after-auth-change.png');
  const account = await readStudentAccount(page);

  await loginThrough(page, URLS.library);
  await shot(page, '10-app-library-after-auth-change.png');
  const libraryGreeting = await page.$eval('#greeting', (el) => el.textContent.trim());

  console.log(`\nRESULT: after the auth-service hashing change, app-student logs in as "${account.name}".`);
  console.log(`RESULT: after the auth-service hashing change, app-library logs in -> "${libraryGreeting}".`);
  console.log('OK: both apps kept working without any change to their code.\n');

  await page.close();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soa-shots-'));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    userDataDir,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      // Keep Chromium from touching system caches (GPU shaders, OS spellcheck).
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-spell-checking',
      '--disable-features=WinUseBrowserSpellChecker,Translate,OptimizationHints,MediaRouter',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-breakpad',
    ],
  });

  console.log(`\nPhase "${PHASE}" — browser screenshots -> docs/screenshots\n`);

  try {
    if (PHASE === 'main') await runMain(browser);
    else if (PHASE === 'decoupled') await runDecoupled(browser);
    else if (PHASE === 'post-change') await runPostChange(browser);
    else throw new Error(`Unknown phase "${PHASE}"`);
  } finally {
    await browser.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nScreenshot run failed:', err.message);
  process.exit(1);
});
