import { isCloudflareIp, isPublicIp } from "./cloudflare-ips.ts";

/**
 * Network owner (who announces the IP) is separate from the CDN in front of a hostname.
 * AWS and Azure own many addresses that are not a CDN. Akamai, Fastly, Zscaler, and
 * similar networks are treated as the CDN when no stronger CNAME or header signal exists.
 */
const ASN_OWNERS: { asn: number; name: string; cdn?: string }[] = [
  { asn: 13335, name: "Cloudflare", cdn: "Cloudflare" },
  { asn: 20940, name: "Akamai", cdn: "Akamai" },
  { asn: 16625, name: "Akamai", cdn: "Akamai" },
  { asn: 21342, name: "Akamai", cdn: "Akamai" },
  { asn: 54113, name: "Fastly", cdn: "Fastly" },
  { asn: 22616, name: "Zscaler", cdn: "Zscaler" },
  { asn: 53813, name: "Zscaler", cdn: "Zscaler" },
  { asn: 62044, name: "Zscaler", cdn: "Zscaler" },
  { asn: 55256, name: "Zscaler", cdn: "Zscaler" },
  { asn: 62907, name: "Zscaler", cdn: "Zscaler" },
  { asn: 19551, name: "Imperva", cdn: "Imperva" },
  { asn: 60068, name: "CDN77", cdn: "CDN77" },
  { asn: 30081, name: "CacheFly", cdn: "CacheFly" },
  { asn: 22822, name: "Edgio", cdn: "Edgio" },
  { asn: 16509, name: "Amazon Web Services" },
  { asn: 14618, name: "Amazon Web Services" },
  { asn: 7224, name: "Amazon Web Services" },
  { asn: 8075, name: "Microsoft Azure" },
  { asn: 8068, name: "Microsoft Azure" },
  { asn: 8069, name: "Microsoft Azure" },
  { asn: 8070, name: "Microsoft Azure" },
  { asn: 8071, name: "Microsoft Azure" },
  { asn: 8072, name: "Microsoft Azure" },
  { asn: 8073, name: "Microsoft Azure" },
  { asn: 8074, name: "Microsoft Azure" },
  { asn: 12076, name: "Microsoft Azure" },
  { asn: 15169, name: "Google Cloud" },
  { asn: 396982, name: "Google Cloud" },
  { asn: 19527, name: "Google" },
  { asn: 36040, name: "Google" },
  { asn: 45102, name: "Alibaba Cloud" },
  { asn: 37963, name: "Alibaba Cloud" },
  { asn: 132203, name: "Tencent Cloud" },
  { asn: 45090, name: "Tencent Cloud" },
  { asn: 14061, name: "DigitalOcean" },
  { asn: 24940, name: "Hetzner" },
  { asn: 16276, name: "OVH" },
  { asn: 20473, name: "Vultr" },
  { asn: 63949, name: "Akamai Connected Cloud" },
  { asn: 36459, name: "GitHub" },
];

const OWNERS_BY_ASN = new Map(ASN_OWNERS.map((item) => [item.asn, item]));

export type NetworkInfo = {
  ip: string;
  asn: number | null;
  org: string | null;
  provider: string | null;
  cdn: string | null;
  country: string | null;
  city: string | null;
};

export function providerNameFromAsn(asn: number): string | null {
  return OWNERS_BY_ASN.get(asn)?.name ?? null;
}

export function cdnNameFromAsn(asn: number): string | null {
  return OWNERS_BY_ASN.get(asn)?.cdn ?? null;
}

export function parseCymruTxt(value: string): { asn: number; country: string | null } | null {
  const text = value.replaceAll('"', "").trim();
  const parts = text.split("|").map((part) => part.trim());
  if (parts.length < 3) return null;
  const asn = Number(parts[0]);
  if (!Number.isInteger(asn) || asn <= 0 || asn > 4_294_967_295) return null;
  const country = parts[2].toUpperCase();
  return { asn, country: /^[A-Z]{2}$/.test(country) ? country : null };
}

export function cymruQueryName(ip: string): string | null {
  if (!isPublicIp(ip) || isCloudflareIp(ip)) return null;
  const v4 = ip.split(".");
  if (v4.length === 4 && v4.every((part) => /^\d{1,3}$/.test(part))) {
    return `${v4.reverse().join(".")}.origin.asn.cymru.com`;
  }
  const nibbles = ipv6Nibbles(ip);
  if (!nibbles) return null;
  return `${nibbles.reverse().join(".")}.origin6.asn.cymru.com`;
}

function ipv6Nibbles(ip: string): string[] | null {
  const text = ip.toLowerCase();
  if (text.includes(".") || text.split("::").length > 2) return null;
  const halves = text.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8) return null;
  const nibbles: string[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const padded = group.padStart(4, "0");
    nibbles.push(...padded.split(""));
  }
  return nibbles;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001F]/g, "").trim();
  if (!text) return null;
  return text.slice(0, 80);
}

function readAsn(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 4_294_967_295) return value;
  if (typeof value !== "string") return null;
  const match = /^(?:AS)?(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const asn = Number(match[1]);
  if (!Number.isInteger(asn) || asn <= 0 || asn > 4_294_967_295) return null;
  return asn;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function networkFromIpwho(ip: string, payload: unknown): NetworkInfo | null {
  const record = asRecord(payload);
  if (!record || record.success !== true) return null;
  const connection = asRecord(record.connection) ?? {};
  const asn = readAsn(connection.asn);
  const org = clean(connection.org) || clean(connection.isp);
  const country = clean(record.country);
  const city = clean(record.city);
  if (!asn && !org && !country && !city) return null;
  return {
    ip,
    asn,
    org,
    provider: asn ? providerNameFromAsn(asn) : null,
    cdn: asn ? cdnNameFromAsn(asn) : null,
    country,
    city,
  };
}

export function networkFromCymru(ip: string, txt: string): NetworkInfo | null {
  const parsed = parseCymruTxt(txt);
  if (!parsed) return null;
  return {
    ip,
    asn: parsed.asn,
    org: null,
    provider: providerNameFromAsn(parsed.asn),
    cdn: cdnNameFromAsn(parsed.asn),
    country: parsed.country,
    city: null,
  };
}

async function readBounded(response: Response, maxBytes: number): Promise<string | null> {
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

export async function lookupNetworkProvider(
  ip: string,
  txt: (name: string) => Promise<string | null>,
): Promise<NetworkInfo | null> {
  if (!isPublicIp(ip) || isCloudflareIp(ip)) return null;
  try {
    const response = await fetch(`https://ipwho.is/${ip}`, {
      headers: { accept: "application/json", "user-agent": "OrangeCloudEdgeCheck/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const body = await readBounded(response, 65_536);
      if (body) {
        const parsed = networkFromIpwho(ip, JSON.parse(body) as unknown);
        if (parsed) return parsed;
      }
    } else {
      await response.body?.cancel();
    }
  } catch {
    /* fall through to the DNS ASN lookup */
  }
  const name = cymruQueryName(ip);
  if (!name) return null;
  try {
    const value = await txt(name);
    if (!value) return null;
    return networkFromCymru(ip, value);
  } catch {
    return null;
  }
}
