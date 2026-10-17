import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

const repos = [
  "https://github.com/sycu8/Orange-Cloud-One-Man-Company",
  "https://github.com/sycu8/hr-management-platform",
  "https://github.com/sycu8/pregnancy-meal-plan",
  "https://github.com/sycu8/cloudflare-onboarding-journey",
  "https://github.com/sycu8/Orange-Cloud-Launch",
  "https://github.com/sycu8/poker-face",
  "https://github.com/sycu8/Orange-Cloud-Insights",
  "https://github.com/sycu8/world-cup-intelligence",
  "https://github.com/sycu8/Cloudflare-Go-Live-Readiness",
  "https://github.com/sycu8/reputation",
  "https://github.com/sycu8/live-long-40-",
  "https://github.com/sycu8/bhxh-hr-assistant",
  "https://github.com/sycu8/Cloudflare-Case-Helpr",
  "https://github.com/sycu8/stock-news-cloudflare-workers-do-r2",
];

test("every requested repository is linked", () => {
  for (const repo of repos) {
    assert.ok(html.includes(repo), `missing ${repo}`);
  }
});

test("legal notice and personal-capacity language are present in both languages", () => {
  assert.match(html, /Đây không phải ấn phẩm của Cloudflare, Inc\./);
  assert.match(html, /This is not a publication of Cloudflare, Inc\./);
  assert.match(html, /Không dùng hình ảnh chính thức/);
  assert.match(html, /tư cách cá nhân/);
  assert.match(html, /nominative|only to describe technology/i);
});

test("buy me a coffee banner points at the requested page", () => {
  assert.match(html, /https:\/\/buymeacoffee\.com\/sycule/);
  assert.match(html, /cdn\.buymeacoffee\.com\/buttons\/v2\/default-yellow\.png/);
});

test("the page does not embed Cloudflare brand image assets", () => {
  assert.doesNotMatch(html, /cdnjs\.cloudflare\.com|www\.cloudflare\.com\/.*logo|developers\.cloudflare\.com\/.*logo/i);
});

test("worker sets a content security policy and a personal health payload", () => {
  assert.match(worker, /content-security-policy/);
  assert.match(worker, /affiliatedWithCloudflareInc: false/);
  assert.match(css, /Be Vietnam Pro/);
});

test("translatable nodes are leaves, so language switching cannot wipe children", () => {
  const voidTags = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
  ]);
  const stack = [];
  const token = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)>|<([a-zA-Z0-9]+)(\s[^>]*?)?(\/)?>/g;
  let match;
  while ((match = token.exec(html))) {
    if (match[0].startsWith("<!--")) continue;
    if (match[1]) {
      const closing = match[1].toLowerCase();
      const open = stack.pop();
      assert.equal(open?.tag, closing, `mismatched </${closing}> after <${open?.tag}>`);
      continue;
    }
    const tag = match[2].toLowerCase();
    const attrs = match[3] || "";
    const selfClosing = Boolean(match[4]) || voidTags.has(tag);
    if (/\sdata-en(?:=|\s|>)/.test(attrs) || attrs.endsWith(" data-en")) {
      const parent = stack.findLast((item) => item.hasEn);
      assert.equal(parent, undefined, `<${tag}> with data-en is nested in <${parent?.tag}>`);
    }
    if (!selfClosing) {
      stack.push({ tag, hasEn: /\sdata-en=/.test(attrs) });
    }
  }
  assert.equal(stack.length, 0, `unclosed tags: ${stack.map((item) => item.tag).join(", ")}`);
});
