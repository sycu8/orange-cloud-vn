import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../src/index.ts";
import { PERSON_SAME_AS, PROJECT_PAGES } from "../src/project-catalog.ts";
import { renderProjectPage } from "../src/render-project-page.ts";
import {
  apexHostRedirect,
  canonicalRedirect,
  indexablePaths,
  legacyRedirect,
  lookupAssetPath,
  lookupHostRedirect,
  shouldServeNotFound,
} from "../src/routes.ts";

const home = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const about = readFileSync(new URL("../public/about/index.html", import.meta.url), "utf8");
const statusPage = readFileSync(new URL("../public/status/index.html", import.meta.url), "utf8");
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

function typeNames(node) {
  const value = node["@type"];
  return Array.isArray(value) ? value : [value];
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

test("homepage declares vi and en hreflang and a bilingual FAQ", () => {
  assert.match(home, /<link rel="alternate" hreflang="vi" href="https:\/\/orangecloud\.vn\/"\s*\/>/);
  assert.match(home, /<link rel="alternate" hreflang="en" href="https:\/\/orangecloud\.vn\/"\s*\/>/);
  assert.match(home, /<link rel="alternate" hreflang="x-default" href="https:\/\/orangecloud\.vn\/"\s*\/>/);
  assert.match(about, /hreflang="vi"/);
  assert.match(about, /hreflang="en"/);
  assert.match(statusPage, /hreflang="en"/);
  const faq = graphNodes(home).find((node) => typeNames(node).includes("FAQPage"));
  assert.equal(faq["@id"], "https://orangecloud.vn/#faq");
  const questions = faq.mainEntity.map((item) => item.name);
  assert.ok(questions.includes("Orange Cloud là gì?"));
  assert.ok(questions.includes("What is Orange Cloud?"));
  assert.match(home, /id="faq"/);
  assert.match(home, /https:\/\/orangecloud\.vn\//);
  assert.match(home, /https:\/\/firetrace\.orangecloud\.vn\//);
  assert.match(home, /https:\/\/home\.orangecloud\.vn\//);
  assert.match(home, /https:\/\/pregnancymeal\.tips\//);
  assert.match(home, /https:\/\/onboarding\.orangecloud\.vn/);
  assert.match(home, /https:\/\/reputation\.orangecloud\.vn/);
  assert.doesNotMatch(home, /wildfire-map/);
  const firetrace = readFileSync(new URL("../public/projects/firetrace/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(firetrace, /wildfire-map|github\.com\/sycu8\/wildfire/);
  assert.doesNotMatch(firetrace, /href="https:\/\/github\.com/);
});

test("each project has a hub page in the sitemap", () => {
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(wrangler, /"workers_dev": false/);
  assert.match(wrangler, /"preview_urls": false/);
  for (const page of PROJECT_PAGES) {
    const path = `/projects/${page.slug}/`;
    const html = readFileSync(new URL(`../public${path}index.html`, import.meta.url), "utf8");
    assert.equal(html, renderProjectPage(page), page.slug);
    assert.ok(sitemap.includes(`<loc>https://orangecloud.vn${path}</loc>`), path);
    assert.ok(sitemap.includes(`hreflang="en" href="https://orangecloud.vn${path}"`), path);
    assert.equal(shouldServeNotFound(path, 200, "text/html; charset=utf-8"), false);
    assert.equal(canonicalRedirect(`/projects/${page.slug}`, ""), `https://orangecloud.vn${path}`);
    assert.doesNotMatch(html, /wildfire-map|admin_sessions/);
    assertLeaves(html, page.slug);
    assert.ok(home.includes(`href="${path}"`), path);
  }
  for (const path of indexablePaths()) {
    const loc = `https://orangecloud.vn${path === "/" ? "/" : path}`;
    assert.ok(sitemap.includes(`<loc>${loc}</loc>`), loc);
  }
});

test("canonical tags point at the final 200 URLs", () => {
  assert.match(home, /<link rel="canonical" href="https:\/\/orangecloud\.vn\/"\s*\/>/);
  assert.match(about, /<link rel="canonical" href="https:\/\/orangecloud\.vn\/about\/"\s*\/>/);
  assert.match(statusPage, /<link rel="canonical" href="https:\/\/orangecloud\.vn\/status\/"\s*\/>/);
  assert.doesNotMatch(missing, /rel="canonical"/);
  assert.match(missing, /name="robots" content="noindex"/);
});

test("person and website JSON-LD use stable ids and omit employment", () => {
  for (const html of [home, about]) {
    const nodes = graphNodes(html);
    const person = nodes.find((node) => typeNames(node).includes("Person"));
    const website = nodes.find((node) => typeNames(node).includes("WebSite") && node["@id"]);
    assert.ok(typeNames(person).includes("Organization"));
    assert.equal(person["@id"], "https://orangecloud.vn/#person");
    assert.equal(person.name, "Cường Lê Sỹ");
    assert.deepEqual(person.sameAs, [...PERSON_SAME_AS]);
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

test("visible disclaimer is on the homepage, about page, status page, and 404", () => {
  for (const html of [home, about, statusPage, missing]) {
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
  assert.match(about, /https:\/\/www\.linkedin\.com\/in\/sycule\//);
  assert.doesNotMatch(about, /linkedin\.com\/company/);
  assert.match(sitemap, /<loc>https:\/\/orangecloud\.vn\/about\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/orangecloud\.vn\/status\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/orangecloud\.vn\/<\/loc>/);
  assertLeaves(about, "about");
  assertLeaves(statusPage, "status");
});

test("open graph banner is a same-origin png and the tags do not name a twitter site", () => {
  const png = readFileSync(new URL("../public/og.png", import.meta.url));
  const template = readFileSync(new URL("../design/og.html", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length < 300 * 1024, `og.png is ${png.length} bytes`);
  assert.match(template, /Showcase cá nhân trên Cloudflare Developer Platform\./);
  assert.match(template, /Không máy chủ tự vận hành\./);
  assert.match(template, /orangecloud\.vn/);
  assert.match(template, /be-vietnam-pro-700-vi\.woff2/);
  assert.doesNotMatch(template, /cloudflare\.com\/.*logo|cdnjs\.cloudflare\.com/i);
  for (const html of [home, about]) {
    assert.match(html, /property="og:image" content="https:\/\/orangecloud\.vn\/og\.png\?v=1"/);
    assert.match(html, /property="og:image:type" content="image\/png"/);
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
    assert.match(html, /property="og:image:alt" content="Orange Cloud — Showcase cá nhân trên Cloudflare Developer Platform\. Không máy chủ tự vận hành\."/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:image" content="https:\/\/orangecloud\.vn\/og\.png\?v=1"/);
    assert.doesNotMatch(html, /twitter:site/);
  }
  assert.match(worker, /img-src 'self'/);
});

test("llms.txt, robots.txt, and favicon follow the apex audit", () => {
  assert.match(llms, /# Orange Cloud/);
  assert.match(llms, /https:\/\/orangecloud\.vn\/about\//);
  assert.match(llms, /https:\/\/orangecloud\.vn\/status\//);
  assert.match(llms, /https:\/\/github\.com\/sycu8\)/);
  assert.match(llms, /Not a publication of Cloudflare, Inc\./);
  assert.doesNotMatch(llms, /Territory Account Executive|worksFor/);
  assert.match(robots, /Content-Signal: ai-train=no, search=yes, ai-input=yes/);
  assert.match(robots, /Sitemap: https:\/\/orangecloud\.vn\/sitemap\.xml/);
  assert.match(robots, /Sitemap: https:\/\/blog\.orangecloud\.vn\/sitemap\.xml/);
  assert.match(robots, /Sitemap: https:\/\/onboarding\.orangecloud\.vn\/sitemap-index\.xml/);
  assert.match(robots, /Sitemap: https:\/\/firetrace\.orangecloud\.vn\/sitemap\.xml/);
  assert.match(robots, /Sitemap: https:\/\/reputation\.orangecloud\.vn\/sitemap\.xml/);
  assert.match(robots, /Sitemap: https:\/\/pregnancymeal\.tips\/sitemap\.xml/);
  assert.match(robots, /Sitemap: https:\/\/stocknews\.orangecloud\.vn\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Sitemap: https:\/\/home\.orangecloud\.vn\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Sitemap: https:\/\/hrm\.orangecloud\.vn\/sitemap\.xml/);
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
  assert.equal(canonicalRedirect("/status", ""), "https://orangecloud.vn/status/");
  assert.equal(canonicalRedirect("/status/", ""), undefined);
  assert.equal(
    apexHostRedirect(new URL("https://www.orangecloud.vn/about/?x=1")),
    "https://orangecloud.vn/about/?x=1",
  );
  assert.equal(lookupHostRedirect(new URL("https://lookup.orangecloud.vn/")), undefined);
  assert.equal(lookupHostRedirect(new URL("https://lookup.orangecloud.vn/index.html")), undefined);
  assert.equal(
    lookupHostRedirect(new URL("https://lookup.orangecloud.vn/tools/edge-coverage/?domain=vidu.com")),
    "https://lookup.orangecloud.vn/?domain=vidu.com",
  );
  assert.equal(
    lookupHostRedirect(new URL("https://lookup.orangecloud.vn/about/")),
    "https://orangecloud.vn/about/",
  );
  assert.equal(lookupHostRedirect(new URL("https://lookup.orangecloud.vn/edge-check.js")), undefined);
  assert.equal(lookupHostRedirect(new URL("https://lookup.orangecloud.vn/api/edge-check")), undefined);
  assert.equal(lookupHostRedirect(new URL("https://orangecloud.vn/")), undefined);
  assert.equal(
    lookupAssetPath(new URL("https://lookup.orangecloud.vn/")),
    "/tools/edge-coverage/",
  );
  assert.equal(
    lookupAssetPath(new URL("https://lookup.orangecloud.vn/index.html")),
    "/tools/edge-coverage/",
  );
  assert.equal(lookupAssetPath(new URL("https://lookup.orangecloud.vn/about/")), undefined);
  assert.equal(lookupAssetPath(new URL("https://orangecloud.vn/")), undefined);
  assert.equal(shouldServeNotFound("/nope", 200, "text/html"), true);
  assert.equal(shouldServeNotFound("/about/", 200, "text/html; charset=utf-8"), false);
  assert.equal(shouldServeNotFound("/status/", 200, "text/html; charset=utf-8"), false);
  assert.equal(shouldServeNotFound("/", 200, "text/html"), false);
  assert.equal(shouldServeNotFound("/404.html", 200, "text/html"), true);
  assert.equal(shouldServeNotFound("/missing", 404, "text/plain"), true);
});

function assetEnv(softHtml) {
  const files = new Map([
    ["/", "<!doctype html><title>home</title>"],
    ["/index.html", "<!doctype html><title>home</title>"],
    ["/about/index.html", "<!doctype html><title>about</title>"],
    ["/tools/edge-coverage/index.html", "<!doctype html><title>edge</title>"],
    ["/edge-check.js", "check();"],
    ["/styles.css", "body{}"],
    ["/status/index.html", "<!doctype html><title>status</title>"],
    ["/404.html", "<!doctype html><title>missing</title>"],
    ["/llms.txt", "# Orange Cloud\n"],
    ["/favicon.ico", "ico"],
    ["/og.png", readFileSync(new URL("../public/og.png", import.meta.url))],
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
              : key.endsWith(".png")
                ? "image/png"
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

  const statusRes = await worker.fetch(new Request("https://orangecloud.vn/status/"), env);
  assert.equal(statusRes.status, 200);
  assert.match(await statusRes.text(), /status/);

  const statusRedirect = await worker.fetch(new Request("https://orangecloud.vn/status"), env);
  assert.equal(statusRedirect.status, 301);
  assert.equal(statusRedirect.headers.get("location"), "https://orangecloud.vn/status/");

  const lookupHome = await worker.fetch(new Request("https://lookup.orangecloud.vn/"), env);
  assert.equal(lookupHome.status, 200);
  assert.match(await lookupHome.text(), /edge/);
  assert.equal(lookupHome.headers.get("x-robots-tag"), "noindex");

  const lookupIndex = await worker.fetch(new Request("https://lookup.orangecloud.vn/index.html"), env);
  assert.equal(lookupIndex.status, 200);
  assert.match(await lookupIndex.text(), /edge/);

  const lookupTool = await worker.fetch(
    new Request("https://lookup.orangecloud.vn/tools/edge-coverage/?domain=vidu.com"),
    env,
  );
  assert.equal(lookupTool.status, 301);
  assert.equal(lookupTool.headers.get("location"), "https://lookup.orangecloud.vn/?domain=vidu.com");

  const lookupAbout = await worker.fetch(new Request("https://lookup.orangecloud.vn/about/"), env);
  assert.equal(lookupAbout.status, 301);
  assert.equal(lookupAbout.headers.get("location"), "https://orangecloud.vn/about/");

  const lookupScript = await worker.fetch(new Request("https://lookup.orangecloud.vn/edge-check.js"), env);
  assert.equal(lookupScript.status, 200);
  assert.match(await lookupScript.text(), /check\(\)/);
  assert.equal(lookupScript.headers.get("x-robots-tag"), null);

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

  const workersDev = await worker.fetch(new Request("https://orange-cloud-vn.sycu-lee.workers.dev/"), env);
  assert.equal(workersDev.status, 200);
  assert.equal(workersDev.headers.get("x-robots-tag"), "noindex");

  const preview = await worker.fetch(
    new Request("https://abc.orange-cloud-vn.sycu-lee.workers.dev/about/"),
    env,
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("x-robots-tag"), "noindex");

  const apexAbout = await worker.fetch(new Request("https://orangecloud.vn/about/"), env);
  assert.equal(apexAbout.headers.get("x-robots-tag"), null);

  const og = await worker.fetch(new Request("https://orangecloud.vn/og.png?v=1"), env);
  assert.equal(og.status, 200);
  assert.match(og.headers.get("content-type"), /^image\/png\b/i);
  assert.match(og.headers.get("content-security-policy"), /img-src 'self'/);
  assert.equal(og.headers.get("x-content-type-options"), "nosniff");
  const bytes = new Uint8Array(await og.arrayBuffer());
  assert.equal(Buffer.from(bytes.subarray(0, 8)).toString("hex"), "89504e470d0a1a0a");
});
