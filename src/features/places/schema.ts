import { z } from 'zod';
import type { Json, Tables } from '@/types/database';
import { PLACE_LIFECYCLE_TYPES, RECORD_STATUSES } from '@/types/enums';
import { normalizeName } from '@/lib/normalize';

// Form values are strings for every text/number input so react-hook-form
// typing stays simple; toPayload() converts to the database shape.

const optionalInt = (msg = 'Whole number') => z.string().trim().regex(/^\d*$/, msg);
const optionalSignedInt = z.string().trim().regex(/^-?\d*$/, 'Whole number');
const optionalTime = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Use HH:MM');
const optionalUrl = z.string().trim().max(2048).refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must start with http:// or https://');
const coordinate = (limit: number) =>
  z.string().trim().refine((v) => v === '' || (/^-?\d+(\.\d+)?$/.test(v) && Math.abs(Number(v)) <= limit), `Between -${limit} and ${limit}`);

// One row of the rooms block: a place_space row, or a new one when space_id is null.
export const spaceSchema = z.object({
  space_id: z.string().uuid().nullable(),
  name: z.string().trim().min(1, 'Required').max(512),
  space_type: z.string().trim().max(64),
  capacity: optionalInt(),
  notes: z.string().max(2000),
  is_primary: z.boolean(),
  // Actualization marks — display only, never sent. A removed room is left
  // out of the payload and so becomes inactive on save.
  client_key: z.string().optional(),
  change: z.enum(['added', 'changed']).optional(),
  previous: z.record(z.string()).optional(),
  removed: z.boolean().optional(),
});
export type SpaceFormValue = z.infer<typeof spaceSchema>;

// The database rejects both of these too (uq_place_space_name, uq_place_space_primary);
// checking here puts the message on the row instead of in a toast.
const spacesSchema = z.array(spaceSchema).superRefine((spaces, ctx) => {
  const seen = new Map<string, number>();
  spaces.forEach((sp, i) => {
    const key = normalizeName(sp.name);
    if (!key) return;
    const first = seen.get(key);
    if (first !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'name'], message: `Same name as room ${first + 1}` });
    } else {
      seen.set(key, i);
    }
  });
  const primaries = spaces.flatMap((sp, i) => (sp.is_primary && !sp.removed ? [i] : []));
  primaries.slice(1).forEach((i) => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'is_primary'], message: 'Only one primary room' });
  });
});

export const placeFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(512),
  parent_place_id: z.string().uuid().nullable(),
  lifecycle_type: z.enum(PLACE_LIFECYCLE_TYPES as [string, ...string[]]),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
  tags: z.array(z.string().trim().min(1).max(64)).max(32),

  address: z.string().max(2000),
  city: z.string().trim().max(256),
  region: z.string().trim().max(256),
  country: z.string().trim().max(128),
  latitude: coordinate(90),
  longitude: coordinate(180),
  timezone: z.string().trim().max(64),
  capacity: optionalInt(),

  website_url: optionalUrl,
  instagram_account: z.string().trim().regex(/^[A-Za-z0-9._]{0,30}$/, 'Letters, digits, dots, underscores; max 30'),
  instagram_url: optionalUrl,
  facebook_account: z.string().trim().max(128),
  facebook_url: optionalUrl,

  news_pattern: z.string(),
  lineup_pattern: z.string(),
  typical_party_start_time: optionalTime,
  typical_party_end_time: optionalTime,
  typical_party_start_day_offset: optionalSignedInt,
  typical_party_end_day_offset: optionalSignedInt,
  spaces: spacesSchema,
  typical_headliner_start_time: optionalTime,
  typical_headliner_start_day_offset: optionalSignedInt,
  typical_headliner_end_time: optionalTime,
  typical_headliner_end_day_offset: optionalSignedInt,
  lineup_pattern_confidence_score: z.string().trim().refine((v) => v === '' || (/^\d*(\.\d+)?$/.test(v) && Number(v) >= 0 && Number(v) <= 1), 'Between 0 and 1'),
  lineup_pattern_sample_size: optionalInt(),
  lineup_pattern_notes: z.string(),
});

export type PlaceFormValues = z.infer<typeof placeFormSchema>;
export type PlaceRow = Tables<'place'>;
export type SpaceRow = Tables<'place_space'>;

export const emptyPlaceForm: PlaceFormValues = {
  name: '', parent_place_id: null, lifecycle_type: 'permanent', status: 'active', tags: [],
  address: '', city: '', region: '', country: '', latitude: '', longitude: '', timezone: '', capacity: '',
  website_url: '', instagram_account: '', instagram_url: '', facebook_account: '', facebook_url: '',
  news_pattern: '', lineup_pattern: '',
  typical_party_start_time: '', typical_party_end_time: '',
  typical_party_start_day_offset: '0', typical_party_end_day_offset: '',
  spaces: [],
  typical_headliner_start_time: '', typical_headliner_start_day_offset: '',
  typical_headliner_end_time: '', typical_headliner_end_day_offset: '',
  lineup_pattern_confidence_score: '', lineup_pattern_sample_size: '', lineup_pattern_notes: '',
};

