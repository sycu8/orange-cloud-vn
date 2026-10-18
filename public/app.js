const textNodes = [...document.querySelectorAll("[data-en]")].filter(
  (node) => node.tagName !== "META",
);
const metaNodes = [...document.querySelectorAll("meta[data-en]")];
const ariaNodes = [...document.querySelectorAll("[data-en-aria]")];
const placeholderNodes = [...document.querySelectorAll("[data-en-placeholder]")];
const themeColorMeta = document.querySelector("#theme-color");
const themeToggle = document.querySelector("[data-theme-toggle]");

textNodes.forEach((node) => {
  node.dataset.vi = node.textContent.trim();
});

metaNodes.forEach((node) => {
  node.dataset.vi = node.getAttribute("content") || "";
});

ariaNodes.forEach((node) => {
  node.dataset.viAria = node.getAttribute("aria-label") || "";
});

placeholderNodes.forEach((node) => {
  node.dataset.viPlaceholder = node.getAttribute("placeholder") || "";
});

const projects = [...document.querySelectorAll(".project")];
const count = document.querySelector("#project-count");
const empty = document.querySelector("#empty");
const search = document.querySelector("#search");
const chips = [...document.querySelectorAll("[data-filter]")];
const nav = document.querySelector("#site-nav");
const navToggle = document.querySelector(".nav-toggle");
const progress = document.querySelector(".progress");
const statusBar = document.querySelector("#status-bar");
const statusToggle = document.querySelector("#status-toggle");
const statusPanel = document.querySelector("#status-panel");
const statusLabel = document.querySelector("[data-status-label]");
const statusUptime = document.querySelector("[data-status-uptime]");
const statusCount = document.querySelector("[data-status-count]");
const statusList = document.querySelector("[data-status-list]");
const statUptime = document.querySelector("[data-stat-uptime]");
const liveLinks = [...document.querySelectorAll("[data-status-host]")];

let filter = "all";
let query = "";
let statusPayload = null;

function closeNav() {
  nav?.classList.remove("is-open");
  navToggle?.setAttribute("aria-expanded", "false");
}

function currentTheme() {
  const value = document.documentElement.getAttribute("data-theme");
  return value === "light" ? "light" : "dark";
}

function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  document.documentElement.style.colorScheme = next;
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", next === "light" ? "#f7f4ef" : "#100e0c");
  }
  if (themeToggle) {
    const label =
      next === "light"
        ? { vi: "Chuyển sang chế độ tối", en: "Switch to dark mode" }
        : { vi: "Chuyển sang chế độ sáng", en: "Switch to light mode" };
    const lang = document.documentElement.lang === "en" ? "en" : "vi";
    themeToggle.setAttribute("aria-label", label[lang]);
    themeToggle.dataset.enAria = label.en;
    themeToggle.dataset.viAria = label.vi;
  }
  try {
    localStorage.setItem("oc-theme", next);
  } catch {
    /* private mode */
  }
}

function applyLanguage(lang) {
  const next = lang === "en" ? "en" : "vi";
  document.documentElement.lang = next;

  textNodes.forEach((node) => {
    node.textContent = next === "en" ? node.dataset.en || "" : node.dataset.vi || "";
  });

  metaNodes.forEach((node) => {
    node.setAttribute("content", next === "en" ? node.dataset.en || "" : node.dataset.vi || "");
  });

  ariaNodes.forEach((node) => {
    node.setAttribute(
      "aria-label",
      next === "en" ? node.dataset.enAria || "" : node.dataset.viAria || "",
    );
  });

  placeholderNodes.forEach((node) => {
    node.setAttribute(
      "placeholder",
      next === "en" ? node.dataset.enPlaceholder || "" : node.dataset.viPlaceholder || "",
    );
  });

  document.querySelectorAll("[data-set-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.setLang === next ? "true" : "false");
  });

  try {
    localStorage.setItem("oc-lang", next);
  } catch {
    /* private mode */
  }

  applyTheme(currentTheme());
  applyFilter();
}

function applyFilter() {
  const needle = query.trim().toLowerCase().slice(0, 120);
  let shown = 0;

  projects.forEach((project) => {
    const tags = (project.dataset.tags || "").split(/\s+/).filter(Boolean);
    const tagOk = filter === "all" || tags.includes(filter);
    const textOk = needle.length === 0 || project.textContent.toLowerCase().includes(needle);
    const visible = tagOk && textOk;
    project.hidden = !visible;
    if (visible) shown += 1;
  });

  if (count) count.textContent = String(shown);
  empty?.classList.toggle("is-visible", shown === 0);
}

