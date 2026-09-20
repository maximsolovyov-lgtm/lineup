/**
 * Venue-local time handling.
 *
 * A night at UNVRS starts at 23:30 Ibiza time whether the operator entering
 * it sits in Ibiza or Miami. The database stores instants (timestamptz), but
 * the form must read and write the venue's wall-clock time, so these
 * functions convert between the two using the occurrence's IANA zone rather
 * than the browser's.
 */

/** Minutes that `timeZone` is ahead of UTC at the given instant. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);

  const f: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') f[p.type] = Number(p.value);

  // hour can come back as 24 for midnight in some runtimes.
  const asUtc = Date.UTC(f.year!, f.month! - 1, f.day!, f.hour! % 24, f.minute!, f.second!);
  return (asUtc - at.getTime()) / 60_000;
}

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

/**
 * "2026-07-15T23:30" read as wall time in `timeZone` -> ISO instant.
 *
 * Two passes: the offset itself depends on the instant (daylight saving), so
 * the first guess picks an offset and the second corrects for a shift across
 * a DST boundary.
 */
export function wallTimeToInstant(wall: string, timeZone: string | null | undefined): string | null {
  // Match the shape first. Date.parse is lenient enough to find a date in
  // almost any string — "not a date" parses — so anything that is not a
  // datetime-local value must be rejected here, not handed to the parser.
  const shape = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(wall ?? '');
  if (!shape) return null;

  const zone = safeZone(timeZone);
  const naive = Date.parse(`${wall.slice(0, 16)}:00Z`);
  if (Number.isNaN(naive)) return null;

  let guess = new Date(naive);
  for (let i = 0; i < 2; i += 1) {
    guess = new Date(naive - offsetMinutes(guess, zone) * 60_000);
  }
  return guess.toISOString();
}

/** ISO instant -> "2026-07-15T23:30" wall time in `timeZone`, for a datetime-local input. */
export function instantToWallTime(iso: string | null | undefined, timeZone: string | null | undefined): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const shifted = new Date(at.getTime() + offsetMinutes(at, safeZone(timeZone)) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Human-readable instant in the venue's zone, e.g. "15 Jul 2026, 23:30 GMT+2".
 *
 * Always 24-hour, whatever the viewer's locale: a set list that runs 23:30 to
 * 06:00 is far easier to read that way, and it matches the 24-hour datetime
 * input the value was entered in.
 */
export function formatInZone(iso: string | null | undefined, timeZone: string | null | undefined): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: safeZone(timeZone),
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(at);
}
