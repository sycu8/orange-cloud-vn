import {
  PERSON_ID,
  PERSON_SAME_AS,
  projectPublicPath,
  type ProjectPage,
} from "./project-catalog.ts";

const UPDATED = "2026-10-23";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hreflang(canonical: string): string {
  return [
    `    <link rel="alternate" hreflang="vi" href="${canonical}" />`,
    `    <link rel="alternate" hreflang="en" href="${canonical}" />`,
    `    <link rel="alternate" hreflang="x-default" href="${canonical}" />`,
  ].join("\n");
}

export function renderProjectPage(project: ProjectPage): string {
  const path = projectPublicPath(project.slug);
  const canonical = `https://orangecloud.vn${path}`;
  const questionVi = `${project.nameVi} là gì?`;
  const questionEn = `What is ${project.nameEn}?`;
  const external = (href: string) => href.startsWith("http");
  const link = (href: string, labelVi: string, labelEn: string, solid = false) => {
    const classes = solid ? "btn btn-solid" : "btn";
    const ext = external(href) ? " ext" : "";
    const attrs = external(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
    const sr = external(href)
      ? ' <span class="sr-only" data-en="(opens in a new tab)">(mở tab mới)</span>'
      : "";
    return `            <a class="${classes}${ext}" href="${escapeHtml(href)}"${attrs}><span data-en="${escapeHtml(labelEn)}">${escapeHtml(labelVi)}</span>${sr}</a>`;
  };

  const actionLinks = [
    ...project.links.map((item, index) => link(item.href, item.labelVi, item.labelEn, index === 0)),
    ...(project.github
      ? [link(project.github, "Mã nguồn", "Source")]
      : []),
    link(`/#${project.anchor}`, "Về danh sách dự án", "Back to the project list"),
  ].join("\n");

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Person", "Organization"],
        "@id": PERSON_ID,
        name: "Cường Lê Sỹ",
        alternateName: ["Cuong Le Sy", "Cuong Le", "Sycule", "Orange Cloud"],
        url: "https://orangecloud.vn/about/",
        sameAs: [...PERSON_SAME_AS],
        knowsLanguage: ["vi", "en"],
        description:
          "Maintains Orange Cloud in a personal capacity. Orange Cloud is not a publication of Cloudflare, Inc. and is not affiliated with Cloudflare, Inc.",
      },
      {
        "@type": "WebSite",
        "@id": "https://orangecloud.vn/#website",
        name: "Orange Cloud",
        url: "https://orangecloud.vn/",
        inLanguage: ["vi", "en"],
        author: { "@id": PERSON_ID },
        publisher: { "@id": PERSON_ID },
      },
      {
        "@type": "WebPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: project.nameVi,
        inLanguage: ["vi", "en"],
        isPartOf: { "@id": "https://orangecloud.vn/#website" },
        about: { "@id": PERSON_ID },
        dateModified: UPDATED,
        description: project.ledeEn,
      },
      {
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        url: `${canonical}#faq`,
        inLanguage: ["vi", "en"],
        isPartOf: { "@id": "https://orangecloud.vn/#website" },
        mainEntity: [
          {
            "@type": "Question",
            name: questionVi,
            acceptedAnswer: { "@type": "Answer", text: project.ledeVi },
          },
          {
            "@type": "Question",
            name: questionEn,
            acceptedAnswer: { "@type": "Answer", text: project.ledeEn },
          },
        ],
      },
    ],
  };

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title data-en="${escapeHtml(project.nameEn)} · Orange Cloud">${escapeHtml(project.nameVi)} · Orange Cloud</title>
    <meta
      name="description"
      content="${escapeHtml(project.ledeVi)} Dự án cá nhân, không phải ấn phẩm của Cloudflare, Inc."
      data-en="${escapeHtml(project.ledeEn)} A personal project, not a publication of Cloudflare, Inc."
    />
    <meta name="theme-color" content="#100e0c" id="theme-color" />
    <meta property="og:title" content="${escapeHtml(project.nameVi)} · Orange Cloud" data-en="${escapeHtml(project.nameEn)} · Orange Cloud" />
    <meta property="og:description" content="${escapeHtml(project.ledeVi)}" data-en="${escapeHtml(project.ledeEn)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:locale" content="vi_VN" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:image" content="https://orangecloud.vn/og.png?v=1" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Orange Cloud — Showcase cá nhân trên Cloudflare Developer Platform. Không máy chủ tự vận hành." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://orangecloud.vn/og.png?v=1" />
    <link rel="canonical" href="${canonical}" />
