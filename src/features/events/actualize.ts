import type { EventDraft } from '@/agents/event/schema';
import { appendKnowledge } from '@/lib/knowledge';
import { fromDraft } from './agent';
import type { EventFormValues } from './schema';

/**
 * "AI actualization" of an event brand: the agent researches it again and the
 * answer is laid over the record as a diff the operator can see and undo
 * before saving. Rules:
 *  - a field the agent could not establish never overwrites what is stored;
 *  - a differing value goes into the field, the stored value is kept as
 *    `previous` for display;
 *  - dates: a date the record does not have is ADDED; a date it already has
 *    is left exactly as it is, because its place, times and name are usually
 *    curated by hand and the agent sees only what is announced today;
 *  - the operator's instruction is knowledge about the brand: the agent
 *    returns news_pattern / lineup_pattern merged, and when it returns
 *    nothing, the instruction is kept in news_pattern as it was written.
 */
export const EVENT_ACTUALIZED_FIELDS = ['name', 'event_type', 'website_url', 'description', 'news_pattern', 'lineup_pattern'] as const satisfies readonly (keyof EventFormValues)[];
export type EventActualizedField = (typeof EVENT_ACTUALIZED_FIELDS)[number];

export interface EventActualization {
  values: EventFormValues;
  previous: Partial<Record<EventActualizedField, string>>;
  /** Dates the agent announced that the record did not have. */
  added: string[];
  /** Dates the record already had — left untouched. */
  kept: number;
}

const isEmpty = (v: string) => v.trim() === '';
const same = (a: string, b: string) => a.trim() === b.trim();

export async function actualizeEvent(current: EventFormValues, draft: EventDraft, instruction: string): Promise<EventActualization> {
  const fresh = (await fromDraft(draft)).values;
  const values: EventFormValues = { ...current };
  const previous: Partial<Record<EventActualizedField, string>> = {};

  for (const key of EVENT_ACTUALIZED_FIELDS) {
    const next = fresh[key];
    const now = current[key];
    if (isEmpty(next) || same(next, now)) continue;
    values[key] = next;
    previous[key] = now;
  }

  // The instruction is knowledge even when the agent folded nothing in.
  if (instruction.trim() && isEmpty(fresh.news_pattern)) {
    const merged = appendKnowledge(current.news_pattern, instruction);
    if (!same(merged, current.news_pattern)) {
      values.news_pattern = merged;
      previous.news_pattern = current.news_pattern;
    }
  }

  const have = new Set(current.occurrences.map((o) => o.start_date));
  const added = fresh.occurrences.filter((o) => o.start_date && !have.has(o.start_date));
  values.occurrences = [...added, ...current.occurrences];

  return { values, previous, added: added.map((o) => o.start_date), kept: current.occurrences.length };
}

/** What the agent is told the stored brand is, its accumulated knowledge included. */
export function keywordsForEvent(v: EventFormValues): string {
  const parts = [v.name, v.website_url].map((s) => s.trim()).filter(Boolean);
  if (v.news_pattern.trim()) parts.push(`news pattern: ${v.news_pattern.trim().slice(0, 600)}`);
  if (v.lineup_pattern.trim()) parts.push(`lineup pattern: ${v.lineup_pattern.trim().slice(0, 600)}`);
  return parts.join('; ');
}
