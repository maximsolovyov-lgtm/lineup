import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { FavoriteFilter, FavoriteStar } from '@/components/FavoriteStar';
import { useFavorites } from '@/features/favorites/api';
import { RECORD_STATUSES } from '@/types/enums';
import { useArtists, type ArtistsListParams } from './api';

export function ArtistsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ArtistsListParams['status']>('active');
  const [favOnly, setFavOnly] = useState(false);
  const favorites = useFavorites('artist');
  const artists = useArtists({ q, status, favoriteIds: favOnly ? [...(favorites.data ?? [])] : null });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:mr-auto sm:w-auto">
          <h1 className="text-[27px] font-semibold tracking-[-0.5px]">Artists</h1>
          <p className="text-[13px] text-muted-foreground">Stage names as printed on the poster. A duo or collective is one artist with several members.</p>
        </div>
        <Input type="search" placeholder="Search name, country…" className="h-11 w-full sm:w-72" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search artists" />
        <Select value={status} onValueChange={(v) => setStatus(v as ArtistsListParams['status'])}>
          <SelectTrigger className="h-11 min-w-[8.5rem] flex-1 sm:w-40 sm:flex-none" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <FavoriteFilter on={favOnly} onChange={setFavOnly} />
        <Button asChild><Link to="/artists/new"><Plus /> New artist</Link></Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-9" />
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Country</TableHead>
              <TableHead className="hidden md:table-cell text-right">Members</TableHead>
              <TableHead className="hidden md:table-cell">Checks</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {artists.isLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {artists.isError && <TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive">{(artists.error as Error).message}</TableCell></TableRow>}
            {artists.data?.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No artists match.</TableCell></TableRow>}
            {artists.data?.map((a) => (
              <TableRow key={a.artist_id} className="cursor-pointer" onClick={() => navigate(`/artists/${a.artist_id}`)}>
                <TableCell className="w-9 py-1"><FavoriteStar entity="artist" id={a.artist_id} /></TableCell>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-muted-foreground">{a.artist_type}</TableCell>
                <TableCell className="hidden md:table-cell">{a.country}</TableCell>
                <TableCell className="hidden md:table-cell text-right font-mono text-muted-foreground">{a.member_count || '—'}</TableCell>
                <TableCell className="hidden md:table-cell">
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
