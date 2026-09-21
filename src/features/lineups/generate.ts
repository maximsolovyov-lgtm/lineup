import { supabase } from '@/lib/supabase';
import { normalizeName } from '@/lib/normalize';
import { wallTimeToInstant } from '@/lib/datetime';
import type { LineupDraft } from '@/agents/lineup/schema';
import type { SlotFormValue } from '@/components/form/SlotsEditor';
import type { Database } from '@/types/database';

export type FoundOccurrence = Database['public']['Functions']['find_lineups']['Returns'][number];
export interface FoundLineup {
  lineup_id: string; version: number; place_id: string | null; place_name: string | null; published_at: string | null;
  status: string; artist_count: number; artists: string[]; matches_artist: boolean; is_current: boolean;
}

export interface FinderParams {
  date: string;
  days: number;
  eventId: string | null;
  eventName: string | null;
  placeId: string | null;
  placeName: string | null;
  artistId: string | null;
  artistName: string | null;
}

/** The labelled keywords the line-up agent reads. */
export function keywordsFor(p: FinderParams, occ: FoundOccurrence | null, current: string[] | null): string {
  const parts: string[] = [];
  if (occ) {
    parts.push(`occurrence: ${occ.event_name} on ${occ.event_date}${occ.occurrence_name ? ` (${occ.occurrence_name})` : ''}${occ.primary_place_name ? ` at ${occ.primary_place_name}` : ''}`);
    parts.push(`event: ${occ.event_name}`, `date: ${occ.event_date}`);
    if (occ.primary_place_name) parts.push(`place: ${occ.primary_place_name}`);
  } else {
    parts.push('occurrence: none in the system');
    if (p.eventName) parts.push(`event: ${p.eventName}`);
    if (p.date) parts.push(`date: ${p.date}${p.days ? ` (± ${p.days} days)` : ''}`);
    if (p.placeName) parts.push(`place: ${p.placeName}`);
  }
  if (p.artistName) parts.push(`artist: ${p.artistName}`);
  if (current && current.length > 0) parts.push(`current line-up: ${current.join(', ')}`);
  return parts.join('; ');
}

export interface ResolvedRoster {
  slots: SlotFormValue[];
  matched: string[];
  toCreate: string[];
}

/**
 * Published names → slots. An active artist with the same normalised name
 * is that artist; the rest become label rows flagged to be created as
 * artists (type unknown) when the line-up is saved. Placeholders stay
 * placeholders; "+ more TBA" adds one TBA slot.
 */
export async function resolveRoster(draft: NonNullable<LineupDraft['lineup']>): Promise<ResolvedRoster> {
  const names = draft.artists.filter((a) => !a.placeholder).map((a) => normalizeName(a.name)).filter(Boolean);
  const byName = new Map<string, { artist_id: string; name: string }>();
  if (names.length > 0) {
    const { data } = await supabase.from('artist').select('artist_id,name,normalized_name').eq('status', 'active').in('normalized_name', names);
    for (const a of data ?? []) if (a.normalized_name && !byName.has(a.normalized_name)) byName.set(a.normalized_name, a);
  }
  const matched: string[] = [];
  const toCreate: string[] = [];
  const slots: SlotFormValue[] = draft.artists.map((a) => {
    if (a.placeholder) {
      return { id: null, artist_id: null, placeholder_type: a.placeholder, display_name_override: a.placeholder === 'tbd' ? '' : a.name.toLowerCase().includes('guest') ? '' : a.name, is_headliner: a.is_headliner, participant_role: 'unknown' };
    }
    const hit = byName.get(normalizeName(a.name));
    if (hit) {
      matched.push(hit.name);
      return { id: null, artist_id: hit.artist_id, placeholder_type: '', display_name_override: '', is_headliner: a.is_headliner, participant_role: 'unknown' };
    }
    toCreate.push(a.name);
    return { id: null, artist_id: null, placeholder_type: '', display_name_override: a.name, is_headliner: a.is_headliner, participant_role: 'unknown', create_artist: true };
  });
  if (!draft.complete && !slots.some((s) => s.placeholder_type === 'tbd')) {
    slots.push({ id: null, artist_id: null, placeholder_type: 'tbd', display_name_override: '', is_headliner: false, participant_role: 'unknown' });
  }
  return { slots, matched, toCreate };
}

export interface RosterDiff {
  added: string[];
  removed: string[];
  headlinerChanged: string[];
  same: boolean;
}

