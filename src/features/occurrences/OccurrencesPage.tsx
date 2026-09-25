import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { FavoriteFilter, FavoriteStar } from '@/components/FavoriteStar';
import { useFavorites } from '@/features/favorites/api';
import { formatInZone } from '@/lib/datetime';
import { RECORD_STATUSES } from '@/types/enums';
import { useOccurrences, type OccurrencesListParams } from './api';

/** Today, as the date input wants it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The nights themselves. Events own the calendar, but the work happens per
 * night — so this list answers "what is still missing here": a place, a
 * line-up, a timetable.
 */
export function OccurrencesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OccurrencesListParams['status']>('active');
  const [from, setFrom] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const favorites = useFavorites('event_occurrence');
  const occurrences = useOccurrences({ q, status, from, favoriteIds: favOnly ? [...(favorites.data ?? [])] : null });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:mr-auto sm:w-auto">
          <h1 className="text-[27px] font-semibold tracking-[-0.5px]">Occurrences</h1>
          <p className="text-[13px] text-muted-foreground">
            One night of an event: when it runs, where, and what is published for it. Dates are added on the event.
          </p>
        </div>
        <Input type="search" placeholder="Search event…" className="h-11 w-full sm:w-64" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search occurrences" />
        <Input type="date" className="h-11 min-w-[9rem] flex-1 sm:w-40 sm:flex-none" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From this day on" title="Only nights from this day on" />
        <button type="button" className="h-11 rounded-lg border bg-card px-3 text-sm text-muted-foreground hover:bg-secondary/60"
          onClick={() => setFrom(from ? '' : today())}>
          {from ? 'All dates' : 'Upcoming'}
        </button>
        <Select value={status} onValueChange={(v) => setStatus(v as OccurrencesListParams['status'])}>
          <SelectTrigger className="h-11 min-w-[8.5rem] flex-1 sm:w-40 sm:flex-none" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <FavoriteFilter on={favOnly} onChange={setFavOnly} />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-9" />
              <TableHead>Event · night</TableHead>
              <TableHead>Place</TableHead>
              <TableHead className="hidden md:table-cell">Window</TableHead>
              <TableHead className="hidden md:table-cell text-right">Line-ups</TableHead>
              <TableHead className="hidden md:table-cell text-right">Sets</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {occurrences.isLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {occurrences.isError && <TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive">{(occurrences.error as Error).message}</TableCell></TableRow>}
            {occurrences.data?.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No nights match.</TableCell></TableRow>}
            {occurrences.data?.map((o) => (
              <TableRow key={o.occurrence_id} className="cursor-pointer" onClick={() => navigate(`/occurrences/${o.occurrence_id}`)}>
                <TableCell className="w-9 py-1"><FavoriteStar entity="event_occurrence" id={o.occurrence_id} /></TableCell>
                <TableCell>
                  <span className="font-medium">{o.event?.name}</span>
                  <span className="text-muted-foreground"> · {o.event_date}</span>
                  {o.occurrence_name && <span className="text-muted-foreground"> · {o.occurrence_name}</span>}
                  {o.part_of_occurrence_id && <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">part of another</span>}
                </TableCell>
                <TableCell className={o.place?.name ? '' : 'italic text-muted-foreground'}>
                  {o.place?.name ?? 'not set'}
                  {o.place?.city && <span className="text-muted-foreground"> · {o.place.city}</span>}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {formatInZone(o.starts_at, o.timezone)} → {formatInZone(o.ends_at, o.timezone)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-right font-mono text-muted-foreground">
                  {o.lineup_count === 0 ? '—' : o.lineup_versions.map((v) => `v${v}`).join(' ')}
                </TableCell>
                <TableCell className="hidden md:table-cell text-right font-mono text-muted-foreground">
                  {o.set_count === 0 ? '—' : o.set_count}
                  {o.predicted_count > 0 && <span className="text-[11px]"> ({o.predicted_count}p)</span>}
                </TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        A night is created with its event — open the <Link to="/events" className="underline">event</Link> to add a date.
      </p>
    </div>
  );
}
