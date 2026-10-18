import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../src/index.ts";
import {
  apexHostRedirect,
  canonicalRedirect,
  legacyRedirect,
  shouldServeNotFound,
} from "../src/routes.ts";

const home = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const about = readFileSync(new URL("../public/about/index.html", import.meta.url), "utf8");
const missing = readFileSync(new URL("../public/404.html", import.meta.url), "utf8");
const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
const llms = readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8");
const favicon = readFileSync(new URL("../public/favicon.ico", import.meta.url));

function jsonLd(html) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(html))) blocks.push(JSON.parse(match[1]));
  return blocks;
}

function graphNodes(html) {
  return jsonLd(html).flatMap((block) => block["@graph"] ?? [block]);
}

function visibleHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "");
}

function assertLeaves(html, label) {
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
      assert.equal(open?.tag, closing, `${label}: mismatched </${closing}>`);
      continue;
    }
    const tag = match[2].toLowerCase();
    const attrs = match[3] || "";
    const selfClosing = Boolean(match[4]) || voidTags.has(tag);
    if (/\sdata-en(?:=|\s|>)/.test(attrs)) {
      const parent = stack.findLast((item) => item.hasEn);
      assert.equal(parent, undefined, `${label}: <${tag}> with data-en is nested in <${parent?.tag}>`);
    }
    if (!selfClosing) stack.push({ tag, hasEn: /\sdata-en=/.test(attrs) });
  }
  assert.equal(stack.length, 0, `${label}: unclosed tags`);
}

test("canonical tags point at the final 200 URLs", () => {
  assert.match(home, /<link rel="canonical" href="https:\/\/orangecloud\.vn\/"\s*\/>/);
  assert.match(about, /<link rel="canonical" href="https:\/\/orangecloud\.vn\/about\/"\s*\/>/);
  assert.doesNotMatch(missing, /rel="canonical"/);
  assert.match(missing, /name="robots" content="noindex"/);
});

test("person and website JSON-LD use stable ids and omit employment", () => {
  for (const html of [home, about]) {
    const nodes = graphNodes(html);
    const person = nodes.find((node) => node["@type"] === "Person");
    const website = nodes.find((node) => node["@type"] === "WebSite" && node["@id"]);
    assert.equal(person["@id"], "https://orangecloud.vn/#person");
    assert.equal(person.name, "Cường Lê Sỹ");
    assert.deepEqual(person.sameAs, ["https://github.com/sycu8"]);
    assert.equal(person.url, "https://orangecloud.vn/about/");
    assert.equal(website["@id"], "https://orangecloud.vn/#website");
    assert.equal(website.author["@id"], "https://orangecloud.vn/#person");
    assert.equal(website.publisher["@id"], "https://orangecloud.vn/#person");
    const encoded = JSON.stringify(nodes);
    assert.doesNotMatch(encoded, /worksFor|jobTitle|affiliation|employee|Territory Account Executive/i);
    assert.match(encoded, /not affiliated with Cloudflare, Inc\./i);
  }
  const profile = graphNodes(about).find((node) => node["@type"] === "ProfilePage");
  assert.equal(profile.url, "https://orangecloud.vn/about/");
  assert.equal(profile.mainEntity["@id"], "https://orangecloud.vn/#person");
  assert.equal(profile.isPartOf["@id"], "https://orangecloud.vn/#website");
});

