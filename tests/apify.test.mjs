import assert from "node:assert/strict";
import test from "node:test";
import { apifyAllowance, createApifyClient, instagramReelUrl, parseApifyTranscript } from "../lib/apify.mjs";

const url = "https://www.instagram.com/reel/Example123/?igsh=abc";
const user = { plan: { tier: "FREE", monthlyBasePriceUsd: 0, monthlyUsageCreditsUsd: 5 } };
const usage = { totalUsageCreditsUsdAfterVolumeDiscount: 0 };
function jobsMemory() {
  const records = new Map();
  return {
    get: async (key) => records.get(key),
    claim: async (key, value) => { if (records.has(key)) return false; records.set(key, value); return true; },
    save: async (key, value) => { records.set(key, value); }
  };
}
function fixture(overrides = {}) {
  const calls = [];
  const fetchImpl = async (target, options) => {
    const path = new URL(target).pathname;
    calls.push({ target, options });
    assert.equal(options.headers.Authorization, "Bearer test-secret");
    assert.ok(!target.includes("test-secret"));
    if (path === "/v2/users/me") return Response.json({ data: overrides.user ?? user });
    if (path.endsWith("/usage/monthly")) return Response.json({ data: overrides.usage ?? usage });
    if (options.method === "POST") {
      if (overrides.start) return overrides.start();
      return Response.json({ data: { id: "run1", status: "READY" } });
    }
    if (path.includes("/actor-runs/")) return Response.json({ data: { status: "SUCCEEDED", defaultDatasetId: "dataset1", usageTotalUsd: 0.015, ...overrides.run } });
    if (path.includes("/datasets/")) return Response.json(overrides.rows ?? [{ status: "transcribed", shortCode: "Example123", transcript: "The actual spoken words.", language: "English" }, { status: "_summary" }]);
    throw new Error(`Unexpected request: ${path}`);
  };
  return { client: createApifyClient({ fetchImpl }), calls, jobs: jobsMemory() };
}

test("Apify accepts only HTTPS Instagram Reel links, not arbitrary hosts or photo posts", () => {
  assert.equal(instagramReelUrl(url), "https://www.instagram.com/reel/Example123/");
  for (const value of ["https://instagram.com.evil/reel/a/", "http://instagram.com/reel/a/", "https://instagram.com/p/a/", "https://youtube.com/a", "broken"]) assert.equal(instagramReelUrl(value), null);
});

test("Apify allowance fails closed for paid plans, unknown data, or too little free credit", () => {
  assert.equal(apifyAllowance(user, usage).status, "available");
  assert.equal(apifyAllowance({ plan: { ...user.plan, tier: "STARTER", monthlyBasePriceUsd: 29 } }, usage).status, "paid-plan-blocked");
  assert.equal(apifyAllowance(user, { totalUsageCreditsUsdAfterVolumeDiscount: 4.96 }).status, "exhausted");
  for (const invalid of [{}, { totalUsageCreditsUsdAfterVolumeDiscount: NaN }, { totalUsageCreditsUsdAfterVolumeDiscount: -1 }]) assert.equal(apifyAllowance(user, invalid).status, "unknown");
});

test("Apify starts one bounded speech-only job, resumes it, and caches the transcript", async () => {
  const { client, calls, jobs } = fixture();
  const opts = { url, key: "test-secret", jobs };
  const first = await client.transcript(opts);
  assert.equal(first.pending, true);
  const post = calls.find((call) => call.options.method === "POST");
  const query = new URL(post.target).searchParams;
  assert.equal(query.get("maxTotalChargeUsd"), "0.05");
  assert.equal(query.get("forcePermissionLevel"), "LIMITED_PERMISSIONS");
  assert.equal(query.get("restartOnError"), "false");
  const input = JSON.parse(post.options.body);
  assert.equal(input.maxItems, 1);
  assert.equal(input.includeOnScreenText, false);
  assert.deepEqual(input.reelUrls, ["https://www.instagram.com/reel/Example123/"]);
  const result = await client.transcript(opts);
  assert.equal(result.transcript, "The actual spoken words.");
  assert.equal(result.provider, "apify");
  const count = calls.length;
  assert.deepEqual(await client.transcript(opts), result);
  assert.equal(calls.length, count);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
});

test("Apify unknown allowance or paid plan never starts a run", async () => {
  for (const overrides of [{ usage: {} }, { user: { plan: { ...user.plan, tier: "STARTER" } } }, { usage: { totalUsageCreditsUsdAfterVolumeDiscount: 5 } }]) {
    const { client, calls, jobs } = fixture(overrides);
    await assert.rejects(client.transcript({ url, key: "test-secret", jobs }));
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
  }
});

test("ambiguous starts stay locked across invocations and never repeat the POST", async () => {
  const { client, calls, jobs } = fixture({ start: () => { throw new Error("network test-secret"); } });
  for (let i = 0; i < 2; i++) await assert.rejects(client.transcript({ url, key: "test-secret", jobs }), (error) => !error.message.includes("test-secret"));
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
});

test("concurrent requests share a single durable start claim", async () => {
  const { client, calls, jobs } = fixture();
  await Promise.allSettled([client.transcript({ url, key: "test-secret", jobs }), client.transcript({ url, key: "test-secret", jobs })]);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
});

test("pending and failed runs do not automatically start replacement jobs", async () => {
  for (const status of ["RUNNING", "FAILED", "TIMED-OUT"]) {
    const { client, calls, jobs } = fixture({ run: { status } });
    await client.transcript({ url, key: "test-secret", jobs });
    if (status === "RUNNING") assert.equal((await client.transcript({ url, key: "test-secret", jobs })).pending, true);
    else await assert.rejects(client.transcript({ url, key: "test-secret", jobs }));
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
  }
});

test("captions, visual text, receipts, and mismatched Reels cannot become a spoken script", () => {
  for (const row of [{ status: "image_text_extracted", transcript: "photo words" }, { status: "_summary", transcript: "receipt" }, { status: "transcribed", shortCode: "OTHER", transcript: "other Reel" }, { status: "source_unavailable", caption: "caption only" }]) assert.throws(() => parseApifyTranscript([row], url));
});

test("account errors hide tokens and redacted exports are never sent to Apify", async () => {
  let calls = 0;
  const client = createApifyClient({ fetchImpl: async () => { calls++; return Response.json({ error: { message: "test-secret" } }, { status: 401 }); } });
  assert.equal((await client.account("[SENSITIVE]")).status, "missing");
  assert.equal(calls, 0);
  const account = await client.account("test-secret");
  assert.equal(account.status, "invalid");
  assert.ok(!JSON.stringify(account).includes("test-secret"));
});
