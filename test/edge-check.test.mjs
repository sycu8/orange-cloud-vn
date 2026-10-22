import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../src/index.ts";
import { isCloudflareIp, isPublicIp } from "../src/cloudflare-ips.ts";
import {
  EMPTY_DOMAIN_MESSAGE,
  INVALID_DOMAIN_MESSAGE,
  RATE_LIMIT_MESSAGE,
  buildRecommendations,
  classifyHost,
  enforceRateLimit,
  handleEdgeCheck,
  handleEdgeContact,
  resetLocalRateLimitForTests,
  classifySetup,
  extraHostsForDomain,
  hostsForDomain,
  inspectDomain,
  MAX_DNS_HOSTS,
  MAX_HTTP_PROBES,
  normalizeDomain,
  normalizeTarget,
  parseCertificateNames,
  providerFromCname,
  providerFromHeaders,
} from "../src/edge-check.ts";
import { comparePropagation, extractPageResources, parseDnsAnswers, ptrQueryName } from "../src/dns-view.ts";
import {
  cdnNameFromAsn,
  cymruQueryName,
  networkFromCymru,
  networkFromIpwho,
  parseCymruTxt,
  providerNameFromAsn,
} from "../src/network-provider.ts";
import { canonicalRedirect, shouldServeNotFound } from "../src/routes.ts";

