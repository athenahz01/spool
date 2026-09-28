import { createHash } from 'node:crypto';
import { safeText } from './processing.mjs';

const text = (value, limit = 300) => safeText(typeof value === 'string' ? value : '', limit).trim();
const strings = (value, count = 4, limit = 220) => (Array.isArray(value) ? value : []).slice(0, count).map((v) => text(v, limit)).filter(Boolean);
const unique = (values) => [...new Set(values)];
export const safeSourceUrl = (value) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } };
export const verifiedKnowledge = (c) => c.status === 'ready' && c.sourceCoverage !== 'insufficient' && (!Array.isArray(c.intents) || c.intents.includes('knowledge')) && Boolean(c.summary || c.takeaways?.length);
const compact = (c) => ({ id: c.id, title: text(c.title, 130) || 'Saved idea', creator: text(c.creator, 80), url: safeSourceUrl(c.url), summary: text(c.summary, 450), takeaways: strings(c.takeaways, 3, 160), action: text(c.action, 200) });
const seriesNames = {
  'run-small-ai-team': ['A tiny AI team', 'One job, one useful AI helper at a time.'],
  'personal-content-engine': ['Behind the post', 'Break down one content choice, then try an original version.'],
  'build-career-proof': ['Show your work', 'Small projects and decisions that make your skills visible.'],
  'create-lifestyle-reels': ['Ordinary days, better stories', 'Find a story in a small, real moment from everyday life.'],
  'find-launch-ideas': ['Worth building?', 'Test a small idea before turning it into a full product.'],
  'technical-experiment-lab': ['One small experiment', 'Make an unfamiliar technical idea tangible.'],
  'network-with-substance': ['Better conversations', 'Practical ways to start and sustain meaningful connections.'],
  'build-data-fluency': ['Data, one useful skill at a time', 'A learn-by-doing series for understanding data.'],
  'shape-memorable-brand': ['A brand with a point of view', 'One clear creative decision in each episode.'],
  'understand-ai-foundations': ['AI without the fog', 'Explain one AI concept through a concrete example.']
};

export function studioStarters(library) {
  const byId = new Map(library.captures.filter(verifiedKnowledge).map((c) => [c.id, c]));
  return (library.playbooks || []).flatMap((p) => {
    const sources = unique(p.sourceIds || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 6);
    if (sources.length < 2) return [];
    const [title, promise] = seriesNames[p.id] || [p.title, p.outcome];
    return [{ id: `starter:${p.id}`, origin: 'starter', title, promise, audience: '', format: '45–60 seconds', sourceIds: sources.map((s) => s.id), sources: sources.map(compact), episodes: sources.slice(0, 4).map((s, i) => ({ id: `ep:${s.id}`, title: text(s.topic || s.title, 130), angle: text(s.takeaways?.[0] || s.summary, 250), payoff: text(s.action, 200) || 'Show one concrete example, then one step to try.', sourceIds: [s.id], number: i + 1 })) }];
  });
}

export function studioHooks(captures, sources, requestedId) {
  const terms = new Set(sources.flatMap((s) => `${s.title} ${s.summary}`.toLowerCase().match(/[a-z]{4,}/g) || []));
  const eligible = captures.filter((c) => c.status === 'ready' && c.transcriptStatus === 'ready' && c.transcript?.trim()).map((c) => ({ id: c.id, hook: text(c.hook || c.transcript.split(/[.!?]\s/)[0], 260), title: text(c.title, 130), creator: text(c.creator, 80), url: safeSourceUrl(c.url), score: (sources.some((s) => s.id === c.id) ? 100 : 0) + unique(`${c.title} ${c.hook}`.toLowerCase().match(/[a-z]{4,}/g) || []).filter((t) => terms.has(t)).length }));
  eligible.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (requestedId && !eligible.some((h) => h.id === requestedId)) throw new StudioError(400, 'That hook is no longer available. Choose another saved hook.');
  return (requestedId ? eligible.filter((h) => h.id === requestedId) : eligible.slice(0, 3)).map(({ score, ...hook }) => hook);
}

export class StudioError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function studioDay(now) { return new Date(now).toISOString().slice(0, 10); }
export function draftKey(kind, context) { return `draft:${createHash('sha256').update(JSON.stringify({ version: 1, kind, context })).digest('hex')}`; }

