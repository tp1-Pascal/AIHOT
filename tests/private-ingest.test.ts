// Receiver isolation is exercised against real PostgreSQL and the real HTTP/publication paths.
import { tag } from './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { closeDb, sql } from '@aihot/backend/db';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { upsertMaterial, reuseExternalMaterialIdentities } from '@aihot/backend/content/materials';
import { reconcileMaterialSource } from '@aihot/backend/content/provenance';
import { publishArticle } from '@aihot/backend/publication/publish';
import { buildApp } from '../apps/api/src/app.ts';

process.env.INGEST_TOKEN = 'private-ingest-synthetic-test-value';
const app = await buildApp();
after(async () => { delete process.env.INGEST_PRIVATE_SOURCE_IDS; await app.close(); await stopBoss(); await closeDb(); });

async function source(kind = 'external', mode = 'isolated', enabled = true, id = `private-${tag()}`, config = {}, tier = 'T2') {
  await sql`INSERT INTO sources(id,name,kind,participation_mode,enabled,config,tier,next_fetch_at)
    VALUES (${id},${id},${kind},${mode},${enabled},${sql.json(config)},${tier},'2100-01-01')`;
  return id;
}
const push = (sourceId: string, url: string, title = '私有偏好', raw: Record<string, unknown> = { preference: 'private-only', externalId: 'stable-entry' }) =>
  app.inject({ method: 'POST', url: '/api/ingest/items', headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    payload: { sourceId, items: [{ url, title, raw, publishedAt: new Date().toISOString() }] } });
const rows = (sourceId: string) => sql`SELECT * FROM articles WHERE source_id=${sourceId}`;

async function judge(id: string) {
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,score)
    SELECT id,revision,'rule','pass',title,'合成公开摘要',true,9 FROM articles WHERE id=${id}`;
  await sql`UPDATE articles SET grouping_status='complete',selection_adds_value=true WHERE id=${id}`;
  await publishArticle(id);
}
async function hidden(id: string) {
  const [p] = await sql`SELECT visibility,eligible,selected,indexable FROM publications WHERE article_id=${id}`;
  assert.ok(p);
  assert.deepEqual({ ...p }, { visibility: 'withdrawn', eligible: false, selected: false, indexable: false });
  for (const url of [`/api/site/items/${id}`, `/api/v1/items/${id}`]) {
    assert.equal((await app.inject(url)).statusCode, 404, url);
  }
  for (const url of ['/api/v1/items?mode=all', '/api/v1/items?mode=selected', '/api/site/pool', '/feed.xml']) {
    const res = await app.inject(url);
    assert.equal(res.statusCode, 200, url);
    assert.ok(!res.body.includes(id), url);
    assert.ok(!res.body.includes('private-only'), url);
    assert.ok(!res.body.includes('私有偏好'), url);
  }
  assert.equal((await sql`SELECT 1 FROM selected_ledger WHERE article_id=${id}`).length, 0);
}

for (const order of ['rss-first', 'private-first'] as const) test(`${order}: same and alias URLs retain two domains and independent revisions/discoveries`, async () => {
  const privateId = await source();
  const rss = await source('rss', 'editorial');
  process.env.INGEST_PRIVATE_SOURCE_IDS = privateId;
  const url = `https://${tag()}.example/news`;
  const alias = url.replace('https://', 'http://www.') + '?utm_source=private#fragment';
  const publicReport = () => upsertMaterial({ sourceId: rss, url, title: '公开报道', bodyText: 'Public body', raw: { public: true }, publishedAt: new Date(), via: 'fetch' });
  let publicId: string;
  if (order === 'rss-first') { publicId = (await publicReport()).articleId; assert.equal((await push(privateId, alias)).statusCode, 200); }
  else { assert.equal((await push(privateId, alias)).statusCode, 200); publicId = (await publicReport()).articleId; }
  const [privateRow] = await rows(privateId);
  assert.ok(privateRow, 'private material retains its own source');
  assert.notEqual(privateRow.id, publicId, 'global URL identity cannot merge domains');
  assert.equal((await push(privateId, url)).json().created, 0);
  assert.equal((await push(privateId, alias, '私有偏好更新')).json().created, 0);
  assert.equal((await push(privateId, url)).json().created, 0, 'old revision replay');
  const [current] = await rows(privateId);
  assert.equal(current!.revision, 2);
  assert.equal(current!.title, '私有偏好更新');
  const [pub] = await rows(rss);
  assert.equal(pub!.title, '公开报道');
  assert.deepEqual(pub!.raw, { public: true });
  for (const [id, expectedSource] of [[privateRow.id, privateId], [publicId, rss]]) {
    assert.deepEqual((await sql`SELECT source_id FROM article_discoveries WHERE article_id=${id}`).map(r => r.source_id), [expectedSource]);
  }
  await judge(privateRow.id); await hidden(privateRow.id);
  await judge(publicId);
  assert.equal((await app.inject(`/api/site/items/${publicId}`)).statusCode, 200);
  const list = await app.inject('/api/v1/items?mode=all');
  assert.ok(list.body.includes(publicId));
  assert.ok(!list.body.includes(privateRow.id));
});

