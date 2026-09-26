# Design QA — Reading Club redesign

Date: 2026-09-25. Scope: local implementation of selected direction 1; not deployed.

## Evidence and normalization

- Source visual truth: `C:/Users/zheng/.codex/generated_images/01a031d7-a5af-7fe3-b7ef-60fd2bfa398e/exec-177a9b2b-a3a9-4050-9105-4a5beb7eda8c.png` (1487 × 1058 pixels).
- Implementation URL: http://localhost:5173/ (Home, light appearance, read-only snapshot of the user's saved library).
- Implementation screenshot path: inline browser-tool image artifacts in this task; the browser API did not expose a filesystem screenshot path. Final evidence is the paired-image call titled “Final reference-to-build visual comparison.”
- Desktop CSS viewports: 1487 × 1058 and default 1280 × 720. Final default browser image is 1265 × 713 pixels as delivered by the browser capture surface. The wider viewport's capture surface cropped the right/bottom edges, so the uncropped default capture was also compared. No pixel-perfect equivalence is claimed across these crops.
- Mobile CSS viewports: 390 × 844 and 320 × 740. Browser capture surface omits part of the viewport; DOM bounding boxes independently checked persistent navigation and dialog bounds. No horizontal overflow at the final 320px source-library state (clientWidth = scrollWidth = 305).
- Density normalization: compare corresponding content regions and CSS geometry, not raw unequal screenshot dimensions. The reference and final Home screenshot were supplied together in a single visual comparison input, twice after corrections.
- States inspected: Home; expanded topic list and topic guide; Library playbook; Sources search; Hooks search; full Scripts reader; Creators; graph; Ask Spool free results; Add link validation; narrow-screen settings.
- Preview uses an ignored local read-only API adapter. No production captures, analysis, transcription retries, or paid synthesis were triggered.

## Findings and comparison history

1. [P2, fixed] Feature image made the Home feature too tall, pushing recent saves down. Earlier capture showed an approximately 514px feature. Changed the image from unconstrained percentage sizing to a 330px desktop / 185px mobile crop. Revised paired comparison shows a compact split feature, with the Recently saved heading immediately below it.
2. [P2, fixed] Eight full topic rows crowded the right column and displaced the hook. Show four initial topics plus an accessible “All 8 topics” disclosure. Post-fix screenshot shows topics and the hook together in the desktop right column.
3. [P2, fixed] Selected bank count used inherited 7px muted text against a dark active tab. Added 11px count text, a wider pill, and white selected text. Source rule and subsequent render verified.
4. [P2, fixed] The inherited 320px body minimum produced 15px overflow with desktop scrollbars at the narrowest test width. Removed that minimum only for non-map Reading Club screens. Post-fix Sources state measures 305px client and scroll widths.
5. [P2, fixed] Existing modals did not consistently trap keyboard focus or restore it. Added shared focus handling, inert background, Escape dismissal, and scroll locking. Tested last-control Tab wrapping to Close and Escape restoring the Ask Spool trigger. Add-link empty validation exposes an alert without making a request.
6. [P2, fixed] Library recovery instructions still said “Briefing” after navigation was renamed. Updated the instruction to Capture & settings; verified in mobile Sources.
7. [P3, fixed] React 18 warned about the image fetchPriority property. Removed it, reloaded, and checked captured logs: only the historical pre-fix warning remains; no new warning was recorded.

## Required fidelity surfaces

- Fonts/typography: local Manrope regular/bold/extra-bold provides the rounded, dense sans-serif character of the selected mock. Strong short headings, readable 14–16px body copy, and quieter metadata. The graph explicitly retains its previous font stack. Exact mock font identification was unavailable; Manrope is an intentional close visual match, not a claim of exact identity.
- Spacing/layout: butter sidebar, wide quiet search, white reading canvas, blue split feature and narrow discovery column preserve the selected hierarchy. On mobile, one content column and five-item bottom navigation replace the desktop rail. Dialog content scrolls inside a viewport-bounded panel at 320px.
- Colors/tokens: butter `#faedb7`, baby blue `#d5e8fa`, white, and dark ink `#18232f`; secondary text `#647187`. These new theme overrides are scoped away from the protected map. Selected state uses more than color alone; keyboard focus outlines remain visible.
- Image quality/assets: sharp generated editorial desk photograph matches the sunlit French reading/creating mood. It is decorative (`alt=""`), not presented as a Reel thumbnail. Real Reel thumbnails are not reliably available, so recent-source rows use existing icon-library topic symbols. The existing Spool logo is preserved rather than recreating the mock logo with handmade shapes. No fake creator portraits, duration badges, or profile identity are introduced.
- Copy/content: actual titles, lessons, topics, hooks, creator metadata and counts from the saved library replace illustrative mock content. Handwritten decorative slogans and the mock “Taylor” identity are omitted. Capture instructions now describe a working product, not a desktop test.

## Full-view and focused-region review

The paired views preserve the major Reading Club composition and calmer navigation. Reference copy and photography are illustrative, while the implementation must remain evidence-backed; this is an intentional product adaptation. The original map is not redesigned.

Focused inspection covered the header/rail labels and active state, feature title and photo crop, right-column topic count and hook, bank tab/search controls, guide reading column, and the narrow-screen Add link dialog. These regions were readable in the captured screenshots; additional crops were unnecessary. Actual long source titles were used to check wrapping.

## Functional checks

- Home topic selection and guide entry work; recent-save disclosure retains source actions.
- Hook search for “portfolio” reduces the bank to two relevant scripts; Scripts opens the readable transcript and structure.
- Sources search for “sub-agents” returns one matching source.
- Ask Spool free search for “AI agents” returns local notes and five cited sources. Paid synthesis was not invoked.
- Add-link empty submission shows its validation alert; no save was created.
- Mobile bottom navigation and Capture & settings work at narrow widths.
- Protected `KnowledgeMapView` source matches HEAD exactly; `src/styles.css` and `src/vault.css` have no changes. The graph renders with 118 memories / 167 connections in the preview. Map algorithms, force parameters, node and edge rendering were not edited.
- Production build succeeds. All 19 existing automated tests pass. Diff whitespace check passes.

## Accepted differences and residual test gaps

- Mock-only photography/portraits, handwritten notes and logo are not falsely represented as real library metadata; substitutions are stated above.
- Upstream anonymous/unverified creator names remain visible as stored. This redesign does not invent missing identity or merge repair data.
- Paid capture/transcription/synthesis, live writes, publishing, real iPhone Safari and assistive-technology testing were deliberately not performed. Responsive browser and keyboard checks are not a claim of full WCAG certification.
- No actionable P0/P1/P2 design finding remains in the tested scope.

## Implementation checklist

- [x] Selected Reading Club direction applied across non-map screens
- [x] Real library data and source links retained
- [x] Existing Second Brain map protected
- [x] Desktop and narrow-screen inspection
- [x] Primary read-only interactions and modal keyboard behavior verified
- [x] Build, tests and console checked
- [x] Local-only handoff; production unchanged

final result: passed

---

# Historical QA — Obsidian-style Second Brain map (previous iteration)

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