export function validateStudioResult(kind, result, sources) {
  if (kind === 'research') {
    let remaining = 4000;
    const blocks = (Array.isArray(result?.blocks) ? result.blocks : []).slice(0, 16).map((b) => { const content = text(b.text, Math.max(0, Math.min(1600, remaining))); remaining -= content.length; return { text: content, citations: (Array.isArray(b.citations) ? b.citations : []).slice(0, 8).map((c) => ({ title: text(c.title, 160), url: safeSourceUrl(c.url) })).filter((c) => c.url) }; }).filter((b) => b.text);
    if (!blocks.length || !blocks.some((b) => b.citations.length)) throw new StudioError(502, 'Research returned no cited evidence. No automatic retry was made; your existing work is safe.');
    return { blocks };
  }
  const allowed = new Set(sources.map((s) => s.id));
  const ids = (value) => unique(strings(value, 6, 150)).filter((id) => allowed.has(id));
  if (kind === 'series') {
    const episodes = (Array.isArray(result?.episodes) ? result.episodes : []).slice(0, 6).map((e, i) => ({ id: `episode-${i + 1}`, number: i + 1, title: text(e.title, 130), angle: text(e.angle, 350), payoff: text(e.payoff, 250), sourceIds: ids(e.sourceIds) }));
    if (!text(result?.title) || episodes.length !== 4 || episodes.some((e) => !e.title || !e.angle || !e.sourceIds.length)) throw new StudioError(502, 'The series outline was incomplete. Your existing ideas are safe; no automatic retry was made.');
    return { title: text(result.title, 130), promise: text(result.promise, 350), episodes, sourceIds: unique(episodes.flatMap((e) => e.sourceIds)) };
  }
  const sourceIds = ids(result?.sourceIds);
  if (!text(result?.script) || strings(result?.hooks, 3).length !== 3 || !sourceIds.length) throw new StudioError(502, 'The script was incomplete or had no valid source references. No automatic retry was made.');
  return { hooks: strings(result.hooks, 3, 260), script: text(result.script, 6500), caption: text(result.caption, 1500), shots: strings(result.shots, 6, 240), factChecks: strings(result.factChecks, 6, 300), sourceIds };
}

