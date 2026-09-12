/** Customer-facing action tokens. Light-on-dark or dark-on-light only. */

export const SPARES_TONES = {
  ink: "#eceae4",
  onInk: "#0c0d0f",
  paper: "#0c0d0f",
  onPaper: "#eceae4",
  lift: "#16181d",
  accent: "#0a84ff",
  onAccent: "#ffffff",
  muted: "#a8a49c",
  danger: "#c23b3b",
  onDanger: "#ffffff",
  soft: "#1c1f26",
  stage: "#12161c",
  chrome: "#6b717a",
  onChrome: "#eceae4",
  chip: "#1a2028",
  onChip: "#eceae4",
  login: "#0c0d0f",
  onLogin: "#eceae4",
} as const;

function channel(value: number) {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
