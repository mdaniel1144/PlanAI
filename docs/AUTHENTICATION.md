# Authentication and user management

Habitat uses server-managed SQLite sessions. React controls navigation; Express resolves identity and permissions on every API request. Project access now follows owner-or-ADMIN checks added by the Items phase; legacy ownerless projects are ADMIN-only. See [Items](ITEMS_CATALOG.md) for ownership migration and reassignment. The original authentication phase added no organizations or history.

## Audit and architecture decision

Before this change, `/` redirected to the demo editor, all application APIs were public, the shell contained a placeholder avatar, and there were no account settings or admin pages. The frontend already called a central fetch client and proxied `/api` through Vite. The server uses Express 5, Zod contracts, and ordered SQLite SQL migrations with foreign keys enabled. No GLB/window-template administration route existed to integrate.

The existing same-origin proxy supports cookie sessions. Authentication is mounted before project parameter resolution and scene operations. The public allowlist is GET/HEAD `/api/health` and POST `/api/auth/login`; all other `/api` routes require a valid active session. The `/api/admin` boundary additionally requires the current database role to be ADMIN, including for future admin routes mounted after it.

## First administrator

Run `pnpm db:migrate`, then explicitly bootstrap once:

```sh
export ADMIN_EMAIL='you@example.com'
export ADMIN_NAME='Your Name'
read -rs 'ADMIN_PASSWORD?Initial administrator password: '
export ADMIN_PASSWORD
pnpm auth:bootstrap
unset ADMIN_PASSWORD
```

The hidden prompt above is for zsh. In bash use `read -rs -p 'Initial administrator password: ' ADMIN_PASSWORD`.

Supply a 12–128 character password. No password is printed by the command, stored in source, or created automatically on startup. Bootstrap refuses when any ADMIN already exists, including a disabled ADMIN, and refuses duplicate email addresses. Use the same DATABASE_PATH and production environment as the API. Sign in at `/login`, then create additional users at `/admin/users`.

## Configuration and deployment

| Variable                                      | Behavior                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_PATH`                               | Existing workspace-relative SQLite path; default `data/habitat.sqlite`.                                                                             |
| `SESSION_TTL_DAYS`                            | Absolute session lifetime, default 7 days; must be greater than 0 and at most 90. Activity does not extend it.                                      |
| `NODE_ENV=production`                         | Enables Secure cookies and requires HTTPS APP_ORIGIN.                                                                                               |
| `APP_ORIGIN`                                  | Canonical browser origin, e.g. `https://habitat.example.com`. Mandatory in production. Development otherwise checks the incoming Host and protocol. |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | Used only by the explicit bootstrap command.                                                                                                        |

Serve the frontend and `/api` on one origin through a reverse proxy, preserve the external Host, terminate HTTPS, and route frontend deep links to `index.html`. The API binds to loopback by default. Do not expose the Vite development server as a production deployment. There are no wildcard or credentialed cross-origin CORS permissions.

Development cookie: `habitat_session`, HttpOnly, SameSite=Lax, Path=/, Secure=false for local HTTP. Production cookie: `__Host-habitat_session`, HttpOnly, SameSite=Lax, Path=/, Secure=true, no Domain. Cookie Max-Age and server expiration use the same TTL. Tokens contain 32 cryptographically random bytes and exist only in the cookie and transient server memory. SQLite stores their SHA-256 digest, never the bearer token. Authentication responses are `Cache-Control: no-store`.

Every API mutation requires `X-Habitat-Request: 1`. Browser requests also undergo Origin checking and cross-site Fetch Metadata rejection. Foreign forms cannot supply that header, and foreign scripts receive no CORS preflight permission. The central API client adds the header and uses same-origin credentials. Command-line clients must send the header and maintain a cookie jar.

## Passwords and sessions

Node's built-in scrypt is used because the supported Node 22 runtime already provides it, avoiding an additional native Argon2 dependency. Parameters: N=131072, r=8, p=1, random 16-byte salt, 64-byte derived key, and constant-time comparison. The stored encoding includes the algorithm, parameters, salt, and derived key. The shared password policy accepts 12–128 characters without arbitrary composition rules. Passwords are not trimmed.

