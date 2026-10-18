const banner = document.querySelector("#spage-banner");
const headline = document.querySelector("[data-spage-headline]");
const subline = document.querySelector("[data-spage-sub]");
const list = document.querySelector("[data-spage-list]");
const checkedAtNode = document.querySelector("[data-spage-checked]");
const uptimeNode = document.querySelector("[data-spage-uptime]");
const historySection = document.querySelector("[data-spage-history]");
const historyList = document.querySelector("[data-spage-history-list]");

let pagePayload = null;

const copy = {
  operational: {
    headline: { vi: "Mọi hệ thống đang hoạt động", en: "We’re fully operational" },
    sub: {
      vi: "Không phát hiện sự cố ảnh hưởng tới các domain Orange Cloud.",
      en: "We’re not aware of any issues affecting Orange Cloud domains.",
    },
  },
  degraded: {
    headline: { vi: "Một phần hệ thống gặp sự cố", en: "Some systems are degraded" },
    sub: {
      vi: "Một hoặc nhiều domain đang trả lỗi. Chi tiết bên dưới.",
      en: "One or more domains are returning errors. Details below.",
    },
  },
  outage: {
    headline: { vi: "Nhiều hệ thống đang lỗi", en: "Major outage detected" },
    sub: {
      vi: "Hầu hết hoặc toàn bộ domain đang không phản hồi.",
      en: "Most or all domains are not responding.",
    },
  },
  unknown: {
    headline: { vi: "Chưa có dữ liệu trạng thái", en: "Status data unavailable" },
    sub: {
      vi: "Không đọc được snapshot. Thử lại sau ít phút.",
      en: "Could not read a snapshot. Try again in a few minutes.",
    },
  },
  loading: {
    headline: { vi: "Đang kiểm tra hệ thống…", en: "Checking systems…" },
    sub: { vi: "Đang tải kết quả probe mới nhất.", en: "Loading the latest probes." },
  },
};

function lang() {
  return document.documentElement.lang === "en" ? "en" : "vi";
}

function formatPct(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `${value.toFixed(value >= 99.95 ? 2 : 1)}%`;
}

function formatCheckedAt(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return lang() === "en"
    ? `Updated ${date.toLocaleString("en-GB", { hour12: false })}`
    : `Cập nhật ${date.toLocaleString("vi-VN", { hour12: false })}`;
}

function clear(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

function setBanner(state) {
  if (!banner || !headline || !subline) return;
  const key = copy[state] ? state : "unknown";
  banner.dataset.state = key;
  const bundle = copy[key];
  headline.textContent = bundle.headline[lang()];
  headline.dataset.en = bundle.headline.en;
  headline.dataset.vi = bundle.headline.vi;
  subline.textContent = bundle.sub[lang()];
  subline.dataset.en = bundle.sub.en;
  subline.dataset.vi = bundle.sub.vi;

  const check = banner.querySelector(".spage-check");
  const warn = banner.querySelector(".spage-warn");
  if (check) check.hidden = key !== "operational";
  if (warn) warn.hidden = key === "operational" || key === "loading";
}

function sparkline(history) {
  const wrap = document.createElement("div");
  wrap.className = "spage-spark";
  wrap.setAttribute("aria-hidden", "true");
  const days = Array.isArray(history) ? history : [];
  days.forEach((day) => {
    const bar = document.createElement("span");
    bar.className = "spage-spark-bar";
    if (!day || day.total === 0 || day.uptime == null) {
      bar.dataset.tone = "empty";
    } else if (day.uptime >= 99.5) {
      bar.dataset.tone = "up";
    } else if (day.uptime >= 90) {
      bar.dataset.tone = "degraded";
    } else {
      bar.dataset.tone = "down";
    }
    bar.title = day?.date
      ? `${day.date}: ${formatPct(day.uptime) ?? "—"}`
      : "";
    wrap.append(bar);
  });
  return wrap;
}

function renderList(monitors) {
  if (!list) return;
  clear(list);
  if (!monitors.length) {
    const empty = document.createElement("li");
    empty.className = "spage-list-empty";
    empty.textContent =
      lang() === "en" ? "No monitors yet." : "Chưa có monitor.";
    list.append(empty);
    return;
  }

  monitors.forEach((monitor) => {
    const item = document.createElement("li");
    item.className = "spage-row";
    item.dataset.state = monitor.status === "up" ? "up" : "down";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "spage-row-toggle";
    toggle.setAttribute("aria-expanded", "false");

    const icon = document.createElement("span");
    icon.className = "spage-row-icon";
    icon.dataset.kind = monitor.status === "up" ? "up" : "down";
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "spage-row-label";
    label.textContent =
      lang() === "en"
        ? monitor.nameEn || monitor.name || monitor.host
        : monitor.name || monitor.nameEn || monitor.host;

    const pct = document.createElement("span");
    pct.className = "spage-row-pct";
    pct.textContent = formatPct(monitor.uptime24h) ?? "—";

    const chevron = document.createElement("span");
    chevron.className = "spage-row-chevron";
    chevron.setAttribute("aria-hidden", "true");

    toggle.append(icon, label, pct, chevron);

    const detail = document.createElement("div");
    detail.className = "spage-row-detail";
    detail.hidden = true;

    const host = document.createElement("a");
    host.className = "spage-row-host";
    host.href = typeof monitor.url === "string" ? monitor.url : "#";
    host.target = "_blank";
    host.rel = "noopener noreferrer";
    host.textContent = monitor.host || monitor.url || "";

    const metrics = document.createElement("p");
    metrics.className = "spage-row-metrics";
    const day = formatPct(monitor.uptime24h);
    const week = formatPct(monitor.uptime7d);
    const latency =
      typeof monitor.latencyMs === "number" ? `${Math.round(monitor.latencyMs)} ms` : "—";
    metrics.textContent =
      lang() === "en"
        ? `24h ${day ?? "—"} · 7d ${week ?? "—"} · ${latency}`
        : `24 giờ ${day ?? "—"} · 7 ngày ${week ?? "—"} · ${latency}`;

    detail.append(host, metrics, sparkline(monitor.history));

    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      detail.hidden = open;
      item.classList.toggle("is-open", !open);
    });

    item.append(toggle, detail);
    list.append(item);
  });
}

