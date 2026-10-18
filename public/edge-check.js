const lookupForm = document.querySelector("#ecc-lookup");
const domainInput = document.querySelector("#ecc-domain");
const submitButton = document.querySelector("#ecc-submit");
const alertBox = document.querySelector("#ecc-alert");
const resultsRoot = document.querySelector("#ecc-results");
const contactSection = document.querySelector("#ecc-contact");
const contactForm = document.querySelector("#ecc-contact-form");
const sentNote = document.querySelector("#ecc-sent");
const contactError = document.querySelector("#ecc-contact-error");
const sendButton = document.querySelector("#ecc-send");

const COPY = {
  vi: {
    loading: "Đang kiểm tra…",
    check: "Kiểm tra",
    send: "Gửi",
    sending: "Đang gửi…",
    failed: "Không kiểm tra được lúc này. Thử lại sau.",
    rate: "Bạn đã kiểm tra quá nhiều lần, vui lòng thử lại sau một phút.",
    columns: ["Host", "Bản ghi DNS", "Trạng thái", "Bằng chứng"],
    status: {
      cloudflare: "Cloudflare",
      other_cdn: "CDN khác",
      direct: "Trực tiếp",
      no_record: "Không có bản ghi",
    },
    summary: (summary) =>
      `${summary.cloudflare} Cloudflare · ${summary.other_cdn} CDN khác · ${summary.direct} trực tiếp · ${summary.no_record} không có bản ghi`,
    emptyDns: "Không có",
    newTab: "(mở tab mới)",
  },
  en: {
    loading: "Checking…",
    check: "Check",
    send: "Send",
    sending: "Sending…",
    failed: "The check failed. Try again in a moment.",
    rate: "Bạn đã kiểm tra quá nhiều lần, vui lòng thử lại sau một phút.",
    columns: ["Host", "DNS records", "Status", "Evidence"],
    status: {
      cloudflare: "Cloudflare",
      other_cdn: "Other CDN",
      direct: "Direct",
      no_record: "No record",
    },
    summary: (summary) =>
      `${summary.cloudflare} Cloudflare · ${summary.other_cdn} other CDN · ${summary.direct} direct · ${summary.no_record} no record`,
    emptyDns: "None",
    newTab: "(opens in a new tab)",
  },
};

let lastReport = null;

function language() {
  return document.documentElement.lang === "en" ? "en" : "vi";
}

function copy() {
  return COPY[language()];
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function showAlert(text) {
  if (!alertBox) return;
  alertBox.hidden = !text;
  alertBox.textContent = text || "";
}

function dnsLines(records, emptyLabel) {
  const lines = [];
  if (records.cname?.length) lines.push(`CNAME ${records.cname.join(", ")}`);
  if (records.a?.length) lines.push(`A ${records.a.join(", ")}`);
  if (records.aaaa?.length) lines.push(`AAAA ${records.aaaa.join(", ")}`);
  return lines.length ? lines : [emptyLabel];
}

function renderReport(report) {
  if (!resultsRoot) return;
  const text = copy();
  clear(resultsRoot);
  resultsRoot.hidden = false;

  resultsRoot.append(el("p", "ecc-summary", text.summary(report.summary)));

  const table = document.createElement("table");
  table.className = "ecc-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  text.columns.forEach((label) => headRow.append(el("th", "", label)));
  head.append(headRow);
  table.append(head);

  const body = document.createElement("tbody");
  report.hosts.forEach((host) => {
    const row = document.createElement("tr");
    const cells = [
      el("td", "ecc-host", host.host),
      el("td", "ecc-dns", dnsLines(host.records, text.emptyDns).join("\n")),
      null,
      el("td", "ecc-evidence", (host.evidence || []).join(" · ") || "—"),
    ];
    const statusCell = document.createElement("td");
    const badge = el(
      "span",
      `ecc-badge ecc-badge-${host.status}`,
      host.provider && host.status === "other_cdn"
        ? `${text.status[host.status]} · ${host.provider}`
        : text.status[host.status] || host.status,
    );
    statusCell.append(badge);
    cells[2] = statusCell;
    cells.forEach((cell, index) => {
      cell.setAttribute("data-label", text.columns[index]);
      row.append(cell);
    });
    body.append(row);
  });
  table.append(body);
  resultsRoot.append(table);

  if (report.recommendations?.length) {
    const list = document.createElement("ul");
    list.className = "ecc-recs";
    report.recommendations.forEach((item) => {
      const li = document.createElement("li");
      li.className = `ecc-rec ecc-rec-${item.tone}`;
      li.append(el("p", "", language() === "en" ? item.textEn || item.text : item.text));
      if (item.links?.length) {
        const links = el("p", "ecc-links");
        item.links.forEach((link) => {
          const anchor = document.createElement("a");
          anchor.className = "ext";
          anchor.href = link.href;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.textContent = language() === "en" ? link.labelEn || link.label : link.label;
          const hint = el("span", "sr-only", ` ${text.newTab}`);
          anchor.append(hint);
          links.append(anchor);
        });
        li.append(links);
      }
      list.append(li);
    });
    resultsRoot.append(list);
  }

  if (contactSection) contactSection.hidden = false;
}

async function runLookup(domain) {
  const text = copy();
  showAlert("");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = text.loading;
  }
  try {
    const response = await fetch(`/api/edge-check?domain=${encodeURIComponent(domain)}`, {
      headers: { accept: "application/json" },
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (response.status === 429) {
      showAlert(payload?.error || text.rate);
      return;
    }
    if (!response.ok || !payload?.hosts) {
      showAlert(payload?.error || text.failed);
      return;
    }
    lastReport = payload;
    renderReport(payload);
  } catch {
    showAlert(text.failed);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = copy().check;
    }
  }
}

lookupForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const domain = domainInput instanceof HTMLInputElement ? domainInput.value.trim() : "";
  if (!domain) return;
  runLookup(domain);
});

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (contactError) {
    contactError.hidden = true;
    contactError.textContent = "";
  }
  const value = (id) => {
    const field = document.querySelector(id);
    return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value.trim() : "";
  };
  const body = {
    name: value("#ecc-name"),
    email: value("#ecc-email"),
    company: value("#ecc-company"),
    message: value("#ecc-message"),
    website: value("#ecc-website"),
    domain: domainInput instanceof HTMLInputElement ? domainInput.value.trim() : "",
  };
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = copy().sending;
  }
  try {
    const response = await fetch("/api/edge-check/contact", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (response.status === 429) {
      showAlert(payload?.error || copy().rate);
      return;
    }
    if (!response.ok || !payload?.ok) {
      if (contactError) {
        contactError.hidden = false;
        contactError.textContent = payload?.error || copy().failed;
      }
      return;
    }
    if (sentNote) sentNote.hidden = false;
  } catch {
    if (contactError) {
      contactError.hidden = false;
      contactError.textContent = copy().failed;
    }
  } finally {
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.textContent = copy().send;
    }
  }
});

document.querySelectorAll("[data-set-lang]").forEach((button) => {
  button.addEventListener("click", () => {
    if (lastReport) renderReport(lastReport);
    if (submitButton && !submitButton.disabled) submitButton.textContent = copy().check;
  });
});
