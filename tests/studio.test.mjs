import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudioService, studioStarters, studioHooks, validateStudioResult } from '../lib/studio.mjs';
import { createStudioStore } from '../lib/studio-storage.mjs';
import { studioRequest } from '../lib/studio-ai.mjs';
import { memoryStudioStore, studioFixture, fakeStudioGenerate } from './studio-fixtures.mjs';

const request = { kind: 'script', seriesId: 'starter:run-small-ai-team', episodeId: 'ep:s0', audience: 'Non-technical first-time builders', confirmCost: true };
function setup(options = {}) {
  let calls = 0; let lastContext;
  const store = options.store || memoryStudioStore();
  const service = createStudioService({ store, readLibrary: async () => structuredClone(studioFixture), configured: () => true, now: () => Date.parse('2026-09-27T12:00:00Z'), generate: async (kind, context) => { calls++; lastContext = context; return fakeStudioGenerate(kind, context); }, ...options });
  return { service, store, calls: () => calls, context: () => lastContext };
}
test('free starters and per-series briefs never call AI; incomplete or non-knowledge saves are excluded', async () => {
  const app = setup();
  const data = await app.service.list();
  assert.equal(data.starters[0].episodes.length, 4);
  assert.equal(data.starters[0].audience, '');
  await app.service.keep({ seriesId: request.seriesId, kept: true });
  await app.service.brief({ seriesId: request.seriesId, audience: 'Students learning SQL', direction: 'Practice, not theory' });
  const updated = await app.service.list();
  assert.equal(updated.kept.length, 1);
  assert.equal(updated.briefs[request.seriesId].audience, 'Students learning SQL');
  assert.equal(app.calls(), 0);
  const library = structuredClone(studioFixture);
  library.captures.forEach((c, i) => { if (i > 0) c.sourceCoverage = 'insufficient'; });
  assert.deepEqual(studioStarters(library), []);
  library.captures[1].sourceCoverage = 'complete'; library.captures[1].intents = ['creator'];
  assert.deepEqual(studioStarters(library), []);
});
test('explicit consent, audience, valid episode and configured provider required before spending', async () => {
  const app = setup();
  for (const body of [{ ...request, confirmCost: false }, { ...request, audience: '' }, { ...request, episodeId: 'missing' }, { ...request, kind: 'anything' }]) await assert.rejects(app.service.run(body), (e) => e.status === 400);
  const disconnected = setup({ configured: () => false });
  await assert.rejects(disconnected.service.run(request), (e) => e.status === 503);
  assert.equal((await disconnected.service.list()).used, 0);
  assert.equal(app.calls(), 0);
});
test('generation context is compact, preserves each audience, and omits full transcripts', async () => {
  const app = setup();
  const result = await app.service.run(request);
  assert.equal(result.status, 'ready');
  assert.equal(app.context().brief.audience, request.audience);
  assert.equal(app.context().sources.length, 6);
  assert.ok(JSON.stringify(app.context()).length < 12000);
  assert.ok(!JSON.stringify(app.context()).includes('private transcript'));
  assert.equal(app.context().research, null);
  const series = await app.service.run({ ...request, kind: 'series', direction: 'Show the actual workflow', personalContext: 'I am learning SQL.' });
  const restored = (await app.service.list()).briefs[series.id];
  assert.equal(restored.direction, 'Show the actual workflow');
  assert.equal(restored.personalContext, 'I am learning SQL.');
});
test('kept episode outlines stay stable when the playbook gains different sources', async () => {
  let library = structuredClone(studioFixture);
  const app = setup({ readLibrary: async () => library });
  await app.service.keep({ seriesId: request.seriesId, kept: true });
  library.playbooks[0].sourceIds.reverse();
  assert.equal((await app.service.run(request)).status, 'ready');
  assert.equal(app.context().episode.id, 'ep:s0');
});
test('identical and concurrent requests spend once; cache survives a new service instance', async () => {
  const app = setup();
  await Promise.all([app.service.run(request), app.service.run(request), app.service.run(request)]);
  assert.equal(app.calls(), 1);
  assert.equal((await app.service.list()).used, 1);
  const reopened = setup({ store: app.store });
  const cached = await reopened.service.run(request);
  assert.equal(cached.cached, true); assert.equal(reopened.calls(), 0);
  await reopened.service.edit({ id: cached.id, script: 'My edited original script.' });
  const draft = (await reopened.service.list()).drafts[0];
  assert.equal(draft.editedScript, 'My edited original script.');
  assert.notEqual(draft.result.script, draft.editedScript);
  assert.equal((await reopened.service.list()).used, 1);
});
test('daily budget is shared across actions; blocked requests can run after reset', async () => {
  let now = Date.parse('2026-09-27T12:00:00Z');
  const app = setup({ limit: 2, now: () => now });
  await app.service.run(request);
  await app.service.run({ ...request, kind: 'series' });
  await assert.rejects(app.service.run({ ...request, kind: 'research' }), (e) => e.status === 429);
  assert.equal(app.calls(), 2);
  now += 86400000;
  assert.equal((await app.service.run({ ...request, kind: 'research' })).status, 'ready');
  assert.equal(app.calls(), 3);
});
test('provider failure spends one reservation, retains earlier scripts and never auto-retries', async () => {
  const app = setup();
  await app.service.run(request);
  let calls = 0;
  const failed = setup({ store: app.store, generate: async () => { calls++; throw new Error('secret-provider-key'); } });
  const body = { ...request, direction: 'A new version' };
  const result = await failed.service.run(body);
  assert.equal(result.status, 'failed'); assert.ok(!result.error.includes('secret-provider-key'));
  await failed.service.run(body); assert.equal(calls, 1);
  const data = await failed.service.list();
  assert.equal(data.used, 2); assert.equal(data.drafts.filter((d) => d.status === 'ready').length, 1);
});
test('research must be explicitly attached and belong to the same episode', async () => {
  const app = setup();
  const research = await app.service.run({ ...request, kind: 'research' });
  await app.service.run(request); assert.equal(app.context().research, null);
  await app.service.run({ ...request, researchId: research.id });
  assert.equal(app.context().research.id, research.id);
  await assert.rejects(app.service.run({ ...request, episodeId: 'ep:s1', researchId: research.id }), (e) => e.status === 400);
  assert.equal(app.calls(), 3);
});
test('source validation rejects invented citations and dangerous research links', () => {
  assert.throws(() => validateStudioResult('script', { script: 'text', hooks: ['hook'], sourceIds: ['invented'] }, [{ id: 'real' }]));
  assert.throws(() => validateStudioResult('research', { blocks: [{ text: 'claim', citations: [{ url: 'javascript:alert(1)' }] }] }, []));
  const output = validateStudioResult('research', { blocks: Array.from({ length: 16 }, () => ({ text: 'a'.repeat(2000), citations: [{ url: 'https://example.com', title: 'Source' }] })) }, []);
  assert.ok(output.blocks.reduce((sum, b) => sum + b.text.length, 0) <= 4000);
  assert.throws(() => studioHooks(studioFixture.captures, [], 'missing'));
});
test('web tools only exist on explicit research, limited to one search; scripts prohibit fictional experience', () => {
  const context = { episode: { title: 'AI task' }, series: { title: 'AI helper' }, sources: [{ title: 'task', summary: 'handoffs' }], brief: { personalContext: 'PRIVATE_MARKER' } };
  for (const kind of ['series', 'script']) assert.equal(studioRequest(kind, context, 'model').tools, undefined);
  const research = studioRequest('research', context, 'model');
  assert.equal(research.tools[0].max_uses, 1);
  assert.ok(!research.messages[0].content.includes('PRIVATE_MARKER'));
  assert.match(studioRequest('script', context, 'model').system, /Never invent/);
});
test('local store persists claims, drafts and budgets; cloud without a DB fails closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spool-studio-test-'));
  try {
    const file = join(dir, 'nested', 'studio.json');
    const first = createStudioStore({ file, databaseUrl: '', vercel: false });
    assert.equal(await first.claim('draft:x', { id: 'draft:x', status: 'pending' }), true);
    assert.equal(await first.claim('draft:x', {}), false);
    await first.put('draft:x', { id: 'draft:x', status: 'ready' });
    assert.equal(await first.reserve('today', 1), true);
    assert.equal(await first.reserve('today', 1), false);
    const second = createStudioStore({ file, databaseUrl: '', vercel: false });
    assert.equal((await second.get('draft:x')).status, 'ready');
    assert.equal(await second.used('today'), 1);
    await second.releaseUnspent('draft:x'); assert.ok(await second.get('draft:x'));
    await assert.rejects(createStudioStore({ databaseUrl: '', vercel: true }).list(), /connected database/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Studio HTTP routes require the configured access token for reads and writes', async () => {
  const previousVercel = process.env.VERCEL;
  const previousToken = process.env.SPOOL_CAPTURE_TOKEN;
  process.env.VERCEL = '1';
  process.env.SPOOL_CAPTURE_TOKEN = 'test-only-studio-access';
  try {
    const { handleApi } = await import('../server.mjs');
    for (const [method, path] of [['GET', '/api/studio'], ['POST', '/api/studio/generate']]) {
      let status; let payload;
      await handleApi({ method, headers: { host: 'localhost' } }, { writeHead: (code) => { status = code; }, end: (body) => { payload = JSON.parse(body); } }, path);
      assert.equal(status, 401); assert.equal(payload.protected, true);
      assert.ok(!JSON.stringify(payload).includes(process.env.SPOOL_CAPTURE_TOKEN));
    }
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    if (previousToken === undefined) delete process.env.SPOOL_CAPTURE_TOKEN; else process.env.SPOOL_CAPTURE_TOKEN = previousToken;
  }
});
