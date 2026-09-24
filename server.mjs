import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { findCapture, readCaptures, storageMode, upsertCapture } from "./lib/storage.mjs";
import { safeText, transcriptFailure, canAutoRetryAnalysis, createTranscriptAccountReader, supadataErrorMessage } from "./lib/processing.mjs";

const readTranscriptAccount = createTranscriptAccountReader();

const root = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(root, "dist");
const port = Number(process.env.PORT || 8787);
const askWindows = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50_000) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function captureAuthorized(req) {
  const configuredToken = process.env.SPOOL_CAPTURE_TOKEN;
  if (!configuredToken) return true;
  return req.headers.authorization === `Bearer ${configuredToken}`;
}

function sourceFromUrl(url) {
  let parsed;
  try { parsed = new URL(url); }
  catch { return { platform: "Web", creator: "Unknown source", kind: "idea" }; }
  const host = parsed.hostname.replace(/^www\./, "");
  if (host.includes("instagram.com")) {
    const parts = parsed.pathname.split("/").filter(Boolean);
    const first = parts[0] ?? "instagram";
    const isReel = parts.includes("reel") || first === "reels";
    const isPost = parts.includes("p");
    const creator = ["reel", "reels", "p", "stories"].includes(first) ? "Instagram creator" : `@${first}`;
    return { platform: "Instagram", creator, kind: isReel || isPost ? "style" : "creator" };
  }
  if (host.includes("youtube.com") || host === "youtu.be") return { platform: "YouTube", creator: "YouTube creator", kind: "idea" };
  return { platform: "Web", creator: host, kind: "idea" };
}

const captureIntents = new Set(["knowledge", "script", "creator"]);
const knowledgeCategories = ["AI Products", "Recruiting", "Startups", "Vlogs & Life", "Content Creation", "Career", "Personal Growth", "Other"];

function normalizeIntents(value, legacyTranscribe = false) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,|]+/)
      : [];
  const normalized = raw
    .map((item) => String(item).trim().toLowerCase())
    .map((item) => item === "knowledge inside" ? "knowledge" : item === "script / delivery" ? "script" : item === "creator / style" ? "creator" : item)
    .filter((item) => captureIntents.has(item));
  if (legacyTranscribe) normalized.push("script");
  return [...new Set(normalized)];
}

function intentsForCapture(capture) {
  if (Array.isArray(capture.intents)) return normalizeIntents(capture.intents);
  // Captures saved before intent labels existed behaved like Knowledge saves.
  return ["knowledge"];
}

function hasIntent(capture, intent) {
  return intentsForCapture(capture).includes(intent);
}

function inferContentCategory(capture) {
  if (knowledgeCategories.includes(capture.contentCategory)) return capture.contentCategory;
  const text = `${capture.title || ""} ${capture.topic || ""} ${capture.summary || ""} ${(capture.takeaways || []).join(" ")}`.toLowerCase();
  if (/\b(recruit|intern|interview|resume|résumé|cold email|job search|hiring|networking|coffee chat)\b/.test(text)) return "Recruiting";
  if (/\b(startup|founder|validation|venture|mvp|product.market|distribution|fundrais|customer discovery)\b/.test(text)) return "Startups";
  if (/\b(vlog|day in the life|outfit|ootd|routine|travel|lifestyle|milestone|graduation|daily life)\b/.test(text)) return "Vlogs & Life";
  if (/\b(ai|artificial intelligence|machine learning|\bml\b|llm|prompt|automation|agent|model|prototype|software tool|app build)\b/.test(text)) return "AI Products";
  if (/\b(hook|script|storytelling|content strategy|creator|reel|audience|posting|video pacing)\b/.test(text)) return "Content Creation";
  if (/\b(career|promotion|workplace|manager|professional)\b/.test(text)) return "Career";
  if (/\b(habit|mindset|confidence|wellbeing|self improvement|personal growth)\b/.test(text)) return "Personal Growth";
  return "Other";
}

