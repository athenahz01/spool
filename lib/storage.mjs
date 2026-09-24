import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(projectRoot, "data");
const capturesFile = join(dataDir, "captures.json");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const sql = databaseUrl ? neon(databaseUrl) : null;
let databaseReady;

async function ensureDatabase() {
  if (!sql) return;
  databaseReady ??= sql`
    CREATE TABLE IF NOT EXISTS spool_captures (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await databaseReady;
}

async function ensureLocalFile() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(capturesFile)) await writeFile(capturesFile, "[]\n", "utf8");
}

async function readLocalCaptures() {
  await ensureLocalFile();
  try {
    return JSON.parse(await readFile(capturesFile, "utf8"));
  } catch {
    return [];
  }
}

async function writeLocalCaptures(captures) {
  await ensureLocalFile();
  const temporaryFile = join(dataDir, `captures-${crypto.randomUUID()}.tmp`);
  await writeFile(temporaryFile, `${JSON.stringify(captures.slice(0, 1000), null, 2)}\n`, "utf8");
  await rename(temporaryFile, capturesFile);
}

export function storageMode() {
  return sql ? "postgres" : "local-json";
}

export async function readCaptures() {
  if (!sql) return readLocalCaptures();
  await ensureDatabase();
  const rows = await sql`
    SELECT data
    FROM spool_captures
    ORDER BY captured_at DESC
    LIMIT 1000
  `;
  return rows.map((row) => row.data);
}

export async function findCapture(id) {
  if (!sql) return (await readLocalCaptures()).find((capture) => capture.id === id) || null;
  await ensureDatabase();
  const rows = await sql`SELECT data FROM spool_captures WHERE id = ${id} LIMIT 1`;
  return rows[0]?.data || null;
}

export async function upsertCapture(capture) {
  if (!sql) {
    const captures = await readLocalCaptures();
    const index = captures.findIndex((item) => item.id === capture.id);
    if (index >= 0) captures[index] = capture;
    else captures.unshift(capture);
    await writeLocalCaptures(captures);
    return capture;
  }
  await ensureDatabase();
  const capturedAt = capture.capturedAt || new Date().toISOString();
  await sql`
    INSERT INTO spool_captures (id, data, captured_at, updated_at)
    VALUES (${capture.id}, ${JSON.stringify(capture)}::jsonb, ${capturedAt}, NOW())
    ON CONFLICT (id) DO UPDATE
    SET data = EXCLUDED.data, captured_at = EXCLUDED.captured_at, updated_at = NOW()
  `;
  return capture;
}

export async function importCaptures(captures) {
  for (const capture of captures) await upsertCapture(capture);
}

// Separate durable records keep paid-job starts safe from capture JSON overwrites.
let transcriptJobsReady;
async function ensureTranscriptJobs() {
  if (!sql) throw new Error("Apify fallback needs the connected database to prevent duplicate jobs.");
  transcriptJobsReady ??= sql`CREATE TABLE IF NOT EXISTS spool_transcript_jobs (id TEXT PRIMARY KEY, data JSONB NOT NULL)`;
  await transcriptJobsReady;
}
export const transcriptJobs = {
  async get(id) {
    await ensureTranscriptJobs();
    const rows = await sql`SELECT data FROM spool_transcript_jobs WHERE id = ${id}`;
    return rows[0]?.data || null;
  },
  async claim(id, data) {
    await ensureTranscriptJobs();
    const rows = await sql`INSERT INTO spool_transcript_jobs (id, data) VALUES (${id}, ${JSON.stringify(data)}::jsonb) ON CONFLICT DO NOTHING RETURNING id`;
    return rows.length > 0;
  },
  async save(id, data) {
    await ensureTranscriptJobs();
    await sql`UPDATE spool_transcript_jobs SET data = ${JSON.stringify(data)}::jsonb WHERE id = ${id}`;
  },
  async resetFailed(id) {
    await ensureTranscriptJobs();
    // Only an explicit user retry may start over, and only a confirmed failure.
    await sql`DELETE FROM spool_transcript_jobs WHERE id = ${id} AND data->>'state' = 'failed'`;
  }
};
