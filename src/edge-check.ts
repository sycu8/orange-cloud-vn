import { isCloudflareIp, isPublicIp } from "./cloudflare-ips.ts";
import {
  lookupNetworkProvider,
  type NetworkInfo,
} from "./network-provider.ts";

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
export type DnsType = "A" | "AAAA" | "CNAME" | "NS" | "TXT";
export type SetupMode = "full" | "partial" | "none" | "unknown";

/** Common names always run. Certificate Transparency names fill the rest, then stop. */
export const MAX_DNS_HOSTS = 40;
export const MAX_HTTP_PROBES = 16;
export const MAX_NETWORK_LOOKUPS = 24;
const MAX_CT_NAMES = 400;
const MAX_CT_BYTES = 1_500_000;

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
  network: NetworkInfo | null;
  evidence: string[];
  originExposed: boolean;
  /** Set when a CNAME points at a cloud host that is not itself a CDN. */
  hosting: string | null;
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

export type DiscoveryInfo = {
  source: "crt.sh" | "common";
  found: number;
  scanned: number;
  truncated: boolean;
};

export type EdgeReport = {
  domain: string;
  hosts: HostResult[];
  summary: Record<HostStatus, number>;
  recommendations: Recommendation[];
  setup: {
    mode: SetupMode;
    nameservers: string[];
  };
  discovery: DiscoveryInfo;
  cdn: string[];
  networks: string[];
};

export type DiscoverResult = {
  names: string[];
  source: "crt.sh" | "common";
  truncated: boolean;
};

type ProviderId =
  | "cloudflare"
  | "cloudfront"
  | "fastly"
  | "akamai"
  | "azure"
  | "azurehost"
  | "aws"
  | "google"
  | "vercel"
  | "netlify"
  | "bunny"
  | "byteplus"
  | "alibaba"
  | "tencent"
  | "zscaler"
  | "imperva"
  | "sucuri";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  cloudflare: "Cloudflare",
  cloudfront: "Amazon CloudFront",
  fastly: "Fastly",
  akamai: "Akamai",
  azure: "Azure Front Door",
  azurehost: "Microsoft Azure",
  aws: "Amazon Web Services",
  google: "Google",
  vercel: "Vercel",
  netlify: "Netlify",
  bunny: "Bunny",
  byteplus: "BytePlus",
  alibaba: "Alibaba CDN",
  tencent: "Tencent CDN",
  zscaler: "Zscaler",
  imperva: "Imperva",
  sucuri: "Sucuri",
};

const HOSTING_PROVIDERS = new Set<ProviderId>(["aws", "azurehost"]);