for (const publisherFirst of [true, false]) test(`unique T1 ownership (${publisherFirst ? 'before' : 'after'} private insert) never promotes private material`, async () => {
  const p = await source();
  process.env.INGEST_PRIVATE_SOURCE_IDS = p;
  const scope = `https://${tag()}.example/official`;
  const official = () => source('rss', 'editorial', true, `official-${tag()}`, { publisherUrlPrefixes: [scope] }, 'T1');
  let rss = publisherFirst ? await official() : '';
  assert.equal((await push(p, `${scope}/release`)).statusCode, 200);
  const [a] = await rows(p);
  assert.ok(a, 'T1 cannot adopt a private first insert');
  if (!publisherFirst) rss = await official();
  await push(p, `${scope}/release`);
  assert.equal(await sql.begin(tx => reconcileMaterialSource(tx, a.id, { sourceId: p })), false);
  await judge(a.id); await hidden(a.id);
  // Durable boundary survives a source mode edit and removal of the optional ingress restriction.
  await sql`UPDATE sources SET participation_mode='editorial' WHERE id=${p}`;
  await sql`INSERT INTO editorial_overrides(article_id,visibility,fields)
    VALUES (${a.id},'public','{"selected":true,"relevance":"pass"}'::jsonb)`;
  delete process.env.INGEST_PRIVATE_SOURCE_IDS;
  assert.equal(await sql.begin(tx => reconcileMaterialSource(tx, a.id)), false);
  await publishArticle(a.id); await hidden(a.id);
  const pub = await upsertMaterial({ sourceId: rss, url: `${scope}/release`, title: '官方公开报道', via: 'fetch', publishedAt: new Date() });
  assert.notEqual(pub.articleId, a.id);
  await judge(pub.articleId);
  assert.equal((await app.inject(`/api/site/items/${pub.articleId}`)).statusCode, 200);
});

