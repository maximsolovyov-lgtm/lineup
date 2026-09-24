import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { FavoriteFilter, FavoriteStar } from '@/components/FavoriteStar';
import { useFavorites } from '@/features/favorites/api';
import { RECORD_STATUSES } from '@/types/enums';
import { useEvents, type EventsListParams } from './api';

export function EventsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EventsListParams['status']>('active');
  const [favOnly, setFavOnly] = useState(false);
  const favorites = useFavorites('event');
  const events = useEvents({ q, status, favoriteIds: favOnly ? [...(favorites.data ?? [])] : null });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:mr-auto sm:w-auto">
          <h1 className="text-[27px] font-semibold tracking-[-0.5px]">Events</h1>
          <p className="text-[13px] text-muted-foreground">Reusable brands and their dates. Line-ups and timetables come in the next stage.</p>
        </div>
        <Input type="search" placeholder="Search name…" className="h-11 w-full sm:w-72" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
        <Select value={status} onValueChange={(v) => setStatus(v as EventsListParams['status'])}>
          <SelectTrigger className="h-11 min-w-[8.5rem] flex-1 sm:w-40 sm:flex-none" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <FavoriteFilter on={favOnly} onChange={setFavOnly} />
        <Button asChild><Link to="/events/new"><Plus /> New event</Link></Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-9" />
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead className="hidden md:table-cell text-right">Dates</TableHead>
              <TableHead>Next</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {events.isError && <TableRow><TableCell colSpan={6} className="py-8 text-center text-destructive">{(events.error as Error).message}</TableCell></TableRow>}
            {events.data?.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No events match.</TableCell></TableRow>}
            {events.data?.map((e) => (
              <TableRow key={e.event_id} className="cursor-pointer" onClick={() => navigate(`/events/${e.event_id}`)}>
                <TableCell className="w-9 py-1"><FavoriteStar entity="event" id={e.event_id} /></TableCell>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{e.event_type}</TableCell>
                <TableCell className="hidden md:table-cell text-right font-mono text-muted-foreground">{e.occurrence_count || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{e.next_date ?? (e.last_date ? `last ${e.last_date}` : '—')}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {events.data && events.data.length >= 200 && (
        <p className="text-xs text-muted-foreground">Showing the first 200 matches — refine the search to see more.</p>
      )}
    </div>
  );
}