/** Published roster against the stored one, by normalised name; order is not a change. */
export function compareRosters(stored: { name: string; is_headliner: boolean }[], published: NonNullable<LineupDraft['lineup']>['artists']): RosterDiff {
  const key = (n: string) => normalizeName(n);
  const s = new Map(stored.map((a) => [key(a.name), a]));
  const p = new Map(published.map((a) => [a.placeholder ? `#${a.placeholder}` : key(a.name), a]));
  const added = published.filter((a) => !s.has(a.placeholder ? `#${a.placeholder}` : key(a.name))).map((a) => a.placeholder ? (a.placeholder === 'tbd' ? 'TBA' : 'Secret guest') : a.name);
  const removed = stored.filter((a) => !p.has(key(a.name))).map((a) => a.name);
  const headlinerChanged = published.filter((a) => { const o = s.get(key(a.name)); return o && o.is_headliner !== a.is_headliner; }).map((a) => a.name);
  return { added, removed, headlinerChanged, same: added.length === 0 && removed.length === 0 && headlinerChanged.length === 0 };
}

const nullIfEmpty = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null);

/**
 * The night the agent found is not stored: create what is missing — the
 * place (tagged with the event), the event, the occurrence — reusing what
 * exists by normalised name. Returns the occurrence to build the line-up on.
 */
export async function createOccurrenceFromDraft(o: NonNullable<LineupDraft['occurrence']>): Promise<{ occurrence_id: string; place_id: string | null; event_id: string }> {
  const startT = o.start_time ?? '23:00';
  const endT = o.end_time ?? '06:00';
  const endDate = o.end_date && o.end_date >= o.event_date ? o.end_date : endT <= startT ? addDays(o.event_date, 1) : o.event_date;
  const starts_at = wallTimeToInstant(`${o.event_date}T${startT}`, o.timezone);
  const ends_at = wallTimeToInstant(`${endDate}T${endT}`, o.timezone);
  if (!starts_at || !ends_at) throw new Error(`The agent gave an unusable date or time for ${o.event_name} (${o.event_date} ${startT}–${endT})`);
  const occurrence = {
    event_date: o.event_date,
    starts_at,
    ends_at,
    timezone: o.timezone,
    occurrence_name: nullIfEmpty(o.occurrence_name),
    new_place: o.place_name ? { name: o.place_name, city: nullIfEmpty(o.city), country: nullIfEmpty(o.country), timezone: nullIfEmpty(o.timezone), lifecycle_type: o.event_type === 'festival' ? 'temporary' : 'permanent' } : null,
    status: 'active',
  };

  const { data: events } = await supabase.from('event').select('event_id,name,normalized_name').eq('status', 'active').eq('normalized_name', normalizeName(o.event_name)).limit(1);
  const existingEvent = events?.[0];

  if (!existingEvent) {
    // New event: one transaction creates event, occurrence and (if needed) the place.
    const { data, error } = await supabase.rpc('save_event_with_occurrences', {
      p_event: { name: o.event_name, event_type: o.event_type === 'unknown' ? 'party' : o.event_type, status: 'active' },
      p_occurrences: [occurrence],
    });
    if (error) throw error;
    return await occurrenceOf(data, o.event_date);
  }

  // Existing event: the occurrence is added directly (the RPC would need the
  // whole list of dates, and deactivate what it does not get).
  let place_id: string | null = null;
  if (o.place_name) {
    const { data: places } = await supabase.from('place').select('place_id').eq('status', 'active').eq('normalized_name', normalizeName(o.place_name)).limit(1);
    place_id = places?.[0]?.place_id ?? null;
    if (!place_id) {
      const { data, error } = await supabase.rpc('save_place_with_spaces', {
        p_place: { name: o.place_name, city: nullIfEmpty(o.city), country: nullIfEmpty(o.country), timezone: nullIfEmpty(o.timezone), lifecycle_type: occurrence.new_place!.lifecycle_type, tags: [existingEvent.name.slice(0, 64)], status: 'active' },
        p_spaces: [],
      });
      if (error) throw error;
      place_id = data;
    }
  }
  const { data: ins, error } = await supabase.from('event_occurrence').insert({
    event_id: existingEvent.event_id, event_date: o.event_date, primary_place_id: place_id, occurrence_name: occurrence.occurrence_name,
    starts_at: occurrence.starts_at, ends_at: occurrence.ends_at, timezone: o.timezone, status: 'active',
  }).select('occurrence_id').single();
  if (error) throw error;
  return { occurrence_id: ins.occurrence_id, place_id, event_id: existingEvent.event_id };
}

async function occurrenceOf(eventId: string, eventDate: string) {
  const { data, error } = await supabase.from('event_occurrence').select('occurrence_id,primary_place_id').eq('event_id', eventId).eq('event_date', eventDate).order('created_at', { ascending: false }).limit(1).single();
  if (error) throw error;
  return { occurrence_id: data.occurrence_id, place_id: data.primary_place_id, event_id: eventId };
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}
