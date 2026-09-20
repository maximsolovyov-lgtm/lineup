import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { personLookup } from '@/lib/lookups';
import type { LookupOption } from '@/components/form/LookupField';
import { findSimilarPeople } from '@/features/people/api';
import { MEMBERSHIP_ROLES, type MemberFormValue } from './schema';

interface PersonPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artistName: string;
  /** People already in the members list, hidden from the search results. */
  excludePersonIds: string[];
  onAdd: (member: MemberFormValue) => void;
}

type Mode = 'existing' | 'new';
type Similar = Awaited<ReturnType<typeof findSimilarPeople>>[number];

const lookup = personLookup();

/**
 * The person picker (design/PersonPicker.dc.html): search existing people or
 * create one inline. A new person is not written here — it travels with the
 * member row and is created by save_artist_with_members() in the artist's
 * transaction, so a failed save leaves no orphan person behind.
 */
export function PersonPickerDialog({ open, onOpenChange, artistName, excludePersonIds, onAdd }: PersonPickerDialogProps) {
  const [mode, setMode] = useState<Mode>('existing');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LookupOption[]>([]);
  const [searching, setSearching] = useState(false);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const [similar, setSimilar] = useState<Similar[]>([]);

  const [role, setRole] = useState<string>('dj');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('existing'); setQuery(''); setResults([]); setName(''); setCountry(''); setNotes(''); setSimilar([]);
    setRole('dj'); setFrom(''); setTo('');
  }, [open]);

  // Existing-person search, debounced.
  useEffect(() => {
    if (!open || mode !== 'existing') return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      lookup.search(query).then((opts) => {
        if (cancelled) return;
        setResults(opts.filter((o) => !excludePersonIds.includes(o.id)));
        setSearching(false);
      }).catch(() => { if (!cancelled) setSearching(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, mode, query, excludePersonIds]);

  // Duplicate warning while typing a new name.
  useEffect(() => {
    if (!open || mode !== 'new' || name.trim().length < 2) { setSimilar([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      findSimilarPeople(name).then((rows) => { if (!cancelled) setSimilar(rows); }).catch(() => undefined);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, mode, name]);

  const period = { membership_role: role, is_primary: false, started_at: from, ended_at: to };

  function pickExisting(opt: LookupOption) {
    onAdd({ membership_id: null, person_id: opt.id, new_person: null, display_name: opt.label, sublabel: opt.sublabel ?? '', ...period });
    onOpenChange(false);
  }

  function pickSimilar(p: Similar) {
    onAdd({ membership_id: null, person_id: p.person_id, new_person: null, display_name: p.display_name, sublabel: p.artists.join(', ') || p.country || '', ...period });
    onOpenChange(false);
  }

  function createNew() {
    if (name.trim().length === 0) return;
    onAdd({
      membership_id: null, person_id: null,
      new_person: { display_name: name.trim(), country: country.trim(), notes },
      display_name: name.trim(), sublabel: country.trim() ? `${country.trim()} · new` : 'new',
      ...period,
    });
    onOpenChange(false);
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
      className={cn('border-b-2 px-3 py-2 text-sm font-medium', mode === m ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
          <DialogDescription>Will be linked to <b>{artistName || 'this artist'}</b>. One human can stand behind several names — a solo act, a duo, an alias.</DialogDescription>
        </DialogHeader>

        <div role="tablist" className="flex gap-1 border-b">
          {tab('existing', 'Choose existing')}
          {tab('new', 'Create new')}
        </div>

        {mode === 'existing' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input autoFocus className="pl-8" placeholder="Start typing a name…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" />
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {searching && results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>}
              {!searching && results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No one matches.</li>}
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => pickExisting(r)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{initials(r.label)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.label}</span>
                      {r.sublabel && <span className="block truncate text-xs text-muted-foreground">{r.sublabel}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">Select</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => { setMode('new'); setName(query); }} className="w-full rounded-md border border-dashed px-3 py-2 text-left text-sm hover:bg-muted">
              + Create a new person{query.trim() ? ` “${query.trim()}”` : ''}
            </button>
            <PeriodFields role={role} setRole={setRole} from={from} setFrom={setFrom} to={to} setTo={setTo} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pp-name">Public name <span className="text-destructive" aria-hidden>*</span></Label>
              <Input id="pp-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              <p className="text-xs text-muted-foreground">The name this person is publicly known by. Legal names are not stored unless the artist has published them.</p>
            </div>
            {similar.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" role="alert">
                {similar.map((p) => (
                  <div key={p.person_id} className="flex flex-wrap items-center gap-2">
                    <span>
                      A similar person already exists: <b>{p.display_name}</b>
                      {p.artists.length > 0 && <> — performs as <b>{p.artists.join(', ')}</b></>}
                      {p.artists.length === 0 && p.country && <> ({p.country})</>}.
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => pickSimilar(p)}>Use them instead</Button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pp-country">Country</Label>
                <Input id="pp-country" placeholder="DE" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
            </div>
            <PeriodFields role={role} setRole={setRole} from={from} setFrom={setFrom} to={to} setTo={setTo} />
            <div className="space-y-1.5">
              <Label htmlFor="pp-notes">Operator note</Label>
              <Textarea id="pp-notes" rows={2} placeholder="The source that established this line-up" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {mode === 'new' ? <>Creates a <code>person</code> and an <code>artist_membership</code> when the artist is saved</> : <>Adds an <code>artist_membership</code> when the artist is saved</>}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {mode === 'new' && <Button type="button" onClick={createNew} disabled={name.trim().length === 0}>Create and add</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PeriodFields({ role, setRole, from, setFrom, to, setTo }: {
  role: string; setRole: (v: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="pp-role">Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger id="pp-role"><SelectValue /></SelectTrigger>
          <SelectContent>{MEMBERSHIP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pp-from">Member from</Label>
        <Input id="pp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pp-to">Until</Label>
        <Input id="pp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <p className="text-xs text-muted-foreground">Empty = current</p>
      </div>
    </div>
  );
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}
