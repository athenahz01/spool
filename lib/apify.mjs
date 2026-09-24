import { safeText } from "./processing.mjs";

export const APIFY_ACTOR = "steadyfetch~instagram-reel-transcript-scraper";
export const APIFY_RUN_CAP_USD = 0.05;

export function instagramReelUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/^(www\.)?instagram\.com$/i.test(url.hostname)) return null;
    // Photo posts are deliberately excluded: this fallback only transcribes speech.
    const match = url.pathname.match(/^\/(?:reel|reels|tv)\/([\w-]+)\/?$/);
    return match ? `https://www.instagram.com/reel/${match[1]}/` : null;
  } catch { return null; }
}

export function apifyAllowance(user, usage) {
  const plan = user?.plan;
  if (!plan || typeof plan.monthlyBasePriceUsd !== "number") return { status: "unknown" };
  if (plan.tier !== "FREE" || plan.monthlyBasePriceUsd !== 0) return { status: "paid-plan-blocked" };
  const used = usage?.totalUsageCreditsUsdAfterVolumeDiscount;
  const included = plan.monthlyUsageCreditsUsd;
  if (![used, included].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) return { status: "unknown" };
  const maxCreditsUsd = Math.min(5, included);
  const remainingCreditsUsd = Math.max(0, maxCreditsUsd - used);
  return { status: remainingCreditsUsd >= APIFY_RUN_CAP_USD ? "available" : "exhausted", maxCreditsUsd, usedCreditsUsd: used, remainingCreditsUsd };
}

export function apifyUnavailableMessage(account) {
  if (account.status === "missing") return "Apify is not connected. Add APIFY_API_TOKEN in Vercel.";
  if (account.status === "invalid") return "Apify rejected the token or its permissions. Check the connection in Vercel.";
  if (account.status === "paid-plan-blocked") return "Apify fallback is paused: Spool only runs it on the Free plan to avoid paid usage.";
  if (account.status === "exhausted") return "Apify free allowance is used up or below the per-Reel safety cap. Wait for the monthly reset or add context.";
  return "Spool could not verify Apify's free allowance. Recheck the connection before retrying.";
}

export function parseApifyTranscript(rows, sourceUrl) {
  const shortcode = instagramReelUrl(sourceUrl)?.split("/")[4];
  const items = Array.isArray(rows) ? rows.filter((row) => row && row.status !== "_summary" && !row._summary) : [];
  const row = items.find((item) => item.status === "transcribed" && typeof item.transcript === "string" && item.transcript.trim());
  if (!row) {
    const status = items.find((item) => item.status)?.status || "empty_result";
    if (/no_speech|no_audio|silent/.test(status)) throw new Error("No spoken words were detected in this video.");
    throw new Error(`Apify could not return spoken words (${safeText(status, 80)}). The Reel stays saved; add context or try again later.`);
  }
  const returnedCode = row.shortCode || (row.postUrl && instagramReelUrl(row.postUrl)?.split("/")[4]);
  if (returnedCode && returnedCode !== shortcode) throw new Error("Apify returned a different Reel. Spool did not save that transcript.");
  return { transcript: safeText(row.transcript.trim(), 40_000), language: safeText(row.language || "", 60), provider: "apify" };
}

