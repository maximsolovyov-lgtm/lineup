import { z } from 'zod';
import { Constants, type Json, type Tables } from '@/types/database';
import { RECORD_STATUSES } from '@/types/enums';
import type { SlotFormValue } from '@/components/form/SlotsEditor';

import { instantToWallTime, wallTimeToInstant } from '@/lib/datetime';

export const SET_TYPES = Constants.public.Enums.performance_set_type;
export const PLACE_ROLES = Constants.public.Enums.place_role;
export const INFORMATION_ORIGINS = Constants.public.Enums.information_origin;
export const CONFIRMATION_STATUSES = Constants.public.Enums.confirmation_status;

const optionalDateTime = z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/, 'Pick a date and time');
const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date');

/**
 * One participant of a set: an artist, or a placeholder, or a name as printed,
 * plus the role it has in this set. A line-up SLOT is a different shape — it
 * holds several acts and a kind (src/features/lineups/schema.ts).
 */
export const participantSchema = z.object({
  id: z.string().uuid().nullable(),
  artist_id: z.string().uuid().nullable(),
  placeholder_type: z.enum(['tbd', 'secret_guest', 'unknown', '']),
  display_name_override: z.string().trim().max(512),
  is_headliner: z.boolean(),
  participant_role: z.string(),
}).refine((s) => !!s.artist_id || !!s.placeholder_type || s.display_name_override.length > 0, {
  message: 'Pick an artist, a placeholder, or type a label', path: ['display_name_override'],
});

export const setFormSchema = z.object({
  occurrence_id: z.string().uuid({ message: 'Pick the occurrence' }),
  lineup_id: z.string().uuid().nullable(),
  place_id: z.string().uuid().nullable(),
  place_space_id: z.string().uuid().nullable(),
  timezone: z.string(),
  scenario_type: z.enum(['official', 'predicted']),
  completeness: z.enum(['full', 'partial']),
  scenario_version: z.string().regex(/^\d*$/, 'Whole number'),
  set_type: z.string().min(1),
  display_name: z.string().trim().max(512),
  event_day: optionalDate,
  scheduled_start: optionalDateTime,
  scheduled_end: optionalDateTime,
  place_role: z.string(),
  confidence_score: z.string().trim().refine((v) => v === '' || (/^\d*(\.\d+)?$/.test(v) && Number(v) >= 0 && Number(v) <= 1), 'Between 0 and 1'),
  information_origin: z.string(),
  confirmation_status: z.string(),
  lineup_complete: z.boolean(),
  notes: z.string().max(4000),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
  participants: z.array(participantSchema),
})
  .refine((v) => v.scenario_type !== 'official' || !!v.lineup_id, { message: 'An official set belongs to a line-up', path: ['lineup_id'] })
  .refine((v) => v.scenario_type !== 'predicted' || v.confidence_score !== '', { message: 'A prediction needs a confidence score', path: ['confidence_score'] })
  .refine((v) => !v.scheduled_start || !v.scheduled_end || v.scheduled_end > v.scheduled_start, { message: 'Ends before it starts', path: ['scheduled_end'] })
  .refine((v) => !v.place_space_id || !!v.place_id, { message: 'A room needs the place it belongs to', path: ['place_space_id'] });

export type SetFormValues = z.infer<typeof setFormSchema>;
export type SetRow = Tables<'performance_set'>;
export type ParticipantRow = Tables<'performance_set_participant'>;

export const emptySetForm: SetFormValues = {
  occurrence_id: '', lineup_id: null, place_id: null, place_space_id: null, timezone: '',
  scenario_type: 'official', completeness: 'partial', scenario_version: '', set_type: 'group', display_name: '',
  event_day: '', scheduled_start: '', scheduled_end: '', place_role: '', confidence_score: '',
  information_origin: '', confirmation_status: 'unconfirmed', lineup_complete: false, notes: '', status: 'active', participants: [],
};

export function fromRow(row: SetRow, participants: ParticipantRow[], timezone: string | null): SetFormValues {
  return {
    occurrence_id: row.occurrence_id,
    lineup_id: row.lineup_id,
    place_id: row.place_id,
    place_space_id: row.place_space_id,
    timezone: timezone ?? '',
    scenario_type: row.scenario_type === 'predicted' ? 'predicted' : 'official',
    completeness: row.completeness,
    scenario_version: String(row.scenario_version),
    set_type: row.set_type,
    display_name: row.display_name ?? '',
    event_day: row.event_day ?? '',
    scheduled_start: instantToWallTime(row.scheduled_start_at, timezone),
    scheduled_end: instantToWallTime(row.scheduled_end_at, timezone),
    place_role: row.place_role ?? '',
    confidence_score: row.confidence_score === null ? '' : String(row.confidence_score),
    information_origin: row.information_origin ?? '',
    confirmation_status: row.confirmation_status,
    lineup_complete: row.lineup_complete,
    notes: row.notes ?? '',
    status: row.status,
    participants: participants.map((p): SlotFormValue => ({
      id: p.participant_id,
      artist_id: p.artist_id,
      placeholder_type: p.placeholder_type ?? '',
      display_name_override: p.display_name_override ?? '',
      is_headliner: p.is_headliner ?? false,
      participant_role: p.participant_role,
    })),
  };
}

export interface SaveSetArgs {
  p_set: { [k: string]: Json };
  p_participants: { [k: string]: Json }[];
}

const nullIfEmpty = (v: string) => (v.trim() === '' ? null : v.trim());

/** setId = the row being replaced (it becomes superseded); null = a brand-new set. */
export function toPayload(v: SetFormValues, setId: string | null): SaveSetArgs {
  return {
    p_set: {
      performance_set_id: setId,
      occurrence_id: v.occurrence_id,
      lineup_id: v.lineup_id,
      place_id: v.place_id,
      place_space_id: v.place_space_id,
      scenario_type: v.scenario_type,
      completeness: v.completeness,
      scenario_version: v.scenario_version.trim() === '' ? null : Number.parseInt(v.scenario_version, 10),
      set_type: v.set_type,
      display_name: nullIfEmpty(v.display_name),
      event_day: v.event_day || null,
      scheduled_start_at: v.scheduled_start ? wallTimeToInstant(v.scheduled_start, v.timezone || null) : null,
      scheduled_end_at: v.scheduled_end ? wallTimeToInstant(v.scheduled_end, v.timezone || null) : null,
      place_role: v.place_role || null,
      confidence_score: v.confidence_score === '' ? null : Number.parseFloat(v.confidence_score),
      information_origin: v.information_origin || null,
      confirmation_status: v.confirmation_status || null,
      lineup_complete: v.lineup_complete,
      notes: nullIfEmpty(v.notes),
      status: v.status,
    },
    p_participants: v.participants.map((p) => ({
      artist_id: p.artist_id,
      placeholder_type: p.placeholder_type || null,
      display_name_override: nullIfEmpty(p.display_name_override),
      participant_role: p.participant_role || 'unknown',
      is_headliner: p.is_headliner,
      is_primary: p.participant_role === 'primary' || p.participant_role === 'headliner',
    })),
  };
}
