import { isCloudflareIp, isPublicIp } from "./cloudflare-ips.ts";

export const INVALID_DOMAIN_MESSAGE =
  "Tên miền không hợp lệ. Chỉ dùng hostname công khai, không dùng địa chỉ IP, localhost hay tên nội bộ.";
export const EMPTY_DOMAIN_MESSAGE = "Nhập tên miền cần kiểm tra.";
export const RATE_LIMIT_MESSAGE =
  "Bạn đã kiểm tra quá nhiều lần, vui lòng thử lại sau một phút.";

const FULL_DNS = "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-full-dns";
const PARTIAL_DNS = "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-partial-dns";
const SSL_TLS = "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-ssl-tls";

const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const BLOCKED_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".localdomain",
  ".home",
  ".lan",
  ".intranet",
  ".corp",
  ".private",
  ".arpa",
  ".invalid",
];

export const EDGE_HOST_ROLES = [
  "apex",
  "www",
  "api",
  "cdn",
  "app",
  "static",
  "assets",
  "img",
  "mail",
  "shop",
  "m",
  "blog",
] as const;

const CHECK_LIMIT = 5;
const CONTACT_LIMIT = 2;
const CONTACT_BINDING_TOKENS = 3;
const WINDOW_MS = 60_000;
const LOOKUP_CONCURRENCY = 4;
const DNS_TIMEOUT_MS = 3000;

export type HostStatus = "cloudflare" | "other_cdn" | "direct" | "no_record";
export type DnsType = "A" | "AAAA" | "CNAME";

export type DnsRecords = {
  cname: string[];
  a: string[];
  aaaa: string[];
};

export type HostResult = {
  role: string;
  host: string;
  records: DnsRecords;
  status: HostStatus;
  provider: string | null;
  evidence: string[];
  originExposed: boolean;
};

export type RecommendationLink = {
  href: string;
  label: string;
  labelEn: string;
};

export type Recommendation = {
  id: string;
  tone: "good" | "info" | "warn";
  text: string;
  textEn: string;
  links: RecommendationLink[];
};

export type EdgeReport = {
  domain: string;
  hosts: HostResult[];
  summary: Record<HostStatus, number>;
  recommendations: Recommendation[];
};

type ProviderId =
  | "cloudflare"
  | "cloudfront"
  | "fastly"
  | "akamai"
  | "azure"
  | "google"
  | "vercel"
  | "netlify"
  | "bunny"
  | "byteplus"
  | "alibaba"
  | "tencent";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  cloudflare: "Cloudflare",
  cloudfront: "Amazon CloudFront",
  fastly: "Fastly",
  akamai: "Akamai",
  azure: "Azure Front Door",
  google: "Google",
  vercel: "Vercel",
  netlify: "Netlify",
  bunny: "Bunny",
  byteplus: "BytePlus",
  alibaba: "Alibaba CDN",
  tencent: "Tencent CDN",
};

const CNAME_SUFFIXES: { id: ProviderId; suffixes: string[] }[] = [
  { id: "cloudflare", suffixes: ["cdn.cloudflare.net", "cloudflare.net", "pages.dev", "workers.dev"] },
  { id: "cloudfront", suffixes: ["cloudfront.net"] },
  { id: "fastly", suffixes: ["fastly.net", "fastlylb.net"] },
  { id: "akamai", suffixes: ["akamai.net", "akamaiedge.net", "edgekey.net", "edgesuite.net", "akamaized.net"] },
  { id: "azure", suffixes: ["azurefd.net", "azureedge.net"] },
  { id: "google", suffixes: ["googleusercontent.com", "ghs.googlehosted.com"] },
  { id: "vercel", suffixes: ["vercel-dns.com"] },
  { id: "netlify", suffixes: ["netlify.app"] },
  { id: "bunny", suffixes: ["b-cdn.net"] },
  { id: "alibaba", suffixes: ["cdngslb.com"] },
  { id: "tencent", suffixes: ["cdntip.com"] },
];

export type LookupResult = { ok: boolean; values: string[] };

export type LookupDeps = {
  lookup: (name: string, type: DnsType) => Promise<LookupResult>;
  probe: (host: string) => Promise<Headers | null>;
};

