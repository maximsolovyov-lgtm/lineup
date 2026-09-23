import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RECORD_STATUSES } from '@/types/enums';
import { usePlaces, useProfileNames, useTagCounts, type PlaceListParams } from './api';

export function PlacesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PlaceListParams['status']>('active');
  const [tag, setTag] = useState('');
  const places = usePlaces({ q, status, tag });
  const tagCounts = useTagCounts();
  const names = useProfileNames();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:mr-auto sm:w-auto">
          <h1 className="text-[27px] font-semibold tracking-[-0.5px]">Places</h1>
          <p className="text-[13px] text-muted-foreground">
            {places.data ? `${places.data.length} records · rooms total: ${places.data.reduce((n, p) => n + p.room_count, 0)}` : 'Venues and their rooms'}
          </p>
        </div>
        <Input
          type="search"
          placeholder="Search name, city, Instagram…"
          className="h-11 w-full sm:w-72"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search places"
        />
        <Select value={tag || '_all'} onValueChange={(v) => setTag(v === '_all' ? '' : v)}>
          <SelectTrigger className="h-11 min-w-[8.5rem] flex-1 sm:w-44 sm:flex-none" aria-label="Tag filter"><SelectValue placeholder="Tag: all" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tag: all</SelectItem>
            {(tagCounts.data ?? []).map((t) => <SelectItem key={t.tag} value={t.tag}>{t.tag} · {t.place_count}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as PlaceListParams['status'])}>
          <SelectTrigger className="h-11 min-w-[8.5rem] flex-1 sm:w-40 sm:flex-none" aria-label="Status filter"><SelectValue /></SelectTrigger>
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
              <TableHead className="hidden md:table-cell">Country</TableHead>
              <TableHead className="hidden md:table-cell">Lifecycle</TableHead>
              <TableHead className="hidden md:table-cell">Tags</TableHead>
              <TableHead className="hidden md:table-cell text-right">Rooms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Last change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {places.isLoading && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {places.isError && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive">{(places.error as Error).message}</TableCell></TableRow>
            )}
            {places.data?.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No places match.</TableCell></TableRow>
            )}
            {places.data?.map((p) => {
              const who = names.data?.get(p.updated_by_user_id ?? p.created_by_user_id ?? '') ?? '';
              const when = new Date(p.updated_at ?? p.created_at).toLocaleDateString();
              return (
                <TableRow key={p.place_id} className="cursor-pointer" onClick={() => navigate(`/places/${p.place_id}`)}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.city}</TableCell>
                  <TableCell className="hidden md:table-cell">{p.country}</TableCell>
                  <TableCell className="hidden md:table-cell capitalize">{p.lifecycle_type}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="flex flex-wrap gap-1">
                      {p.tags.map((t) => (
                        <button key={t} type="button" onClick={(e) => { e.stopPropagation(); setTag(t); }}
                          className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground hover:bg-secondary/70" title={`Filter by ${t}`}>
                          {t}
                        </button>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono text-muted-foreground">{p.room_count || '—'}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{when}{who && ` · ${who}`}</TableCell>
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
