// Normalize broken UTF-16 from scraped captions before sending JSON to providers.
export function safeText(value, limit = Infinity) {
  const text = String(value ?? "").toWellFormed();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  return /[\uD800-\uDBFF]$/.test(clipped) ? clipped.slice(0, -1) : clipped;
}

export function isTranscriptLimit(error) {
  return /limit[ -]exceeded|quota|insufficient credits|allowance is used up/i.test(String(error || ""));
}

export function supadataErrorMessage(payload, status, key = "") {
  if (status === 401 || status === 403) return "Supadata rejected the API key. Check the server connection before retrying.";
  const message = [payload?.message || payload?.error, payload?.details]
    .filter(Boolean).map((value) => typeof value === "string" ? value : JSON.stringify(value)).join(": ")
    || `Supadata returned ${status}`;
  return safeText(key ? message.replaceAll(key, "[redacted]") : message, 600);
}

export function transcriptFailure(error) {
  const message = String(error || "");
  if (/no spoken words/i.test(message)) return {
    topic: "No speech detected",
    summary: "This Reel has no detectable spoken words. It stays saved, but there is no spoken script to extract."
  };
  if (isTranscriptLimit(message)) return {
    topic: "Transcript limit reached",
    summary: "This Reel is saved. Supadata has reached a usage or request limit. Check your allowance before retrying, or add the useful text as context."
  };
  return {
    topic: "Transcript unavailable",
    summary: "The Reel is saved, but its spoken words could not be transcribed. Retry the transcript or add context."
  };
}

export function canAutoRetryAnalysis(capture) {
  return capture.status === "failed" && capture.provider === "anthropic"
    && Number(capture.recoveryCount || 0) < 2
    && !/401|403|400|authentication|invalid.request|credit balance|billing|quota/i.test(capture.error || "");
}

// Account checks never request a transcript. Cache them to avoid health polling
// competing with transcript requests for the provider's rate limit.
export function createTranscriptAccountReader({ fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
  let cached;
  let cachedKey;
  let expiresAt = 0;
  let pending;
  return async function readAccount(key) {
    if (!key) return { status: "missing" };
    if (cachedKey === key && cached && now() < expiresAt) return cached;
    if (cachedKey === key && pending) return pending;
    cachedKey = key;
    pending = (async () => {
      let result;
      try {
        const response = await fetchImpl("https://api.supadata.ai/v1/me", {
          headers: { "x-api-key": key }, signal: AbortSignal.timeout(6000)
        });
        if (!response.ok) result = { status: response.status === 401 ? "invalid" : "unknown" };
        else {
          const payload = await response.json();
          const { maxCredits, usedCredits } = payload;
          result = typeof maxCredits === "number" && typeof usedCredits === "number" && Number.isFinite(maxCredits) && Number.isFinite(usedCredits)
            ? { status: usedCredits >= maxCredits ? "exhausted" : "available", maxCredits, usedCredits, remainingCredits: Math.max(0, maxCredits - usedCredits) }
            : { status: "unknown" };
        }
      } catch { result = { status: "unknown" }; }
      cached = { ...result, checkedAt: new Date(now()).toISOString() };
      expiresAt = now() + (result.status === "unknown" ? 15_000 : 60_000);
      return cached;
    })();
    try { return await pending; }
    finally { pending = undefined; }
  };
}
