import { Fragment, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { RECORD_STATUSES } from '@/types/enums';
import { usePeople, type PeopleListParams } from './api';

export function PeoplePage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PeopleListParams['status']>('active');
  const people = usePeople({ q, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:mr-auto sm:w-auto">
          <h1 className="text-[27px] font-semibold tracking-[-0.5px]">People</h1>
          <p className="text-[13px] text-muted-foreground">The humans behind stage names. Users follow artists, not people.</p>
        </div>
        <Input type="search" placeholder="Search name, country…" className="h-11 w-full sm:w-72" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        <Select value={status} onValueChange={(v) => setStatus(v as PeopleListParams['status'])}>
          <SelectTrigger className="h-11 min-w-[8.5rem] flex-1 sm:w-40 sm:flex-none" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button asChild><Link to="/people/new"><Plus /> New person</Link></Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Country</TableHead>
              <TableHead className="hidden md:table-cell">Performs as</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.isLoading && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {people.isError && <TableRow><TableCell colSpan={4} className="py-8 text-center text-destructive">{(people.error as Error).message}</TableCell></TableRow>}
            {people.data?.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No people match.</TableCell></TableRow>}
            {people.data?.map((p) => (
              <TableRow key={p.person_id} className="cursor-pointer" onClick={() => navigate(`/people/${p.person_id}`)}>
                <TableCell className="font-medium">{p.display_name}</TableCell>
                <TableCell>{p.country}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {p.artists.length === 0 ? '—' : p.artists.map((a, i) => (
                    <Fragment key={a.artist_id}>
                      {i > 0 && ', '}
                      <span className={a.current ? '' : 'line-through opacity-60'} title={a.current ? undefined : 'past membership'}>{a.name}</span>
                    </Fragment>
                  ))}
                </TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {people.data && people.data.length >= 200 && (
        <p className="text-xs text-muted-foreground">Showing the first 200 matches — refine the search to see more.</p>
      )}
    </div>
  );
}
