// Escape a user query so it matches as a literal string, not a regex pattern.
// Guards case-insensitive regex searches against special characters breaking the
// pattern or triggering ReDoS.
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