const str = (v: string | null | undefined) => v ?? '';
const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const hhmm = (v: string | null | undefined) => (v ? v.slice(0, 5) : '');

export function fromRow(row: PlaceRow, spaces: SpaceRow[]): PlaceFormValues {
  return {
    name: row.name,
    parent_place_id: row.parent_place_id,
    lifecycle_type: row.lifecycle_type,
    status: row.status,
    tags: row.tags,
    address: str(row.address), city: str(row.city), region: str(row.region), country: str(row.country),
    latitude: num(row.latitude), longitude: num(row.longitude), timezone: str(row.timezone), capacity: num(row.capacity),
    website_url: str(row.website_url), instagram_account: str(row.instagram_account), instagram_url: str(row.instagram_url),
    facebook_account: str(row.facebook_account), facebook_url: str(row.facebook_url),
    news_pattern: str(row.news_pattern), lineup_pattern: str(row.lineup_pattern),
    typical_party_start_time: hhmm(row.typical_party_start_time),
    typical_party_end_time: hhmm(row.typical_party_end_time),
    typical_party_start_day_offset: num(row.typical_party_start_day_offset),
    typical_party_end_day_offset: num(row.typical_party_end_day_offset),
    spaces: spaces.map((s): SpaceFormValue => ({
      space_id: s.space_id,
      name: s.name,
      space_type: str(s.space_type),
      capacity: num(s.capacity),
      notes: str(s.notes),
      is_primary: s.is_primary,
    })),
    typical_headliner_start_time: hhmm(row.typical_headliner_start_time),
    typical_headliner_start_day_offset: num(row.typical_headliner_start_day_offset),
    typical_headliner_end_time: hhmm(row.typical_headliner_end_time),
    typical_headliner_end_day_offset: num(row.typical_headliner_end_day_offset),
    lineup_pattern_confidence_score: num(row.lineup_pattern_confidence_score),
    lineup_pattern_sample_size: num(row.lineup_pattern_sample_size),
    lineup_pattern_notes: str(row.lineup_pattern_notes),
  };
}

const nullIfEmpty = (v: string) => (v.trim() === '' ? null : v.trim());
const intOrNull = (v: string) => (v.trim() === '' ? null : Number.parseInt(v, 10));
const floatOrNull = (v: string) => (v.trim() === '' ? null : Number.parseFloat(v));

/** The two arguments of save_place_with_spaces(): the place columns and the rooms in display order. */
export interface SavePlaceArgs {
  p_place: { [k: string]: Json };
  p_spaces: { [k: string]: Json }[];
}

export function toPayload(v: PlaceFormValues, placeId: string | null): SavePlaceArgs {
  const p_place: { [k: string]: Json } = {
    place_id: placeId,
    name: v.name.trim(),
    parent_place_id: v.parent_place_id,
    lifecycle_type: v.lifecycle_type,
    status: v.status,
    tags: v.tags,
    address: nullIfEmpty(v.address), city: nullIfEmpty(v.city), region: nullIfEmpty(v.region), country: nullIfEmpty(v.country),
    latitude: floatOrNull(v.latitude), longitude: floatOrNull(v.longitude), timezone: nullIfEmpty(v.timezone), capacity: intOrNull(v.capacity),
    website_url: nullIfEmpty(v.website_url),
    instagram_account: nullIfEmpty(v.instagram_account), instagram_url: nullIfEmpty(v.instagram_url),
    facebook_account: nullIfEmpty(v.facebook_account), facebook_url: nullIfEmpty(v.facebook_url),
    news_pattern: nullIfEmpty(v.news_pattern), lineup_pattern: nullIfEmpty(v.lineup_pattern),
    typical_party_start_time: nullIfEmpty(v.typical_party_start_time),
    typical_party_end_time: nullIfEmpty(v.typical_party_end_time),
    typical_party_start_day_offset: intOrNull(v.typical_party_start_day_offset),
    typical_party_end_day_offset: intOrNull(v.typical_party_end_day_offset),
    typical_headliner_start_time: nullIfEmpty(v.typical_headliner_start_time),
    typical_headliner_start_day_offset: intOrNull(v.typical_headliner_start_day_offset),
    typical_headliner_end_time: nullIfEmpty(v.typical_headliner_end_time),
    typical_headliner_end_day_offset: intOrNull(v.typical_headliner_end_day_offset),
    lineup_pattern_confidence_score: floatOrNull(v.lineup_pattern_confidence_score),
    lineup_pattern_sample_size: intOrNull(v.lineup_pattern_sample_size),
    lineup_pattern_notes: nullIfEmpty(v.lineup_pattern_notes),
  };
  const p_spaces = v.spaces.filter((sp) => !sp.removed).map((sp) => ({
    space_id: sp.space_id,
    name: sp.name.trim(),
    space_type: nullIfEmpty(sp.space_type),
    capacity: intOrNull(sp.capacity),
    notes: nullIfEmpty(sp.notes),
    is_primary: sp.is_primary,
  }));
  return { p_place, p_spaces };
}
