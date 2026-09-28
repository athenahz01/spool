# Content Studio

Content Studio turns existing playbook notes into free series starters, then develops
selected ideas and episodes on demand. The Second Brain map is unchanged.

## Workflow

1. Open Content Studio and browse the free starters. Each needs at least two ready,
   knowledge-labelled saves with usable source coverage. These are starting outlines,
   not newly researched or AI-generated recommendations.
2. Set the audience and angle **for that series**. Keep an idea and save its brief for
   free. Voice, duration and real personal context are optional brief fields.
3. Develop a series to request a new four-episode outline, or choose an existing
   starter episode and write its script directly.
4. Choose a hook-bank reference, or let Studio select relevant patterns. A script
   includes three original openings, spoken copy, a caption, filming notes, checks
   before posting, and supporting source links.
5. Edit and save the spoken script without AI. Generated originals and versions are
   retained. Nothing is published to Instagram automatically.

Research is a separate action, off by default. It makes one Claude request with at
most one web search. Check the inclusion box to use the saved research in the next
script. Research links come from actual provider citation blocks. Creator notes
and AI outputs still need review; source IDs are validated but factual correctness
and originality are not guaranteed by software.

## Cost and persistence

- Free: browsing, keeping ideas, saving briefs, editing/copying scripts, reading
  existing drafts. No new transcription is requested by Studio.
- AI: one request per explicit generation action, compact context from at most six
  saves and three hook references. Full transcripts are not sent.
- Default shared cap: six Studio requests per UTC day, including failed/ambiguous
  attempts. `SPOOL_STUDIO_DAILY_LIMIT` can set an integer from 1 to 12. This is a
  request cap, not a dollar cap; model and optional search charges still apply.
- Repeated identical inputs reuse the saved result. Changed source notes, audience,
  angle, duration, hook or included research can create a new request.
- No SDK retries or automatic continuations. Pending claims survive server restarts;
  uncertain attempts are not automatically repeated. Change the brief to explicitly
  request a new attempt. A budget-blocked request can run after the next reset.
- PostgreSQL: `spool_studio_records` and `spool_studio_budget`, created on first use
  of the existing database connection. Records include private briefs and drafts.
- Local fallback: ignored `data/studio.json`. Vercel fails closed without a database.
- If `SPOOL_CAPTURE_TOKEN` is configured, all Studio reads and writes require it.
  Without it, Studio inherits the existing personal app's open-access deployment
  model. Do not expose a shared deployment with private briefs without access control.
- `ANTHROPIC_STUDIO_MODEL` optionally overrides the existing Ask/main Claude model.
  No new provider account is needed. Web search must be enabled for the Claude account
  to use optional research; failure does not trigger another provider call.

## Verification

`npm test` covers opt-in costs, compact inputs, separate audiences, saved brief
restoration, duplicate/concurrent calls, daily budgets, local persistence, source
validation, failure handling, optional research and free editing. `npm run build`
checks the TypeScript UI and production bundle.

Browser QA uses an isolated in-memory preview and simulated AI results. It does not
verify a real Claude response or the production PostgreSQL tables. Those require an
explicit live smoke test after deployment; no paid generation was used during build.