export function normalizeDomain(raw: string): { domain: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: EMPTY_DOMAIN_MESSAGE };
  if (trimmed.length > 512) return { error: INVALID_DOMAIN_MESSAGE };

  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { error: INVALID_DOMAIN_MESSAGE };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { error: INVALID_DOMAIN_MESSAGE };
  if (url.username || url.password) return { error: INVALID_DOMAIN_MESSAGE };

  let host = url.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host || host.length > 253) return { error: INVALID_DOMAIN_MESSAGE };
  if (host.startsWith("[") || host.includes(":")) return { error: INVALID_DOMAIN_MESSAGE };
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return { error: INVALID_DOMAIN_MESSAGE };
  if (host === "localhost" || host.endsWith(".localhost")) return { error: INVALID_DOMAIN_MESSAGE };
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return { error: INVALID_DOMAIN_MESSAGE };
  if (!HOST_RE.test(host)) return { error: INVALID_DOMAIN_MESSAGE };
  return { domain: host };
}

export function hostsForDomain(domain: string): { role: string; host: string }[] {
  return EDGE_HOST_ROLES.slice(0, 12).map((role) => ({
    role,
    host: role === "apex" ? domain : `${role}.${domain}`,
  }));
}

function suffixMatch(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function providerFromCname(target: string): ProviderId | null {
  const host = target.toLowerCase().replace(/\.$/, "");
  for (const rule of CNAME_SUFFIXES) {
    if (rule.suffixes.some((suffix) => suffixMatch(host, suffix))) return rule.id;
  }
  if (/(^|\.)kunlun[a-z0-9-]*\.com$/.test(host)) return "byteplus";
  return null;
}

export function providerFromHeaders(headers: Headers): ProviderId | null {
  const server = (headers.get("server") ?? "").toLowerCase();
  const via = (headers.get("via") ?? "").toLowerCase();
  if (headers.has("cf-ray") || server.includes("cloudflare")) return "cloudflare";
  if (headers.has("x-amz-cf-id") || headers.has("x-amz-cf-pop")) return "cloudfront";
  if (headers.has("x-served-by") || headers.has("x-fastly-request-id") || via.includes("varnish")) {
    return "fastly";
  }
  let akamai = server.includes("akamaighost");
  if (!akamai) {
    headers.forEach((_value, name) => {
      if (name.toLowerCase().startsWith("x-akamai-")) akamai = true;
    });
  }
  if (akamai) return "akamai";
  if (headers.has("x-azure-ref")) return "azure";
  if (headers.has("x-vercel-id")) return "vercel";
  if (headers.has("x-nf-request-id")) return "netlify";
  if (server.includes("bunnycdn")) return "bunny";
  return null;
}

function headerEvidence(headers: Headers): string[] {
  const names = [
    "cf-ray",
    "server",
    "x-amz-cf-id",
    "x-amz-cf-pop",
    "x-served-by",
    "x-fastly-request-id",
    "via",
    "x-azure-ref",
    "x-vercel-id",
    "x-nf-request-id",
  ];
  const items: string[] = [];
  for (const name of names) {
    const value = headers.get(name);
    if (value) items.push(`header:${name}=${value.slice(0, 80)}`);
  }
  headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith("x-akamai-")) {
      items.push(`header:${name.toLowerCase()}=${value.slice(0, 80)}`);
    }
  });
  return items;
}

