import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { RECORD_STATUSES } from '@/types/enums';
import { useEvents, type EventsListParams } from './api';

export function EventsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EventsListParams['status']>('active');
  const events = useEvents({ q, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">Reusable brands and their dates. Line-ups and timetables come in the next stage.</p>
        </div>
        <Input type="search" placeholder="Search name…" className="w-64" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
        <Select value={status} onValueChange={(v) => setStatus(v as EventsListParams['status'])}>
          <SelectTrigger className="w-36" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button asChild><Link to="/events/new"><Plus /> New event</Link></Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Dates</TableHead>
              <TableHead>Next</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {events.isError && <TableRow><TableCell colSpan={5} className="py-8 text-center text-destructive">{(events.error as Error).message}</TableCell></TableRow>}
            {events.data?.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No events match.</TableCell></TableRow>}
            {events.data?.map((e) => (
              <TableRow key={e.event_id} className="cursor-pointer" onClick={() => navigate(`/events/${e.event_id}`)}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="text-muted-foreground">{e.event_type}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{e.occurrence_count || '—'}</TableCell>
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
