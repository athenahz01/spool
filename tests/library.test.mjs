import assert from "node:assert/strict";
import test from "node:test";

process.env.VERCEL = "1";
const { buildLibrary } = await import("../server.mjs");

const ready = (overrides) => ({
  id: crypto.randomUUID(),
  url: "https://www.instagram.com/reel/example/",
  status: "ready",
  intents: ["knowledge"],
  title: "Saved Reel",
  topic: "Useful idea",
  summary: "A verified lesson.",
  takeaways: ["Keep the useful part."],
  action: "Try the useful part.",
  confidence: 0.9,
  capturedAt: "2026-08-30T12:00:00.000Z",
  ...overrides
});

test("buildLibrary creates playbooks and facets without calling a paid service", () => {
  const captures = [
    ready({
      id: "agent-source",
      title: "Build specialized AI agents",
      topic: "AI agent architecture",
      summary: "Give every AI agent one job, its own tools, and a clear workflow.",
      structure: "define job → add identity → connect tools → run workflow",
      contentCategory: "AI Products",
      transcript: "An agent works best with one specific job.",
      transcriptStatus: "ready"
    }),
    ready({
      id: "content-source",
      title: "Turn an article into a carousel",
      topic: "Content repurposing",
      summary: "Use a design system and Claude to turn an article into a carousel.",
      structure: "paste article → apply design system → edit → publish",
      contentCategory: "Content Creation",
      extraction: "instagram-embed-caption"
    }),
    {
      id: "blocked-source",
      url: "https://www.instagram.com/reel/blocked/",
      status: "needs-context",
      intents: ["knowledge"],
      title: "Saved source",
      summary: "More context is needed.",
      capturedAt: "2026-08-30T13:00:00.000Z"
    }
  ];
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("buildLibrary must stay offline");
  };
  try {
    const library = buildLibrary(captures);
    assert.equal(fetchCalls, 0);
    assert.equal(library.playbooks.length, 6);
    assert.ok(library.playbooks.find((item) => item.id === "run-small-ai-team")?.sourceIds.includes("agent-source"));
    assert.ok(library.playbooks.find((item) => item.id === "personal-content-engine")?.sourceIds.includes("content-source"));
    assert.equal(library.recovery.length, 1);
    assert.equal(library.knowledgeItems.find((item) => item.id === "agent-source")?.evidence, "Transcript");
    assert.equal(library.knowledgeItems.find((item) => item.id === "content-source")?.evidence, "Caption");
  } finally {
    global.fetch = originalFetch;
  }
});