function hashTargetId() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw || raw.length > 80) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

function openFromHash() {
  const id = hashTargetId();
  if (!id || !/^[A-Za-z][\w:-]*$/.test(id)) return;
  const project = document.getElementById(id);
  if (!project || !project.classList.contains("project")) return;
  filter = "all";
  query = "";
  if (search instanceof HTMLInputElement) search.value = "";
  chips.forEach((chip) => {
    chip.setAttribute("aria-pressed", chip.dataset.filter === "all" ? "true" : "false");
  });
  applyFilter();
  project.hidden = false;
  project.open = true;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  project.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

document.querySelectorAll("[data-set-lang]").forEach((button) => {
  button.addEventListener("click", () => {
    applyLanguage(button.dataset.setLang || "vi");
    if (statusPayload) renderStatus(statusPayload);
  });
});

themeToggle?.addEventListener("click", () => {
  applyTheme(currentTheme() === "light" ? "dark" : "light");
});

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    filter = chip.dataset.filter || "all";
    chips.forEach((item) => {
      item.setAttribute("aria-pressed", item === chip ? "true" : "false");
    });
    applyFilter();
  });
});

search?.addEventListener("input", () => {
  query = search instanceof HTMLInputElement ? search.value : "";
  applyFilter();
});

navToggle?.addEventListener("click", () => {
  const open = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", open ? "false" : "true");
  nav?.classList.toggle("is-open", !open);
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    closeNav();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeNav();
  if (statusToggle?.getAttribute("aria-expanded") === "true") {
    setStatusOpen(false);
  }
});

function onScroll() {
  if (!progress) return;
  const height = document.documentElement.scrollHeight - window.innerHeight;
  const value = height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0;
  progress.style.transform = `scaleX(${value})`;
}

window.addEventListener(
  "scroll",
  () => {
    onScroll();
    if (statusToggle?.getAttribute("aria-expanded") === "true") {
      positionStatusPanel();
    }
  },
  { passive: true },
);
window.addEventListener("resize", () => {
  if (statusToggle?.getAttribute("aria-expanded") === "true") {
    positionStatusPanel();
  }
});
window.addEventListener("hashchange", openFromHash);
onScroll();

let initial = "vi";
try {
  initial = localStorage.getItem("oc-lang") === "en" ? "en" : "vi";
} catch {
  initial = "vi";
}
applyLanguage(initial);
openFromHash();

const overallCopy = {
  loading: { vi: "Đang kiểm tra tên miền…", en: "Checking domains…" },
  operational: { vi: "Mọi tên miền đang hoạt động", en: "All domains operational" },
  degraded: { vi: "Một số tên miền gặp sự cố", en: "Some domains are degraded" },
  outage: { vi: "Nhiều tên miền đang lỗi", en: "Multiple domains are down" },
  unknown: { vi: "Chưa có dữ liệu trạng thái", en: "Status data unavailable" },
};

function currentLang() {
  return document.documentElement.lang === "en" ? "en" : "vi";
}

function formatPct(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `${value.toFixed(value >= 99.95 ? 2 : 1)}%`;
}

function positionStatusPanel() {
  if (!statusBar || !statusPanel) return;
  const rect = statusBar.getBoundingClientRect();
  statusPanel.style.setProperty("--status-panel-top", `${Math.round(rect.bottom)}px`);
}

function setStatusOpen(open) {
  if (!statusBar || !statusToggle || !statusPanel) return;
  statusBar.classList.toggle("is-open", open);
  statusToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    positionStatusPanel();
    statusPanel.scrollTop = 0;
  }
  statusPanel.hidden = !open;
  const label =
    open
      ? { vi: "Ẩn trạng thái tên miền", en: "Hide domain status" }
      : { vi: "Xem trạng thái tên miền", en: "Show domain status" };
  const lang = currentLang();
  statusToggle.setAttribute("aria-label", label[lang]);
  statusToggle.dataset.enAria = label.en;
  statusToggle.dataset.viAria = label.vi;
}

