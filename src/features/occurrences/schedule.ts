import { wallTimeToInstant } from '@/lib/datetime';
import { slotLabel } from '@/lib/slot-label';
import { minutesToWallTime, planConfidence, planRoom, timeToMinutes, type PlanSlot } from './plan';
import type { PredictedSetPayload } from './api';

/**
 * A line-up plus the night it belongs to, turned into a predicted timetable.
 *
 * Grouping: a room at a time, a day at a time — the two facts a bill can carry
 * about a line (place_space_id, slot_date). Lines with no room become one
 * group with the room unknown, which is stored as NULL, never as the main room.
 */
export interface ScheduleSlot {
  lineup_artist_id: string;
  kind: string;
  is_headliner: boolean;
  billing_order: number | null;
  place_space_id: string | null;
  slot_date: string | null;
  display_name_override: string | null;
  space: { name: string } | null;
  lineup_artist_participant: { participant_order: number; artist_id: string; artist: { name: string } | null }[];
}

export interface ScheduleLineup {
  lineup_id: string;
  version: number;
  place_id: string | null;
  split_by_day: boolean;
  place: { name: string } | null;
  lineup_artist: ScheduleSlot[];
}

export interface ScheduleOccurrence {
  occurrence_id: string;
  event_date: string;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
}

export interface SchedulePlace {
  typical_party_start_time: string | null;
  typical_party_end_time: string | null;
  typical_party_start_day_offset: number | null;
  typical_party_end_day_offset: number | null;
  typical_headliner_start_time: string | null;
  typical_headliner_start_day_offset: number | null;
  typical_headliner_end_time: string | null;
  typical_headliner_end_day_offset: number | null;
}

export interface PlannedRow {
  slot: ScheduleSlot;
  label: string;
  /** Wall times in the venue's zone, "YYYY-MM-DDTHH:MM". */
  start: string;
  end: string;
  sequence: number;
}

export interface PlannedGroup {
  day: string;
  roomId: string | null;
  roomName: string;
  rows: PlannedRow[];
  /** The headliner slot was taken from the venue's pattern rather than divided. */
  pinned: boolean;
}

export interface SchedulePlan {
  groups: PlannedGroup[];
  notes: string[];
  confidence: number;
}

/** How a line reads, for the set's display_name. */
export function slotText(s: ScheduleSlot): string {
  const names = [...s.lineup_artist_participant]
    .sort((a, b) => a.participant_order - b.participant_order)
    .map((p) => p.artist?.name ?? '')
    .filter(Boolean);
  return slotLabel(s.kind, names, s.display_name_override ?? '');
}

/** A line's kind, as the schedule calls the shape of a set. */
export function setTypeFor(kind: string): string {
  switch (kind) {
    case 'solo': return 'single_artist_set';
    case 'b2b': return 'b2b';
    case 'b3b': case 'b4b': return 'multi_b2b';
    case 'featuring': return 'featuring';
    case 'collaboration': return 'group';
    case 'multiple_guests': return 'hosted_set';
    case 'label_only': return 'placeholder';
    default: return 'unknown';
  }
}

/** What each act is in the set, from the kind of line it was billed on. */
function roleFor(kind: string, index: number): string {
  if (index === 0) return 'primary';
  switch (kind) {
    case 'b2b': case 'b3b': case 'b4b': return 'b2b';
    case 'featuring': return 'featured';
    case 'multiple_guests': return 'guest';
    case 'collaboration': return 'primary';
    default: return 'unknown';
  }
}

const minutesOf = (time: string | null, offset: number | null) => (time ? timeToMinutes(time.slice(0, 5), offset ?? 0) : null);

