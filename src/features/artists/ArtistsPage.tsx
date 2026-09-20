import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { RECORD_STATUSES } from '@/types/enums';
import { useArtists, type ArtistsListParams } from './api';

export function ArtistsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ArtistsListParams['status']>('active');
  const artists = useArtists({ q, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">Artists</h1>
          <p className="text-sm text-muted-foreground">Stage names as printed on the poster. A duo or collective is one artist with several members.</p>
        </div>
        <Input type="search" placeholder="Search name, country…" className="w-64" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search artists" />
        <Select value={status} onValueChange={(v) => setStatus(v as ArtistsListParams['status'])}>
          <SelectTrigger className="w-36" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button asChild><Link to="/artists/new"><Plus /> New artist</Link></Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Country</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead>Checks</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {artists.isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {artists.isError && <TableRow><TableCell colSpan={6} className="py-8 text-center text-destructive">{(artists.error as Error).message}</TableCell></TableRow>}
            {artists.data?.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No artists match.</TableCell></TableRow>}
            {artists.data?.map((a) => (
              <TableRow key={a.artist_id} className="cursor-pointer" onClick={() => navigate(`/artists/${a.artist_id}`)}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-muted-foreground">{a.artist_type}</TableCell>
                <TableCell>{a.country}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{a.member_count || '—'}</TableCell>
                <TableCell>
                  {a.open_reviews > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700" title="Open review tasks">
                      <AlertTriangle className="h-3.5 w-3.5" /> {a.open_reviews} to review
                    </span>
                  )}
                </TableCell>
                <TableCell><StatusBadge status={a.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {artists.data && artists.data.length >= 200 && (
        <p className="text-xs text-muted-foreground">Showing the first 200 matches — refine the search to see more.</p>
      )}
    </div>
  );
}
