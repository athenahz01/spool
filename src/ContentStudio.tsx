import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, ChevronRight, Copy, ExternalLink, Feather, FileText, Search } from 'lucide-react';

type Source = { id: string; title: string; creator?: string; url: string; summary: string };
type Episode = { id: string; number: number; title: string; angle: string; payoff: string; sourceIds: string[] };
type Series = { id: string; origin: string; title: string; promise: string; audience: string; format: string; sources: Source[]; sourceIds: string[]; episodes: Episode[] };
type Brief = { audience: string; voice: string; direction: string; personalContext: string; format: string };
type ResearchBlock = { text: string; citations: { title: string; url: string }[] };
type Result = { title?: string; promise?: string; episodes?: Episode[]; sourceIds?: string[]; hooks?: string[]; script?: string; caption?: string; shots?: string[]; factChecks?: string[]; blocks?: ResearchBlock[] };
type Draft = { id: string; kind: 'series' | 'script' | 'research'; seriesId: string; episodeId: string; episodeTitle: string; status: string; error?: string; result?: Result; brief: Brief; sources: Source[]; hooks: { id: string; title: string; hook: string; url: string }[]; research?: { blocks: ResearchBlock[] }; createdAt: string; editedScript?: string; cached?: boolean };
type StudioData = { starters: Series[]; kept: Series[]; drafts: Draft[]; briefs: Record<string, Brief>; hooks: { id: string; title: string; hook: string; url: string }[]; configured: boolean; protected?: boolean; preview?: boolean; dailyLimit: number; used: number; resetsAt: string };
const defaultBrief = (series: Series): Brief => ({ audience: series.audience || '', voice: 'Conversational, specific, curious; no hype.', direction: '', personalContext: '', format: series.format || '45–60 seconds' });
const browserRead = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const browserWrite = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Server save remains available when browser storage is blocked. */ } };
const browserRemove = (key: string) => { try { localStorage.removeItem(key); } catch { /* Browser storage may be blocked. */ } };

function Sources({ sources }: { sources: Source[] }) {
  return <details className="studio-sources"><summary>{sources.length} supporting saves</summary><ul>{sources.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title} <ExternalLink size={12} /></a>{s.creator && <small>{s.creator}</small>}</li>)}</ul><p>These are saved creator claims, not independently verified facts.</p></details>;
}
function Research({ blocks }: { blocks: ResearchBlock[] }) {
  return <div className="studio-research-notes">{blocks.map((b, i) => <div key={i}><p>{b.text}</p>{b.citations.map((c, n) => <a key={`${c.url}-${n}`} href={c.url} target="_blank" rel="noreferrer">{c.title || new URL(c.url).hostname} <ExternalLink size={12} /></a>)}</div>)}</div>;
}

