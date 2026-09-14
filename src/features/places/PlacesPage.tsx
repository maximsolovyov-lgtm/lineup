import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RECORD_STATUSES, type Enums } from '@/types/database';
import { usePlaces, useProfileNames, type PlaceListParams } from './api';

const STATUS_VARIANT: Record<Enums<'record_status'>, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  active: 'success', draft: 'secondary', inactive: 'warning', closed: 'warning',
  superseded: 'outline', archived: 'outline', deleted: 'destructive',
};

export function StatusBadge({ status }: { status: Enums<'record_status'> }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

export function PlacesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PlaceListParams['status']>('active');
  const places = usePlaces({ q, status });
  const names = useProfileNames();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Places</h1>
        <Input
          type="search"
          placeholder="Search name, city, Instagram…"
          className="w-64"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search places"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as PlaceListParams['status'])}>
          <SelectTrigger className="w-36" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button asChild>
          <Link to="/places/new"><Plus /> New place</Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {places.isLoading && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {places.isError && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-destructive">{(places.error as Error).message}</TableCell></TableRow>
            )}
            {places.data?.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No places match.</TableCell></TableRow>
            )}
            {places.data?.map((p) => {
              const who = names.data?.get(p.updated_by_user_id ?? p.created_by_user_id ?? '') ?? '';
              const when = new Date(p.updated_at ?? p.created_at).toLocaleDateString();
              return (
                <TableRow key={p.place_id} className="cursor-pointer" onClick={() => navigate(`/places/${p.place_id}`)}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.city}</TableCell>
                  <TableCell>{p.country}</TableCell>
                  <TableCell className="capitalize">{p.lifecycle_type}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{when}{who && ` · ${who}`}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {places.data && places.data.length >= 200 && (
        <p className="text-xs text-muted-foreground">Showing the first 200 matches — refine the search to see more.</p>
      )}
    </div>
  );
}
