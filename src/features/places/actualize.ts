import type { PlaceDraft } from '@/agents/place/schema';
import { normalizeName } from '@/lib/normalize';
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
 *  - rooms are matched by normalised name; a new one is added, a changed one
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
  const counts = { added: 0, changed: 0, removed: 0 };
  const byName = new Map<string, SpaceFormValue>();
  for (const s of fresh.spaces) byName.set(normalizeName(s.name), s);

  const kept: SpaceFormValue[] = current.spaces.map((s, i) => {
    const key = s.client_key ?? s.space_id ?? `cur-${i}`;
    const hit = byName.get(normalizeName(s.name));
    if (!hit) {
      if (fresh.spaces.length === 0) return { ...s, client_key: key };
      counts.removed += 1;
      return { ...s, client_key: key, removed: true, change: undefined, previous: undefined };
    }
    byName.delete(normalizeName(s.name));
    const prev: Record<string, string> = {};
    const next = { ...s, client_key: key, removed: false };
    for (const f of ['space_type', 'capacity', 'notes'] as const) {
      if (!isEmpty(hit[f]) && !same(hit[f], s[f])) { prev[f] = s[f]; next[f] = hit[f]; }
    }
    if (hit.is_primary !== s.is_primary && fresh.spaces.some((x) => x.is_primary)) { prev.is_primary = s.is_primary ? 'primary' : 'not primary'; next.is_primary = hit.is_primary; }
    if (Object.keys(prev).length > 0) { counts.changed += 1; next.change = 'changed'; next.previous = prev; }
    return next;
  });

  let n = 0;
  for (const s of byName.values()) {
    counts.added += 1;
    kept.push({ ...s, client_key: `added-${n++}`, change: 'added', removed: false });
  }
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
