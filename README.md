# Spool

Spool turns explicitly shared Instagram Reels, creator profiles, YouTube videos, and webpages into a personal knowledge briefing. It is designed around an iPhone Share Sheet Shortcut, so capture requires no tags, labels, or folders.

## What is implemented

- Responsive briefing focused on synthesized ideas, not an inbox
- A Playbooks-first Second Brain with broad and focused outcome-based guides, an associative Map, and a filterable Sources ledger
- Evidence-backed bridge memories that can belong to several knowledge areas, plus restrained Reel-to-Reel connections with visible reasons
- A calmer verified-knowledge map that keeps incomplete saves in Recovery instead of mixing them into the visible brain
- Deterministic knowledge facets (domain, type, use case, evidence, freshness) plus a Recovery Inbox for incomplete sources
- Living playbooks that merge existing summaries, takeaways, structures, actions, and transcripts without another Claude call
- Copyable and downloadable Markdown playbooks, with expandable source notes that retain their evidence trail
- Creator playbooks for hooks, pillars, voice, and repeatable content engines
- `POST /api/capture` endpoint for the iPhone Shortcut
- Neon Postgres persistence in production, with local JSON for laptop development
- Anthropic Claude enrichment with structured outputs and tightly scoped web fetch
- Automatic public Instagram embed-caption extraction when the normal reel page is blocked
- A live capture inbox with processing, retry, and add-context recovery states
- Explicit multi-select save purposes: Knowledge, Script, Creator, or Save only
- Caption-first Knowledge routing that only spends Supadata credits when free source text is insufficient
- Creator playbook updates only when Creator was explicitly selected
- Save-only capture that skips both Claude and Supadata
- Retry protection that preserves a successful note if Instagram later blocks access
- Selective Supadata transcription: always for Script, automatic fallback for incomplete Knowledge, or manual “Transcribe”
- Resumable Vercel processing: transcript jobs checkpoint their Supadata job ID and hand Claude analysis to a fresh function invocation
- Automatic repair for stale jobs, with distinct transcript, source-access, and Claude-analysis recovery messages
- Hook and Script banks with category search, opening-pattern filters, reusable script shapes, and zero-cost browsing/copying
- Zero-cost Second Brain browsing and regrouping: opening playbooks, changing filters, and exploring the map never calls Claude or Supadata
- A regression test that verifies library and playbook generation performs no external fetches
- Supadata account checks (cached for one minute) that distinguish exhausted credits from a configured key; exhausted/invalid accounts cannot start new transcripts
- A visible processing-status panel with all affected saves, pagination, context recovery without transcription, and explicit library-loading errors
- Unicode-safe provider input and automatic-retry protection for permanent provider errors; optional transcript failures preserve ready notes
- Ask Spool with free on-device retrieval, evidence links, optional one-request Claude synthesis, and a 12-answer device cache
- A complete in-app Shortcut setup recipe at `/shortcut-setup.html`
- Demo mode that works without credentials

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`. The development API runs on port 8787 and Vite proxies `/api` calls to it.

## Production-style run

```powershell
Copy-Item .env.example .env
npm.cmd run build
npm.cmd start
```

The built app and API are then served from `http://localhost:8787`.

Environment variables:

- `ANTHROPIC_API_KEY`: enables automatic source enrichment. Never put this value in frontend code.
- `ANTHROPIC_MODEL`: defaults to `claude-sonnet-5`.
- `ANTHROPIC_ASK_MODEL`: optional lower-cost model override used only for explicit Ask Spool synthesis.
- `DATABASE_URL`: Neon Postgres connection string used by Vercel.
- `SUPADATA_API_KEY`: optional; unlocks selective spoken-word transcripts for public videos.
- `SPOOL_CAPTURE_TOKEN`: optional bearer token protecting the capture endpoint on a public deployment.
- `PORT`: defaults to `8787`.

The enrichment path uses Anthropic's Messages API, structured outputs, and the web-fetch tool limited to the shared URL's domain. A Knowledge save first uses the public caption/page text. Claude marks that source coverage complete, partial, or insufficient; only the latter two may trigger Supadata. Public social pages are sometimes inaccessible to automated readers, so Spool marks unverifiable sources `needs-context` rather than inventing details.

## iPhone capture

After deployment to a public HTTPS domain, open `/shortcut-setup.html` and follow the iOS 18 recipe. The Shortcut POSTs the Share Sheet URL plus a comma-separated `intents` field to:

```text
https://YOUR-SPOOL-DOMAIN/api/capture
```

The server immediately responds with `202 Accepted`, then enriches the source in a Vercel background task. The app polls only while work is pending, so the result appears without a refresh.

## Real iPhone test on the same Wi-Fi

Start the production-style server, find this computer's local network address, and use `http://YOUR-COMPUTER-IP:8787/api/capture` in the Shortcut. Windows may ask you to allow Node.js on private networks. A public HTTPS deployment is recommended outside your home network.

Do not paste your Anthropic key into a Shortcut or the browser. Keep it only in the server-side `.env` file.

## Production boundary

The dashboard ships with representative Athena Huo examples alongside your live data. This personal single-user build stores up to 1,000 captures in Neon Postgres on Vercel. Before opening it to other users, add authentication and per-user data ownership.

Anthropic implementation references:

- [TypeScript SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)
- [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Web fetch tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool)
