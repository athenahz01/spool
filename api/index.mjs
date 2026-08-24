import { waitUntil } from "@vercel/functions";
import { handleApi } from "../server.mjs";

export default async function handler(req, res) {
  const url = new URL(req.url || "/api", `https://${req.headers.host || "localhost"}`);
  try {
    return await handleApi(req, res, url.pathname, waitUntil);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }));
  }
}
