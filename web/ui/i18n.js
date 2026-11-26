// Tiny locale layer for the P1 static app. It reuses the v1 locale files
// unchanged (292 keys) and adds a "p1." namespace for the new panels.

const STORAGE_KEY = "lethe.lang";
const CACHE = new Map();

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    // storage can be blocked; fall through to the browser language
  }
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("zh") ? "zh" : "en";
}

async function load(lang) {
  if (CACHE.has(lang)) return CACHE.get(lang);
  const response = await fetch(`/locales/${lang}.json`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`cannot load locale ${lang}`);
  const table = await response.json();
  CACHE.set(lang, table);
  return table;
}

export async function createI18n() {
  let lang = detectLang();
  let en = await load("en");
  let table = lang === "en" ? en : await load(lang).catch(() => en);

  function t(key, vars) {
    const template = table[key] ?? en[key];
    if (template === undefined) return key;
    if (!vars) return template;
    return String(template).replace(/\{(\w+)\}/g, (_, name) =>
      vars[name] === undefined ? `{${name}}` : String(vars[name]),
    );
  }

  // Attributes carry user-visible copy too: the tab title, the meta
  // description, and the accessible names of the language picker, the tablist
  // and the type selects. Each one is declared with its own data attribute so
  // a language switch rewrites it in place instead of leaving English behind.
  const ATTRIBUTES = [
    ["data-i18n-aria-label", "aria-label"],
    ["data-i18n-title", "title"],
    ["data-i18n-content", "content"],
  ];

  function apply(root = document) {
    for (const node of root.querySelectorAll("[data-i18n]")) {
      node.textContent = t(node.dataset.i18n);
    }
    for (const node of root.querySelectorAll("[data-i18n-placeholder]")) {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    }
    for (const [dataAttribute, attribute] of ATTRIBUTES) {
      for (const node of root.querySelectorAll(`[${dataAttribute}]`)) {
        node.setAttribute(attribute, t(node.getAttribute(dataAttribute)));
      }
    }
    document.documentElement.lang = lang;
    const select = document.getElementById("lang-select");
    if (select) select.value = lang;
  }

  async function setLang(next) {
    if (next !== "en" && next !== "zh") return;
    lang = next;
    table = next === "en" ? en : await load(next).catch(() => en);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore: the choice just will not survive a reload
    }
    apply();
  }

  return {
    get lang() {
      return lang;
    },
    t,
    apply,
    setLang,
  };
}
