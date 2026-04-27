interface ParsedColor {
  r: number | null;
  g: number | null;
  b: number | null;
}

export function getReadableTextColor(bg: string): string {
  const hex = String(bg || "").toLowerCase().trim();
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return "#111827";
  const n = m[1];
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 150 ? "#f9fafb" : "#111827";
}

export function parseColor(bg: string): ParsedColor {
  const raw = String(bg || "").toLowerCase().trim();
  let r: number | null = null;
  let g: number | null = null;
  let b: number | null = null;
  const hex6 = raw.match(/^#([0-9a-f]{6})$/i);
  const hex3 = raw.match(/^#([0-9a-f]{3})$/i);
  const rgb = raw.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/i);

  if (hex6) {
    const n = hex6[1];
    r = parseInt(n.slice(0, 2), 16);
    g = parseInt(n.slice(2, 4), 16);
    b = parseInt(n.slice(4, 6), 16);
  } else if (hex3) {
    const n = hex3[1];
    r = parseInt(n[0] + n[0], 16);
    g = parseInt(n[1] + n[1], 16);
    b = parseInt(n[2] + n[2], 16);
  } else if (rgb) {
    r = Number(rgb[1]);
    g = Number(rgb[2]);
    b = Number(rgb[3]);
  }
  return { r, g, b };
}

export function isRedCell(bg: string): boolean {
  const { r, g, b } = parseColor(bg);
  if (r == null || g == null || b == null) return false;
  return r > 120 && r > g * 1.2 && r > b * 1.2 && (r - g) > 35 && (r - b) > 35;
}

export function isBlueCell(bg: string): boolean {
  const { r, g, b } = parseColor(bg);
  if (r == null || g == null || b == null) return false;
  return b > 120 && b > r * 1.15 && b > g * 1.05;
}

export function isYellowCell(bg: string): boolean {
  const { r, g, b } = parseColor(bg);
  if (r == null || g == null || b == null) return false;
  return r > 170 && g > 130 && b < 170;
}

export function passesBlueYellowFilter(bg: string, showBlueCells: boolean, showYellowCells: boolean): boolean {
  const hasBlueYellowFilter = showBlueCells || showYellowCells;
  if (!hasBlueYellowFilter) return true;
  const blue = isBlueCell(bg);
  const yellow = isYellowCell(bg);
  return (showBlueCells && blue) || (showYellowCells && yellow);
}
