// Failure modes fixed before changing admin loading and formatting:
// - a slow/failed navigation badge prevents the actual page from opening;
// - streaming exposes a page before identity is verified, or makes private data cacheable;
// - desktop/phone badges disappear permanently or retain the preceding page's values;
// - hovering private links reads an expensive page that no-store makes navigation read again;
// - reusing number formatters changes rounding, missing values, or currency precision.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import type { AdminSource, AdminSourceDetail, AdminContentChain, BeforeJson } from "@aihot/contracts/admin";
import { money, num } from "../app/features/admin/format.ts";
import { startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer;
let browser: Browser;
let signedIn = true;
let badge = 7;
let badgeFailure = false;
let releaseBadges: (() => void) | undefined;
let badgeGate: Promise<void> | undefined;
const reads: string[] = [];
const requests: Array<{ method: string; path: string }> = [];
const storedAt = "2026-10-22T12:00:00Z";
const fixtureSources: BeforeJson<AdminSource>[] = [
  ["rss-fixture", "合成 RSS", "rss", "editorial"],
  ["x-likes", "合成 X 点赞", "external", "isolated"],
  ["x-bookmarks", "合成 X 书签", "external", "isolated"],
  ["x-home", "合成 X 首页", "external", "isolated"],
  ["x-search-fixture", "合成 X 搜索", "x_search", "hot_signal"],
].map(([id, name, kind, participation_mode]) => ({
  id, name, kind, participation_mode, config: {}, tags: [], tier: "T2", first_party: false,
  owner_entity_id: null, signal_group_id: null, interval_minutes: 1440, site_fulltext: false,
  syndicate_fulltext: false, enabled: true, health: "ok", fail_count: 0, last_fetch_at: null,
  last_ok_at: null, last_error: null, cursor: null, next_fetch_at: null, created_at: storedAt, updated_at: storedAt,
}));
function fixtureDetail(id: string, origin: string): BeforeJson<AdminSourceDetail> | null {
  const source = fixtureSources.find(s => s.id === id);
  if (!source) return null;
  const hasItem = ["rss-fixture", "x-likes", "x-bookmarks"].includes(id);
  return { source, runs: [], history: [], republish: null,
    items: hasItem ? [{ id: `item-${id}`, title: `${source.name}的未处理条目`, url: `${origin}/original/${id}`,
      discovered_at: storedAt, published_at: storedAt, processing_state: "new", selected: false, visibility: null, title_zh: null }] : [],
    stats: { total: hasItem ? 1 : 0, last7d: hasItem ? 1 : 0, selected: 0 } };
}
function fixtureContent(id: string, origin: string): BeforeJson<AdminContentChain> | null {
  const detail = fixtureDetail(id.replace(/^item-/, ""), origin);
  const item = detail?.items.find(i => i.id === id);
  if (!item || !detail) return null;
  const s = detail.source;
  return { article: { id, source_id: s.id, url: item.url, identity_key: `${s.kind === "external" ? "private-ingest:" : ""}url:${item.url}`,
    title: item.title, author: null, language: "zh", published_at: storedAt, published_at_claim: storedAt,
    discovered_at: storedAt, timeline_at: storedAt, backfill: false, body_status: "pending", revision: 1,
    processing_state: "new", processing_error: null, grouped_at: null, body_chars: 0, source_name: s.name,
    source_kind: s.kind, tier: s.tier, participation_mode: s.participation_mode, site_fulltext: false, syndicate_fulltext: false },
    discoveries: [], revisions: [], analyses: [], publication: null, override: null, ledger: [], membership: [], decisions: [], deliveries: [], history: [] };
}
const api = createServer(async (req, res) => {
  const url = new URL(req.url!, "http://api.local");
  if (url.pathname.startsWith("/api/admin/")) {
    reads.push(url.pathname);
    requests.push({ method: req.method ?? "GET", path: url.pathname });
  }
  if (url.pathname.startsWith("/original/")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end("<!doctype html><h1>合成原文</h1>");
  }
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
  if (url.pathname.startsWith("/api/admin/") && !signedIn) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ detail: "unauthorized" }));
  }
  if (url.pathname === "/api/admin/me") return res.end(JSON.stringify({ name: "后台性能检查", csrf: "fixture", dev: true }));
  if (url.pathname === "/api/admin/nav-counts") {
    await badgeGate;
    res.statusCode = badgeFailure ? 503 : 200;
    return res.end(JSON.stringify(badgeFailure ? { detail: "busy" } : { sources: badge }));
  }
  if (url.pathname === "/api/admin/sources") {
    const kind = url.searchParams.get("kind"), q = url.searchParams.get("q")?.toLowerCase(), health = url.searchParams.get("health"), mode = url.searchParams.get("mode");
    const page = Number(url.searchParams.get("page") || 1);
    const rows = fixtureSources.filter(s => (!kind || s.kind === kind) && (!q || `${s.id} ${s.name}`.toLowerCase().includes(q))
      && (!health || s.health === health) && (!mode || s.participation_mode === mode))
      .slice((page - 1) * 100, page * 100).map(s => ({ ...s, items_7d: fixtureDetail(s.id, url.origin)!.items.length, selected_30d: 0 }));
    return res.end(JSON.stringify({ rows, totals: { total: fixtureSources.length, enabled: fixtureSources.length, failing: 0, degraded: 0 }, page }));
  }
  const sourceId = /^\/api\/admin\/sources\/([^/]+)$/.exec(url.pathname)?.[1];
  if (sourceId) return res.end(JSON.stringify(fixtureDetail(sourceId, `http://${req.headers.host}`)));
  const itemId = /^\/api\/admin\/content\/([^/]+)$/.exec(url.pathname)?.[1];
  if (itemId) return res.end(JSON.stringify(fixtureContent(itemId, `http://${req.headers.host}`)));
  res.statusCode = 404;
  res.end(JSON.stringify({ detail: "not_found" }));
});

