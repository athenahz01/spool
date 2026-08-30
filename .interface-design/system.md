# Spool interface memory

## Product intent

- Human: an iPhone-first Reel saver who has already consumed too much information and opens Spool to recover one useful idea without feeling behind.
- Core job: move from a saved fragment to one clear topic, pattern, and next action.
- Feel: calm reading desk, personal field notes, light French-summer warmth; never a generic analytics dashboard.

## Domain language

Spool, saved Reels, fragments, threads, chapters, patterns, supporting saves, creators, Second Brain, one action.

## Visual system

- Palette: butter yellow for action and attention; baby blue/denim for navigation and knowledge; cream paper for the canvas; ink blue for primary text; sage for success; clay for secondary category accents.
- Depth: subtle layered shadows plus low-opacity outlines. No harsh separators or dramatic floating cards.
- Surfaces: cream canvas → translucent white reading surface → tinted blue lesson inset / tinted butter action inset.
- Typography: system sans, tight heavy display headings, calm readable body, monospace tabular numerals for counts.
- Spacing: 4px base; 8px micro, 12–16px component, 24–32px section, 40px+ major separation.
- Radius: 6px controls, 7–11px cards, pills only for category filters and counts.
- Motion: 150ms control feedback; 240ms ease-out content swap using transform and opacity; no bounce; reduced-motion fallback required.

## Current Briefing direction — Topic Chapters

- Start with content-category tabs such as AI Products, Recruiting, Career, and Vlogs & Life.
- Selecting a chapter changes one reading card, two short lessons, one action, and up to three supporting saves.
- Keep transcripts, processing errors, and context controls behind the `All recent saves` disclosure.
- On mobile, category tabs scroll horizontally and the action/supporting-saves sidebar stacks below the reading card.
- Signature: the butter-to-baby-blue chapter marker connects the daily briefing to the Second Brain without copying its graph layout.

## Current Knowledge direction — Living Field Guides

- The graph is the map, not the lesson. Large category nodes open a full reading guide; small Reel nodes open evidence-rich source notes.
- Content hierarchy: `Knowledge area → Living guide → Chapters → Lessons/frameworks → Source Reels`.
- Every guide includes a short orientation, core ideas, a practical playbook, Reel-derived chapters, and a source shelf.
- Guides mature automatically from `First edition` to `Growing guide` to `Field guide` as more Knowledge-labelled Reels enter the category.
- Individual source notes use: `The idea → Opening hook → What it teaches → How it unfolds → Try this → Transcript`.
- Signature: a baby-blue-to-butter vertical chapter spine visibly connects synthesized knowledge back to the Reel evidence.
- Keep guide reading immersive on desktop while preserving the category library at left; on iPhone, keep the category rail above the reader and avoid adding another primary tab.

## Current Second Brain direction — Playbooks first

- Default to `Playbooks`; preserve the graph behind `Map`, and keep raw evidence behind `Sources`.
- The main hierarchy is `Second Brain → Playbook → Principles → Workflow → Reusable patterns → Supporting Reels`.
- Initial playbooks are: Run a small AI team, Build a personal content engine, Build career proof, Create lifestyle Reels, Find and launch ideas, and Technical experiment lab.
- Each playbook must state an outcome before showing detail. The reader then answers: what the saves agree on, how to apply it, what tools or patterns recur, what to try next, and which Reels support it.
- A Reel may support more than one playbook when its existing content clearly overlaps. Do not force a single-folder mental model.
- Source facets are generated locally: domain, knowledge type, use case, evidence, and freshness.
- Incomplete or blocked saves belong in a Recovery Inbox and stay out of synthesized playbooks until their lesson is verifiable.
- Cost rule: browsing, regrouping, filters, playbook generation, and recovery status must never call Claude or Supadata. They derive deterministically from existing summaries, takeaways, structures, actions, captions, notes, and stored transcripts.
- New captures keep the existing single analysis pipeline; this interface must not add a second AI pass.
- Signature: a thin source-colored spine runs beside the reading surface, connecting the practical guide back to its evidence without recreating the graph.

## Current creation direction — Creation Banks

- Creation Banks are a daily creation workspace, separate from Second Brain learning but powered by the same saved captures.
- Content hierarchy: `Creation Banks → Hook Bank / Script Bank → Category + opening-pattern filters → Source Reel`.
- Hooks use the analyzed opening line, falling back to the transcript's first spoken sentence; Scripts only include completed transcripts.
- Hook view is a quiet numbered ledger for fast scanning and one-tap copying, not a card gallery.
- Hook patterns are practical labels—Question, How-to, Contrarian, Proof, Story, List, Curiosity—derived locally without another API call.
- Script view uses a master-detail notebook: transcribed-source index at left, readable script at right, and a baby-blue-to-butter transcript margin rail.
- Every script shows its hook, structural map, reusable shape, word count, estimated spoken length, complete transcript, and original Reel.
- Browsing and copying must never trigger Claude or Supadata usage.
- On iPhone, primary navigation is `Briefing / Knowledge / Banks / Creators`; one-time iPhone setup remains in the top-right utility button.

## Current utility direction — Ask Spool

- Ask Spool is a global utility opened from the top bar or `⌘/Ctrl + K`; it is not another primary navigation tab.
- Default interaction is `Search free`: local deterministic retrieval over ready Knowledge saves, returning a direct summary, useful points, actions, and evidence links without any API call.
- Optional `Synthesize · 1 request` sends at most five compact source notes to Claude. Never include full transcripts in the synthesis request.
- Cache the latest 12 Claude answers on the device. Repeating the same question against the same sources must reuse the saved answer without a new request.
- Exclude queued, failed, and needs-context sources from answers.
- Keep free and paid states explicit in the interface: `Free`, `1 request`, or `Saved answer · no new request`.
- Use an hourly server-side ceiling as a final cost guard; free retrieval remains available when the ceiling is reached.
- Signature: every answer ends in a numbered evidence shelf that leads back to the exact saved Reels.

## Reserved Briefing direction — Focus Queue

- Mental model: `Remember → Try → Review`.
- Use when the Briefing needs stronger completion behavior or a daily routine.
- Lead with one memory, one concrete action, then make source review optional.
- Preserve the compact left-side step rail on desktop and three-segment control on mobile.
- Prototype: `/prototypes/briefing-directions.html?v=2`.

## Reserved Briefing direction — Briefing Map

- Mental model: a small daily constellation centered on `Today`, not the full Second Brain graph.
- Use when the Briefing should emphasize cross-topic connections and curiosity.
- Topic nodes update a fixed reading panel; supporting Reel dots remain secondary.
- Keep the graph calm, close-knit, and readable on iPhone; never let lines become the visual focus.
- Prototype: `/prototypes/briefing-directions.html?v=4`.

## Defaults to avoid

- Generic activity feed → topic chapters with progressive disclosure.
- Equal-weight dashboard cards → one dominant reading card and one action inset.
- Always-expanded source inbox → supporting saves first, operational details behind disclosure.
- Decorative gradients → color only where it communicates chapter identity or action.
- Thin category summary drawer → a real guide with progressive disclosure and traceable sources.
- Treating every Reel as an equal note → synthesize the branch first, then let users inspect supporting evidence.
- Transcript dump → searchable Hook and Script banks with copyable units and source context.
