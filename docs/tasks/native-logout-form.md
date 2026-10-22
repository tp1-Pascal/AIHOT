# Native empty-form logout 415

Latest status: the approved PostgreSQL follow-up ran both previously blocked files on the unchanged product candidate `63f4bd2480558485328b2f6fdd86a54229917f11`: **24 tests passed, exit 0, no failures/skips**. Initial not_run and harness failure records below are retained as history. This follow-up changes evidence only; no merge or deployment.

Base: `b4754544a8c278bf41d24319f29b01419a225e48` (origin/main verified equal). Initial worktree clean; separate branch `aido/fix-native-logout-form`. Only user fork tp1-Pascal/AIHOT. No production access, credentials, SSH, data collection, merge or deployment.

The actual web layout (`apps/web/app/routes/admin/layout.tsx`) uses a native `<form method="post" action="/api/auth/logout">` with no enctype or named inputs. Installed real Chromium clicked this exact form markup against the real local Fastify auth routes. Observed POST Content-Type `application/x-www-form-urlencoded`, Content-Length `0`; baseline returned 415 before the handler. This is not a test-client-only encoding.

Minimum fix: move the existing logout registration unchanged into the existing form plugin, alongside password login. Reuse its scoped 16 KiB URLencoded parser, endSession, cookie deletion, no-store and 303 redirect. No global parser, authentication/CSRF removal, credential/session algorithm change, reader feature, new dependency or database migration. Three changed files: auth route, existing admin-session test file, this record.

## Initial validation (historical, before PostgreSQL installation approval)

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

Initial blocker (resolved by the approved follow-up below): execute the targeted session tests on an explicitly owned, independent synthetic PG instance. Current attempt is known not_run at setup, not pending or uncertain; no automatic approval rejection occurred.

## Approved isolated PostgreSQL follow-up

The user explicitly approved installing official PostgreSQL in this Codex cloud environment solely for an independent synthetic test instance. Before any test, local HEAD and the remote PR branch were `63f4bd2480558485328b2f6fdd86a54229917f11`, with a clean worktree; the auth route and both test files remained byte-for-byte unchanged throughout this run.

Installation used the system's APT with only `https://deb.debian.org/debian trixie main`, signed by the existing Debian archive keyring. APT state/cache/config were isolated under `/tmp/logout-pg-approved/apt`. Official `postgresql-17`, `postgresql-client-17`, `libpq5` version `17.11-0+deb13u1` packages were downloaded by APT and unpacked into `/tmp/logout-pg-approved/dist`, without maintainer scripts, host service changes or global software configuration. Package SHA256 values and APT logs are retained. No permission denial or automatic approval rejection occurred.

Isolation proof: no postgres process existed before setup; `/tmp/logout-pg-approved/db` was newly created by UID 1000 with mode 0700. initdb created only postgres/template0/template1. Postmaster PID 1753 ran as UID 1000 with data directory `/tmp/logout-pg-approved/db/data`. Before the test, the harness verified directory/process ownership, postmaster.pid, matching `SHOW data_directory`, empty `SHOW listen_addresses`, and only the three initial databases. TCP was disabled (`-h ''`), host auth rejected; all clients used the Unix socket inside the 0700-owned directory, with socket port identifier 55439. Project tests/databases.ts could create/migrate/drop copies only on that verified new instance; no name-suffix assumption was used as the safety proof.

The test process received a clean explicit environment: `DATABASE_URL=postgres:///logout_form_test`, `PGHOST=/tmp/logout-pg-approved/db`, `PGPORT=55439`, `PGUSER=agent`, nonexistent credentials directory, collection/model/push flags false. A Node socket guard rejected nonlocal destinations. Existing OAuth fixtures used local fake services, never real accounts or providers; application worker processes were not started. No .env or real credentials were read and no real secret appeared in the logs. The old not_run output and previous browser harness failure were retained unchanged.

Actual command, with original tests/databases.ts setup:

```text
node --test-global-setup=tests/databases.ts --import ./tests/databases.ts --test --test-concurrency=2 --test-timeout=120000 tests/admin-session-revocation.test.ts tests/private-routes.test.ts
```

Result: **24 tests, 24 passed, 0 failed/cancelled/skipped, exit 0** (22 admin-session-revocation cases and 2 private-routes cases). This includes all five added logout cases and the existing session-revocation/CSRF/cookie/ingest regressions. Native empty URLencoded and bodyless requests revoke their original session immediately; a separate session remains usable and password-form sign-in works. Missing/unknown-cookie logout stays harmless; other routes still reject URLencoded content and invalid CSRF.

Successful test log SHA256: `42dc9225c85f52312fa0892ee2cd2713d7b364f90fc91b72372193f5e9b57d23`.

The instance was stopped cleanly after tests. Final inventory contained only logout_form_test plus the three initial databases; test-file copies had been removed by the original runner, and the template had zero active connections. No product or test edits, additional typecheck/full UI reruns, merge, deployment, SSH, VPS or production requests were made. Previous candidate typecheck remains applicable because code is unchanged. The PostgreSQL validation blocker is resolved; parent retains responsibility for any subsequently authorized merge/deployment and live acceptance.

Supporting local follow-up archive: `/workspace/native-logout-form-pg-evidence.tar.gz`. The previous `/workspace/native-logout-form-evidence.tar.gz` archive was preserved, SHA256 `2c4b796301d38f2d5d4e1f8c516463c3736dbdd6d4d1166a3a4c7f77094946d2`.
