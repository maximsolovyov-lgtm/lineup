import { z } from 'zod';
import { Constants, type Enums, type Json, type Tables } from '@/types/database';
import { RECORD_STATUSES } from '@/types/enums';
import { slotLabel } from '@/lib/slot-label';

export { slotLabel };

const optionalDateTime = z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/, 'Pick a date and time');

export type LineupSlotKind = Enums<'lineup_slot_kind'>;
export const LINEUP_SLOT_KINDS = Constants.public.Enums.lineup_slot_kind;
export type PerformanceFormat = Enums<'performance_format'>;
export const PERFORMANCE_FORMATS = Constants.public.Enums.performance_format;
export type LineupSlotTag = Enums<'lineup_slot_tag'>;
export const LINEUP_SLOT_TAGS = Constants.public.Enums.lineup_slot_tag;

/**
 * How the act performs. A bill that says nothing means a DJ set — that is the
 * default, and `unknown` is for a source that leaves the format open.
 */
export const SLOT_FORMAT_INFO: Record<PerformanceFormat, { label: string; hint: string }> = {
  dj_set: { label: 'DJ_SET', hint: 'An ordinary DJ set — what a bill means when it says nothing' },
  live: { label: 'LIVE', hint: 'A live performance' },
  live_pa: { label: 'LIVE_PA', hint: 'An electronic live PA' },
  hybrid: { label: 'HYBRID', hint: 'A DJ set with live elements' },
  dj_live_pa: { label: 'DJ_LIVE_PA', hint: 'Announced as both a DJ set and a live PA' },
  av: { label: 'AV', hint: 'An audio-visual set' },
  acoustic: { label: 'ACOUSTIC', hint: 'An acoustic performance' },
  other: { label: 'OTHER', hint: 'A format we have not classified' },
  unknown: { label: 'UNKNOWN', hint: 'The format is not published' },
};

/** Where in the night the announcement puts the slot. They combine, except STANDARD. */
export const SLOT_TAG_INFO: Record<LineupSlotTag, { label: string; hint: string }> = {
  standard: { label: 'STANDARD', hint: 'Nothing special is claimed — excludes the others' },
  all_night_long: { label: 'ALL_NIGHT_LONG', hint: 'One act plays the whole night' },
  open_to_close: { label: 'OPEN_TO_CLOSE', hint: 'From doors to close — the room has no other act' },
  opening: { label: 'OPENING', hint: 'The set that opens the room' },
  closing: { label: 'CLOSING', hint: 'The set that closes it' },
  sunrise: { label: 'SUNRISE', hint: 'Announced as the sunrise set' },
  sunset: { label: 'SUNSET', hint: 'Announced as the sunset set' },
  afterhours: { label: 'AFTERHOURS', hint: 'After the main night, often another room or venue' },
  peak_time: { label: 'PEAK_TIME', hint: 'The peak slot of the night' },
};

/**
 * How a line of a line-up is classified. `acts` is the number of artists the
 * kind requires (null = two or more, no fixed count); a slot that disagrees
 * is saved anyway and opens a review task — master data arrives incomplete.
 * `rule` is the classification rule, shown to the operator and given to the
 * agent, so both decide the same way.
 */
export const SLOT_KIND_INFO: Record<LineupSlotKind, { label: string; acts: number | null; rule: string }> = {
  solo: { label: 'Solo', acts: 1, rule: 'One act plays its own set. A duo, group or collective that is one artist record (Tale Of Us, Keinemusik) is solo — that is the act, not the format.' },
  b2b: { label: 'B2B', acts: 2, rule: 'Exactly two acts share one set: printed “b2b”, “back to back”, “vs”, “x”, or joined the way this venue’s line-up pattern says means b2b.' },
  b3b: { label: 'B3B', acts: 3, rule: 'Three acts share one set: “b3b”, “b2b2b”.' },
  b4b: { label: 'B4B', acts: 4, rule: 'Four acts share one set: “b4b”, “b2b2b2b”.' },
  collaboration: { label: 'Collaboration', acts: null, rule: 'Two or more acts announced as one joint performance that is not a back-to-back DJ set: “presents”, “meets”, a live A/V show, a one-off project.' },
  featuring: { label: 'A feat. B', acts: null, rule: 'The first act is the main one, the others join part of its set: “feat.”, “featuring”, “with”, “invites”.' },
  multiple_guests: { label: 'Multiple guests', acts: null, rule: 'One host act plus several guests: “A + friends”, “A & guests”, a +1 residency where the guest list is the point.' },
  label_only: { label: 'Label only', acts: 0, rule: 'A line that names no identifiable act: “Resident DJs”, “Local support”. Nothing is created.' },
  unknown: { label: 'Unclear — review', acts: null, rule: 'The wording allows more than one reading — “Solomun & Dixon” can be two sets, a b2b, or A feat. B — and the venue’s line-up pattern does not settle it. Saving opens a review task; record what the wording means at that venue in the place’s line-up pattern.' },
};

/** One act of a slot: a stored artist, or a name as printed that may become one on save. */
export interface SlotArtistValue {
  artist_id: string | null;
  /** Name as printed. Display only when artist_id is set. */
  name: string;
  /** Create an artist record for this name when the line-up is saved. */
  create: boolean;
}

export interface LineupSlotValue {
  id: string | null;
  kind: LineupSlotKind;
  performance_format: PerformanceFormat;
  tags: LineupSlotTag[];
  artists: SlotArtistValue[];
  /** The line exactly as printed — kept when it says more than the acts do. */
  display_name_override: string;
  is_headliner: boolean;
  placeholder_type: 'tbd' | 'secret_guest' | 'unknown' | '';
}