before(async () => {
  web = await startWebServer(api);
  browser = await chromium.launch({ channel: "chromium" });
});
after(async () => {
  releaseBadges?.();
  await browser?.close();
  await web?.stop();
});

function holdBadges() {
  badgeGate = new Promise<void>((resolve) => { releaseBadges = resolve; });
}
function resumeBadges() {
  releaseBadges?.();
  releaseBadges = undefined;
  badgeGate = undefined;
}

test("admin HTML and navigation begin before delayed badges while remaining private", async () => {
  for (const path of ["/admin/content", "/admin/content.data?_routes=admin-layout,routes/admin/content"]) {
    holdBadges();
    // SSR deliberately waits for every boundary for bots; this is a browser document request.
    const response = fetch(web.origin + path, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const early = await Promise.race([response, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 1000); })]);
      assert.ok(early, `${path} waited for navigation badges`);
      assert.equal(early.status, 200);
      assert.equal(early.headers.get("Cache-Control"), "private, no-store");
      assert.equal(early.headers.get("X-Accel-Buffering"), "no");
      const first = await early.body!.getReader().read();
      assert.match(new TextDecoder().decode(first.value), /内容诊断|routes\/admin\/content/);
    } finally {
      clearTimeout(timer);
      resumeBadges();
      await response;
    }
  }
});

test("admin streaming still verifies identity before returning the page", async () => {
  signedIn = false;
  try {
    for (const path of ["/admin/content", "/admin/sources", "/admin/sources/x-likes#recent-items"]) {
      const res = await fetch(web.origin + path, { redirect: "manual" });
      assert.equal(res.status, 302);
      assert.match(res.headers.get("Location")!, /\/api\/auth\/login/);
      assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    }
  } finally { signedIn = true; }
});

test("both admin navigations render before badges and update them after arriving", async () => {
  for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    try {
      badge = 7;
      await page.goto(web.origin + "/admin/sources");
      const sources = page.locator('nav a[href="/admin/sources"]').filter({ visible: true });
      await expect(sources).toHaveText("阅读信源7");
      badge = 19;
      holdBadges();
      await page.getByRole("link", { name: "内容诊断", exact: true }).filter({ visible: true }).click();
      await expect(page.getByRole("heading", { name: "内容诊断", exact: true })).toBeVisible({ timeout: 1000 });
      resumeBadges();
      await expect(sources).toHaveText("阅读信源19");
      badgeFailure = true;
      await sources.click();
      await expect(page.getByRole("heading", { name: "阅读信源", exact: true })).toBeVisible();
      await expect(sources).toHaveText("阅读信源");
    } finally {
      badgeFailure = false;
      resumeBadges();
      await context.close();
    }
  }
});

test("hovering private navigation does not repeat the page's reads before clicking", async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(web.origin + "/admin/content");
    reads.length = 0;
    const sources = page.locator('nav a[href="/admin/sources"]').filter({ visible: true });
    await sources.hover();
    await page.waitForTimeout(250); // Intent prefetch starts after the router's hover delay.
    assert.deepEqual(reads, []);
    await sources.click();
    await expect(page.getByRole("heading", { name: "阅读信源", exact: true })).toBeVisible();
    assert.deepEqual([...reads].sort(), ["/api/admin/me", "/api/admin/nav-counts", "/api/admin/sources"].sort());
  } finally { await page.close(); }
});