function captureSearchText(capture) {
  return [
    capture.title,
    capture.topic,
    capture.summary,
    capture.hook,
    capture.structure,
    capture.action,
    capture.sharedText,
    ...(capture.takeaways || [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function inferKnowledgeType(capture) {
  const text = captureSearchText(capture);
  if (/\b(template|checklist|swipe file|prompt pack|copy.?paste|script bank|framework)\b/.test(text)) return /framework/.test(text) ? "Framework" : "Template";
  if (/\b(opportunity|apply|internship|job|recruit|hiring|market gap|business idea)\b/.test(text)) return "Opportunity";
  if (/\b(workflow|process|pipeline|steps?|how to|automation|build|create|set up|setup)\b/.test(text) || String(capture.structure || "").includes("→")) return "Workflow";
  if (capture.kind === "tool" || /\b(tool|app|software|platform|integration)\b/.test(text)) return "Tool";
  if (/\b(case study|day in the life|vlog|story|example|i built|i made)\b/.test(text)) return "Example";
  return "Concept";
}

function inferKnowledgeDomains(capture) {
  const category = capture.contentCategory || inferContentCategory(capture);
  const text = captureSearchText(capture);
  const domains = new Set();
  if (category === "AI Products" || /\b(ai|claude|agent|llm|machine learning|automation)\b/.test(text)) domains.add("AI Building");
  if (category === "Content Creation" || /\b(content strategy|content engine|hook|script|carousel|linkedin post|audience growth|posting|video pacing|video editing|storytelling)\b/.test(text)) domains.add("Content");
  if (["Career", "Recruiting"].includes(category) || /\b(career|resume|portfolio|intern|job|recruit|cold email)\b/.test(text)) domains.add("Career");
  if (category === "Startups" || /\b(startup|founder|business|mvp|validation|customer discovery)\b/.test(text)) domains.add("Startups");
  if (["Vlogs & Life", "Personal Growth"].includes(category) || /\b(vlog|lifestyle|routine|travel|outfit|wellness)\b/.test(text)) domains.add("Lifestyle");
  if (category === "Other" || /\b(shader|monte carlo|raspberry pi|python|simulation|coding experiment)\b/.test(text)) domains.add("Technical Learning");
  return [...domains.size ? domains : new Set([category])];
}

const knowledgeAreaSignals = {
  "AI Products": [
    ["AI systems", /\b(ai|artificial intelligence|machine learning|ml model|llm|transformer|neural network)\b/, 4],
    ["agents and automation", /\b(ai agent|agentic|automation|automate|claude|codex|prompt engineering)\b/, 4],
    ["software building", /\b(app|software|tool|prototype|coding|codebase|developer)\b/, 1.5]
  ],
  Recruiting: [
    ["hiring and interviews", /\b(recruit|recruiter|hiring|interview|internship|job search|job application)\b/, 4],
    ["outreach", /\b(cold email|networking|coffee chat|referral|candidate|applicant)\b/, 4],
    ["application materials", /\b(resume|résumé|cover letter)\b/, 3]
  ],
  Startups: [
    ["founder building", /\b(startup|founder|venture|entrepreneur|bootstrapp)\w*\b/, 4],
    ["validation", /\b(mvp|validation|validate|customer discovery|product.market fit|market gap|pain point)\b/, 4],
    ["launch and growth", /\b(fundrais|business model|go.to.market|launch strategy|first customers?|early users?)\w*\b/, 3]
  ],
  "Vlogs & Life": [
    ["life documentation", /\b(vlog|day in the life|daily life|lifestyle|ootd|outfit diary)\b/, 4],
    ["personal moments", /\b(routine|travel|outfit|graduation|milestone|week in my life|morning routine|night routine)\b/, 3],
    ["personal narration", /\b(voiceover diary|come with me|spend the day|personal story)\b/, 3]
  ],
  "Content Creation": [
    ["hooks and scripts", /\b(hook|script|storytelling|content strategy|content engine|carousel|talking.head)\b/, 4],
    ["audience and publishing", /\b(audience|posting|publish|engagement|algorithm|creator growth|social media)\b/, 3],
    ["video craft", /\b(video edit|editing order|voiceover|b.roll|pacing|shot list|camera angle)\b/, 3]
  ],
  Career: [
    ["career development", /\b(career|professional|workplace|promotion|manager|leadership|career change)\b/, 4],
    ["proof of work", /\b(portfolio|project website|case study|personal brand|resume project)\b/, 3],
    ["work opportunities", /\b(job opportunity|role|work experience)\b/, 2]
  ],
  "Personal Growth": [
    ["personal growth", /\b(personal growth|self.improvement|mindset|confidence|wellbeing|wellness)\b/, 4],
    ["habits and reflection", /\b(habit|journaling|reflection|discipline|motivation|productivity)\b/, 3]
  ]
};

function inferKnowledgeAreaMembership(capture) {
  const primaryCategory = capture.contentCategory || inferContentCategory(capture);
  const text = captureSearchText(capture);
  const candidates = Object.entries(knowledgeAreaSignals)
    .filter(([category]) => category !== primaryCategory)
    .map(([category, definitions]) => {
      const matches = definitions.filter(([, pattern]) => pattern.test(text));
      return {
        category,
        score: matches.reduce((total, [, , weight]) => total + weight, 0),
        signals: matches.map(([label]) => label)
      };
    })
    .filter((candidate) => candidate.score >= 4)
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category))
    .slice(0, 2);
  const categories = [primaryCategory, ...candidates.map((candidate) => candidate.category)];
  const reasons = Object.fromEntries([
    [primaryCategory, "Primary subject"],
    ...candidates.map((candidate) => [candidate.category, `Touches ${candidate.signals.join(" and ")}`])
  ]);
  return { sourceId: capture.id, primaryCategory, categories, reasons, bridge: categories.length > 1 };
}

const connectionStopWords = new Set([
  "about", "after", "also", "assisted", "based", "because", "before", "both", "build", "building", "built", "comments", "content", "could", "create", "creating", "creator", "each", "exactly", "first", "from", "have", "idea", "ideas", "instead", "into", "learn", "like", "make", "month", "more", "multiple", "need", "only", "over", "people", "personal", "plain", "process", "ready", "reel", "reels", "result", "results", "saved", "shares", "should", "shows", "simple", "system", "that", "their", "them", "then", "they", "this", "three", "through", "tool", "tools", "turn", "used", "uses", "using", "video", "what", "when", "where", "which", "with", "work", "works", "your"
]);

function connectionConcepts(capture) {
  const text = [capture.title, capture.topic, capture.summary, ...(capture.takeaways || [])].filter(Boolean).join(" ").toLowerCase();
  return new Set(text.replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length >= 4 && !connectionStopWords.has(token)));
}

function strongPlaybookMatches(capture) {
  const text = captureSearchText(capture);
  return playbookDefinitions.filter((definition) => definition.keywords.filter((keyword) => text.includes(keyword)).length >= 2);
}

function mentionsKnownTool(capture, tool) {
  const escaped = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i").test(captureSearchText(capture));
}

export function buildKnowledgeNetwork(captures) {
  const ready = captures.filter((capture) => capture.status === "ready" && hasIntent(capture, "knowledge"));
  const memberships = ready.map((capture) => inferKnowledgeAreaMembership(capture));
  const membershipBySource = new Map(memberships.map((membership) => [membership.sourceId, membership]));
  const candidates = [];

  for (let leftIndex = 0; leftIndex < ready.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ready.length; rightIndex += 1) {
      const left = ready[leftIndex];
      const right = ready[rightIndex];
      const leftMembership = membershipBySource.get(left.id);
      const rightMembership = membershipBySource.get(right.id);
      const sharedCategories = leftMembership.categories.filter((category) => category !== "Other" && rightMembership.categories.includes(category));
      const crossesAreas = leftMembership.primaryCategory !== rightMembership.primaryCategory;
      const sharedDomains = inferKnowledgeDomains(left).filter((domain) => inferKnowledgeDomains(right).includes(domain));
      const sharedTools = knownTools.filter((tool) => mentionsKnownTool(left, tool) && mentionsKnownTool(right, tool));
      const specificTools = sharedTools.filter((tool) => tool !== "Claude");
      const sharedPlaybooks = strongPlaybookMatches(left).filter((definition) => strongPlaybookMatches(right).some((other) => other.id === definition.id));
      const rightConcepts = connectionConcepts(right);
      const sharedConcepts = [...connectionConcepts(left)].filter((concept) => rightConcepts.has(concept)).slice(0, 4);
      const sameCreator = left.creator && right.creator && left.creator === right.creator && !/unknown|instagram creator/i.test(left.creator);
      const hasSpecificEvidence = specificTools.length > 0
        || sharedConcepts.length >= 3
        || (sameCreator && sharedConcepts.length > 0)
        || (sharedPlaybooks.length > 0 && (sharedConcepts.length >= 2 || sharedTools.length > 0));
      if (!hasSpecificEvidence) continue;
      const score = (sharedCategories.length * (crossesAreas ? 1 : .5))
        + (sharedDomains.length * .5)
        + (specificTools.length * 4)
        + (sharedTools.includes("Claude") ? 1.25 : 0)
        + (sharedPlaybooks.length * 1.5)
        + (sharedConcepts.length * 1.2)
        + (sameCreator ? 2 : 0);
      if (score < 5) continue;
      const signals = uniqueText([
        sharedCategories.map((category) => `${category} overlap`),
        sharedPlaybooks.map((definition) => definition.title),
        sharedTools,
        sharedConcepts.slice(0, 3)
      ], 5);
      const reason = specificTools.length
        ? `Both use ${specificTools.slice(0, 2).join(" and ")}${crossesAreas ? ` across ${leftMembership.primaryCategory} and ${rightMembership.primaryCategory}` : ""}.`
        : sharedPlaybooks.length
          ? `Both contribute to “${sharedPlaybooks[0].title}.”`
          : crossesAreas
            ? `Connects ${leftMembership.primaryCategory} with ${rightMembership.primaryCategory} through ${sharedConcepts.slice(0, 3).join(", ")}.`
            : `Shared thread: ${sharedConcepts.slice(0, 3).join(", ")}.`;
      candidates.push({
        id: `connection-${[left.id, right.id].sort().join("-")}`,
        sourceId: left.id,
        targetSourceId: right.id,
        strength: Number(score.toFixed(2)),
        reason,
        signals,
        sharedCategories,
        crossesAreas
      });
    }
  }

  const degree = new Map();
  const connections = candidates
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
    .filter((connection) => {
      const leftDegree = degree.get(connection.sourceId) || 0;
      const rightDegree = degree.get(connection.targetSourceId) || 0;
      if (leftDegree >= 4 || rightDegree >= 4) return false;
      degree.set(connection.sourceId, leftDegree + 1);
      degree.set(connection.targetSourceId, rightDegree + 1);
      return true;
    });

  return { memberships, connections };
}

function inferUseCases(capture) {
  const text = captureSearchText(capture);
  const useCases = new Set(["Learn"]);
  if (/\b(build|code|create|make|prototype|implement|set up|setup)\b/.test(text)) useCases.add("Build");
  if (/\b(content|reel|hook|script|carousel|post|vlog)\b/.test(text)) useCases.add("Create");
  if (capture.action || /\b(try|apply|use this|next step)\b/.test(text)) useCases.add("Apply");
  if (/\b(template|checklist|framework|reference|guide)\b/.test(text)) useCases.add("Reference");
  return [...useCases];
}

function inferEvidence(capture) {
  if (capture.status !== "ready") return "Incomplete";
  if (capture.transcript?.trim()) return "Transcript";
  if (capture.extraction && /caption|embed|page/i.test(capture.extraction)) return "Caption";
  if (capture.sharedText?.trim()) return "Your note";
  return "Source summary";
}

function inferFreshness(capture) {
  const text = captureSearchText(capture);
  return /\b(today|this week|this month|202[4-9]|update|algorithm|trend|trending|event|launch date|limited|deadline|season|world cup|us open)\b/.test(text)
    ? "Time-sensitive"
    : "Evergreen";
}