const CNAME_SUFFIXES: { id: ProviderId; suffixes: string[] }[] = [
  { id: "cloudflare", suffixes: ["cdn.cloudflare.net", "cloudflare.net", "pages.dev", "workers.dev"] },
  { id: "cloudfront", suffixes: ["cloudfront.net"] },
  { id: "fastly", suffixes: ["fastly.net", "fastlylb.net"] },
  { id: "akamai", suffixes: ["akamai.net", "akamaiedge.net", "akamaihd.net", "edgekey.net", "edgesuite.net", "akamaized.net"] },
  { id: "azure", suffixes: ["azurefd.net", "azureedge.net"] },
  { id: "azurehost", suffixes: ["azurewebsites.net", "cloudapp.azure.com", "trafficmanager.net"] },
  { id: "aws", suffixes: ["awsglobalaccelerator.com", "amazonaws.com"] },
  { id: "zscaler", suffixes: ["zscaler.net", "zscloud.net", "zscaler.com"] },
  { id: "imperva", suffixes: ["incapdns.net", "impervadns.net"] },
  { id: "sucuri", suffixes: ["sucuri.net"] },
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
  discover?: (domain: string) => Promise<DiscoverResult>;
  network?: (ip: string) => Promise<NetworkInfo | null>;
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

/** CDN headers that belong to the origin. `cf-ray` is handled separately. */
export function providerFromHeaders(headers: Headers): ProviderId | null {
  const specific = specificProviderFromHeaders(headers);
  if (specific) return specific;
  if (hasCloudflareStamp(headers)) return "cloudflare";
  return null;
}

function specificProviderFromHeaders(headers: Headers): ProviderId | null {
  const server = (headers.get("server") ?? "").toLowerCase();
  const via = (headers.get("via") ?? "").toLowerCase();
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
  if (headers.has("x-sucuri-id") || server.includes("sucuri")) return "sucuri";
  if (headers.has("x-iinfo")) return "imperva";
  const cdnHeader = (headers.get("x-cdn") ?? "").toLowerCase();
  if (cdnHeader.includes("incapsula") || cdnHeader.includes("imperva")) return "imperva";
  if (server.includes("zscaler") || via.includes("zscaler")) return "zscaler";
  return null;
}

/**
 * A Worker subrequest is stamped with `cf-ray` and often `server: cloudflare`
 * even when the target is not proxied. That pair is not proof of orange-cloud.
 */
function hasCloudflareStamp(headers: Headers): boolean {
  const server = (headers.get("server") ?? "").toLowerCase();
  return headers.has("cf-ray") || server.includes("cloudflare");
}

function headerEvidence(headers: Headers, includeCloudflareStamp: boolean): string[] {
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
    "x-sucuri-id",
    "x-iinfo",
    "x-cdn",
  ];
  const items: string[] = [];
  for (const name of names) {
    const value = headers.get(name);
    if (!value) continue;
    const stamped =
      name === "cf-ray" || (name === "server" && value.toLowerCase().includes("cloudflare"));
    if (stamped && !includeCloudflareStamp) continue;
    items.push(`header:${name}=${value.slice(0, 80)}`);
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
  const specificHeader = input.headers ? specificProviderFromHeaders(input.headers) : null;
  let cnameProvider: ProviderId | null = null;
  let hosting: string | null = null;
  for (const target of records.cname) {
    const matched = providerFromCname(target);
    if (!matched) continue;
    if (HOSTING_PROVIDERS.has(matched)) {
      hosting = PROVIDER_LABEL[matched];
      continue;
    }
    cnameProvider = matched;
    break;
  }
  const addresses = [...records.a, ...records.aaaa];
  const ipCloudflare = addresses.some((ip) => isCloudflareIp(ip));
  const publicNonCloudflare = addresses.filter((ip) => isPublicIp(ip) && !isCloudflareIp(ip));
  const dnsCloudflare = ipCloudflare || cnameProvider === "cloudflare";
  // Published ranges and CDN CNAMEs decide Cloudflare. A cf-ray stamp on a
  // Worker subrequest must not relabel a non-Cloudflare address.
  let providerId: ProviderId | null = null;
  if (dnsCloudflare && publicNonCloudflare.length === 0) providerId = "cloudflare";
  else if (specificHeader) providerId = specificHeader;
  else if (cnameProvider && cnameProvider !== "cloudflare") providerId = cnameProvider;
  else if (dnsCloudflare) providerId = "cloudflare";
  const hasRecords = records.cname.length + records.a.length + records.aaaa.length > 0;

  let status: HostStatus;
  if (!hasRecords && !providerId) status = "no_record";
  else if (providerId === "cloudflare") status = "cloudflare";
  else if (providerId) status = "other_cdn";
  else if (hasRecords) status = "direct";
  else status = "no_record";

  const evidence = [
    ...records.cname.map((value) => `cname:${value}`),
    ...records.a.map((value) => (isCloudflareIp(value) ? `a:${value} cloudflare` : `a:${value}`)),
    ...records.aaaa.map((value) => (isCloudflareIp(value) ? `aaaa:${value} cloudflare` : `aaaa:${value}`)),
    ...(input.headers ? headerEvidence(input.headers, dnsCloudflare) : []),
    ...input.notes,
  ].slice(0, 16);

  const originExposed = publicNonCloudflare.length > 0 && status !== "other_cdn" && status !== "no_record";
  if (originExposed) evidence.push("origin_ip_public");

  return {
    role: input.role,
    host: input.host,
    records,
    status,
    provider: providerId ? PROVIDER_LABEL[providerId] : null,
    network: null,
    evidence,
    originExposed,
    hosting,
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

const DNS_TYPE_CODE: Record<DnsType, number> = { A: 1, AAAA: 28, CNAME: 5, NS: 2, TXT: 16 };

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

async function readCappedBody(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function defaultDiscover(domain: string): Promise<DiscoverResult> {
  try {
    const response = await fetch(`https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`, {
      headers: { accept: "application/json", "user-agent": "OrangeCloudEdgeCheck/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { names: [], source: "common", truncated: false };
    }
    const body = await readCappedBody(response, MAX_CT_BYTES);
    if (body === null) return { names: [], source: "common", truncated: true };
    const parsed = parseCertificateNames(domain, JSON.parse(body) as unknown);
    return { names: parsed.names, source: "crt.sh", truncated: parsed.truncated };
  } catch {
    return { names: [], source: "common", truncated: false };
  }
}

async function defaultNetwork(ip: string): Promise<NetworkInfo | null> {
  return lookupNetworkProvider(ip, async (name) => {
    const result = await defaultLookup(name, "TXT");
    return result.ok ? (result.values[0] ?? null) : null;
  });
}

const defaultDeps: LookupDeps = {
  lookup: defaultLookup,
  probe: defaultProbe,
  discover: defaultDiscover,
  network: defaultNetwork,
};

const emptyDiscover = async (): Promise<DiscoverResult> => ({
  names: [],
  source: "common",
  truncated: false,
});

export function parseCertificateNames(domain: string, payload: unknown): { names: string[]; truncated: boolean } {
  const found = new Set<string>();
  let truncated = false;
  if (!Array.isArray(payload)) return { names: [], truncated: false };
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const record = row as { name_value?: unknown; common_name?: unknown };
    const raw = [record.name_value, record.common_name].filter((item): item is string => typeof item === "string").join("\n");
    for (const part of raw.split(/[\s,]+/)) {
      let name = part.trim().toLowerCase().replace(/\.$/, "");
      if (name.startsWith("*.")) name = name.slice(2);
      if (!name || name.includes("*")) continue;
      if (name !== domain && !name.endsWith(`.${domain}`)) continue;
      if (!HOST_RE.test(name)) continue;
      if (found.has(name)) continue;
      if (found.size >= MAX_CT_NAMES) {
        truncated = true;
        break;
      }
      found.add(name);
    }
    if (truncated) break;
  }
  const names = [...found].sort((left, right) => left.length - right.length || left.localeCompare(right));
  return { names, truncated };
}

export function extraHostsForDomain(
  domain: string,
  discovered: readonly string[],
): { hosts: { role: string; host: string }[]; truncated: boolean } {
  const seen = new Set(hostsForDomain(domain).map((item) => item.host));
  const extras: { role: string; host: string }[] = [];
  const sorted = [...discovered].sort((left, right) => left.length - right.length || left.localeCompare(right));
  for (const name of sorted) {
    const host = name.toLowerCase().replace(/\.$/, "");
    if (seen.has(host)) continue;
    if (host !== domain && !host.endsWith(`.${domain}`)) continue;
    if (!HOST_RE.test(host)) continue;
    seen.add(host);
    extras.push({ role: "subdomain", host });
  }
  const room = Math.max(0, MAX_DNS_HOSTS - hostsForDomain(domain).length);
  return { hosts: extras.slice(0, room), truncated: extras.length > room };
}

export function classifySetup(
  nameservers: readonly string[],
  anyCloudflare: boolean,
  lookupOk: boolean,
  placement: "cloudflare" | "mixed" | "other" | "unknown" = "unknown",
): SetupMode {
  if (!lookupOk) return "unknown";
  const names = nameservers
    .map((item) => item.toLowerCase().replace(/\.$/, ""))
    .filter((item) => HOST_RE.test(item));
  if (names.length === 0) return anyCloudflare ? "partial" : "unknown";
  const cloudflareNames = names.filter((item) => item.endsWith(".ns.cloudflare.com"));
  if (cloudflareNames.length === names.length || placement === "cloudflare") return "full";
  if (cloudflareNames.length > 0 || placement === "mixed" || anyCloudflare) return "partial";
  if (placement === "other") return "none";
  return "unknown";
}

async function nameserverPlacement(
  nameservers: readonly string[],
  deps: LookupDeps,
): Promise<"cloudflare" | "mixed" | "other" | "unknown"> {
  let cloudflare = 0;
  let other = 0;
  let unknown = 0;
  await mapPool(nameservers, LOOKUP_CONCURRENCY, async (nameserver) => {
    if (nameserver.endsWith(".ns.cloudflare.com")) {
      cloudflare += 1;
      return;
    }
    const [address, address6] = await Promise.all([deps.lookup(nameserver, "A"), deps.lookup(nameserver, "AAAA")]);
    if (!address.ok && !address6.ok) {
      unknown += 1;
      return;
    }
    const ips = [...address.values, ...address6.values];
    if (ips.length === 0) {
      unknown += 1;
      return;
    }
    if (ips.every((ip) => isCloudflareIp(ip))) cloudflare += 1;
    else other += 1;
  });
  if (other > 0 && cloudflare > 0) return "mixed";
  if (other > 0 && unknown === 0) return "other";
  if (other > 0) return "mixed";
  if (cloudflare === nameservers.length) return "cloudflare";
  return "unknown";
}

function attachNetwork(host: HostResult, info: NetworkInfo): void {
  host.network = info;
  const notes = [`asn:${info.asn ?? "unknown"}`];
  if (info.provider) notes.push(`net:${info.provider}`);
  else if (info.org) notes.push(`net:${info.org}`);
  const place = [info.city, info.country].filter((item): item is string => Boolean(item)).join(", ");
  if (place) notes.push(`geo:${place}`);
  host.evidence = [...host.evidence, ...notes].slice(0, 20);
  if (host.status === "direct" && info.cdn) {
    host.status = info.cdn === "Cloudflare" ? "cloudflare" : "other_cdn";
    host.provider = info.cdn;
    host.originExposed = false;
    host.evidence = host.evidence.filter((item) => item !== "origin_ip_public");
  }
}

function cdnLabels(hosts: readonly HostResult[]): string[] {
  const labels: string[] = [];
  for (const host of hosts) {
    if (host.status !== "cloudflare" && host.status !== "other_cdn") continue;
    if (!host.provider || labels.includes(host.provider)) continue;
    labels.push(host.provider);
  }
  return labels;
}

function networkLabels(hosts: readonly HostResult[], cdn: readonly string[]): string[] {
  const skip = new Set(cdn);
  const labels: string[] = [];
  for (const host of hosts) {
    const label = host.network?.provider || host.network?.org;
    if (!label || skip.has(label) || labels.includes(label)) continue;
    labels.push(label);
  }
  return labels.slice(0, 12);
}

function setupRecommendation(mode: SetupMode): Recommendation | null {
  if (mode === "full") {
    return {
      id: "setup-full",
      tone: "good",
      text: "Nameserver đang trỏ Cloudflare. Đây là Full DNS setup: vùng DNS công khai của tên miền nằm trên Cloudflare.",
      textEn: "Nameservers point at Cloudflare. This is a Full DNS setup: the public zone is hosted on Cloudflare.",
      links: [{ href: FULL_DNS, label: "Full DNS", labelEn: "Full DNS" }],
    };
  }
  if (mode === "partial") {
    return {
      id: "setup-partial",
      tone: "info",
      text: "Có hostname đang đi qua Cloudflare trong khi nameserver không thuộc (hoặc chưa đủ) Cloudflare. Đây là Partial setup dạng CNAME.",
      textEn:
        "Some hostnames go through Cloudflare while the nameservers are not all Cloudflare. This is a Partial (CNAME) setup.",
      links: [
        { href: PARTIAL_DNS, label: "Partial DNS", labelEn: "Partial DNS" },
        { href: FULL_DNS, label: "Full DNS", labelEn: "Full DNS" },
      ],
    };
  }
  if (mode === "unknown") {
    return {
      id: "setup-unknown",
      tone: "info",
      text: "Không đọc được nameserver, nên chưa phân biệt được Full DNS và Partial (CNAME) setup.",
      textEn: "Nameservers could not be read, so Full DNS and Partial (CNAME) setup could not be told apart.",
      links: [],
    };
  }
  return null;
}

async function scanHosts(
  items: readonly { role: string; host: string }[],
  deps: LookupDeps,
  probesLeft: { count: number },
): Promise<HostResult[]> {
  const resolved = await mapPool(items, LOOKUP_CONCURRENCY, async (item) => {
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
    if (!cname.ok && !a.ok && !aaaa.ok) notes.push("dns_lookup_failed");
    return { role: item.role, host: item.host, records, notes, probe: false, headers: null as Headers | null };
  });

  for (const row of resolved) {
    const hasRecords = row.records.cname.length + row.records.a.length + row.records.aaaa.length > 0;
    const privateAddress = [...row.records.a, ...row.records.aaaa].some((ip) => !isPublicIp(ip));
    if (row.role === "mail") row.notes.push("probe_skipped:mail");
    else if (!hasRecords) row.notes.push("probe_skipped:no_record");
    else if (privateAddress) row.notes.push("probe_skipped:private_address");
    else if (probesLeft.count <= 0) row.notes.push("probe_skipped:cap");
    else {
      row.probe = true;
      probesLeft.count -= 1;
    }
  }

  await mapPool(
    resolved.filter((row) => row.probe),
    LOOKUP_CONCURRENCY,
    async (row) => {
      row.headers = await deps.probe(row.host);
      if (!row.headers) row.notes.push("probe_failed");
    },
  );

  return resolved.map((row) =>
    classifyHost({
      role: row.role,
      host: row.host,
      records: row.records,
      headers: row.headers,
      notes: row.notes,
    }),
  );
}

export async function inspectDomain(domain: string, deps: LookupDeps = defaultDeps): Promise<EdgeReport> {
  const discover = deps.discover ?? emptyDiscover;
  const probesLeft = { count: MAX_HTTP_PROBES };
  const discoveredPromise = discover(domain);
  const nameserverPromise = deps.lookup(domain, "NS");
  const base = await scanHosts(hostsForDomain(domain), deps, probesLeft);
  let discovered: DiscoverResult;
  try {
    discovered = await discoveredPromise;
  } catch {
    discovered = { names: [], source: "common", truncated: false };
  }
  const extras = extraHostsForDomain(domain, discovered.names);
  const extraHosts = extras.hosts.length > 0 ? await scanHosts(extras.hosts, deps, probesLeft) : [];
  const hosts = [...base, ...extraHosts];

  if (deps.network) {
    const addresses: string[] = [];
    const seenIps = new Set<string>();
    let overflow = false;
    for (const host of hosts) {
      for (const ip of [...host.records.a, ...host.records.aaaa]) {
        if (!isPublicIp(ip) || isCloudflareIp(ip) || seenIps.has(ip)) continue;
        seenIps.add(ip);
        if (addresses.length >= MAX_NETWORK_LOOKUPS) {
          overflow = true;
          continue;
        }
        addresses.push(ip);
      }
    }
    const infos = await mapPool(addresses, LOOKUP_CONCURRENCY, async (ip) => {
      try {
        return await deps.network!(ip);
      } catch {
        return null;
      }
    });
    const lookedUp = new Map<string, NetworkInfo | null>();
    addresses.forEach((ip, index) => lookedUp.set(ip, infos[index] ?? null));
    for (const host of hosts) {
      const ips = [...host.records.a, ...host.records.aaaa];
      const ip = ips.find((item) => lookedUp.has(item));
      const info = ip ? lookedUp.get(ip) : undefined;
      if (info) attachNetwork(host, info);
      else if (overflow && ips.some((item) => isPublicIp(item) && !isCloudflareIp(item) && !lookedUp.has(item))) {
        host.evidence = [...host.evidence, "network_lookup_capped"].slice(0, 20);
      }
    }
  }
  for (const host of hosts) {
    if (host.network || !host.hosting) continue;
    const ip = [...host.records.a, ...host.records.aaaa].find((item) => isPublicIp(item)) ?? "";
    host.network = { ip, asn: null, org: null, provider: host.hosting, cdn: null, country: null, city: null };
  }

  let nsResult: LookupResult;
  try {
    nsResult = await nameserverPromise;
  } catch {
    nsResult = { ok: false, values: [] };
  }
  const nameservers = (nsResult.ok ? nsResult.values : [])
    .map((item) => item.toLowerCase().replace(/\.$/, ""))
    .filter((item) => HOST_RE.test(item))
    .slice(0, 8);
  const anyCloudflare = hosts.some((host) => host.status === "cloudflare");
  const placement =
    nsResult.ok && nameservers.some((item) => !item.endsWith(".ns.cloudflare.com"))
      ? await nameserverPlacement(nameservers, deps)
      : "unknown";
  const mode = classifySetup(nameservers, anyCloudflare, nsResult.ok, placement);
  const cdn = cdnLabels(hosts);
  const networks = networkLabels(hosts, cdn);
  const recommendations = buildRecommendations(hosts);
  const setupNote = setupRecommendation(mode);
  if (setupNote) recommendations.push(setupNote);

  return {
    domain,
    hosts,
    summary: summarize(hosts),
    recommendations,
    setup: { mode, nameservers },
    discovery: {
      source: discovered.source === "crt.sh" ? "crt.sh" : "common",
      found: discovered.source === "crt.sh" ? discovered.names.length : 0,
      scanned: hosts.length,
      truncated: Boolean(discovered.truncated) || extras.truncated,
    },
    cdn,
    networks,
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
  return new Request(`https://edge-check.cache/v3/${domain}`);
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
        setup: report.setup.mode,
        scanned: report.discovery.scanned,
        found: report.discovery.found,
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