const page = readFileSync(new URL("../public/tools/edge-coverage/index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../public/edge-check.js", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

function headers(values) {
  return new Headers(values);
}

function domainOf(input) {
  const result = normalizeDomain(input);
  assert.equal("error" in result, false, input);
  return result.domain;
}

test("domain normalization strips scheme, path, and port and rejects SSRF-ish hosts", () => {
  assert.equal(domainOf("https://Example.COM:8443/path?q=1"), "example.com");
  assert.equal(domainOf("example.com/docs"), "example.com");
  assert.equal(domainOf("http://münchen.de/"), "xn--mnchen-3ya.de");
  assert.equal(domainOf("https://www.xn--mnchen-3ya.de."), "www.xn--mnchen-3ya.de");

  for (const input of [
    "",
    "   ",
    "localhost",
    "http://localhost/admin",
    "foo.localhost",
    "printer.local",
    "db.internal",
    "metadata.google.internal",
    "app.corp",
    "nas.home",
    "share.lan",
    "box.localdomain",
    "wiki.intranet",
    "secret.private",
    "in-addr.arpa",
    "gone.invalid",
    "127.0.0.1",
    "http://127.0.0.1/latest/meta-data",
    "http://[::1]/",
    "10.0.0.1",
    "192.168.0.5",
    "169.254.169.254",
    "http://user:pass@example.com/",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "com",
    "http://0x7f000001/",
    "not a domain",
    `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.example`,
  ]) {
    const result = normalizeDomain(input);
    assert.equal("error" in result, true, input);
    assert.equal(result.error, input.trim() ? INVALID_DOMAIN_MESSAGE : EMPTY_DOMAIN_MESSAGE);
  }
});

test("host list is capped at the twelve expected names", () => {
  const hosts = hostsForDomain("example.com");
  assert.equal(hosts.length, 12);
  assert.deepEqual(
    hosts.map((item) => item.host),
    [
      "example.com",
      "www.example.com",
      "api.example.com",
      "cdn.example.com",
      "app.example.com",
      "static.example.com",
      "assets.example.com",
      "img.example.com",
      "mail.example.com",
      "shop.example.com",
      "m.example.com",
      "blog.example.com",
    ],
  );
});

test("cloudflare published ranges match proxy addresses and not the resolver", () => {
  assert.equal(isCloudflareIp("104.16.1.1"), true);
  assert.equal(isCloudflareIp("172.64.1.1"), true);
  assert.equal(isCloudflareIp("1.1.1.1"), false);
  assert.equal(isCloudflareIp("93.184.216.34"), false);
  assert.equal(isCloudflareIp("2606:4700::1"), true);
  assert.equal(isCloudflareIp("2001:4860:4860::8888"), false);
  assert.equal(isPublicIp("104.16.1.1"), true);
  assert.equal(isPublicIp("10.1.2.3"), false);
  assert.equal(isPublicIp("169.254.169.254"), false);
  assert.equal(isPublicIp("127.0.0.1"), false);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(isPublicIp("fd00::1"), false);
});

test("cname and header signals classify the expected provider", () => {
  assert.equal(providerFromCname("example.com.cdn.cloudflare.net."), "cloudflare");
  assert.equal(providerFromCname("shop.pages.dev"), "cloudflare");
  assert.equal(providerFromCname("api.workers.dev"), "cloudflare");
  assert.equal(providerFromCname("d111111abcdef8.cloudfront.net"), "cloudfront");
  assert.equal(providerFromCname("dualstack.example.fastly.net"), "fastly");
  assert.equal(providerFromCname("example.edgekey.net"), "akamai");
  assert.equal(providerFromCname("app.azurefd.net"), "azure");
  assert.equal(providerFromCname("site.ghs.googlehosted.com"), "google");
  assert.equal(providerFromCname("cname.vercel-dns.com"), "vercel");
  assert.equal(providerFromCname("site.netlify.app"), "netlify");
  assert.equal(providerFromCname("img.b-cdn.net"), "bunny");
  assert.equal(providerFromCname("img.kunlunsl.com"), "byteplus");
  assert.equal(providerFromCname("foo.w.cdngslb.com"), "alibaba");
  assert.equal(providerFromCname("bar.cdn.cdntip.com"), "tencent");
  assert.equal(providerFromCname("origin.example.net"), null);
  assert.equal(providerFromCname("notcloudflare.net"), null);
  assert.equal(providerFromCname("assets.akamaihd.net"), "akamai");
  assert.equal(providerFromCname("elb.amazonaws.com"), "aws");
  assert.equal(providerFromCname("app.awsglobalaccelerator.com"), "aws");
  assert.equal(providerFromCname("app.azurewebsites.net"), "azurehost");
  assert.equal(providerFromCname("edge.trafficmanager.net"), "azurehost");
  assert.equal(providerFromCname("gateway.zscaler.net"), "zscaler");
  assert.equal(providerFromCname("example.incapdns.net"), "imperva");
  assert.equal(providerFromCname("example.sucuri.net"), "sucuri");
  assert.equal(providerFromCname("notzscaler.com"), null);

  assert.equal(providerFromHeaders(headers({ "cf-ray": "abc-SIN", server: "cloudflare" })), "cloudflare");
  assert.equal(
    providerFromHeaders(headers({ "cf-ray": "abc-PDX", server: "cloudflare", "x-served-by": "cache-sjc" })),
    "fastly",
  );
  assert.equal(providerFromHeaders(headers({ "x-amz-cf-id": "id", "x-amz-cf-pop": "SIN" })), "cloudfront");
  assert.equal(providerFromHeaders(headers({ via: "1.1 varnish" })), "fastly");
  assert.equal(providerFromHeaders(headers({ "x-fastly-request-id": "req" })), "fastly");
  assert.equal(providerFromHeaders(headers({ server: "AkamaiGHost" })), "akamai");
  assert.equal(providerFromHeaders(headers({ "x-akamai-request-id": "1" })), "akamai");
  assert.equal(providerFromHeaders(headers({ "x-azure-ref": "ref" })), "azure");
  assert.equal(providerFromHeaders(headers({ "x-vercel-id": "id" })), "vercel");
  assert.equal(providerFromHeaders(headers({ "x-nf-request-id": "id" })), "netlify");
  assert.equal(providerFromHeaders(headers({ server: "BunnyCDN-HI1-927" })), "bunny");
  assert.equal(providerFromHeaders(headers({ "x-sucuri-id": "1" })), "sucuri");
  assert.equal(providerFromHeaders(headers({ "x-iinfo": "1" })), "imperva");
  assert.equal(providerFromHeaders(headers({ server: "Zscaler" })), "zscaler");
});

test("classification prefers headers, then cname, then cloudflare addresses", () => {
  const proxied = classifyHost({
    role: "apex",
    host: "example.com",
    records: { cname: [], a: ["104.16.1.1"], aaaa: ["2606:4700::1"] },
    headers: headers({ "cf-ray": "abc-SIN", server: "cloudflare" }),
    notes: [],
  });
  assert.equal(proxied.status, "cloudflare");
  assert.equal(proxied.provider, "Cloudflare");
  assert.equal(proxied.originExposed, false);
  assert.ok(proxied.evidence.some((item) => item.startsWith("header:cf-ray=")));

  const other = classifyHost({
    role: "cdn",
    host: "cdn.example.com",
    records: { cname: ["d111.cloudfront.net"], a: ["13.32.0.1"], aaaa: [] },
    headers: null,
    notes: [],
  });
  assert.equal(other.status, "other_cdn");
  assert.equal(other.provider, "Amazon CloudFront");
  assert.equal(other.originExposed, false);

  const direct = classifyHost({
    role: "api",
    host: "api.example.com",
    records: { cname: [], a: ["93.184.216.34"], aaaa: [] },
    headers: null,
    notes: [],
  });
  assert.equal(direct.status, "direct");
  assert.equal(direct.provider, null);
  assert.equal(direct.originExposed, true);
  assert.ok(direct.evidence.includes("origin_ip_public"));

  const missing = classifyHost({
    role: "blog",
    host: "blog.example.com",
    records: { cname: [], a: [], aaaa: [] },
    headers: null,
    notes: ["probe_skipped:no_record"],
  });
  assert.equal(missing.status, "no_record");
  assert.equal(missing.originExposed, false);

  const headerWins = classifyHost({
    role: "www",
    host: "www.example.com",
    records: { cname: ["d111.cloudfront.net"], a: [], aaaa: [] },
    headers: headers({ "cf-ray": "zzz-HAN", server: "cloudflare" }),
    notes: [],
  });
  assert.equal(headerWins.status, "other_cdn");
  assert.equal(headerWins.provider, "Amazon CloudFront");
  assert.equal(headerWins.evidence.some((item) => item.includes("cf-ray")), false);

  const stampedOrigin = classifyHost({
    role: "apex",
    host: "github.com",
    records: { cname: [], a: ["20.29.134.23"], aaaa: [] },
    headers: headers({ "cf-ray": "a4c887c50b95ff0f-PDX", server: "cloudflare" }),
    notes: [],
  });
  assert.equal(stampedOrigin.status, "direct");
  assert.equal(stampedOrigin.provider, null);
  assert.equal(stampedOrigin.originExposed, true);
  assert.ok(stampedOrigin.evidence.includes("a:20.29.134.23"));
  assert.equal(stampedOrigin.evidence.some((item) => item.includes("cf-ray") || item.includes("server=cloudflare")), false);

  const hosted = classifyHost({
    role: "app",
    host: "app.example.com",
    records: { cname: ["app.example.com.elb.amazonaws.com"], a: [], aaaa: [] },
    headers: null,
    notes: [],
  });
  assert.equal(hosted.status, "direct");
  assert.equal(hosted.provider, null);
  assert.equal(hosted.hosting, "Amazon Web Services");
});

test("recommendation rules stay informational", () => {
  const hosts = [
    classifyHost({
      role: "apex",
      host: "example.com",
      records: { cname: [], a: ["93.184.216.34"], aaaa: [] },
      headers: null,
      notes: [],
    }),
    classifyHost({
      role: "www",
      host: "www.example.com",
      records: { cname: ["site.netlify.app"], a: [], aaaa: [] },
      headers: null,
      notes: [],
    }),
    classifyHost({
      role: "api",
      host: "api.example.com",
      records: { cname: [], a: ["198.51.100.9"], aaaa: [] },
      headers: null,
      notes: [],
    }),
    classifyHost({
      role: "cdn",
      host: "cdn.example.com",
      records: { cname: ["example.com.cdn.cloudflare.net"], a: ["104.16.1.1"], aaaa: [] },
      headers: null,
      notes: [],
    }),
  ];
  const recommendations = buildRecommendations(hosts);
  const ids = recommendations.map((item) => item.id);
  assert.deepEqual(ids, ["proxy-apex", "api-direct", "mixed-cdn", "origin-ip"]);
  const proxy = recommendations[0];
  assert.match(proxy.text, /đám mây cam/);
  assert.deepEqual(
    proxy.links.map((link) => link.href),
    [
      "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-full-dns",
      "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-partial-dns",
    ],
  );
  assert.match(recommendations.find((item) => item.id === "api-direct").text, /API Shield/);
  assert.doesNotMatch(recommendations.map((item) => item.text).join(" "), /Cloudflare recommends|official Cloudflare/i);

  const all = buildRecommendations([
    classifyHost({
      role: "apex",
      host: "example.com",
      records: { cname: [], a: ["104.16.1.1"], aaaa: [] },
      headers: headers({ server: "cloudflare" }),
      notes: [],
    }),
    classifyHost({
      role: "www",
      host: "www.example.com",
      records: { cname: [], a: [], aaaa: [] },
      headers: null,
      notes: [],
    }),
  ]);
  assert.equal(all.length, 1);
  assert.equal(all[0].id, "all-cloudflare");
  assert.match(all[0].text, /^Tốt/);
  assert.equal(all[0].links[0].href, "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-ssl-tls");

  const empty = buildRecommendations([
    classifyHost({
      role: "apex",
      host: "example.com",
      records: { cname: [], a: [], aaaa: [] },
      headers: null,
      notes: [],
    }),
  ]);
  assert.equal(empty[0].id, "no-dns");
});

test("inspectDomain skips header probes for mail and private addresses", async () => {
  const probed = [];
  const report = await inspectDomain("example.com", {
    async lookup(name, type) {
      if (name === "example.com" && type === "A") return { ok: true, values: ["104.16.8.8"] };
      if (name === "api.example.com" && type === "A") return { ok: true, values: ["10.1.2.3"] };
      if (name === "www.example.com" && type === "CNAME") return { ok: true, values: ["example.com.cdn.cloudflare.net"] };
      if (name === "mail.example.com" && type === "A") return { ok: true, values: ["192.0.2.10"] };
      if (name === "cdn.example.com" && type === "CNAME") return { ok: true, values: ["d111.cloudfront.net"] };
      return { ok: true, values: [] };
    },
    async probe(host) {
      probed.push(host);
      if (host === "example.com") return headers({ "cf-ray": "probe-HAN", server: "cloudflare" });
      return null;
    },
  });

  assert.equal(report.hosts.length, 12);
  assert.equal(report.summary.cloudflare, 2);
  assert.equal(report.summary.other_cdn, 1);
  assert.equal(report.summary.direct, 2);
  assert.equal(report.summary.no_record, 7);
  assert.deepEqual(probed.sort(), ["cdn.example.com", "example.com", "www.example.com"]);
  const api = report.hosts.find((host) => host.role === "api");
  assert.equal(api.status, "direct");
  assert.equal(api.originExposed, false);
  assert.ok(api.evidence.includes("probe_skipped:private_address"));
  const mail = report.hosts.find((host) => host.role === "mail");
  assert.ok(mail.evidence.includes("probe_skipped:mail"));
  assert.ok(report.recommendations.some((item) => item.id === "mixed-cdn"));
  assert.equal(report.discovery.source, "common");
  assert.equal(report.discovery.scanned, 12);
  assert.equal(report.setup.mode, "partial");
  assert.equal(report.path, "/");
  assert.ok(report.dns.rows.some((row) => row.type === "A" && row.value === "104.16.8.8"));
  assert.equal(report.dns.dnssec, "unsigned");
  assert.equal(report.page.fetched, false);
});

test("certificate names stay on the domain and the scan cap prefers shorter hosts", () => {
  const parsed = parseCertificateNames("example.com", [
    { name_value: "*.example.com\nwww.example.com\nlogin.other.com" },
    { name_value: "*.docs.example.com, status.example.com" },
    { common_name: "API.Example.com" },
    { name_value: "not a host" },
  ]);
  assert.deepEqual(parsed.names, [
    "example.com",
    "api.example.com",
    "www.example.com",
    "docs.example.com",
    "status.example.com",
  ]);
  assert.equal(parsed.truncated, false);

  const many = Array.from({ length: 50 }, (_, index) => `${"n".repeat(index + 1)}.example.com`);
  many.push("a.example.com");
  const extras = extraHostsForDomain("example.com", many);
  assert.equal(extras.truncated, true);
  assert.equal(extras.hosts.length, MAX_DNS_HOSTS - 12);
  assert.equal(extras.hosts[0].host, "a.example.com");
  assert.equal(extras.hosts[0].role, "subdomain");
  assert.equal(extras.hosts.some((item) => item.host === "www.example.com"), false);
});

test("cloudflare setup follows nameservers, not only proxied addresses", () => {
  assert.equal(classifySetup(["ada.ns.cloudflare.com", "bob.ns.cloudflare.com."], true, true), "full");
  assert.equal(classifySetup(["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"], false, true), "full");
  assert.equal(classifySetup(["ns1.example.net", "ns2.example.net"], true, true), "partial");
  assert.equal(classifySetup(["ada.ns.cloudflare.com", "ns1.example.net"], false, true), "partial");
  assert.equal(classifySetup(["ns1.example.net"], false, true), "unknown");
  assert.equal(classifySetup(["ns1.example.net"], false, true, "other"), "none");
  assert.equal(classifySetup(["ns1.example.com"], false, true, "cloudflare"), "full");
  assert.equal(classifySetup(["ns1.example.com", "ada.ns.cloudflare.com"], false, true, "mixed"), "partial");
  assert.equal(classifySetup([], true, true), "partial");
  assert.equal(classifySetup([], false, true), "unknown");
  assert.equal(classifySetup(["ada.ns.cloudflare.com"], true, false), "unknown");
});

test("asn names keep cloud providers distinct from cdn networks", () => {
  assert.equal(providerNameFromAsn(8075), "Microsoft Azure");
  assert.equal(providerNameFromAsn(16509), "Amazon Web Services");
  assert.equal(providerNameFromAsn(15169), "Google Cloud");
  assert.equal(providerNameFromAsn(20940), "Akamai");
  assert.equal(providerNameFromAsn(36459), "GitHub");
  assert.equal(providerNameFromAsn(22616), "Zscaler");
  assert.equal(cdnNameFromAsn(16509), null);
  assert.equal(cdnNameFromAsn(8075), null);
  assert.equal(cdnNameFromAsn(20940), "Akamai");
  assert.equal(cdnNameFromAsn(54113), "Fastly");
  assert.equal(cymruQueryName("20.29.134.23"), "23.134.29.20.origin.asn.cymru.com");
  assert.equal(cymruQueryName("104.16.1.1"), null);
  assert.equal(parseCymruTxt('"8075 | 20.0.0.0/11 | US | arin | 2017-10-18"')?.asn, 8075);
  const who = networkFromIpwho("20.29.134.23", {
    success: true,
    country: "United States",
    city: "Quincy",
    connection: { asn: 8075, org: "Microsoft Corporation", isp: "Microsoft Corporation" },
  });
  assert.equal(who.provider, "Microsoft Azure");
  assert.equal(who.cdn, null);
  assert.equal(who.city, "Quincy");
  assert.equal(networkFromCymru("23.15.1.1", "20940 | 23.0.0.0/8 | US | arin | 1994-01-01").cdn, "Akamai");
  assert.equal(networkFromIpwho("1.1.1.1", { success: false }), null);
});

test("scans discovered names, separates cdn from network owner, and caps probes", async () => {
  const probed = [];
  const networks = [];
  const extras = Array.from({ length: 20 }, (_, index) => `n${String(index).padStart(2, "0")}.github.com`);
  const report = await inspectDomain("github.com", {
    async lookup(name, type) {
      if (type === "NS") return { ok: true, values: ["ns-1.example.net", "ns-2.example.net"] };
      if ((name === "ns-1.example.net" || name === "ns-2.example.net") && (type === "A" || type === "AAAA")) {
        return { ok: true, values: type === "A" ? ["93.184.216.34"] : [] };
      }
      if (name === "github.com" && type === "A") return { ok: true, values: ["20.29.134.23"] };
      if (name === "blog.github.com" && type === "CNAME") return { ok: true, values: ["blog.github.com.fastly.net"] };
      if (name === "docs.github.com" && type === "A") return { ok: true, values: ["23.15.1.1"] };
      if (extras.includes(name) && type === "A") return { ok: true, values: ["93.184.216.34"] };
      return { ok: true, values: [] };
    },
    async probe(host) {
      probed.push(host);
      if (host === "github.com") return headers({ "cf-ray": "abc-PDX", server: "cloudflare" });
      if (host === "blog.github.com") return headers({ "x-served-by": "cache-sjc" });
      return headers({});
    },
    async discover() {
      return { names: ["docs.github.com", "blog.github.com", ...extras], source: "crt.sh", truncated: false };
    },
    async network(ip) {
      networks.push(ip);
      if (ip === "20.29.134.23") {
        return {
          ip,
          asn: 8075,
          org: "Microsoft Corporation",
          provider: "Microsoft Azure",
          cdn: null,
          country: "United States",
          city: "Quincy",
        };
      }
      if (ip === "23.15.1.1") {
        return { ip, asn: 20940, org: "Akamai Technologies", provider: "Akamai", cdn: "Akamai", country: "United States", city: null };
      }
      return null;
    },
  });

  const apex = report.hosts.find((host) => host.host === "github.com");
  assert.equal(apex.status, "direct");
  assert.equal(apex.provider, null);
  assert.equal(apex.network.provider, "Microsoft Azure");
  assert.equal(apex.network.asn, 8075);
  assert.equal(apex.evidence.some((item) => item.includes("cf-ray") || item.includes("server=cloudflare")), false);
  assert.ok(apex.evidence.includes("geo:Quincy, United States"));

  const blog = report.hosts.find((host) => host.host === "blog.github.com");
  assert.equal(blog.status, "other_cdn");
  assert.equal(blog.provider, "Fastly");

  const docs = report.hosts.find((host) => host.host === "docs.github.com");
  assert.equal(docs.role, "subdomain");
  assert.equal(docs.status, "other_cdn");
  assert.equal(docs.provider, "Akamai");
  assert.equal(docs.originExposed, false);

  assert.equal(report.setup.mode, "none");
  assert.deepEqual(report.setup.nameservers, ["ns-1.example.net", "ns-2.example.net"]);
  assert.deepEqual(report.cdn, ["Fastly", "Akamai"]);
  assert.deepEqual(report.networks, ["Microsoft Azure"]);
  assert.equal(report.discovery.source, "crt.sh");
  assert.equal(report.discovery.found, 22);
  assert.equal(report.discovery.scanned, 33);
  assert.equal(probed.length, MAX_HTTP_PROBES);
  assert.ok(probed.includes("github.com"));
  assert.ok(probed.includes("blog.github.com"));
  assert.equal(probed.includes("mail.github.com"), false);
  assert.deepEqual(networks.sort(), ["20.29.134.23", "23.15.1.1", "93.184.216.34"]);
  assert.ok(report.recommendations.some((item) => item.id === "mixed-cdn"));
  assert.equal(report.recommendations.some((item) => item.id === "setup-partial"), false);
});

test("full dns is reported when every nameserver is cloudflare", async () => {
  const report = await inspectDomain("example.com", {
    async lookup(name, type) {
      if (type === "NS") return { ok: true, values: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"] };
      if (name === "example.com" && type === "A") return { ok: true, values: ["104.16.1.1"] };
      return { ok: true, values: [] };
    },
    async probe() {
      return headers({ "cf-ray": "abc-SIN", server: "cloudflare" });
    },
    async discover() {
      return { names: [], source: "crt.sh", truncated: false };
    },
  });
  assert.equal(report.setup.mode, "full");
  assert.equal(report.discovery.found, 0);
  assert.equal(report.discovery.scanned, 12);
  assert.ok(report.recommendations.some((item) => item.id === "setup-full"));
  assert.equal(report.cdn[0], "Cloudflare");
  const apex = report.hosts.find((host) => host.role === "apex");
  assert.equal(apex.network, null);
});

test("vanity nameservers on cloudflare addresses count as full dns", async () => {
  const report = await inspectDomain("example.com", {
    async lookup(name, type) {
      if (name === "example.com" && type === "NS") return { ok: true, values: ["ns1.example.com", "ns2.example.com"] };
      if ((name === "ns1.example.com" || name === "ns2.example.com") && type === "A") {
        return { ok: true, values: ["162.159.3.232"] };
      }
      if (name === "example.com" && type === "A") return { ok: true, values: ["104.16.1.1"] };
      return { ok: true, values: [] };
    },
    async probe() {
      return null;
    },
  });
  assert.equal(report.setup.mode, "full");
  assert.deepEqual(report.setup.nameservers, ["ns1.example.com", "ns2.example.com"]);
});

test("dns answers keep ttl and a page url keeps its path", () => {
  const parsed = parseDnsAnswers(
    {
      Status: 0,
      Answer: [
        { type: 1, TTL: 60, data: "93.184.216.34" },
        { type: 15, TTL: 300, data: "10 mail.example.com." },
        { type: 16, TTL: 120, data: '"v=spf1 include:_spf.example.com ~all"' },
      ],
    },
    "A",
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.rows, [{ type: "A", ttl: 60, value: "93.184.216.34" }]);
  const mail = parseDnsAnswers(
    { Status: 0, Answer: [{ type: 15, TTL: 300, data: "10 MAIL.Example.com." }] },
    "MX",
  );
  assert.equal(mail.rows[0].value, "10 mail.example.com");
  const txt = parseDnsAnswers(
    { Status: 0, Answer: [{ type: 16, TTL: 120, data: '"v=spf1 include:_spf.example.com ~all"' }] },
    "TXT",
  );
  assert.equal(txt.rows[0].value, "v=spf1 include:_spf.example.com ~all");
  assert.equal(ptrQueryName("20.29.134.23"), "23.134.29.20.in-addr.arpa");
  assert.equal(normalizeTarget("https://Example.com:443/docs/intro?q=1#top").path, "/docs/intro");
  assert.equal(normalizeTarget("example.com").path, "/");

  const propagation = comparePropagation(
    ["93.184.216.34"],
    [
      { id: "cloudflare", name: "Cloudflare", place: "Toàn cầu", placeEn: "Global", ok: true, values: ["93.184.216.34"] },
      { id: "google", name: "Google", place: "Toàn cầu", placeEn: "Global", ok: true, values: ["198.51.100.9"] },
      { id: "quad9", name: "Quad9", place: "Toàn cầu", placeEn: "Global", ok: false, values: [] },
    ],
  );
  assert.deepEqual(
    propagation.map((row) => row.state),
    ["match", "differ", "error"],
  );
});

test("page html names the cdn behind linked resources", () => {
  const extracted = extractPageResources(
    `<html><script src="https://cdn.example.net/app.js"></script>
      <script src="https://cdn.example.net/app.js"></script>
      <img src="/logo.png"><img src="data:image/gif;base64,aaaa">
      <link rel="stylesheet" href="https://static.cdn77.org/a.css">
      <link rel="preconnect" href="https://fonts.example.net">
      <iframe src="https://player.example.org/v"></iframe></html>`,
    "https://example.com/docs",
  );
  assert.deepEqual(
    extracted.resources.map((item) => item.host),
    ["cdn.example.net", "example.com", "static.cdn77.org", "player.example.org"],
  );
  assert.equal(extracted.resources[0].count, 2);
  assert.equal(extracted.resources[0].kinds[0], "script");
});

test("a fetched page reports each resource cdn without mixing it into the hostname scan", async () => {
  const report = await inspectDomain("example.com", {
    async lookup(name, type) {
      if (type === "NS") return { ok: true, values: ["ns1.example.net"] };
      if (name === "example.com" && type === "A") return { ok: true, values: ["93.184.216.34"] };
      if (name === "cdn.example.net" && type === "CNAME") return { ok: true, values: ["d111.cloudfront.net"] };
      if ((name === "ns1.example.net") && type === "A") return { ok: true, values: ["93.184.216.34"] };
      return { ok: true, values: [] };
    },
    async probe() {
      return null;
    },
    async page() {
      return {
        url: "https://example.com/docs",
        status: 200,
        html: '<script src="https://cdn.example.net/app.js"></script><img src="https://example.com/logo.png">',
      };
    },
    async propagate() {
      return comparePropagation(["93.184.216.34"], [
        { id: "cloudflare", name: "Cloudflare", place: "Toàn cầu", placeEn: "Global", ok: true, values: ["93.184.216.34"] },
      ]);
    },
  }, { path: "/docs" });

  assert.equal(report.path, "/docs");
  assert.equal(report.page.fetched, true);
  assert.equal(report.page.status, 200);
  assert.deepEqual(report.page.cdns, ["Amazon CloudFront"]);
  const script = report.page.resources.find((item) => item.host === "cdn.example.net");
  assert.equal(script.provider, "Amazon CloudFront");
  assert.equal(script.status, "other_cdn");
  assert.equal(report.hosts.some((host) => host.host === "cdn.example.net"), false);
  assert.equal(report.dns.propagation[0].state, "match");
  const image = report.page.resources.find((item) => item.host === "example.com");
  assert.equal(image.status, "direct");
});

function request(url, ip, init = {}) {
  const headers = new Headers(init.headers);
  if (ip) headers.set("cf-connecting-ip", ip);
  return new Request(url, { ...init, headers });
}

test("lookup rate limit returns the Vietnamese 429 before any DNS", async () => {
  const env = {};
  const ip = "203.0.113.21";
  for (let index = 0; index < 5; index += 1) {
    const outcome = await enforceRateLimit(
      request("https://orangecloud.vn/api/edge-check?domain=example.com", ip),
      env,
      "check",
    );
    assert.equal(outcome.limited, false);
  }
  const response = await handleEdgeCheck(
    request("https://orangecloud.vn/api/edge-check?domain=example.com", ip),
    env,
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error, RATE_LIMIT_MESSAGE);
});

test("localhost still caps checks when the binding always allows", async () => {
  resetLocalRateLimitForTests();
  let calls = 0;
  const env = {
    EDGE_CHECK_LIMITER: {
      async limit() {
        calls += 1;
        return { success: true };
      },
    },
  };
  // Fresh address so a leftover helper window from another run cannot pre-fill the bucket.
  const ip = `198.51.100.${(process.pid % 200) + 1}`;
  for (let index = 0; index < 5; index += 1) {
    const outcome = await enforceRateLimit(
      request("http://127.0.0.1:8787/api/edge-check?domain=example.com", ip),
      env,
      "check",
    );
    assert.equal(outcome.limited, false);
  }
  const blocked = await enforceRateLimit(
    request("http://127.0.0.1:8787/api/edge-check?domain=example.com", ip),
    env,
    "check",
  );
  assert.equal(blocked.limited, true);
  assert.equal(calls, 6);
});

test("contact reuses the binding with a stricter key prefix", async () => {
  const keys = [];
  const env = {
    EDGE_CHECK_LIMITER: {
      async limit({ key }) {
        keys.push(key);
        return { success: keys.length < 3 };
      },
    },
  };
  const response = await handleEdgeContact(
    request("https://orangecloud.vn/api/edge-check/contact", "203.0.113.23", {
      method: "POST",
      body: JSON.stringify({
        name: "An Example",
        email: "an@example.com",
        company: "Example",
        message: "Please look at this domain.",
        domain: "https://example.com/path",
      }),
    }),
    env,
  );
  assert.equal(response.status, 429);
  assert.deepEqual(keys, ["contact:203.0.113.23", "contact:203.0.113.23", "contact:203.0.113.23"]);
});

test("contact stub validates, hides the body from the response, and accepts a honeypot silently", async () => {
  const env = {
    EDGE_CHECK_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
  };
  const ok = await handleEdgeContact(
    request("https://orangecloud.vn/api/edge-check/contact", "203.0.113.24", {
      method: "POST",
      body: JSON.stringify({
        name: "An Example",
        email: "an@example.com",
        company: "Example Co",
        message: "Hello from the prototype",
        website: "",
        domain: "example.com",
      }),
    }),
    env,
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true });
  assert.equal(ok.headers.get("cache-control"), "no-store");

  const honeypot = await handleEdgeContact(
    request("https://orangecloud.vn/api/edge-check/contact", "203.0.113.25", {
      method: "POST",
      body: JSON.stringify({
        name: "Bot",
        email: "bot@example.com",
        message: "buy followers",
        website: "https://spam.example",
      }),
    }),
    env,
  );
  assert.equal(honeypot.status, 200);
  assert.deepEqual(await honeypot.json(), { ok: true });

  const missing = await handleEdgeContact(
    request("https://orangecloud.vn/api/edge-check/contact", "203.0.113.26", {
      method: "POST",
      body: JSON.stringify({ name: "An", email: "not-an-email", message: "Hi" }),
    }),
    env,
  );
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /Email/);
});

test("worker routes the checker without opening other POST paths", async () => {
  const env = { ASSETS: { async fetch() { throw new Error("assets should not be fetched"); } } };
  const bad = await worker.fetch(request("https://orangecloud.vn/api/edge-check?domain=127.0.0.1", "203.0.113.27"), env);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, INVALID_DOMAIN_MESSAGE);
  assert.match(bad.headers.get("content-security-policy"), /form-action 'none'/);

  const empty = await worker.fetch(request("https://orangecloud.vn/api/edge-check", "203.0.113.28"), env);
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).error, EMPTY_DOMAIN_MESSAGE);

  const postCheck = await worker.fetch(
    request("https://orangecloud.vn/api/edge-check?domain=example.com", "203.0.113.29", { method: "POST" }),
    env,
  );
  assert.equal(postCheck.status, 405);
  assert.equal(await postCheck.text(), "Method Not Allowed");

  const postOther = await worker.fetch(
    request("https://orangecloud.vn/api/health", "203.0.113.30", { method: "POST" }),
    env,
  );
  assert.equal(postOther.status, 405);

  const contact = await worker.fetch(
    request("https://orangecloud.vn/api/edge-check/contact", "203.0.113.31", {
      method: "POST",
      body: JSON.stringify({ name: "An Example", email: "an@example.com", message: "Hi there" }),
    }),
    env,
  );
  assert.equal(contact.status, 200);
  assert.deepEqual(await contact.json(), { ok: true });

  const slash = await worker.fetch(new Request("https://orangecloud.vn/tools/edge-coverage"), env);
  assert.equal(slash.status, 301);
  assert.equal(slash.headers.get("location"), "https://orangecloud.vn/tools/edge-coverage/");
});

