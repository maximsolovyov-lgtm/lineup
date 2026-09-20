import { supabase } from '@/lib/supabase';
import { normalizeName } from '@/lib/normalize';
import type { EventDraft } from '@/agents/event/schema';
import { emptyEventForm, type EventFormValues, type OccurrenceFormValue } from './schema';

const str = (v: string | null) => v ?? '';

export interface EventDraftMapping {
  values: EventFormValues;
  /** Venue names the draft used that matched a stored place. */
  matchedPlaces: string[];
  /** Venue names with no stored place — the operator picks or creates one. */
  unmatchedPlaces: string[];
}

/**
 * The agent's draft as form values. Each date's venue is looked up among
 * stored places by normalised name; a single active match sets the default
 * place and its time zone. Unknown venues stay empty and are named in the
 * occurrence name so nothing is lost.
 */
export async function fromDraft(d: EventDraft): Promise<EventDraftMapping> {
  const names = Array.from(new Set(d.occurrences.map((o) => normalizeName(o.place_name ?? '')).filter(Boolean)));
  const places = new Map<string, { place_id: string; name: string; timezone: string | null } | null>();
  if (names.length > 0) {
    const { data } = await supabase.from('place').select('place_id,name,timezone,normalized_name').eq('status', 'active').in('normalized_name', names);
    for (const p of data ?? []) {
      if (!p.normalized_name) continue;
      places.set(p.normalized_name, places.has(p.normalized_name) ? null : p); // two places with one name: the operator decides
    }
  }

  const matched = new Set<string>();
  const unmatched = new Set<string>();
  const occurrences: OccurrenceFormValue[] = d.occurrences.map((o) => {
    const hit = o.place_name ? places.get(normalizeName(o.place_name)) : null;
    if (o.place_name) (hit ? matched : unmatched).add(o.place_name);
    const start = o.start_time ?? '23:00';
    const end = o.end_time ?? '06:00';
    const nameBits = [o.occurrence_name, hit ? null : o.place_name ? `at ${o.place_name}${o.city ? `, ${o.city}` : ''}` : null].filter(Boolean);
    return {
      occurrence_id: null,
      event_date: o.event_date,
      primary_place_id: hit?.place_id ?? null,
      timezone: hit?.timezone ?? str(o.timezone),
      start_time: start,
      end_time: end,
      occurrence_name: nameBits.join(' — '),
      status: 'active',
    };
  });

  return {
    values: {
      ...emptyEventForm,
      name: d.event.name,
      event_type: d.event.event_type,
      website_url: str(d.event.website_url),
      description: str(d.event.description),
      status: 'active',
      occurrences,
    },
    matchedPlaces: Array.from(matched),
    unmatchedPlaces: Array.from(unmatched),
  };
}