export function buildSchedule(lineup: ScheduleLineup, occurrence: ScheduleOccurrence, place: SchedulePlace | null): SchedulePlan {
  const notes: string[] = [];
  const slots = [...lineup.lineup_artist].sort((a, b) => (a.billing_order ?? 0) - (b.billing_order ?? 0));

  // The night as it is stored, in minutes from midnight of the business day.
  const start = new Date(occurrence.starts_at);
  const end = new Date(occurrence.ends_at);
  const runDays = Math.max(0, Math.round((Date.parse(`${occurrence.ends_at.slice(0, 10)}T00:00:00Z`) - Date.parse(`${occurrence.event_date}T00:00:00Z`)) / 86_400_000));
  const nightStart = wallMinutes(occurrence.starts_at, occurrence.timezone, occurrence.event_date);
  const nightEnd = wallMinutes(occurrence.ends_at, occurrence.timezone, occurrence.event_date);
  void start; void end;

  const typicalStart = minutesOf(place?.typical_party_start_time ?? null, place?.typical_party_start_day_offset ?? 0);
  const typicalEnd = minutesOf(place?.typical_party_end_time ?? null, place?.typical_party_end_day_offset ?? 1);
  const headStart = minutesOf(place?.typical_headliner_start_time ?? null, place?.typical_headliner_start_day_offset ?? 1);
  const headEnd = minutesOf(place?.typical_headliner_end_time ?? null, place?.typical_headliner_end_day_offset ?? 1);

  // Grouped by the day a line plays and the room it plays in.
  const groups = new Map<string, { day: string; roomId: string | null; roomName: string; slots: ScheduleSlot[] }>();
  for (const s of slots) {
    const day = (lineup.split_by_day && s.slot_date) || occurrence.event_date;
    const key = `${day}|${s.place_space_id ?? ''}`;
    const g = groups.get(key) ?? { day, roomId: s.place_space_id, roomName: s.space?.name ?? 'Room not announced', slots: [] };
    g.slots.push(s);
    groups.set(key, g);
  }

  const multiDay = runDays > 0 && lineup.split_by_day;
  if (multiDay && (typicalStart === null || typicalEnd === null)) {
    notes.push('The bill is split by day and the venue has no typical party window, so each day takes the same clock times as the night itself.');
  }

  let pinnedAnywhere = false;
  const planned: PlannedGroup[] = [];
  for (const g of [...groups.values()].sort((a, b) => a.day.localeCompare(b.day) || a.roomName.localeCompare(b.roomName))) {
    // One night: the occurrence's own window. A day of a run: the venue's
    // typical window when it has one, else the same clock times as the night.
    const window = !multiDay || g.day === occurrence.event_date
      ? { startMin: nightStart, endMin: nightEnd }
      : { startMin: typicalStart ?? nightStart % 1440, endMin: typicalEnd ?? (nightEnd % 1440) + 1440 };

    const planSlots: PlanSlot[] = g.slots.map((s) => ({ key: s.lineup_artist_id, label: slotText(s), is_headliner: s.is_headliner }));
    const head = headStart !== null && headEnd !== null && headEnd > headStart ? { startMin: headStart, endMin: headEnd } : null;
    const result = planRoom(planSlots, window, head);
    const pinned = !!head && result.some((r) => r.startMin === head.startMin && r.endMin === head.endMin);
    pinnedAnywhere = pinnedAnywhere || pinned;

    planned.push({
      day: g.day, roomId: g.roomId, roomName: g.roomName, pinned,
      rows: result.map((r) => {
        const slot = g.slots.find((s) => s.lineup_artist_id === r.key)!;
        return { slot, label: slotText(slot), start: minutesToWallTime(g.day, r.startMin), end: minutesToWallTime(g.day, r.endMin), sequence: r.sequence };
      }),
    });
  }

  if (pinnedAnywhere) notes.push('The headliner keeps the slot this venue usually gives it; everything else divides the rest of the night evenly.');
  else notes.push('Every set is an even division of the night — the venue has no typical headliner slot recorded, so nothing here is more than arithmetic.');

  return { groups: planned, notes, confidence: planConfidence(pinnedAnywhere) };
}

/** The wall-clock minutes of an instant, counted from midnight of the business day. */
function wallMinutes(instant: string, timezone: string | null, businessDay: string): number {
  const zone = timezone || 'UTC';
  const d = new Date(instant);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  const offsetDays = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${businessDay}T00:00:00Z`)) / 86_400_000);
  return Number(get('hour')) * 60 + Number(get('minute')) + offsetDays * 1440;
}

/** The plan as save_predicted_sets() wants it. */
export function planToPayload(plan: SchedulePlan, lineup: ScheduleLineup, occurrence: ScheduleOccurrence): PredictedSetPayload[] {
  const zone = occurrence.timezone || null;
  const out: PredictedSetPayload[] = [];
  for (const g of plan.groups) {
    for (const row of g.rows) {
      const startAt = wallTimeToInstant(row.start, zone);
      const endAt = wallTimeToInstant(row.end, zone);
      if (!startAt || !endAt) continue;
      const acts = [...row.slot.lineup_artist_participant].sort((a, b) => a.participant_order - b.participant_order);
      out.push({
        place_id: lineup.place_id,
        place_space_id: row.slot.place_space_id,
        set_type: setTypeFor(row.slot.kind),
        display_name: row.label || null,
        scheduled_start_at: startAt,
        scheduled_end_at: endAt,
        sequence_number: row.sequence,
        event_day: g.day,
        confidence_score: plan.confidence,
        notes: `Predicted from line-up v${lineup.version}${g.pinned ? ' and the venue typical headliner slot' : ' by dividing the night evenly'}.`,
        participants: acts.map((p, i) => ({
          artist_id: p.artist_id,
          participant_role: roleFor(row.slot.kind, i),
          is_primary: i === 0,
          is_headliner: row.slot.is_headliner && i === 0,
        })),
      });
    }
  }
  return out;
}
