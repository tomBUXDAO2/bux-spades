/**
 * Compact = phone / small handset. Tablets (e.g. 1138×712) and laptops use desktop table + hand sizing.
 * Landscape phones are often ≥900px wide but have a short min-edge; tablets keep min-edge large enough.
 */
export function isCompactGameLayout(width: number, height: number): boolean {
  const minEdge = Math.min(width, height);
  if (width < 768) return true;
  if (width < 900) return true;
  if (width >= 900 && minEdge < 500) return true;
  return false;
}
