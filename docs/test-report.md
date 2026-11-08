# SOA End-to-End Test Report

Date: 2026-11-07
Scope: `auth-service`, `app-library`, `app-student` (monorepo at the repository root)

## 1. Objective

Verify, end to end, that:

1. The whole stack starts with a single root command.
2. A user can sign in to `app-library` in a browser and change their display name.
3. The same user signing in to `app-student` (an independent app) sees the new name,
   with **no change made to `app-student`**.
4. Loose coupling holds: stopping `app-library` does not affect `app-student` or the
   auth service, and the auth service can change its internal password
   hashing/storage without touching either app.

## 2. System under test

| Service | Port | Owns | Database | UI |
|---|---|---|---|---|
| `auth-service` | 4000 | users, credentials, tokens | `auth-service/users.db` (`users`) | Swagger UI at `/docs` |
| `app-library` | 5001 | books, loans | `app-library/library.db` (`books`, `loans`) | `/login.html`, `/dashboard.html`, `/books.html`, `/profile.html` |
| `app-student` | 5002 | courses, enrolments | `app-student/student.db` (`courses`, `enrollments`) | `/login.html`, `/dashboard.html`, `/courses.html`, `/profile.html` |

Integration rule: the apps talk to the auth service **only over HTTP**; no shared
database and no shared/imported code.

Demo accounts (seeded by `auth-service`): `ada@example.com` / `password123` and
`alan@example.com` / `password123`.

## 3. How to run

```powershell
# from the repository root
npm install          # installs the root screenshot/dev tooling
npm run start:all    # starts auth-service (4000) + app-library (5001) + app-student (5002)
```

`npm run start:all` runs [`scripts/start-all.js`](../scripts/start-all.js), which spawns each
service's own `src/server.js` as a child process and prefixes its logs. `Ctrl+C` stops all.

Screenshots are captured with a real browser (installed Chrome/Edge driven by
`puppeteer-core`) via [`scripts/screenshots.js`](../scripts/screenshots.js):

```powershell
node scripts/screenshots.js --phase=main         # steps 2–3 of the browser flow
node scripts/screenshots.js --phase=decoupled    # app-library stopped
node scripts/screenshots.js --phase=post-change  # after the auth-service change
```

## 4. Results

### 4.1 Start-up

| Check | Expected | Observed | Result |
|---|---|---|---|
| `npm run start:all` | all three listen | `auth-service` :4000, `app-library` :5001, `app-student` :5002 | PASS |
| `GET /health` on each | `status: ok` | `auth-service`, `app-library`, `app-student` | PASS |

### 4.2 Browser flow — rename in app-library, see it in app-student

| Step | Action | Observed | Evidence | Result |
|---|---|---|---|---|
| 1 | Open `http://localhost:5001/login.html` | sign-in page renders | `01-library-login.png` | PASS |
| 2 | Sign in as `ada@example.com` / `password123` | dashboard greets `Welcome, Ada Lovelace` | `02-library-dashboard.png` | PASS |
| 3 | Open Profile | form pre-filled with current name/email | `03-library-profile-before.png` | PASS |
| 4 | Change display name to `Ada Lovelace (renamed in app-library)` and save | "Profile updated."; `PUT /users/{id}` applied | `04-library-profile-after-rename.png` | PASS |
| 5 | Open `http://localhost:5002/login.html` (independent app) | sign-in page renders | `05-student-login.png` | PASS |
| 6 | Sign in with the **same credentials** | dashboard shows **Name = `Ada Lovelace (renamed in app-library)`**, Email = `ada@example.com` | `06-student-dashboard-renamed.png` | PASS |

Key point: step 6 shows the name changed in step 4 even though `app-student` was never
modified. `app-student` reads the profile live from the auth service
(`GET /api/profile` → `GET /users/{id}`), so the profile is a single source of truth.

### 4.3 Loose coupling — stop app-library

