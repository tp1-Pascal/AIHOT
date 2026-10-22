# Admin source reading entry

Base: `06be936083c7360d22eaf3e3c36c12922991449a`; clean worktree and matching origin/main checked before creating an independent branch. This card has one goal: make already-stored RSS/private-X items easy for a signed-in administrator to find and open.

Scope (five files): existing admin layout navigation, sources page, source detail page, `apps/web/tests/admin-performance.test.ts`, this record. Reuse the existing sources/source queries, tables, auth and content detail route. No combined material query, new reader framework, model/worker/scheduler, credentials, migration, source data/config edits or public publication change.

Implementation: label the existing navigation/page “阅读信源”; offer a clean-query RSS filter and direct recent-item anchors for the configured X likes/X bookmarks source IDs on the sources page and clarify external reports versus X search. Add per-source “阅读条目” links. Move the existing recent-items section before settings, with a stable anchor and original links. Empty sources remain explicitly empty; no fabricated home feed, score, summary or publication.

Validation: build and typecheck, then existing admin browser tests extended with synthetic RSS/private-X/empty sources, desktop and phone navigation, links to content/originals, filtering semantics, anonymous redirect and no write actions. Real installed Chromium and loopback fixtures only; this proves the cloud UI candidate, not the user's Mac Chrome session. Separately rerun the bounded existing private-ingest PostgreSQL acceptance tests for the unchanged receiver/publication boundary, using existing official PG binaries only after confirming the previous instance is stopped and a fresh owned socket-only synthetic instance. Install nothing, access no production/SSH/live X/model, do not merge/deploy. Record commands, counts, exits, hashes and failures below.

## Result

The existing admin source list/detail are reused without a new API. The existing content search requires an ID/URL/title query and is diagnostic, so it was not turned into another combined stream. The sources navigation/page now say “阅读信源”. RSS uses the existing `kind=rss` list filter; X likes/bookmarks directly open `/admin/sources/x-likes#recent-items` and `/admin/sources/x-bookmarks#recent-items`, matching the current deployment's known source IDs. There is no fabricated X-home shortcut/feed or invented count. All-source and RSS links use clean query strings; external-report versus X-search labels are explained.

The source page renders its existing bounded 30-item list before configuration, with an anchor offset for the mobile sticky navigation. Each stored item retains its title/processing status/discovery time, links to the existing admin content detail, and now also links directly to its original URL. No generated summary, score, analysis or publication is added. Empty sources say “这个信源还没有入库条目。” Existing auth, private/no-store responses and settings actions remain in place.

Final checks: **8/8 real Chromium tests**, **17/17 existing private-ingest acceptance cases**, typecheck exit 0 and Web build exit 0. Browser tests use the built real web server with a synthetic local API (the existing test pattern); desktop 1400×900 and phone 390×844 click RSS/X paths, verify recent items before settings, open a real local-original popup, reach existing content details, show empty sources, distinguish X search from external reports, verify anonymous redirects and record only GET/HEAD during reading. Browser fixtures contain no analysis/publication. These are cloud synthetic-browser results, not the user's Mac Chrome/live-account acceptance.

The privacy boundary was separately exercised through the real ingest HTTP/DB/publication code, not inferred from the browser's synthetic API. Existing official PG 17 binaries were reused; no software was installed. The previous logout-test cluster was confirmed stopped (`pg_ctl status`: no server; no postmaster.pid, only an old defunct process remained). A fresh UID-1000-owned mode-0700 `/tmp/source-reading-pg` directory was created, with matching data-directory/process ownership checks, host auth rejected and TCP listen addresses empty. Only its Unix socket/port identifier 55441 was passed to original tests/databases.ts. Initial inventory was postgres/template0/template1. Tests copied/dropped only that instance's synthetic databases; it was stopped after completion. No backend/API/publication/receiver files changed from base.