Expensive password operations are asynchronous and limited to two concurrent operations per API process. Further operations receive 429. Login and own-password changes each rate-limit 10 attempts per account and 30 per IP per 15 minutes; both successful and failed attempts count. Limiter entries expire and the map has a bounded size. Unknown accounts still run password verification, and unknown, disabled, and incorrect-password logins return the same error. Forwarded IP headers are not trusted. Behind a proxy, the IP limit therefore aggregates clients using that proxy; account limits remain separate.

Logout revokes the current session before clearing the cookie. Disable, email change, and admin password reset revoke all sessions for the target account. Own-password changes require the current password and revoke other sessions while retaining the current session. Roles and status are read from users on every request, so role changes take effect immediately. Password operations recheck identity after asynchronous hashing to prevent resets, disables, or revoked admin sessions from racing with a credential operation.

Expired and revoked sessions are removed opportunistically at startup and successful login through `AuthRepository.cleanupSessions()`. Revocation and credential updates, last-admin checks, and bootstrap execute in SQLite immediate transactions. No hard-delete API is provided.

## Database

Migration `0009_authentication.sql` adds only:

- `users`: UUID identity, normalized unique case-insensitive email, name, password hash, ADMIN/USER role, ACTIVE/DISABLED status, creation/update timestamps, nullable last login.
- `user_sessions`: UUID identity, user foreign key, unique token hash, creation/expiration/last-used timestamps, nullable revocation.

Unique indexes cover email and token hash. Additional indexes cover session user and expiry. Role and status have CHECK constraints. User-session deletion cascades deliberately if a future maintenance operation deletes a user; current product actions disable instead. Earlier migration files and project/scene schemas remain unchanged.

## API

| Method      | Route                                     | Access / behavior                                                      |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| POST        | `/api/auth/login`                         | Public credentials exchange; sets cookie and returns safe CurrentUser. |
| GET         | `/api/auth/me`                            | Authenticated identity.                                                |
| POST        | `/api/auth/logout`                        | Revoke current session and clear cookie.                               |
| PATCH       | `/api/account`                            | Update own name only.                                                  |
| POST        | `/api/account/change-password`            | Current password plus new password.                                    |
| GET / POST  | `/api/admin/users`                        | ADMIN list / create.                                                   |
| GET / PATCH | `/api/admin/users/:userId`                | ADMIN read / whitelist name, email, role, status updates.              |
| POST        | `/api/admin/users/:userId/reset-password` | ADMIN replace password and revoke sessions.                            |
| POST        | `/api/admin/users/:userId/disable`        | ADMIN disable and revoke sessions.                                     |
| POST        | `/api/admin/users/:userId/enable`         | ADMIN enable; revoked sessions remain invalid.                         |

Safe user responses include identity/profile/role/status. Management responses additionally include createdAt, updatedAt, lastLoginAt. No password hashes or session internals are serialized. Shared contracts define LoginRequest, CurrentUser, ManagedUser, CreateUserRequest, UpdateUserRequest, ChangePasswordRequest, and AdminResetPasswordRequest.

Structured errors use `code` and `error`, with safe field paths on validation failures. Codes include AUTH_INVALID_CREDENTIALS, AUTH_REQUIRED, AUTH_SESSION_EXPIRED, AUTH_FORBIDDEN, AUTH_CSRF_REJECTED, AUTH_RATE_LIMITED, AUTH_BUSY, USER_EMAIL_ALREADY_EXISTS, USER_NOT_FOUND, USER_LAST_ADMIN_PROTECTED, USER_INVALID_ROLE, PASSWORD_INVALID, PASSWORD_CURRENT_INVALID, and REQUEST_INVALID. Auth failures use 401, insufficient privileges 403, validation 400, duplicates 409, missing users 404, throttling 429.

## Frontend

