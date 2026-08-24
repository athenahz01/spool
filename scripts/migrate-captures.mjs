import { readFile } from "node:fs/promises";
import { importCaptures, storageMode } from "../lib/storage.mjs";

if (storageMode() !== "postgres") {
  throw new Error("Set DATABASE_URL before importing captures.");
}

const captures = JSON.parse(await readFile(new URL("../data/captures.json", import.meta.url), "utf8"));
await importCaptures(captures);
console.log(`Imported ${captures.length} existing capture${captures.length === 1 ? "" : "s"}.`);