test("visible disclaimer is on the homepage, about page, and 404", () => {
  for (const html of [home, about, missing]) {
    const visible = visibleHtml(html);
    assert.match(visible, /Dự án cá nhân/);
    assert.match(visible, /không phải ấn phẩm của Cloudflare, Inc\./i);
    assert.match(visible, /Không liên kết với Cloudflare, Inc\.|Not affiliated with Cloudflare, Inc\./);
  }
  assert.doesNotMatch(visibleHtml(home), /twitter:site/);
  assert.doesNotMatch(visibleHtml(about), /twitter:site/);
  assert.doesNotMatch(home, /twitter:site" content="@cloudflare"|content="@cloudflare"/);
  assert.doesNotMatch(about, /content="@cloudflare"/);
});

test("about page uses on-site facts and is listed in the sitemap", () => {
  assert.match(about, /GitHub @sycu8/);
  assert.match(about, /Sycule/);
  assert.match(about, /https:\/\/github\.com\/sycu8\/orange-cloud-vn/);
  assert.match(about, /https:\/\/buymeacoffee\.com\/sycule/);
  assert.match(about, /blog\.orangecloud\.vn/);
  assert.doesNotMatch(about, /hello@orangecloud\.vn/);
  assert.doesNotMatch(about, /linkedin\.com/);
  assert.match(sitemap, /<loc>https:\/\/orangecloud\.vn\/about\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/orangecloud\.vn\/<\/loc>/);
  assertLeaves(about, "about");
});

test("llms.txt, robots.txt, and favicon follow the apex audit", () => {
  assert.match(llms, /# Orange Cloud/);
  assert.match(llms, /https:\/\/orangecloud\.vn\/about\//);
  assert.match(llms, /https:\/\/github\.com\/sycu8\)/);
  assert.match(llms, /Not a publication of Cloudflare, Inc\./);
  assert.doesNotMatch(llms, /Territory Account Executive|worksFor/);
  assert.match(robots, /Content-Signal: ai-train=no, search=yes, ai-input=yes/);
  assert.match(robots, /Sitemap: https:\/\/orangecloud\.vn\/sitemap\.xml/);
  assert.match(robots, /Sitemap: https:\/\/blog\.orangecloud\.vn\/sitemap\.xml/);
  assert.equal(favicon.subarray(0, 4).toString("hex"), "00000100");
  assert.ok(favicon.includes(Buffer.from("PNG")));
});

test("legacy and canonical redirects match the apex map", () => {
  const republished = [
    "how-to-configure-cloudflare-full-dns",
    "how-to-configure-cloudflare-partial-dns",
    "how-to-configure-cloudflare-ssl-tls",
  ];
  for (const slug of republished) {
    const target = `https://blog.orangecloud.vn/posts/${slug}`;
    assert.equal(legacyRedirect(`/posts/${slug}`, ""), target);
    assert.equal(legacyRedirect(`/posts/${slug}/`, ""), target);
  }
  assert.equal(
    legacyRedirect("/posts/how-to-configure-cloudflare-full-dns/", "?x=1"),
    "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-full-dns?x=1",
  );
  assert.equal(
    legacyRedirect("/posts/project-glasswing-mythos-ai-security", ""),
    "https://blog.orangecloud.vn/posts/cloudflare-ai-triage-bug-bounty-sonnet-58-month-mythos-200k-advice-not-to-copy",
  );
  assert.equal(
    legacyRedirect("/posts/project-glasswing-mythos-ai-security/", ""),
    "https://blog.orangecloud.vn/posts/cloudflare-ai-triage-bug-bounty-sonnet-58-month-mythos-200k-advice-not-to-copy",
  );
  assert.equal(legacyRedirect("/posts/", ""), "https://blog.orangecloud.vn/");
  assert.equal(legacyRedirect("/rss.xml", ""), "https://blog.orangecloud.vn/feed.xml");
  assert.equal(legacyRedirect("/sitemap-index.xml", ""), "https://orangecloud.vn/sitemap.xml");
  assert.equal(legacyRedirect("/tags/ssl/", "?q=1"), "https://onboarding.orangecloud.vn/blog/");
  assert.equal(legacyRedirect("/about/", ""), undefined);
  assert.equal(canonicalRedirect("/index.html", "?x=1"), "https://orangecloud.vn/?x=1");
  assert.equal(canonicalRedirect("/about", ""), "https://orangecloud.vn/about/");
  assert.equal(canonicalRedirect("/about/", ""), undefined);
  assert.equal(
    apexHostRedirect(new URL("https://www.orangecloud.vn/about/?x=1")),
    "https://orangecloud.vn/about/?x=1",
  );
  assert.equal(shouldServeNotFound("/nope", 200, "text/html"), true);
  assert.equal(shouldServeNotFound("/about/", 200, "text/html; charset=utf-8"), false);
  assert.equal(shouldServeNotFound("/", 200, "text/html"), false);
  assert.equal(shouldServeNotFound("/404.html", 200, "text/html"), true);
  assert.equal(shouldServeNotFound("/missing", 404, "text/plain"), true);
});

function assetEnv(softHtml) {
  const files = new Map([
    ["/", "<!doctype html><title>home</title>"],
    ["/index.html", "<!doctype html><title>home</title>"],
    ["/about/index.html", "<!doctype html><title>about</title>"],
    ["/404.html", "<!doctype html><title>missing</title>"],
    ["/llms.txt", "# Orange Cloud\n"],
    ["/favicon.ico", "ico"],
  ]);
  return {
    ASSETS: {
      async fetch(input) {
        const url = input instanceof URL ? input : new URL(input instanceof Request ? input.url : input);
        if (softHtml && url.pathname === "/this-page-does-not-exist-xyz") {
          return new Response(files.get("/"), {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        const path = url.pathname === "/" ? "/" : url.pathname;
        const key = path.endsWith("/") ? `${path}index.html` : path;
        const body = files.get(path) ?? files.get(key);
        if (body) {
          const type = key.endsWith(".html") || path === "/"
            ? "text/html"
            : key.endsWith(".txt")
              ? "text/plain; charset=utf-8"
              : "application/octet-stream";
          return new Response(body, { status: 200, headers: { "content-type": type } });
        }
        return new Response("missing", { status: 404, headers: { "content-type": "text/plain" } });
      },
    },
  };
}

test("unknown paths return a real 404 and canonical aliases redirect", async () => {
  const env = assetEnv(true);
  const unknown = await worker.fetch(new Request("https://orangecloud.vn/this-page-does-not-exist-xyz"), env);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get("x-robots-tag"), "noindex");
  assert.match(unknown.headers.get("content-type"), /text\/html;\s*charset=utf-8/i);
  assert.match(await unknown.text(), /missing/);

  const direct404 = await worker.fetch(new Request("https://orangecloud.vn/404.html"), env);
  assert.equal(direct404.status, 404);

  const homeRes = await worker.fetch(new Request("https://orangecloud.vn/"), env);
  assert.equal(homeRes.status, 200);
  assert.match(homeRes.headers.get("content-type"), /text\/html;\s*charset=utf-8/i);

  const aboutRes = await worker.fetch(new Request("https://orangecloud.vn/about/"), env);
  assert.equal(aboutRes.status, 200);
  assert.match(await aboutRes.text(), /about/);

  const indexRedirect = await worker.fetch(new Request("https://orangecloud.vn/index.html"), env);
  assert.equal(indexRedirect.status, 301);
  assert.equal(indexRedirect.headers.get("location"), "https://orangecloud.vn/");

  const aboutRedirect = await worker.fetch(new Request("https://orangecloud.vn/about"), env);
  assert.equal(aboutRedirect.status, 301);
  assert.equal(aboutRedirect.headers.get("location"), "https://orangecloud.vn/about/");

  const www = await worker.fetch(new Request("https://www.orangecloud.vn/about/?x=1"), env);
  assert.equal(www.status, 301);
  assert.equal(www.headers.get("location"), "https://orangecloud.vn/about/?x=1");

  const legacy = await worker.fetch(
    new Request("https://orangecloud.vn/posts/how-to-configure-cloudflare-ssl-tls/"),
    env,
  );
  assert.equal(legacy.status, 301);
  assert.equal(
    legacy.headers.get("location"),
    "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-ssl-tls",
  );

  const head = await worker.fetch(new Request("https://orangecloud.vn/no-such", { method: "HEAD" }), env);
  assert.equal(head.status, 404);
  assert.equal(await head.text(), "");

  const llmsRes = await worker.fetch(new Request("https://orangecloud.vn/llms.txt"), env);
  assert.equal(llmsRes.status, 200);
  assert.match(await llmsRes.text(), /Orange Cloud/);
});
