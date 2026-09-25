/**
 * Turning a line-up into a timetable.
 *
 * The line-up says who plays and in what billing order; the night's window
 * says how long there is; the venue's typical headliner slot says where the
 * top of the night sits. Everything else is an even division — which is a
 * PREDICTION, and it is stored as one (scenario_type 'predicted',
 * information_origin 'predicted', and a confidence score that says how much
 * of it came from the venue's own pattern rather than from arithmetic).
 *
 * All times are minutes from midnight of the business day, so a night that
 * ends at 06:00 the next morning is simply 1800. No imports on purpose — the
 * unit tests run this file under node directly.
 */
export interface PlanSlot {
  /** Identifies the slot back in the line-up. */
  key: string;
  label: string;
  is_headliner: boolean;
}

export interface PlannedSet {
  key: string;
  startMin: number;
  endMin: number;
  sequence: number;
}

export interface PlanWindow {
  startMin: number;
  endMin: number;
}

/** Nothing shorter than this is worth predicting; nothing is rounded finer. */
export const MIN_SET = 30;
const STEP = 15;

const round = (m: number) => Math.round(m / STEP) * STEP;

/**
 * Divides a window between slots in billing order. When a headliner window is
 * given and exactly one slot is the headliner, that slot takes it and the rest
 * fill what is left on either side — which is what a club bill actually means.
 */
export function planRoom(slots: PlanSlot[], window: PlanWindow, headliner: PlanWindow | null = null): PlannedSet[] {
  const n = slots.length;
  if (n === 0 || window.endMin <= window.startMin) return [];

  const headlinerIndex = slots.filter((s) => s.is_headliner).length === 1
    ? slots.findIndex((s) => s.is_headliner)
    : -1;
  const pin = headliner && headlinerIndex >= 0 && fits(headliner, window) ? headliner : null;

  if (!pin) return divide(slots, window, 0);

  const before = slots.slice(0, headlinerIndex);
  const after = slots.slice(headlinerIndex + 1);
  return [
    ...divide(before, { startMin: window.startMin, endMin: pin.startMin }, 0),
    { key: slots[headlinerIndex]!.key, startMin: round(pin.startMin), endMin: round(pin.endMin), sequence: before.length + 1 },
    ...divide(after, { startMin: pin.endMin, endMin: window.endMin }, before.length + 1),
  ];
}

/** A pinned window has to be inside the night. */
function fits(pin: PlanWindow, window: PlanWindow): boolean {
  return pin.startMin >= window.startMin && pin.endMin <= window.endMin && pin.endMin > pin.startMin;
}

function divide(slots: PlanSlot[], window: PlanWindow, sequenceFrom: number): PlannedSet[] {
  const n = slots.length;
  if (n === 0) return [];
  const span = window.endMin - window.startMin;
  // Not enough room to be honest about: give every slot the whole window and
  // let the operator sort it out — a five-minute set is a worse lie than an
  // overlap the form shows plainly.
  if (span < n * MIN_SET) {
    return slots.map((s, i) => ({ key: s.key, startMin: window.startMin, endMin: window.endMin, sequence: sequenceFrom + i + 1 }));
  }
  const each = span / n;
  return slots.map((s, i) => {
    const start = i === 0 ? window.startMin : round(window.startMin + each * i);
    const end = i === n - 1 ? window.endMin : round(window.startMin + each * (i + 1));
    return { key: s.key, startMin: start, endMin: end, sequence: sequenceFrom + i + 1 };
  });
}

/** "23:30" plus a day offset → minutes from midnight of the business day. */
export function timeToMinutes(hhmm: string, dayOffset = 0): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + dayOffset * 1440;
}

/** Minutes from midnight of the business day → a "YYYY-MM-DDTHH:MM" wall time. */
export function minutesToWallTime(businessDay: string, minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const rest = ((minutes % 1440) + 1440) % 1440;
  const [y, mo, d] = businessDay.split('-').map(Number);
  const day = new Date(Date.UTC(y!, mo! - 1, d! + days)).toISOString().slice(0, 10);
  const hh = String(Math.floor(rest / 60)).padStart(2, '0');
  const mm = String(rest % 60).padStart(2, '0');
  return `${day}T${hh}:${mm}`;
}

/** How much of a plan came from the venue's own pattern rather than arithmetic. */
export function planConfidence(pinnedHeadliner: boolean): number {
  return pinnedHeadliner ? 0.65 : 0.45;
}
