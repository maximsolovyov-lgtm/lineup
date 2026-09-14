import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { RECORD_STATUSES } from '@/types/database';
import { useSpaces, type SpaceListParams } from './api';

export function SpacesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const placeId = searchParams.get('place') ?? undefined;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<SpaceListParams['status']>('active');
  const spaces = useSpaces({ q, status, placeId });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Spaces</h1>
        <Input type="search" placeholder="Search rooms and stages…" className="w-64" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spaces" />
        <Select value={status} onValueChange={(v) => setStatus(v as SpaceListParams['status'])}>
          <SelectTrigger className="w-36" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button asChild>
          <Link to={placeId ? `/spaces/new?place=${placeId}` : '/spaces/new'}><Plus /> New space</Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Permanent rooms and stages inside a venue. A stage that exists only for one event is not recorded here — that is handled on the performance set.
      </p>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Venue</TableHead><TableHead>Type</TableHead><TableHead>Capacity</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {spaces.isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {spaces.isError && <TableRow><TableCell colSpan={5} className="py-8 text-center text-destructive">{(spaces.error as Error).message}</TableCell></TableRow>}
            {spaces.data?.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No spaces yet.</TableCell></TableRow>}
            {spaces.data?.map((s) => {
              const place = s.place as { name: string; city: string | null } | null;
              return (
                <TableRow key={s.space_id} className="cursor-pointer" onClick={() => navigate(`/spaces/${s.space_id}`)}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{place?.name}{place?.city && <span className="text-muted-foreground"> · {place.city}</span>}</TableCell>
                  <TableCell>{s.space_type}</TableCell>
                  <TableCell>{s.capacity}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
