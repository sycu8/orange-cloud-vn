import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("worker hardens transport headers only on https", () => {
  assert.match(worker, /url\.protocol === "https:"/);
  assert.match(worker, /upgrade-insecure-requests/);
  assert.match(worker, /strict-transport-security/);
  assert.match(worker, /script-src-attr 'none'/);
});

test("worker rejects unsafe methods on health and assets", () => {
  assert.match(worker, /Method Not Allowed/);
  assert.match(worker, /TRACE/);
  assert.match(worker, /method !== "GET" && method !== "HEAD"/);
});

test("worker sanitizes logged paths", () => {
  assert.match(worker, /safePath/);
  assert.match(worker, /slice\(0, 200\)/);
});

test("client language and hash handling stay conservative", () => {
  assert.match(app, /lang === "en" \? "en" : "vi"/);
  assert.match(app, /slice\(0, 120\)/);
  assert.match(app, /\^\[A-Za-z\]\[\\w:-\]\*\$/);
  assert.doesNotMatch(app, /innerHTML|document\.write|eval\(/);
});

test("theme toggle only stores light or dark", () => {
  assert.match(app, /theme === "light" \? "light" : "dark"/);
  assert.match(app, /localStorage\.setItem\("oc-theme"/);
});