export function createStudioService({ store, readLibrary, generate, configured = () => Boolean(process.env.ANTHROPIC_API_KEY), now = Date.now, limit = 6 }) {
  const dailyLimit = Math.max(1, Math.min(12, Math.floor(Number(limit) || 6)));
  async function seriesFor(id, library) {
    const stored = await store.get(id);
    if (stored?.kind === 'series' && stored.status === 'ready') return { ...stored.result, id, origin: 'generated', sources: stored.sources, audience: stored.brief.audience, format: stored.brief.format };
    const kept = await store.get(`kept:${id}`);
    if (kept?.kept && kept.series) return kept.series;
    return studioStarters(library).find((s) => s.id === id);
  }
  return {
    async list() {
      const [library, records, used] = await Promise.all([readLibrary(), store.list(), store.used(studioDay(now()))]);
      return { starters: studioStarters(library), drafts: records.filter((r) => r.id?.startsWith('draft:')).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((r) => ({ ...r, editedScript: records.find((e) => e.id === `edit:${r.id}`)?.script })), briefs: Object.fromEntries([...records.filter((r) => r.kind === 'series' && r.status === 'ready').map((r) => [r.id, r.brief]), ...records.filter((r) => r.kind === 'brief').map((r) => [r.seriesId, r.brief])]), hooks: library.captures.filter((c) => c.status === 'ready' && c.transcriptStatus === 'ready' && c.transcript?.trim()).slice(0, 200).map((c) => ({ id: c.id, title: text(c.title, 130), hook: text(c.hook || c.transcript.split(/[.!?]\s/)[0], 260), url: safeSourceUrl(c.url) })), kept: records.filter((r) => r.kind === 'kept' && r.kept).map((r) => r.series), configured: configured(), dailyLimit, used, resetsAt: new Date(Date.parse(`${studioDay(now())}T00:00:00Z`) + 86400000).toISOString() };
    },
    async brief(body) {
      const seriesId = text(body.seriesId, 150);
      if (!await seriesFor(seriesId, await readLibrary()) && !(await store.get(`kept:${seriesId}`))?.series) throw new StudioError(404, 'Series not found.');
      const brief = { audience: text(body.audience, 180), voice: text(body.voice, 220), direction: text(body.direction, 600), personalContext: text(body.personalContext, 700), format: ['30 seconds', '45–60 seconds', '60–90 seconds'].includes(body.format) ? body.format : '45–60 seconds' };
      await store.put(`brief:${seriesId}`, { id: `brief:${seriesId}`, kind: 'brief', seriesId, brief });
      return { brief };
    },
    async edit(body) {
      const draft = await store.get(text(body.id, 150));
      if (draft?.kind !== 'script' || draft.status !== 'ready') throw new StudioError(404, 'Script not found.');
      const script = text(body.script, 6500);
      if (!script) throw new StudioError(400, 'The script cannot be empty.');
      await store.put(`edit:${draft.id}`, { id: `edit:${draft.id}`, kind: 'edit', script });
      return { script };
    },
    async keep(body) {
      const series = await seriesFor(text(body.seriesId, 150), await readLibrary());
      const existing = await store.get(`kept:${text(body.seriesId, 150)}`);
      if (!series && !existing) throw new StudioError(404, 'This series is no longer available. Refresh Content Studio.');
      await store.put(`kept:${body.seriesId}`, { id: `kept:${body.seriesId}`, kind: 'kept', kept: body.kept === true, series: series || existing.series });
      return { kept: body.kept === true };
    },
    async job(id) { const result = await store.get(id); if (!result || !id.startsWith('draft:')) throw new StudioError(404, 'Draft not found.'); return result; },
    async run(body) {
      if (body.confirmCost !== true) throw new StudioError(400, 'Confirm the Claude request before generating.');
      if (!['series', 'script', 'research'].includes(body.kind)) throw new StudioError(400, 'Choose a series, script, or research request.');
      const library = await readLibrary();
      let series = await seriesFor(text(body.seriesId, 150), library);
      if (!series) series = (await store.get(`kept:${text(body.seriesId, 150)}`))?.series;
      if (!series) throw new StudioError(404, 'This series is no longer available. Refresh Content Studio.');
      const episode = body.kind === 'series' ? null : series.episodes.find((e) => e.id === body.episodeId);
      if (body.kind !== 'series' && !episode) throw new StudioError(400, 'Choose an episode first.');
      const sourceIds = episode ? unique([...episode.sourceIds, ...series.sourceIds]).slice(0, 6) : series.sourceIds.slice(0, 6);
      const sources = sourceIds.map((id) => library.captures.find((c) => c.id === id && verifiedKnowledge(c))).filter(Boolean).map(compact);
      if (!sources.length || (body.kind === 'series' && sources.length < 2)) throw new StudioError(400, 'Not enough verified knowledge remains for this draft. Add or finish processing a supporting save first.');
      if (!text(body.audience, 180)) throw new StudioError(400, 'Who is this series for? Add an audience before generating.');
      const brief = { audience: text(body.audience, 180), voice: text(body.voice, 220) || 'Conversational, specific, curious; no hype.', direction: text(body.direction, 600), personalContext: text(body.personalContext, 700), format: ['30 seconds', '45–60 seconds', '60–90 seconds'].includes(body.format) ? body.format : '45–60 seconds' };
      const hooks = body.kind === 'script' ? studioHooks(library.captures, sources, text(body.hookId, 150)) : [];
      let research = null;
      if (body.kind === 'script' && body.researchId) {
        const record = await store.get(text(body.researchId, 150));
        if (record?.kind !== 'research' || record.status !== 'ready' || record.seriesId !== series.id || record.episodeId !== episode.id) throw new StudioError(400, 'Choose research saved for this episode.');
        research = { id: record.id, createdAt: record.createdAt, blocks: record.result.blocks };
      }
      const context = { series: { id: series.id, title: series.title, promise: series.promise }, episode, brief, sources, hooks, research };
      const id = draftKey(body.kind, context);
      const previous = await store.get(id);
      if (previous) return { ...previous, cached: previous.status === 'ready' };
      if (!configured()) throw new StudioError(503, 'Claude is not connected. You can still explore and keep the free series starters.');
      const record = { id, kind: body.kind, seriesId: series.id, seriesTitle: series.title, episodeId: episode?.id || '', episodeTitle: episode?.title || '', brief, sources, hooks, research, status: 'pending', createdAt: new Date(now()).toISOString() };
      if (!await store.claim(id, record)) return { ...await store.get(id), cached: false };
      // Reserve before the provider call. Failed/ambiguous requests also count; never silently retry.
      if (!await store.reserve(studioDay(now()), dailyLimit)) {
        await store.releaseUnspent(id);
        throw new StudioError(429, 'Studio reached its daily request limit. Saved drafts and free ideas still work. Try again after the next UTC reset.');
      }
      try {
        const output = await generate(body.kind, context);
        const result = validateStudioResult(body.kind, output.result, sources);
        const completed = { ...record, status: 'ready', result, model: output.model, usage: output.usage };
        await store.put(id, completed);
        return completed;
      } catch (error) {
        const failed = { ...record, status: 'failed', error: error instanceof StudioError ? error.message : 'Claude could not finish this draft. Credits may have been used. Your earlier work is safe. Change the brief to explicitly request a new version; Spool will not retry automatically.' };
        await store.put(id, failed);
        return failed;
      }
    }
  };
}
