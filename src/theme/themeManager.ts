import { readonly, ref } from "vue";
import iceBlueThemeUrl from "../themes/ice-blue/theme-index.css?url";

export type AppTheme = "default" | "ice-blue";

export const THEME_STORAGE_KEY = "mortal-journey-ui-theme";

const THEME_LINK_ID = "mj-ice-blue-theme";
const currentTheme = ref<AppTheme>("default");
let initialized = false;

function isAppTheme(value: string | null): value is AppTheme {
  return value === "default" || value === "ice-blue";
}

function readInitialTheme(): AppTheme {
  const pageTheme = document.documentElement.dataset.mjInitialTheme ?? null;
  if (isAppTheme(pageTheme)) return pageTheme;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(stored) ? stored : "default";
  } catch {
    return "default";
  }
}

function getThemeLink(): HTMLLinkElement {
  const existing = document.getElementById(THEME_LINK_ID);
  if (existing instanceof HTMLLinkElement) return existing;

  const link = document.createElement("link");
  link.id = THEME_LINK_ID;
  link.rel = "stylesheet";
  link.media = "not all";
  link.href = iceBlueThemeUrl;
  link.dataset.mjThemeStylesheet = "ice-blue";
  document.head.appendChild(link);
  return link;
}

function applyTheme(theme: AppTheme, persist: boolean): void {
  const isIceBlue = theme === "ice-blue";
  const link = getThemeLink();

  // Keep the file loaded and use `media` as the switch. Some browsers do not
  // refetch a stylesheet that was disabled before its initial request completed.
  link.disabled = false;
  link.media = isIceBlue ? "all" : "not all";
  document.documentElement.dataset.mjTheme = theme;
  currentTheme.value = theme;

  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The theme still works for the current session when storage is unavailable.
    }
  }
}

export function initializeTheme(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  applyTheme(readInitialTheme(), false);
}

export function setTheme(theme: AppTheme): void {
  initializeTheme();
  applyTheme(theme, true);
}

export function toggleTheme(): void {
  setTheme(currentTheme.value === "ice-blue" ? "default" : "ice-blue");
}

export function useTheme() {
  initializeTheme();
  return {
    currentTheme: readonly(currentTheme),
    setTheme,
    toggleTheme,
  };
}
