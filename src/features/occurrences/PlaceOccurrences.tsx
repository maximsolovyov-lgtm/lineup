import { Link } from 'react-router-dom';
import { CalendarSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { formatInZone } from '@/lib/datetime';
import { usePlaceOccurrences } from './api';

const HEADER = 'hidden gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[9.5rem_5.5rem_9.5rem_5.5rem_minmax(0,1fr)_7.5rem_2.5rem]';
const ROW = 'grid grid-cols-1 items-center gap-2 sm:grid-cols-[9.5rem_5.5rem_9.5rem_5.5rem_minmax(0,1fr)_7.5rem_2.5rem]';

/**
 * The nights at this venue, in the shape the event's own occurrences block
 * has — start day and time, end day and time, which night it is, status.
 *
 * Read-only on purpose: these rows belong to other events, and an occurrence
 * is saved with its event's whole list. The calendar button opens the night
 * on its own screen, which is where it is changed.
 */
export function PlaceOccurrences({ placeId }: { placeId: string }) {
  const occurrences = usePlaceOccurrences(placeId);
  const rows = occurrences.data ?? [];

  return (
    <section className="space-y-2 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Occurrences</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">event_occurrence</span>
        <span className="text-xs text-muted-foreground">
          {rows.length > 0 ? `${rows.length} night${rows.length === 1 ? '' : 's'} here` : 'Nights that happen at this venue'}
        </span>
      </div>

      {occurrences.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {occurrences.isError && <p className="text-sm text-destructive">{(occurrences.error as Error).message}</p>}
      {!occurrences.isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No nights point at this venue yet. A date is added on its event.</p>
      )}

      {rows.length > 0 && (
        <>
          <div className={HEADER}>
            <div>Start day</div><div>Start</div><div>End day</div><div>End</div><div>Event · night</div><div>Status</div><div />
          </div>
          <ul className="space-y-1">
            {rows.map((o) => {
              const start = formatInZone(o.starts_at, o.timezone);
              const end = formatInZone(o.ends_at, o.timezone);
              return (
                <li key={o.occurrence_id} className={`${ROW} rounded-lg border bg-muted/20 p-2 text-sm`}>
                  <span className="font-mono text-[13px]">{o.event_date}</span>
                  <span className="font-mono text-[13px] text-muted-foreground">{start.slice(-5)}</span>
                  <span className="font-mono text-[13px]">{end.slice(0, 10)}</span>
                  <span className="font-mono text-[13px] text-muted-foreground">{end.slice(-5)}</span>
                  <span className="min-w-0">
                    <Link to={`/events/${o.event?.event_id}`} className="font-medium underline-offset-2 hover:underline">{o.event?.name}</Link>
                    {o.occurrence_name && <span className="text-muted-foreground"> · {o.occurrence_name}</span>}
                    {o.via === 'lineup' && (
                      <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground"
                        title="This night has another default place; it is here because a line-up or a set of it is announced for this venue">
                        through its line-up
                      </span>
                    )}
                  </span>
                  <span><StatusBadge status={o.status} /></span>
                  <span className="flex justify-end">
                    <Button asChild variant="ghost" size="icon" title="Open this night: its own screen, with its line-ups and its timetable">
                      <Link to={`/occurrences/${o.occurrence_id}`}><CalendarSearch /></Link>
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