export const slotArtistSchema = z.object({
  artist_id: z.string().uuid().nullable(),
  name: z.string().trim().max(512),
  create: z.boolean(),
}).refine((a) => !!a.artist_id || a.name.trim().length > 0, { message: 'Pick an artist or type the name', path: ['name'] });

export const slotSchema = z.object({
  id: z.string().uuid().nullable(),
  kind: z.enum(LINEUP_SLOT_KINDS as unknown as [LineupSlotKind, ...LineupSlotKind[]]),
  performance_format: z.enum(PERFORMANCE_FORMATS as unknown as [PerformanceFormat, ...PerformanceFormat[]]),
  tags: z.array(z.enum(LINEUP_SLOT_TAGS as unknown as [LineupSlotTag, ...LineupSlotTag[]])),
  artists: z.array(slotArtistSchema),
  display_name_override: z.string().trim().max(512),
  is_headliner: z.boolean(),
  placeholder_type: z.enum(['tbd', 'secret_guest', 'unknown', '']),
}).refine((s) => s.artists.length > 0 || s.display_name_override.trim().length > 0, {
  message: 'Pick the acts, or type the line as printed', path: ['display_name_override'],
});
// A kind that disagrees with the number of acts is NOT an error here: the save
// records it and opens a review task (CLAUDE.md). The editor warns instead.

export const lineupFormSchema = z.object({
  occurrence_id: z.string().uuid({ message: 'Pick the occurrence' }),
  place_id: z.string().uuid().nullable(),
  version: z.string().regex(/^\d*$/, 'Whole number'),
  published_at: optionalDateTime,
  notes: z.string().max(4000),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
  artists: z.array(slotSchema),
});
export type LineupFormValues = z.infer<typeof lineupFormSchema>;
export type LineupRow = Tables<'lineup'>;
export type LineupArtistRow = Tables<'lineup_artist'>;
/** A slot as the queries return it: the row plus its acts. */
export type LineupSlotRow = LineupArtistRow & {
  lineup_artist_participant: { participant_order: number; artist_id: string; artist: { name: string } | null }[];
};

export const emptyLineupForm: LineupFormValues = { occurrence_id: '', place_id: null, version: '', published_at: '', notes: '', status: 'active', artists: [] };

export function emptySlot(): LineupSlotValue {
  return { id: null, kind: 'solo', performance_format: 'dj_set', tags: [], artists: [], display_name_override: '', is_headliner: false, placeholder_type: '' };
}

export function fromRow(row: LineupRow, slots: LineupSlotRow[]): LineupFormValues {
  return {
    occurrence_id: row.occurrence_id,
    place_id: row.place_id,
    version: String(row.version),
    published_at: row.published_at ? row.published_at.slice(0, 16) : '',
    notes: row.notes ?? '',
    status: row.status,
    artists: slots.map((s): LineupSlotValue => ({
      id: s.lineup_artist_id,
      kind: s.kind,
      performance_format: s.performance_format,
      tags: s.tags ?? [],
      artists: [...(s.lineup_artist_participant ?? [])]
        .sort((a, b) => a.participant_order - b.participant_order)
        .map((p) => ({ artist_id: p.artist_id, name: p.artist?.name ?? '', create: false })),
      display_name_override: s.display_name_override ?? '',
      is_headliner: s.is_headliner,
      placeholder_type: s.placeholder_type ?? '',
    })),
  };
}

export interface SaveLineupArgs {
  p_lineup: { [k: string]: Json };
  p_artists: { [k: string]: Json }[];
}

const nullIfEmpty = (v: string) => (v.trim() === '' ? null : v.trim());

/**
 * lineupId = the row being corrected in place; null = a new publication, which
 * takes the next version unless one is typed. asNewVersion clones an existing
 * line-up into a new row (the slots lose their ids) with the next version.
 *
 * An act with no artist record and no "create" flag cannot be a participant:
 * it survives in the printed line, which is filled from the slot's label when
 * the operator left it empty.
 */
export function toPayload(v: LineupFormValues, lineupId: string | null, asNewVersion = false): SaveLineupArgs {
  const fresh = lineupId === null || asNewVersion;
  return {
    p_lineup: {
      lineup_id: fresh ? null : lineupId,
      occurrence_id: v.occurrence_id,
      place_id: v.place_id,
      version: asNewVersion ? null : (v.version.trim() === '' ? null : Number.parseInt(v.version, 10)),
      // Empty = published now: save_lineup() stamps the moment the version is saved.
      published_at: v.published_at ? new Date(v.published_at).toISOString() : null,
      notes: nullIfEmpty(v.notes),
      status: asNewVersion ? 'active' : v.status,
    },
    p_artists: v.artists.map((s) => {
      const kept = s.artists.filter((a) => a.artist_id || a.create);
      const dropped = s.artists.length !== kept.length;
      const printed = nullIfEmpty(s.display_name_override)
        ?? (dropped ? nullIfEmpty(slotLabel(s.kind, s.artists.map((a) => a.name), '')) : null);
      return {
        lineup_artist_id: fresh ? null : s.id,
        kind: s.kind,
        performance_format: s.performance_format,
        tags: s.tags,
        placeholder_type: s.placeholder_type || null,
        display_name_override: printed,
        is_headliner: s.is_headliner,
        artists: kept.map((a) => (a.artist_id ? { artist_id: a.artist_id } : { new_artist: { name: a.name.trim() } })),
      };
    }),
  };
}
