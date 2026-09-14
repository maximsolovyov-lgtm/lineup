import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { RECORD_STATUSES } from '@/types/database';
import { useArtists, type ArtistListParams } from './api';

export function ArtistsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ArtistListParams['status']>('active');
  const artists = useArtists({ q, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Artists</h1>
        <Input type="search" placeholder="Search artists…" className="w-64" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search artists" />
        <Select value={status} onValueChange={(v) => setStatus(v as ArtistListParams['status'])}>
          <SelectTrigger className="w-36" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button asChild><Link to="/artists/new"><Plus /> New artist</Link></Button>
      </div>

      <p className="text-sm text-muted-foreground">
        A permanent duo, group or collective is one artist here. A one-off B2B is not — that belongs on the performance set.
      </p>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Added</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {artists.isLoading && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {artists.isError && <TableRow><TableCell colSpan={4} className="py-8 text-center text-destructive">{(artists.error as Error).message}</TableCell></TableRow>}
            {artists.data?.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No artists yet.</TableCell></TableRow>}
            {artists.data?.map((a) => (
              <TableRow key={a.artist_id} className="cursor-pointer" onClick={() => navigate(`/artists/${a.artist_id}`)}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="capitalize">{a.artist_type}</TableCell>
                <TableCell><StatusBadge status={a.status} /></TableCell>
                <TableCell className="text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
