// Extension kept so node --test can load this module without a bundler.
import { normalizeName } from './normalize.ts';

/**
 * Fuzzy matching of room names. The same room comes back from different
 * sources as "Theatre", "The Theatre", "Theater" or "Theatre Room"; the
 * strict normalised name treats those as four rooms. Matching is tiered so
 * the exact match always wins and numbered rooms ("Room 1" / "Room 2")
 * never collapse into each other.
 */

// Articles and generic words that add nothing to a room's identity — dropped
// only when something identifying remains.
const ARTICLES = new Set(['the', 'la', 'le', 'el', 'il', 'los', 'las', 'les', 'der', 'die', 'das']);
const GENERIC = new Set(['room', 'stage', 'floor', 'area', 'hall', 'arena', 'zone', 'tent', 'space']);

/** The identifying core of a room name: normalised, articles and generic words dropped. */
export function roomKey(name: string): string {
  const tokens = normalizeName(name).split(' ').filter(Boolean);
  const noArticles = tokens.filter((t, i) => !(i === 0 && ARTICLES.has(t)));
  const core = noArticles.filter((t) => !GENERIC.has(t));
  return (core.length > 0 ? core : noArticles.length > 0 ? noArticles : tokens).join(' ');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n]!;
}

/**
 * 0 = no match; higher is better. Tiers: exact normalised name (4), same
 * identifying core (3), a small spelling difference on a core of five or
 * more characters — Theater/Theatre (2), one core contained in the other as
 * whole words — "Club" in "Club Room Upstairs" (1).
 */
export function roomSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 4;
  const ka = roomKey(a);
  const kb = roomKey(b);
  if (ka === kb) return 3;
  // Numbered rooms are different rooms whatever else matches.
  const numA = ka.match(/\d+/g)?.join(' ');
  const numB = kb.match(/\d+/g)?.join(' ');
  if (numA !== numB) return 0;
  // One edit from five characters, two from seven: Theatre/Theater, Gardens/Garden — never Loft/Left.
  const shortest = Math.min(ka.length, kb.length);
  if (shortest >= 5 && levenshtein(ka, kb) <= (shortest >= 7 ? 2 : 1)) return 2;
  const wa = ka.split(' ');
  const wb = kb.split(' ');
  const contains = (outer: string[], inner: string[]) => inner.length > 0 && inner.every((w) => outer.includes(w));
  if (contains(wa, wb) || contains(wb, wa)) return 1;
  return 0;
}

/**
 * Pairs each current name with at most one candidate, best matches first
 * (so "Theatre" takes "The Theatre" before "Theatre Bar" could). Returns
 * the candidate index per current index, or -1.
 */
export function matchRooms(current: string[], candidates: string[]): number[] {
  const pairs: { i: number; j: number; score: number }[] = [];
  current.forEach((c, i) => candidates.forEach((d, j) => {
    const score = roomSimilarity(c, d);
    if (score > 0) pairs.push({ i, j, score });
  }));
  pairs.sort((p, q) => q.score - p.score || p.i - q.i || p.j - q.j);
  const result = current.map(() => -1);
  const taken = new Set<number>();
  for (const p of pairs) {
    if (result[p.i] !== -1 || taken.has(p.j)) continue;
    result[p.i] = p.j;
    taken.add(p.j);
  }
  return result;
}
