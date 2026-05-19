(function () {
  "use strict";

  const root = document.documentElement;
  const THEME_KEY = "ss:theme";

  function applyTheme(theme) {
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
      root.classList.add("dark");
      root.classList.remove("light");
    } else if (theme === "light") {
      root.setAttribute("data-theme", "light");
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.removeAttribute("data-theme");
      root.classList.remove("light", "dark");
    }
    updateThemeIcon();
  }

  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; }
  }

  function setStoredTheme(value) {
    try {
      if (value) localStorage.setItem(THEME_KEY, value);
      else localStorage.removeItem(THEME_KEY);
    } catch (_) {}
  }

  function currentEffectiveTheme() {
    const stored = getStoredTheme();
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateThemeIcon() {
    const light = document.getElementById("themeIconLight");
    const dark = document.getElementById("themeIconDark");
    if (!light || !dark) return;
    const showDark = currentEffectiveTheme() === "dark";
    light.style.display = showDark ? "none" : "";
    dark.style.display = showDark ? "" : "none";
  }

  applyTheme(getStoredTheme());

  document.addEventListener("DOMContentLoaded", () => {
    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const next = currentEffectiveTheme() === "dark" ? "light" : "dark";
        setStoredTheme(next);
        applyTheme(next);
      });
    }

    markActiveNav();
    setupSearchModal();
    setupGlobalShortcuts();
  });

  function markActiveNav() {
    const path = window.location.pathname.toLowerCase();
    let active = "home";
    if (path === "/sinais" || path === "/sinais.html") active = "sinais";
    else if (path === "/favorites" || path === "/favorites.html") active = "favoritos";
    else if (path === "/alertas" || path === "/alertas.html") active = "alertas";
    else if (path === "/buscar") active = "buscar";
    else if (path !== "/") active = "buscar";

    document.querySelectorAll("[data-nav]").forEach((el) => {
      if (el.dataset.nav === active) el.classList.add("is-active");
      else el.classList.remove("is-active");
    });
  }

  function setupGlobalShortcuts() {
    document.addEventListener("keydown", (e) => {
      const active = document.activeElement;
      const isInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      if (e.key === "/" && !isInput) {
        e.preventDefault();
        openSearchModal();
      } else if (e.key === "Escape") {
        closeSearchModal();
      }
    });
  }

  function setupSearchModal() {
    const btn = document.getElementById("globalSearchBtn");
    const buscarLink = document.querySelector('[data-nav="buscar"]');
    if (btn) btn.addEventListener("click", openSearchModal);
    if (buscarLink) buscarLink.addEventListener("click", (e) => { e.preventDefault(); openSearchModal(); });

    const modal = document.getElementById("searchModal");
    if (!modal) return;
    modal.querySelectorAll("[data-close-modal]").forEach((el) =>
      el.addEventListener("click", closeSearchModal)
    );

    const input = document.getElementById("globalSearchInput");
    const results = document.getElementById("globalSearchResults");
    let active = -1;
    let last = [];
    let debounce;

    if (input) {
      input.addEventListener("input", (e) => {
        clearTimeout(debounce);
        const q = e.target.value.trim();
        debounce = setTimeout(() => doSearch(q), 200);
      });
      input.addEventListener("keydown", (e) => {
        if (!results) return;
        const items = results.querySelectorAll(".search-item");
        if (e.key === "ArrowDown") {
          e.preventDefault();
          active = Math.min(active + 1, items.length - 1);
          setActive(items, active);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          active = Math.max(active - 1, 0);
          setActive(items, active);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (active >= 0 && last[active]) {
            navigateToTicker(last[active].symbol);
          } else if (input.value.trim()) {
            navigateToTicker(input.value.trim().toUpperCase());
          }
        }
      });
    }

    async function doSearch(q) {
      if (!results) return;
      if (q.length < 2) {
        results.innerHTML = "";
        last = [];
        return;
      }
      try {
        const res = await fetch("/api/search?q=" + encodeURIComponent(q));
        const items = await res.json();
        last = items;
        render(items);
      } catch (_) {}
    }

    function render(items) {
      if (!results) return;
      results.innerHTML = "";
      items.slice(0, 8).forEach((it, idx) => {
        const a = document.createElement("a");
        a.className = "search-item";
        a.href = "/" + it.symbol;
        a.innerHTML =
          '<span class="search-item__symbol">' + escapeHtml(it.symbol) + "</span>" +
          '<span class="search-item__name">' + escapeHtml(it.shortname || "") + "</span>" +
          '<span class="search-item__meta">' + escapeHtml(it.exchange || "") + "</span>";
        a.addEventListener("mouseenter", () => setActive(results.querySelectorAll(".search-item"), idx));
        results.appendChild(a);
      });
      active = -1;
    }

    function setActive(items, idx) {
      items.forEach((el, i) => el.classList.toggle("is-active", i === idx));
      active = idx;
    }

    function navigateToTicker(t) {
      const safe = String(t).toUpperCase();
      window.location.href = "/" + encodeURIComponent(safe);
    }
  }

  function openSearchModal() {
    const modal = document.getElementById("searchModal");
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    const input = document.getElementById("globalSearchInput");
    if (input) setTimeout(() => input.focus(), 50);
  }

  function closeSearchModal() {
    const modal = document.getElementById("searchModal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    const input = document.getElementById("globalSearchInput");
    if (input) input.value = "";
    const results = document.getElementById("globalSearchResults");
    if (results) results.innerHTML = "";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  window.toast = function (text, ms) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("is-shown");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => el.classList.remove("is-shown"), ms || 2000);
  };

  window.SS = window.SS || {};
  window.SS.openSearch = openSearchModal;
  window.SS.closeSearch = closeSearchModal;
  window.SS.toggleTheme = function () {
    const next = currentEffectiveTheme() === "dark" ? "light" : "dark";
    setStoredTheme(next);
    applyTheme(next);
  };
})();
