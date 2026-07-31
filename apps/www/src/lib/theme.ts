export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "gp-theme";
export const DEFAULT_THEME: Theme = "dark";
export const THEME_COLORS = {
  dark: "#101116",
  light: "#ffffff",
} as const;

export function resolveTheme(
  saved: string | null,
  systemDark: boolean,
): Theme {
  if (saved === "light" || saved === "dark") return saved;
  return systemDark ? "dark" : "light";
}

export function readDocumentTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const attr = document.documentElement.dataset.theme;
  if (attr === "light" || attr === "dark") return attr;
  return resolveTheme(
    null,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.getElementById("theme-color-meta");
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/** Inline boot script so first paint matches saved / system preference. */
export function themeBootScript(): string {
  return `(() => {
  const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
  const colors = ${JSON.stringify(THEME_COLORS)};
  let saved = null;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {}
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme =
    saved === "light" || saved === "dark"
      ? saved
      : systemDark
        ? "dark"
        : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.getElementById("theme-color-meta");
  if (meta) meta.setAttribute("content", colors[theme]);
})();`;
}
