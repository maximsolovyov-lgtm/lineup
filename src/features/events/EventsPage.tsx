import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { RECORD_STATUSES } from '@/types/database';
import { useEvents, type EventListParams } from './api';

export function EventsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EventListParams['status']>('active');
  const events = useEvents({ q, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Events</h1>
        <Input type="search" placeholder="Search events…" className="w-64" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
        <Select value={status} onValueChange={(v) => setStatus(v as EventListParams['status'])}>
          <SelectTrigger className="w-36" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button asChild><Link to="/events/new"><Plus /> New event</Link></Button>
      </div>

      <p className="text-sm text-muted-foreground">
        An event is the reusable brand or concept — Circoloco, Music On, a festival name. Individual dates live under Occurrences.
      </p>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {events.isLoading && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {events.isError && <TableRow><TableCell colSpan={4} className="py-8 text-center text-destructive">{(events.error as Error).message}</TableCell></TableRow>}
            {events.data?.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No events yet.</TableCell></TableRow>}
            {events.data?.map((e) => (
              <TableRow key={e.event_id} className="cursor-pointer" onClick={() => navigate(`/events/${e.event_id}`)}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="capitalize">{e.event_type.replace('_', ' ')}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
                <TableCell className="text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
