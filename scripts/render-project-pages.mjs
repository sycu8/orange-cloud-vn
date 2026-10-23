import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PROJECT_PAGES } from "../src/project-catalog.ts";
import { renderProjectPage } from "../src/render-project-page.ts";
import { indexablePaths } from "../src/routes.ts";

const root = new URL("..", import.meta.url).pathname;
const updated = "2026-10-23";

for (const project of PROJECT_PAGES) {
  const file = join(root, "public", "projects", project.slug, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderProjectPage(project));
}

const urls = indexablePaths();
const body = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...urls.flatMap((path) => {
    const loc = `https://orangecloud.vn${path === "/" ? "/" : path}`;
    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      `    <lastmod>${updated}</lastmod>`,
      `    <xhtml:link rel="alternate" hreflang="vi" href="${loc}" />`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${loc}" />`,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />`,
      "  </url>",
    ];
  }),
  "</urlset>",
  "",
].join("\n");

writeFileSync(join(root, "public", "sitemap.xml"), body);
console.log(`wrote ${PROJECT_PAGES.length} project pages and sitemap.xml`);
