import { handleEdgeCheck, handleEdgeContact } from "./edge-check.ts";
import {
  apexHostRedirect,
  canonicalRedirect,
  legacyRedirect,
  shouldServeNotFound,
} from "./routes.ts";

const BASE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https://cdn.buymeacoffee.com data:",
  "connect-src 'self'",
].join("; ");

function safePath(pathname: string): string {
  return pathname.replace(/[^\x20-\x7E]/g, "?").slice(0, 200);
}

function withSecurity(response: Response, secure: boolean): Response {
  const headers = new Headers(response.headers);
  const csp = secure ? `${BASE_CSP}; upgrade-insecure-requests` : BASE_CSP;
  headers.set("content-security-policy", csp);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  headers.set("cross-origin-opener-policy", "same-origin");
  const contentType = headers.get("content-type");
  if (
    contentType &&
    contentType.toLowerCase().startsWith("text/html") &&
    !/charset=/i.test(contentType)
  ) {
    headers.set("content-type", "text/html; charset=utf-8");
  }
  if (secure) {
    headers.set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function redirect(location: string, secure: boolean): Response {
  return withSecurity(
    new Response(null, {
      status: 301,
      headers: {
        location,
        "cache-control": "public, max-age=86400",
      },
    }),
    secure,
  );
}

function methodNotAllowed(allow: string, secure: boolean): Response {
  return withSecurity(
    new Response("Method Not Allowed", {
      status: 405,
      headers: {
        allow,
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    }),
    secure,
  );
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const secure = url.protocol === "https:";
    const method = request.method.toUpperCase();

    try {
      if (method === "TRACE" || method === "TRACK") {
        return methodNotAllowed("GET, HEAD", secure);
      }

      if (method === "GET" || method === "HEAD") {
        const hostTarget = apexHostRedirect(url);
        if (hostTarget) return redirect(hostTarget, secure);
        const canonicalTarget = canonicalRedirect(url.pathname, url.search);
        if (canonicalTarget) return redirect(canonicalTarget, secure);
        const legacyTarget = legacyRedirect(url.pathname, url.search);
        if (legacyTarget) return redirect(legacyTarget, secure);
      }

      if (url.pathname === "/api/health") {
        if (method !== "GET" && method !== "HEAD") {
          return methodNotAllowed("GET, HEAD", secure);
        }

        console.log(
          JSON.stringify({
            message: "health",
            method,
          }),
        );

        const body = {
          ok: true,
          studio: "orange-cloud",
          personalProject: true,
          affiliatedWithCloudflareInc: false,
        };

        if (method === "HEAD") {
          return withSecurity(
            new Response(null, {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              },
            }),
            secure,
          );
        }

        return withSecurity(
          Response.json(body, {
            headers: { "cache-control": "no-store" },
          }),
          secure,
        );
      }

      if (url.pathname === "/api/edge-check" && (method === "GET" || method === "HEAD")) {
        const response = await handleEdgeCheck(request, env, ctx);
        if (method === "HEAD") await response.body?.cancel();
        return withSecurity(
          new Response(method === "HEAD" ? null : response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          }),
          secure,
        );
      }

      if (url.pathname === "/api/edge-check/contact" && method === "POST") {
        return withSecurity(await handleEdgeContact(request, env), secure);
      }

      if (method !== "GET" && method !== "HEAD") {
        return methodNotAllowed("GET, HEAD", secure);
      }

      let response = await env.ASSETS.fetch(request);
      if (
        shouldServeNotFound(
          url.pathname,
          response.status,
          response.headers.get("content-type"),
        )
      ) {
        await response.body?.cancel();
        const fallback = await env.ASSETS.fetch(new URL("/404.html", url.origin));
        if (method === "HEAD") await fallback.body?.cancel();
        const headers = new Headers(fallback.headers);
        headers.set("x-robots-tag", "noindex");
        headers.set("cache-control", "no-store");
        response = new Response(method === "HEAD" ? null : fallback.body, {
          status: 404,
          statusText: "Not Found",
          headers,
        });
      }

      return withSecurity(response, secure);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "request failed",
          path: safePath(url.pathname),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return withSecurity(
        new Response("Orange Cloud is temporarily unavailable.", {
          status: 500,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
        secure,
      );
    }
  },
} satisfies ExportedHandler<Env>;
