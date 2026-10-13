export type ThemePreference = "system" | "light" | "dark";

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export const themeBootstrap = `try { const saved = localStorage.getItem("ai-task-board-theme"); if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved; } catch {}`;
