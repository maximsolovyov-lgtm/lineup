/**
 * The day a publication names, resolved against the run it must fall in.
 *
 * A festival bill says "Friday", "Day 2" or "Nov 7" far more often than it
 * says 2026-11-07, and a line-up that drops those loses the whole point of a
 * multi-day bill. Only days inside the run can be meant, so the run decides.
 *
 * No imports on purpose — the unit tests run this file under node directly.
 */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** Every day of the run, first to last (capped: a run is days, not years). */
export function runDays(run: { from: string; to: string }): string[] {
  const out: string[] = [];
  for (let d = run.from; d <= run.to && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * "2026-11-07" | "Day 2" | "Friday" | "Nov 7" | "7 November" → a day of the run.
 * '' when nothing matches; an ISO day is kept even outside the run, so the
 * save can flag it instead of the answer silently losing it.
 */
export function dayInRun(raw: string | null | undefined, run: { from: string; to: string } | null): string {
  const text = (raw ?? '').trim().toLowerCase();
  if (text === '') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (!run) return '';
  const days = runDays(run);

  const nth = /^(?:day|d)\s*(\d{1,2})$/.exec(text);
  if (nth) return days[Number(nth[1]) - 1] ?? '';

  const weekday = WEEKDAYS.findIndex((w) => w === text || w.slice(0, 3) === text.replace(/\.$/, ''));
  if (weekday >= 0) return days.find((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === weekday) ?? '';

  // "nov 7", "november 7", "7 nov", "7 november" — the month may be left out.
  const word = /[a-z]+/.exec(text)?.[0] ?? '';
  const num = /\d{1,2}/.exec(text)?.[0];
  if (num) {
    const month = MONTHS.findIndex((m) => m === word || (word.length >= 3 && m.startsWith(word)));
    const day = Number(num);
    return days.find((d) => {
      const [, mm, dd] = d.split('-').map(Number);
      return dd === day && (month < 0 || mm === month + 1);
    }) ?? '';
  }
  return '';
}
