import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import {
  ArrowRight,
  AlertCircle,
  AudioLines,
  BookOpen,
  Bookmark,
  Check,
  ChevronRight,
  CircleDot,
  Copy,
  Compass,
  ExternalLink,
  Feather,
  FileText,
  Inbox,
  Layers3,
  Link2,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Share2,
  Sparkles,
  Quote,
  UserRound,
  UsersRound,
  Wifi,
  X
} from "lucide-react";
import { creators, navCounts, sources, type Source } from "./data";

type View = "briefing" | "threads" | "scripts" | "creators" | "setup";
type CaptureIntent = "knowledge" | "script" | "creator";
type ApiCapture = {
  id: string;
  url: string;
  sharedText?: string;
  creator?: string;
  platform?: "Instagram" | "YouTube" | "Web";
  kind?: "idea" | "style" | "creator" | "tool";
  title?: string;
  topic?: string;
  summary?: string;
  takeaways?: string[];
  hook?: string;
  structure?: string;
  action?: string;
  confidence?: number;
  error?: string;
  status: "queued" | "processing" | "ready" | "needs-context" | "failed";
  capturedAt?: string;
  transcript?: string;
  transcriptStatus?: "not-requested" | "queued" | "processing" | "ready" | "failed";
  transcriptLanguage?: string;
  transcriptCredits?: number;
  transcriptError?: string;
  intents?: CaptureIntent[];
  sourceCoverage?: "complete" | "partial" | "insufficient";
  transcriptRecommended?: boolean;
  transcriptReason?: string;
  contentCategory?: string;
};

type ApiThread = {
  id: string;
  title: string;
  sourceCount: number;
  summary: string;
  takeaways: string[];
  actions: string[];
  sourceIds: string[];
  maturity: "seed" | "growing" | "strong";
};

type ApiCreator = {
  id: string;
  creator: string;
  sourceCount: number;
  topics: string[];
  hooks: string[];
  structures: string[];
  sourceIds: string[];
};

type ApiGuideChapter = {
  id: string;
  number: number;
  title: string;
  summary: string;
  lessons: string[];
  structure: string;
  action: string;
  sourceId: string;
  sourceTitle: string;
  creator: string;
  url: string;
  confidence: number;
};

type ApiGuide = {
  title: string;
  summary: string;
  stage: "First edition" | "Growing guide" | "Field guide";
  readingMinutes: number;
  principles: string[];
  playbook: string[];
  chapters: ApiGuideChapter[];
};

type ApiCategory = {
  id: string;
  name: string;
  sourceCount: number;
  sourceIds: string[];
  topics: string[];
  summary: string;
  guide?: ApiGuide;
};

type ApiKnowledgeItem = {
  id: string;
  title: string;
  summary: string;
  creator: string;
  url: string;
  status: ApiCapture["status"];
  capturedAt?: string;
  contentCategory: string;
  knowledgeType: string;
  domains: string[];
  useCases: string[];
  evidence: string;
  freshness: string;
  sourceCoverage: string;
  sourceId: string;
};

type ApiPlaybookSource = {
  id: string;
  title: string;
  creator: string;
  url: string;
  summary: string;
  evidence: string;
  freshness: string;
  knowledgeType: string;
  confidence: number;
};

type ApiPlaybook = {
  id: string;
  title: string;
  outcome: string;
  summary: string;
  accent: string;
  sourceCount: number;
  sourceIds: string[];
  stage: "Working system" | "Growing playbook" | "Early draft" | "Not started";
  readingMinutes: number;
  domains: string[];
  knowledgeTypes: string[];
  principles: string[];
  workflow: string[];
  tools: string[];
  assets: { hooks: string[]; structures: string[]; actions: string[] };
  missingPieces: string[];
  updatedAt: string;
  sources: ApiPlaybookSource[];
};

type ApiKnowledgeMembership = {
  sourceId: string;
  primaryCategory: string;
  categories: string[];
  reasons: Record<string, string>;
  bridge: boolean;
};

type ApiKnowledgeConnection = {
  id: string;
  sourceId: string;
  targetSourceId: string;
  strength: number;
  reason: string;
  signals: string[];
  sharedCategories: string[];
  crossesAreas: boolean;
};

type LibraryPayload = {
  captures: ApiCapture[];
  threads: ApiThread[];
  creators: ApiCreator[];
  categories: ApiCategory[];
  playbooks: ApiPlaybook[];
  knowledgeItems: ApiKnowledgeItem[];
  recovery: ApiKnowledgeItem[];
  memberships?: ApiKnowledgeMembership[];
  connections?: ApiKnowledgeConnection[];
};
type ApiHealth = { ok: boolean; provider: string; configured: boolean; providerStatus: "missing" | "configured" | "connected" | "invalid"; model: string; protected: boolean; transcriptionConfigured?: boolean; transcriptionProvider?: string; transcriptionAccount?: { status: "missing" | "invalid" | "unknown" | "available" | "exhausted"; remainingCredits?: number; usedCredits?: number; maxCredits?: number } };
type ApiAskResponse = {
  answer: string;
  model: string;
  requestCount: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  sources: Array<{ number: number; id: string; title: string; creator: string; url: string }>;
};

const emptyLibrary: LibraryPayload = { captures: [], threads: [], creators: [], categories: [], playbooks: [], knowledgeItems: [], recovery: [], memberships: [], connections: [] };
const kindAccents: Record<string, string> = {
  idea: "#d9b93f",
  style: "#d77a66",
  creator: "#7fa9d4",
  tool: "#8cbdae"
};
const intentMeta: Record<CaptureIntent, { label: string; icon: typeof Layers3 }> = {
  knowledge: { label: "Knowledge", icon: Layers3 },
  script: { label: "Script", icon: AudioLines },
  creator: { label: "Creator", icon: UserRound }
};
const categoryAccents: Record<string, string> = {
  "AI Products": "#d9b93f",
  Recruiting: "#d77a66",
  Startups: "#8cbdae",
  "Vlogs & Life": "#7fa9d4",
  "Content Creation": "#6f9cc4",
  Career: "#5d7697",
  "Personal Growth": "#a7b58b",
  Other: "#8b929b"
};

function orbitPosition(index: number, total: number): React.CSSProperties {
  const capacity = 10;
  const ring = Math.floor(index / capacity);
  const position = index % capacity;
  const count = Math.min(capacity, Math.max(1, total - ring * capacity));
  const angle = (position / count) * Math.PI * 2 - Math.PI / 2;
  const radius = 82 + ring * 25;
  return {
    "--orbit-x": `${Math.cos(angle) * radius}px`,
    "--orbit-y": `${Math.sin(angle) * radius}px`
  } as React.CSSProperties;
}

function captureAsSource(capture: ApiCapture): Source {
  const capturedAt = capture.capturedAt
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(capture.capturedAt))
    : "Just now";
  return {
    id: capture.id,
    url: capture.url,
    platform: capture.platform || "Web",
    creator: capture.creator || "Unknown source",
    title: capture.title || "Reading the source…",
    capturedAt,
    status: capture.status === "queued" || capture.status === "processing" ? "thinking" : capture.status === "failed" ? "needs-context" : capture.status,
    kind: capture.kind || "idea",
    topic: capture.topic || "Finding its thread",
    summary: capture.summary || "Extracting the useful part.",
    hook: capture.hook,
    structure: capture.structure,
    accent: kindAccents[capture.kind || "idea"]
  };
}

function captureStatusCopy(capture: ApiCapture) {
  const transcriptWorking = capture.transcriptStatus === "queued" || capture.transcriptStatus === "processing";
  if (transcriptWorking) return "Reading the spoken words. Spool will continue automatically, even if you leave this page.";
  if (capture.transcriptStatus === "failed") {
    if (/no spoken words/i.test(capture.transcriptError || "")) return "No speech was detected. This Reel stays saved, but it cannot create a script.";
    if (/limit[ -]exceeded|quota|insufficient credits/i.test(capture.transcriptError || "")) return "This Reel is saved. Supadata reached a usage or request limit. Check your allowance before retrying, or add the useful text as context.";
    return "The transcript did not finish. Retry the transcript to continue.";
  }
  if (capture.status === "failed" && /401|authentication_error|api key is invalid/i.test(capture.error || "")) return "Anthropic rejected the API key. Replace it in Vercel, then retry analysis.";
  if (capture.status === "failed" && capture.transcript) return "The transcript is safe. Retry analysis to organize it—this will not spend more transcript credits.";
  if (capture.status === "failed") return "Claude could not organize this source. Retry analysis, or add context if Instagram blocked it.";
  return capture.summary || "Spool is finding the durable idea and reusable structure.";
}

const navItems: Array<{ id: View; label: string; icon: typeof Compass; count?: number }> = [
  { id: "briefing", label: "Briefing", icon: Compass },
  { id: "threads", label: "Second Brain", icon: Layers3, count: navCounts.threads },
  { id: "scripts", label: "Banks", icon: AudioLines },
  { id: "creators", label: "Creators", icon: UsersRound, count: navCounts.creators },
  { id: "setup", label: "iPhone capture", icon: Share2 }
];

function SpoolMark() {
  return (
    <div className="spool-mark" aria-hidden="true">
      <span className="spool-loop spool-loop-one" />
      <span className="spool-loop spool-loop-two" />
    </div>
  );
}