const playbookDefinitions = [
  {
    id: "run-small-ai-team",
    title: "Run a small AI team",
    outcome: "Turn separate AI agents into a focused team with clear jobs, tools, and handoffs.",
    description: "Your saved systems for agent roles, parallel work, prompt hygiene, and AI-assisted execution.",
    accent: "#e5c957",
    categories: ["AI Products"],
    keywords: ["agent", "sub-agent", "orchestrat", "parallel", "claude.md", "prompt", "ai team", "workflow automation"],
    fallbackWorkflow: ["Give every agent one narrow job and a clear definition of done.", "Write the identity, context, and rules it needs to make decisions.", "Connect only the tools required for that job.", "Define handoffs between agents before running work in parallel.", "Review failures and remove stale or conflicting instructions."],
    missingPieces: ["A reusable agent brief template", "A lightweight quality-control checklist", "A real weekly operating rhythm"]
  },
  {
    id: "personal-content-engine",
    title: "Build a personal content engine",
    outcome: "Move from idea research to scripts, carousels, and publishable Reels without starting from zero.",
    description: "Hooks, creator systems, competitor research, repurposing, and production workflows from your saves.",
    accent: "#7fa9d4",
    categories: ["Content Creation"],
    keywords: ["content", "reel", "hook", "script", "carousel", "creator", "linkedin", "competitor", "audience", "editing"],
    fallbackWorkflow: ["Collect proven topics and opening patterns from creators in your niche.", "Choose one clear promise and draft the hook before the body.", "Build the content around a simple repeatable structure.", "Repurpose the same idea across Reel, carousel, and written formats.", "Review performance and save the reusable pattern—not only the post."],
    missingPieces: ["A weekly publishing cadence", "Your own hook performance data", "A consistent review-and-repurpose ritual"]
  },
  {
    id: "build-career-proof",
    title: "Build career proof",
    outcome: "Turn small projects and clear outreach into visible evidence that helps you get opportunities.",
    description: "Portfolio projects, resume proof, outreach structures, and recruiting ideas collected in one path.",
    accent: "#9bbde0",
    categories: ["Career", "Recruiting"],
    keywords: ["resume", "portfolio", "job", "career", "intern", "recruit", "cold email", "project website"],
    fallbackWorkflow: ["Pick one small problem you genuinely understand.", "Build a working solution with a narrow scope.", "Document the decisions, iterations, and feedback—not just the final screen.", "Publish a project page that makes the proof easy to scan.", "Use tailored outreach to put the proof in front of the right people."],
    missingPieces: ["A portfolio story template", "Examples of strong project metrics", "A follow-up sequence for outreach"]
  },
  {
    id: "network-with-substance",
    title: "Network with substance",
    outcome: "Replace forgettable small talk with thoughtful questions, useful follow-ups, and relationships that compound.",
    description: "Conversation starters, introductions, outreach, and relationship-building patterns from your newest career saves.",
    accent: "#e7a28f",
    categories: ["Career", "Recruiting", "Startups"],
    keywords: ["network", "small talk", "introduce yourself", "cold email", "relationship building", "career decision", "conversation starter"],
    focusedMinimumHits: 1,
    fallbackWorkflow: ["Choose one question that invites a real story instead of a résumé recap.", "Listen for a problem, decision, or priority you can follow up on.", "Offer one specific form of help before asking for anything.", "Record the useful context while it is fresh.", "Follow up with a detail from the conversation so the relationship feels remembered."],
    missingPieces: ["A short follow-up note template", "A lightweight relationship log", "Examples of useful, non-transactional offers"]
  },
  {
    id: "build-data-fluency",
    title: "Build data fluency",
    outcome: "Turn SQL, Python, analytics, and AI-assisted data skills into visible, interview-ready proof.",
    description: "Learning sequences, practical tools, cleaning workflows, and portfolio directions for data-oriented work.",
    accent: "#9bbde0",
    categories: ["Career", "AI Products"],
    keywords: ["sql", "python", "data analyst", "analytics", "excel", "pandas", "data cleaning", "github"],
    focusedMinimumHits: 1,
    fallbackWorkflow: ["Start with SQL joins, grouping, and window functions.", "Add Python and pandas for cleaning and analysis.", "Use AI to review attempts after you have written your own solution.", "Build one compact project around messy real-world data.", "Publish the question, method, result, and trade-offs as career proof."],
    missingPieces: ["One real dataset worth cleaning", "A project write-up template", "A clear interview-practice loop"]
  },
  {
    id: "shape-memorable-brand",
    title: "Shape a memorable brand",
    outcome: "Make your work recognizable through a clear point of view, repeatable identity, and niche-specific content.",
    description: "Brand feelings, visual identity, niche positioning, and audience cues that recur across your saves.",
    accent: "#e5c957",
    categories: ["Startups", "Content Creation"],
    keywords: ["brand identity", "branding", "niche", "positioning", "audience", "customer avatar", "fonts", "colors"],
    focusedMinimumHits: 2,
    fallbackWorkflow: ["Name three feelings or traits the brand should consistently evoke.", "Choose a narrow audience problem you can credibly own.", "Set a small repeatable visual kit instead of redesigning every post.", "Create two or three signature content formats that express the same point of view.", "Review whether each public touchpoint feels like the same person or product."],
    missingPieces: ["A one-page brand brief", "Examples of your strongest visual references", "A rule for deciding what does not fit the brand"]
  },
  {
    id: "understand-ai-foundations",
    title: "Understand AI foundations",
    outcome: "Move from AI vocabulary to mental models you can explain, test, and use when building products.",
    description: "LLMs, tokens, transformers, RAG, machine-learning algorithms, and practical analogies from your technical saves.",
    accent: "#8cbdae",
    categories: ["AI Products"],
    keywords: ["llm", "token", "transformer", "rag", "machine learning", "algorithm", "ai fundamentals", "model"],
    focusedMinimumHits: 2,
    fallbackWorkflow: ["Explain the concept in plain language before reaching for implementation details.", "Identify its input, transformation, and output.", "Build or sketch the smallest example that makes the mechanism visible.", "Compare where the mental model is useful and where it breaks.", "Connect the concept to one product decision you are currently making."],
    missingPieces: ["A glossary in your own words", "Small runnable examples", "A map from concepts to product trade-offs"]
  },
  {
    id: "create-lifestyle-reels",
    title: "Create lifestyle Reels",
    outcome: "Turn an ordinary day, outfit, or event into a Reel with a natural beginning, progression, and close.",
    description: "Day-in-the-life structures, event timing, narration patterns, and lifestyle details worth copying.",
    accent: "#a9c9e7",
    categories: ["Vlogs & Life"],
    keywords: ["vlog", "day in the life", "outfit", "ootd", "routine", "lifestyle", "event"],
    fallbackWorkflow: ["Choose one reason this day is worth following.", "Map the day into four to six distinct stops or beats.", "Narrate small choices so the video feels personal, not generic.", "Mix routine with one discovery, tension, or timely event.", "Close with a calm payoff or reflection that completes the day."],
    missingPieces: ["A shot-list template", "Your preferred voiceover pacing", "Examples of stronger closing lines"]
  },
  {
    id: "find-launch-ideas",
    title: "Find and launch ideas",
    outcome: "Find problems worth solving, narrow them into a credible niche, and reach a small first version.",
    description: "Problem discovery, validation, positioning, MVP thinking, and launch lessons from founders you saved.",
    accent: "#8cbdae",
    categories: ["Startups"],
    keywords: ["startup", "founder", "business", "idea", "problem", "mvp", "validation", "customer", "launch"],
    fallbackWorkflow: ["Keep a log of recurring problems you personally experience.", "Describe the ideal fix before choosing a product format.", "Research existing solutions and talk to people with the same problem.", "Narrow to a niche where your experience gives you an advantage.", "Build the smallest version that can test the riskiest assumption."],
    missingPieces: ["A validation interview script", "A decision rule for choosing one idea", "A lightweight launch checklist"]
  },
  {
    id: "technical-experiment-lab",
    title: "Technical experiment lab",
    outcome: "Turn interesting technical concepts into small experiments you can run, see, and explain.",
    description: "A shelf for coding concepts, simulations, hardware prototypes, and visual experiments.",
    accent: "#6f89b3",
    categories: ["Other"],
    keywords: ["shader", "monte carlo", "raspberry pi", "simulation", "python", "pixel", "hardware", "technical"],
    fallbackWorkflow: ["Restate the concept in one sentence and identify its inputs and outputs.", "Build the smallest visible or measurable version.", "Change one variable at a time and record what happens.", "Connect the result to a practical use case.", "Explain the experiment in your own words so it becomes durable knowledge."],
    missingPieces: ["A repeatable experiment note", "Links to starter code", "A place to record results and variations"]
  }
];

