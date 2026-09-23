import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LookupField } from '@/components/form/LookupField';
import { artistLookup } from '@/lib/lookups';
import { usePlaceholderArtists } from './api';
import { slotJoinWord, slotLabel } from '@/lib/slot-label';
import { LINEUP_SLOT_KINDS, SLOT_KIND_INFO, emptySlot, type LineupSlotKind, type LineupSlotValue } from './schema';

export type SlotErrors = (Partial<Record<'artists' | 'display_name_override' | 'kind', { message?: string }>> | undefined)[] | undefined;

interface LineupSlotsEditorProps {
  value: LineupSlotValue[];
  onChange: (rows: LineupSlotValue[]) => void;
  errors?: SlotErrors;
  disabled?: boolean;
}

const ROW = 'grid grid-cols-1 items-start gap-2 sm:grid-cols-[10.5rem_minmax(0,1fr)_5rem_6rem]';

/**
 * The slots of a line-up: one row per announced LINE, not per artist.
 * "Solomun b2b Dixon" is one slot of kind b2b with two acts — the kind is the
 * format of the set, never an artist type (CLAUDE.md). TBA, Surprise guest,
 * Secret guest and Unknown are artists too, so a slot can be half-known
 * ("Solomun b2b TBA") and a reveal is just swapping the act, with
 * placeholder_type kept so the badge survives.
 */