// No key in URLs, no echoed provider error bodies, and no automatic POST retries.
export function createApifyClient({ fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
  let cache;
  let cacheKey;
  let cachedAt = 0;
  async function request(path, key, options = {}, timeoutMs = 10_000) {
    let response;
    try {
      response = await fetchImpl(`https://api.apify.com/v2${path}`, {
        ...options, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch { throw new Error("Apify could not be reached. Any existing job is kept so it won't be started twice."); }
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403
        ? apifyUnavailableMessage({ status: "invalid" })
        : `Apify request failed (${response.status}). Recheck the connection or try again later.`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  async function account(key, fresh = false) {
    if (!key || key === "[SENSITIVE]") return { status: "missing" };
    if (!fresh && cacheKey === key && cache && now() - cachedAt < 30_000) return cache;
    let result;
    try {
      const [user, usage] = await Promise.all([
        request("/users/me", key, {}, 6_000), request("/users/me/usage/monthly", key, {}, 6_000)
      ]);
      result = apifyAllowance(user.data, usage.data);
    } catch (error) { result = { status: [401, 403].includes(error.status) ? "invalid" : "unknown" }; }
    cacheKey = key; cachedAt = now();
    cache = { ...result, checkedAt: new Date(now()).toISOString() };
    return cache;
  }
  async function transcript({ url, key, jobs, onJobStarted = async () => {} }) {
    const canonical = instagramReelUrl(url);
    if (!canonical) throw new Error("Apify fallback supports Instagram Reel links only. Add the Reel's spoken words as context for other links.");
    const jobKey = `apify:${canonical.split("/")[4]}`;
    let saved = await jobs.get(jobKey);
    if (saved?.result) return saved.result;
    if (saved?.error) throw new Error(saved.error);
    let run;
    if (!saved?.runId) {
      const allowance = await account(key, true);
      if (allowance.status !== "available") throw new Error(apifyUnavailableMessage(allowance));
      // Durable unique claim: concurrent invocations and an ambiguous start response
      // must never create a second charged run for the same Reel.
      const claimed = await jobs.claim(jobKey, { state: "starting", startedAt: new Date(now()).toISOString() });
      if (!claimed) {
        saved = await jobs.get(jobKey);
        if (saved?.runId) return { pending: true, jobId: saved.runId, provider: "apify" };
        throw new Error("An Apify start is awaiting confirmation. Spool has paused this Reel to avoid a duplicate charge; check its run in Apify.");
      }
      try {
        const query = new URLSearchParams({ maxTotalChargeUsd: String(APIFY_RUN_CAP_USD), timeout: "180", restartOnError: "false", forcePermissionLevel: "LIMITED_PERMISSIONS" });
        run = (await request(`/acts/${APIFY_ACTOR}/runs?${query}`, key, {
          method: "POST", body: JSON.stringify({ reelUrls: [canonical], includeOnScreenText: false, maxItems: 1, maxRunSeconds: 150 })
        }, 12_000)).data;
        if (!run?.id) throw new Error("Apify did not confirm the run. Spool paused this Reel to avoid a duplicate charge.");
        await jobs.save(jobKey, { state: "running", runId: run.id });
        await onJobStarted(run.id);
        return { pending: true, jobId: run.id, provider: "apify" };
      } catch (error) {
        // A definite 4xx rejection created no run. Network/5xx uncertainty stays locked.
        if (error.status >= 400 && error.status < 500) await jobs.save(jobKey, { state: "failed", error: error.message });
        throw error;
      }
    }
    await onJobStarted(saved.runId);
    run = (await request(`/actor-runs/${encodeURIComponent(saved.runId)}?waitForFinish=20`, key, {}, 25_000)).data;
    if (!["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"].includes(run?.status)) return { pending: true, jobId: saved.runId, provider: "apify" };
    if (run.status !== "SUCCEEDED") {
      const error = `Apify stopped this Reel (${run.status.toLowerCase()}). Your save is safe. Retry it later or add context.`;
      await jobs.save(jobKey, { ...saved, state: "failed", error });
      throw new Error(error);
    }
    if (!run.defaultDatasetId) throw new Error("Apify finished without a transcript dataset. The existing run is kept for another check.");
    const rows = await request(`/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&limit=5`, key);
    let result;
    // usageTotalUsd can exclude actor event fees. Do not present it as the
    // transcript price; the account allowance is the complete billing measure.
    try { result = { ...parseApifyTranscript(rows, canonical), jobId: saved.runId }; }
    catch (error) { await jobs.save(jobKey, { ...saved, state: "failed", error: error.message }); throw error; }
    await jobs.save(jobKey, { ...saved, state: "ready", result });
    return result;
  }
  return { account, transcript };
}