All command processes used clean explicit environments, nonexistent credential directories, disabled collection/model/push flags and loopback-only Node connections; the real installed system Chromium used a closed local proxy with loopback bypass. No .env existed or was read, no production/SSH/live X/model/worker process was accessed, and no data/config/permissions were changed. No automatic approval rejection occurred. A deployment still belongs to the parent thread; no merge or deployment occurred here.

## Preserved iteration history

- First typecheck failed only because the synthetic pre-JSON admin fixtures were typed as branded serialized timestamps; corrected fixtures to the existing `BeforeJson` contract. No product change was needed for that failure.
- First browser run was 7/8: the desktop assertion read the URL before async navigation committed. Added an explicit expected-target URL wait, retaining the same test/case names. The next run passed 8/8.
- Reviewing the actual phone screenshot showed that list-filter shortcuts still required scrolling past source statistics. The final X shortcuts therefore go directly to the existing recent-items anchors; final build/typecheck and all 8 Chromium cases passed again. Screenshots disable finite transitions and contain only synthetic source/item names.

## Commands, exits, counts and log hashes

Raw logs, runners and four screenshots are in `/workspace/source-reading-entry-evidence.tar.gz`; a copy of the screenshots is in `/workspace/source-reading-entry-evidence/`. Failed logs are retained without overwriting. The final product has only three changed UI files; the fourth changed file is the existing browser test, and this is the fifth task-record file.

| Run | Exit | Tests/pass/fail | Log SHA256 |
|---|---:|---|---|
| build-1 | 0 | -/-/- | `9101ac8dc0dfb8c6112f8c0d73e4077404ad170dc0b949dd1a963c95398b4a4c` |
| typecheck-1 | 1 | -/-/- | `ff5134ee0adb66bd472cf6baefc3604c8413529296976e7acf015d6afa7e5268` |
| browser-1 | 1 | 8/7/1 | `fc22f9124261467c7c2df3a2b8fad68dd8be4f9305feb5cf329e1cb0c2753daa` |
| typecheck-2 | 0 | -/-/- | `457a7096e932d8c68959bb2d7a989d5c52f7bb1a3f8c7c9ce0674f8f3c78f5d0` |
| boundary-1 | 0 | 17/17/0 | `2e99e5709544a63a65625225bccd5a99f976aea0bab11f091d8c13fc5bcd9984` |
| browser-2 | 0 | 8/8/0 | `09d7c39149bd98284be9de7588aa7231a7e572c6719c97da55ec4294c98fc7dc` |
| final-build | 0 | -/-/- | `f7688b21929ae901957d8055bcd4a01c3b751d68ddb5e3d53a8095d17040c953` |
| final-typecheck | 0 | -/-/- | `457a7096e932d8c68959bb2d7a989d5c52f7bb1a3f8c7c9ce0674f8f3c78f5d0` |
| browser-final | 0 | 8/8/0 | `3137e69c2d704348d5bb196cfa0d61d3ce67f9fec2cdfa0c5f8dc5bddc05dff8` |

```text
build-1: npm run build -w @aihot/web
typecheck-1: npm run typecheck
browser-1: node --test --test-timeout=120000 apps/web/tests/admin-performance.test.ts
typecheck-2: npm run typecheck
boundary-1: node --test-global-setup=tests/databases.ts --import ./tests/databases.ts --test --test-concurrency=2 --test-timeout=120000 tests/private-ingest.test.ts
browser-2: node --test --test-timeout=120000 apps/web/tests/admin-performance.test.ts
final-build: npm run build -w @aihot/web
final-typecheck: npm run typecheck
browser-final: node --test --test-timeout=120000 apps/web/tests/admin-performance.test.ts
```

Next live check (parent/Mac): once the browser connection is restored and a separately approved rollout is complete, open “阅读信源”, click X likes/bookmarks or RSS → 阅读条目 → 打开原文. Verify actual source names/counts and the visible desktop layout; synthetic fixtures do not prove those live values. The current cloud task has no unresolved implementation/test blocker.