${hreflang(canonical)}
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&family=Syne:wght@700;800&display=swap"
      rel="stylesheet"
    />
    <script src="/theme.js"></script>
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">
${JSON.stringify(graph, null, 2).replace(/^/gm, "      ")}
    </script>
  </head>
  <body>
    <a class="skip" href="#content" data-en="Skip to content">Bỏ qua, tới nội dung</a>
    <header class="nav">
      <a class="brand" href="/">
        <img class="brand-mark" src="/brand/mark.svg" width="28" height="28" alt="" />
        <span>Orange Cloud</span>
      </a>
      <nav id="site-nav" class="nav-links" aria-label="Trang" data-en-aria="Pages">
        <a href="/#projects" data-en="Projects">Dự án</a>
        <a href="/about/" data-en="About">Giới thiệu</a>
        <a href="/status/" data-en="Status">Trạng thái</a>
        <a href="/#faq" data-en="FAQ">Hỏi đáp</a>
      </nav>
      <div class="nav-tools">
        <button
          class="nav-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="site-nav"
          data-en-aria="Open menu"
          aria-label="Mở menu"
        >
          <span data-en="Menu">Menu</span>
        </button>
        <button
          class="theme-toggle"
          type="button"
          data-theme-toggle
          aria-label="Chuyển chế độ sáng hoặc tối"
          data-en-aria="Switch light or dark mode"
        >
          <span class="icon-moon" aria-hidden="true">☾</span>
          <span class="icon-sun" aria-hidden="true">☀</span>
        </button>
        <div class="lang" role="group" aria-label="Ngôn ngữ" data-en-aria="Language">
          <button type="button" data-set-lang="vi" aria-pressed="true">VI</button>
          <button type="button" data-set-lang="en" aria-pressed="false">EN</button>
        </div>
      </div>
    </header>
    <main id="content">
      <section class="profile">
        <div class="wrap">
          <p class="eyebrow">Personal project · Orange Cloud</p>
          <h1 class="page-title" data-en="${escapeHtml(project.nameEn)}">${escapeHtml(project.nameVi)}</h1>
          <p class="notice" data-en="A personal project. This is not a publication of Cloudflare, Inc. Not affiliated with Cloudflare, Inc.">
            Dự án cá nhân. Đây không phải ấn phẩm của Cloudflare, Inc. Không liên kết với Cloudflare, Inc.
          </p>
          <p class="lede" data-en="${escapeHtml(project.ledeEn)}">${escapeHtml(project.ledeVi)}</p>
          <p data-en="${escapeHtml(project.bodyEn)}">${escapeHtml(project.bodyVi)}</p>
          <p class="note" data-en="${escapeHtml(project.noteEn)}">${escapeHtml(project.noteVi)}</p>
          <div class="actions">
${actionLinks}
          </div>
          <section id="faq" aria-labelledby="faq-title">
            <h2 id="faq-title" data-en="Question">Câu hỏi</h2>
            <article>
              <h3 data-en="${escapeHtml(questionEn)}">${escapeHtml(questionVi)}</h3>
              <p data-en="${escapeHtml(project.ledeEn)}">${escapeHtml(project.ledeVi)}</p>
            </article>
          </section>
        </div>
      </section>
    </main>
    <footer class="foot">
      <div class="wrap">
        <strong>Orange Cloud</strong>
        <p class="notice" data-en="A personal project. This is not a publication of Cloudflare, Inc. Not affiliated with Cloudflare, Inc.">
          Dự án cá nhân. Đây không phải ấn phẩm của Cloudflare, Inc. Không liên kết với Cloudflare, Inc.
        </p>
        <p data-en="Sibling sites">Trang cùng studio</p>
        <nav class="legal-links" aria-label="Trang cùng studio" data-en-aria="Sibling sites">
          <a href="https://orangecloud.vn/">Orange Cloud</a>
          <a class="ext" href="https://blog.orangecloud.vn/" target="_blank" rel="noopener noreferrer">Blog</a>
          <a class="ext" href="https://onboarding.orangecloud.vn/" target="_blank" rel="noopener noreferrer">Onboarding</a>
          <a class="ext" href="https://firetrace.orangecloud.vn/" target="_blank" rel="noopener noreferrer">FireTrace</a>
        </nav>
      </div>
    </footer>
    <script src="/app.js" defer></script>
  </body>
</html>
`;
}