function Sidebar({ active, onNavigate, onCapture, liveThreadCount, liveScriptCount, liveCreatorCount }: { active: View; onNavigate: (view: View) => void; onCapture: () => void; liveThreadCount: number; liveScriptCount: number; liveCreatorCount: number }) {
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <SpoolMark />
        <span className="brand-name">spool</span>
      </div>

      <nav className="side-nav" aria-label="Main navigation">
        <p className="nav-label">Your library</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const count = item.id === "threads" ? liveThreadCount || navCounts.threads : item.id === "scripts" ? liveScriptCount : item.id === "creators" ? navCounts.creators + liveCreatorCount : item.count;
          return (
            <button
              key={item.id}
              className={`nav-item ${active === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              title={item.label}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {count ? <span className="nav-count">{count}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />
      <button className="capture-side" onClick={onCapture} aria-label="Add link" title="Add link">
        <span className="capture-icon"><Plus size={16} /></span>
        <span>
          <strong>Test a link</strong>
          <small>Desktop capture</small>
        </span>
      </button>
      <div className="profile-row">
        <span className="avatar avatar-small">Y</span>
        <span>
          <strong>Your Spool</strong>
          <small>Personal library</small>
        </span>
        <MoreHorizontal size={17} />
      </div>
    </aside>
  );
}

function Header({ active, onCapture, onAsk }: { active: View; onCapture: () => void; onAsk: () => void }) {
  const titles: Record<View, string> = {
    briefing: "Briefing",
    threads: "Second Brain",
    scripts: "Hook & script banks",
    creators: "Creator notes",
    setup: "iPhone capture"
  };

  return (
    <header className="topbar">
      <div>
        <span className="topbar-kicker">Your Spool</span>
        <span className="topbar-separator">/</span>
        <strong>{titles[active]}</strong>
      </div>
      <div className="topbar-actions">
        <button className="ask-spool-button" onClick={onAsk}><Sparkles size={14} /> Ask Spool <kbd>⌘K</kbd></button>
        <button className="quiet-button" onClick={onCapture}><Plus size={16} /> Add link</button>
      </div>
    </header>
  );
}

function SourceTile({ source, compact = false }: { source: Source; compact?: boolean }) {
  return (
    <a
      className={`source-tile ${compact ? "compact" : ""}`}
      href={source.url}
      target="_blank"
      rel="noreferrer"
      style={{ "--source-accent": source.accent } as React.CSSProperties}
    >
      <div className="source-art">
        <span className="reel-bars" />
        <span className="source-platform">{source.platform}</span>
        {source.status === "thinking" ? <span className="thinking-orbit" /> : null}
      </div>
      <div className="source-copy">
        <div className="source-meta">
          <span>{source.creator}</span>
          <span>·</span>
          <span>{source.capturedAt}</span>
        </div>
        <strong>{source.title}</strong>
        {!compact ? <p>{source.summary}</p> : null}
      </div>
      <ExternalLink className="source-open" size={15} />
    </a>
  );
}

function CaptureInbox({
  captures,
  onRetry,
  onAddContext,
  onTranscribe
}: {
  captures: ApiCapture[];
  onRetry: (capture: ApiCapture) => void;
  onAddContext: (capture: ApiCapture) => void;
  onTranscribe: (capture: ApiCapture) => void;
}) {
  const [openTranscript, setOpenTranscript] = useState<string | null>(null);
  if (!captures.length) {
    return (
      <div className="empty-inbox">
        <Inbox size={19} />
        <div><strong>Your first real save will appear here.</strong><p>Share a reel from iPhone or use Add link to test.</p></div>
      </div>
    );
  }

  return (
    <div className="capture-inbox">
      {captures.slice(0, 6).map((capture) => {
        const working = capture.status === "queued" || capture.status === "processing";
        const transcribing = capture.transcriptStatus === "queued" || capture.transcriptStatus === "processing";
        const transcriptOpen = openTranscript === capture.id;
        return (
          <article className={`capture-row status-${capture.status}`} key={capture.id}>
            <span className="capture-state">
              {working ? <RefreshCw size={15} className="spin" /> : capture.status === "ready" ? <Check size={15} /> : <AlertCircle size={15} />}
            </span>
            <div className="capture-row-copy">
              <div><small>{capture.creator || "New source"}</small><span>{capture.topic || "Inbox"}</span></div>
              <strong>{capture.title || "Reading the source…"}</strong>
              <p>{captureStatusCopy(capture)}</p>
              <span className="capture-intents" aria-label="Save purposes">
                {capture.intents?.length ? capture.intents.map((intent) => {
                  const IntentIcon = intentMeta[intent].icon;
                  return <span key={intent}><IntentIcon size={10} />{intentMeta[intent].label}</span>;
                }) : <span><Bookmark size={10} />{capture.intents ? "Save only" : "Knowledge"}</span>}
              </span>
              {capture.sharedText ? <span className="saved-reason"><Bookmark size={11} /> Why saved: {capture.sharedText}</span> : null}
            </div>
            <div className="capture-row-actions">
              {capture.status === "needs-context" ? <button onClick={() => onAddContext(capture)}>Add context</button> : null}
              {capture.status === "needs-context" || capture.status === "failed" || capture.error ? <button aria-label={capture.transcript ? "Retry analysis" : "Retry processing"} title={capture.transcript ? "Retry analysis without retranscribing" : "Retry processing"} onClick={() => onRetry(capture)}><RefreshCw size={14} /></button> : null}
              {capture.transcript ? (
                <button className="transcript-control ready" aria-expanded={transcriptOpen} onClick={() => setOpenTranscript(transcriptOpen ? null : capture.id)}><FileText size={14} /><span>{transcriptOpen ? "Hide script" : "Script"}</span></button>
              ) : (
                <button className={`transcript-control ${capture.transcriptStatus === "failed" ? "failed" : ""}`} disabled={transcribing} title="Uses 1 credit for an existing transcript, or 2 credits per generated minute" onClick={() => onTranscribe(capture)}>
                  {transcribing ? <RefreshCw size={14} className="spin" /> : <AudioLines size={14} />}
                  <span>{transcribing ? "Transcribing" : capture.transcriptStatus === "failed" ? "Retry script" : "Transcribe"}</span>
                </button>
              )}
              <a href={capture.url} target="_blank" rel="noreferrer" aria-label="Open source"><ExternalLink size={14} /></a>
            </div>
            {capture.transcriptError && !capture.transcript ? <div className="transcript-error"><AlertCircle size={13} /><span>{capture.transcriptError}</span></div> : null}
            {capture.transcript && transcriptOpen ? (
              <section className="transcript-sheet" aria-label={`Transcript for ${capture.title || "saved source"}`}>
                <header><span><AudioLines size={14} /> Audio thread</span><small>{capture.transcriptLanguage ? capture.transcriptLanguage.toUpperCase() : "Auto-detected"}{capture.transcriptCredits ? ` · ${capture.transcriptCredits} credits` : ""}</small></header>
                <p>{capture.transcript}</p>
                <div><span>Hook</span><strong>{capture.hook || "Claude will identify the hook after processing."}</strong></div>
                <div><span>Script structure</span><strong>{capture.structure || "Claude will map the script after processing."}</strong></div>
              </section>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function Threadline({ library, onOpen }: { library: LibraryPayload; onOpen: (threadId?: string) => void }) {
  const liveThread = library.threads[0];
  const liveSources = liveThread
    ? library.captures.filter((capture) => liveThread.sourceIds.includes(capture.id)).map(captureAsSource).slice(0, 3)
    : [];
  const linkedSources = liveSources.length ? liveSources : sources.slice(0, 3);
  return (
    <section className="threadline-card" aria-label="How saved reels become knowledge">
      <div className="threadline-head">
        <div>
          <span className="eyebrow"><Sparkles size={13} /> New synthesis</span>
          <h2>{liveThread ? `${liveThread.sourceCount} saved ${liveThread.sourceCount === 1 ? "source is" : "sources are"} forming a useful pattern.` : "Three fragments became one useful pattern."}</h2>
        </div>
          <span className="fresh-badge"><CircleDot size={12} /> {liveThread?.maturity || "matured today"}</span>
      </div>

      <div className="threadline-canvas">
        <div className="fragment-stack">
          {linkedSources.map((source, index) => (
            <div className="fragment" key={source.id} style={{ "--fragment-accent": source.accent, "--delay": `${index * 130}ms` } as React.CSSProperties}>
              <span className="fragment-thumb">{index + 1}</span>
              <span>
                <small>{source.creator}</small>
                <strong>{source.topic}</strong>
              </span>
            </div>
          ))}
        </div>
        <div className="thread-path" aria-hidden="true">
          <span className="thread-path-line" />
          <span className="thread-pulse pulse-one" />
          <span className="thread-pulse pulse-two" />
          <ChevronRight size={18} />
        </div>
        <div className="synthesis-node">
          <span className="node-kicker">Knowledge thread</span>
          <h3>{liveThread?.title || "Prediction as serialized proof"}</h3>
          <p>{liveThread?.summary || "Publish the claim before the outcome and the result becomes your next episode."}</p>
          <button className="text-action" onClick={() => onOpen(liveThread?.id)}>Open thread <ArrowRight size={14} /></button>
        </div>
      </div>
    </section>
  );
}

function BriefingSourceIndex({
  captures,
  onRetry,
  onAddContext,
  onTranscribe
}: {
  captures: ApiCapture[];
  onRetry: (capture: ApiCapture) => void;
  onAddContext: (capture: ApiCapture) => void;
  onTranscribe: (capture: ApiCapture) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  if (!captures.length) {
    return <div className="briefing-source-empty"><Inbox size={17} /><span>Your first saved Reel will appear here.</span></div>;
  }

  return (
    <div className="briefing-source-index">
      {captures.slice(0, visibleCount).map((capture) => {
        const expanded = expandedId === capture.id;
        const working = capture.status === "queued" || capture.status === "processing";
        const transcribing = capture.transcriptStatus === "queued" || capture.transcriptStatus === "processing";
        return <article className={`briefing-source-item status-${capture.status} ${expanded ? "expanded" : ""}`} key={capture.id}>
          <button className="briefing-source-row" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : capture.id)}>
            <span className="briefing-source-state">{working ? <RefreshCw size={12} className="spin" /> : capture.status === "ready" ? <Check size={12} /> : <AlertCircle size={12} />}</span>
            <span className="briefing-source-copy">
              <small>{capture.creator || "New source"}<i />{capture.topic || capture.contentCategory || "Saved Reel"}</small>
              <strong>{capture.title || "Reading this source…"}</strong>
            </span>
            <span className="briefing-source-purpose">{capture.contentCategory || capture.intents?.map((intent) => intentMeta[intent].label).join(" + ") || "Saved"}</span>
            <ChevronRight size={14} className="briefing-source-chevron" />
          </button>
          {expanded ? <div className="briefing-source-detail">
            <p>{captureStatusCopy(capture)}</p>
            {capture.sharedText ? <span className="briefing-source-reason"><Bookmark size={11} /> {capture.sharedText}</span> : null}
            <div>
              {capture.status === "needs-context" || capture.status === "failed" ? <button onClick={() => onAddContext(capture)}>Add context</button> : null}
              {capture.status === "needs-context" || capture.status === "failed" || capture.error ? <button onClick={() => onRetry(capture)}><RefreshCw size={12} /> {capture.transcript ? "Retry analysis" : "Retry"}</button> : null}
              <button disabled={transcribing} onClick={() => onTranscribe(capture)}>{transcribing ? <RefreshCw size={12} className="spin" /> : capture.transcript ? <FileText size={12} /> : <AudioLines size={12} />}{transcribing ? "Transcribing" : capture.transcript ? "Script ready" : "Transcribe"}</button>
              <a href={capture.url} target="_blank" rel="noreferrer">Original <ExternalLink size={12} /></a>
            </div>
          </div> : null}
        </article>;
      })}
      {captures.length > visibleCount ? <button className="text-action" onClick={() => setVisibleCount((count) => count + 20)}>Show more saves ({captures.length - visibleCount} remaining)</button> : null}
    </div>
  );
}

function Briefing({ onNavigate, onOpenThread, library, onRetry, onAddContext, onTranscribe }: { onNavigate: (view: View) => void; onOpenThread: (threadId?: string) => void; library: LibraryPayload; onRetry: (capture: ApiCapture) => void; onAddContext: (capture: ApiCapture) => void; onTranscribe: (capture: ApiCapture) => void }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [sourceIndexOpen, setSourceIndexOpen] = useState(false);
  const categoryOptions = useMemo<ApiCategory[]>(() => {
    if (library.categories.length) return library.categories;
    const grouped = new Map<string, ApiCapture[]>();
    for (const capture of library.captures) {
      const category = capture.contentCategory || "Other";
      grouped.set(category, [...(grouped.get(category) || []), capture]);
    }
    return [...grouped.entries()].map(([name, captures]) => ({
      id: `briefing-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      sourceCount: captures.length,
      sourceIds: captures.map((capture) => capture.id),
      topics: [...new Set(captures.map((capture) => capture.topic).filter(Boolean) as string[])],
      summary: captures.length === 1 ? captures[0].summary || "One saved Reel is building this chapter." : `${captures.length} saved Reels are building this chapter.`
    }));
  }, [library.captures, library.categories]);

  useEffect(() => {
    if (selectedCategoryId !== "all" && !categoryOptions.some((category) => category.id === selectedCategoryId)) setSelectedCategoryId("all");
  }, [categoryOptions, selectedCategoryId]);

  const selectedCategory = categoryOptions.find((category) => category.id === selectedCategoryId);
  const chapterCaptures = selectedCategory
    ? library.captures.filter((capture) => selectedCategory.sourceIds.includes(capture.id))
    : library.captures;
  const selectedThread = useMemo(() => {
    if (!library.threads.length) return undefined;
    if (!selectedCategory) return library.threads[0];
    const sourceIds = new Set(selectedCategory.sourceIds);
    const ranked = library.threads
      .map((thread) => ({ thread, overlap: thread.sourceIds.filter((id) => sourceIds.has(id)).length }))
      .sort((a, b) => b.overlap - a.overlap);
    return ranked[0]?.overlap ? ranked[0].thread : undefined;
  }, [library.threads, selectedCategory]);
  const supportingCaptures = selectedThread
    ? chapterCaptures.filter((capture) => selectedThread.sourceIds.includes(capture.id))
    : chapterCaptures;
  const visibleSources = (supportingCaptures.length ? supportingCaptures : chapterCaptures).slice(0, 3);
  const chapterName = selectedCategory?.name || "All highlights";
  const chapterTitle = selectedThread?.title || (selectedCategory ? `${selectedCategory.name} is becoming a useful chapter.` : "Your first useful pattern will appear here.");
  const chapterSummary = selectedThread?.summary || selectedCategory?.summary || "Save a Reel and Spool will turn it into a short, reusable insight.";
  const lessons = selectedThread?.takeaways.slice(0, 2) || selectedCategory?.topics.slice(0, 2).map((topic) => `A saved Reel explored ${topic}.`) || [];
  const nextAction = selectedThread?.actions[0] || "Save one Reel you want to use, not just remember.";
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());
  return (
    <div className="page briefing-page briefing-chapters">
      <header className="chapter-masthead">
        <div>
          <span className="date-line">{today}</span>
          <h1>Your day, in <em>chapters.</em></h1>
          <p>Pick one topic. Ignore the rest until you need it.</p>
        </div>
        <div className="chapter-summary" aria-label="Briefing summary">
          <span><strong>{categoryOptions.length}</strong><small>topics active</small></span>
          <span><strong>{library.captures.length}</strong><small>saves read</small></span>
          <span><strong>{library.threads.length}</strong><small>patterns found</small></span>
        </div>
      </header>

      <nav className="chapter-tabs" aria-label="Briefing topics">
        <button className={selectedCategoryId === "all" ? "active" : ""} aria-pressed={selectedCategoryId === "all"} onClick={() => setSelectedCategoryId("all")}>All highlights</button>
        {categoryOptions.map((category) => <button key={category.id} className={selectedCategoryId === category.id ? "active" : ""} aria-pressed={selectedCategoryId === category.id} onClick={() => setSelectedCategoryId(category.id)}>{category.name}<span>{category.sourceCount}</span></button>)}
      </nav>

      <div className="chapter-workspace" key={selectedCategoryId}>
        <article className="chapter-reading">
          <div className="chapter-accent" aria-hidden="true" />
          <span className="chapter-label"><Sparkles size={12} /> {chapterName}</span>
          <h2>{chapterTitle}</h2>
          <p>{chapterSummary}</p>
          {lessons.length ? <div className="chapter-lessons">{lessons.map((lesson, index) => <div className="chapter-lesson" key={lesson}><strong>0{index + 1}</strong><p>{lesson}</p></div>)}</div> : null}
          <button className="chapter-thread-link" onClick={() => selectedThread ? onOpenThread(selectedThread.id) : onNavigate("threads")}>Open this chapter in Second Brain <ArrowRight size={14} /></button>
        </article>

        <aside className="chapter-sidebar">
          <section className="chapter-action">
            <span><Feather size={13} /> One action</span>
            <h3>{nextAction}</h3>
            <p>Spool pulled this from the pattern above.</p>
            <button onClick={() => selectedThread ? onOpenThread(selectedThread.id) : onNavigate("threads")}>Open the pattern <ArrowRight size={13} /></button>
          </section>
          <section className="chapter-supporting" aria-labelledby="supporting-saves-title">
            <header><span id="supporting-saves-title">Supporting saves</span><small>{visibleSources.length}</small></header>
            {visibleSources.length ? visibleSources.map((capture) => <a className="chapter-source" href={capture.url} target="_blank" rel="noreferrer" key={capture.id}>
              <span className="chapter-source-avatar" style={{ "--chapter-source-accent": categoryAccents[capture.contentCategory || "Other"] || categoryAccents.Other } as React.CSSProperties}>{(capture.creator || "S").replace("@", "").slice(0, 2).toUpperCase()}</span>
              <span><strong>{capture.title || "Reading this source…"}</strong><small>{capture.creator || capture.platform || "Saved source"}</small></span>
              <ExternalLink size={12} />
            </a>) : <div className="chapter-empty-source"><Inbox size={16} /><span>Save a Reel to start this chapter.</span></div>}
          </section>
        </aside>
      </div>

      <section className={`chapter-source-index ${sourceIndexOpen ? "open" : ""}`}>
        <button className="chapter-source-toggle" aria-expanded={sourceIndexOpen} onClick={() => setSourceIndexOpen((open) => !open)}>
          <span><BookOpen size={14} /><span><strong>All recent saves</strong><small>Transcripts, context, and processing details</small></span></span>
          <ChevronRight size={15} />
        </button>
        {sourceIndexOpen ? <BriefingSourceIndex captures={library.captures} onRetry={onRetry} onAddContext={onAddContext} onTranscribe={onTranscribe} /> : null}
      </section>
    </div>
  );
}

