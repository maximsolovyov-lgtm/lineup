import { supabase } from '@/lib/supabase';
import { normalizeName } from '@/lib/normalize';
import { wallTimeToInstant } from '@/lib/datetime';
import type { LineupDraft, LineupDraftSlot } from '@/agents/lineup/schema';
import { slotLabel, type LineupSlotValue } from './schema';
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

/**
 * What the agent should know about the place before it reads a publication:
 * the venue's and the event's own sites — web_fetch can only open URLs it has
 * been given or found, and the venue's sitemap names the page for the night —
 * and the venue's line-up pattern, which is what settles an ambiguous "A & B".
 */
export async function placeHints(placeId: string | null, eventId: string | null): Promise<string[]> {
  const [pl, ev] = await Promise.all([
    placeId ? supabase.from('place').select('website_url,lineup_pattern').eq('place_id', placeId).maybeSingle() : null,
    eventId ? supabase.from('event').select('website_url').eq('event_id', eventId).maybeSingle() : null,
  ]);
  const sites = [pl?.data?.website_url, ev?.data?.website_url].filter((u): u is string => !!u && /^https?:\/\//i.test(u));
  const hints = [...new Set(sites)].map((u) => `site: ${u}`);
  const pattern = pl?.data?.lineup_pattern?.trim();
  if (pattern) hints.push(`lineup pattern: ${pattern.replace(/\s+/g, ' ').slice(0, 600)}`);
  return hints;
}

/** The venue's line-up pattern as stored — what the operator is asked to confirm or replace. */
export async function fetchLineupPattern(placeId: string): Promise<string | null> {
  const { data } = await supabase.from('place').select('lineup_pattern').eq('place_id', placeId).maybeSingle();
  return data?.lineup_pattern ?? null;
}

/** Records at the venue what its wording means, so the next parse is not a guess. */
export async function saveLineupPattern(placeId: string, pattern: string): Promise<void> {
  const { error } = await supabase.from('place').update({ lineup_pattern: pattern.trim() }).eq('place_id', placeId);
  if (error) throw error;
}

/** The labelled keywords the line-up agent reads. */
export function keywordsFor(p: FinderParams, occ: FoundOccurrence | null, current: string[] | null, sites: string[] = []): string {
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
  parts.push(...sites);
  return parts.join('; ');
}

export interface ResolvedRoster {
  slots: LineupSlotValue[];
  matched: string[];
  toCreate: string[];
  /** Lines the publication printed in a way that allows more than one reading. */
  unclear: { printed: string; alternatives: string[] }[];
}

/**
 * Names a publication uses for "no name yet". They resolve to the placeholder
 * artists, never to a new artist record: "Solomun b2b TBA" is a b2b whose
 * second act is the TBA placeholder.
 */
const PLACEHOLDER_ALIASES: Record<string, string> = {
  'tba': 'TBA', 'tbc': 'TBA', 'to be announced': 'TBA', 'to be confirmed': 'TBA', 'more tba': 'TBA', 'more to be announced': 'TBA',
  'secret guest': 'Secret guest', 'secret set': 'Secret guest', 'secret': 'Secret guest',
  'surprise guest': 'Surprise guest', 'special guest': 'Surprise guest', 'mystery guest': 'Surprise guest', 'guest tba': 'Surprise guest',
  'unknown': 'Unknown', 'unknown artist': 'Unknown', 'unidentified': 'Unknown', 'tbd': 'TBA',
};

/**
 * The published lines → form slots. Every act is matched to a stored artist by
 * normalised name (placeholder artists first, so TBA never becomes a record);
 * the rest become acts flagged to be created when the line-up is saved. The
 * printed line is kept whenever it says more than the acts do.
 */
export async function resolveRoster(draft: NonNullable<LineupDraft['lineup']>): Promise<ResolvedRoster> {
  const names = [...new Set(draft.artists.flatMap((s) => s.artists).map((n) => normalizeName(n)).filter(Boolean))];
  const aliases = [...new Set(Object.values(PLACEHOLDER_ALIASES).map((n) => normalizeName(n)))];
  const byName = new Map<string, { artist_id: string; name: string }>();
  const wanted = [...new Set([...names, ...aliases])];
  if (wanted.length > 0) {
    const { data } = await supabase.from('artist').select('artist_id,name,normalized_name,is_placeholder').eq('status', 'active').in('normalized_name', wanted);
    // A placeholder wins its name: "Unknown" is the placeholder act, not some band called Unknown.
    for (const a of [...(data ?? [])].sort((x, y) => Number(y.is_placeholder) - Number(x.is_placeholder))) {
      if (a.normalized_name && !byName.has(a.normalized_name)) byName.set(a.normalized_name, a);
    }
  }
  const find = (printed: string) => {
    const key = normalizeName(printed);
    const alias = PLACEHOLDER_ALIASES[key];
    return byName.get(key) ?? (alias ? byName.get(normalizeName(alias)) : undefined);
  };

  const matched: string[] = [];
  const toCreate: string[] = [];
  const unclear: { printed: string; alternatives: string[] }[] = [];
  const slots: LineupSlotValue[] = draft.artists.map((s) => {
    const artists = s.artists.map((n) => {
      const hit = find(n);
      if (hit) {
        matched.push(hit.name);
        return { artist_id: hit.artist_id, name: hit.name, create: false };
      }
      toCreate.push(n);
      return { artist_id: null, name: n, create: true };
    });
    if (s.kind === 'unknown') unclear.push({ printed: s.printed_as || artists.map((a) => a.name).join(' & '), alternatives: s.kind_alternatives });
    const label = slotLabel(s.kind, artists.map((a) => a.name), '');
    return {
      id: null,
      kind: s.kind,
      artists,
      // Keep the printed line only when the acts do not already spell it out.
      display_name_override: s.printed_as && normalizeName(s.printed_as) !== normalizeName(label) ? s.printed_as : '',
      is_headliner: s.is_headliner,
      placeholder_type: '' as const,
    };
  });
  if (!draft.complete && !slots.some((s) => s.artists.some((a) => a.name.toLowerCase() === 'tba'))) {
    const tba = byName.get(normalizeName('TBA'));
    slots.push({
      id: null, kind: 'solo',
      artists: tba ? [{ artist_id: tba.artist_id, name: tba.name, create: false }] : [],
      display_name_override: tba ? '' : 'TBA', is_headliner: false, placeholder_type: '',
    });
  }
  return { slots, matched: [...new Set(matched)], toCreate: [...new Set(toCreate)], unclear };
}

export interface RosterDiff {
  added: string[];
  removed: string[];
  same: boolean;
}

/** How one published line reads, for comparison and for the operator. */
export function draftSlotLabel(s: LineupDraftSlot): string {
  return slotLabel(s.kind, s.artists, s.printed_as ?? '');
}

/**
 * The published lines against the stored ones, by normalised label — order is
 * not a change, but "Solomun" becoming "Solomun b2b Dixon" is.
 */
export function compareRosters(stored: string[], published: LineupDraftSlot[]): RosterDiff {
  const key = (n: string) => normalizeName(n);
  const s = new Set(stored.map(key));
  const pub = published.map(draftSlotLabel);
  const p = new Set(pub.map(key));
  const added = pub.filter((l) => !s.has(key(l)));
  const removed = stored.filter((l) => !p.has(key(l)));
  return { added, removed, same: added.length === 0 && removed.length === 0 };
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
