import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateSite, fixtureFetch } from '../index.js';
import { main } from '../bin/aiax-validate.js';

const fx = (p) => fileURLToPath(new URL(`../fixtures/${p}`, import.meta.url));
const run = (dir, url = 'https://example.test') => validateSite(url, { fetch: fixtureFetch(fx(dir)) });
const has = (r, path, word) => r.errors.some((e) => e.path === path && e.message.includes(word));
const sink = () => { let s = ''; return { write: (x) => { s += x; }, get text() { return s; } }; };

test('A1 passes on lax.kognai.ai and www.kognai.ai (recorded 2026-10-23)', async () => {
  for (const site of ['lax.kognai.ai', 'www.kognai.ai']) {
    const r = await run(site, `https://${site}`);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.ok(r.score >= 90);
    assert.equal(r.manifest_url, `https://${site}/.well-known/aiax.json`);
    assert.ok(r.sections.length >= 5 && r.sections.every((s) => s.ok));
    assert.equal(await main([`https://${site}`, '--fixtures', fx(site)], sink(), sink()), 0);
  }
});

test('A2 a broken manifest fails with one clear message per problem, naming its field', async () => {
  const r = await run('broken/manifest');
  assert.equal(r.ok, false);
  assert.ok(has(r, '/updated_at', 'updated_at is required'));
  assert.ok(has(r, '/product/name', 'product.name must be of type string'));
  assert.ok(has(r, '/homepage', 'homepage is not an allowed field'));
  assert.ok(has(r, '/entry_points/2/id', 'entry_points.2.id'));
  assert.equal(r.errors.filter((e) => e.path === '/product/name').length, 1);
  assert.ok(r.score < 100);
});

test('A2 a site without a manifest fails with score 0', async () => {
  const r = await run('broken/missing');
  assert.equal(r.ok, false); assert.equal(r.score, 0); assert.equal(r.manifest_url, null);
  assert.match(r.errors[0].message, /no AIAX manifest/);
});

test('A3 a broken section fails with clear messages', async () => {
  const r = await run('broken/sections');
  assert.equal(r.ok, false);
  const sec = Object.fromEntries(r.sections.map((s) => [s.id, s]));
  assert.match(sec.lax_offer.errors[0].message, /not valid JSON/);
  assert.match(sec.lax_job_submit.errors[0].message, /could not be fetched \(HTTP 404\)/);
  assert.ok(sec.lax_search.errors.some((e) => e.path === '/purpose' && /purpose is required/.test(e.message)));
  assert.ok(sec.lax_jobs.errors.some((e) => e.path === '/pricing/amount'));
  assert.ok(sec.trust.errors.some((e) => /section_id "trust_v2" differs from its entry point id "trust"/.test(e.message)));
});

test('A3 entry point urls resolve against the manifest url (fallback location)', async () => {
  const r = await run('broken/fallback');
  assert.equal(r.manifest_url, 'https://example.test/aiax/manifest.json');
  assert.equal(r.sections[0].url, 'https://example.test/aiax/sections/lax_offer.json');
  assert.equal(r.ok, true); assert.equal(r.warnings.length, 1); assert.ok(r.score < 100 && r.score >= 90);
});

test('A3 a fetch that throws is reported, never thrown', async () => {
  const r = await validateSite('https://down.test', { fetch: async () => { throw new Error('offline'); } });
  assert.equal(r.ok, false); assert.match(r.errors[0].message, /no AIAX manifest/);
});

test('A4 --json prints the report and exit codes are 0, 1 and 2', async () => {
  const out = sink();
  assert.equal(await main(['https://example.test', '--json', '--fixtures', fx('broken/sections')], out, sink()), 1);
  const rep = JSON.parse(out.text);
  for (const k of ['url', 'manifest_url', 'ok', 'score', 'errors', 'warnings', 'sections']) assert.ok(k in rep, k);
  const plain = sink();
  assert.equal(await main(['https://example.test', '--fixtures', fx('broken/manifest')], plain, sink()), 1);
  assert.ok(plain.text.split('\n').filter((l) => l.startsWith('error ')).length >= 4);
  assert.equal(await main([], sink(), sink()), 2);
  assert.equal(await main(['a', 'b'], sink(), sink()), 2);
  assert.equal(await main(['https://x.test', '--bogus'], sink(), sink()), 2);
  assert.equal(await main(['https://x.test', '--fixtures'], sink(), sink()), 2);
});

test('A5 the broken fixtures ship in the repository and the package exposes the bin', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.bin['aiax-validate'], 'bin/aiax-validate.js');
  for (const d of ['broken/manifest/.well-known/aiax.json', 'broken/sections/aiax/sections/trust.json']) await readFile(fx(d));
});

test.todo('A5 published to npm (after selection, with the PACT name)');
