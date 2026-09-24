import type { ArtistDraft } from '@/agents/artist/schema';
import { appendKnowledge } from '@/lib/knowledge';
import { normalizeName } from '@/lib/normalize';
import { fromDraft } from './agent';
import type { ArtistFormValues } from './schema';

/**
 * "AI actualization" of an act: the agent researches it again and the answer
 * is laid over the record as a diff. Rules:
 *  - a field the agent could not establish never overwrites what is stored;
 *  - members are matched by public name: one the record does not have is
 *    ADDED (linked to an existing person, or created with the artist), one
 *    the agent no longer names is LEFT ALONE — a membership ends by being
 *    dated, not by disappearing from a web page;
 *  - the operator's instruction is knowledge about the act: the agent returns
 *    news_pattern / lineup_pattern merged, and when it returns nothing, the
 *    instruction is kept in news_pattern as it was written.
 */
export const ARTIST_ACTUALIZED_FIELDS = ['name', 'artist_type', 'country', 'instagram_url', 'news_pattern', 'lineup_pattern'] as const satisfies readonly (keyof ArtistFormValues)[];
export type ArtistActualizedField = (typeof ARTIST_ACTUALIZED_FIELDS)[number];

export interface ArtistActualization {
  values: ArtistFormValues;
  previous: Partial<Record<ArtistActualizedField, string>>;
  /** People the agent names that the record did not have. */
  added: string[];
  /** Of those, the ones created with the artist rather than linked to a stored person. */
  created: string[];
}

const isEmpty = (v: string) => v.trim() === '';
const same = (a: string, b: string) => a.trim() === b.trim();

export async function actualizeArtist(current: ArtistFormValues, draft: ArtistDraft, instruction: string): Promise<ArtistActualization> {
  const mapped = await fromDraft(draft);
  const fresh = mapped.values;
  const values: ArtistFormValues = { ...current };
  const previous: Partial<Record<ArtistActualizedField, string>> = {};

  for (const key of ARTIST_ACTUALIZED_FIELDS) {
    const next = fresh[key];
    const now = current[key];
    if (isEmpty(next) || same(next, now)) continue;
    values[key] = next;
    previous[key] = now;
  }

  if (instruction.trim() && isEmpty(fresh.news_pattern)) {
    const merged = appendKnowledge(current.news_pattern, instruction);
    if (!same(merged, current.news_pattern)) {
      values.news_pattern = merged;
      previous.news_pattern = current.news_pattern;
    }
  }

  const have = new Set(current.members.map((m) => normalizeName(m.display_name || m.new_person?.display_name || '')).filter(Boolean));
  const added = fresh.members.filter((m) => {
    const key = normalizeName(m.display_name || m.new_person?.display_name || '');
    return key !== '' && !have.has(key);
  });
  values.members = [...current.members, ...added];

  const addedNames = added.map((m) => m.display_name || m.new_person?.display_name || '?');
  return {
    values, previous,
    added: addedNames,
    created: addedNames.filter((n) => mapped.created.includes(n)),
  };
}

/** What the agent is told the stored act is, its accumulated knowledge included. */
export function keywordsForArtist(v: ArtistFormValues): string {
  const parts = [v.name, v.country, v.instagram_url].map((s) => s.trim()).filter(Boolean);
  if (v.news_pattern.trim()) parts.push(`news pattern: ${v.news_pattern.trim().slice(0, 600)}`);
  if (v.lineup_pattern.trim()) parts.push(`lineup pattern: ${v.lineup_pattern.trim().slice(0, 600)}`);
  return parts.join('; ');
}
