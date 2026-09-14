import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { formatInZone } from '@/lib/datetime';
import { RECORD_STATUSES } from '@/types/database';
import { useOccurrences, type OccurrenceListParams } from './api';

export function OccurrencesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OccurrenceListParams['status']>('active');
  const [when, setWhen] = useState<OccurrenceListParams['when']>('upcoming');
  const occurrences = useOccurrences({ q, status, when });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Occurrences</h1>
        <Input type="search" placeholder="Search by name…" className="w-56" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search occurrences" />
        <Select value={when} onValueChange={(v) => setWhen(v as OccurrenceListParams['when'])}>
          <SelectTrigger className="w-32" aria-label="Date filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="past">Past</SelectItem>
            <SelectItem value="all">All dates</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as OccurrenceListParams['status'])}>
          <SelectTrigger className="w-36" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button asChild><Link to="/occurrences/new"><Plus /> New occurrence</Link></Button>
      </div>

      <p className="text-sm text-muted-foreground">
        One dated instance of an event. Times are shown in the venue's own timezone.
      </p>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Starts</TableHead><TableHead>Event</TableHead><TableHead>Name</TableHead><TableHead>Venue</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {occurrences.isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {occurrences.isError && <TableRow><TableCell colSpan={5} className="py-8 text-center text-destructive">{(occurrences.error as Error).message}</TableCell></TableRow>}
            {occurrences.data?.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nothing matches.</TableCell></TableRow>}
            {occurrences.data?.map((o) => {
              const event = o.event as { name: string } | null;
              const place = o.place as { name: string; city: string | null } | null;
              return (
                <TableRow key={o.occurrence_id} className="cursor-pointer" onClick={() => navigate(`/occurrences/${o.occurrence_id}`)}>
                  <TableCell className="whitespace-nowrap">{formatInZone(o.starts_at, o.timezone)}</TableCell>
                  <TableCell className="font-medium">{event?.name}</TableCell>
                  <TableCell>{o.occurrence_name}</TableCell>
                  <TableCell>{place?.name}{place?.city && <span className="text-muted-foreground"> · {place.city}</span>}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