const knownTools = ["Claude", "Claude Code", "Apify", "Scribe", "Supadata", "Perplexity", "Descript", "Gmail", "Canva", "Notion", "Replit", "Raspberry Pi", "Python", "Watermelon UI", "Motion Primitives", "Haiku"];

function uniqueText(items, limit = Infinity) {
  const seen = new Set();
  const result = [];
  for (const item of items.flat().filter(Boolean)) {
    const value = String(item).trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function clipText(value, limit) {
  const text = safeText(value).trim();
  return text.length > limit ? `${safeText(text, limit - 1).trim()}…` : text;
}

export function buildAskSourceContext(captures, sourceIds) {
  const requested = (Array.isArray(sourceIds) ? sourceIds : []).map(String).slice(0, 5);
  const byId = new Map(captures.map((capture) => [String(capture.id), capture]));
  const sources = requested
    .map((id) => byId.get(id))
    .filter((capture) => capture && capture.status === "ready" && hasIntent(capture, "knowledge"))
    .map((capture, index) => ({
      number: index + 1,
      id: capture.id,
      title: capture.title || "Saved source",
      creator: capture.creator || "Unknown creator",
      url: capture.url,
      note: [
        `Title: ${clipText(capture.title, 100)}`,
        `Topic: ${clipText(capture.topic, 80)}`,
        `Summary: ${clipText(capture.summary, 420)}`,
        `Takeaways: ${(capture.takeaways || []).slice(0, 4).map((item) => clipText(item, 180)).join(" | ")}`,
        `Structure: ${clipText(capture.structure, 280)}`,
        `Next action: ${clipText(capture.action, 180)}`
      ].filter((line) => !line.endsWith(": ")).join("\n")
    }));
  return {
    sources: sources.map(({ note, ...source }) => source),
    context: sources.map((source) => `[${source.number}]\n${source.note}`).join("\n\n")
  };
}

function allowAsk(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const key = forwarded || req.socket?.remoteAddress || "local";
  const now = Date.now();
  const recent = (askWindows.get(key) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (recent.length >= 10) return false;
  recent.push(now);
  askWindows.set(key, recent);
  return true;
}

async function askWithAnthropic(question, sourceContext) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Claude is not connected yet.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_ASK_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const response = await client.messages.create({
    model,
    max_tokens: 700,
    system: [
      "You answer questions using only the user's compact Spool source notes.",
      "Do not use outside knowledge or invent missing details.",
      "Give a direct answer first, then the most useful principles or steps, then one practical next action.",
      "Cite supporting sources inline as [1], [2], and so on.",
      "If the saved notes are insufficient, state exactly what is missing.",
      "Stay under 350 words. Use plain language and short sections."
    ].join(" "),
    messages: [{ role: "user", content: safeText(`Question: ${question}\n\nSaved source notes:\n${sourceContext}`) }]
  });
  const answer = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  if (!answer) throw new Error("Claude returned an empty answer.");
  return { answer, model, usage: response.usage };
}

function matchesPlaybook(capture, definition) {
  const category = capture.contentCategory || inferContentCategory(capture);
  const text = captureSearchText(capture);
  const categoryMatch = definition.categories.includes(category);
  const keywordHits = definition.keywords.filter((keyword) => text.includes(keyword)).length;
  if (definition.focusedMinimumHits) return (categoryMatch && keywordHits >= definition.focusedMinimumHits) || keywordHits >= definition.focusedMinimumHits + 1;
  if (definition.id === "run-small-ai-team") return (categoryMatch && keywordHits >= 1) || keywordHits >= 3;
  return categoryMatch || keywordHits >= 3;
}

function transcriptText(payload) {
  const content = payload?.content ?? payload?.result?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((chunk) => typeof chunk === "string" ? chunk : chunk?.text || "").filter(Boolean).join(" ").trim();
  return "";
}

async function fetchSupadata(path, timeoutMs = 48_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://api.supadata.ai${path}`, {
      headers: { "x-api-key": process.env.SUPADATA_API_KEY || "" },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(supadataErrorMessage(payload, response.status, process.env.SUPADATA_API_KEY));
    }
    return {
      payload,
      status: response.status,
      credits: Number(response.headers.get("x-billable-requests") || 0) || undefined
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestTranscript(sourceUrl, existingJobId = "", onJobStarted = async () => undefined) {
  if (!process.env.SUPADATA_API_KEY) throw new Error("Supadata is not connected yet.");
  if (!existingJobId) {
    const account = await readTranscriptAccount(process.env.SUPADATA_API_KEY);
    if (account.status === "exhausted") throw new Error("Supadata quota exceeded: transcript allowance is used up. Wait for your credits to reset or check your Supadata account.");
    if (account.status === "invalid") throw new Error("Supadata rejected the API key. Update the server connection before retrying.");
  }
  let result;
  let credits;
  let jobId = existingJobId;
  if (jobId) {
    result = await fetchSupadata(`/v1/transcript/${encodeURIComponent(jobId)}`, 12_000);
  } else {
    const query = new URLSearchParams({ url: sourceUrl, text: "true", mode: "auto" });
    result = await fetchSupadata(`/v1/transcript?${query.toString()}`);
    credits = result.credits;
    jobId = result.payload?.jobId || "";
    if (jobId) {
      await onJobStarted(jobId, credits);
      // A slow initial request must not leave too little function time to poll.
      return { pending: true, jobId, credits };
    }
  }
  if (result.status === 202 || jobId) {
    if (!jobId) throw new Error("Supadata started a transcript without returning a job ID.");
    const deadline = Date.now() + 32_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      result = await fetchSupadata(`/v1/transcript/${encodeURIComponent(jobId)}`, Math.max(1, Math.min(12_000, deadline - Date.now())));
      const status = result.payload?.status;
      if (status === "failed") throw new Error(result.payload?.error || "Supadata could not transcribe this Reel.");
      if (status === "completed") break;
    }
    if (result.payload?.status !== "completed") return { pending: true, jobId, credits };
  }
  const transcript = transcriptText(result.payload);
  if (!transcript) throw new Error("No spoken words were detected in this video.");
  return {
    transcript: transcript.slice(0, 40_000),
    language: result.payload?.lang || result.payload?.result?.lang || "",
    credits,
    jobId
  };
}

function decodeJsonStringFragment(value) {
  let decoded = value;
  for (let layer = 0; layer < 2; layer += 1) {
    try { decoded = JSON.parse(`"${decoded}"`); }
    catch { break; }
  }
  return decoded
    .replace(/\\n/g, "\n")
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

async function fetchInstagramEmbedContext(sourceUrl) {
  const parsed = new URL(sourceUrl);
  if (!parsed.hostname.includes("instagram.com")) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const typeIndex = parts.findIndex((part) => part === "reel" || part === "p" || part === "tv");
  const shortcode = typeIndex >= 0 ? parts[typeIndex + 1] : "";
  if (!shortcode) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`https://www.instagram.com/${parts[typeIndex]}/${shortcode}/embed/captioned/`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Spool/1.0; personal knowledge capture)" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const html = await response.text();
    const captionMatch = html.match(/edge_media_to_caption[\s\S]{0,100}?text[\\"]+:[\\"]+([\s\S]*?)[\\"]+\}\}\}/);
    const ownerMatch = html.match(/\\"owner\\":\{\\"id\\":\\"[^\"]+\\",\\"username\\":\\"([^\"]+)\\"/);
    const caption = captionMatch ? decodeJsonStringFragment(captionMatch[1]) : "";
    const creator = ownerMatch ? `@${ownerMatch[1]}` : "";
    if (!caption && !creator) return null;
    return { caption: caption.slice(0, 8_000), creator, shortcode };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackAnalysis(capture) {
  const source = sourceFromUrl(capture.url);
  return {
    ...source,
    title: source.platform === "Instagram" ? "Shared Instagram reel" : `Shared from ${source.platform}`,
    topic: source.kind === "style" ? "Creative references" : "Unsorted ideas",
    summary: capture.sharedText
      ? `Saved with your note: ${capture.sharedText.slice(0, 240)}`
      : "Saved successfully. Claude needs either access to the public page or a short note about what stood out.",
    takeaways: [],
    hook: "",
    structure: "",
    action: "",
    confidence: 0,
    status: "needs-context",
    sourceCoverage: "insufficient",
    transcriptRecommended: hasIntent(capture, "knowledge"),
    transcriptReason: hasIntent(capture, "knowledge") ? "The saved source needs spoken context before its lesson can be verified." : "",
    contentCategory: inferContentCategory(capture)
  };
}

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    platform: { type: "string", enum: ["Instagram", "YouTube", "Web"] },
    creator: { type: "string" },
    title: { type: "string" },
    kind: { type: "string", enum: ["idea", "style", "creator", "tool"] },
    topic: { type: "string" },
    summary: { type: "string" },
    takeaways: { type: "array", items: { type: "string" } },
    hook: { type: "string" },
    structure: { type: "string" },
    action: { type: "string" },
    confidence: { type: "number" },
    status: { type: "string", enum: ["ready", "needs-context"] },
    sourceCoverage: { type: "string", enum: ["complete", "partial", "insufficient"] },
    transcriptRecommended: { type: "boolean" },
    transcriptReason: { type: "string" },
    contentCategory: { type: "string", enum: knowledgeCategories }
  },
  required: ["platform", "creator", "title", "kind", "topic", "summary", "takeaways", "hook", "structure", "action", "confidence", "status", "sourceCoverage", "transcriptRecommended", "transcriptReason", "contentCategory"]
};

async function analyzeWithAnthropic(capture) {
  if (!process.env.ANTHROPIC_API_KEY) return {
    ...fallbackAnalysis(capture),
    provider: "anthropic",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5"
  };

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const sourceDomain = new URL(capture.url).hostname;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const instagramContext = !capture.transcript ? await fetchInstagramEmbedContext(capture.url) : null;
  const intents = intentsForCapture(capture);
  const contextParts = [];
  if (capture.sharedText) contextParts.push(`User's reason for saving:\n${capture.sharedText}`);
  if (capture.transcript) contextParts.push(`Spoken-word transcript:\n${capture.transcript}`);
  if (instagramContext?.caption) contextParts.push(`Public Instagram caption from ${instagramContext.creator || "the creator"}:\n${instagramContext.caption}`);
  const suppliedContext = contextParts.join("\n\n") || "None supplied";
  const system = [
      "You turn a shared social-media source into a concise personal knowledge record.",
      `The user explicitly selected these purposes: ${intents.join(", ") || "save only"}.`,
      "The URL was explicitly shared by the user for analysis. Fetch only that source domain.",
      "Never invent a transcript, claim, creator identity, or visual detail you cannot verify.",
      "For Knowledge, extract the durable lesson, steps, examples, and outcome. For Creator, study the reusable hook, delivery, and structure. For Script, use the supplied transcript to map wording and delivery. Only fill the parts the selected purposes need.",
      `Choose exactly one stable contentCategory from: ${knowledgeCategories.join(", ")}. Classify by what the video teaches or documents, not by its creator or format. Use Other only when none fit.`,
      "Judge sourceCoverage against the actual informational content, not the user's reason for saving. Complete means the supplied caption, page text, or transcript contains the substantive lesson and steps. Partial means it hints at the idea but omits important spoken detail. Insufficient means it only announces the topic or is inaccessible.",
      "Recommend a transcript only when Knowledge was selected and sourceCoverage is not complete, or when Script was selected and no transcript was supplied. Never recommend visual analysis.",
      "If Knowledge is selected and coverage is partial or insufficient without a transcript, return needs-context. Creator-only saves can be ready when there is enough verified style evidence.",
      "Separate the durable idea from the reusable creative pattern. Keep takeaways to four or fewer.",
      "Write for a glanceable personal notebook: title at most 8 words; topic is a reusable concept name of 2 to 5 words; summary at most 45 words; each takeaway at most 18 words; hook at most 20 words; structure as a compact arrow-separated sequence; action at most 20 words.",
      "Do not turn the topic or action into a full descriptive sentence.",
      "If the page is inaccessible and shared text is insufficient, return needs-context and say exactly what short note would unblock it.",
      "Do not copy creator wording beyond tiny identifying phrases. Extract structures and patterns instead."
    ].join(" ");
  const messages = [{
      role: "user",
      content: safeText(`Analyze this saved source.\nURL: ${capture.url}\nCreator hint: ${instagramContext?.creator || capture.creator || "Unknown"}\nShared text: ${suppliedContext}`)
    }];
  const webFetchTool = {
      type: "web_fetch_20260318",
      name: "web_fetch",
      max_uses: 1,
      max_content_tokens: 12_000,
      allowed_domains: [sourceDomain],
      response_inclusion: "excluded"
    };
  const createResponse = (useWebFetch) => client.messages.create({
    model,
    max_tokens: 2200,
    system,
    messages,
    ...(useWebFetch ? { tools: [webFetchTool] } : {}),
    output_config: { format: { type: "json_schema", schema: analysisSchema } }
  });
  const parseResponse = (response) => {
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!text) throw new Error(`Claude returned no analysis (stop reason: ${response.stop_reason || "unknown"})`);
    const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const firstBrace = unfenced.indexOf("{");
    const lastBrace = unfenced.lastIndexOf("}");
    const candidate = firstBrace >= 0 && lastBrace > firstBrace ? unfenced.slice(firstBrace, lastBrace + 1) : unfenced;
    return JSON.parse(candidate);
  };

  const shouldFetch = !capture.transcript && !instagramContext?.caption;
  let response = await createResponse(shouldFetch);
  let analysis;
  try {
    analysis = parseResponse(response);
  } catch (firstError) {
    // A server tool call can consume the first response without leaving a text block.
    // Retry once from the checkpointed caption/transcript without web fetch.
    response = await createResponse(false);
    try {
      analysis = parseResponse(response);
    } catch (secondError) {
      const firstMessage = firstError instanceof Error ? firstError.message : "unknown first response";
      const secondMessage = secondError instanceof Error ? secondError.message : "unknown retry response";
      throw new Error(`${secondMessage}; first attempt: ${firstMessage}`);
    }
  }
  if (analysis.platform === "Instagram" && analysis.creator && !analysis.creator.startsWith("@") && analysis.creator !== "Instagram creator") {
    analysis.creator = `@${analysis.creator}`;
  }
  return {
    ...analysis,
    takeaways: analysis.takeaways.slice(0, 4),
    confidence: Math.max(0, Math.min(1, Number(analysis.confidence) || 0)),
    provider: "anthropic",
    model,
    requestId: response._request_id,
    usage: response.usage,
    extraction: capture.transcript ? "supadata-transcript" : instagramContext?.caption ? "instagram-embed-caption" : capture.sharedText ? "shared-text" : "source-fetch"
  };
}

async function transcribeCapture(id) {
  let capture = await findCapture(id);
  if (!capture) return null;
  capture.transcriptStatus = "processing";
  capture.transcriptError = "";
  capture.transcriptStartedAt = new Date().toISOString();
  capture.transcriptAttemptCount = Number(capture.transcriptAttemptCount || 0) + 1;
  await upsertCapture(capture);
  try {
    const result = await requestTranscript(capture.url, capture.transcriptJobId || "", async (jobId, credits) => {
      const current = await findCapture(id);
      if (!current) return;
      current.transcriptJobId = jobId;
      if (credits) current.transcriptCredits = credits;
      current.transcriptJobStartedAt = new Date().toISOString();
      await upsertCapture(current);
    });
    capture = await findCapture(id);
    if (!capture) return null;
    if (result.pending) {
      capture.transcriptJobId = result.jobId;
      capture.transcriptStatus = Number(capture.transcriptAttemptCount || 0) >= 4 ? "failed" : "queued";
      capture.transcriptError = capture.transcriptStatus === "failed"
        ? "The transcript took too long to finish. Retry the transcript to start a fresh attempt."
        : "Supadata is still preparing this transcript. Spool will check again automatically.";
      if (capture.transcriptStatus === "failed" && capture.status !== "ready") {
        capture.status = "needs-context";
        capture.topic = "Transcript needs retry";
        capture.summary = "The Reel is saved, but its transcript did not finish. Retry the transcript to continue.";
      }
      capture.transcriptUpdatedAt = new Date().toISOString();
      await upsertCapture(capture);
      return capture;
    }
    capture.transcript = result.transcript;
    capture.transcriptLanguage = result.language;
    capture.transcriptCredits = result.credits;
    capture.transcriptStatus = "ready";
    capture.transcribedAt = new Date().toISOString();
    capture.transcriptUpdatedAt = capture.transcribedAt;
    capture.transcriptError = "";
    await upsertCapture(capture);
    return capture;
  } catch (error) {
    capture = await findCapture(id);
    if (!capture) return null;
    capture.transcriptStatus = "failed";
    capture.transcriptError = error instanceof Error ? error.message : "Transcription failed";
    // A failed optional transcript must not erase an already usable note.
    if (capture.status !== "ready") {
      capture.status = "needs-context";
      Object.assign(capture, transcriptFailure(capture.transcriptError));
    }
    capture.transcriptUpdatedAt = new Date().toISOString();
    await upsertCapture(capture);
    return capture;
  }
}

function requestOrigin(req) {
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProtocol || (process.env.VERCEL ? "https" : "http");
  const host = req.headers.host || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return host ? `${protocol}://${host}` : "";
}

async function dispatchContinuation(id, origin) {
  if (!origin) return;
  const headers = { "Content-Type": "application/json", "X-Spool-Continuation": "1" };
  if (process.env.SPOOL_CAPTURE_TOKEN) headers.Authorization = `Bearer ${process.env.SPOOL_CAPTURE_TOKEN}`;
  const response = await fetch(`${origin}/api/captures/${encodeURIComponent(id)}/continue`, { method: "POST", headers });
  if (!response.ok) throw new Error(`Could not continue processing (${response.status})`);
}

async function processCapture(id, previousReadyCapture = null, origin = "") {
  let capture = await findCapture(id);
  if (!capture) return;
  const intents = intentsForCapture(capture);
  const wantsScript = intents.includes("script");
  const wantsKnowledge = intents.includes("knowledge");

  if (wantsScript && !capture.transcript) {
    if (capture.transcriptStatus === "failed") return;
    capture = await transcribeCapture(id);
    if (capture?.transcriptStatus === "queued" || capture?.transcriptStatus === "ready") await dispatchContinuation(id, origin);
    return;
  }

  if (wantsKnowledge && !capture.transcript && capture.transcriptRecommended && (capture.transcriptStatus === "queued" || capture.transcriptStatus === "processing")) {
    capture = await transcribeCapture(id);
    if (capture?.transcriptStatus === "queued" || capture?.transcriptStatus === "ready") await dispatchContinuation(id, origin);
    return;
  }

  await enrichCapture(id, previousReadyCapture);
  capture = await findCapture(id);
  if (!capture || capture.status === "failed" || capture.status === "ready" || !wantsKnowledge || capture.transcript || capture.sourceCoverage === "complete") return;

  if (!capture.transcriptRecommended || !process.env.SUPADATA_API_KEY) return;
  capture.transcriptStatus = "queued";
  capture.transcriptError = "";
  capture.status = "processing";
  capture.summary = "The caption does not contain the lesson. Spool is reading the spoken words next.";
  await upsertCapture(capture);
  await dispatchContinuation(id, origin);
}

async function enrichCapture(id, previousReadyCapture = null) {
  let capture = await findCapture(id);
  if (!capture) return null;
  capture.status = "processing";
  capture.processingStartedAt = new Date().toISOString();
  capture.processingStage = capture.transcript ? "analysis-from-transcript" : "analysis-from-source";
  await upsertCapture(capture);
  let analysis;
  try {
    analysis = await analyzeWithAnthropic({ ...capture });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    analysis = {
      ...sourceFromUrl(capture.url),
      title: capture.title === "Reading the source…" ? "Saved source" : capture.title,
      topic: "Analysis needs retry",
      summary: capture.transcript
        ? "The transcript is safe, but Claude could not finish organizing it. Retry analysis—no new transcript credits are needed."
        : "Claude could not finish this note. Retry analysis, or add context if Instagram blocked the source.",
      takeaways: [],
      hook: capture.hook || "",
      structure: capture.structure || "",
      action: "",
      confidence: 0,
      status: "failed",
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      error: message
    };
  }
  if (previousReadyCapture && analysis.status !== "ready") {
    await upsertCapture({
      ...previousReadyCapture,
      lastRetryAt: new Date().toISOString(),
      lastRetryStatus: analysis.status,
      lastRetrySummary: analysis.summary,
      lastRetryError: analysis.error || ""
    });
    return previousReadyCapture;
  }
  capture = await findCapture(id);
  if (!capture) return null;
  Object.assign(capture, analysis);
  capture.processedAt = new Date().toISOString();
  capture.processingStage = "complete";
  capture.analysisInput = capture.transcript ? "transcript" : "source";
  capture.analysisTranscriptAt = capture.transcript ? capture.transcribedAt || capture.transcriptUpdatedAt || capture.processedAt : "";
  await upsertCapture(capture);
  return capture;
}

function timestampAge(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? Date.now() - timestamp : Number.POSITIVE_INFINITY;
}

function isStaleCapture(capture) {
  if (capture.status !== "processing" && capture.status !== "queued") return false;
  return timestampAge(capture.processingStartedAt || capture.capturedAt) > 5 * 60_000;
}

function isStaleTranscript(capture) {
  if (capture.transcriptStatus !== "processing" && capture.transcriptStatus !== "queued") return false;
  return timestampAge(capture.transcriptStartedAt || capture.transcriptUpdatedAt || capture.capturedAt) > 5 * 60_000;
}

async function prepareStaleRepairs() {
  const captures = await readCaptures();
  const repaired = [];
  for (const capture of captures) {
    const staleAnalysis = isStaleCapture(capture);
    const staleTranscript = isStaleTranscript(capture);
    const recoveryCount = Number(capture.recoveryCount || 0);
    const recoverableAnalysis = canAutoRetryAnalysis(capture);
    const recoverableTranscript = capture.transcriptStatus === "failed" && recoveryCount < 2 && /aborted|too long|timed out|timeout/i.test(capture.transcriptError || "");
    if (!staleAnalysis && !staleTranscript && !recoverableAnalysis && !recoverableTranscript) continue;
    if (staleTranscript || recoverableTranscript) {
      capture.transcriptStatus = "queued";
      capture.transcriptError = capture.transcriptJobId
        ? "Resuming the existing transcript job."
        : "The earlier transcript job stopped before saving its result. Retrying now.";
    }
    if (staleAnalysis || recoverableAnalysis) {
      capture.status = "queued";
      delete capture.error;
    }
    capture.recoveredAt = new Date().toISOString();
    capture.recoveryCount = Number(capture.recoveryCount || 0) + 1;
    await upsertCapture(capture);
    repaired.push(capture.id);
  }
  return repaired;
}

export function buildLibrary(captures) {
  const ready = captures.filter((capture) => capture.status === "ready");
  const byTopic = new Map();
  const byCreator = new Map();
  const byCategory = new Map();
  for (const capture of ready) {
    if (hasIntent(capture, "knowledge")) {
      capture.contentCategory = inferContentCategory(capture);
      const topic = capture.topic || "Unsorted ideas";
      const topicGroup = byTopic.get(topic) || [];
      topicGroup.push(capture);
      byTopic.set(topic, topicGroup);

      const membership = inferKnowledgeAreaMembership(capture);
      membership.categories.forEach((category) => {
        const categoryGroup = byCategory.get(category) || [];
        categoryGroup.push(capture);
        byCategory.set(category, categoryGroup);
      });
    }

    if (hasIntent(capture, "creator")) {
      const creator = capture.creator || "Unknown source";
      const creatorGroup = byCreator.get(creator) || [];
      creatorGroup.push(capture);
      byCreator.set(creator, creatorGroup);
    }
  }

  const threads = [...byTopic.entries()].map(([topic, sources]) => ({
    id: `live-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: topic,
    sourceCount: sources.length,
    summary: sources.length === 1
      ? sources[0].summary
      : `${sources.length} saved sources now reinforce this thread. ${sources[0].summary}`,
    takeaways: [...new Set(sources.flatMap((source) => source.takeaways || []))].slice(0, 5),
    actions: [...new Set(sources.map((source) => source.action).filter(Boolean))].slice(0, 3),
    sourceIds: sources.map((source) => source.id),
    maturity: sources.length >= 4 ? "strong" : sources.length >= 2 ? "growing" : "seed"
  }));

  const creators = [...byCreator.entries()].map(([creator, sources]) => ({
    id: `live-${creator.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    creator,
    sourceCount: sources.length,
    topics: [...new Set(sources.map((source) => source.topic).filter(Boolean))].slice(0, 4),
    hooks: [...new Set(sources.map((source) => source.hook).filter(Boolean))].slice(0, 4),
    structures: [...new Set(sources.map((source) => source.structure).filter(Boolean))].slice(0, 4),
    sourceIds: sources.map((source) => source.id)
  }));

  const categories = [...byCategory.entries()].map(([name, sources]) => {
    const topics = [...new Set(sources.map((source) => source.topic).filter(Boolean))].slice(0, 8);
    const balancedPrinciples = sources.flatMap((source) => (source.takeaways || []).slice(0, 2));
    const allPrinciples = sources.flatMap((source) => source.takeaways || []);
    const principles = [...new Set([...balancedPrinciples, ...allPrinciples].filter(Boolean))].slice(0, 10);
    const playbook = [...new Set(sources.map((source) => source.action).filter(Boolean))].slice(0, 7);
    const guideSummary = sources.length === 1
      ? sources[0].summary
      : `${sources.length} saved Reels now form a practical ${name} guide: what matters, how people approach it, and what you can try next.`;
    const guideWords = sources.reduce((total, source) => total + [source.summary, source.structure, ...(source.takeaways || [])]
      .filter(Boolean)
      .join(" ")
      .split(/\s+/)
      .length, 0);
    const guide = {
      title: `${name} field guide`,
      summary: guideSummary,
      stage: sources.length >= 6 ? "Field guide" : sources.length >= 3 ? "Growing guide" : "First edition",
      readingMinutes: Math.max(3, Math.ceil(guideWords / 180)),
      principles,
      playbook,
      chapters: sources.map((source, index) => ({
        id: `chapter-${source.id}`,
        number: index + 1,
        title: source.topic || source.title || `Lesson ${index + 1}`,
        summary: source.summary || "This source is still being distilled.",
        lessons: (source.takeaways || []).slice(0, 4),
        structure: source.structure || "",
        action: source.action || "",
        sourceId: source.id,
        sourceTitle: source.title || "Saved Reel",
        creator: source.creator || "Unknown creator",
        url: source.url,
        confidence: source.confidence || 0
      }))
    };

    return {
      id: `category-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      sourceCount: sources.length,
      sourceIds: sources.map((source) => source.id),
      topics,
      summary: guideSummary,
      guide
    };
  });

  const knowledgeItems = captures
    .filter((capture) => hasIntent(capture, "knowledge"))
    .map((capture) => {
      const contentCategory = capture.contentCategory || inferContentCategory(capture);
      return {
        id: capture.id,
        title: capture.title || "Saved source",
        summary: capture.summary || "This source still needs enough context to become knowledge.",
        creator: capture.creator || "Unknown creator",
        url: capture.url,
        status: capture.status,
        capturedAt: capture.capturedAt,
        contentCategory,
        knowledgeType: inferKnowledgeType(capture),
        domains: inferKnowledgeDomains({ ...capture, contentCategory }),
        useCases: inferUseCases(capture),
        evidence: inferEvidence(capture),
        freshness: inferFreshness(capture),
        sourceCoverage: capture.sourceCoverage || "insufficient",
        sourceId: capture.id
      };
    });

  const playbooks = playbookDefinitions.map((definition) => {
    const sources = ready
      .filter((capture) => hasIntent(capture, "knowledge"))
      .map((capture) => ({ ...capture, contentCategory: capture.contentCategory || inferContentCategory(capture) }))
      .filter((capture) => matchesPlaybook(capture, definition))
      .sort((a, b) => (Number(b.confidence || 0) - Number(a.confidence || 0)) || String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));
    const principles = uniqueText([
      sources.flatMap((source) => (source.takeaways || []).slice(0, 2)),
      sources.flatMap((source) => source.takeaways || [])
    ], 9);
    const sourceActions = uniqueText(sources.map((source) => source.action), 5);
    const workflow = sourceActions.length >= 3 ? sourceActions : uniqueText([sourceActions, definition.fallbackWorkflow], 5);
    const corpus = sources.map((source) => captureSearchText(source)).join(" ");
    const tools = knownTools.filter((tool) => corpus.includes(tool.toLowerCase()));
    const hooks = uniqueText(sources.map((source) => source.hook), 5);
    const structures = uniqueText(sources.map((source) => source.structure), 5);
    const knowledgeTypes = uniqueText(sources.map((source) => inferKnowledgeType(source)), 8);
    const domains = uniqueText(sources.flatMap((source) => inferKnowledgeDomains(source)), 8);
    const words = sources.reduce((total, source) => total + [source.summary, source.action, source.structure, ...(source.takeaways || [])]
      .filter(Boolean).join(" ").split(/\s+/).length, 0);
    return {
      id: definition.id,
      title: definition.title,
      outcome: definition.outcome,
      summary: sources.length
        ? `${definition.description} ${sources.length} ${sources.length === 1 ? "save is" : "saves are"} currently shaping this playbook.`
        : definition.description,
      accent: definition.accent,
      sourceCount: sources.length,
      sourceIds: sources.map((source) => source.id),
      stage: sources.length >= 7 ? "Working system" : sources.length >= 3 ? "Growing playbook" : sources.length ? "Early draft" : "Not started",
      readingMinutes: Math.max(3, Math.ceil(words / 190)),
      domains,
      knowledgeTypes,
      principles,
      workflow,
      tools,
      assets: {
        hooks,
        structures,
        actions: sourceActions
      },
      missingPieces: definition.missingPieces,
      updatedAt: sources.map((source) => source.capturedAt).filter(Boolean).sort().at(-1) || "",
      sources: sources.map((source) => ({
        id: source.id,
        title: source.title || "Saved Reel",
        creator: source.creator || "Unknown creator",
        url: source.url,
        summary: source.summary || "",
        evidence: inferEvidence(source),
        freshness: inferFreshness(source),
        knowledgeType: inferKnowledgeType(source),
        confidence: source.confidence || 0
      }))
    };
  }).sort((a, b) => b.sourceCount - a.sourceCount);

  const recovery = knowledgeItems.filter((item) => item.status !== "ready");
  const network = buildKnowledgeNetwork(captures);

  return { captures, threads, creators, categories, playbooks, knowledgeItems, recovery, ...network };
}

export async function handleApi(req, res, pathname, schedule = (work) => void work) {
  const origin = requestOrigin(req);
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (pathname === "/api/health" && req.method === "GET") {
    const captures = await readCaptures();
    const latestAnthropic = captures.find((capture) => capture.provider === "anthropic" || capture.error);
    const configured = Boolean(process.env.ANTHROPIC_API_KEY);
    const providerStatus = !configured
      ? "missing"
      : latestAnthropic?.status === "failed" && /401|authentication_error|api key is invalid/i.test(latestAnthropic.error || "")
        ? "invalid"
        : latestAnthropic?.provider === "anthropic" && !latestAnthropic.error
          ? "connected"
          : "configured";
    return json(res, 200, {
      ok: true,
      provider: "anthropic",
      configured,
      providerStatus,
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      protected: Boolean(process.env.SPOOL_CAPTURE_TOKEN),
      storage: storageMode(),
      transcriptionProvider: "supadata",
      transcriptionConfigured: Boolean(process.env.SUPADATA_API_KEY),
      transcriptionAccount: await readTranscriptAccount(process.env.SUPADATA_API_KEY)
    });
  }
  if (pathname === "/api/captures" && req.method === "GET") {
    const captures = await readCaptures();
    return json(res, 200, captures.sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt))));
  }
  if (pathname === "/api/library" && req.method === "GET") {
    const captures = await readCaptures();
    captures.sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
    return json(res, 200, buildLibrary(captures));
  }
  if (pathname === "/api/ask" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const question = clipText(body.question, 320);
      if (question.length < 3) return json(res, 400, { error: "Ask a complete question." });
      const captures = await readCaptures();
      const { sources, context } = buildAskSourceContext(captures, body.sourceIds);
      if (!sources.length) return json(res, 400, { error: "No ready sources matched this question. Try the free search again." });
      if (!allowAsk(req)) return json(res, 429, { error: "Ask Spool reached its hourly Claude limit. Free library search still works." });
      const result = await askWithAnthropic(question, context);
      return json(res, 200, { ...result, sources, requestCount: 1 });
    } catch (error) {
      return json(res, 503, { error: error instanceof Error ? error.message : "Ask Spool could not synthesize this answer." });
    }
  }
  if (pathname === "/api/repair" && req.method === "POST") {
    const repaired = await prepareStaleRepairs();
    json(res, 202, { repaired: repaired.length, ids: repaired });
    for (const id of repaired) schedule(dispatchContinuation(id, origin));
    return;
  }
  if (pathname === "/api/capture" && req.method === "POST") {
    if (!captureAuthorized(req)) return json(res, 401, { error: "Invalid capture token" });
    try {
      const body = await readBody(req);
      const url = String(body.url || body.sharedUrl || "").trim();
      if (!/^https?:\/\//i.test(url)) return json(res, 400, { error: "A complete http(s) URL is required" });
      const sharedText = String(body.sharedText || body.text || "").slice(0, 12_000);
      const hasIntentField = Object.prototype.hasOwnProperty.call(body, "intents");
      const intents = hasIntentField ? normalizeIntents(body.intents, body.transcribe === true) : normalizeIntents(["knowledge"], body.transcribe === true);
      const source = sourceFromUrl(url);
      const saveOnly = intents.length === 0;
      const capture = {
        id: crypto.randomUUID(),
        url,
        sharedText,
        intents,
        ...source,
        title: saveOnly ? (source.platform === "Instagram" ? "Saved Instagram reel" : `Saved from ${source.platform}`) : "Reading the source…",
        topic: saveOnly ? "Saved for later" : "Finding its thread",
        summary: saveOnly ? (sharedText || "Saved without AI analysis.") : "Reading the free caption and page text before deciding whether speech is needed.",
        status: saveOnly ? "ready" : "queued",
        provider: saveOnly ? "none" : undefined,
        transcriptStatus: intents.includes("script") ? "queued" : "not-requested",
        processedAt: saveOnly ? new Date().toISOString() : undefined,
        capturedAt: new Date().toISOString()
      };
      await upsertCapture(capture);
      json(res, saveOnly ? 200 : 202, capture);
      if (!saveOnly) schedule(processCapture(capture.id, null, origin));
      return;
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "Could not capture link" });
    }
  }

  const captureMatch = pathname.match(/^\/api\/captures\/([^/]+)$/);
  if (captureMatch && req.method === "PATCH") {
    try {
      const body = await readBody(req);
      const capture = await findCapture(captureMatch[1]);
      if (!capture) return json(res, 404, { error: "Capture not found" });
      const editable = ["sharedText", "title", "topic", "summary", "action"];
      for (const key of editable) {
        if (typeof body[key] === "string") capture[key] = body[key].slice(0, key === "sharedText" ? 12_000 : 2_000);
      }
      if (Array.isArray(body.takeaways)) capture.takeaways = body.takeaways.map(String).slice(0, 4);
      if (Array.isArray(body.intents) || typeof body.intents === "string") capture.intents = normalizeIntents(body.intents);
      capture.updatedAt = new Date().toISOString();
      const previousReadyCapture = capture.status === "ready" ? { ...capture } : null;
      if (body.reprocess === true) {
        capture.status = "queued";
        delete capture.error;
      }
      await upsertCapture(capture);
      json(res, 200, capture);
      // Explicit context is a recovery path, including when Script is blocked.
      // Analyze the supplied text without starting another transcript request.
      if (body.reprocess === true) schedule(typeof body.sharedText === "string" && body.sharedText.trim()
        ? enrichCapture(capture.id, previousReadyCapture)
        : processCapture(capture.id, previousReadyCapture, origin));
      return;
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "Could not update capture" });
    }
  }

  const retryMatch = pathname.match(/^\/api\/captures\/([^/]+)\/retry$/);
  if (retryMatch && req.method === "POST") {
    const capture = await findCapture(retryMatch[1]);
    if (!capture) return json(res, 404, { error: "Capture not found" });
    const previousReadyCapture = capture.status === "ready" ? { ...capture } : null;
    if (!capture.transcript && capture.transcriptStatus === "failed") {
      const account = await readTranscriptAccount(process.env.SUPADATA_API_KEY);
      if (account.status === "exhausted" || account.status === "invalid") return json(res, 409, { error: "Transcription is blocked. Check Supadata and recheck the connection, or add context. Your save is unchanged." });
      capture.transcriptStatus = "queued";
      capture.transcriptJobId = "";
      capture.transcriptAttemptCount = 0;
      capture.transcriptError = "";
    }
    capture.status = "queued";
    delete capture.error;
    if (!capture.transcript && (capture.transcriptStatus === "processing" || capture.transcriptStatus === "queued")) {
      capture.transcriptStatus = "queued";
    }
    await upsertCapture(capture);
    json(res, 202, capture);
    schedule(processCapture(capture.id, previousReadyCapture, origin));
    return;
  }

  const continueMatch = pathname.match(/^\/api\/captures\/([^/]+)\/continue$/);
  if (continueMatch && req.method === "POST") {
    if (!captureAuthorized(req)) return json(res, 401, { error: "Invalid continuation token" });
    const capture = await findCapture(continueMatch[1]);
    if (!capture) return json(res, 404, { error: "Capture not found" });
    json(res, 202, { id: capture.id, stage: capture.processingStage || capture.transcriptStatus || capture.status });
    schedule(processCapture(capture.id, null, origin));
    return;
  }

  const transcriptMatch = pathname.match(/^\/api\/captures\/([^/]+)\/transcribe$/);
  if (transcriptMatch && req.method === "POST") {
    if (!process.env.SUPADATA_API_KEY) return json(res, 503, { error: "Connect a Supadata API key before spending transcript credits." });
    const capture = await findCapture(transcriptMatch[1]);
    if (!capture) return json(res, 404, { error: "Capture not found" });
    if ((capture.transcriptStatus === "processing" || capture.transcriptStatus === "queued") && !isStaleTranscript(capture)) return json(res, 202, capture);
    if (capture.transcript) return json(res, 200, capture);
    const account = await readTranscriptAccount(process.env.SUPADATA_API_KEY);
    if (account.status === "exhausted" || account.status === "invalid") return json(res, 409, { error: "Transcription is blocked. Check Supadata and recheck the connection, or add context. Your save is unchanged." });
    const previousReadyCapture = capture.status === "ready" ? { ...capture } : null;
    const restartTranscript = capture.transcriptStatus === "failed";
    capture.intents = [...new Set([...intentsForCapture(capture), "script"])];
    capture.transcriptStatus = "queued";
    capture.transcriptError = "";
    if (restartTranscript) {
      capture.transcriptJobId = "";
      capture.transcriptAttemptCount = 0;
    }
    await upsertCapture(capture);
    json(res, 202, capture);
    schedule(processCapture(capture.id, previousReadyCapture, origin));
    return;
  }
  return json(res, 404, { error: "Not found" });
}

async function serveStatic(req, res, pathname) {
  if (!existsSync(distDir)) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Spool frontend is not built yet. Run npm run dev or npm run build.");
    return;
  }
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(distDir, safePath);
  if (!existsSync(filePath)) filePath = join(distDir, "index.html");
  try {
    const bytes = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(bytes);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

if (!process.env.VERCEL) {
  createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    try {
      if (url.pathname.startsWith("/api/")) await handleApi(req, res, url.pathname);
      else await serveStatic(req, res, url.pathname);
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
    }
  }).listen(port, "0.0.0.0", () => {
    console.log(`Spool API listening on http://localhost:${port}`);
  });
}
