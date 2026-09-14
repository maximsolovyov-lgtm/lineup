import { z } from 'zod';
import type { Json, Tables, TablesInsert } from '@/types/database';
import { PLACE_LIFECYCLE_TYPES, RECORD_STATUSES } from '@/types/database';
import type { RoomFormValue } from '@/components/form/RoomsEditor';

// Form values are strings for every text/number input so react-hook-form
// typing stays simple; toPayload() converts to the database shape.

const optionalInt = (msg = 'Whole number') => z.string().trim().regex(/^\d*$/, msg);
const optionalSignedInt = z.string().trim().regex(/^-?\d*$/, 'Whole number');
const optionalTime = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Use HH:MM');
const optionalUrl = z.string().trim().max(2048).refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must start with http:// or https://');
const coordinate = (limit: number) =>
  z.string().trim().refine((v) => v === '' || (/^-?\d+(\.\d+)?$/.test(v) && Math.abs(Number(v)) <= limit), `Between -${limit} and ${limit}`);

export const roomSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(256),
  is_headliner_room: z.boolean(),
  capacity: optionalInt(),
  notes: z.string().max(1000),
});

export const placeFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(512),
  parent_place_id: z.string().uuid().nullable(),
  lifecycle_type: z.enum(PLACE_LIFECYCLE_TYPES as [string, ...string[]]),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),

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
  typical_room_count: optionalInt(),
  typical_rooms: z.array(roomSchema),
  typical_headliner_room_name: z.string().trim().max(256),
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

export const emptyPlaceForm: PlaceFormValues = {
  name: '', parent_place_id: null, lifecycle_type: 'permanent', status: 'active',
  address: '', city: '', region: '', country: '', latitude: '', longitude: '', timezone: '', capacity: '',
  website_url: '', instagram_account: '', instagram_url: '', facebook_account: '', facebook_url: '',
  news_pattern: '', lineup_pattern: '',
  typical_party_start_time: '', typical_party_end_time: '',
  typical_party_start_day_offset: '0', typical_party_end_day_offset: '',
  typical_room_count: '', typical_rooms: [], typical_headliner_room_name: '',
  typical_headliner_start_time: '', typical_headliner_start_day_offset: '',
  typical_headliner_end_time: '', typical_headliner_end_day_offset: '',
  lineup_pattern_confidence_score: '', lineup_pattern_sample_size: '', lineup_pattern_notes: '',
};

const str = (v: string | null | undefined) => v ?? '';
const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const hhmm = (v: string | null | undefined) => (v ? v.slice(0, 5) : '');

export function fromRow(row: PlaceRow): PlaceFormValues {
  const rooms = Array.isArray(row.typical_rooms_json) ? (row.typical_rooms_json as Record<string, Json | undefined>[]) : [];
  return {
    name: row.name,
    parent_place_id: row.parent_place_id,
    lifecycle_type: row.lifecycle_type,
    status: row.status,
    address: str(row.address), city: str(row.city), region: str(row.region), country: str(row.country),
    latitude: num(row.latitude), longitude: num(row.longitude), timezone: str(row.timezone), capacity: num(row.capacity),
    website_url: str(row.website_url), instagram_account: str(row.instagram_account), instagram_url: str(row.instagram_url),
    facebook_account: str(row.facebook_account), facebook_url: str(row.facebook_url),
    news_pattern: str(row.news_pattern), lineup_pattern: str(row.lineup_pattern),
    typical_party_start_time: hhmm(row.typical_party_start_time),
    typical_party_end_time: hhmm(row.typical_party_end_time),
    typical_party_start_day_offset: num(row.typical_party_start_day_offset),
    typical_party_end_day_offset: num(row.typical_party_end_day_offset),
    typical_room_count: num(row.typical_room_count),
    typical_rooms: rooms.map((r): RoomFormValue => ({
      name: typeof r.name === 'string' ? r.name : '',
      is_headliner_room: r.is_headliner_room === true,
      capacity: typeof r.capacity === 'number' ? String(r.capacity) : '',
      notes: typeof r.notes === 'string' ? r.notes : '',
    })),
    typical_headliner_room_name: str(row.typical_headliner_room_name),
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

/** Converts validated form values to the row the database expects. */
export function toPayload(v: PlaceFormValues): TablesInsert<'place'> {
  const rooms: Json[] = v.typical_rooms.map((r) => {
    const room: { [k: string]: Json } = { name: r.name.trim(), is_headliner_room: r.is_headliner_room };
    if (r.capacity.trim() !== '') room.capacity = Number.parseInt(r.capacity, 10);
    if (r.notes.trim() !== '') room.notes = r.notes.trim();
    return room;
  });

  return {
    name: v.name.trim(),
    parent_place_id: v.parent_place_id,
    lifecycle_type: v.lifecycle_type as PlaceRow['lifecycle_type'],
    status: v.status as PlaceRow['status'],
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
    // typical_room_count is derived by the database trigger when rooms are given.
    typical_room_count: rooms.length > 0 ? rooms.length : intOrNull(v.typical_room_count),
    typical_rooms_json: rooms.length > 0 ? rooms : null,
    typical_headliner_room_name: nullIfEmpty(v.typical_headliner_room_name),
    typical_headliner_start_time: nullIfEmpty(v.typical_headliner_start_time),
    typical_headliner_start_day_offset: intOrNull(v.typical_headliner_start_day_offset),
    typical_headliner_end_time: nullIfEmpty(v.typical_headliner_end_time),
    typical_headliner_end_day_offset: intOrNull(v.typical_headliner_end_day_offset),
    lineup_pattern_confidence_score: floatOrNull(v.lineup_pattern_confidence_score),
    lineup_pattern_sample_size: intOrNull(v.lineup_pattern_sample_size),
    lineup_pattern_notes: nullIfEmpty(v.lineup_pattern_notes),
  };
}
