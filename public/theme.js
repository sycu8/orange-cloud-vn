(() => {
  const key = "oc-theme";
  const root = document.documentElement;
  let theme = "dark";
  try {
    const stored = localStorage.getItem(key);
    if (stored === "light" || stored === "dark") {
      theme = stored;
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      theme = "light";
    }
  } catch {
    /* private mode */
  }
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
})();
