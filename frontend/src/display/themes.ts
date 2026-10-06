import type { AppTheme } from "@habitat/contracts";

type Palette = {
  bg: string;
  surface: string;
  secondary: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  hover: string;
  foreground: string;
  overlay?: string;
  dark: boolean;
};
function tokens(p: Palette) {
  return {
    "--app-bg": p.bg,
    "--surface-primary": p.surface,
    "--surface-secondary": p.secondary,
    "--surface-elevated": p.surface,
    "--border-primary": p.border,
    "--border-subtle": `color-mix(in srgb, ${p.border} 60%, ${p.surface})`,
    "--text-primary": p.text,
    "--text-secondary": p.muted,
    "--text-muted": p.muted,
    "--accent-primary": p.accent,
    "--accent-hover": p.hover,
    "--accent-foreground": p.foreground,
    "--input-bg": p.surface,
    "--input-border": p.border,
    "--hover-bg": p.secondary,
    "--selected-bg": `color-mix(in srgb, ${p.accent} 14%, ${p.surface})`,
    "--canvas-bg": p.bg,
    "--panel-bg": p.surface,
    "--shadow-color": p.dark ? "#00000040" : "#20201e12",
    "--overlay-bg": p.overlay ?? "#10141988",
    "--success": p.dark ? "#9bc4a7" : "#356447",
    "--warning": p.dark ? "#dbba88" : "#80521d",
    "--error": p.dark ? "#efa69e" : "#a03830",
    "--info": p.dark ? "#a4bfd9" : "#3b647f",
    "--room-fill": p.secondary,
    "--wall-stroke": p.text,
    "--grid-color": `color-mix(in srgb, ${p.border} 65%, transparent)`,
  };
}
function theme(name: string, description: string, palette: Palette) {
  return { name, description, dark: palette.dark, tokens: tokens(palette) };
}
export const themes = {
  blue: theme("Blue", "Clear skies. Fresh perspective.", {
    bg: "#EDF3FA",
    surface: "#FAFCFF",
    secondary: "#DFEAF7",
    border: "#C6D6EA",
    text: "#203248",
    muted: "#506780",
    accent: "#245CAD",
    hover: "#194986",
    foreground: "#FFFFFF",
    overlay: "#20324826",
    dark: false,
  }),
  night: theme("Night", "A quieter kind of focus.", {
    bg: "#111315",
    surface: "#181B1E",
    secondary: "#202428",
    border: "#2C3136",
    text: "#F2F3F3",
    muted: "#A3ABB2",
    accent: "#A3BAC8",
    hover: "#C0D0DA",
    foreground: "#111315",
    dark: true,
  }),
  terra: theme("Terra", "Grounded in natural warmth.", {
    bg: "#F4EEE8",
    surface: "#FFFDFC",
    secondary: "#E9DDD2",
    border: "#DCCDC0",
    text: "#312721",
    muted: "#715F53",
    accent: "#A65130",
    hover: "#8D4024",
    foreground: "#FFFFFF",
    dark: false,
  }),
  "sage-stone": theme("Sage Stone", "A little closer to nature.", {
    bg: "#EEF0EB",
    surface: "#FAFBF8",
    secondary: "#E2E7DF",
    border: "#D2D8CF",
    text: "#252A26",
    muted: "#5E685F",
    accent: "#526F59",
    hover: "#405945",
    foreground: "#FFFFFF",
    dark: false,
  }),
} satisfies Record<AppTheme, ReturnType<typeof theme>>;
export const themeIds = Object.keys(themes) as AppTheme[];
export function applyTheme(id: AppTheme) {
  const root = document.documentElement;
  root.dataset.theme = id;
  root.style.colorScheme = themes[id].dark ? "dark" : "light";
  for (const [name, value] of Object.entries(themes[id].tokens))
    root.style.setProperty(name, value);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themes[id].tokens["--app-bg"]);
}