export function classifyHost(input: {
  role: string;
  host: string;
  records: DnsRecords;
  headers: Headers | null;
  notes: string[];
}): HostResult {
  const records: DnsRecords = {
    cname: input.records.cname.slice(0, 8),
    a: input.records.a.slice(0, 8),
    aaaa: input.records.aaaa.slice(0, 8),
  };
  const headerProvider = input.headers ? providerFromHeaders(input.headers) : null;
  let cnameProvider: ProviderId | null = null;
  for (const target of records.cname) {
    cnameProvider = providerFromCname(target);
    if (cnameProvider) break;
  }
  const ipCloudflare = [...records.a, ...records.aaaa].some((ip) => isCloudflareIp(ip));
  const providerId = headerProvider ?? cnameProvider ?? (ipCloudflare ? "cloudflare" : null);
  const hasRecords = records.cname.length + records.a.length + records.aaaa.length > 0;

  let status: HostStatus;
  if (!hasRecords && !headerProvider) status = "no_record";
  else if (providerId === "cloudflare") status = "cloudflare";
  else if (providerId) status = "other_cdn";
  else if (hasRecords) status = "direct";
  else status = "no_record";

  const evidence = [
    ...records.cname.map((value) => `cname:${value}`),
    ...records.a.map((value) => (isCloudflareIp(value) ? `a:${value} cloudflare` : `a:${value}`)),
    ...records.aaaa.map((value) => (isCloudflareIp(value) ? `aaaa:${value} cloudflare` : `aaaa:${value}`)),
    ...(input.headers ? headerEvidence(input.headers) : []),
    ...input.notes,
  ].slice(0, 16);

  const publicForeign = [...records.a, ...records.aaaa].filter((ip) => isPublicIp(ip) && !isCloudflareIp(ip));
  const originExposed = publicForeign.length > 0 && status !== "other_cdn" && status !== "no_record";
  if (originExposed) evidence.push("origin_ip_public");

  return {
    role: input.role,
    host: input.host,
    records,
    status,
    provider: providerId ? PROVIDER_LABEL[providerId] : null,
    evidence,
    originExposed,
  };
}

export function buildRecommendations(hosts: HostResult[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const recorded = hosts.filter((host) => host.status !== "no_record");
  const apexLike = hosts.filter(
    (host) =>
      (host.role === "apex" || host.role === "www") &&
      host.status !== "cloudflare" &&
      host.status !== "no_record",
  );
  if (apexLike.length > 0) {
    recommendations.push({
      id: "proxy-apex",
      tone: "info",
      text: "Tên miền gốc hoặc www chưa đi qua Cloudflare. Có thể bật proxy (đám mây cam) bằng cấu hình Full DNS hoặc Partial DNS. Đây là thông tin tham khảo từ một dự án cá nhân, không phải hướng dẫn của Cloudflare, Inc.",
      textEn:
        "The apex or www host is not proxied through Cloudflare. The orange-cloud proxy can be turned on with Full DNS or Partial DNS. This is informational, from a personal project, and is not guidance from Cloudflare, Inc.",
      links: [
        { href: FULL_DNS, label: "Full DNS", labelEn: "Full DNS" },
        { href: PARTIAL_DNS, label: "Partial DNS", labelEn: "Partial DNS" },
      ],
    });
  }

  const api = hosts.find((host) => host.role === "api");
  if (api?.status === "direct") {
    recommendations.push({
      id: "api-direct",
      tone: "info",
      text: "Host api đang phân giải trực tiếp. Khi một API nằm sau proxy, WAF, giới hạn tốc độ và API Shield là các lớp thường được xem xét thêm.",
      textEn:
        "The api host resolves directly. When an API sits behind a proxy, WAF, rate limiting, and API Shield are layers people often look at next.",
      links: [],
    });
  }

  const providers = new Set(
    hosts
      .filter((host) => host.status === "cloudflare" || host.status === "other_cdn")
      .map((host) => host.provider)
      .filter((provider): provider is string => Boolean(provider)),
  );
  if (providers.size > 1) {
    recommendations.push({
      id: "mixed-cdn",
      tone: "info",
      text: "Các host đang dùng nhiều CDN khác nhau. Gộp về một nhà cung cấp giúp cache và chính sách bảo mật đồng nhất hơn.",
      textEn: "These hosts use more than one CDN. Consolidating on one provider makes cache and security policy more consistent.",
      links: [],
    });
  }

  if (hosts.some((host) => host.originExposed)) {
    recommendations.push({
      id: "origin-ip",
      tone: "warn",
      text: "Một hoặc nhiều host đang công khai địa chỉ IP không thuộc dải CDN đã nhận diện. Địa chỉ đó có thể bị dùng để đi vòng qua lớp proxy.",
      textEn:
        "One or more hosts publish an IP address outside the CDN ranges this check recognizes. That address can be used to bypass the proxy.",
      links: [],
    });
  }

  if (recorded.length > 0 && recorded.every((host) => host.status === "cloudflare")) {
    recommendations.push({
      id: "all-cloudflare",
      tone: "good",
      text: "Tốt — các host có bản ghi đang đi qua Cloudflare. Nên đối chiếu SSL/TLS ở chế độ Full (strict).",
      textEn: "Good — hosts with DNS records are going through Cloudflare. Compare the SSL/TLS mode with Full (strict).",
      links: [{ href: SSL_TLS, label: "SSL/TLS", labelEn: "SSL/TLS" }],
    });
  }

  if (hosts.length > 0 && hosts.every((host) => host.status === "no_record")) {
    recommendations.push({
      id: "no-dns",
      tone: "info",
      text: "Không thấy bản ghi DNS công khai cho các host đã kiểm tra. Kết quả có thể khác nếu DNS chỉ tồn tại nội bộ hoặc truy vấn bị chặn.",
      textEn:
        "No public DNS records were found for the hosts that were checked. Results can differ when DNS is internal-only or queries are blocked.",
      links: [],
    });
  }

  return recommendations;
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const DNS_TYPE_CODE: Record<DnsType, number> = { A: 1, AAAA: 28, CNAME: 5 };

async function defaultLookup(name: string, type: DnsType): Promise<LookupResult> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, values: [] };
    }
    const data = (await response.json()) as {
      Status?: number;
      Answer?: { type?: number; data?: string }[];
    };
    if (data.Status !== 0 && data.Status !== 3) return { ok: false, values: [] };
    const values = (data.Answer ?? [])
      .filter((item) => item.type === DNS_TYPE_CODE[type] && typeof item.data === "string")
      .map((item) => item.data!.replace(/\.$/, "").toLowerCase())
      .filter((value) => value.length > 0 && value.length <= 253);
    return { ok: true, values: [...new Set(values)] };
  } catch {
    return { ok: false, values: [] };
  }
}

