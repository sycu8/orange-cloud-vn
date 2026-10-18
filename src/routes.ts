const APEX = "https://orangecloud.vn";

/** HTML documents that are real pages. Any other extensionless HTML 200 is a soft 404. */
const INDEXABLE_HTML = new Set(["/", "/about", "/status"]);

/**
 * Legacy map from the 2026-10-18 audit (§A.1).
 * Full DNS, Partial DNS, and SSL/TLS point at the republished blog articles.
 * Glasswing stays on its interim target. `/about` is intentionally absent.
 * Trailing slashes are stripped before lookup. Query strings are preserved.
 */
const LEGACY_PRESERVE_QUERY: Record<string, string> = {
  "/posts/how-to-configure-cloudflare-full-dns":
    "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-full-dns",
  "/posts/how-to-configure-cloudflare-partial-dns":
    "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-partial-dns",
  "/posts/how-to-configure-cloudflare-ssl-tls":
    "https://blog.orangecloud.vn/posts/how-to-configure-cloudflare-ssl-tls",
  "/posts/project-glasswing-mythos-ai-security":
    "https://blog.orangecloud.vn/posts/cloudflare-ai-triage-bug-bounty-sonnet-58-month-mythos-200k-advice-not-to-copy",
  "/posts": "https://blog.orangecloud.vn/",
  "/archives": "https://blog.orangecloud.vn/",
  "/search": "https://blog.orangecloud.vn/",
  "/rss.xml": "https://blog.orangecloud.vn/feed.xml",
  "/sitemap-index.xml": `${APEX}/sitemap.xml`,
};

const TAGS_TARGET = "https://onboarding.orangecloud.vn/blog/";

const CANONICAL_PATH: Record<string, string> = {
  "/index.html": "/",
  "/about": "/about/",
  "/about/index.html": "/about/",
  "/status": "/status/",
  "/status/index.html": "/status/",
};

export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }
  return pathname;
}

export function apexHostRedirect(url: URL): string | undefined {
  if (url.hostname.toLowerCase() !== "www.orangecloud.vn") return undefined;
  return `${APEX}${url.pathname}${url.search}`;
}

export function canonicalRedirect(pathname: string, search: string): string | undefined {
  const destination = CANONICAL_PATH[pathname];
  if (!destination) return undefined;
  return `${APEX}${destination}${search}`;
}

export function legacyRedirect(pathname: string, search: string): string | undefined {
  const path = normalizePath(pathname);
  const target = LEGACY_PRESERVE_QUERY[path];
  if (target) return `${target}${search}`;
  if (path === "/tags" || path.startsWith("/tags/")) return TAGS_TARGET;
  return undefined;
}

export function shouldServeNotFound(
  pathname: string,
  status: number,
  contentType: string | null,
): boolean {
  if (pathname === "/404.html") return true;
  if (status === 404) return true;
  if (status !== 200) return false;
  if (!(contentType ?? "").toLowerCase().includes("text/html")) return false;
  const path = normalizePath(pathname);
  if (INDEXABLE_HTML.has(path)) return false;
  return !path.includes(".");
}
