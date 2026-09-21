import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { RECORD_STATUSES } from '@/types/enums';
import { useLineups, type LineupsListParams } from './api';
import { LineupFinder } from './LineupFinder';

export function LineupsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LineupsListParams['status']>('active');
  const lineups = useLineups({ q, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-[27px] font-semibold tracking-[-0.5px]">Line-ups</h1>
          <p className="text-[13px] text-muted-foreground">Who is announced for a date. Official only; every publication is a new version.</p>
        </div>
        <Input type="search" placeholder="Search event…" className="h-11 w-72" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search line-ups" />
        <Select value={status} onValueChange={(v) => setStatus(v as LineupsListParams['status'])}>
          <SelectTrigger className="h-11 w-40" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button asChild><Link to="/lineups/new"><Plus /> New line-up</Link></Button>
      </div>

      <LineupFinder />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event · date</TableHead>
              <TableHead>Place</TableHead>
              <TableHead className="text-right">Version</TableHead>
              <TableHead>Artists</TableHead>
              <TableHead className="text-right">Sets</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineups.isLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {lineups.isError && <TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive">{(lineups.error as Error).message}</TableCell></TableRow>}
            {lineups.data?.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No line-ups match.</TableCell></TableRow>}
            {lineups.data?.map((l) => (
              <TableRow key={l.lineup_id} className="cursor-pointer" onClick={() => navigate(`/lineups/${l.lineup_id}`)}>
                <TableCell>
                  <span className="font-medium">{l.event_occurrence?.event?.name}</span>
                  <span className="block text-xs text-muted-foreground">{l.event_occurrence?.event_date}{l.event_occurrence?.occurrence_name ? ` · ${l.event_occurrence.occurrence_name}` : ''}</span>
                </TableCell>
                <TableCell className={l.place ? '' : 'italic text-muted-foreground'}>{l.place?.name ?? 'not announced'}</TableCell>
                <TableCell className="text-right font-mono">v{l.version}</TableCell>
                <TableCell>
                  <span className="text-sm">{l.preview || <span className="text-muted-foreground">—</span>}</span>
                  {l.headliners.length > 0 && <span className="block text-xs text-muted-foreground">headliner: {l.headliners.join(', ')}</span>}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{l.set_count || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{l.published_at ? new Date(l.published_at).toLocaleDateString() : '—'}</TableCell>
                <TableCell><StatusBadge status={l.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
