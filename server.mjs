import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { findCapture, readCaptures, storageMode, upsertCapture } from "./lib/storage.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(root, "dist");
const port = Number(process.env.PORT || 8787);

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
      const detail = payload?.message || payload?.error || `Supadata returned ${response.status}`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
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
    if (jobId) await onJobStarted(jobId, credits);
  }
  if (result.status === 202 || jobId) {
    if (!jobId) throw new Error("Supadata started a transcript without returning a job ID.");
    const deadline = Date.now() + 44_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      result = await fetchSupadata(`/v1/transcript/${encodeURIComponent(jobId)}`, 12_000);
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
      content: `Analyze this saved source.\nURL: ${capture.url}\nCreator hint: ${instagramContext?.creator || capture.creator || "Unknown"}\nShared text: ${suppliedContext}`
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
      if (capture.transcriptStatus === "failed") {
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
    capture.status = "needs-context";
    capture.topic = /no spoken words/i.test(capture.transcriptError) ? "No speech detected" : "Transcript unavailable";
    capture.summary = /no spoken words/i.test(capture.transcriptError)
      ? "This Reel has no detectable spoken words, so there is no script to add to the bank. The Reel remains saved."
      : "The Reel is saved, but its spoken words could not be transcribed. Retry the transcript to continue.";
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
    const recoverableAnalysis = capture.status === "failed" && capture.provider === "anthropic" && recoveryCount < 2;
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

function buildLibrary(captures) {
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

      const categoryGroup = byCategory.get(capture.contentCategory) || [];
      categoryGroup.push(capture);
      byCategory.set(capture.contentCategory, categoryGroup);
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

  return { captures, threads, creators, categories };
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
      transcriptionConfigured: Boolean(process.env.SUPADATA_API_KEY)
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
      if (body.reprocess === true) schedule(processCapture(capture.id, previousReadyCapture, origin));
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
