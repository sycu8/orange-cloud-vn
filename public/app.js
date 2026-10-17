const textNodes = [...document.querySelectorAll("[data-en]")].filter(
  (node) => node.tagName !== "META",
);
const metaNodes = [...document.querySelectorAll("meta[data-en]")];
const ariaNodes = [...document.querySelectorAll("[data-en-aria]")];
const placeholderNodes = [...document.querySelectorAll("[data-en-placeholder]")];

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

let filter = "all";
let query = "";

function closeNav() {
  nav?.classList.remove("is-open");
  navToggle?.setAttribute("aria-expanded", "false");
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
  button.addEventListener("click", () => applyLanguage(button.dataset.setLang || "vi"));
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
  if (event.key === "Escape") closeNav();
});

function onScroll() {
  if (!progress) return;
  const height = document.documentElement.scrollHeight - window.innerHeight;
  const value = height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0;
  progress.style.transform = `scaleX(${value})`;
}

window.addEventListener("scroll", onScroll, { passive: true });
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
