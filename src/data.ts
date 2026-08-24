export type SourceStatus = "ready" | "thinking" | "needs-context";

export type Source = {
  id: string;
  url: string;
  platform: "Instagram" | "YouTube" | "Web";
  creator: string;
  title: string;
  capturedAt: string;
  status: SourceStatus;
  kind: "idea" | "style" | "creator" | "tool";
  topic: string;
  summary: string;
  hook?: string;
  structure?: string;
  accent: string;
};

export type Thread = {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  takeaways: string[];
  sourceIds: string[];
  updatedAt: string;
  confidence: "Strong pattern" | "Emerging" | "Single source";
  action: string;
  accent: string;
};

export type Creator = {
  id: string;
  handle: string;
  name: string;
  initials: string;
  bio: string;
  accent: string;
  pillars: string[];
  patterns: string[];
  voice: string;
  engine: string[];
  sourceIds: string[];
};

export const sources: Source[] = [
  {
    id: "world-cup",
    url: "https://www.instagram.com/athena_huo/reel/DZdUtbhxdzt/",
    platform: "Instagram",
    creator: "@athena_huo",
    title: "World Cup ML prediction series",
    capturedAt: "Today, 10:42 AM",
    status: "ready",
    kind: "style",
    topic: "Serialized proof",
    summary: "A public prediction creates value now and a reason to return for the result.",
    hook: "A current event becomes the starting gun for a personal technical challenge.",
    structure: "Event → prediction → evidence → audience guess → result later",
    accent: "#d9b93f"
  },
  {
    id: "laliga",
    url: "https://www.instagram.com/athena_huo/reel/DcWLEdoxvY4/",
    platform: "Instagram",
    creator: "@athena_huo",
    title: "La Liga model vs. the market",
    capturedAt: "Yesterday, 8:16 PM",
    status: "ready",
    kind: "idea",
    topic: "Serialized proof",
    summary: "Contrast with a familiar benchmark turns raw numbers into a story with tension.",
    hook: "The model disagrees with the market on the match everyone recognizes.",
    structure: "Claim → benchmark contrast → clarification → prediction → discussion",
    accent: "#d77a66"
  },
  {
    id: "graduation",
    url: "https://www.instagram.com/athena_huo/reel/DYyMYrNsXG3/",
    platform: "Instagram",
    creator: "@athena_huo",
    title: "One more woman in STEM",
    capturedAt: "Sunday, 4:03 PM",
    status: "ready",
    kind: "creator",
    topic: "Technical identity",
    summary: "Personal milestones make a technical identity human and aspirational.",
    accent: "#7fa9d4"
  },
  {
    id: "incoming",
    url: "https://www.instagram.com/reel/example/",
    platform: "Instagram",
    creator: "@new.creator",
    title: "Reading the reel…",
    capturedAt: "Just now",
    status: "thinking",
    kind: "idea",
    topic: "Unsorted",
    summary: "Extracting the useful idea, creative structure, and creator signals.",
    accent: "#8cbdae"
  }
];

export const threads: Thread[] = [
  {
    id: "serialized-proof",
    title: "Prediction as serialized proof",
    eyebrow: "Content system · 2 supporting reels",
    summary:
      "A prediction is more than a claim. Publishing it before the outcome creates accountability, tension, and a built-in next episode.",
    takeaways: [
      "Tie the prediction to an event already carrying attention.",
      "Show a precise number or benchmark so the audience can judge it.",
      "Promise the result at a concrete future moment.",
      "Let the audience commit to its own guess before the reveal."
    ],
    sourceIds: ["world-cup", "laliga"],
    updatedAt: "Updated today",
    confidence: "Strong pattern",
    action: "Publish one measurable prediction this week, then return with the result within 48 hours.",
    accent: "#d9b93f"
  },
  {
    id: "technical-identity",
    title: "Make expertise feel lived-in",
    eyebrow: "Creator pattern · 3 supporting reels",
    summary:
      "Technical content becomes more memorable when it is embedded in a recognizable life: games watched, milestones reached, and questions genuinely pursued.",
    takeaways: [
      "Lead with the human situation before explaining the method.",
      "Use expertise as the lens, not the entire personality.",
      "Alternate proof-heavy posts with personal context."
    ],
    sourceIds: ["world-cup", "laliga", "graduation"],
    updatedAt: "Updated yesterday",
    confidence: "Strong pattern",
    action: "Write a post that starts with something happening in your life and uses your expertise to examine it.",
    accent: "#7fa9d4"
  },
  {
    id: "benchmark-tension",
    title: "Benchmarks turn numbers into tension",
    eyebrow: "Story mechanic · 1 supporting reel",
    summary:
      "A number alone is information. A number that challenges a familiar expectation gives the audience something to resolve.",
    takeaways: [
      "Name the conventional expectation.",
      "Explain the disagreement without overselling certainty.",
      "Use the result to update—not defend—the original claim."
    ],
    sourceIds: ["laliga"],
    updatedAt: "Updated yesterday",
    confidence: "Emerging",
    action: "Add one familiar benchmark to the next data-heavy explanation you publish.",
    accent: "#d77a66"
  }
];

export const creators: Creator[] = [
  {
    id: "athena-huo",
    handle: "@athena_huo",
    name: "Athena Huo",
    initials: "AH",
    bio: "Tech, sports, and life through a curious machine-learning lens.",
    accent: "#d9b93f",
    pillars: ["Machine learning", "Sports predictions", "Personal milestones", "NYC life"],
    patterns: [
      "Builds series around live sports calendars",
      "Uses exact percentages and score predictions",
      "Invites the audience to make a competing prediction",
      "Balances technical proof with personal identity"
    ],
    voice: "Direct, curious, lightly playful, and comfortable showing uncertainty.",
    engine: ["Current event", "Personal model", "Specific disagreement", "Audience guess", "Result episode"],
    sourceIds: ["world-cup", "laliga", "graduation"]
  },
  {
    id: "mar-antaya",
    handle: "@mar_antaya",
    name: "Mar Antaya",
    initials: "MA",
    bio: "Mentioned as the inspiration behind the recurring prediction format.",
    accent: "#7fa9d4",
    pillars: ["F1", "Predictions", "Series storytelling"],
    patterns: ["Referenced across creators", "Turns a season into recurring episodes"],
    voice: "Not enough saved material yet.",
    engine: ["Save two more reels", "Spool compares them", "A playbook unlocks"],
    sourceIds: ["world-cup"]
  }
];

export const navCounts = {
  threads: threads.length,
  creators: creators.length,
  sources: sources.filter((source) => source.status !== "thinking").length
};
