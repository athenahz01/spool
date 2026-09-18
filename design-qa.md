# Design QA — Obsidian-style Second Brain map

## Evidence

- Source visual truth: the user-provided Obsidian Graph View reference in this conversation (`codex-clipboard-d3a39a44-2a37-417a-978e-c3917c9f32e0.png`, originally 958 × 862 px).
- Implementation: `https://spool-knowledge.vercel.app/`, Second Brain → Map.
- Browser-rendered implementation capture: Codex in-app browser, 1264 × 712 px desktop viewport, light theme, 64 mapped memories, 86 connections.
- State checked: whole-network view; one selected Reel with its local neighborhood and source-note panel; knowledge-area overlay open.
- Density normalization: composition was compared proportionally because the reference is a dark Obsidian desktop capture and the implementation intentionally uses Spool's light butter/baby-blue product theme.
- Console errors: none.

## Full-view comparison

The implementation now matches the reference's defining structure: one full-canvas organic force-directed field, many small nodes, quiet relationship threads, a few larger labeled hubs, peripheral tails, and navigation that stays secondary to the graph. Spool-specific differences—the light palette, top view switcher, compact statistics, and source-note reader—are intentional product adaptations.

## Focused-region comparison

- Network field: reel nodes read as small filled points rather than separate orbit cards; category hubs sit inside the same cloud instead of on a fixed ellipse.
- Threads: all real relationships remain visible at low contrast; selecting a memory fades the wider field and strengthens only its local neighborhood.
- Controls: the previous permanent library sidebar is now a dismissible overlay, preserving an Obsidian-like full graph canvas.
- Detail state: selecting a Reel opens a readable source note without losing the spatial origin of the selected node.

## Findings

- No actionable P0, P1, or P2 mismatch remains for the requested Obsidian-style direction.
- Accepted deviation: the reference is dark and neutral; Spool remains light with butter yellow, baby blue, sage, clay, and ink because the user explicitly chose that color world.
- Accepted deviation: Spool preserves its Playbooks / Map / Sources navigation and source-note content because they are functional parts of the product, not decorative additions.

## Comparison history

1. Earlier implementation used fixed category islands, hollow Reel rings, a permanent left library, and very faint at-rest links. It read as a radial dashboard rather than an Obsidian graph.
2. Fixed by moving all categories into the force simulation, shrinking Reel nodes, showing fine at-rest threads, removing the decorative grid/orbit, converting the library to an overlay, and expanding the map vertically.
3. Post-fix browser evidence shows one irregular connected brain cloud, visible tails and bridges, clear category anchors, working local-focus behavior, and no browser errors.

## Implementation checklist

- [x] Full-canvas organic graph
- [x] Compact filled memory nodes
- [x] Category hubs embedded in the network
- [x] Visible quiet threads at rest
- [x] Local-neighborhood focus on selection
- [x] Dismissible search and area overlay
- [x] Source-note detail interaction
- [x] Light Spool palette preserved
- [x] Reduced-motion behavior preserved
- [x] Production browser and console verified

final result: passed