test("admin numeric formatting keeps existing missing-value and rounding behavior", () => {
  const values = [null, undefined, "", "bad", NaN, Infinity, -Infinity, -0, -1234567.891, 0, 0.0001, 9.995, 10, 1234567.891, "1234.50"];
  for (const value of values) {
    for (const digits of [0, 1, 2, 4]) {
      const v = Number(value);
      const expected = value == null || value === "" || !Number.isFinite(v) ? "—" : v.toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
      assert.equal(num(value, digits), expected);
    }
    for (const currency of ["CNY", "USD"]) {
      const v = Number(value);
      const expected = value == null ? "—" : `${currency === "USD" ? "$" : "¥"}${v.toLocaleString("zh-CN", { maximumFractionDigits: v < 10 ? 3 : 2, minimumFractionDigits: 2 })}`;
      assert.equal(money(value, currency), expected);
    }
  }
});


for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) test(`source reading shortcuts and originals work at ${viewport.width}px without admin writes`, async () => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const start = requests.length;
  try {
    await page.goto(web.origin + "/admin/sources?kind=x_search&health=failing&mode=editorial&page=2");
    await expect(page.getByRole("heading", { name: "阅读信源", exact: true })).toBeVisible();
    await expect(page.getByText("点赞、书签通过", { exact: false })).toBeVisible();
    for (const [label, sourceId] of [["X 点赞", "x-likes"], ["X 书签", "x-bookmarks"], ["RSS", "rss-fixture"]]) {
      const shortcut = page.getByRole("link", { name: label, exact: true });
      const target = await shortcut.getAttribute("href");
      await shortcut.click();
      await expect(page).toHaveURL(web.origin + target!);
      assert.ok(!/[?&](health|mode|page)=/.test(page.url()), "shortcut clears stale filters");
      const source = fixtureSources.find(s => s.id === sourceId)!;
      if (label === "RSS") {
        const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: source.name, exact: true }) });
        await expect(row).toBeVisible();
        await row.getByRole("link", { name: "阅读条目", exact: true }).click();
      }
      await expect(page).toHaveURL(new RegExp(`/admin/sources/${sourceId}#recent-items$`));
      await expect(page.getByRole("heading", { name: "最近条目", exact: true })).toBeVisible();
      const readingY = await page.getByRole("heading", { name: "最近条目", exact: true }).evaluate(el => el.getBoundingClientRect().top + window.scrollY);
      const settingsY = await page.getByRole("heading", { name: "设置", exact: true }).evaluate(el => el.getBoundingClientRect().top + window.scrollY);
      assert.ok(readingY < settingsY, "reading precedes the settings form");
      if (process.env.ADMIN_UI_SCREENSHOTS && label === "X 点赞") await page.screenshot({ animations: "disabled", path: `${process.env.ADMIN_UI_SCREENSHOTS}/recent-${viewport.width}.png` });
      const popupPromise = page.waitForEvent("popup");
      await page.getByRole("link", { name: "打开原文", exact: true }).click();
      const original = await popupPromise;
      await expect(original.getByRole("heading", { name: "合成原文", exact: true })).toBeVisible();
      await original.close();
      await page.getByRole("link", { name: `${source.name}的未处理条目`, exact: true }).click();
      await expect(page.getByRole("heading", { name: `${source.name}的未处理条目`, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "公开页", exact: true })).toHaveCount(0);
      await page.locator('nav a[href="/admin/sources"]').filter({ visible: true }).click();
      await expect(page.getByRole("heading", { name: "阅读信源", exact: true })).toBeVisible();
      if (process.env.ADMIN_UI_SCREENSHOTS && label === "X 点赞") await page.screenshot({ animations: "disabled", path: `${process.env.ADMIN_UI_SCREENSHOTS}/sources-${viewport.width}.png` });
    }
    assert.ok(requests.slice(start).every(r => r.method === "GET" || r.method === "HEAD"), "reading triggers no preview, collection, edit or publication command");
  } finally { await context.close(); }
});

test("X search is distinct from externally reported X and empty sources do not fabricate items", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(web.origin + "/admin/sources");
    await page.getByLabel("类型", { exact: true }).selectOption({ label: "X 搜索" });
    await expect(page.getByRole("link", { name: "合成 X 搜索", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "合成 X 点赞", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "X 点赞", exact: true }).click();
    await expect(page).toHaveURL(web.origin + "/admin/sources/x-likes#recent-items");
    await expect(page.getByRole("heading", { name: "最近条目", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "合成 X 点赞的未处理条目", exact: true })).toBeVisible();
    await page.goto(web.origin + "/admin/sources/x-home#recent-items");
    await expect(page.getByText("这个信源还没有入库条目。", { exact: true })).toBeVisible();
    await expect(page.locator('#recent-items a[href^="/admin/content/"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "打开原文", exact: true })).toHaveCount(0);
  } finally { await page.close(); }
});