async function requestHeaders(url: string, method: "HEAD" | "GET"): Promise<Response | null> {
  try {
    return await fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

async function defaultProbe(host: string): Promise<Headers | null> {
  const url = `https://${host}/`;
  let response = await requestHeaders(url, "HEAD");
  if (!response || response.status === 405 || response.status === 501) {
    await response?.body?.cancel();
    response = await requestHeaders(url, "GET");
  }
  if (!response) return null;
  const headers = response.headers;
  await response.body?.cancel();
  return headers;
}

const defaultDeps: LookupDeps = {
  lookup: defaultLookup,
  probe: defaultProbe,
};

export async function inspectDomain(domain: string, deps: LookupDeps = defaultDeps): Promise<EdgeReport> {
  const hosts = await mapPool(hostsForDomain(domain), LOOKUP_CONCURRENCY, async (item) => {
    const [cname, a, aaaa] = await Promise.all([
      deps.lookup(item.host, "CNAME"),
      deps.lookup(item.host, "A"),
      deps.lookup(item.host, "AAAA"),
    ]);
    const records: DnsRecords = {
      cname: cname.values,
      a: a.values,
      aaaa: aaaa.values,
    };
    const notes: string[] = [];
    const dnsFailed = !cname.ok && !a.ok && !aaaa.ok;
    if (dnsFailed) notes.push("dns_lookup_failed");
    const hasRecords = records.cname.length + records.a.length + records.aaaa.length > 0;
    const privateAddress = [...records.a, ...records.aaaa].some((ip) => !isPublicIp(ip));
    let headers: Headers | null = null;
    if (item.role === "mail") notes.push("probe_skipped:mail");
    else if (!hasRecords) notes.push("probe_skipped:no_record");
    else if (privateAddress) notes.push("probe_skipped:private_address");
    else {
      headers = await deps.probe(item.host);
      if (!headers) notes.push("probe_failed");
    }
    return classifyHost({ role: item.role, host: item.host, records, headers, notes });
  });

  return {
    domain,
    hosts,
    summary: summarize(hosts),
    recommendations: buildRecommendations(hosts),
  };
}

function summarize(hosts: HostResult[]): Record<HostStatus, number> {
  const summary: Record<HostStatus, number> = {
    cloudflare: 0,
    other_cdn: 0,
    direct: 0,
    no_record: 0,
  };
  for (const host of hosts) summary[host.status] += 1;
  return summary;
}

/**
 * Fallback windows for local development. `wrangler dev` can serve each request
 * from a different isolate, and the simulated rate-limit binding does not share
 * counters across those isolates, so an "allow" from the binding is not a cap.
 * On localhost the worker asks the optional helper at 127.0.0.1:8791
 * (`node scripts/local-edge-limit.mjs`), which is one process for every isolate.
 * If that helper is not running, this in-memory window is the cap instead.
 * Production uses `env.EDGE_CHECK_LIMITER` only.
 */
const localBuckets = new Map<string, number[]>();
const LOCAL_LIMIT_URL = "http://127.0.0.1:8791/consume";

export function resetLocalRateLimitForTests(): void {
  localBuckets.clear();
}

function localConsume(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (localBuckets.get(key) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= limit) {
    localBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  localBuckets.set(key, recent);
  if (localBuckets.size > 500) {
    const oldest = localBuckets.keys().next().value;
    if (oldest) localBuckets.delete(oldest);
  }
  return true;
}

async function localHelperConsume(key: string, limit: number): Promise<boolean | null> {
  try {
    const response = await fetch(
      `${LOCAL_LIMIT_URL}?key=${encodeURIComponent(key)}&limit=${limit}`,
      { signal: AbortSignal.timeout(400) },
    );
    const text = (await response.text()).trim();
    if (!response.ok) return null;
    if (text === "allow") return true;
    if (text === "deny") return false;
    return null;
  } catch {
    return null;
  }
}

function clientAddress(request: Request): string {
  const raw = request.headers.get("cf-connecting-ip") ?? "";
  if (/^[0-9a-fA-F:.]+$/.test(raw) && raw.length <= 64) return raw;
  return "local";
}

function isLocalDev(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export async function enforceRateLimit(
  request: Request,
  env: Env,
  kind: "check" | "contact",
): Promise<{ limited: boolean }> {
  const key = `${kind}:${clientAddress(request)}`;
  const limit = kind === "contact" ? CONTACT_LIMIT : CHECK_LIMIT;
  const limiter = env.EDGE_CHECK_LIMITER;
  let bindingState: "allow" | "deny" | "unavailable" = "unavailable";
  if (limiter && typeof limiter.limit === "function") {
    try {
      const hits = kind === "contact" ? CONTACT_BINDING_TOKENS : 1;
      bindingState = "allow";
      for (let index = 0; index < hits; index += 1) {
        const outcome = await limiter.limit({ key });
        if (!outcome?.success) {
          bindingState = "deny";
          break;
        }
      }
    } catch (error) {
      bindingState = "unavailable";
      console.log(
        JSON.stringify({
          message: "edge-check rate limit binding unavailable",
          error: error instanceof Error ? error.message.slice(0, 200) : "error",
        }),
      );
    }
  }
  if (isLocalDev(request)) {
    const helper = await localHelperConsume(key, limit);
    if (helper === false) {
      console.log(JSON.stringify({ message: "edge-check limit", gate: "helper", kind }));
      return { limited: true };
    }
    if (helper === null && !localConsume(key, limit)) {
      console.log(JSON.stringify({ message: "edge-check limit", gate: "memory", kind }));
      return { limited: true };
    }
    if (bindingState === "deny") {
      console.log(JSON.stringify({ message: "edge-check limit", gate: "binding", kind }));
      return { limited: true };
    }
    return { limited: false };
  }
  if (bindingState === "deny") {
    console.log(JSON.stringify({ message: "edge-check limit", gate: "binding", kind }));
    return { limited: true };
  }
  if (bindingState === "allow") return { limited: false };
  return { limited: !localConsume(key, limit) };
}

function json(body: unknown, status: number, cacheControl: string, extra?: Record<string, string>): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", cacheControl);
  return new Response(JSON.stringify(body), { status, headers });
}

function cacheRequest(domain: string): Request {
  return new Request(`https://edge-check.cache/v1/${domain}`);
}

async function readCache(domain: string): Promise<Response | null> {
  try {
    if (typeof caches === "undefined" || !caches.default) return null;
    return (await caches.default.match(cacheRequest(domain))) ?? null;
  } catch {
    return null;
  }
}

async function writeCache(domain: string, report: EdgeReport, ctx?: ExecutionContext): Promise<void> {
  const put = (async () => {
    try {
      if (typeof caches === "undefined" || !caches.default) return;
      await caches.default.put(cacheRequest(domain), json(report, 200, "public, max-age=300"));
    } catch {
      /* wrangler dev can run without a persistent default cache */
    }
  })();
  if (ctx) ctx.waitUntil(put);
  else await put;
}

export async function handleEdgeCheck(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("domain") ?? "";
  const normalized = normalizeDomain(raw);
  if ("error" in normalized) {
    console.log(JSON.stringify({ message: "edge-check rejected", reason: "invalid_domain" }));
    return json({ error: normalized.error }, 400, "no-store");
  }

  const limit = await enforceRateLimit(request, env, "check");
  if (limit.limited) {
    console.log(JSON.stringify({ message: "edge-check rate limited", kind: "check" }));
    return json({ error: RATE_LIMIT_MESSAGE }, 429, "no-store", { "retry-after": "60" });
  }

  const cached = await readCache(normalized.domain);
  if (cached) {
    console.log(JSON.stringify({ message: "edge-check", domain: normalized.domain, cache: "hit" }));
    const headers = new Headers(cached.headers);
    headers.set("cache-control", "no-store");
    return new Response(cached.body, { status: cached.status, headers });
  }

  try {
    const report = await inspectDomain(normalized.domain);
    console.log(
      JSON.stringify({
        message: "edge-check",
        domain: normalized.domain,
        cache: "miss",
        cloudflare: report.summary.cloudflare,
        other_cdn: report.summary.other_cdn,
        direct: report.summary.direct,
        no_record: report.summary.no_record,
      }),
    );
    await writeCache(normalized.domain, report, ctx);
    return json(report, 200, "no-store");
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "edge-check failed",
        domain: normalized.domain,
        error: error instanceof Error ? error.message.slice(0, 200) : "error",
      }),
    );
    return json({ error: "Không kiểm tra được lúc này. Thử lại sau." }, 500, "no-store");
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleEdgeContact(request: Request, env: Env): Promise<Response> {
  const limit = await enforceRateLimit(request, env, "contact");
  if (limit.limited) {
    console.log(JSON.stringify({ message: "edge-check rate limited", kind: "contact" }));
    return json({ error: RATE_LIMIT_MESSAGE }, 429, "no-store", { "retry-after": "60" });
  }

  let text = "";
  try {
    text = await request.text();
  } catch {
    return json({ error: "Không đọc được nội dung gửi lên." }, 400, "no-store");
  }
  if (text.length > 4096) return json({ error: "Nội dung quá dài." }, 400, "no-store");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "Nội dung gửi lên không phải JSON." }, 400, "no-store");
  }
  const record = asRecord(parsed);
  if (!record) return json({ error: "Nội dung gửi lên không hợp lệ." }, 400, "no-store");

  if (cleanText(record.website)) {
    console.log(JSON.stringify({ message: "edge-check contact", honeypot: true }));
    return json({ ok: true }, 200, "no-store");
  }

  const name = cleanText(record.name);
  const email = cleanText(record.email);
  const company = cleanText(record.company);
  const message = cleanText(record.message);
  const domainRaw = cleanText(record.domain);

  if (!name || !email || !message) {
    return json({ error: "Thiếu họ tên, email hoặc lời nhắn." }, 400, "no-store");
  }
  if (name.length > 80 || email.length > 120 || company.length > 80 || message.length > 1000) {
    return json({ error: "Nội dung quá dài." }, 400, "no-store");
  }
  if (/[\u0000-\u001F]/.test(`${name}${company}${message}${email}`)) {
    return json({ error: "Nội dung gửi lên không hợp lệ." }, 400, "no-store");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Email không hợp lệ." }, 400, "no-store");
  }

  let domain = "";
  if (domainRaw) {
    const normalized = normalizeDomain(domainRaw);
    if ("error" in normalized) return json({ error: "Tên miền kèm theo không hợp lệ." }, 400, "no-store");
    domain = normalized.domain;
  }

  // TODO: wire to real lead storage (KV/D1/email) — prototype stub, sends nothing
  console.log(
    JSON.stringify({
      message: "edge-check contact",
      domain,
      nameLength: name.length,
      emailLength: email.length,
      companyLength: company.length,
      messageLength: message.length,
    }),
  );
  return json({ ok: true }, 200, "no-store");
}