function categoryGuide(category: ApiCategory, captures: ApiCapture[]): ApiGuide {
  if (category.guide) return category.guide;
  const sources = captures.filter((capture) => category.sourceIds.includes(capture.id));
  const principles = [...new Set(sources.flatMap((source) => source.takeaways || []))].slice(0, 10);
  const playbook = [...new Set(sources.map((source) => source.action).filter(Boolean) as string[])].slice(0, 7);
  return {
    title: `${category.name} field guide`,
    summary: category.summary,
    stage: sources.length >= 6 ? "Field guide" : sources.length >= 3 ? "Growing guide" : "First edition",
    readingMinutes: Math.max(3, sources.length * 2),
    principles,
    playbook,
    chapters: sources.map((source, index) => ({
      id: `chapter-${source.id}`,
      number: index + 1,
      title: source.topic || source.title || `Lesson ${index + 1}`,
      summary: source.summary || "Spool is still distilling this source.",
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
}

function KnowledgeGuide({ category, captures, accent, onClose, onOpenSource }: { category: ApiCategory; captures: ApiCapture[]; accent: string; onClose: () => void; onOpenSource: (sourceId: string) => void }) {
  const guide = categoryGuide(category, captures);
  const sourceById = new Map(captures.map((capture) => [capture.id, capture]));
  const principles = guide.principles.length ? guide.principles : category.topics.map((topic) => `A saved Reel explores ${topic}.`);
  const playbook = guide.playbook.length ? guide.playbook : guide.chapters.map((chapter) => chapter.action).filter(Boolean);

  return (
    <article className="knowledge-guide" style={{ "--guide-accent": accent } as React.CSSProperties}>
      <header className="guide-toolbar">
        <span><BookOpen size={13} /> Second Brain / {category.name}</span>
        <button onClick={onClose} aria-label={`Close ${category.name} guide`}><X size={15} /></button>
      </header>

      <div className="guide-scroll">
        <header className="guide-cover">
          <div className="guide-edition"><span>{guide.stage}</span><i />{category.sourceCount} {category.sourceCount === 1 ? "source" : "sources"}<i />{guide.readingMinutes} min read</div>
          <span className="guide-kicker">Your guide to</span>
          <h1>{guide.title}</h1>
          <p>{guide.summary}</p>
          <nav aria-label={`${category.name} guide sections`}>
            <a href="#guide-ideas">Core ideas</a>
            <a href="#guide-playbook">Playbook</a>
            <a href="#guide-chapters">Chapters</a>
            <a href="#guide-sources">Sources</a>
          </nav>
        </header>

        <section className="guide-section guide-principles" id="guide-ideas">
          <header><span>01</span><div><small>Start here</small><h2>Core ideas worth keeping</h2></div></header>
          <div className="guide-principle-list">
            {principles.slice(0, 8).map((principle, index) => <article key={principle}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{principle}</p>
            </article>)}
          </div>
        </section>

        <section className="guide-section guide-playbook" id="guide-playbook">
          <header><span>02</span><div><small>Put it to work</small><h2>Your practical playbook</h2></div></header>
          {playbook.length ? <ol>
            {playbook.slice(0, 6).map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}
          </ol> : <div className="guide-empty"><Feather size={16} /><p>This guide has the ideas. Save another practical Reel to reveal a step-by-step playbook.</p></div>}
        </section>

        <section className="guide-section guide-chapters" id="guide-chapters">
          <header><span>03</span><div><small>Learn the subject</small><h2>Chapters from your Reels</h2></div></header>
          <div className="guide-chapter-spine">
            {guide.chapters.map((chapter) => {
              const source = sourceById.get(chapter.sourceId);
              const structure = chapter.structure.split(/→|->/).map((step) => step.trim()).filter(Boolean);
              return <article className="guide-chapter" key={chapter.id}>
                <span className="guide-chapter-marker">{String(chapter.number).padStart(2, "0")}</span>
                <div className="guide-chapter-copy">
                  <div className="guide-chapter-source"><span>{chapter.creator}</span><i />{source?.platform || "Instagram"}</div>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.summary}</p>
                  {chapter.lessons.length ? <ul>{chapter.lessons.slice(0, 4).map((lesson) => <li key={lesson}><Check size={12} /><span>{lesson}</span></li>)}</ul> : null}
                  {structure.length > 1 ? <div className="guide-framework"><strong>Framework</strong><div>{structure.slice(0, 6).map((step, index) => <span key={`${step}-${index}`}>{step}</span>)}</div></div> : null}
                  {chapter.action ? <div className="guide-try"><Feather size={13} /><span><strong>Try this</strong>{chapter.action}</span></div> : null}
                  <button onClick={() => onOpenSource(chapter.sourceId)}>Read the source note <ArrowRight size={12} /></button>
                </div>
              </article>;
            })}
          </div>
        </section>

        <section className="guide-section guide-source-shelf" id="guide-sources">
          <header><span>04</span><div><small>Trace every idea</small><h2>Source shelf</h2></div></header>
          <div>
            {guide.chapters.map((chapter) => <a href={chapter.url} target="_blank" rel="noreferrer" key={chapter.sourceId}>
              <span>{String(chapter.number).padStart(2, "0")}</span>
              <div><strong>{chapter.sourceTitle}</strong><small>{chapter.creator}</small></div>
              <ExternalLink size={12} />
            </a>)}
          </div>
          <p>This guide grows automatically whenever you save another {category.name} Reel with the Knowledge label.</p>
        </section>
      </div>
    </article>
  );
}

function formatSavedDate(value?: string) {
  if (!value) return "Recently saved";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently saved";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function playbookMarkdown(playbook: ApiPlaybook) {
  const lines = [
    `# ${playbook.title}`,
    "",
    `> ${playbook.outcome}`,
    "",
    playbook.summary,
    "",
    `_${playbook.stage} · ${playbook.readingMinutes} min read · ${playbook.sourceCount} supporting saves_`,
    "",
    "## What your saves agree on",
    "",
    ...playbook.principles.map((item) => `- ${item}`),
    "",
    "## Practical workflow",
    "",
    ...playbook.workflow.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Tools mentioned",
    "",
    ...(playbook.tools.length ? playbook.tools.map((item) => `- ${item}`) : ["- No specific tool is essential yet."]),
    "",
    "## Reusable structures",
    "",
    ...(playbook.assets.structures.length ? playbook.assets.structures.map((item) => `- ${item}`) : ["- More patterns will appear as this playbook grows."]),
    "",
    "## Openings worth remembering",
    "",
    ...playbook.assets.hooks.map((item) => `- “${item}”`),
    "",
    "## Try next",
    "",
    ...(playbook.assets.actions.length ? playbook.assets.actions : playbook.workflow.slice(0, 3)).map((item) => `- [ ] ${item}`),
    "",
    "## Missing pieces",
    "",
    ...playbook.missingPieces.map((item) => `- ${item}`),
    "",
    "## Supporting Reels",
    "",
    ...playbook.sources.map((source) => `- [${source.title}](${source.url}) — ${source.creator} · ${source.evidence}`),
    "",
    "---",
    "Built from your saved Spool knowledge."
  ];
  return lines.join("\n");
}

function PlaybookLibrary({ playbooks, captures }: { playbooks: ApiPlaybook[]; captures: ApiCapture[] }) {
  const activePlaybooks = useMemo(() => playbooks.filter((playbook) => playbook.sourceCount > 0), [playbooks]);
  const [selectedId, setSelectedId] = useState("");
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const [exportState, setExportState] = useState("");

  useEffect(() => {
    if (!activePlaybooks.length) return;
    if (!activePlaybooks.some((playbook) => playbook.id === selectedId)) setSelectedId(activePlaybooks[0].id);
  }, [activePlaybooks, selectedId]);

  const selected = activePlaybooks.find((playbook) => playbook.id === selectedId) || activePlaybooks[0];
  if (!selected) return <section className="brain-empty"><BookOpen size={22} /><h2>Your first playbook starts with one useful save.</h2><p>Share a Reel with the Knowledge label. Spool will place it into a practical path automatically.</p></section>;

  const copyPlaybook = async () => {
    try {
      await navigator.clipboard.writeText(playbookMarkdown(selected));
      setExportState("Copied");
    } catch {
      setExportState("Copy failed");
    }
    window.setTimeout(() => setExportState(""), 1800);
  };

  const downloadPlaybook = () => {
    const blob = new Blob([playbookMarkdown(selected)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setExportState("Downloaded");
    window.setTimeout(() => setExportState(""), 1800);
  };

  return (
    <div className="playbook-workspace">
      <aside className="playbook-shelf">
        <header><span>Living playbooks</span><small>{activePlaybooks.length} paths</small></header>
        <div>
          {activePlaybooks.map((playbook, index) => <button
            key={playbook.id}
            className={playbook.id === selected.id ? "active" : ""}
            style={{ "--playbook-accent": playbook.accent } as React.CSSProperties}
            onClick={() => { setSelectedId(playbook.id); setOpenSourceId(null); }}
          >
            <span className="playbook-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="playbook-shelf-copy"><small>{playbook.stage}</small><strong>{playbook.title}</strong><em>{playbook.outcome}</em></span>
            <span className="playbook-source-count">{playbook.sourceCount}<small>{playbook.sourceCount === 1 ? "save" : "saves"}</small></span>
          </button>)}
        </div>
        <footer><Sparkles size={12} /><span>Built from existing analysis. Opening a playbook costs nothing.</span></footer>
      </aside>

      <article className="playbook-reader" style={{ "--playbook-accent": selected.accent } as React.CSSProperties}>
        <header className="playbook-reader-hero">
          <div className="playbook-reader-meta"><span>{selected.stage}</span><i /><span>{selected.readingMinutes} min read</span><i /><span>{selected.sourceCount} supporting {selected.sourceCount === 1 ? "save" : "saves"}</span></div>
          <h1>{selected.title}</h1>
          <p className="playbook-outcome">{selected.outcome}</p>
          <p className="playbook-summary">{selected.summary}</p>
          <div className="playbook-domain-row">{selected.domains.map((domain) => <span key={domain}>{domain}</span>)}{selected.knowledgeTypes.map((type) => <span className="type" key={type}>{type}</span>)}</div>
          <div className="playbook-export-row">
            <button onClick={() => void copyPlaybook()}><Copy size={12} /> Copy playbook</button>
            <button onClick={downloadPlaybook}><FileText size={12} /> Download .md</button>
            <span aria-live="polite">{exportState || "Uses saved analysis only"}</span>
          </div>
        </header>

        <div className="playbook-reader-body">
          <section className="playbook-reader-section">
            <header><span>01</span><div><small>The durable part</small><h2>What your saves agree on</h2></div></header>
            <ul className="playbook-principles">{selected.principles.map((principle) => <li key={principle}><Check size={13} /><span>{principle}</span></li>)}</ul>
          </section>

          <section className="playbook-reader-section">
            <header><span>02</span><div><small>Put it into motion</small><h2>Practical workflow</h2></div></header>
            <ol className="playbook-workflow">{selected.workflow.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
          </section>

          <section className="playbook-reader-section">
            <header><span>03</span><div><small>Keep the reusable parts</small><h2>Tools and patterns</h2></div></header>
            <div className="playbook-assets-grid">
              <div className="playbook-toolbox"><h3>Tools mentioned</h3>{selected.tools.length ? <div>{selected.tools.map((tool) => <span key={tool}>{tool}</span>)}</div> : <p>No specific tools are essential to this playbook yet.</p>}</div>
              <div className="playbook-patterns"><h3>Reusable structures</h3>{selected.assets.structures.length ? selected.assets.structures.slice(0, 3).map((structure) => <p key={structure}>{structure}</p>) : <p>More source structures will appear as this playbook grows.</p>}</div>
            </div>
            {selected.assets.hooks.length ? <div className="playbook-hook-strip"><small>OPENINGS WORTH REMEMBERING</small>{selected.assets.hooks.slice(0, 3).map((hook) => <blockquote key={hook}>“{hook}”</blockquote>)}</div> : null}
          </section>

          <section className="playbook-reader-section">
            <header><span>04</span><div><small>Turn learning into progress</small><h2>Try next</h2></div></header>
            <div className="playbook-actions">{(selected.assets.actions.length ? selected.assets.actions : selected.workflow.slice(0, 3)).map((action) => <div key={action}><Feather size={13} /><p>{action}</p></div>)}</div>
          </section>

          <section className="playbook-reader-section playbook-sources">
            <header><span>05</span><div><small>Trace it back</small><h2>Supporting Reels</h2></div></header>
            <div>{selected.sources.map((source, index) => {
              const open = source.id === openSourceId;
              const capture = captures.find((item) => item.id === source.id);
              return <div className={`playbook-source ${open ? "open" : ""}`} key={source.id}>
                <button onClick={() => setOpenSourceId(open ? null : source.id)} aria-expanded={open}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span><small>{source.creator} · {source.knowledgeType}</small><strong>{source.title}</strong></span>
                  <span className="source-evidence">{source.evidence}</span>
                  <ChevronRight size={14} />
                </button>
                {open ? <div className="playbook-source-detail">
                  <p>{source.summary}</p>
                  {capture?.takeaways?.length ? <ul>{capture.takeaways.slice(0, 4).map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul> : null}
                  {capture?.action ? <div className="playbook-source-action"><Feather size={11} /><span><strong>Try this</strong>{capture.action}</span></div> : null}
                  {capture?.sharedText ? <div className="playbook-source-reason"><small>WHY YOU SAVED IT</small><p>{capture.sharedText}</p></div> : null}
                  {capture?.transcript ? <details><summary><FileText size={11} /> Read transcript</summary><p>{capture.transcript}</p></details> : null}
                  <div className="playbook-source-meta"><span>{source.freshness}</span><span>{Math.round(source.confidence * 100)}% analysis confidence</span><a href={source.url} target="_blank" rel="noreferrer">Open original <ExternalLink size={11} /></a></div>
                </div> : null}
              </div>;
            })}</div>
          </section>

          <aside className="playbook-gaps"><div><CircleDot size={15} /><span><small>WHAT WOULD MAKE THIS STRONGER</small><h2>Missing pieces</h2></span></div><ul>{selected.missingPieces.map((piece) => <li key={piece}>{piece}</li>)}</ul><p>These are prompts for what to save or create next—not more homework Claude needs to process.</p></aside>
        </div>
      </article>
    </div>
  );
}

function SourceLibrary({ library }: { library: LibraryPayload }) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("All domains");
  const [type, setType] = useState("All types");
  const [openId, setOpenId] = useState<string | null>(null);
  const domains = useMemo(() => ["All domains", ...new Set(library.knowledgeItems.flatMap((item) => item.domains))], [library.knowledgeItems]);
  const types = useMemo(() => ["All types", ...new Set(library.knowledgeItems.map((item) => item.knowledgeType))], [library.knowledgeItems]);
  const filtered = useMemo(() => library.knowledgeItems.filter((item) => {
    const matchesQuery = !query.trim() || `${item.title} ${item.summary} ${item.creator} ${item.contentCategory}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (domain === "All domains" || item.domains.includes(domain)) && (type === "All types" || item.knowledgeType === type);
  }), [domain, library.knowledgeItems, query, type]);

  return <div className="source-library-page">
    {library.recovery.length ? <section className="recovery-inbox"><div><Inbox size={17} /><span><small>RECOVERY INBOX</small><strong>{library.recovery.length} saved {library.recovery.length === 1 ? "source needs" : "sources need"} more context</strong></span></div><p>They stay out of your playbooks until the lesson can be verified. Repair them from Briefing when you have context or transcript credits.</p></section> : null}
    <section className="source-library-toolbar">
      <div><small>Source library</small><h2>Every saved piece of evidence</h2><p>Filter the raw material without changing or reprocessing it.</p></div>
      <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, ideas, creators…" /></label>
      <div>{domains.map((item) => <button key={item} className={domain === item ? "active" : ""} onClick={() => setDomain(item)}>{item}</button>)}</div>
      <div>{types.map((item) => <button key={item} className={type === item ? "active" : ""} onClick={() => setType(item)}>{item}</button>)}</div>
    </section>
    <section className="source-ledger">
      <header><span>{filtered.length} {filtered.length === 1 ? "source" : "sources"}</span><small>Evidence · type · freshness</small></header>
      {filtered.map((item) => {
        const open = item.id === openId;
        return <div className={`source-ledger-item status-${item.status} ${open ? "open" : ""}`} key={item.id}>
          <button onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open}>
            <span className="source-status-dot" />
            <span className="source-ledger-copy"><small>{item.creator} · {item.contentCategory}</small><strong>{item.title}</strong></span>
            <span>{item.knowledgeType}</span><span>{item.evidence}</span><span>{item.freshness}</span><ChevronRight size={14} />
          </button>
          {open ? <div className="source-ledger-detail"><p>{item.summary}</p><div>{item.domains.map((value) => <span key={value}>{value}</span>)}{item.useCases.map((value) => <span key={value}>{value}</span>)}<a href={item.url} target="_blank" rel="noreferrer">Open original <ExternalLink size={11} /></a></div></div> : null}
        </div>;
      })}
      {!filtered.length ? <div className="source-ledger-empty"><Search size={18} /><span>No saved sources match those filters.</span></div> : null}
    </section>
  </div>;
}

function ThreadsView({ library, onTranscribe }: { library: LibraryPayload; onTranscribe: (capture: ApiCapture) => void }) {
  const [mode, setMode] = useState<"playbooks" | "map" | "sources">("playbooks");
  return <div className={`second-brain-page mode-${mode}`}>
    <header className="second-brain-header">
      <div><span className="eyebrow"><Link2 size={12} /> Your connected knowledge</span><h1>From saved Reels to <em>working knowledge.</em></h1><p>Start with a playbook when you want to use what you learned. Open the map when you want to explore.</p></div>
      <nav aria-label="Second Brain view">
        <button className={mode === "playbooks" ? "active" : ""} onClick={() => setMode("playbooks")}><BookOpen size={14} /> Playbooks</button>
        <button className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}><Share2 size={14} /> Map</button>
        <button className={mode === "sources" ? "active" : ""} onClick={() => setMode("sources")}><FileText size={14} /> Sources</button>
      </nav>
    </header>
    {mode === "playbooks" ? <PlaybookLibrary playbooks={library.playbooks || []} captures={library.captures} /> : null}
    {mode === "map" ? <KnowledgeMapView library={library} onTranscribe={onTranscribe} /> : null}
    {mode === "sources" ? <SourceLibrary library={library} /> : null}
  </div>;
}

function KnowledgeMapView({ library, onTranscribe }: { library: LibraryPayload; onTranscribe: (capture: ApiCapture) => void }) {
  const [query, setQuery] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 900, height: 640 });
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraphMethods<VaultNode, VaultLink> | undefined>(undefined);
  const initialFitDone = useRef(false);

  const demoCaptures = useMemo<ApiCapture[]>(() => sources.filter((source) => source.status === "ready").map((source) => ({
    id: source.id,
    url: source.url,
    creator: source.creator,
    platform: source.platform,
    kind: source.kind,
    title: source.title,
    topic: source.topic,
    summary: source.summary,
    takeaways: source.structure ? source.structure.split("→").map((step) => step.trim()).filter(Boolean) : [],
    status: "ready",
    capturedAt: source.capturedAt,
    contentCategory: source.id === "graduation" ? "Vlogs & Life" : "AI Products",
    intents: ["knowledge"]
  })), []);

  const baseKnowledgeCaptures = useMemo(() => library.categories.length
    ? library.captures.filter((capture) => capture.intents?.includes("knowledge"))
    : demoCaptures, [demoCaptures, library.captures, library.categories.length]);
  const atlasCategories = useMemo<ApiCategory[]>(() => {
    if (library.categories.length) return library.categories;
    const grouped = new Map<string, ApiCapture[]>();
    for (const capture of demoCaptures) {
      const name = capture.contentCategory || "Other";
      grouped.set(name, [...(grouped.get(name) || []), capture]);
    }
    return [...grouped.entries()].map(([name, captures]) => ({
      id: `category-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      sourceCount: captures.length,
      sourceIds: captures.map((capture) => capture.id),
      topics: [...new Set(captures.map((capture) => capture.topic).filter(Boolean) as string[])],
      summary: captures.length === 1 ? captures[0].summary || "One source saved." : `${captures.length} saved Reels are building this part of your second brain.`
    }));
  }, [demoCaptures, library.categories]);

  type VaultNode = {
    id: string;
    type: "category" | "reel" | "creator";
    label: string;
    meta: string;
    x: number;
    y: number;
    accent: string;
    categoryId?: string;
    categoryIds?: string[];
    captureId?: string;
    creator?: string;
    bridge?: boolean;
    connectionCount?: number;
  };

  type VaultLink = {
    id: string;
    source: string | VaultNode;
    target: string | VaultNode;
    accent: string;
    curve: number;
    kind: "source" | "creator" | "association";
    reason?: string;
    strength?: number;
  };

  const networkMemberships = useMemo<ApiKnowledgeMembership[]>(() => {
    if (library.memberships?.length) return library.memberships;
    return baseKnowledgeCaptures.filter((capture) => capture.status === "ready").map((capture) => ({
      sourceId: capture.id,
      primaryCategory: capture.contentCategory || "Other",
      categories: [capture.contentCategory || "Other"],
      reasons: { [capture.contentCategory || "Other"]: "Primary subject" },
      bridge: false
    }));
  }, [baseKnowledgeCaptures, library.memberships]);

  const knowledgeCaptures = useMemo(() => {
    const mappedSourceIds = new Set(networkMemberships.map((membership) => membership.sourceId));
    return baseKnowledgeCaptures.filter((capture) => mappedSourceIds.has(capture.id));
  }, [baseKnowledgeCaptures, networkMemberships]);

  const membershipBySource = useMemo(() => new Map(networkMemberships.map((membership) => [membership.sourceId, membership])), [networkMemberships]);
  const networkConnections = library.connections || [];

  const graph = useMemo(() => {
    const nodes: VaultNode[] = [];
    const edges: Array<{ id: string; from: string; to: string; kind: VaultLink["kind"]; accent?: string; curve?: number; reason?: string; strength?: number }> = [];
    const creatorLinks = new Map<string, string[]>();
    const categoryNodeByName = new Map<string, { id: string; x: number; y: number; accent: string }>();

    atlasCategories.forEach((category, categoryIndex) => {
      const categoryAngle = categoryIndex * Math.PI * (3 - Math.sqrt(5)) - Math.PI / 2;
      const categoryRadius = categoryIndex === 0 ? 48 : 76 + categoryIndex * 15;
      const x = 500 + Math.cos(categoryAngle) * categoryRadius;
      const y = 340 + Math.sin(categoryAngle) * categoryRadius * .72;
      const accent = categoryAccents[category.name] || categoryAccents.Other;
      categoryNodeByName.set(category.name, { id: category.id, x, y, accent });
      nodes.push({
        id: category.id,
        type: "category",
        label: category.name,
        meta: `${category.sourceCount} ${category.sourceCount === 1 ? "Reel" : "Reels"}`,
        x,
        y,
        accent,
        categoryId: category.id
      });
    });

    const sourcesByAnchor = new Map<string, ApiCapture[]>();
    knowledgeCaptures.forEach((capture) => {
      const membership = membershipBySource.get(capture.id);
      const primary = membership?.primaryCategory || capture.contentCategory || "Other";
      const anchorKey = (membership?.categories || [primary]).slice().sort().join("|");
      sourcesByAnchor.set(anchorKey, [...(sourcesByAnchor.get(anchorKey) || []), capture]);
    });

    knowledgeCaptures.forEach((capture) => {
      const membership = membershipBySource.get(capture.id);
      const primary = membership?.primaryCategory || capture.contentCategory || "Other";
      const categoryNode = categoryNodeByName.get(primary) || categoryNodeByName.get("Other");
      if (!categoryNode) return;
      const nodeId = `reel-${capture.id}`;
      const categoryNames = membership?.categories || [primary];
      const categoryIds = categoryNames.map((name) => categoryNodeByName.get(name)?.id).filter(Boolean) as string[];
      const anchorNodes = categoryNames.map((name) => categoryNodeByName.get(name)).filter(Boolean) as Array<{ id: string; x: number; y: number; accent: string }>;
      const anchorX = anchorNodes.reduce((total, node) => total + node.x, 0) / Math.max(1, anchorNodes.length);
      const anchorY = anchorNodes.reduce((total, node) => total + node.y, 0) / Math.max(1, anchorNodes.length);
      const anchorKey = categoryNames.slice().sort().join("|");
      const anchorSources = sourcesByAnchor.get(anchorKey) || [];
      const sourceIndex = Math.max(0, anchorSources.findIndex((item) => item.id === capture.id));
      const ringCapacity = categoryIds.length > 1 ? 8 : 12;
      const ring = Math.floor(sourceIndex / ringCapacity);
      const ringIndex = sourceIndex % ringCapacity;
      const itemsOnRing = Math.min(ringCapacity, Math.max(1, anchorSources.length - ring * ringCapacity));
      const angle = (ringIndex / itemsOnRing) * Math.PI * 2 - Math.PI / 2 + (ring % 2 ? .18 : 0);
      const radius = categoryIds.length > 1 ? 24 + ring * 17 : 42 + ring * 22;
      const associationCount = networkConnections.filter((connection) => connection.sourceId === capture.id || connection.targetSourceId === capture.id).length;
      nodes.push({
        id: nodeId,
        type: "reel",
        label: capture.title || "Saved Reel",
        meta: categoryNames.join(" ↔ "),
        x: anchorX + Math.cos(angle) * radius,
        y: anchorY + Math.sin(angle) * radius,
        accent: categoryNode.accent,
        categoryId: categoryNode.id,
        categoryIds,
        captureId: capture.id,
        creator: capture.creator,
        bridge: categoryIds.length > 1,
        connectionCount: associationCount
      });
      categoryIds.forEach((categoryId, membershipIndex) => {
        const memberAccent = nodes.find((node) => node.id === categoryId)?.accent || categoryNode.accent;
        const curveDirection = sourceIndex % 2 ? -1 : 1;
        edges.push({ id: `${categoryId}-${capture.id}`, from: categoryId, to: nodeId, kind: "source", accent: memberAccent, curve: curveDirection * (membershipIndex ? .065 : .035), strength: membershipIndex ? .1 : .34 });
      });
      if (capture.creator) creatorLinks.set(capture.creator, [...(creatorLinks.get(capture.creator) || []), nodeId]);
    });

    networkConnections.forEach((connection, connectionIndex) => {
      const from = `reel-${connection.sourceId}`;
      const to = `reel-${connection.targetSourceId}`;
      if (!nodes.some((node) => node.id === from) || !nodes.some((node) => node.id === to)) return;
      edges.push({
        id: connection.id,
        from,
        to,
        kind: "association",
        reason: connection.reason,
        strength: connection.strength,
        accent: "#7f91a9",
        curve: (connectionIndex % 2 ? -1 : 1) * (.045 + (connectionIndex % 3) * .015)
      });
    });

    [...creatorLinks.entries()].filter(([, reelIds]) => reelIds.length > 1).slice(0, 6).forEach(([creator, reelIds], creatorIndex) => {
      const creatorAngle = (creatorIndex / Math.max(1, Math.min(6, creatorLinks.size))) * Math.PI * 2 - Math.PI / 2;
      const x = 500 + Math.cos(creatorAngle) * 230;
      const y = 340 + Math.sin(creatorAngle) * 170;
      const id = `creator-${creator.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      nodes.push({ id, type: "creator", label: creator, meta: `${reelIds.length} linked`, x, y, accent: "#7fa9d4", creator });
      reelIds.forEach((reelId, reelIndex) => edges.push({ id: `${id}-${reelId}`, from: id, to: reelId, kind: "creator", curve: (reelIndex % 2 ? -1 : 1) * .04, strength: .1 }));
    });

    return { nodes, edges };
  }, [atlasCategories, knowledgeCaptures, membershipBySource, networkConnections]);

  const forceData = useMemo(() => {
    const nodes = graph.nodes.map((node) => {
      const x = (node.x - 500) * .82;
      const y = (node.y - 340) * .82;
      return { ...node, x, y };
    });
    const forceNodeMap = new Map(nodes.map((node) => [node.id, node]));
    const links: VaultLink[] = graph.edges.map((edge, index) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      accent: edge.accent || forceNodeMap.get(edge.from)?.accent || forceNodeMap.get(edge.to)?.accent || "#7fa9d4",
      curve: edge.curve ?? (index % 2 ? 1 : -1) * (.05 + (index % 3) * .014),
      kind: edge.kind,
      reason: edge.reason,
      strength: edge.strength
    }));
    return { nodes, links };
  }, [graph]);

  const prefersReducedMotion = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container) return;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      setGraphSize({ width: Math.max(320, Math.round(bounds.width)), height: Math.max(360, Math.round(bounds.height)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    initialFitDone.current = false;
    const frame = requestAnimationFrame(() => {
      const charge = graphRef.current?.d3Force("charge");
      const link = graphRef.current?.d3Force("link");
      charge?.strength?.((node: VaultNode) => node.type === "category" ? -105 : node.type === "creator" ? -34 : node.bridge ? -18 : -11);
      charge?.distanceMax?.(320);
      link?.distance?.((item: VaultLink) => {
        if (item.kind === "association") return 48;
        if (item.kind === "creator") return 52;
        return item.strength && item.strength < .2 ? 64 : 38;
      });
      link?.strength?.((item: VaultLink) => item.kind === "association" ? .045 : item.kind === "creator" ? .1 : item.strength || .34);

      type SimulationNode = VaultNode & NodeObject<VaultNode>;
      let collisionNodes: SimulationNode[] = [];
      const collisionRadius = (node: SimulationNode) => node.type === "category" ? 15 : node.type === "creator" ? 8 : node.bridge ? 5.5 : 4.5;
      const collisionForce = (alpha: number) => {
        for (let pass = 0; pass < 2; pass += 1) {
          for (let index = 0; index < collisionNodes.length; index += 1) {
            const node = collisionNodes[index];
            for (let otherIndex = index + 1; otherIndex < collisionNodes.length; otherIndex += 1) {
              const other = collisionNodes[otherIndex];
              const dx = ((node.x || 0) + (node.vx || 0)) - ((other.x || 0) + (other.vx || 0)) || (index % 2 ? .001 : -.001);
              const dy = ((node.y || 0) + (node.vy || 0)) - ((other.y || 0) + (other.vy || 0)) || (otherIndex % 2 ? .001 : -.001);
              const distance = Math.sqrt(dx * dx + dy * dy);
              const minimum = collisionRadius(node) + collisionRadius(other) + 1;
              if (distance >= minimum) continue;
              const adjustment = ((minimum - distance) / Math.max(distance, .001)) * alpha * .34;
              const moveX = dx * adjustment;
              const moveY = dy * adjustment;
              if (node.fx == null) {
                node.vx = (node.vx || 0) + moveX;
                node.vy = (node.vy || 0) + moveY;
              }
              if (other.fx == null) {
                other.vx = (other.vx || 0) - moveX;
                other.vy = (other.vy || 0) - moveY;
              }
            }
          }
        }
      };
      collisionForce.initialize = (nodes: SimulationNode[]) => { collisionNodes = nodes; };
      graphRef.current?.d3Force("collision", collisionForce);
      graphRef.current?.d3ReheatSimulation();
    });
    return () => cancelAnimationFrame(frame);
  }, [forceData]);

  const nodeMap = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) || null : null;
  const selectedCapture = selectedNode?.captureId ? knowledgeCaptures.find((capture) => capture.id === selectedNode.captureId) || null : null;
  const selectedMembership = selectedCapture ? membershipBySource.get(selectedCapture.id) || null : null;
  const selectedCategory = selectedNode?.categoryId ? atlasCategories.find((category) => category.id === selectedNode.categoryId) || null : null;
  const selectedCreatorSources = selectedNode?.type === "creator" && selectedNode.creator
    ? knowledgeCaptures.filter((capture) => capture.creator === selectedNode.creator)
    : [];
  const selectedCategoryCaptures = selectedCategory
    ? knowledgeCaptures.filter((capture) => selectedCategory.sourceIds.includes(capture.id))
    : [];
  const capturedAt = selectedCapture ? captureAsSource(selectedCapture).capturedAt : "";
  const selectedStructureSteps = selectedCapture?.structure?.split(/→|->/).map((step) => step.trim()).filter(Boolean) || [];
  const selectedConnections = useMemo(() => {
    if (!selectedCapture) return [];
    return networkConnections
      .filter((connection) => connection.sourceId === selectedCapture.id || connection.targetSourceId === selectedCapture.id)
      .map((connection) => {
        const relatedId = connection.sourceId === selectedCapture.id ? connection.targetSourceId : connection.sourceId;
        return { connection, capture: knowledgeCaptures.find((capture) => capture.id === relatedId) || null };
      })
      .filter((item) => item.capture)
      .sort((a, b) => b.connection.strength - a.connection.strength);
  }, [knowledgeCaptures, networkConnections, selectedCapture]);
  const neighborIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const related = new Set<string>([selectedNodeId]);
    graph.edges.forEach((edge) => {
      if (edge.from === selectedNodeId) related.add(edge.to);
      if (edge.to === selectedNodeId) related.add(edge.from);
    });
    return related;
  }, [graph.edges, selectedNodeId]);
  const queryMatches = useMemo(() => {
    if (!query.trim()) return new Set(graph.nodes.map((node) => node.id));
    const normalized = query.toLowerCase();
    return new Set(graph.nodes.filter((node) => `${node.label} ${node.meta}`.toLowerCase().includes(normalized)).map((node) => node.id));
  }, [graph.nodes, query]);
  const selectedAccent = selectedNode?.accent || "#7fa9d4";
  const rankedCategories = useMemo(() => [...atlasCategories].sort((a, b) => b.sourceCount - a.sourceCount), [atlasCategories]);
  const totalSources = knowledgeCaptures.length;
  const bridgeCount = networkMemberships.filter((membership) => membership.bridge).length;
  const connectionCount = networkConnections.length;
  const recoveryCount = library.recovery?.length || 0;

  const endpointId = (endpoint: string | number | NodeObject<VaultNode> | undefined) => typeof endpoint === "object" ? String(endpoint.id) : String(endpoint ?? "");

  const resetGraph = useCallback(() => {
    setSelectedNodeId(null);
    graphRef.current?.zoomToFit(prefersReducedMotion ? 0 : 260, 88);
  }, [prefersReducedMotion]);

  const chooseNode = useCallback((nodeId: string) => {
    if (selectedNodeId === nodeId) {
      resetGraph();
      return;
    }
    setSelectedNodeId(nodeId);
    const connected = new Set<string>([nodeId]);
    graph.edges.forEach((edge) => {
      if (edge.from === nodeId) connected.add(edge.to);
      if (edge.to === nodeId) connected.add(edge.from);
    });
    requestAnimationFrame(() => graphRef.current?.zoomToFit(
      prefersReducedMotion ? 0 : 280,
      115,
      (node) => connected.has(String(node.id))
    ));
  }, [graph.edges, prefersReducedMotion, resetGraph, selectedNodeId]);

  const openSourceNote = useCallback((sourceId: string) => {
    const node = graph.nodes.find((item) => item.captureId === sourceId);
    if (node) setSelectedNodeId(node.id);
  }, [graph.nodes]);

  const paintNode = useCallback((rawNode: NodeObject<VaultNode>, context: CanvasRenderingContext2D, globalScale: number) => {
    const node = rawNode as VaultNode;
    if (node.x === undefined || node.y === undefined) return;
    const isSelected = selectedNodeId === node.id;
    const isHovered = hoveredNodeId === node.id;
    const isRelated = !selectedNodeId || neighborIds.has(node.id);
    const isQueryVisible = !query.trim() || queryMatches.has(node.id);
    const scale = Math.max(.72, globalScale);
    const radius = (node.type === "category" ? 9 : node.type === "creator" ? 4.5 : node.bridge ? 3.8 : 2.8) / scale;
    const alpha = !isQueryVisible ? .035 : isRelated ? 1 : .12;
    const labelVisible = node.type === "category" || isHovered || isSelected;

    context.save();
    context.globalAlpha = alpha;
    context.shadowColor = node.accent;
    context.shadowBlur = isSelected || isHovered ? 16 : node.type === "category" ? 8 : 2;

    if (isSelected || isHovered || node.type === "category") {
      context.beginPath();
      context.arc(node.x, node.y, radius + (isSelected ? 5 : 3.5) / scale, 0, Math.PI * 2);
      context.fillStyle = `${node.accent}${isSelected || isHovered ? "29" : "16"}`;
      context.fill();
    }

    context.beginPath();
    context.arc(node.x, node.y, radius + (isSelected ? 1.4 / scale : 0), 0, Math.PI * 2);
    context.fillStyle = node.accent;
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = (node.type === "category" ? 1.5 : .85) / scale;
    context.strokeStyle = "rgba(255,255,255,.94)";
    context.stroke();

    if (node.type === "reel" && node.bridge && node.categoryIds?.length) {
      const bridgeAccents = node.categoryIds.map((categoryId) => nodeMap.get(categoryId)?.accent).filter(Boolean) as string[];
      bridgeAccents.forEach((accent, index) => {
        const start = -Math.PI / 2 + (index / bridgeAccents.length) * Math.PI * 2;
        const end = -Math.PI / 2 + ((index + 1) / bridgeAccents.length) * Math.PI * 2 - .08;
        context.beginPath();
        context.arc(node.x!, node.y!, radius + 2 / scale, start, end);
        context.lineWidth = 1.45 / scale;
        context.strokeStyle = accent;
        context.stroke();
      });
    }

    if (isSelected) {
      context.beginPath();
      context.arc(node.x, node.y, radius + 4.5 / scale, 0, Math.PI * 2);
      context.lineWidth = .9 / scale;
      context.strokeStyle = node.accent;
      context.stroke();
    }

    if (labelVisible) {
      const fontSize = (node.type === "category" ? 8.8 : 7.6) / scale;
      const label = node.label.length > 30 ? `${node.label.slice(0, 28)}…` : node.label;
      context.font = `${node.type === "category" ? 680 : 560} ${fontSize}px Inter, ui-sans-serif, sans-serif`;
      context.textBaseline = "middle";
      context.fillStyle = "#293b57";
      context.fillText(label, node.x + radius + 4 / scale, node.y - (node.type === "category" ? 2.8 / scale : 0));
      if (node.type === "category") {
        context.font = `${6.4 / scale}px Inter, ui-sans-serif, sans-serif`;
        context.fillStyle = "#8b929b";
        context.fillText(node.meta, node.x + radius + 4 / scale, node.y + 5.8 / scale);
      }
    }
    context.restore();
  }, [hoveredNodeId, neighborIds, nodeMap, query, queryMatches, selectedNodeId]);

  const paintNodePointer = useCallback((rawNode: NodeObject<VaultNode>, color: string, context: CanvasRenderingContext2D, globalScale: number) => {
    const node = rawNode as VaultNode;
    if (node.x === undefined || node.y === undefined) return;
    context.fillStyle = color;
    context.beginPath();
    context.arc(node.x, node.y, (node.type === "category" ? 17 : 10) / Math.max(.72, globalScale), 0, Math.PI * 2);
    context.fill();
  }, []);

  return (
    <div className="vault-page knowledge-vault-page">
      <div className={`vault-graph-workspace ${selectedNode && selectedNode.type !== "category" ? "note-open" : ""} ${selectedNode?.type === "category" ? "guide-open" : ""}`}>
        <button className={`map-library-toggle ${libraryOpen ? "active" : ""}`} onClick={() => setLibraryOpen((open) => !open)} aria-expanded={libraryOpen}><Layers3 size={14} /> Areas <span>{rankedCategories.length}</span></button>
        <aside className={`map-library-panel ${libraryOpen ? "open" : ""}`} aria-hidden={!libraryOpen}>
          <div className="map-library-brand">
            <span className="map-brand-mark"><Link2 size={16} /></span>
            <div><strong>Second Brain</strong><small>Personal knowledge network</small></div>
            <button aria-label="Close knowledge areas" onClick={() => setLibraryOpen(false)}><X size={14} /></button>
          </div>
          <label className="vault-search"><Search size={15} /><input placeholder="Search Reels, topics, creators…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="map-library-label"><span>Knowledge areas</span><small>{rankedCategories.length} clusters</small></div>
          <div className="map-cluster-list">
            {rankedCategories.map((category, index) => {
              const accent = categoryAccents[category.name] || categoryAccents.Other;
              const initials = category.name.split(/\s|&/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
              const active = selectedNodeId === category.id;
              return <button key={category.id} className={active ? "active" : ""} onClick={() => chooseNode(category.id)}>
                <span className="cluster-rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="cluster-avatar" style={{ "--cluster-accent": accent } as React.CSSProperties}>{initials}</span>
                <span className="cluster-copy"><strong>{category.name}</strong><small>{category.topics.slice(0, 2).join(" · ") || "Learning from your saves"}</small></span>
                <span className="cluster-count"><strong>{category.sourceCount}</strong><small>{category.sourceCount === 1 ? "Reel" : "Reels"}</small></span>
              </button>;
            })}
          </div>
          <div className="map-library-footer"><span><i /> {totalSources} mapped memories</span><small>{recoveryCount ? `${recoveryCount} awaiting context` : "All caught up"}</small></div>
        </aside>

        <section className="vault-graph" aria-label="Knowledge categories, saved Reels, and creators">
          {selectedNode?.type === "category" && selectedCategory ? <KnowledgeGuide
            category={selectedCategory}
            captures={selectedCategoryCaptures}
            accent={selectedAccent}
            onClose={resetGraph}
            onOpenSource={openSourceNote}
          /> : null}
          <div className={`vault-graph-canvas ${selectedNode?.type === "category" ? "guide-hidden" : ""}`} ref={graphContainerRef}>
            <div className="map-stats" aria-label="Knowledge map statistics">
              <span><i /> <strong>{atlasCategories.length}</strong> areas</span>
              <b />
              <span><strong>{totalSources}</strong> memories</span>
              <b />
              <span><strong>{connectionCount}</strong> connections</span>
            </div>
            <div className="force-graph-layer" aria-hidden="true">
              <ForceGraph2D<VaultNode, VaultLink>
                ref={graphRef}
                graphData={forceData}
                width={graphSize.width}
                height={graphSize.height}
                backgroundColor="#fbfaf4"
                nodeCanvasObjectMode={() => "replace"}
                nodeCanvasObject={paintNode}
                nodePointerAreaPaint={paintNodePointer}
                nodeLabel={(node) => `${node.label} · ${node.meta}`}
                linkColor={(rawLink) => {
                  const link = rawLink as VaultLink;
                  const sourceId = endpointId(link.source);
                  const targetId = endpointId(link.target);
                  const queryVisible = queryMatches.has(sourceId) && queryMatches.has(targetId);
                  if (query.trim() && !queryVisible) return "rgba(127,169,212,0.015)";
                  const focusNodeId = selectedNodeId || hoveredNodeId;
                  if (!focusNodeId) {
                    if (link.kind === "association") return "rgba(72,92,119,.13)";
                    if (link.kind === "creator") return "rgba(127,169,212,.18)";
                    return `${link.accent}48`;
                  }
                  const related = sourceId === focusNodeId || targetId === focusNodeId;
                  if (!related) return "rgba(127,169,212,0.026)";
                  if (link.kind === "association") return "rgba(72,92,119,.62)";
                  if (link.kind === "creator") return "rgba(127,169,212,.58)";
                  return `${link.accent}b5`;
                }}
                linkWidth={(rawLink) => {
                  const link = rawLink as VaultLink;
                  const focusNodeId = selectedNodeId || hoveredNodeId;
                  if (!focusNodeId) return link.kind === "association" ? .32 : .46;
                  const related = endpointId(link.source) === focusNodeId || endpointId(link.target) === focusNodeId;
                  if (!related) return .2;
                  return link.kind === "association" ? .95 : .9;
                }}
                linkLabel={(rawLink) => (rawLink as VaultLink).reason || ""}
                linkCurvature={(rawLink) => (rawLink as VaultLink).curve}
                minZoom={.55}
                maxZoom={4.5}
                d3AlphaDecay={.022}
                d3VelocityDecay={.24}
                warmupTicks={prefersReducedMotion ? 220 : 118}
                cooldownTicks={prefersReducedMotion ? 1 : 220}
                onEngineStop={() => {
                  if (initialFitDone.current) return;
                  initialFitDone.current = true;
                  graphRef.current?.zoomToFit(prefersReducedMotion ? 0 : 420, 88);
                }}
                onNodeClick={(node) => chooseNode(String(node.id))}
                onNodeHover={(node) => setHoveredNodeId(node ? String(node.id) : null)}
                onBackgroundClick={resetGraph}
                showPointerCursor
                enableNodeDrag={!prefersReducedMotion}
              />
            </div>
            <div className="map-node-accessibility">
              {graph.nodes.map((node) => <button key={node.id} onClick={() => chooseNode(node.id)}>{node.type}: {node.label}</button>)}
            </div>
            {!graph.nodes.length ? <div className="vault-empty"><Layers3 size={20} /><strong>Your graph starts with one saved Reel.</strong><span>Share a Reel with the Knowledge label.</span></div> : null}
            {query.trim() && !queryMatches.size ? <div className="vault-empty"><Search size={18} /><strong>No matching nodes</strong><span>Try a category or creator name.</span></div> : null}
            <div className="map-type-legend">
              <strong>Map key</strong>
              <span><i className="category" /> knowledge area</span><span><i className="reel" /> saved Reel</span><span><i className="bridge" /> bridge memory</span><span><i className="connection" /> related idea</span>
              <small>{bridgeCount} {bridgeCount === 1 ? "memory touches" : "memories touch"} more than one area. {recoveryCount ? `${recoveryCount} incomplete saves stay in Sources until verified.` : "Only verified knowledge appears here."}</small>
            </div>
            <div className="map-canvas-hint">Verified knowledge only · Drag to move · Scroll to zoom · Select a memory to reveal its threads</div>
            {selectedNode ? <button className="map-reset" onClick={resetGraph}><RefreshCw size={13} /> Reset focus</button> : null}
          </div>
        </section>

        {selectedNode && selectedNode.type !== "category" ? <article className="vault-note" style={{ "--node-accent": selectedAccent } as React.CSSProperties}>
          <header><span>{selectedCapture ? `${selectedCapture.title || "Saved Reel"}.md` : `${selectedNode.label}.md`}</span><button aria-label="Close note" onClick={resetGraph}><X size={15} /></button></header>
          <div className="vault-note-body">
            {selectedCapture ? <>
              <span className="vault-note-path">Knowledge / {(selectedMembership?.categories || [selectedCategory?.name || "Other"]).join(" ↔ ")}</span>
              <h2>{selectedCapture.title || "Saved Reel"}</h2>
              <div className="vault-note-tags"><span>{selectedCapture.creator || "Unknown creator"}</span>{(selectedMembership?.categories || [selectedCategory?.name || "Other"]).map((category) => <span key={category}>{category}</span>)}<span>{capturedAt}</span><span>{selectedCapture.platform || "Web"}</span></div>
              <h3>The idea</h3><p className="vault-note-lede">{selectedCapture.summary || "Spool is still reading this source."}</p>
              {selectedMembership?.bridge ? <div className="vault-bridge-note"><small><Link2 size={11} /> WHY THIS IS A BRIDGE</small>{selectedMembership.categories.map((category) => <div key={category}><i style={{ "--bridge-accent": categoryAccents[category] || categoryAccents.Other } as React.CSSProperties} /><span><strong>{category}</strong>{selectedMembership.reasons[category]}</span></div>)}</div> : null}
              {selectedCapture.hook ? <div className="vault-hook"><small>Opening hook</small><p>“{selectedCapture.hook}”</p></div> : null}
              {selectedCapture.takeaways?.length ? <><h3>What it teaches</h3><ul className="vault-lesson-list">{selectedCapture.takeaways.map((takeaway) => <li key={takeaway}><Check size={11} /><span>{takeaway}</span></li>)}</ul></> : null}
              {selectedStructureSteps.length > 1 ? <><h3>How it unfolds</h3><ol className="vault-structure">{selectedStructureSteps.slice(0, 7).map((step, index) => <li key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol></> : null}
              {selectedCapture.action ? <div className="vault-try"><Feather size={13} /><span><strong>Try this</strong>{selectedCapture.action}</span></div> : null}
              {selectedConnections.length ? <><h3>Connected memories</h3><div className="vault-related-memories">{selectedConnections.map(({ connection, capture }) => <button key={connection.id} onClick={() => chooseNode(`reel-${capture!.id}`)}><i style={{ "--bridge-accent": categoryAccents[membershipBySource.get(capture!.id)?.primaryCategory || capture!.contentCategory || "Other"] || categoryAccents.Other } as React.CSSProperties} /><span><strong>{capture!.title || "Saved Reel"}</strong><small>{connection.reason}</small></span><ChevronRight size={12} /></button>)}</div></> : null}
              {selectedCapture.sharedText ? <div className="vault-saved-because"><strong>WHY YOU SAVED THIS</strong><p>{selectedCapture.sharedText}</p></div> : null}
              {selectedCapture.transcript ? <details className="vault-transcript"><summary><FileText size={12} /> Read full transcript</summary><p>{selectedCapture.transcript}</p></details> : null}
              <div className="vault-note-actions"><a href={selectedCapture.url} target="_blank" rel="noreferrer">Open original <ExternalLink size={12} /></a>{!selectedCapture.transcript ? <button onClick={() => onTranscribe(selectedCapture)}><AudioLines size={12} /> Transcribe</button> : null}</div>
            </> : selectedNode.type === "creator" ? <>
              <span className="vault-note-path">Creators</span><h2>{selectedNode.label}</h2><div className="vault-note-tags"><span>{selectedCreatorSources.length} linked Reels</span><span>Creator playbook</span></div>
              <h3>Connected source notes</h3><ul>{selectedCreatorSources.map((capture) => <li key={capture.id}>{capture.title || "Saved Reel"}</li>)}</ul><p>Every new Reel saved with the Creator label strengthens this playbook.</p>
            </> : <><span className="vault-note-path">Knowledge</span><h2>Source unavailable</h2><p>This note is no longer connected to a saved Reel.</p></>}
          </div>
        </article> : null}
      </div>
    </div>
  );
}

function transcriptHook(capture: ApiCapture) {
  if (capture.hook?.trim()) return capture.hook.trim();
  const spokenText = capture.transcript?.trim().replace(/\s+/g, " ") || "";
  const opening = spokenText.match(/^(.{1,220}?)(?:[.!?](?:\s|$)|$)/)?.[1]?.trim() || spokenText.slice(0, 220).trim();
  return opening ? `${opening}${/[.!?]$/.test(opening) ? "" : "."}` : "Opening line not detected.";
}

function hookPattern(capture: ApiCapture) {
  const hook = transcriptHook(capture).toLowerCase();
  if (hook.includes("?")) return "Question";
  if (/\b(how to|here'?s how|steps?|ways?|tips?)\b/.test(hook)) return "How-to";
  if (/\b(stop|don'?t|never|wrong|mistake|instead|nobody|myth)\b/.test(hook)) return "Contrarian";
  if (/\b(i built|i made|we built|result|grew|earned|landed|from .+ to|in \d+ days?)\b/.test(hook)) return "Proof";
  if (/\b(first|today|when i|last year|story|day in my life)\b/.test(hook)) return "Story";
  if (/\b(\d+|three|four|five|top)\b/.test(hook)) return "List";
  return "Curiosity";
}

function reusableScriptShape(capture: ApiCapture) {
  const steps = capture.structure?.split(/→|->/).map((step) => step.trim()).filter(Boolean) || [];
  if (steps.length) return `${hookPattern(capture)} opening → ${steps.join(" → ")}`;
  return `${hookPattern(capture)} opening → explain the tension → show proof or process → land one clear takeaway`;
}

function transcriptParagraphs(transcript: string) {
  const sentences = transcript.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [transcript];
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 3) paragraphs.push(sentences.slice(index, index + 3).join(" "));
  return paragraphs;
}

function spokenLength(transcript: string) {
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(1, Math.round(words / 2.5));
  return { words, label: seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s` };
}

function ScriptBankView({ library }: { library: LibraryPayload }) {
  const scripts = useMemo(() => library.captures.filter((capture) => capture.transcript?.trim() && capture.transcriptStatus === "ready"), [library.captures]);
  const [mode, setMode] = useState<"hooks" | "scripts">("hooks");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [pattern, setPattern] = useState("All patterns");
  const [selectedId, setSelectedId] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const categories = useMemo(() => ["All", ...new Set(scripts.map((capture) => capture.contentCategory || "Other"))], [scripts]);
  const patterns = useMemo(() => ["All patterns", ...new Set(scripts.map(hookPattern))], [scripts]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return scripts.filter((capture) => {
      const categoryMatches = category === "All" || (capture.contentCategory || "Other") === category;
      const patternMatches = pattern === "All patterns" || hookPattern(capture) === pattern;
      const searchMatches = !normalized || [capture.title, capture.creator, capture.contentCategory, capture.hook, capture.structure, capture.transcript]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
      return categoryMatches && patternMatches && searchMatches;
    });
  }, [category, pattern, query, scripts]);

  useEffect(() => {
    if (!filtered.length) return setSelectedId("");
    if (!filtered.some((capture) => capture.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = filtered.find((capture) => capture.id === selectedId) || filtered[0];
  const creatorCount = new Set(scripts.map((capture) => capture.creator).filter(Boolean)).size;

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? "" : current), 1800);
    } catch {
      setCopiedKey("");
    }
  };

  return (
    <div className="page script-bank-page">
      <header className="script-bank-masthead">
        <div>
          <span className="date-line">Your creation library</span>
          <h1>Creation <em>banks.</em></h1>
          <p>Find the opening that made you stop, study the full delivery, then reuse the shape in your own voice.</p>
        </div>
        <div className="script-bank-stats" aria-label="Script bank summary">
          <span><strong>{scripts.length}</strong> scripts</span><i /><span><strong>{scripts.length}</strong> hooks</span><i /><span><strong>{creatorCount}</strong> creators</span>
        </div>
      </header>

      <section className="script-bank-controls" aria-label="Script bank controls">
        <div className="bank-mode-switch" role="tablist" aria-label="Bank view">
          <button role="tab" aria-selected={mode === "hooks"} className={mode === "hooks" ? "active" : ""} onClick={() => setMode("hooks")}><Quote size={13} /> Hooks <span>{scripts.length}</span></button>
          <button role="tab" aria-selected={mode === "scripts"} className={mode === "scripts" ? "active" : ""} onClick={() => setMode("scripts")}><FileText size={13} /> Scripts <span>{scripts.length}</span></button>
        </div>
        <label className="bank-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search words, creators, or topics…" /></label>
      </section>

      <nav className="bank-categories" aria-label="Filter by knowledge area">
        {categories.map((item) => <button key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </nav>

      {mode === "hooks" ? <nav className="bank-patterns" aria-label="Filter by hook pattern">
        <span>Opening pattern</span>
        {patterns.map((item) => <button key={item} className={pattern === item ? "active" : ""} aria-pressed={pattern === item} onClick={() => setPattern(item)}>{item}</button>)}
      </nav> : null}

      {!scripts.length ? <section className="bank-empty"><AudioLines size={20} /><h2>Your first script will appear here.</h2><p>Save a Reel with the Script label, or transcribe one from Knowledge.</p></section> : !filtered.length ? <section className="bank-empty"><Search size={20} /><h2>No matching scripts.</h2><p>Try another word or knowledge area.</p></section> : mode === "hooks" ? <section className="hook-ledger" aria-label="Saved hooks">
        {filtered.map((capture, index) => {
          const hook = transcriptHook(capture);
          const copied = copiedKey === `hook-${capture.id}`;
          return <article className="hook-entry" key={capture.id}>
            <aside><span>{String(index + 1).padStart(2, "0")}</span><small>{capture.contentCategory || "Other"}</small></aside>
            <div>
              <div className="hook-source"><span>{capture.creator || "Unknown creator"}</span><i />{capture.title || "Saved Reel"}<b>{hookPattern(capture)}</b></div>
              <blockquote>“{hook}”</blockquote>
              <div className="hook-actions">
                <button className={copied ? "copied" : ""} onClick={() => void copyToClipboard(hook, `hook-${capture.id}`)}><Copy size={12} />{copied ? "Hook copied" : "Copy hook"}</button>
                <a href={capture.url} target="_blank" rel="noreferrer">Open Reel <ExternalLink size={11} /></a>
              </div>
            </div>
          </article>;
        })}
      </section> : <section className="script-bank-workspace">
        <aside className="script-index" aria-label="Transcribed scripts">
          <header><span>Transcribed scripts</span><small>{filtered.length}</small></header>
          <div>{filtered.map((capture, index) => {
            const length = spokenLength(capture.transcript || "");
            return <button className={selected?.id === capture.id ? "active" : ""} key={capture.id} onClick={() => setSelectedId(capture.id)}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{capture.title || "Saved Reel"}</strong><small>{capture.creator || "Unknown creator"} · {length.label}</small></div>
              <ChevronRight size={12} />
            </button>;
          })}</div>
        </aside>

        {selected ? <article className="script-reader">
          {(() => {
            const transcript = selected.transcript || "";
            const length = spokenLength(transcript);
            const paragraphs = transcriptParagraphs(transcript);
            const structure = selected.structure?.split(/→|->/).map((step) => step.trim()).filter(Boolean) || [];
            const copied = copiedKey === `script-${selected.id}`;
            return <>
              <header>
                <div className="script-reader-path"><span>{selected.contentCategory || "Other"}</span><i />{selected.creator || "Unknown creator"}</div>
                <h2>{selected.title || "Saved Reel"}</h2>
                <div className="script-reader-meta"><span>{length.words} words</span><span>{length.label}</span><span>{structure.length || 1} beats</span></div>
                <div className="script-reader-actions">
                  <button className={copied ? "copied" : ""} onClick={() => void copyToClipboard(transcript, `script-${selected.id}`)}><Copy size={12} />{copied ? "Script copied" : "Copy script"}</button>
                  <a href={selected.url} target="_blank" rel="noreferrer">Open Reel <ExternalLink size={11} /></a>
                </div>
              </header>

              <section className="script-hook-line"><small>Hook</small><blockquote>“{transcriptHook(selected)}”</blockquote></section>
              {structure.length ? <section className="script-map"><small>Script map</small><div>{structure.slice(0, 8).map((step, index) => <span key={`${step}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i>{step}</span>)}</div></section> : null}
              <section className="script-template"><small>Make it yours</small><p>{reusableScriptShape(selected)}</p><button className={copiedKey === `shape-${selected.id}` ? "copied" : ""} onClick={() => void copyToClipboard(reusableScriptShape(selected), `shape-${selected.id}`)}><Copy size={11} />{copiedKey === `shape-${selected.id}` ? "Shape copied" : "Copy reusable shape"}</button></section>
              <section className="script-body"><small>Full transcript</small><div className="transcript-margin-rail">{paragraphs.map((paragraph, index) => <p key={`${paragraph.slice(0, 20)}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{paragraph}</p>)}</div></section>
            </>;
          })()}
        </article> : null}
      </section>}
    </div>
  );
}

function CreatorsView({ library }: { library: LibraryPayload }) {
  const liveCreators = library.creators.map((item, index) => ({
    id: item.id,
    handle: item.creator.startsWith("@") ? item.creator : item.creator,
    name: item.creator.replace(/^@/, ""),
    initials: item.creator.replace(/^@/, "").split(/[._\s-]+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?",
    bio: `A live playbook assembled from ${item.sourceCount} ${item.sourceCount === 1 ? "save" : "saves"}. It sharpens automatically as you collect more.`,
    accent: ["#d9b93f", "#7fa9d4", "#8cbdae", "#d77a66"][index % 4],
    pillars: item.topics.length ? item.topics : ["Still learning"],
    patterns: [...item.hooks, ...item.structures].filter(Boolean).slice(0, 6),
    voice: item.sourceCount > 2 ? "A repeatable voice is beginning to emerge across your saved examples." : "Save two more examples before treating the voice as a dependable pattern.",
    engine: item.structures[0]?.split(/→|->/).map((step) => step.trim()).filter(Boolean).slice(0, 5) || ["Save examples", "Compare structures", "Run your own experiment"],
    sourceIds: item.sourceIds
  }));
  const allCreators = [...liveCreators, ...creators.filter((seed) => !liveCreators.some((live) => live.handle === seed.handle))];
  const [selectedCreator, setSelectedCreator] = useState(allCreators[0].id);
  const creator = allCreators.find((item) => item.id === selectedCreator) ?? allCreators[0];

  return (
    <div className="page creators-page">
      <section className="page-intro compact-intro">
        <div>
          <span className="date-line">Patterns, not imitation</span>
          <h1>Creator<br /><em>playbooks.</em></h1>
        </div>
        <p className="intro-copy">Spool studies what repeats across the creators you save, then turns those patterns into experiments for your own voice.</p>
      </section>

      <div className="creator-tabs" role="tablist">
        {allCreators.map((item) => (
          <button
            role="tab"
            aria-selected={creator.id === item.id}
            className={creator.id === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setSelectedCreator(item.id)}
          >
            <span className="avatar" style={{ "--avatar-accent": item.accent } as React.CSSProperties}>{item.initials}</span>
            <span><strong>{item.name}</strong><small>{item.sourceIds.length} saved {item.sourceIds.length === 1 ? "source" : "sources"}</small></span>
          </button>
        ))}
      </div>

      <section className="playbook" style={{ "--creator-accent": creator.accent } as React.CSSProperties}>
        <header className="playbook-profile">
          <div className="avatar avatar-large">{creator.initials}</div>
          <div>
            <span className="creator-handle">{creator.handle}</span>
            <h2>{creator.name}</h2>
            <p>{creator.bio}</p>
          </div>
          {creator.handle.startsWith("@") ? <a href={`https://www.instagram.com/${creator.handle.slice(1)}`} target="_blank" rel="noreferrer" className="quiet-button">Open profile <ExternalLink size={14} /></a> : null}
        </header>

        <div className="playbook-grid">
          <article className="playbook-section">
            <span className="section-index">01 / territory</span>
            <h3>Content pillars</h3>
            <div className="pill-cloud">
              {creator.pillars.map((pillar) => <span key={pillar}>{pillar}</span>)}
            </div>
          </article>
          <article className="playbook-section pattern-section">
            <span className="section-index">02 / repeats</span>
            <h3>Patterns worth borrowing</h3>
            <ul>{creator.patterns.map((pattern) => <li key={pattern}><Check size={14} /><span>{pattern}</span></li>)}</ul>
          </article>
          <article className="playbook-section voice-section">
            <span className="section-index">03 / voice</span>
            <h3>How it sounds</h3>
            <blockquote>“{creator.voice}”</blockquote>
          </article>
        </div>

        <article className="engine-strip">
          <div>
            <span className="section-index">04 / signature engine</span>
            <h3>The repeatable content loop</h3>
          </div>
          <div className="engine-flow">
            {creator.engine.map((step, index) => (
              <div className="engine-step" key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
                {index < creator.engine.length - 1 ? <ArrowRight size={15} /> : null}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function SetupView({ onCapture, health }: { onCapture: () => void; health: ApiHealth | null }) {
  const endpoint = `${window.location.origin}/api/capture`;
  const connectionCopy = health?.providerStatus === "connected"
    ? { title: `Claude connected · ${health.model}`, detail: "A real source has been processed successfully.", state: "connected" }
    : health?.providerStatus === "invalid"
      ? { title: "Anthropic rejected this API key", detail: "Replace the key in .env, restart Spool, then retry the failed source.", state: "invalid" }
      : health?.configured
        ? { title: `Claude key found · ${health.model}`, detail: "The key will be validated by the next capture.", state: "configured" }
        : { title: "Claude key not connected yet", detail: "Captures still save safely, but need your key before Claude can read them.", state: "demo" };
  return (
    <div className="page setup-page">
      <section className="setup-copy">
        <span className="date-line">One-time setup · about 2 minutes</span>
        <h1>One tap from<br /><em>any reel.</em></h1>
        <p className="setup-lede">The Shortcut receives the Instagram link, sends it to your private Spool, and gets out of the way. No labels. No folders. No decisions.</p>

        <div className={`connection-card ${connectionCopy.state}`}>
          <span>{connectionCopy.state === "connected" ? <Wifi size={17} /> : <AlertCircle size={17} />}</span>
          <div>
            <strong>{connectionCopy.title}</strong>
            <p>{connectionCopy.detail}</p>
          </div>
        </div>

        <div className={`connection-card transcript-connection ${health?.transcriptionConfigured ? "connected" : "demo"}`}>
          <span><AudioLines size={17} /></span>
          <div>
            <strong>{health?.transcriptionAccount?.status === "exhausted" ? "Transcript credits used up" : health?.transcriptionAccount?.status === "invalid" ? "Supadata key needs attention" : health?.transcriptionConfigured ? "Selective transcripts · Supadata" : "Selective transcripts are optional"}</strong>
            <p>{health?.transcriptionConfigured ? "Transcripts use credits for Script saves and Knowledge saves whose captions lack the lesson. Browsing existing notes is free." : "Connect Supadata to add spoken-word scripts only to the Reels worth studying."}</p>
          </div>
        </div>

        <ol className="setup-steps">
          <li>
            <span>1</span>
            <div><strong>Create “Save to Spool” in Shortcuts</strong><p>Set it to receive URLs from the Share Sheet.</p></div>
          </li>
          <li>
            <span>2</span>
            <div><strong>Add “Get Contents of URL”</strong><p>POST the Shortcut Input as JSON to <code>{endpoint}</code>.</p></div>
          </li>
          <li>
            <span>3</span>
            <div><strong>Add one quiet confirmation</strong><p>Show “Spooling…” and return directly to Instagram.</p></div>
          </li>
        </ol>

        <div className="setup-actions">
          <button className="primary-button" onClick={onCapture}>Test with a reel link</button>
          <a className="text-action" href="/shortcut-setup.html" target="_blank">Open exact Shortcut recipe <ExternalLink size={14} /></a>
        </div>

        <div className="privacy-note">
          <Bookmark size={17} />
          <p><strong>You control what enters Spool.</strong> It cannot read your Instagram likes or saved collection. Only links you explicitly share are processed.</p>
        </div>
      </section>

      <div className="phone-stage" aria-label="Preview of sharing a reel to Spool">
        <div className="phone-shell">
          <div className="phone-island" />
          <div className="phone-reel">
            <span className="phone-caption">A reel worth keeping<br /><strong>without breaking your scroll.</strong></span>
            <div className="phone-actions"><span>♡</span><span>◯</span><span>⌁</span></div>
          </div>
          <div className="share-sheet">
            <div className="share-handle" />
            <small>Share</small>
            <div className="share-apps">
              <div><span className="generic-app"><Send size={19} /></span><small>Messages</small></div>
              <div><span className="spool-app"><SpoolMark /></span><small>Spool</small></div>
              <div><span className="generic-app"><MoreHorizontal size={19} /></span><small>More</small></div>
            </div>
            <div className="share-success"><Check size={16} /><span>Spooling in the background</span></div>
          </div>
        </div>
        <span className="phone-note"><Sparkles size={14} /> The only repeated action</span>
      </div>
    </div>
  );
}

type LocalAskResult = {
  lead: string;
  points: string[];
  actions: string[];
  sources: ApiCapture[];
};

const askStopWords = new Set(["a", "about", "all", "am", "an", "and", "are", "build", "can", "could", "do", "does", "for", "from", "have", "how", "i", "in", "into", "is", "it", "learn", "make", "me", "my", "of", "on", "or", "plan", "practical", "save", "saved", "saves", "should", "that", "the", "this", "to", "turn", "use", "what", "when", "where", "which", "with"]);

function askTokens(question: string) {
  const tokens = question.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 1 && !askStopWords.has(token));
  const expanded = new Set(tokens);
  const joined = tokens.join(" ");
  if (/career|job|resume|portfolio|intern/.test(joined)) ["career", "recruiting", "resume", "portfolio"].forEach((token) => expanded.add(token));
  if (/content|reel|video|script|hook|post|creator/.test(joined)) ["content", "hook", "script", "creator"].forEach((token) => expanded.add(token));
  if (/\bai\b|agent|claude|automat/.test(joined)) ["ai", "agent", "claude", "automation"].forEach((token) => expanded.add(token));
  if (/startup|business|idea|launch|founder/.test(joined)) ["startup", "business", "launch", "founder"].forEach((token) => expanded.add(token));
  if (/vlog|lifestyle|routine|outfit/.test(joined)) ["vlog", "lifestyle", "routine"].forEach((token) => expanded.add(token));
  return [...expanded];
}

function searchSpool(question: string, library: LibraryPayload): LocalAskResult | null {
  const tokens = askTokens(question);
  if (!tokens.length) return null;
  const scored = library.captures
    .filter((capture) => capture.status === "ready" && (!capture.intents || capture.intents.includes("knowledge")))
    .map((capture) => {
      const fields = [
        [capture.title, 7],
        [capture.topic, 7],
        [capture.contentCategory, 5],
        [capture.summary, 4],
        [(capture.takeaways || []).join(" "), 3],
        [capture.structure, 2],
        [capture.action, 2],
        [capture.sharedText, 2],
        [capture.transcript?.slice(0, 8_000), 1]
      ] as Array<[string | undefined, number]>;
      const score = tokens.reduce((total, token) => total + fields.reduce((fieldTotal, [value, weight]) => fieldTotal + (String(value || "").toLowerCase().includes(token) ? weight : 0), 0), 0);
      return { capture, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.capture.confidence || 0) - Number(a.capture.confidence || 0))
    .slice(0, 5);
  if (!scored.length) return null;
  const sources = scored.map((item) => item.capture);
  const unique = (items: Array<string | undefined>, limit: number) => [...new Set(items.map((item) => item?.trim()).filter(Boolean) as string[])].slice(0, limit);
  return {
    lead: sources[0].summary || "Spool found related notes, but the strongest source still needs a clearer summary.",
    points: unique(sources.flatMap((source) => source.takeaways || []), 5),
    actions: unique(sources.map((source) => source.action), 3),
    sources
  };
}

function AskSpool({ library, onClose }: { library: LibraryPayload; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<LocalAskResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [claude, setClaude] = useState<ApiAskResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "thinking" | "cached" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const suggestions = ["How should I build a small AI team?", "What hooks and content patterns have I saved?", "Turn my career saves into a practical plan."];

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const runFreeSearch = (nextQuestion = question) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    setResult(searchSpool(trimmed, library));
    setSearched(true);
    setClaude(null);
    setStatus("idle");
    setError("");
  };

  const cacheKey = result ? `${question.toLowerCase()}::${result.sources.map((source) => source.id).join(",")}` : "";

  const synthesize = async () => {
    if (!result || !cacheKey) return;
    setStatus("thinking");
    setError("");
    try {
      const cached = JSON.parse(window.localStorage.getItem("spool-ask-cache") || "{}") as Record<string, ApiAskResponse>;
      if (cached[cacheKey]) {
        setClaude(cached[cacheKey]);
        setStatus("cached");
        return;
      }
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sourceIds: result.sources.map((source) => source.id) })
      });
      const payload = await response.json().catch(() => ({ error: "Ask Spool could not read the response." })) as ApiAskResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Ask Spool could not synthesize this answer.");
      setClaude(payload);
      setStatus("ready");
      const nextCache = { ...cached, [cacheKey]: payload };
      const entries = Object.entries(nextCache).slice(-12);
      window.localStorage.setItem("spool-ask-cache", JSON.stringify(Object.fromEntries(entries)));
    } catch (askError) {
      setStatus("error");
      setError(askError instanceof Error ? askError.message : "Ask Spool could not synthesize this answer.");
    }
  };

  return <div className="ask-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="ask-sheet" role="dialog" aria-modal="true" aria-labelledby="ask-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span><Sparkles size={12} /> Search your Second Brain</span><h2 id="ask-title">Ask Spool</h2></div><button aria-label="Close Ask Spool" onClick={onClose}><X size={16} /></button></header>
      <form onSubmit={(event) => { event.preventDefault(); runFreeSearch(); }}>
        <label htmlFor="ask-question">What do you want to use?</label>
        <div><textarea id="ask-question" autoFocus rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. What have I learned about building AI agents?" /><button disabled={!question.trim()}><Search size={14} /> Search free</button></div>
        <p><Check size={11} /> Searches saved analysis on this device. No Claude or transcript credits.</p>
      </form>
      {!result ? <div className="ask-suggestions">{searched ? <div className="ask-empty"><Search size={15} /><div><strong>No ready saves matched that question.</strong><p>Try a broader phrase, or add context to unfinished saves in Sources.</p></div></div> : null}<small>{searched ? "TRY ANOTHER QUESTION" : "TRY ASKING"}</small>{suggestions.map((suggestion) => <button key={suggestion} onClick={() => runFreeSearch(suggestion)}>{suggestion}<ArrowRight size={12} /></button>)}</div> : <div className="ask-result">
        <div className="ask-result-label"><span><i /> Instant answer</span><small>Free · {result.sources.length} supporting {result.sources.length === 1 ? "save" : "saves"}</small></div>
        <section className="ask-local-answer"><p>{result.lead}</p>{result.points.length ? <ul>{result.points.map((point) => <li key={point}><Check size={11} /><span>{point}</span></li>)}</ul> : null}{result.actions.length ? <div><small>GOOD NEXT MOVES</small>{result.actions.map((action) => <p key={action}><Feather size={11} />{action}</p>)}</div> : null}</section>
        {claude ? <section className="ask-claude-answer"><header><span><Sparkles size={12} /> Claude synthesis</span><small>{status === "cached" ? "Saved answer · no new request" : "1 request"}</small></header><p>{claude.answer}</p></section> : <section className="ask-synthesis"><div><strong>Want a more connected answer?</strong><p>Claude will read only these compact notes—not full transcripts.</p></div><button disabled={status === "thinking"} onClick={() => void synthesize()}>{status === "thinking" ? "Synthesizing…" : "Synthesize · 1 request"}</button></section>}
        {error ? <div className="ask-error" role="alert"><AlertCircle size={13} /><span>{error} Your free answer is still available.</span></div> : null}
        <section className="ask-citations"><header><span>Evidence used</span><small>Open the original Reel</small></header>{result.sources.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><span>[{index + 1}]</span><span><strong>{source.title || "Saved Reel"}</strong><small>{source.creator || "Unknown creator"}</small></span><ExternalLink size={11} /></a>)}</section>
      </div>}
    </section>
  </div>;
}

function CaptureModal({ onClose, onCaptured }: { onClose: () => void; onCaptured: (capture: ApiCapture) => void }) {
  const [url, setUrl] = useState("");
  const [sharedText, setSharedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [intents, setIntents] = useState<CaptureIntent[]>(["knowledge"]);
  const [error, setError] = useState("");

  const toggleIntent = (intent: CaptureIntent) => {
    setIntents((current) => current.includes(intent) ? current.filter((item) => item !== intent) : [...current, intent]);
  };

  const capture = async () => {
    if (!/^https?:\/\//i.test(url)) {
      setError("Paste a complete Instagram, YouTube, or web link.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sharedText, intents })
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({ error: "Capture endpoint unavailable" })) as { error?: string };
        throw new Error(failure.error || "Capture endpoint unavailable");
      }
      const result = await response.json() as ApiCapture;
      onCaptured(result);
      onClose();
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Spool could not save this link.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="capture-modal" role="dialog" aria-modal="true" aria-labelledby="capture-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow"><Link2 size={13} /> Desktop test</span><h2 id="capture-title">Spool a link</h2></div>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p>On iPhone this arrives automatically from the Share Sheet. Paste once here to test the same pipeline.</p>
        <label className={`capture-input ${error ? "has-error" : ""}`}>
          <span>Reel, post, profile, or video URL</span>
          <input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.instagram.com/reel/…" onKeyDown={(event) => { if (event.key === "Enter") void capture(); }} />
        </label>
        <label className="capture-input context-input">
          <span>What stood out? <em>optional</em></span>
          <textarea value={sharedText} onChange={(event) => setSharedText(event.target.value)} placeholder="e.g. I like how she explains the build in three simple steps." />
        </label>
        <fieldset className="intent-picker">
          <legend>Why are you keeping it? <em>choose any</em></legend>
          <div className="intent-thread">
            {(Object.keys(intentMeta) as CaptureIntent[]).map((intent) => {
              const meta = intentMeta[intent];
              const IntentIcon = meta.icon;
              const selected = intents.includes(intent);
              return (
                <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} key={intent} onClick={() => toggleIntent(intent)}>
                  <span><IntentIcon size={15} /></span>{meta.label}{selected ? <Check size={13} /> : null}
                </button>
              );
            })}
          </div>
          <p className="intent-result">
            {!intents.length ? <><Bookmark size={13} /><span><strong>Save only</strong> · no Claude or transcript cost.</span></> : intents.includes("script") ? <><AudioLines size={13} /><span><strong>Script selected</strong> · always transcribes, then Claude organizes it.</span></> : intents.includes("knowledge") ? <><Sparkles size={13} /><span><strong>Caption first</strong> · Spool only transcribes when the lesson is missing.</span></> : <><UserRound size={13} /><span><strong>Creator playbook</strong> · studies verified style signals without forcing a transcript.</span></>}
          </p>
        </fieldset>
        {error ? <span className="field-error">{error}</span> : null}
        <div className="modal-footer">
          <span><Sparkles size={14} /> Your note adds context; labels decide the route</span>
          <button className="primary-button" disabled={saving} onClick={() => void capture()}>{saving ? "Spooling…" : intents.length ? "Spool it" : "Save only"}</button>
        </div>
      </section>
    </div>
  );
}

function ContextModal({ capture, onClose, onSave }: { capture: ApiCapture; onClose: () => void; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(capture.sharedText || "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="capture-modal context-modal" role="dialog" aria-modal="true" aria-labelledby="context-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow"><Sparkles size={13} /> Help Claude see it</span><h2 id="context-title">What caught your attention?</h2></div>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p>Instagram sometimes blocks the reel page. One rough sentence is enough—Spool will still organize it for you.</p>
        <label className="capture-input context-input">
          <span>Your note</span>
          <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="e.g. I liked how she opens with a confident prediction, then shows the evidence fast." />
        </label>
        <div className="modal-footer">
          <span>No tags or folders needed</span>
          <button className="primary-button" disabled={saving || !text.trim()} onClick={() => { setSaving(true); void onSave(text).finally(() => setSaving(false)); }}>{saving ? "Re-reading…" : "Add and re-read"}</button>
        </div>
      </section>
    </div>
  );
}

function MobileNav({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {navItems.filter((item) => item.id !== "setup").map((item) => {
        const Icon = item.icon;
        return <button key={item.id} onClick={() => onNavigate(item.id)} className={active === item.id ? "active" : ""}><Icon size={19} /><span>{item.label}</span></button>;
      })}
    </nav>
  );
}

export default function App() {
  const [active, setActive] = useState<View>("briefing");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [library, setLibrary] = useState<LibraryPayload>(emptyLibrary);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [contextCapture, setContextCapture] = useState<ApiCapture | null>(null);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const refreshLibrary = async () => {
    try {
      const response = await fetch("/api/library", { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error("Library unavailable");
      const payload = await response.json() as LibraryPayload;
      if (!Array.isArray(payload.captures)) throw new Error("Invalid library response");
      setLibrary(payload);
      setLibraryLoaded(true);
      setLibraryError("");
    } catch {
      setLibraryError("Couldn't refresh your library. Your saved items haven't been deleted. Check your connection and try again.");
    }
  };

  const refreshHealth = async () => {
    setCheckingHealth(true);
    try {
      const response = await fetch("/api/health", { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Status unavailable");
      setHealth(await response.json() as ApiHealth);
    } catch { setToast("Couldn't check the connection. Try again without changing your saved items."); }
    finally { setCheckingHealth(false); }
  };

  useEffect(() => {
    void (async () => {
      await refreshLibrary();
      const repairResponse = await fetch("/api/repair", { method: "POST" }).catch(() => null);
      if (repairResponse?.ok) {
        const result = await repairResponse.json() as { repaired?: number };
        if (result.repaired) {
          setToast(`Repairing ${result.repaired} unfinished ${result.repaired === 1 ? "save" : "saves"}.`);
          await refreshLibrary();
        }
      }
    })();
    void refreshHealth();
  }, []);

  const hasPending = library.captures.some((capture) => capture.status === "queued" || capture.status === "processing" || capture.transcriptStatus === "queued" || capture.transcriptStatus === "processing");
  useEffect(() => {
    if (!hasPending) return;
    const interval = window.setInterval(() => void refreshLibrary(), 2200);
    return () => window.clearInterval(interval);
  }, [hasPending]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const openAsk = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setAskOpen(true);
      }
    };
    window.addEventListener("keydown", openAsk);
    return () => window.removeEventListener("keydown", openAsk);
  }, []);

  const readyCount = useMemo(() => library.captures.filter((item) => item.status === "ready").length, [library.captures]);

  const handleCaptured = (capture: ApiCapture) => {
    setLibrary((current) => ({ ...current, captures: [capture, ...current.captures.filter((item) => item.id !== capture.id)] }));
    setToast("Saved. Spool is finding the useful part.");
  };

  const openThread = () => setActive("threads");

  const blockedSaves = library.captures.filter((capture) => capture.status === "needs-context" || capture.status === "failed" || capture.transcriptStatus === "failed");
  const limitCount = library.captures.filter((capture) => /limit[ -]exceeded|quota|insufficient credits/i.test(capture.transcriptError || "")).length;
  const transcriptAccount = health?.transcriptionAccount;
  const transcriptBlocked = transcriptAccount?.status === "exhausted" || transcriptAccount?.status === "invalid";

  const postCaptureAction = async (path: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(path, { method: "POST", ...options, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error || "Couldn't start processing. Please try again.");
      }
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Connection lost. Please try again.");
      return false;
    }
  };

  const retryCapture = async (capture: ApiCapture) => {
    if (!capture.transcript && capture.transcriptStatus === "failed" && transcriptBlocked) {
      setToast("Transcription is blocked. Check Supadata, then recheck the connection. You can still add context.");
      return;
    }
    if (await postCaptureAction(`/api/captures/${capture.id}/retry`)) {
      setToast(capture.transcript ? "Retrying analysis using the saved transcript." : "Retry requested for this save.");
      await refreshLibrary();
    }
  };

  const addContext = async (sharedText: string) => {
    if (!contextCapture) return;
    const succeeded = await postCaptureAction(`/api/captures/${contextCapture.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharedText, reprocess: true })
    });
    if (succeeded) {
      setContextCapture(null);
      setToast("Context added. Claude is rebuilding the note.");
      await refreshLibrary();
    }
  };

  const transcribeCapture = async (capture: ApiCapture) => {
    if (capture.transcript) { setActive("scripts"); return; }
    if (transcriptBlocked) {
      setToast("Transcription is blocked. Check Supadata, then recheck the connection. Your Reel is saved.");
      return;
    }
    if (await postCaptureAction(`/api/captures/${capture.id}/transcribe`)) {
      setToast("Transcript requested. Supadata credits may be used.");
      await refreshLibrary();
      return;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar active={active} onNavigate={setActive} onCapture={() => setCaptureOpen(true)} liveThreadCount={library.categories.length} liveScriptCount={library.captures.filter((capture) => capture.transcript?.trim() && capture.transcriptStatus === "ready").length} liveCreatorCount={Math.max(0, library.creators.length - library.creators.filter((live) => creators.some((seed) => seed.handle === live.creator)).length)} />
      <main className="main-shell">
        <Header active={active} onCapture={() => setCaptureOpen(true)} onAsk={() => setAskOpen(true)} />
        <div className="mobile-brand"><SpoolMark /><span>spool</span><div><button aria-label="Ask Spool" onClick={() => setAskOpen(true)}><Sparkles size={17} /></button><button aria-label="Open iPhone capture setup" onClick={() => setActive("setup")}><Menu size={19} /></button></div></div>
        {libraryError ? <div className="service-notice" role="alert"><p>{libraryError}</p><button onClick={() => void refreshLibrary()}>Try loading again</button></div> : !libraryLoaded ? <div className="service-notice" role="status">Loading your saved library…</div> : null}
        {libraryLoaded && blockedSaves.length && (active === "briefing" || active === "setup") ? <section className="service-notice" aria-label="Processing status">
          <div><strong>{transcriptAccount?.status === "exhausted" ? "Transcript credits used up" : transcriptAccount?.status === "invalid" ? "Supadata connection needs attention" : `${blockedSaves.length} saves need attention`}</strong>
            <p>{transcriptAccount?.status === "exhausted" ? `${transcriptAccount.usedCredits} of ${transcriptAccount.maxCredits} Supadata credits used. New transcripts must wait for a reset or more credits.` : transcriptAccount?.status === "invalid" ? "Supadata rejected the configured key. Update it in Vercel to restore transcription." : limitCount ? `${limitCount} saves hit a Supadata limit. Check the allowance before retrying.` : "Some sources need more context or an analysis retry."} Your links and existing notes are safe.</p>
            <div className="service-actions"><button onClick={() => setRecoveryOpen((open) => !open)} aria-expanded={recoveryOpen}>{recoveryOpen ? "Hide affected saves" : `Review affected saves (${blockedSaves.length})`}</button><button disabled={checkingHealth} onClick={() => void refreshHealth()}>{checkingHealth ? "Checking…" : "Recheck connection"}</button><a href="https://dash.supadata.ai" target="_blank" rel="noreferrer">Check Supadata <ExternalLink size={12} /></a></div>
            <small>No bulk retries. Choose a save to retry, or add context without requesting a transcript.</small>
          </div>
          {recoveryOpen ? <BriefingSourceIndex captures={blockedSaves} onRetry={retryCapture} onAddContext={setContextCapture} onTranscribe={transcribeCapture} /> : null}
        </section> : null}
        {libraryLoaded ? <>
        {active === "briefing" ? <Briefing onNavigate={setActive} onOpenThread={openThread} library={library} onRetry={retryCapture} onAddContext={setContextCapture} onTranscribe={transcribeCapture} /> : null}
        {active === "threads" ? <ThreadsView library={library} onTranscribe={transcribeCapture} /> : null}
        {active === "scripts" ? <ScriptBankView library={library} /> : null}
        {active === "creators" ? <CreatorsView library={library} /> : null}
        {active === "setup" ? <SetupView onCapture={() => setCaptureOpen(true)} health={health} /> : null}
        </> : null}
      </main>
      <MobileNav active={active} onNavigate={setActive} />
      {askOpen ? <AskSpool library={library} onClose={() => setAskOpen(false)} /> : null}
      {captureOpen ? <CaptureModal onClose={() => setCaptureOpen(false)} onCaptured={handleCaptured} /> : null}
      {contextCapture ? <ContextModal capture={contextCapture} onClose={() => setContextCapture(null)} onSave={addContext} /> : null}
      {toast ? <div className="toast"><Check size={16} /><span>{toast}</span>{readyCount ? <small>{readyCount} ready</small> : null}</div> : null}
    </div>
  );
}
