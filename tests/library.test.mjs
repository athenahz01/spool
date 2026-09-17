import assert from "node:assert/strict";
import test from "node:test";

process.env.VERCEL = "1";
const { buildAskSourceContext, buildKnowledgeNetwork, buildLibrary } = await import("../server.mjs");

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
    assert.equal(library.playbooks.length, 10);
    assert.ok(library.playbooks.find((item) => item.id === "run-small-ai-team")?.sourceIds.includes("agent-source"));
    assert.ok(library.playbooks.find((item) => item.id === "personal-content-engine")?.sourceIds.includes("content-source"));
    assert.equal(library.recovery.length, 1);
    assert.equal(library.knowledgeItems.find((item) => item.id === "agent-source")?.evidence, "Transcript");
    assert.equal(library.knowledgeItems.find((item) => item.id === "content-source")?.evidence, "Caption");
  } finally {
    global.fetch = originalFetch;
  }
});

test("focused playbooks surface new recurring themes without swallowing an entire category", () => {
  const captures = [
    ready({ id: "networking", contentCategory: "Career", title: "Three networking questions", topic: "Better networking conversations", summary: "Replace small talk with a thoughtful career decision question." }),
    ready({ id: "sql", contentCategory: "Career", title: "Learn SQL and Python", topic: "Data analyst roadmap", summary: "Learn SQL joins, Python pandas, analytics, and data cleaning." }),
    ready({ id: "unrelated-career", contentCategory: "Career", title: "Negotiate a promotion", topic: "Compensation", summary: "Prepare evidence for a compensation conversation." }),
    ready({ id: "brand", contentCategory: "Startups", title: "Build a brand identity", topic: "Branding", summary: "Choose brand identity words, fonts, and colors for a memorable niche." }),
    ready({ id: "foundations", contentCategory: "AI Products", title: "How LLM tokens work", topic: "AI fundamentals", summary: "Explain how an LLM predicts each token with a transformer model." })
  ];
  const library = buildLibrary(captures);
  const networking = library.playbooks.find((item) => item.id === "network-with-substance");
  const data = library.playbooks.find((item) => item.id === "build-data-fluency");
  assert.ok(networking.sourceIds.includes("networking"));
  assert.ok(!networking.sourceIds.includes("unrelated-career"));
  assert.ok(data.sourceIds.includes("sql"));
  assert.ok(!data.sourceIds.includes("unrelated-career"));
  assert.ok(library.playbooks.find((item) => item.id === "shape-memorable-brand")?.sourceIds.includes("brand"));
  assert.ok(library.playbooks.find((item) => item.id === "understand-ai-foundations")?.sourceIds.includes("foundations"));
});

test("Ask Spool sends only compact ready notes in relevance order", () => {
  const captures = [
    ready({ id: "second", title: "Second result", transcript: "x".repeat(20_000), summary: "A compact second summary." }),
    ready({ id: "first", title: "First result", transcript: "y".repeat(20_000), summary: "The strongest summary." }),
    { id: "blocked", status: "needs-context", intents: ["knowledge"], title: "Blocked", url: "https://example.com" }
  ];
  const result = buildAskSourceContext(captures, ["first", "blocked", "second"]);
  assert.deepEqual(result.sources.map((source) => source.id), ["first", "second"]);
  assert.match(result.context, /^\[1\]\nTitle: First result/);
  assert.ok(!result.context.includes("x".repeat(100)));
  assert.ok(!result.context.includes("y".repeat(100)));
});

test("knowledge network creates evidence-backed bridges without forcing unrelated links", () => {
  const captures = [
    ready({ id: "ai-startup", contentCategory: "AI Products", title: "AI agent MVP for founders", topic: "AI startup validation", summary: "Build an AI agent after customer discovery validates a founder pain point.", takeaways: ["Test the MVP with early users."], action: "Launch to first customers." }),
    ready({ id: "startup-ai", contentCategory: "Startups", title: "Validate an AI assistant before launch", topic: "Founder product validation", summary: "A founder validates an AI automation MVP with customer discovery before launch.", takeaways: ["Interview early users before coding."], action: "Run five validation calls." }),
    ready({ id: "vlog-content", contentCategory: "Vlogs & Life", title: "Day in the life Reel editing", topic: "Lifestyle storytelling", summary: "A day in the life vlog uses a sharp hook, voiceover, and video editing for pacing." }),
    ready({ id: "recruiting-only", contentCategory: "Recruiting", title: "Prepare for a recruiter interview", topic: "Interview preparation", summary: "Practice concise examples before a recruiter interview." }),
    ready({ id: "reflection-only", contentCategory: "Personal Growth", title: "A quiet journaling habit", topic: "Weekly reflection", summary: "A private journaling habit supports reflection and confidence." })
  ];
  const network = buildKnowledgeNetwork(captures);
  const aiMembership = network.memberships.find((item) => item.sourceId === "ai-startup");
  const vlogMembership = network.memberships.find((item) => item.sourceId === "vlog-content");
  const recruitingMembership = network.memberships.find((item) => item.sourceId === "recruiting-only");
  assert.deepEqual(aiMembership.categories, ["AI Products", "Startups"]);
  assert.deepEqual(vlogMembership.categories, ["Vlogs & Life", "Content Creation"]);
  assert.deepEqual(recruitingMembership.categories, ["Recruiting"]);
  assert.ok(network.connections.some((connection) => connection.sourceId === "ai-startup" && connection.targetSourceId === "startup-ai" && connection.crossesAreas));
  assert.ok(!network.connections.some((connection) => [connection.sourceId, connection.targetSourceId].includes("reflection-only") && [connection.sourceId, connection.targetSourceId].includes("recruiting-only")));
});