test('private source duplicates, concurrent aliases, stable external IDs and X URL aliases preserve private deduplication', async () => {
  const a = await source(), b = await source();
  process.env.INGEST_PRIVATE_SOURCE_IDS = `${a},${b}`;
  const url = `https://${tag()}.example/shared`;
  const replies = await Promise.all([push(a, url), push(b, url + '?utm_source=other')]);
  assert.deepEqual(replies.map(r => r.statusCode), [200, 200]);
  assert.equal(replies.reduce((n, r) => n + r.json().created, 0), 1);
  const [row] = await sql`SELECT * FROM articles WHERE source_id IN (${a},${b})`;
  assert.deepEqual((await sql`SELECT source_id FROM article_discoveries WHERE article_id=${row!.id} ORDER BY source_id`).map(r => r.source_id).sort(), [a, b].sort());
  const [candidate] = await reuseExternalMaterialIdentities(row!.source_id, [{ url: url + '/renamed', title: '私有偏好', raw: { externalId: 'stable-entry' } }]);
  const replay = await upsertMaterial({ ...candidate!, sourceId: row!.source_id, via: 'ingest' });
  assert.equal(replay.articleId, row!.id, 'reserved namespace is not applied twice');
  const publicSource = await source('rss', 'editorial');
  await assert.rejects(upsertMaterial({ ...candidate!, sourceId: publicSource, via: 'fetch' }), /private identity requires a private source/);
  const [stored] = await sql`SELECT title,raw FROM articles WHERE id=${row!.id}`;
  await push(row!.source_id === a ? b : a, url, 'Other private source rendering', { preference: 'different private preference' });
  assert.deepEqual((await sql`SELECT title,raw FROM articles WHERE id=${row!.id}`).map(r => ({ ...r })), [{ ...stored }], 'another discovery cannot revise the owner material');
  const tweet = '9876543210123456789';
  assert.equal((await push(a, `https://x.com/example/status/${tweet}`)).json().created, 1);
  assert.equal((await push(b, `https://mobile.twitter.com/example/status/${tweet}?utm_source=replay`)).json().created, 0);
  for (const r of await sql`SELECT id FROM articles WHERE source_id IN (${a},${b})`) { await judge(r.id); await hidden(r.id); }
});

for (const kind of ['unknown', 'not-allowed', 'rss', 'disabled', 'editorial', 'hot_signal', 'whitespace', 'empty', 'truncated', 'empty-config', 'invalid-config']) {
  test(`receiver rejects ${kind} before any write`, async () => {
    const allowed = await source();
    let target = allowed;
    if (kind === 'unknown') target = `missing-${tag()}`;
    if (kind === 'not-allowed') target = await source();
    if (kind === 'rss') target = await source('rss');
    if (kind === 'disabled') target = await source('external', 'isolated', false);
    if (kind === 'editorial') target = await source('external', 'editorial');
    if (kind === 'hot_signal') target = await source('external', 'hot_signal');
    if (kind === 'whitespace') target = ` ${allowed} `;
    if (kind === 'empty') target = '   ';
    if (kind === 'truncated') { target = await source('external', 'isolated', true, 'x'.repeat(120)); target += 'collision'; }
    process.env.INGEST_PRIVATE_SOURCE_IDS = kind === 'empty-config' ? '' : kind === 'invalid-config' ? `${allowed},` : [allowed, target.trim()].filter(s => s.length <= 120 && s && (kind !== 'not-allowed' || s === allowed)).join(',');
    const before = await sql`SELECT id,last_ok_at,last_fetch_at FROM sources ORDER BY id`;
    const counts = () => sql`SELECT (SELECT count(*) FROM articles) AS articles,(SELECT count(*) FROM article_discoveries) AS discoveries,(SELECT count(*) FROM ingest_events) AS events`;
    const previous = await counts();
    const res = await push(target, `https://${tag()}.example/rejected`);
    assert.ok([400,403,409].includes(res.statusCode), `${kind} returned ${res.statusCode}`);
    assert.deepEqual(await sql`SELECT id,last_ok_at,last_fetch_at FROM sources ORDER BY id`, before, 'even source health/create must be unchanged');
    assert.deepEqual(await counts(), previous);
  });
}

test('unset private restriction preserves ordinary external ingest and public publisher attribution', async () => {
  delete process.env.INGEST_PRIVATE_SOURCE_IDS;
  const scope = `https://${tag()}.example/news`;
  const rss = await source('rss', 'editorial', true, `rss-${tag()}`, { publisherUrlPrefixes: [scope] }, 'T1');
  const external = await source('external', 'editorial');
  assert.equal((await push(external, `${scope}/release`, '公开外部报道', { public: true })).statusCode, 200);
  const [a] = await rows(rss);
  assert.ok(a); await judge(a.id);
  assert.equal((await app.inject(`/api/site/items/${a.id}`)).statusCode, 200);
});
