import { neon } from '@neondatabase/serverless';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Generation claims and the budget are durable across Vercel instances.
export function createStudioStore({ databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL, file = fileURLToPath(new URL('../data/studio.json', import.meta.url)), vercel = Boolean(process.env.VERCEL) } = {}) {
  const sql = databaseUrl ? neon(databaseUrl) : null;
  let ready;
  let localQueue = Promise.resolve();
  async function ensure() {
    if (!sql) {
      if (vercel) throw new Error('Content Studio needs the connected database before it can save drafts or spend credits.');
      return;
    }
    ready ??= Promise.all([
      sql`CREATE TABLE IF NOT EXISTS spool_studio_records (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      sql`CREATE TABLE IF NOT EXISTS spool_studio_budget (day TEXT PRIMARY KEY, used INTEGER NOT NULL)`
    ]).catch((error) => { ready = undefined; throw error; });
    await ready;
  }
  function local(action, write = false) {
    const task = localQueue.then(async () => {
      await ensure();
      let state;
      try { state = JSON.parse(await readFile(file, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; state = { records: {}, budget: {} }; }
      const result = action(state);
      if (write) {
        await mkdir(dirname(file), { recursive: true });
        const tmp = `${file}.${crypto.randomUUID()}.tmp`;
        await writeFile(tmp, JSON.stringify(state), 'utf8');
        await rename(tmp, file);
      }
      return result;
    });
    localQueue = task.catch(() => {});
    return task;
  }
  return {
    async list() {
      if (!sql) return local((state) => Object.values(state.records));
      await ensure();
      return (await sql`SELECT data FROM spool_studio_records ORDER BY updated_at DESC LIMIT 1000`).map((row) => row.data);
    },
    async get(id) {
      if (!sql) return local((state) => state.records[id] || null);
      await ensure();
      return (await sql`SELECT data FROM spool_studio_records WHERE id = ${id}`)[0]?.data || null;
    },
    async put(id, data) {
      if (!sql) return local((state) => { state.records[id] = data; }, true);
      await ensure();
      await sql`INSERT INTO spool_studio_records (id, data) VALUES (${id}, ${JSON.stringify(data)}::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
    },
    async claim(id, data) {
      if (!sql) return local((state) => { if (state.records[id]) return false; state.records[id] = data; return true; }, true);
      await ensure();
      return (await sql`INSERT INTO spool_studio_records (id, data) VALUES (${id}, ${JSON.stringify(data)}::jsonb) ON CONFLICT DO NOTHING RETURNING id`).length > 0;
    },
    async reserve(day, limit) {
      if (!sql) return local((state) => { if ((state.budget[day] || 0) >= limit) return false; state.budget[day] = (state.budget[day] || 0) + 1; return true; }, true);
      await ensure();
      return (await sql`INSERT INTO spool_studio_budget (day, used) VALUES (${day}, 1) ON CONFLICT (day) DO UPDATE SET used = spool_studio_budget.used + 1 WHERE spool_studio_budget.used < ${limit} RETURNING used`).length > 0;
    },
    async releaseUnspent(id) {
      if (!sql) return local((state) => { if (state.records[id]?.status === 'pending') delete state.records[id]; }, true);
      await ensure();
      await sql`DELETE FROM spool_studio_records WHERE id = ${id} AND data->>'status' = 'pending'`;
    },
    async used(day) {
      if (!sql) return local((state) => state.budget[day] || 0);
      await ensure();
      return Number((await sql`SELECT used FROM spool_studio_budget WHERE day = ${day}`)[0]?.used || 0);
    }
  };
}