`app-library` (port 5001) was stopped; only `auth-service` (4000) and `app-student` (5002)
were left running.

| Check | Expected | Observed | Evidence | Result |
|---|---|---|---|---|
| Port 5001 reachable | no | `False` | — | PASS |
| Ports 4000 / 5002 reachable | yes | `True` / `True` | — | PASS |
| `app-student` sign-in + dashboard | works | `app-student login ok -> Ada Lovelace (renamed in app-library)` | `07-app-student-works-library-down.png` | PASS |
| `app-student` courses API | works | 6 courses returned | — | PASS |
| `auth-service` `GET /health` | works | `auth-service` | `08-auth-service-health-library-down.png` | PASS |

With `app-library` down, `app-student` and the auth service continued to work normally.
`app-library` is not a dependency of `app-student`.

### 4.4 Loose coupling — change the auth service's internals

The auth service's password hashing/storage was changed **inside `auth-service` only**:
bcrypt was replaced with Node's built-in `scrypt`, and the stored hash format changed from
bcrypt (`$2a$…`) to a versioned format (`scrypt$N$r$p$salt$hash`). Files changed:
`auth-service/src/security.js`, `auth-service/src/config.js`,
`auth-service/.env`, `auth-service/.env.example`, `auth-service/package.json`
(removed the `bcryptjs` dependency) and the auth-service test. **No file in `app-library`
or `app-student` was modified.**

Because the stored format changed, the demo rows were re-seeded (the auth DB file was
recreated). This is a purely internal auth-service data operation.

| Check | Expected | Observed | Evidence | Result |
|---|---|---|---|---|
| Auth-service unit tests | all pass | `# tests 35 / # pass 35 / # fail 0` | — | PASS |
| Stored hash format | no longer bcrypt | `id=1 ada@example.com -> scrypt$16384$8$1$…` | — | PASS |
| `app-library` sign-in (unchanged code) | works | `Ada Lovelace <ada@example.com>` | `10-app-library-after-auth-change.png` | PASS |
| `app-student` sign-in (unchanged code) | works | `Ada Lovelace <ada@example.com>` | `09-app-student-after-auth-change.png` | PASS |
| Wrong password still rejected | 401 | `401` | — | PASS |

The HTTP contract (`/contract/openapi.yaml`) did not change, so neither app needed any
change. Each app's `authClient.js` only knows the endpoints, never the storage scheme.

### 4.5 Boundary / independence

| Check | Observed | Result |
|---|---|---|
| `app-student` DB tables | `courses`, `enrollments` only (no credentials) | PASS |
| Each app's UI served from its own origin | `:5001` and `:5002` | PASS |
| Apps integrate with auth service over HTTP only | no shared DB, no shared code | PASS |

## 5. Screenshots

All files live in [`docs/screenshots/`](./screenshots).

| File | Shows |
|---|---|
| `01-library-login.png` | app-library sign-in page |
| `02-library-dashboard.png` | app-library dashboard after sign-in |
| `03-library-profile-before.png` | profile form before the rename |
| `04-library-profile-after-rename.png` | profile after saving the new name |
| `05-student-login.png` | app-student sign-in page |
| `06-student-dashboard-renamed.png` | app-student dashboard showing the new name + email |
| `07-app-student-works-library-down.png` | app-student working while app-library is stopped |
| `08-auth-service-health-library-down.png` | auth-service `/health` while app-library is stopped |
| `09-app-student-after-auth-change.png` | app-student sign-in after the hashing change |
| `10-app-library-after-auth-change.png` | app-library sign-in after the hashing change |

## 6. Conclusion

All checks passed. `app-library` and `app-student` are genuinely independent monoliths
(separate servers, separate databases, separate UIs) that share exactly one thing over
HTTP: the auth service. A rename performed through one app is visible in the other without
any code change; stopping one app leaves the other running; and the auth service can change
its internal password hashing/storage with neither app being touched or redeployed.
