import { z } from 'zod';
import { Constants, type Json, type Tables } from '@/types/database';
import { RECORD_STATUSES } from '@/types/enums';
import { instantToWallTime, wallTimeToInstant } from '@/lib/datetime';

export const EVENT_TYPES = Constants.public.Enums.event_type;

const optionalUrl = z.string().trim().max(2048).refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must start with http:// or https://');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time');

/** A venue the occurrence brings with it; created (or matched by name) when the event is saved. */
export const newPlaceSchema = z.object({
  name: z.string().trim().min(1).max(512),
  city: z.string().trim().max(256),
  region: z.string().trim().max(256),
  country: z.string().trim().max(128),
  timezone: z.string().trim().max(64),
  lifecycle_type: z.enum(['permanent', 'temporary', 'mobile', 'virtual']),
});
export type NewPlaceValue = z.infer<typeof newPlaceSchema>;

/**
 * One row of the occurrences block. start_date is the BUSINESS DAY (the night
 * the party starts); end_date is the day it ends — the same day for a club
 * night that closes before midnight, the next morning for most nights, a
 * week later for a festival. Times are wall clock in the venue's zone.
 */
export const occurrenceSchema = z.object({
  occurrence_id: z.string().uuid().nullable(),
  start_date: date,
  end_date: date,
  primary_place_id: z.string().uuid().nullable(),
  new_place: newPlaceSchema.nullable(),
  timezone: z.string(),
  start_time: time,
  end_time: time,
  occurrence_name: z.string().trim().max(512),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
}).refine((o) => `${o.end_date}T${o.end_time}` > `${o.start_date}T${o.start_time}`, { message: 'Ends before it starts', path: ['end_date'] });
export type OccurrenceFormValue = z.infer<typeof occurrenceSchema>;

export const eventFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(512),
  event_type: z.string(),
  website_url: optionalUrl,
  description: z.string().max(8000),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
  occurrences: z.array(occurrenceSchema),
});
export type EventFormValues = z.infer<typeof eventFormSchema>;
export type EventRow = Tables<'event'>;
export type OccurrenceRow = Tables<'event_occurrence'>;

export const emptyEventForm: EventFormValues = { name: '', event_type: 'party', website_url: '', description: '', status: 'active', occurrences: [] };

/** Adds `days` to an ISO date string without touching time zones. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export function emptyOccurrence(timezone: string): OccurrenceFormValue {
  return { occurrence_id: null, start_date: '', end_date: '', primary_place_id: null, new_place: null, timezone, start_time: '23:00', end_time: '06:00', occurrence_name: '', status: 'active' };
}

export function fromRow(row: EventRow, occurrences: OccurrenceRow[]): EventFormValues {
  return {
    name: row.name,
    event_type: row.event_type,
    website_url: row.website_url ?? '',
    description: row.description ?? '',
    status: row.status,
    occurrences: occurrences.map((o) => {
      const start = instantToWallTime(o.starts_at, o.timezone);
      const end = instantToWallTime(o.ends_at, o.timezone);
      return {
        occurrence_id: o.occurrence_id,
        start_date: o.event_date,
        end_date: end.slice(0, 10) || o.event_date,
        primary_place_id: o.primary_place_id,
        new_place: null,
        timezone: o.timezone ?? '',
        start_time: start.slice(11, 16),
        end_time: end.slice(11, 16),
        occurrence_name: o.occurrence_name ?? '',
        status: o.status,
      };
    }),
  };
}

/** Start and end instants of one occurrence, for the row preview and the payload. */
export function occurrenceWindow(o: Pick<OccurrenceFormValue, 'start_date' | 'end_date' | 'start_time' | 'end_time' | 'timezone'>) {
  if (!o.start_date || !o.end_date || !o.start_time || !o.end_time) return null;
  const starts_at = wallTimeToInstant(`${o.start_date}T${o.start_time}`, o.timezone || null);
  const ends_at = wallTimeToInstant(`${o.end_date}T${o.end_time}`, o.timezone || null);
  return starts_at && ends_at ? { starts_at, ends_at, days: Math.round((Date.parse(`${o.end_date}T00:00Z`) - Date.parse(`${o.start_date}T00:00Z`)) / 86_400_000) } : null;
}

export interface SaveEventArgs {
  p_event: { [k: string]: Json };
  p_occurrences: { [k: string]: Json }[];
}

const nullIfEmpty = (v: string) => (v.trim() === '' ? null : v.trim());

export function toPayload(v: EventFormValues, eventId: string | null): SaveEventArgs {
  return {
    p_event: {
      event_id: eventId,
      name: v.name.trim(),
      event_type: v.event_type,
      website_url: nullIfEmpty(v.website_url),
      description: nullIfEmpty(v.description),
      status: v.status,
    },
    p_occurrences: v.occurrences.map((o) => {
      const w = occurrenceWindow(o);
      return {
        occurrence_id: o.occurrence_id,
        event_date: o.start_date,
        primary_place_id: o.primary_place_id,
        new_place: o.primary_place_id || !o.new_place ? null : {
          name: o.new_place.name.trim(),
          city: nullIfEmpty(o.new_place.city),
          region: nullIfEmpty(o.new_place.region),
          country: nullIfEmpty(o.new_place.country),
          timezone: nullIfEmpty(o.new_place.timezone),
          lifecycle_type: o.new_place.lifecycle_type,
        },
        starts_at: w?.starts_at ?? null,
        ends_at: w?.ends_at ?? null,
        timezone: nullIfEmpty(o.timezone),
        occurrence_name: nullIfEmpty(o.occurrence_name),
        status: o.status,
      };
    }),
  };
}
