/**
 * Shared counter for `wrangler dev`. The Worker's simulated rate-limit binding
 * is per isolate, so browser clicks can miss the 5/minute cap. This process is
 * loopback-only and stores nothing but timestamps. Production does not use it.
 */
import { createServer } from "node:http";

const WINDOW_MS = 60_000;
const buckets = new Map();

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/consume") {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("missing");
    return;
  }
  const key = url.searchParams.get("key") ?? "";
  const limit = Number(url.searchParams.get("limit"));
  if (!/^[\w:._-]{1,80}$/.test(key) || !Number.isInteger(limit) || limit < 1 || limit > 20) {
    response.writeHead(400, { "content-type": "text/plain" });
    response.end("bad");
    return;
  }
  const now = Date.now();
  const stamps = (buckets.get(key) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  if (stamps.length >= limit) {
    buckets.set(key, stamps);
    response.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
    response.end("deny");
    return;
  }
  stamps.push(now);
  buckets.set(key, stamps);
  response.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
  response.end("allow");
});

server.listen(8791, "127.0.0.1", () => {
  console.log("local edge-check limiter on http://127.0.0.1:8791");
});
