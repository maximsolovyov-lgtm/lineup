import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { FavoriteFilter, FavoriteStar } from '@/components/FavoriteStar';
import { useFavorites } from '@/features/favorites/api';
import { formatInZone } from '@/lib/datetime';
import { RECORD_STATUSES } from '@/types/enums';
import { useSets, type SetsListParams } from './api';

export function SetsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<SetsListParams['status']>('active');
  const [scenario, setScenario] = useState<SetsListParams['scenario']>('all');
  const [favOnly, setFavOnly] = useState(false);
  const favorites = useFavorites('performance_set');
  const sets = useSets({ q, status, scenario, favoriteIds: favOnly ? [...(favorites.data ?? [])] : null });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:mr-auto sm:w-auto">
          <h1 className="text-[27px] font-semibold tracking-[-0.5px]">Sets</h1>
          <p className="text-[13px] text-muted-foreground">When and where each set plays. Official sets belong to a line-up; predictions carry a confidence.</p>
        </div>
        <Input type="search" placeholder="Search event…" className="h-11 w-full sm:w-64" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sets" />
        <Select value={scenario} onValueChange={(v) => setScenario(v as SetsListParams['scenario'])}>
          <SelectTrigger className="h-11 min-w-[8.5rem] flex-1 sm:w-40 sm:flex-none" aria-label="Scenario filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Official + predicted</SelectItem>
            <SelectItem value="official">Official</SelectItem>
            <SelectItem value="predicted">Predicted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as SetsListParams['status'])}>
          <SelectTrigger className="h-11 min-w-[8.5rem] flex-1 sm:w-40 sm:flex-none" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <FavoriteFilter on={favOnly} onChange={setFavOnly} />
        <Button asChild><Link to="/sets/new"><Plus /> New set</Link></Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-9" />
              <TableHead>Event · day</TableHead>
              <TableHead className="hidden md:table-cell">Place · room</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="hidden md:table-cell">Scenario</TableHead>
              <TableHead className="hidden md:table-cell text-right">v</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sets.isLoading && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {sets.isError && <TableRow><TableCell colSpan={8} className="py-8 text-center text-destructive">{(sets.error as Error).message}</TableCell></TableRow>}
            {sets.data?.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No sets match.</TableCell></TableRow>}
            {sets.data?.map((s) => {
              const names = (s.artist_list_json as { name: string }[] | null)?.map((a) => a.name) ?? [];
              const tz = s.place?.timezone ?? null;
              return (
                <TableRow key={s.performance_set_id} className="cursor-pointer" onClick={() => navigate(`/sets/${s.performance_set_id}`)}>
                <TableCell className="w-9 py-1"><FavoriteStar entity="performance_set" id={s.performance_set_id} /></TableCell>
                  <TableCell>
                    <span className="font-medium">{s.event_occurrence?.event?.name}</span>
                    <span className="block text-xs text-muted-foreground">{s.event_day ?? s.event_occurrence?.event_date}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className={s.place ? '' : 'italic text-muted-foreground'}>{s.place?.name ?? 'not announced'}</span>
                    {s.place_space && <span className="block text-xs text-muted-foreground">{s.place_space.name}</span>}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{s.display_name || names.join(', ') || <span className="text-muted-foreground">—</span>}</span>
                    <span className="block text-xs text-muted-foreground">{s.set_type}{s.completeness === 'partial' ? ' · partial' : ''}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.scheduled_start_at ? formatInZone(s.scheduled_start_at, tz) : '—'}
                    {s.scheduled_end_at && <span className="block text-xs">→ {formatInZone(s.scheduled_end_at, tz)}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {s.scenario_type}
                    {s.scenario_type === 'predicted' && s.confidence_score !== null && <span className="block font-mono text-xs text-muted-foreground">{Math.round(s.confidence_score * 100)}%</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono text-muted-foreground">{s.scenario_version}</TableCell>
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