function renderHistory(monitors) {
  if (!historySection || !historyList) return;
  clear(historyList);
  if (!monitors.length) {
    historySection.hidden = true;
    return;
  }
  historySection.hidden = false;
  monitors.forEach((monitor) => {
    const item = document.createElement("li");
    item.className = "spage-history-row";

    const title = document.createElement("div");
    title.className = "spage-history-title";
    const name = document.createElement("strong");
    name.textContent =
      lang() === "en"
        ? monitor.nameEn || monitor.name || monitor.host
        : monitor.name || monitor.nameEn || monitor.host;
    const host = document.createElement("span");
    host.textContent = monitor.host || "";
    title.append(name, host);

    const weeks = document.createElement("div");
    weeks.className = "spage-history-bars";
    const days = Array.isArray(monitor.history) ? monitor.history : [];
    days.forEach((day) => {
      const cell = document.createElement("div");
      cell.className = "spage-history-day";
      const bar = document.createElement("span");
      bar.className = "spage-history-bar";
      if (!day || day.total === 0 || day.uptime == null) {
        bar.dataset.tone = "empty";
        bar.style.setProperty("--h", "18%");
      } else {
        bar.dataset.tone =
          day.uptime >= 99.5 ? "up" : day.uptime >= 90 ? "degraded" : "down";
        bar.style.setProperty("--h", `${Math.max(18, day.uptime)}%`);
      }
      const label = document.createElement("span");
      label.className = "spage-history-date";
      label.textContent = day?.date ? day.date.slice(5) : "—";
      cell.append(bar, label);
      cell.title = day?.date
        ? `${day.date}: ${formatPct(day.uptime) ?? "n/a"}`
        : "";
      weeks.append(cell);
    });

    const pct = document.createElement("strong");
    pct.className = "spage-history-pct";
    pct.textContent = formatPct(monitor.uptime7d) ?? "—";

    item.append(title, weeks, pct);
    historyList.append(item);
  });
}

function renderPage(payload) {
  pagePayload = payload;
  const overall = copy[payload.overall] ? payload.overall : "unknown";
  setBanner(overall);

  if (checkedAtNode) checkedAtNode.textContent = formatCheckedAt(payload.checkedAt);
  if (uptimeNode) {
    const pct = formatPct(payload.uptime24h);
    uptimeNode.textContent = pct
      ? lang() === "en"
        ? `${pct} uptime (24h)`
        : `${pct} uptime (24 giờ)`
      : lang() === "en"
        ? "Collecting uptime…"
        : "Đang thu thập uptime…";
  }

  const monitors = Array.isArray(payload.monitors) ? payload.monitors : [];
  renderList(monitors);
  renderHistory(monitors);
}

document.querySelectorAll("[data-set-lang]").forEach((button) => {
  button.addEventListener("click", () => {
    if (pagePayload) renderPage(pagePayload);
  });
});

async function load() {
  setBanner("loading");
  try {
    const response = await fetch("/api/status", {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("invalid");
    renderPage(payload);
  } catch {
    setBanner("unknown");
    if (list) {
      clear(list);
      const empty = document.createElement("li");
      empty.className = "spage-list-empty";
      empty.textContent =
        lang() === "en" ? "Could not load status." : "Không tải được trạng thái.";
      list.append(empty);
    }
  }
}

load();
