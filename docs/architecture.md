# Architecture

## Goal

Demonstrate a service-oriented design in which **one reusable Auth/User service**
is consumed by **two independent monolithic applications**. The apps are "monoliths"
in the sense that each one owns its own server, its own database and its own UI —
but they do not own authentication. That responsibility is delegated to a shared,
separately deployed service.

## Repository layout

```
/contract   openapi.yaml   – the service contract (source of truth)
/docs       architecture.md
/auth-service  server + its SQLite database (auth.db)
/app-library   its own Express server + its own SQLite DB (library.db) + HTML/JS UI
/app-student   its own Express server + its own SQLite DB (student.db) + HTML/JS UI
```

## Components

| Component      | Owns                        | Does not own            |
| -------------- | --------------------------- | ----------------------- |
| `auth-service` | users, credentials, tokens  | any app domain data     |
| `app-library`  | books, loans (its own DB)   | credentials, profiles   |
| `app-student`  | courses, enrollments (own DB) | credentials, profiles |

```
        ┌────────────────┐        ┌────────────────────┐
        │  app-library   │        │    app-student     │
        │  Express + UI  │        │   Express + UI     │
        │  library.db    │        │   student.db       │
        └───────┬────────┘        └─────────┬──────────┘
                │   HTTP + JWT (only)       │
                └───────────┬───────────────┘
                            ▼
                   ┌───────────────────┐
                   │   auth-service    │
                   │   Express         │
                   │   auth.db (users) │
                   └───────────────────┘
```

## Contracts and boundaries

The integration surface is `contract/openapi.yaml`. Both apps depend on that
contract, not on the auth service's implementation.

Rules the apps must respect:

1. **No shared database.** Each service/app has its own SQLite file. No app
   opens `auth.db`, and the auth service never opens `library.db` or `student.db`.
2. **No shared code.** Apps do not import each other or the auth service.
   Duplicating a small `fetch` helper is preferred over a shared package.
3. **HTTP is the only channel.** All cross-boundary calls go through the
   endpoints defined in the contract.

## Authentication flow

1. A user registers via `POST /auth/register` (auth service stores a bcrypt hash).
2. The app calls `POST /auth/login` and receives a signed JWT plus the user object.
3. The app keeps the token client-side (in the demo UI: `localStorage`) and sends
   it as `Authorization: Bearer <token>` on requests that need authentication.
4. Protected endpoints (`GET /users/{id}`, `PUT /users/{id}`, `GET /auth/validate`)
   verify the token signature and expiry before acting.
5. `GET /auth/validate` lets an app ask "is this token still good, and who is it?"
   — used on app startup / page reload.

## Token strategy

- **Algorithm:** HS256.
- **Claims:** `sub` (user id), `iat`, `exp`, `iss` (`auth-service`).
- **Lifetime:** 24 hours (returned as `expiresIn` seconds).
- **Secret:** read from `AUTH_JWT_SECRET`; the demo uses a fixed dev value.
- **Stateless:** no session table; validation is signature + expiry only.
  (Updating a password therefore does not instantly revoke existing tokens — an
  acceptable trade-off for the demo, noted here for honesty.)

## Data ownership

Only the auth service stores credentials. The `User` schema deliberately omits
any password field: `password_hash` never leaves the service. App databases may
store a `user_id` as a foreign key, but the referenced row lives in `auth.db`;
this is a logical reference, not a database-level one.

## Error model

All failures share one envelope: `{ "error": { "code", "message", "details?" } }`.

| Status | Meaning                                | Codes (examples)                            |
| ------ | -------------------------------------- | ------------------------------------------- |
| 400    | Malformed / invalid input              | `VALIDATION_ERROR`                          |
| 401    | Missing, bad or expired token / creds  | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` |
| 404    | Unknown user                           | `USER_NOT_FOUND`                            |
| 409    | Conflict (email already registered)    | `EMAIL_TAKEN`                               |
| 500    | Unexpected server error                | `INTERNAL_ERROR`                            |

## Ports (local dev)

| Service       | Port |
| ------------- | ---- |
| auth-service  | 4000 |
| app-library   | 4001 |
| app-student   | 4002 |

## Trade-offs / non-goals

- SQLite + a single process per service: fine for a demo, not for production.
- No refresh tokens, no revocation list, no rate limiting, no HTTPS termination.
- The apps trust the JWT for identity but still call `GET /auth/validate` when
  they need fresh profile data — a deliberate illustration of service boundaries.
