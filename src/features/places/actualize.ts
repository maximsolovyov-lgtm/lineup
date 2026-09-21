import type { PlaceDraft } from '@/agents/place/schema';
import { normalizeName } from '@/lib/normalize';
import { matchRooms } from '@/lib/matching';
import { fromDraft } from './agent';
import type { PlaceFormValues, SpaceFormValue } from './schema';

/**
 * "AI actualization": the agent researches the venue again and the result is
 * laid over the record as a diff the operator can see and undo before
 * saving. Rules:
 *  - a field the agent could not establish (empty in the draft) never
 *    overwrites what is stored;
 *  - a differing value goes into the field, the stored value is kept as
 *    `previous` for display;
 *  - rooms are matched fuzzily (src/lib/matching.ts): "Theatre", "The Theatre"
 *    and "Theater" are one room; a new one is added, a changed one
 *    is updated, one the agent no longer finds is flagged `removed` and
 *    becomes inactive on save (only when the agent found rooms at all —
 *    an empty answer means "did not look", not "there are none").
 */

/** Scalar fields the agent may refresh. Tags, status, parent and the identity of the row are never touched. */
export const ACTUALIZED_FIELDS = [
  'name', 'lifecycle_type', 'address', 'city', 'region', 'country', 'latitude', 'longitude', 'timezone', 'capacity',
  'website_url', 'instagram_account', 'instagram_url', 'facebook_account', 'facebook_url',
  'news_pattern', 'lineup_pattern',
  'typical_party_start_time', 'typical_party_end_time', 'typical_party_start_day_offset', 'typical_party_end_day_offset',
  'typical_headliner_start_time', 'typical_headliner_start_day_offset', 'typical_headliner_end_time', 'typical_headliner_end_day_offset',
  'lineup_pattern_confidence_score', 'lineup_pattern_sample_size', 'lineup_pattern_notes',
] as const satisfies readonly (keyof PlaceFormValues)[];
export type ActualizedField = (typeof ACTUALIZED_FIELDS)[number];

export interface Actualization {
  values: PlaceFormValues;
  /** field → the value that was stored before. */
  previous: Partial<Record<ActualizedField, string>>;
  spaces: { added: number; changed: number; removed: number };
}

const isEmpty = (v: string) => v.trim() === '';
const same = (a: string, b: string) => a.trim() === b.trim();

export function actualize(current: PlaceFormValues, draft: PlaceDraft): Actualization {
  const fresh = fromDraft(draft);
  const values: PlaceFormValues = { ...current };
  const previous: Partial<Record<ActualizedField, string>> = {};

  for (const key of ACTUALIZED_FIELDS) {
    const next = fresh[key];
    const now = current[key];
    if (isEmpty(next) || same(next, now)) continue;
    // A default offset of 0 the agent did not really state is not a change.
    if (key === 'typical_party_start_day_offset' && draft.place.typical_party_start_day_offset === null) continue;
    values[key] = next;
    previous[key] = now;
  }

  // Rooms ------------------------------------------------------------------
  // Matched fuzzily: "Theatre", "The Theatre" and "Theater" are one room
  // (src/lib/matching.ts); numbered rooms never collapse. The stored name is
  // kept — a renaming by a source is shown, not applied silently.
  const counts = { added: 0, changed: 0, removed: 0 };
  const pairing = matchRooms(current.spaces.map((s) => s.name), fresh.spaces.map((s) => s.name));
  const used = new Set<number>();

  const kept: SpaceFormValue[] = current.spaces.map((s, i) => {
    const key = s.client_key ?? s.space_id ?? `cur-${i}`;
    const j = pairing[i] ?? -1;
    const hit = j >= 0 ? fresh.spaces[j] : undefined;
    if (!hit) {
      if (fresh.spaces.length === 0) return { ...s, client_key: key };
      counts.removed += 1;
      return { ...s, client_key: key, removed: true, change: undefined, previous: undefined };
    }
    used.add(j);
    const prev: Record<string, string> = {};
    const next = { ...s, client_key: key, removed: false };
    for (const f of ['space_type', 'capacity', 'notes'] as const) {
      if (!isEmpty(hit[f]) && !same(hit[f], s[f])) { prev[f] = s[f]; next[f] = hit[f]; }
    }
    if (hit.is_primary !== s.is_primary && fresh.spaces.some((x) => x.is_primary)) { prev.is_primary = s.is_primary ? 'primary' : 'not primary'; next.is_primary = hit.is_primary; }
    if (!same(hit.name, s.name) && normalizeName(hit.name) !== normalizeName(s.name)) {
      // Same room under another spelling: keep ours, note theirs in the room's notes only if the notes are empty.
      if (isEmpty(next.notes) && !prev.notes) { prev.notes = s.notes; next.notes = `Also listed as "${hit.name}"`; }
    }
    if (Object.keys(prev).length > 0) { counts.changed += 1; next.change = 'changed'; next.previous = prev; }
    return next;
  });

  let n = 0;
  fresh.spaces.forEach((s, j) => {
    if (used.has(j)) return;
    counts.added += 1;
    kept.push({ ...s, client_key: `added-${n++}`, change: 'added', removed: false });
  });
  // The database allows one primary among active rooms; if the agent's primary
  // was added while a kept room is still primary, the kept one wins.
  const primaries = kept.filter((s) => s.is_primary && !s.removed);
  if (primaries.length > 1) kept.forEach((s) => { if (s.is_primary && s.change === 'added') s.is_primary = false; });

  values.spaces = kept;
  return { values, previous, spaces: counts };
}

/** Keywords that identify the stored venue, for the agent. */
export function keywordsFor(v: PlaceFormValues): string {
  return [v.name, v.city, v.country, v.website_url, v.instagram_url].map((s) => s.trim()).filter(Boolean).join('; ');
}
