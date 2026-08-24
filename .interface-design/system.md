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
