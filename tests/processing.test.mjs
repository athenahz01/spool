import assert from "node:assert/strict";
import test from "node:test";
import { safeText, transcriptFailure, canAutoRetryAnalysis, createTranscriptAccountReader, supadataErrorMessage } from "../lib/processing.mjs";

test("provider errors never echo the configured credential", () => {
  assert.doesNotMatch(supadataErrorMessage({ details: "Invalid API key secret-test" }, 401, "secret-test"), /secret-test/);
  assert.doesNotMatch(supadataErrorMessage({ details: "key=secret-test" }, 500, "secret-test"), /secret-test/);
  assert.match(supadataErrorMessage({ message: "Limit Exceeded", details: "Monthly quota" }, 429), /Monthly quota/);
});

test("provider text preserves emoji and removes malformed UTF-16", () => {
  assert.equal(safeText("Hello 🌞"), "Hello 🌞");
  assert.equal(safeText("x\ud800y\udc00z"), "x�y�z");
  assert.equal(safeText("a🌞z", 2), "a");
  assert.equal(safeText("a🌞z", 3), "a🌞");
  assert.ok(safeText(JSON.parse('"\\ud800"')).isWellFormed());
});

test("generic limits do not falsely claim monthly credits are exhausted", () => {
  assert.match(transcriptFailure("Limit Exceeded").summary, /usage or request limit/);
  assert.equal(transcriptFailure("No spoken words were detected").topic, "No speech detected");
  assert.equal(transcriptFailure("timeout").topic, "Transcript unavailable");
});

test("permanent provider errors do not automatically spend on repeated analysis", () => {
  const failed = { status: "failed", provider: "anthropic", recoveryCount: 0 };
  for (const error of ["400 invalid high surrogate", "401 authentication error", "credit balance too low", "quota exceeded"]) {
    assert.equal(canAutoRetryAnalysis({ ...failed, error }), false);
  }
  assert.equal(canAutoRetryAnalysis({ ...failed, error: "503 temporarily unavailable" }), true);
  assert.equal(canAutoRetryAnalysis({ ...failed, recoveryCount: 2 }), false);
});

test("account status is read-only, cached, and exposes no account identifiers", async () => {
  let calls = 0;
  let time = 0;
  const reader = createTranscriptAccountReader({ now: () => time, fetchImpl: async (url) => {
    calls++;
    assert.equal(url, "https://api.supadata.ai/v1/me");
    return Response.json({ organizationId: "private", plan: "Free", usedCredits: calls === 1 ? 100 : 20, maxCredits: 100 });
  } });
  const [first, duplicate] = await Promise.all([reader("key"), reader("key")]);
  assert.equal(calls, 1);
  assert.equal(first.status, "exhausted");
  assert.deepEqual(duplicate, first);
  assert.equal(first.organizationId, undefined);
  assert.equal((await reader("key")).remainingCredits, 0);
  time = 61_000;
  assert.equal((await reader("key")).remainingCredits, 80);
  assert.equal(calls, 2);
});

test("unknown account responses do not become zero-credit failures", async () => {
  for (const fetchImpl of [async () => { throw new Error("offline"); }, async () => Response.json({}), async () => new Response("", { status: 429 })]) {
    assert.equal((await createTranscriptAccountReader({ fetchImpl })("key")).status, "unknown");
  }
  const reader = createTranscriptAccountReader({ fetchImpl: async () => new Response("", { status: 401 }) });
  assert.equal((await reader("key")).status, "invalid");
  assert.equal((await reader("")).status, "missing");
});
