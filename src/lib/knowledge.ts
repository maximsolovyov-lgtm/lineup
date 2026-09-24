/**
 * What an operator tells an agent is not a one-off instruction: "the bill is
 * at this URL", "the label page is stale" is knowledge about the record, and
 * it belongs in its pattern field so the next run does not have to be told.
 *
 * The agent normally returns the merged text itself. This is the fallback for
 * when it returns nothing: keep what is stored and add what was said, once.
 *
 * No imports on purpose — the unit tests run this file under node directly.
 */
export function appendKnowledge(stored: string, learned: string): string {
  const add = learned.trim().replace(/\s+/g, ' ');
  const keep = stored.trim();
  if (add === '') return keep;
  // Already said, in either direction: nothing to add.
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (keep && (norm(keep).includes(norm(add)) || norm(add) === norm(keep))) return keep;
  if (!keep) return add;
  return `${keep}${/[.!?]$/.test(keep) ? '' : '.'} ${add}`;
}
