/*
 * Categorical colours for colour classes (Tableau-10 order, extended).
 * They are the same in light and dark mode, so a "Blue" class always looks blue.
 */
export const PALETTE = [
  { name: 'Red', hex: '#e15759' },
  { name: 'Blue', hex: '#4e79a7' },
  { name: 'Green', hex: '#59a14f' },
  { name: 'Yellow', hex: '#edc948' },
  { name: 'Purple', hex: '#b07aa1' },
  { name: 'Orange', hex: '#f28e2b' },
  { name: 'Teal', hex: '#76b7b2' },
  { name: 'Pink', hex: '#ff9da7' },
  { name: 'Brown', hex: '#9c755f' },
  { name: 'Gray', hex: '#bab0ac' },
  { name: 'Sky', hex: '#86bcb6' },
  { name: 'Lime', hex: '#a6c94a' },
];

export const colorHex = (c) => (c == null || c < 0
  ? null
  : c < PALETTE.length
    ? PALETTE[c].hex
    : `hsl(${Math.round((c * 137.508) % 360)} 55% 55%)`);

export const colorName = (c) => PALETTE[c]?.name ?? `Color ${c + 1}`;

/** Black or white, whichever reads better on `hex`. */
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? '#14181f' : '#ffffff';
}

/** CSS colour for a theme token, optionally with alpha: tok('accent', 0.2). */
export const tok = (name, alpha) => (alpha == null ? `rgb(var(--${name}))` : `rgb(var(--${name}) / ${alpha})`);
