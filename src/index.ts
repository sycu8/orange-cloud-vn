const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https://cdn.buymeacoffee.com data:",
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

function withSecurity(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        console.log(
          JSON.stringify({
            message: "health",
            method: request.method,
          }),
        );
        return withSecurity(
          Response.json(
            {
              ok: true,
              studio: "orange-cloud",
              personalProject: true,
              affiliatedWithCloudflareInc: false,
            },
            { headers: { "cache-control": "no-store" } },
          ),
        );
      }

      let response = await env.ASSETS.fetch(request);
      if (
        response.status === 404 &&
        request.method === "GET" &&
        url.pathname !== "/404.html"
      ) {
        const fallback = await env.ASSETS.fetch(new URL("/404.html", url.origin));
        response = new Response(fallback.body, {
          status: 404,
          statusText: "Not Found",
          headers: fallback.headers,
        });
      }

      return withSecurity(response);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "request failed",
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return withSecurity(
        new Response("Orange Cloud is temporarily unavailable.", {
          status: 500,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
