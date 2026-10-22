# Native empty-form logout 415

Base: `b4754544a8c278bf41d24319f29b01419a225e48` (origin/main verified equal). Initial worktree clean; separate branch `aido/fix-native-logout-form`. Only user fork tp1-Pascal/AIHOT. No production access, credentials, SSH, data collection, merge or deployment.

The actual web layout (`apps/web/app/routes/admin/layout.tsx`) uses a native `<form method="post" action="/api/auth/logout">` with no enctype or named inputs. Installed real Chromium clicked this exact form markup against the real local Fastify auth routes. Observed POST Content-Type `application/x-www-form-urlencoded`, Content-Length `0`; baseline returned 415 before the handler. This is not a test-client-only encoding.

Minimum fix: move the existing logout registration unchanged into the existing form plugin, alongside password login. Reuse its scoped 16 KiB URLencoded parser, endSession, cookie deletion, no-store and 303 redirect. No global parser, authentication/CSRF removal, credential/session algorithm change, reader feature, new dependency or database migration. Three changed files: auth route, existing admin-session test file, this record.

## Actual validation

- Baseline real native browser: expected 415 reproduced; exit 0.
- Fixed real native browser: 303 to `/`, Set-Cookie clears the session cookie. Bodyless unauthenticated logout also returns 303/clears cookie. A separate root-scope POST route still returns 415 for URLencoded requests: parser remains encapsulated. Three local cases passed, no database or session mock.
- One intermediate browser harness run observed the fixed 303 but failed inspecting Set-Cookie through Playwright's security-filtered `response.headers()`. Corrected only the temporary harness to `response.allHeaders()`; preserved the failed log. No second product fix was needed.
- `npm run typecheck`: exit 0, run once. No separate lint script exists. No broad UI/full-suite rerun or dependency installation.
- **Database session tests: not_run.** This refreshed environment has no postgres/initdb/pg_ctl/psql, no running PG process and no cached Docker image. Previous temporary PG installation was not retained. Per task constraints, no new software/image was installed or downloaded. The targeted command stopped in global setup with ENOENT on the explicitly nonexistent synthetic-only socket, before any fixture ran; exit 7, 0 tests executed. No .env/real credentials or existing databases were used.

Five new cases in the existing auth test file cover: native empty URLencoded logout; bodyless compatibility; no-cookie and unknown-cookie logout; parser encapsulation and unchanged CSRF. Authenticated cases perform an actual password-form login, check 303/cookie, verify immediate removal from admin_sessions and denied read/write/check on the original session, and verify independent/new sessions. **These assertions are written/typechecked, not claimed passed until a permitted synthetic PostgreSQL instance is available.** Existing cookie and ingest regressions were included in the blocked targeted command.

## Logs and commands

All commands below used `/tmp/logout-form-run.py`, a clean explicit environment with nonexistent credentials directory, disabled collection/models/push and `PGHOST=/tmp/logout-form-owned-pg-does-not-exist`, `PGPORT=55432`, `DATABASE_URL=postgres:///logout_form_test`. Browser traffic is restricted to local fixtures through a closed local proxy with loopback bypass. Raw logs and harness scripts are retained in `/workspace/native-logout-form-evidence.tar.gz`.

| Run | Exit | Log SHA256 |
|---|---:|---|
| browser-baseline | 0 | `f442c14bf0bc1538a48b0351278bd904a9710927137f48befecae0cafe3b625c` |
| browser-fixed | 1 | `f0f103a437c453805858095a66031f654406cf4f94821c78dfbdf114fe48d8c7` |
| browser-fixed-headers | 0 | `fc463c96892319aab0688f7dd43eea9e19dd6b9d47593f9f9bd214d8f1372674` |
| auth-database | 7 | `a711a397387ce02cf4473c1562a17dcb859c96f7e21ad3a806b0cd4cd860c097` |
| typecheck | 0 | `457a7096e932d8c68959bb2d7a989d5c52f7bb1a3f8c7c9ce0674f8f3c78f5d0` |

```text
browser-baseline: node /tmp/logout-form-browser.mjs baseline
browser-fixed: node /tmp/logout-form-browser.mjs fixed
browser-fixed-headers: node /tmp/logout-form-browser.mjs fixed
auth-database: node --test-global-setup=tests/databases.ts --import ./tests/databases.ts --test --test-concurrency=2 --test-timeout=120000 tests/admin-session-revocation.test.ts tests/private-routes.test.ts
typecheck: npm run typecheck
```

## Minimum future read-only overlay delivery (not executed)

Runtime file only: `apps/api/src/routes/admin-auth.ts`. Use the parent's existing read-only overlay mapping for this exact relative path and its established API restart/recreate procedure; Node 24 runs this TypeScript directly, so no Web build is needed. Tests/task record are not runtime overlay files. No env, secret, backend session module, DB, worker, Web UI or network rule change. Actual VPS host/container mount paths were not inspected and are intentionally not guessed. A deployment should still verify synthetic native-login/logout revocation before being called fully verified.

Runtime file SHA256: `86e3a9511780889f2bc50d7b7e4692ce14b246b1bb90698efe3c9ec8ea36ab94`.

Remaining blocker: execute the targeted session tests on an explicitly owned, independent synthetic PG instance. Current attempt is known not_run at setup, not pending or uncertain; no automatic approval rejection occurred.