export function LineupSlotsEditor({ value, onChange, errors, disabled }: LineupSlotsEditorProps) {
  const lookup = useMemo(() => artistLookup(), []);
  const placeholders = usePlaceholderArtists();
  // LookupField keeps the act it picked; remounting it after each add clears it.
  const [addKey, setAddKey] = useState(0);
  const [typed, setTyped] = useState<Record<number, string>>({});

  function update(i: number, patch: Partial<LineupSlotValue>) {
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }
  // Adding an act may settle the kind: two acts on a line that was solo is a b2b.
  function addAct(i: number, act: { artist_id: string | null; name: string; create: boolean }) {
    const s = value[i]!;
    if (act.artist_id && s.artists.some((a) => a.artist_id === act.artist_id)) return;
    const artists = [...s.artists, act];
    const auto: Record<number, LineupSlotKind> = { 1: 'solo', 2: 'b2b', 3: 'b3b', 4: 'b4b' };
    const kind = s.kind === 'solo' || s.kind === 'label_only' ? auto[artists.length] ?? s.kind : s.kind;
    update(i, { artists, kind });
    setAddKey((k) => k + 1);
  }
  function removeAct(i: number, j: number) {
    const s = value[i]!;
    update(i, { artists: s.artists.filter((_, idx) => idx !== j) });
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-sm text-muted-foreground">No slots yet.</p>}
      {value.map((s, i) => {
        const err = errors?.[i];
        const info = SLOT_KIND_INFO[s.kind];
        const label = slotLabel(s.kind, s.artists.map((a) => a.name), s.display_name_override);
        const mismatch = info.acts !== null ? s.artists.length !== info.acts
          : ['collaboration', 'featuring', 'multiple_guests'].includes(s.kind) && s.artists.length < 2;
        function addTyped(idx: number) {
          const name = (typed[idx] ?? '').trim();
          if (!name) return;
          addAct(idx, { artist_id: null, name, create: true });
          setTyped({ ...typed, [idx]: '' });
        }
        async function resolveAndAdd(id: string) {
          const opt = await lookup.resolve(id);
          addAct(i, { artist_id: id, name: opt?.label ?? '', create: false });
        }
        return (
          <div key={s.id ?? `new-${i}`} className="space-y-2 rounded-lg border bg-muted/20 p-2">
            <div className={ROW}>
              <Select value={s.kind} onValueChange={(v) => update(i, { kind: v as LineupSlotKind })} disabled={disabled}>
                <SelectTrigger aria-label={`Slot ${i + 1} kind`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LINEUP_SLOT_KINDS.map((k) => <SelectItem key={k} value={k}>{SLOT_KIND_INFO[k].label}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="space-y-1.5">
                {s.artists.length > 0 && (
                  <ul className="flex flex-wrap items-center gap-1.5">
                    {s.artists.map((a, j) => (
                      <li key={`${a.artist_id ?? a.name}-${j}`}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${a.artist_id ? 'bg-card' : 'border-dashed border-[#C9BCE6] bg-secondary/40'}`}>
                        {j > 0 && <span className="text-[11px] font-semibold uppercase text-muted-foreground">{slotJoinWord(s.kind, j)}</span>}
                        <span className={a.artist_id ? '' : 'italic'}>{a.name || '—'}</span>
                        {!a.artist_id && (
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Create an artist record for this name when the line-up is saved">
                            <input type="checkbox" className="h-3 w-3 accent-primary" checked={a.create} disabled={disabled}
                              onChange={(e) => update(i, { artists: s.artists.map((x, idx) => (idx === j ? { ...x, create: e.target.checked } : x)) })} />
                            create
                          </label>
                        )}
                        <button type="button" className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${a.name}`} disabled={disabled} onClick={() => removeAct(i, j)}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="min-w-[13rem] flex-1">
                    <LookupField key={`${i}-${addKey}`} value={null} onChange={(id) => { if (id) void resolveAndAdd(id); }}
                      search={lookup.search} resolve={lookup.resolve} placeholder="Add an act…" invalid={!!err?.artists} disabled={disabled} />
                  </div>
                  <Input aria-label={`Slot ${i + 1} name as printed`} className="h-10 w-44" placeholder="or a name as printed"
                    value={typed[i] ?? ''} disabled={disabled}
                    onChange={(e) => setTyped({ ...typed, [i]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(i); } }} />
                  <Button type="button" variant="outline" size="sm" className="h-10" disabled={disabled || !(typed[i] ?? '').trim()} onClick={() => addTyped(i)}>Add</Button>
                </div>
                {placeholders.data && placeholders.data.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>no name yet:</span>
                    {placeholders.data.map((p) => (
                      <button key={p.artist_id} type="button" className="rounded-full border border-dashed px-2 py-0.5 hover:bg-secondary/60" disabled={disabled}
                        onClick={() => addAct(i, { artist_id: p.artist_id, name: p.name, create: false })}>
                        + {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex h-10 items-center gap-2 px-1 text-xs text-muted-foreground">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={s.is_headliner} disabled={disabled}
                  onChange={(e) => update(i, { is_headliner: e.target.checked })} aria-label={`Slot ${i + 1} headliner`} />
                headliner
              </label>

              <div className="flex items-center">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Move up" disabled={disabled || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Move down" disabled={disabled || i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Remove" disabled={disabled} onClick={() => onChange(value.filter((_, idx) => idx !== i))}><Trash2 /></Button>
              </div>
            </div>

            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" title="The line exactly as the publication prints it — kept when it says more than the acts do">As printed</span>
              <Input aria-label={`Slot ${i + 1} printed line`} placeholder={label || 'e.g. “Resident DJs”, “Solomun & friends”'}
                value={s.display_name_override} disabled={disabled}
                onChange={(e) => update(i, { display_name_override: e.target.value })} aria-invalid={!!err?.display_name_override} />
            </div>

            <div className="flex flex-wrap items-baseline gap-x-2 px-1 text-xs">
              <span className="font-medium">{label || '—'}</span>
              {s.placeholder_type && s.artists.some((a) => a.artist_id) && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                  {s.placeholder_type === 'secret_guest' ? 'was a secret guest' : s.placeholder_type === 'tbd' ? 'was TBA' : 'was unidentified'}
                </span>
              )}
              <span className="text-muted-foreground">{info.rule}</span>
            </div>
            {mismatch && (
              <p className="px-1 text-xs text-amber-700" role="alert">
                {info.label} {info.acts !== null ? `expects ${info.acts} act${info.acts === 1 ? '' : 's'}` : 'expects two or more acts'}, this slot has {s.artists.length}.
                Saving is allowed — it opens a review task.
              </p>
            )}
            {(err?.display_name_override?.message || err?.artists?.message) && (
              <p className="px-1 text-xs text-destructive" role="alert">{err?.display_name_override?.message ?? err?.artists?.message}</p>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, emptySlot()])}><Plus /> Add slot</Button>
    </div>
  );
}