export default function ContentStudio() {
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  const [keptOnly, setKeptOnly] = useState(false);
  const [brief, setBrief] = useState<Brief>({ audience: '', voice: '', direction: '', personalContext: '', format: '45–60 seconds' });
  const [hookId, setHookId] = useState('');
  const [includeResearch, setIncludeResearch] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [script, setScript] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [requiresAccess, setRequiresAccess] = useState(false);
  const tokenRef = useRef('');
  const lock = useRef(false);
  const audienceRef = useRef<HTMLInputElement>(null);
  const reload = useCallback(async () => {
    const response = await fetch('/api/studio', { headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {} });
    const payload = await response.json();
    if (response.status === 401) setRequiresAccess(true);
    if (!response.ok) throw new Error(payload.error || 'Studio could not load. Try again.');
    setData(payload as StudioData);
    return payload as StudioData;
  }, []);
  useEffect(() => { void reload().catch((e: Error) => setError(e.message)); }, [reload]);
  const pending = data?.drafts.some((d) => d.status === 'pending' && Date.now() - Date.parse(d.createdAt) < 120000);
  useEffect(() => { if (!pending) return; const timer = window.setInterval(() => { void reload().catch(() => {}); }, 6000); return () => clearInterval(timer); }, [pending, reload]);
  const allSeries = useMemo(() => {
    if (!data) return [];
    const generated: Series[] = data.drafts.filter((d) => d.kind === 'series' && d.status === 'ready').map((d) => ({ id: d.id, origin: 'generated', title: d.result!.title!, promise: d.result!.promise!, episodes: d.result!.episodes!, sourceIds: d.result!.sourceIds!, sources: d.sources, audience: d.brief.audience, format: d.brief.format }));
    return [...new Map([...data.starters, ...data.kept, ...generated].map((s) => [s.id, s])).values()];
  }, [data]);
  const visibleSeries = allSeries.filter((s) => !keptOnly || s.origin === 'generated' || data?.kept.some((k) => k.id === s.id));
  const series = allSeries.find((s) => s.id === selectedId) || visibleSeries[0];
  const episode = series?.episodes.find((e) => e.id === episodeId) || series?.episodes[0];
  useEffect(() => {
    if (!series || !data) return;
    setBrief(browserRead(`spool-studio-brief:${series.id}`, data.briefs[series.id] || defaultBrief(series)));
    setEpisodeId(''); setHookId(''); setIncludeResearch(false); setDraftId('');
    // Restore only when changing series; polling must not overwrite an in-progress brief.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series?.id]);
  const episodeDrafts = data?.drafts.filter((d) => d.seriesId === series?.id && d.episodeId === episode?.id) || [];
  const scripts = episodeDrafts.filter((d) => d.kind === 'script' && d.status === 'ready');
  const draft = scripts.find((d) => d.id === draftId) || scripts[0];
  const research = episodeDrafts.find((d) => d.kind === 'research' && d.status === 'ready');
  useEffect(() => { setScript(draft ? browserRead(`spool-studio-script:${draft.id}`, draft.editedScript ?? draft.result?.script ?? '') : ''); }, [draft?.id, draft?.editedScript]);
  const workInProgress = data?.drafts.find((d) => d.seriesId === series?.id && d.status === 'pending');
  const lastFailure = data?.drafts.find((d) => d.seriesId === series?.id && d.status === 'failed');
  const changeBrief = (key: keyof Brief, value: string) => { const next = { ...brief, [key]: value }; setBrief(next); if (series) browserWrite(`spool-studio-brief:${series.id}`, next); };
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`/api/studio/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Studio could not save this change.');
    const saved = body as { seriesId?: string; id?: string };
    if (path === 'brief' && saved.seriesId) {
      browserRemove(`spool-studio-brief:${saved.seriesId}`);
      setData((current) => current ? { ...current, briefs: { ...current.briefs, [saved.seriesId!]: payload.brief } } : current);
    }
    if (path === 'edit' && saved.id) browserRemove(`spool-studio-script:${saved.id}`);
    return payload;
  };
  const act = async (name: string, task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(name); setError(''); setNotice('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Your saved drafts are unchanged.'); }
    finally { lock.current = false; setBusy(''); }
  };
  const generate = (kind: Draft['kind']) => {
    if (!series || !episode) return;
    if (!brief.audience.trim()) { setError('Who is this series for? Add its audience first.'); audienceRef.current?.focus(); return; }
    void act(kind, async () => {
      await post('brief', { seriesId: series.id, ...brief });
      const result: Draft = await post('generate', { kind, seriesId: series.id, episodeId: episode.id, ...brief, hookId, researchId: includeResearch ? research?.id : undefined, confirmCost: true });
      await reload();
      if (result.status === 'failed') { setError(result.error || 'The draft could not finish.'); return; }
      if (result.status === 'pending') { setNotice('This request is already running. Spool is checking for its saved result, not starting another request.'); return; }
      if (kind === 'series') setSelectedId(result.id);
      if (kind === 'script') setDraftId(result.id);
      setNotice(result.cached ? 'Opened your saved result. No new Claude request.' : kind === 'research' ? 'Research saved. Choose whether to use it in the next script.' : 'Saved to your Studio. Reopening this will not use credits.');
    });
  };
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setNotice('Copied.'); } catch { setError('Copy was blocked by your browser. Select the text and copy it manually.'); } };
  const isKept = Boolean(data?.kept.some((s) => s.id === series?.id));
  return <section className="content-studio" aria-labelledby="studio-title">
    <header className="studio-heading"><div><span className="studio-eyebrow"><Feather size={15} /> Content Studio</span><h1 id="studio-title">Something worth sharing.</h1><p>Turn what you save into a series only you could make.</p></div><div className="studio-cost"><strong>{data ? `${data.used} / ${data.dailyLimit}` : '—'} requests today</strong><span>Ideas & editing are free. AI runs only when asked.</span>{data && <small>Resets {new Date(data.resetsAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>}</div></header>
    {data?.preview && <p className="studio-banner">Local preview · AI responses are simulated. No credits or live saves are used.</p>}
    <div aria-live="polite" role="status">{notice && <p className="studio-notice"><Check size={16} /> {notice}</p>}{busy && <p className="studio-notice">{['series', 'script', 'research'].includes(busy) ? 'Working on your request. You can leave this page; check Studio for the saved result when you return.' : 'Saving…'}</p>}</div>
    {error && <div role="alert" className="studio-error">{error}{!data && <button onClick={() => void act('loading', async () => { await reload(); })}>Try loading again</button>}</div>}
    {!data && !error && <p className="studio-loading">Opening your notebook…</p>}
    {(data?.protected || requiresAccess) && <div className="studio-token"><label>Spool access token<input type="password" autoComplete="off" value={accessToken} onChange={(e) => { setAccessToken(e.target.value); tokenRef.current = e.target.value; }} placeholder="Not your Claude API key" /><small>Used for this visit only. Never sent to Claude.</small></label><button className="studio-secondary" disabled={!!busy} onClick={() => void act('loading', async () => { await reload(); })}>Open Studio</button></div>}
    {data && !data.configured && <p className="studio-banner">Claude is not connected. You can still explore, keep ideas, and save each series brief.</p>}
    {data && <div className="studio-layout">
      <aside className="studio-shelf" aria-label="Series ideas"><div className="studio-shelf-head"><h2>Your series</h2><span>{visibleSeries.length}</span></div><div className="studio-filters"><button aria-pressed={!keptOnly} onClick={() => { setKeptOnly(false); setSelectedId(''); }} disabled={!!busy}>All ideas</button><button aria-pressed={keptOnly} onClick={() => { setKeptOnly(true); setSelectedId(''); }} disabled={!!busy}>My notebook</button></div><p className="studio-small">Starters use existing playbook notes—not another AI request.</p><nav aria-label="Choose a content series">{visibleSeries.map((s, i) => <button className={`studio-series-card ${series?.id === s.id ? 'selected' : ''}`} key={s.id} onClick={() => { setSelectedId(s.id); setNotice(''); setError(''); }} aria-current={series?.id === s.id ? 'true' : undefined} disabled={!!busy}><span className="studio-series-number">{String(i + 1).padStart(2, '0')}</span><span><small>{s.origin === 'generated' ? 'Developed series' : 'Free starter'}{data.kept.some((k) => k.id === s.id) ? ' · Kept' : ''}</small><strong>{s.title}</strong><span>{s.episodes.length} episodes · {s.sources.length} saves</span></span><ChevronRight size={16} /></button>)}</nav>{!visibleSeries.length && <p className="studio-empty">{keptOnly ? 'Keep a starter or develop a series to begin your notebook.' : 'Series starters appear when a playbook has at least two ready knowledge saves. Finish processing or add knowledge to your library first.'}</p>}</aside>
      {series ? <div className="studio-notebook">
        <header className="studio-series-heading"><div><span className="studio-eyebrow">{series.origin === 'starter' ? 'A starting point, shaped from your saves' : 'Your developed series'}</span><h2>{series.title}</h2><p>{series.promise}</p></div><button className={`studio-keep ${isKept ? 'kept' : ''}`} disabled={!!busy} aria-pressed={isKept} onClick={() => void act('keeping', async () => { await post('keep', { seriesId: series.id, kept: !isKept }); await reload(); setNotice(isKept ? 'Removed from kept ideas. Existing drafts are unchanged.' : 'Kept in your notebook.'); })}><Bookmark size={16} />{isKept ? 'Kept' : 'Keep idea'}</button></header>
        <div className="studio-brief"><label>Who is this series for?<input ref={audienceRef} maxLength={180} value={brief.audience} onChange={(e) => changeBrief('audience', e.target.value)} placeholder="e.g. Non-technical people building their first AI tool" disabled={!!busy} /></label><label>Your angle<input maxLength={600} value={brief.direction} onChange={(e) => changeBrief('direction', e.target.value)} placeholder="e.g. Small experiments I can explain without jargon" disabled={!!busy} /></label><details><summary>Voice, length & personal context</summary><div className="studio-brief-extra"><label>Voice<input value={brief.voice} maxLength={220} onChange={(e) => changeBrief('voice', e.target.value)} disabled={!!busy} /></label><label>Episode length<select value={brief.format} onChange={(e) => changeBrief('format', e.target.value)} disabled={!!busy}><option>30 seconds</option><option>45–60 seconds</option><option>60–90 seconds</option></select></label><label className="studio-full">What have you actually tried?<textarea rows={3} maxLength={700} value={brief.personalContext} onChange={(e) => changeBrief('personalContext', e.target.value)} placeholder="Optional. Real examples, results, or opinions the script may use. Otherwise it uses a learning perspective, not invented experiences." disabled={!!busy} /></label></div></details><div className="studio-brief-actions"><button className="studio-secondary" disabled={!!busy} onClick={() => void act('brief', async () => { await post('brief', { seriesId: series.id, ...brief }); setNotice('Series brief saved across devices. No AI request.'); })}>Save brief · free</button><button className="studio-primary" disabled={!!busy || !data.configured} onClick={() => generate('series')}>Develop series <span>1 Claude request</span></button></div><p className="studio-small">Each series has its own audience. Developing creates a new four-episode version and keeps this one.</p></div>
        {workInProgress && <p className="studio-banner">A request for this series is pending. {Date.now() - Date.parse(workInProgress.createdAt) < 120000 ? 'Checking for its result…' : 'It may have been interrupted. No automatic retry will spend more credits.'} <button onClick={() => void act('refresh', async () => { await reload(); })}>Check saved results</button></p>}
        {lastFailure && <details className="studio-failure"><summary>Previous request did not finish</summary><p>{lastFailure.error}</p><p>Earlier completed drafts are still below. To make a new request, change the angle or brief first.</p></details>}
        <div className="studio-writing-layout"><section className="studio-episodes" aria-label="Episodes"><h3>Episode outline</h3><ol>{series.episodes.map((ep) => <li key={ep.id}><button aria-pressed={episode?.id === ep.id} onClick={() => { setEpisodeId(ep.id); setDraftId(''); setIncludeResearch(false); setHookId(''); }} disabled={!!busy}><span>{String(ep.number).padStart(2, '0')}</span><div><strong>{ep.title}</strong><small>{ep.angle}</small>{data.drafts.some((d) => d.kind === 'script' && d.seriesId === series.id && d.episodeId === ep.id && d.status === 'ready') && <em><Check size={12} /> Script saved</em>}</div></button></li>)}</ol><Sources sources={series.sources} /></section>
        {episode && <section className="studio-writer" aria-labelledby="studio-episode-title"><span className="studio-eyebrow">Episode {episode.number} · {brief.format}</span><h3 id="studio-episode-title">{episode.title}</h3><p className="studio-payoff"><strong>The payoff</strong>{episode.payoff}</p><label className="studio-hook-select">Hook inspiration<select value={hookId} onChange={(e) => setHookId(e.target.value)} disabled={!!busy}><option value="">Find relevant patterns in my hook bank</option>{data.hooks.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}</select></label>{hookId && <blockquote className="studio-hook-example">{data.hooks.find((h) => h.id === hookId)?.hook}<small>Reference only. Your script gets an original hook, not a copy.</small></blockquote>}
          <div className="studio-research"><details><summary><Search size={14} /> Optional outside research</summary><p>Check this episode against web sources before writing. Separate from script generation: one Claude request plus up to one paid web search.</p><button className="studio-secondary" disabled={!!busy || !data.configured} onClick={() => generate('research')}>Research episode</button>{research && <><p className="studio-small">Saved {new Date(research.createdAt).toLocaleDateString()}. Check dates before publishing.</p><Research blocks={research.result?.blocks || []} /></>}</details>{research && <label className="studio-checkbox"><input type="checkbox" checked={includeResearch} onChange={(e) => setIncludeResearch(e.target.checked)} disabled={!!busy} /> Include this saved research in the next script</label>}</div>
          <button className="studio-primary studio-write" disabled={!!busy || !data.configured} onClick={() => generate('script')}><Feather size={16} /> {draft ? 'Write another version' : 'Write this episode'} <span>1 Claude request</span></button><p className="studio-small">Same brief, same saved result—no new charge. Change the brief or hook to request a new version. Review claims before posting.</p>
          {!draft && <div className="studio-blank"><FileText size={27} /><h4>Your script starts here.</h4><p>Choose an episode worth making. You’ll get three hooks, a spoken script, a caption and a simple shot list.</p></div>}
          {draft && <div className="studio-draft"><div className="studio-draft-head"><h4>Script notebook</h4>{scripts.length > 1 && <label>Version<select value={draft.id} onChange={(e) => setDraftId(e.target.value)}>{scripts.map((d, i) => <option key={d.id} value={d.id}>Version {scripts.length - i} · {new Date(d.createdAt).toLocaleDateString()}</option>)}</select></label>}</div><details open><summary>Three opening options</summary><ol className="studio-hooks">{draft.result?.hooks?.map((hook, i) => <li key={i}><p>{hook}</p><button aria-label={`Copy hook ${i + 1}`} onClick={() => void copy(hook)}><Copy size={15} /></button></li>)}</ol><p className="studio-small">The draft opens with option 1. If you choose another, edit the first line below.</p></details><label className="studio-script-label">Spoken script<textarea value={script} maxLength={6500} onChange={(e) => { setScript(e.target.value); browserWrite(`spool-studio-script:${draft.id}`, e.target.value); }} rows={14} /></label><div className="studio-edit-actions"><span>{script.trim().split(/\s+/).filter(Boolean).length} words</span><button disabled={!!busy || !script.trim()} onClick={() => void act('edit', async () => { await post('edit', { id: draft.id, script }); await reload(); setNotice('Script edits saved. No AI request.'); })}>Save edits · free</button><button onClick={() => void copy(script)}><Copy size={14} /> Copy script</button></div><p className="studio-small">Save edits to keep them across devices. The original generated version is retained.</p><details><summary>Caption & filming notes</summary><p className="studio-caption">{draft.result?.caption}</p><button className="studio-secondary" onClick={() => void copy(draft.result?.caption || '')}>Copy caption</button><ul>{draft.result?.shots?.map((shot, i) => <li key={i}>{shot}</li>)}</ul></details>{!!draft.result?.factChecks?.length && <div className="studio-fact-checks"><h4>Before you post</h4><ul>{draft.result.factChecks.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}<Sources sources={draft.sources.filter((s) => draft.result?.sourceIds?.includes(s.id))} />{!!draft.hooks.length && <details><summary>Hook patterns consulted</summary>{draft.hooks.map((h) => <p key={h.id}><a href={h.url} target="_blank" rel="noreferrer">{h.title}</a><br />{h.hook}</p>)}</details>}{draft.research && <details><summary>Outside research used in this version</summary><Research blocks={draft.research.blocks} /></details>}<p className="studio-small">Audience for this version: {draft.brief.audience}. Nothing is posted to Instagram automatically.</p></div>}
        </section>}</div>
      </div> : <div className="studio-empty"><Feather size={28} /><h2>A notebook waiting for an idea.</h2><p>{keptOnly ? 'Switch to All ideas and keep a series you would enjoy making.' : 'Your saved knowledge will become the starting material here.'}</p></div>}
    </div>}
  </section>;
}
