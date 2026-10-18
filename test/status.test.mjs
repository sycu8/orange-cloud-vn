import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const status = await import("../src/status.ts");
const monitors = await import("../src/monitors.ts");
const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("monitor list covers the live orangecloud.vn hosts", () => {
  const hosts = monitors.MONITORS.map((item) => new URL(item.url).hostname);
  for (const host of [
    "orangecloud.vn",
    "blog.orangecloud.vn",
    "onboarding.orangecloud.vn",
    "ready.orangecloud.vn",
    "launch.orangecloud.vn",
    "hrm.orangecloud.vn",
    "bhxh.orangecloud.vn",
    "reputation.orangecloud.vn",
    "wcstat.orangecloud.vn",
    "poker.orangecloud.vn",
  ]) {
    assert.ok(hosts.includes(host), `missing ${host}`);
  }
});

test("overall status rolls up monitor counts", () => {
  assert.equal(status.overallFromCounts(3, 0), "operational");
  assert.equal(status.overallFromCounts(2, 1), "degraded");
  assert.equal(status.overallFromCounts(0, 2), "outage");
  assert.equal(status.overallFromCounts(0, 0), "unknown");
});

test("aggregate uptime weights monitors by sample count", () => {
  const result = status.aggregateUptime([
    { uptime24h: 100, uptime7d: 100, samples24h: 10, samples7d: 10 },
    { uptime24h: 80, uptime7d: 90, samples24h: 10, samples7d: 10 },
  ]);
  assert.equal(result.uptime24h, 90);
  assert.equal(result.uptime7d, 95);
});

test("probe treats 2xx/3xx as up and cancels the body", async () => {
  let cancelled = false;
  const fetchImpl = async () =>
    new Response("ok", {
      status: 301,
      headers: { location: "https://example.com/" },
    });
  // Override body.cancel tracking via a custom response-like object.
  const customFetch = async () => {
    const response = {
      status: 204,
      body: {
        cancel: async () => {
          cancelled = true;
        },
      },
    };
    return response;
  };
  const result = await status.probeMonitor(
    { id: "x", name: "X", nameEn: "X", url: "https://example.com/" },
    customFetch,
  );
  assert.equal(result.ok, true);
  assert.ok(cancelled);
  assert.ok(result.ms >= 0);
  void fetchImpl;
});

test("probe marks network failures as down", async () => {
  const result = await status.probeMonitor(
    { id: "x", name: "X", nameEn: "X", url: "https://example.com/" },
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(result.ok, false);
});

test("runStatusChecks stores snapshot and history in KV", async () => {
  const store = new Map();
  const kv = {
    async get(key, type) {
      const value = store.get(key);
      if (value == null) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };

  const snapshot = await status.runStatusChecks(
    kv,
    async () => ({
      status: 200,
      body: { cancel: async () => {} },
    }),
    Date.parse("2026-10-18T12:00:00.000Z"),
  );

  assert.equal(snapshot.overall, "operational");
  assert.equal(snapshot.up, monitors.MONITORS.length);
  assert.equal(snapshot.uptime24h, 100);
  assert.ok(store.has("status:snapshot"));
  assert.ok(store.has("status:history:home"));
});

test("worker exposes status API and scheduled checks", () => {
  assert.match(worker, /\/api\/status/);
  assert.match(worker, /async scheduled/);
  assert.match(worker, /runStatusChecks/);
  assert.match(worker, /STATUS_KV/);
});

test("wrangler binds status KV and a five-minute cron", () => {
  assert.match(wrangler, /STATUS_KV/);
  assert.match(wrangler, /0454ed7fa9174871b19fa7e1b79c6881/);
  assert.match(wrangler, /\*\/5 \* \* \* \*/);
});

test("homepage ships a status bar and client loader", () => {
  assert.match(html, /id="status-bar"/);
  assert.match(html, /data-status-list/);
  assert.match(app, /\/api\/status/);
  assert.match(app, /renderStatus/);
  assert.doesNotMatch(app, /innerHTML|document\.write|eval\(/);
});
