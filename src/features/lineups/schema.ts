import { z } from 'zod';
import type { Json, Tables } from '@/types/database';
import { RECORD_STATUSES } from '@/types/enums';
import type { SlotFormValue } from '@/components/form/SlotsEditor';

const optionalDateTime = z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/, 'Pick a date and time');

export const slotSchema = z.object({
  id: z.string().uuid().nullable(),
  artist_id: z.string().uuid().nullable(),
  placeholder_type: z.enum(['tbd', 'secret_guest', '']),
  display_name_override: z.string().trim().max(512),
  is_headliner: z.boolean(),
  participant_role: z.string(),
}).refine((s) => !!s.artist_id || !!s.placeholder_type || s.display_name_override.length > 0, {
  message: 'Pick an artist, a placeholder, or type a label', path: ['display_name_override'],
});

export const lineupFormSchema = z.object({
  occurrence_id: z.string().uuid({ message: 'Pick the occurrence' }),
  place_id: z.string().uuid().nullable(),
  version: z.string().regex(/^\d*$/, 'Whole number'),
  published_at: optionalDateTime,
  notes: z.string().max(4000),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
  artists: z.array(slotSchema).superRefine((rows, ctx) => {
    const seen = new Map<string, number>();
    rows.forEach((r, i) => {
      if (!r.artist_id) return;
      const first = seen.get(r.artist_id);
      if (first !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'artist_id'], message: `Already listed as slot ${first + 1}` });
      else seen.set(r.artist_id, i);
    });
  }),
});
export type LineupFormValues = z.infer<typeof lineupFormSchema>;
export type LineupRow = Tables<'lineup'>;
export type LineupArtistRow = Tables<'lineup_artist'>;

export const emptyLineupForm: LineupFormValues = { occurrence_id: '', place_id: null, version: '', published_at: '', notes: '', status: 'active', artists: [] };

export function fromRow(row: LineupRow, artists: LineupArtistRow[]): LineupFormValues {
  return {
    occurrence_id: row.occurrence_id,
    place_id: row.place_id,
    version: String(row.version),
    published_at: row.published_at ? row.published_at.slice(0, 16) : '',
    notes: row.notes ?? '',
    status: row.status,
    artists: artists.map((a): SlotFormValue => ({
      id: a.lineup_artist_id,
      artist_id: a.artist_id,
      placeholder_type: a.placeholder_type ?? '',
      display_name_override: a.display_name_override ?? '',
      is_headliner: a.is_headliner,
      participant_role: 'unknown',
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
 */
export function toPayload(v: LineupFormValues, lineupId: string | null, asNewVersion = false): SaveLineupArgs {
  const fresh = lineupId === null || asNewVersion;
  return {
    p_lineup: {
      lineup_id: fresh ? null : lineupId,
      occurrence_id: v.occurrence_id,
      place_id: v.place_id,
      version: asNewVersion ? null : (v.version.trim() === '' ? null : Number.parseInt(v.version, 10)),
      published_at: v.published_at ? new Date(v.published_at).toISOString() : null,
      notes: nullIfEmpty(v.notes),
      status: asNewVersion ? 'active' : v.status,
    },
    p_artists: v.artists.map((a) => ({
      lineup_artist_id: fresh ? null : a.id,
      artist_id: a.artist_id,
      placeholder_type: a.placeholder_type || null,
      display_name_override: nullIfEmpty(a.display_name_override),
      is_headliner: a.is_headliner,
    })),
  };
}
