/**
 * Published Cloudflare proxy ranges.
 * Source: https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
 * Retrieved 2026-10-18. These are the anycast ranges used when a DNS record is
 * proxied (orange cloud). They do not include every Cloudflare IP, such as
 * the 1.1.1.1 resolver's IPv4 address.
 */
export const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

export const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

const PRIVATE_IPV4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value;
}

function inIpv4Cidr(ip: number, cidr: string): boolean {
  const [base, bitsText] = cidr.split("/");
  const bits = Number(bitsText);
  const baseInt = ipv4ToInt(base);
  if (baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

function expandIpv6(ip: string): number[] | null {
  const text = ip.toLowerCase();
  if (text.includes(".")) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8) return null;
  const numbers = groups.map((group) => {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return Number.NaN;
    return Number.parseInt(group, 16);
  });
  if (numbers.some((group) => Number.isNaN(group))) return null;
  return numbers;
}

function inIpv6Cidr(ip: number[], cidr: string): boolean {
  const [base, bitsText] = cidr.split("/");
  const bits = Number(bitsText);
  const baseGroups = expandIpv6(base);
  if (!baseGroups || !Number.isInteger(bits) || bits < 0 || bits > 128) return false;
  let remaining = bits;
  for (let index = 0; index < 8; index += 1) {
    const take = Math.min(16, remaining);
    const mask = take === 0 ? 0 : (0xffff << (16 - take)) & 0xffff;
    if ((ip[index] & mask) !== (baseGroups[index] & mask)) return false;
    remaining -= take;
  }
  return true;
}

export function isCloudflareIp(ip: string): boolean {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return CLOUDFLARE_IPV4.some((cidr) => inIpv4Cidr(v4, cidr));
  const v6 = expandIpv6(ip);
  if (!v6) return false;
  return CLOUDFLARE_IPV6.some((cidr) => inIpv6Cidr(v6, cidr));
}

/** True for globally routable addresses. Private, loopback, and reserved ranges are false. */
export function isPublicIp(ip: string): boolean {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return !PRIVATE_IPV4.some((cidr) => inIpv4Cidr(v4, cidr));
  const v6 = expandIpv6(ip);
  if (!v6) return false;
  if (v6.every((group) => group === 0)) return false;
  if (v6[0] === 0 && v6[1] === 0 && v6[2] === 0 && v6[3] === 0 && v6[4] === 0 && v6[5] === 0 && v6[6] === 0 && v6[7] === 1) {
    return false;
  }
  const first = v6[0];
  if ((first & 0xfe00) === 0xfc00) return false;
  if ((first & 0xffc0) === 0xfe80) return false;
  if ((first & 0xff00) === 0xff00) return false;
  if (first === 0x2001 && v6[1] === 0x0db8) return false;
  return true;
}