function renderStatus(payload) {
  if (!statusBar || !payload) return;
  statusPayload = payload;
  const lang = currentLang();
  const overall = overallCopy[payload.overall] ? payload.overall : "unknown";
  statusBar.hidden = false;
  statusBar.dataset.state = overall;

  if (statusLabel) {
    statusLabel.textContent = overallCopy[overall][lang];
  }

  const uptimeText = formatPct(payload.uptime24h);
  if (statusUptime) {
    statusUptime.textContent = uptimeText
      ? lang === "en"
        ? `${uptimeText} uptime (24h)`
        : `${uptimeText} uptime (24 giờ)`
      : lang === "en"
        ? "Collecting uptime…"
        : "Đang thu thập uptime…";
  }

  if (statusCount) {
    const up = typeof payload.up === "number" ? payload.up : 0;
    const total = Array.isArray(payload.monitors) ? payload.monitors.length : up;
    statusCount.textContent =
      lang === "en" ? `${up}/${total} up` : `${up}/${total} đang lên`;
  }

  if (statUptime) {
    statUptime.textContent = uptimeText || "—";
  }

  const byHost = new Map();
  if (Array.isArray(payload.monitors)) {
    for (const monitor of payload.monitors) {
      if (monitor && typeof monitor.host === "string") {
        byHost.set(monitor.host, monitor);
      }
    }
  }

  liveLinks.forEach((link) => {
    const host = link.dataset.statusHost || "";
    const monitor = byHost.get(host);
    const uptimeNode = link.querySelector("[data-live-uptime]");
    if (!monitor) {
      link.removeAttribute("data-state");
      if (uptimeNode) {
        uptimeNode.hidden = true;
        uptimeNode.textContent = "";
      }
      return;
    }
    link.dataset.state = monitor.status === "up" ? "up" : "down";
    if (uptimeNode) {
      const pct = formatPct(monitor.uptime24h);
      if (pct) {
        uptimeNode.hidden = false;
        uptimeNode.textContent = pct;
      } else {
        uptimeNode.hidden = true;
        uptimeNode.textContent = "";
      }
    }
  });

  if (!statusList) return;
  while (statusList.firstChild) statusList.removeChild(statusList.firstChild);

  const monitors = Array.isArray(payload.monitors) ? payload.monitors : [];
  monitors.forEach((monitor) => {
    if (!monitor || typeof monitor !== "object") return;
    const item = document.createElement("li");
    item.dataset.state = monitor.status === "up" ? "up" : "down";

    const dot = document.createElement("span");
    dot.className = "row-dot";
    dot.setAttribute("aria-hidden", "true");

    const link = document.createElement("a");
    link.href = typeof monitor.url === "string" ? monitor.url : "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const title = document.createElement("span");
    title.textContent =
      lang === "en"
        ? monitor.nameEn || monitor.name || monitor.host || ""
        : monitor.name || monitor.nameEn || monitor.host || "";
    const host = document.createElement("span");
    host.className = "row-host";
    host.textContent = monitor.host || "";
    link.append(title, host);

    const metrics = document.createElement("div");
    metrics.className = "row-metrics";
    const strong = document.createElement("strong");
    const day = formatPct(monitor.uptime24h);
    const week = formatPct(monitor.uptime7d);
    strong.textContent = day ? `${day} / 24h` : lang === "en" ? "Collecting…" : "Đang thu…";
    const sub = document.createElement("span");
    sub.textContent = week
      ? `${week} / 7d`
      : typeof monitor.latencyMs === "number"
        ? `${Math.round(monitor.latencyMs)} ms`
        : "—";
    metrics.append(strong, sub);

    item.append(dot, link, metrics);
    statusList.append(item);
  });
}

statusToggle?.addEventListener("click", () => {
  const open = statusToggle.getAttribute("aria-expanded") === "true";
  setStatusOpen(!open);
});

async function loadStatus() {
  if (!statusBar) return;
  statusBar.hidden = false;
  statusBar.dataset.state = "loading";
  if (statusLabel) statusLabel.textContent = overallCopy.loading[currentLang()];

  try {
    const response = await fetch("/api/status", {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("invalid payload");
    renderStatus(payload);
  } catch {
    statusBar.dataset.state = "unknown";
    if (statusLabel) statusLabel.textContent = overallCopy.unknown[currentLang()];
    if (statusUptime) {
      statusUptime.textContent =
        currentLang() === "en" ? "Retry later" : "Thử lại sau";
    }
  }
}

loadStatus();
