/**
 * How one line of a line-up reads. Mirrors public.lineup_slot_label(): the
 * database writes labels with the same rule, and the generator compares what
 * it wrote with what a publication says, so the two must agree exactly.
 *
 * No imports on purpose — the unit tests run this file under node directly.
 */
export function slotLabel(kind: string, names: string[], printed: string): string {
  const n = names.filter((x) => x.trim() !== '');
  if (n.length === 0) return printed.trim();
  // An unclear line must not read as "A & B": "&" is one of the readings the
  // operator has not chosen yet. What was printed is the honest label.
  if (kind === 'unknown' && printed.trim() !== '') return printed.trim();
  if (n.length === 1) return n[0]!;
  if (kind === 'b2b' || kind === 'b3b' || kind === 'b4b') return n.join(` ${kind} `);
  if (kind === 'featuring') return `${n[0]} feat. ${n.slice(1).join(', ')}`;
  if (kind === 'multiple_guests') return `${n[0]} + ${n.slice(1).join(', ')}`;
  return n.join(' & ');
}

/** What is printed between act 1 and act n of a slot, for the chips in the editor. */
export function slotJoinWord(kind: string, index: number): string {
  if (kind === 'b2b' || kind === 'b3b' || kind === 'b4b') return kind;
  if (kind === 'featuring') return index === 1 ? 'feat.' : '+';
  if (kind === 'multiple_guests') return '+';
  return '&';
}
