import { isPublicIp } from "./cloudflare-ips.ts";

/** Record types nslookup shows by default, plus HTTPS and DS for DNSSEC. */
export const PANEL_TYPES = ["A", "AAAA", "CNAME", "NS", "MX", "TXT", "SOA", "CAA", "HTTPS", "DS"] as const;
export type PanelType = (typeof PANEL_TYPES)[number];

export const DNS_TYPE_CODE: Record<string, number> = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  NS: 2,
  MX: 15,
  TXT: 16,
  SOA: 6,
  CAA: 257,
  HTTPS: 65,
  DS: 43,
  PTR: 12,
  SRV: 33,
};

export const DNS_RESOLVERS = [
  { id: "cloudflare", name: "Cloudflare", place: "Toàn cầu", placeEn: "Global", endpoint: "https://cloudflare-dns.com/dns-query" },
  { id: "google", name: "Google", place: "Toàn cầu", placeEn: "Global", endpoint: "https://dns.google/resolve" },
  { id: "adguard", name: "AdGuard", place: "Châu Âu", placeEn: "Europe", endpoint: "https://dns.adguard-dns.com/resolve" },
  { id: "nextdns", name: "NextDNS", place: "Toàn cầu", placeEn: "Global", endpoint: "https://dns.nextdns.io/dns-query" },
  { id: "dnssb", name: "DNS.SB", place: "Châu Á", placeEn: "Asia", endpoint: "https://doh.dns.sb/dns-query" },
  { id: "alidns", name: "AliDNS", place: "Trung Quốc", placeEn: "China", endpoint: "https://dns.alidns.com/resolve" },
] as const;

export type DnsRow = {
  type: string;
  ttl: number | null;
  value: string;
};

export type PropagationState = "match" | "differ" | "empty" | "error";

export type PropagationRow = {
  id: string;
  name: string;
  place: string;
  placeEn: string;
  values: string[];
  state: PropagationState;
};

export type PageResource = {
  host: string;
  kinds: string[];
  count: number;
};

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function presentDnsValue(type: string, data: string): string {
  let value = data.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (type === "TXT") return value.replace(/"\s+"/g, "").slice(0, 1024);
  if (type === "MX" || type === "SRV") {
    const match = /^(\d+)\s+(\S+)$/.exec(value);
    if (!match) return value.slice(0, 300);
    return `${match[1]} ${match[2].replace(/\.$/, "").toLowerCase()}`;
  }
  if (type === "SOA" || type === "CAA" || type === "HTTPS" || type === "DS") {
    return value
      .split(/\s+/)
      .map((token) => token.replace(/\.$/, ""))
      .join(" ")
      .slice(0, 500);
  }
  if (type === "CNAME" || type === "NS" || type === "PTR") return value.replace(/\.$/, "").toLowerCase().slice(0, 253);
  return value.toLowerCase().slice(0, 253);
}

export function parseDnsAnswers(payload: unknown, type: string): { ok: boolean; rows: DnsRow[] } {
  if (!payload || typeof payload !== "object") return { ok: false, rows: [] };
  const record = payload as { Status?: unknown; Answer?: unknown };
  const status = record.Status;
  if (status !== 0 && status !== 3) return { ok: false, rows: [] };
  if (!Array.isArray(record.Answer)) return { ok: true, rows: [] };
  const wanted = DNS_TYPE_CODE[type];
  const rows: DnsRow[] = [];
  const seen = new Set<string>();
  for (const item of record.Answer) {
    if (!item || typeof item !== "object") continue;
    const answer = item as { type?: unknown; TTL?: unknown; data?: unknown };
    if (answer.type !== wanted || typeof answer.data !== "string") continue;
    const value = presentDnsValue(type, answer.data);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const ttl = typeof answer.TTL === "number" && Number.isFinite(answer.TTL) ? Math.max(0, Math.trunc(answer.TTL)) : null;
    rows.push({ type, ttl, value });
    if (rows.length >= 32) break;
  }
  return { ok: true, rows };
}

export function ptrQueryName(ip: string): string | null {
  if (!isPublicIp(ip)) return null;
  const v4 = ip.split(".");
  if (v4.length === 4 && v4.every((part) => /^\d{1,3}$/.test(part))) {
    return `${[...v4].reverse().join(".")}.in-addr.arpa`;
  }
  const text = ip.toLowerCase();
  if (text.includes(".") || text.split("::").length > 2) return null;
  const halves = text.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  const nibbles = groups.flatMap((group) => group.padStart(4, "0").split("")).reverse();
  return `${nibbles.join(".")}.ip6.arpa`;
}

export function comparePropagation(
  baseValues: readonly string[],
  answers: readonly { id: string; name: string; place: string; placeEn: string; ok: boolean; values: readonly string[] }[],
): PropagationRow[] {
  const base = [...new Set(baseValues.map((value) => value.toLowerCase()))].sort();
  return answers.map((answer) => {
    const values = [...new Set(answer.values.map((value) => value.toLowerCase()))].sort();
    let state: PropagationState;
    if (!answer.ok) state = "error";
    else if (values.length === 0) state = "empty";
    else if (values.join("\n") === base.join("\n")) state = "match";
    else state = "differ";
    return { id: answer.id, name: answer.name, place: answer.place, placeEn: answer.placeEn, values, state };
  });
}

function attributeValue(source: string, name: string): string {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i").exec(source);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function resourceKind(tag: string, attrs: string): { attribute: string; kind: string } | null {
  if (tag === "script") return { attribute: "src", kind: "script" };
  if (tag === "img") return { attribute: "src", kind: "image" };
  if (tag === "iframe") return { attribute: "src", kind: "frame" };
  if (tag === "video" || tag === "audio" || tag === "source") return { attribute: "src", kind: "media" };
  if (tag !== "link") return null;
  const rel = attributeValue(attrs, "rel").toLowerCase();
  const as = attributeValue(attrs, "as").toLowerCase();
  if (rel.includes("stylesheet") || as === "style") return { attribute: "href", kind: "style" };
  if (as === "font") return { attribute: "href", kind: "font" };
  if (as === "script") return { attribute: "href", kind: "script" };
  if (as === "image") return { attribute: "href", kind: "image" };
  if (rel.includes("preload") && (as === "video" || as === "audio")) return { attribute: "href", kind: "media" };
  return null;
}

export function extractPageResources(html: string, pageUrl: string, limit = 16): { resources: PageResource[]; truncated: boolean } {
  const grouped = new Map<string, PageResource>();
  let truncated = false;
  const tags = /<([a-zA-Z][\w:-]*)(\s[^>]{0,2000})?>/g;
  let match: RegExpExecArray | null;
  let seenTags = 0;
  while ((match = tags.exec(html))) {
    seenTags += 1;
    if (seenTags > 4000) {
      truncated = true;
      break;
    }
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? "";
    const spec = resourceKind(tag, attrs);
    if (!spec) continue;
    let raw = attributeValue(attrs, spec.attribute);
    if (!raw && spec.attribute === "src") raw = attributeValue(attrs, "srcset").split(",")[0]?.trim().split(/\s+/)[0] ?? "";
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("javascript:")) continue;
    let url: URL;
    try {
      url = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!HOSTNAME.test(host)) continue;
    const current = grouped.get(host);
    if (current) {
      current.count += 1;
      if (!current.kinds.includes(spec.kind)) current.kinds.push(spec.kind);
      continue;
    }
    if (grouped.size >= limit) {
      truncated = true;
      continue;
    }
    grouped.set(host, { host, kinds: [spec.kind], count: 1 });
  }
  return { resources: [...grouped.values()], truncated };
}
