import { supabase } from '@/lib/supabase';
import { normalizeName } from '@/lib/normalize';
import type { EventDraft } from '@/agents/event/schema';
import { addDays, emptyEventForm, type EventFormValues, type OccurrenceFormValue } from './schema';

const str = (v: string | null) => v ?? '';

export interface EventDraftMapping {
  values: EventFormValues;
  /** Venue names the draft used that matched a stored place. */
  matchedPlaces: string[];
  /** Venue names with no stored place — carried as new_place, created on save and tagged with the event. */
  newPlaces: string[];
}

/**
 * The agent's draft as form values. Each date's venue is looked up among
 * stored places by normalised name; a single active match sets the default
 * place and its time zone. An unknown venue travels with the row as
 * new_place: save_event_with_occurrences() creates it in the same
 * transaction and tags it with the event name.
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
  const created = new Set<string>();
  const occurrences: OccurrenceFormValue[] = d.occurrences.map((o) => {
    const hit = o.place_name ? places.get(normalizeName(o.place_name)) : null;
    if (o.place_name) (hit ? matched : created).add(o.place_name);
    const start_time = o.start_time ?? '23:00';
    const end_time = o.end_time ?? '06:00';
    // No end day given: the same night, which is the next morning when the close is before the start.
    const end_date = o.end_date && o.end_date >= o.event_date ? o.end_date : end_time <= start_time ? addDays(o.event_date, 1) : o.event_date;
    return {
      occurrence_id: null,
      start_date: o.event_date,
      end_date,
      primary_place_id: hit?.place_id ?? null,
      new_place: !hit && o.place_name ? {
        name: o.place_name,
        city: str(o.city),
        region: str(o.region),
        country: str(o.country),
        timezone: str(o.timezone),
        lifecycle_type: o.place_lifecycle_type ?? (d.event.event_type === 'festival' ? 'temporary' : 'permanent'),
      } : null,
      timezone: hit?.timezone ?? str(o.timezone),
      start_time,
      end_time,
      occurrence_name: str(o.occurrence_name),
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
    newPlaces: Array.from(created),
  };
}
