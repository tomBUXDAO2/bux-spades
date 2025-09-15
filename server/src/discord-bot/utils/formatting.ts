/**
 * Helper to format coin values
 */
export function formatCoins(amount: number): string {
  return amount >= 1_000_000 ? `${amount / 1_000_000}M` : `${Math.round(amount / 1000)}k`;
}
