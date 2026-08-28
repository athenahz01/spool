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

type LibraryPayload = { captures: ApiCapture[]; threads: ApiThread[]; creators: ApiCreator[]; categories: ApiCategory[] };
type ApiHealth = { ok: boolean; provider: string; configured: boolean; providerStatus: "missing" | "configured" | "connected" | "invalid"; model: string; protected: boolean; transcriptionConfigured?: boolean; transcriptionProvider?: string };

const emptyLibrary: LibraryPayload = { captures: [], threads: [], creators: [], categories: [] };
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
    return "The transcript did not finish. Retry the transcript to continue.";
  }
  if (capture.status === "failed" && /401|authentication_error|api key is invalid/i.test(capture.error || "")) return "Anthropic rejected the API key. Replace it in Vercel, then retry analysis.";
  if (capture.status === "failed" && capture.transcript) return "The transcript is safe. Retry analysis to organize it—this will not spend more transcript credits.";
  if (capture.status === "failed") return "Claude could not organize this source. Retry analysis, or add context if Instagram blocked it.";
  return capture.summary || "Spool is finding the durable idea and reusable structure.";
}

const navItems: Array<{ id: View; label: string; icon: typeof Compass; count?: number }> = [
  { id: "briefing", label: "Briefing", icon: Compass },
  { id: "threads", label: "Knowledge", icon: Layers3, count: navCounts.threads },
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

function Header({ active, onCapture }: { active: View; onCapture: () => void }) {
  const titles: Record<View, string> = {
    briefing: "Briefing",
    threads: "Knowledge graph",
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
        <button className="icon-button" aria-label="Search"><Search size={18} /></button>
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

  if (!captures.length) {
    return <div className="briefing-source-empty"><Inbox size={17} /><span>Your first saved Reel will appear here.</span></div>;
  }

  return (
    <div className="briefing-source-index">
      {captures.slice(0, 5).map((capture) => {
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
              {capture.status === "needs-context" ? <button onClick={() => onAddContext(capture)}>Add context</button> : null}
              {capture.status === "needs-context" || capture.status === "failed" || capture.error ? <button onClick={() => onRetry(capture)}><RefreshCw size={12} /> {capture.transcript ? "Retry analysis" : "Retry"}</button> : null}
              <button disabled={transcribing} onClick={() => onTranscribe(capture)}>{transcribing ? <RefreshCw size={12} className="spin" /> : capture.transcript ? <FileText size={12} /> : <AudioLines size={12} />}{transcribing ? "Transcribing" : capture.transcript ? "Script ready" : "Transcribe"}</button>
              <a href={capture.url} target="_blank" rel="noreferrer">Original <ExternalLink size={12} /></a>
            </div>
          </div> : null}
        </article>;
      })}
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

function ThreadsView({ library, onTranscribe }: { library: LibraryPayload; onTranscribe: (capture: ApiCapture) => void }) {
  const [query, setQuery] = useState("");
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

  const knowledgeCaptures = library.categories.length ? library.captures : demoCaptures;
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
    captureId?: string;
    creator?: string;
  };

  type VaultLink = {
    id: string;
    source: string | VaultNode;
    target: string | VaultNode;
    accent: string;
    curve: number;
    kind: "category" | "source" | "creator";
  };

  const graph = useMemo(() => {
    const nodes: VaultNode[] = [];
    const edges: Array<{ id: string; from: string; to: string; kind: VaultLink["kind"] }> = [];
    const creatorLinks = new Map<string, string[]>();

    atlasCategories.forEach((category, categoryIndex) => {
      const categoryAngle = (categoryIndex / Math.max(1, atlasCategories.length)) * Math.PI * 2 - Math.PI / 2;
      const x = 500 + Math.cos(categoryAngle) * 132;
      const y = 340 + Math.sin(categoryAngle) * 102;
      const accent = categoryAccents[category.name] || categoryAccents.Other;
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

      const captures = knowledgeCaptures.filter((capture) => category.sourceIds.includes(capture.id));
      captures.forEach((capture, sourceIndex) => {
        const angle = (sourceIndex / Math.max(1, captures.length)) * Math.PI * 2 - Math.PI / 2;
        const ring = Math.floor(sourceIndex / 9);
        const radius = 48 + ring * 18;
        const nodeId = `reel-${capture.id}`;
        nodes.push({
          id: nodeId,
          type: "reel",
          label: capture.title || "Saved Reel",
          meta: capture.creator || capture.platform || "Source",
          x: x + Math.cos(angle) * radius,
          y: y + Math.sin(angle) * radius,
          accent,
          categoryId: category.id,
          captureId: capture.id,
          creator: capture.creator
        });
        edges.push({ id: `${category.id}-${capture.id}`, from: category.id, to: nodeId, kind: "source" });
        if (capture.creator) creatorLinks.set(capture.creator, [...(creatorLinks.get(capture.creator) || []), nodeId]);
      });
    });

    const categoryIds = atlasCategories.map((category) => category.id);
    const categoryEdgeKeys = new Set<string>();
    const connectCategories = (from: string, to: string) => {
      if (from === to) return;
      const key = [from, to].sort().join("::");
      if (categoryEdgeKeys.has(key)) return;
      categoryEdgeKeys.add(key);
      edges.push({ id: `brain-${key}`, from, to, kind: "category" });
    };
    if (categoryIds.length === 2) connectCategories(categoryIds[0], categoryIds[1]);
    if (categoryIds.length > 2) {
      categoryIds.forEach((categoryId, index) => connectCategories(categoryId, categoryIds[(index + 1) % categoryIds.length]));
      if (categoryIds.length > 3) categoryIds.forEach((categoryId, index) => connectCategories(categoryId, categoryIds[(index + 2) % categoryIds.length]));
    }

    [...creatorLinks.entries()].slice(0, 6).forEach(([creator, reelIds], creatorIndex) => {
      const creatorAngle = (creatorIndex / Math.max(1, Math.min(6, creatorLinks.size))) * Math.PI * 2 - Math.PI / 2;
      const x = 500 + Math.cos(creatorAngle) * 205;
      const y = 340 + Math.sin(creatorAngle) * 155;
      const id = `creator-${creator.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      nodes.push({ id, type: "creator", label: creator, meta: `${reelIds.length} linked`, x, y, accent: "#7fa9d4", creator });
      reelIds.forEach((reelId) => edges.push({ id: `${id}-${reelId}`, from: id, to: reelId, kind: "creator" }));
    });

    return { nodes, edges };
  }, [atlasCategories, knowledgeCaptures]);

  const forceData = useMemo(() => {
    const nodes = graph.nodes.map((node) => ({
      ...node,
      x: (node.x - 500) * .36,
      y: (node.y - 340) * .36
    }));
    const forceNodeMap = new Map(nodes.map((node) => [node.id, node]));
    const links: VaultLink[] = graph.edges.map((edge, index) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      accent: edge.kind === "category" ? "#8fb8de" : forceNodeMap.get(edge.from)?.accent || forceNodeMap.get(edge.to)?.accent || "#7fa9d4",
      curve: (index % 2 ? 1 : -1) * (edge.kind === "category" ? .025 : .05 + (index % 3) * .014),
      kind: edge.kind
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
      charge?.strength?.((node: VaultNode) => node.type === "category" ? -54 : node.type === "creator" ? -30 : -19);
      charge?.distanceMax?.(260);
      link?.distance?.((item: VaultLink) => {
        if (item.kind === "category") return 48;
        if (item.kind === "creator") return 45;
        return 36;
      });
      link?.strength?.((item: VaultLink) => item.kind === "category" ? .72 : item.kind === "source" ? .88 : .56);
      graphRef.current?.d3ReheatSimulation();
    });
    return () => cancelAnimationFrame(frame);
  }, [forceData]);

  const nodeMap = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) || null : null;
  const selectedCapture = selectedNode?.captureId ? knowledgeCaptures.find((capture) => capture.id === selectedNode.captureId) || null : null;
  const selectedCategory = selectedNode?.categoryId ? atlasCategories.find((category) => category.id === selectedNode.categoryId) || null : null;
  const selectedCreatorSources = selectedNode?.type === "creator" && selectedNode.creator
    ? knowledgeCaptures.filter((capture) => capture.creator === selectedNode.creator)
    : [];
  const selectedCategoryCaptures = selectedCategory
    ? knowledgeCaptures.filter((capture) => selectedCategory.sourceIds.includes(capture.id))
    : [];
  const capturedAt = selectedCapture ? captureAsSource(selectedCapture).capturedAt : "";
  const selectedStructureSteps = selectedCapture?.structure?.split(/→|->/).map((step) => step.trim()).filter(Boolean) || [];
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
  const totalSources = atlasCategories.reduce((total, category) => total + category.sourceCount, 0);
  const creatorCount = graph.nodes.filter((node) => node.type === "creator").length;

  const endpointId = (endpoint: string | number | NodeObject<VaultNode> | undefined) => typeof endpoint === "object" ? String(endpoint.id) : String(endpoint ?? "");

  const resetGraph = useCallback(() => {
    setSelectedNodeId(null);
    graphRef.current?.zoomToFit(prefersReducedMotion ? 0 : 260, 150);
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
    const radius = (node.type === "category" ? 13 : node.type === "creator" ? 7.5 : 5) / scale;
    const alpha = !isQueryVisible ? .04 : isRelated ? 1 : .09;
    const labelVisible = node.type === "category" || node.type === "creator" || isHovered || isSelected;

    context.save();
    context.globalAlpha = alpha;
    context.shadowColor = node.accent;
    context.shadowBlur = isSelected || isHovered ? 22 : node.type === "category" ? 13 : 7;

    if (node.type === "category" || isSelected || isHovered) {
      context.beginPath();
      context.arc(node.x, node.y, radius + (isSelected ? 8 : 5) / scale, 0, Math.PI * 2);
      context.fillStyle = `${node.accent}22`;
      context.fill();
    }

    context.beginPath();
    context.arc(node.x, node.y, radius + (isSelected ? 2 / scale : 0), 0, Math.PI * 2);
    context.fillStyle = node.type === "reel" ? "#fffdf7" : node.accent;
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = (node.type === "reel" ? 2.2 : 1.8) / scale;
    context.strokeStyle = node.type === "reel" ? node.accent : "rgba(255,255,255,.94)";
    context.stroke();

    if (isSelected) {
      context.beginPath();
      context.arc(node.x, node.y, radius + 6 / scale, 0, Math.PI * 2);
      context.lineWidth = 1.2 / scale;
      context.strokeStyle = node.accent;
      context.stroke();
    }

    if (labelVisible) {
      const fontSize = (node.type === "category" ? 11 : 8.5) / scale;
      const label = node.label.length > 30 ? `${node.label.slice(0, 28)}…` : node.label;
      context.font = `${node.type === "category" ? 680 : 560} ${fontSize}px Inter, ui-sans-serif, sans-serif`;
      context.textBaseline = "middle";
      context.fillStyle = "#293b57";
      context.fillText(label, node.x + radius + 6 / scale, node.y - (node.type === "category" ? 3.5 / scale : 0));
      if (node.type === "category") {
        context.font = `${7.5 / scale}px Inter, ui-sans-serif, sans-serif`;
        context.fillStyle = "#8b929b";
        context.fillText(node.meta, node.x + radius + 6 / scale, node.y + 7.5 / scale);
      }
    }
    context.restore();
  }, [hoveredNodeId, neighborIds, query, queryMatches, selectedNodeId]);

  const paintNodePointer = useCallback((rawNode: NodeObject<VaultNode>, color: string, context: CanvasRenderingContext2D, globalScale: number) => {
    const node = rawNode as VaultNode;
    if (node.x === undefined || node.y === undefined) return;
    context.fillStyle = color;
    context.beginPath();
    context.arc(node.x, node.y, (node.type === "category" ? 20 : 13) / Math.max(.72, globalScale), 0, Math.PI * 2);
    context.fill();
  }, []);

  return (
    <div className="vault-page knowledge-vault-page">
      <div className={`vault-graph-workspace ${selectedNode && selectedNode.type !== "category" ? "note-open" : ""} ${selectedNode?.type === "category" ? "guide-open" : ""}`}>
        <aside className="map-library-panel">
          <div className="map-library-brand">
            <span className="map-brand-mark"><Link2 size={16} /></span>
            <div><strong>Second Brain</strong><small>Personal knowledge network</small></div>
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
          <div className="map-library-footer"><span><i /> Growing with every save</span><small>Spool map v1</small></div>
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
              <span><strong>{totalSources}</strong> saved Reels</span>
              <b />
              <span><strong>{creatorCount}</strong> creators</span>
            </div>
            <div className="force-graph-layer" aria-hidden="true">
              <ForceGraph2D<VaultNode, VaultLink>
                ref={graphRef}
                graphData={forceData}
                width={graphSize.width}
                height={graphSize.height}
                backgroundColor="#fffdf7"
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
                  const related = !selectedNodeId || sourceId === selectedNodeId || targetId === selectedNodeId;
                  if (!related) return "rgba(127,169,212,0.035)";
                  return link.kind === "category" ? "rgba(127,169,212,.36)" : `${link.accent}58`;
                }}
                linkWidth={(rawLink) => {
                  const link = rawLink as VaultLink;
                  const related = !selectedNodeId || endpointId(link.source) === selectedNodeId || endpointId(link.target) === selectedNodeId;
                  return related ? link.kind === "category" ? 1.3 : .95 : .4;
                }}
                linkCurvature={(rawLink) => (rawLink as VaultLink).curve}
                minZoom={.55}
                maxZoom={4.5}
                d3AlphaDecay={.028}
                d3VelocityDecay={.24}
                warmupTicks={prefersReducedMotion ? 160 : 64}
                cooldownTicks={prefersReducedMotion ? 1 : 180}
                onEngineStop={() => {
                  if (initialFitDone.current) return;
                  initialFitDone.current = true;
                  graphRef.current?.zoomToFit(prefersReducedMotion ? 0 : 420, 150);
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
              <span><i className="category" /> knowledge area</span><span><i className="reel" /> saved Reel</span><span><i className="creator" /> creator</span>
            </div>
            <div className="map-canvas-hint">Drag to move · Scroll to zoom · Select a memory</div>
            {selectedNode ? <button className="map-reset" onClick={resetGraph}><RefreshCw size={13} /> Reset focus</button> : null}
          </div>
        </section>

        {selectedNode && selectedNode.type !== "category" ? <article className="vault-note" style={{ "--node-accent": selectedAccent } as React.CSSProperties}>
          <header><span>{selectedCapture ? `${selectedCapture.title || "Saved Reel"}.md` : `${selectedNode.label}.md`}</span><button aria-label="Close note" onClick={resetGraph}><X size={15} /></button></header>
          <div className="vault-note-body">
            {selectedCapture ? <>
              <span className="vault-note-path">Knowledge / {selectedCategory?.name || "Other"}</span>
              <h2>{selectedCapture.title || "Saved Reel"}</h2>
              <div className="vault-note-tags"><span>{selectedCapture.creator || "Unknown creator"}</span><span>{selectedCategory?.name || "Other"}</span><span>{capturedAt}</span><span>{selectedCapture.platform || "Web"}</span></div>
              <h3>The idea</h3><p className="vault-note-lede">{selectedCapture.summary || "Spool is still reading this source."}</p>
              {selectedCapture.hook ? <div className="vault-hook"><small>Opening hook</small><p>“{selectedCapture.hook}”</p></div> : null}
              {selectedCapture.takeaways?.length ? <><h3>What it teaches</h3><ul className="vault-lesson-list">{selectedCapture.takeaways.map((takeaway) => <li key={takeaway}><Check size={11} /><span>{takeaway}</span></li>)}</ul></> : null}
              {selectedStructureSteps.length > 1 ? <><h3>How it unfolds</h3><ol className="vault-structure">{selectedStructureSteps.slice(0, 7).map((step, index) => <li key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol></> : null}
              {selectedCapture.action ? <div className="vault-try"><Feather size={13} /><span><strong>Try this</strong>{selectedCapture.action}</span></div> : null}
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
            <strong>{health?.transcriptionConfigured ? "Selective transcripts connected · Supadata" : "Selective transcripts are optional"}</strong>
            <p>{health?.transcriptionConfigured ? "Spool spends a credit only when you request a script." : "Connect Supadata to add spoken-word scripts only to the Reels worth studying."}</p>
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
  const [toast, setToast] = useState("");
  const [library, setLibrary] = useState<LibraryPayload>(emptyLibrary);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [contextCapture, setContextCapture] = useState<ApiCapture | null>(null);

  const refreshLibrary = async () => {
    const response = await fetch("/api/library");
    if (response.ok) setLibrary(await response.json() as LibraryPayload);
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
    fetch("/api/health")
      .then((response) => response.ok ? response.json() : null)
      .then((result: ApiHealth | null) => setHealth(result))
      .catch(() => undefined);
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

  const readyCount = useMemo(() => library.captures.filter((item) => item.status === "ready").length, [library.captures]);

  const handleCaptured = (capture: ApiCapture) => {
    setLibrary((current) => ({ ...current, captures: [capture, ...current.captures.filter((item) => item.id !== capture.id)] }));
    setToast("Saved. Spool is finding the useful part.");
  };

  const openThread = () => setActive("threads");

  const retryCapture = async (capture: ApiCapture) => {
    const response = await fetch(`/api/captures/${capture.id}/retry`, { method: "POST" });
    if (response.ok) {
      setToast("Re-reading that source with Claude.");
      await refreshLibrary();
    }
  };

  const addContext = async (sharedText: string) => {
    if (!contextCapture) return;
    const response = await fetch(`/api/captures/${contextCapture.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharedText, reprocess: true })
    });
    if (response.ok) {
      setContextCapture(null);
      setToast("Context added. Claude is rebuilding the note.");
      await refreshLibrary();
    }
  };

  const transcribeCapture = async (capture: ApiCapture) => {
    const response = await fetch(`/api/captures/${capture.id}/transcribe`, { method: "POST" });
    if (response.ok) {
      setToast("Transcript requested. This Reel is gaining an audio thread.");
      await refreshLibrary();
      return;
    }
    const failure = await response.json().catch(() => ({ error: "Transcript service unavailable" })) as { error?: string };
    setToast(failure.error || "Transcript service unavailable");
  };

  return (
    <div className="app-shell">
      <Sidebar active={active} onNavigate={setActive} onCapture={() => setCaptureOpen(true)} liveThreadCount={library.categories.length} liveScriptCount={library.captures.filter((capture) => capture.transcript?.trim() && capture.transcriptStatus === "ready").length} liveCreatorCount={Math.max(0, library.creators.length - library.creators.filter((live) => creators.some((seed) => seed.handle === live.creator)).length)} />
      <main className="main-shell">
        <Header active={active} onCapture={() => setCaptureOpen(true)} />
        <div className="mobile-brand"><SpoolMark /><span>spool</span><button aria-label="Open iPhone capture setup" onClick={() => setActive("setup")}><Menu size={19} /></button></div>
        {active === "briefing" ? <Briefing onNavigate={setActive} onOpenThread={openThread} library={library} onRetry={retryCapture} onAddContext={setContextCapture} onTranscribe={transcribeCapture} /> : null}
        {active === "threads" ? <ThreadsView library={library} onTranscribe={transcribeCapture} /> : null}
        {active === "scripts" ? <ScriptBankView library={library} /> : null}
        {active === "creators" ? <CreatorsView library={library} /> : null}
        {active === "setup" ? <SetupView onCapture={() => setCaptureOpen(true)} health={health} /> : null}
      </main>
      <MobileNav active={active} onNavigate={setActive} />
      {captureOpen ? <CaptureModal onClose={() => setCaptureOpen(false)} onCaptured={handleCaptured} /> : null}
      {contextCapture ? <ContextModal capture={contextCapture} onClose={() => setContextCapture(null)} onSave={addContext} /> : null}
      {toast ? <div className="toast"><Check size={16} /><span>{toast}</span>{readyCount ? <small>{readyCount} ready</small> : null}</div> : null}
    </div>
  );
}
