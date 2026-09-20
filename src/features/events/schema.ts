import { z } from 'zod';
import { Constants, type Json, type Tables } from '@/types/database';
import { RECORD_STATUSES } from '@/types/enums';
import { instantToWallTime, wallTimeToInstant } from '@/lib/datetime';

export const EVENT_TYPES = Constants.public.Enums.event_type;

const optionalUrl = z.string().trim().max(2048).refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must start with http:// or https://');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time');

/**
 * One row of the occurrences block. The operator enters the BUSINESS DAY and
 * two wall-clock times in the venue's zone; toPayload turns them into the
 * instants the database stores. An end time at or before the start time
 * means the next morning: 23:00 → 06:00 is Friday night into Saturday.
 */
export const occurrenceSchema = z.object({
  occurrence_id: z.string().uuid().nullable(),
  event_date: date,
  primary_place_id: z.string().uuid().nullable(),
  timezone: z.string(),
  start_time: time,
  end_time: time,
  occurrence_name: z.string().trim().max(512),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
});
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

export function emptyOccurrence(timezone: string): OccurrenceFormValue {
  return { occurrence_id: null, event_date: '', primary_place_id: null, timezone, start_time: '23:00', end_time: '06:00', occurrence_name: '', status: 'active' };
}

export function fromRow(row: EventRow, occurrences: OccurrenceRow[]): EventFormValues {
  return {
    name: row.name,
    event_type: row.event_type,
    website_url: row.website_url ?? '',
    description: row.description ?? '',
    status: row.status,
    occurrences: occurrences.map((o) => ({
      occurrence_id: o.occurrence_id,
      event_date: o.event_date,
      primary_place_id: o.primary_place_id,
      timezone: o.timezone ?? '',
      start_time: instantToWallTime(o.starts_at, o.timezone).slice(11, 16),
      end_time: instantToWallTime(o.ends_at, o.timezone).slice(11, 16),
      occurrence_name: o.occurrence_name ?? '',
      status: o.status,
    })),
  };
}

/** Adds `days` to an ISO date string without touching time zones. */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = Date.UTC(y!, m! - 1, d! + days);
  return new Date(t).toISOString().slice(0, 10);
}

/** Business day + wall times in the venue zone → the two instants. Exported for the row preview. */
export function occurrenceWindow(o: Pick<OccurrenceFormValue, 'event_date' | 'start_time' | 'end_time' | 'timezone'>) {
  if (!o.event_date || !o.start_time || !o.end_time) return null;
  const endDate = o.end_time <= o.start_time ? addDays(o.event_date, 1) : o.event_date;
  const starts_at = wallTimeToInstant(`${o.event_date}T${o.start_time}`, o.timezone || null);
  const ends_at = wallTimeToInstant(`${endDate}T${o.end_time}`, o.timezone || null);
  return starts_at && ends_at ? { starts_at, ends_at, nextDay: endDate !== o.event_date } : null;
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
        event_date: o.event_date,
        primary_place_id: o.primary_place_id,
        starts_at: w?.starts_at ?? null,
        ends_at: w?.ends_at ?? null,
        timezone: nullIfEmpty(o.timezone),
        occurrence_name: nullIfEmpty(o.occurrence_name),
        status: o.status,
      };
    }),
  };
}