test("the page is indexable, canonical, and listed in the sitemap", () => {
  assert.equal(canonicalRedirect("/tools/edge-coverage", ""), "https://orangecloud.vn/tools/edge-coverage/");
  assert.equal(
    canonicalRedirect("/tools/edge-coverage/index.html", "?x=1"),
    "https://orangecloud.vn/tools/edge-coverage/?x=1",
  );
  assert.equal(canonicalRedirect("/tools/edge-coverage/", ""), undefined);
  assert.equal(shouldServeNotFound("/tools/edge-coverage/", 200, "text/html; charset=utf-8"), false);
  assert.equal(shouldServeNotFound("/tools/edge-coverage", 200, "text/html"), false);
  assert.match(sitemap, /<loc>https:\/\/orangecloud\.vn\/tools\/edge-coverage\/<\/loc>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/orangecloud\.vn\/tools\/edge-coverage\/"\s*\/>/);
  assert.match(page, /family=Inter:wght@400;500;600;700/);
  assert.match(page, /class="ecc"/);
  assert.match(page, /Dự án cá nhân\. Đây không phải ấn phẩm của Cloudflare, Inc\./);
  assert.match(page, /Bản thử nghiệm, chưa gửi đi đâu/);
  assert.match(page, /id="ecc-website"/);
  assert.match(wrangler, /"name": "EDGE_CHECK_LIMITER"/);
  assert.match(wrangler, /"namespace_id": "1001"/);
  assert.match(wrangler, /"limit": 5/);
  assert.match(wrangler, /"period": 60/);
  assert.doesNotMatch(client, /innerHTML|document\.write|eval\(/);
  assert.match(readFileSync(new URL("../src/edge-check.ts", import.meta.url), "utf8"), /TODO: wire to real lead storage/);
});