AuthProvider begins in LOADING and restores identity through `/api/auth/me`. No protected shell or login form flashes while that request is pending. Connectivity failures show a retry state. ProtectedRoute redirects anonymous visitors to `/login`. ADMIN routes use a nested AdminRoute; USER visitors return to `/projects`. Authenticated visits to `/login` redirect to `/projects`. API 401 responses clear identity, and focus refreshes identity/role. No auth tokens or roles are persisted in localStorage or sessionStorage.

The login form supports Enter, password visibility, pending state and generic credential errors. The shared header shows initials and the user's name. Its click-operated account popover supports Settings, Account, Sign out, outside click, Escape, focus return, and Tab navigation. ADMIN users also see Users navigation. `/settings/account` provides name editing, read-only email/role, and password change.

The admin table searches name/email and shows role, status and last login. Native modal dialogs manage creation, edits, password resets, enable/disable. Disabling, demoting an administrator, and resetting a password require confirmation. The server prevents removal of the last active administrator even if browser confirmation or state is bypassed.

## Verification

Tests use disposable databases and test-only credentials. The existing architectural API and browser tests authenticate through the real login endpoint. `tests/auth.test.ts` covers hashing, safe serialization, cookies, expiry/revocation, disabled accounts, CSRF, rate limits, protected existing routes, every admin action, current database roles, duplicate email, bootstrap refusal, last-admin protection, resets, and own-password changes. `tests/e2e/auth.spec.ts` covers anonymous redirects, login errors, USER and ADMIN workflows, cookies, reload, account menu keyboard/outside behavior, logout, another tab, account changes, and mobile layout. `tests/migrations.test.ts` compares every pre-existing table row before and after migrating a populated database copy.

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm db:migrate`, and `pnpm test:e2e`. Set CHROMIUM_PATH when using an existing browser installation.

## Deliberate limitations

There is no self-registration, email delivery, MFA, forgotten-password email flow, forced initial-password rotation, profile photo upload, project membership sharing, or user deletion. Administrators communicate initial/reset passwords outside this application. Rate limits are process-local and reset when the server restarts; multiple API instances need a shared limiter. Sessions persist across restarts. Production HTTPS/proxy provisioning is an operator responsibility.

## Delivery verification — 2026-10-03

| Command / check                                                                                          | Result                                                                                                                 |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                              | 132 tests passed across 12 files, including 14 authentication/security tests.                                          |
| `pnpm typecheck`                                                                                         | Passed across all workspaces, tools and tests.                                                                         |
| `pnpm lint`                                                                                              | Passed with no errors or warnings.                                                                                     |
| `pnpm build`                                                                                             | Passed; final CSS was also rebuilt with Vite.                                                                          |
| `pnpm db:migrate`                                                                                        | All 9 migrations applied, first on a populated copy, then the workspace database.                                      |
| `CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome pnpm test:e2e --workers=2` | All 19 browser tests passed (5 auth/account/admin and 14 architectural regressions).                                   |
| First-admin CLI                                                                                          | Succeeded on a disposable copy; repeat initialization refused; generated password never printed.                       |
| Existing workspace database                                                                              | Both projects, 42 entities and every row in all 9 existing data tables preserved. Foreign-key checks passed.           |
| Workspace credentials                                                                                    | No development account or default password created; users and sessions remain empty until explicit bootstrap.          |
| Browser inspection                                                                                       | HttpOnly/Lax development cookie, hidden token, reload/logout, desktop admin and mobile login screenshots checked.      |
| Direct API inspection                                                                                    | Anonymous requests denied; USER admin requests return 403; safe response fields and revoked-session rejection checked. |

This environment used the workspace-local `./node_modules/.bin/pnpm` because no global pnpm binary was on PATH. Browser tests used the installed Chromium through the existing CHROMIUM_PATH option. The final browser run used two isolated workers. The default one-worker run was interrupted by process termination after passing its first ten tests; the complete two-worker run passed.

Non-blocking build/runtime warnings remain for large frontend chunks and the existing Three.js Clock deprecation. Actual production HTTPS infrastructure was not deployed; production cookie flags and HTTPS-origin configuration were verified by API tests. Rate limits remain process-local as described above.
