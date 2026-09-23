import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LookupField } from '@/components/form/LookupField';
import { artistLookup } from '@/lib/lookups';
import { Constants } from '@/types/database';

/**
 * One announced slot: an artist, or a placeholder (TBA / Secret Guest), or a
 * free label the operator could not map to an artist. Used by the line-up's
 * artists block and the set's participants block; the set adds a role.
 *
 * placeholder_type is never cleared when a slot is revealed: an artist with
 * kind "secret_guest" is a revealed guest and shows the badge.
 */
export interface SlotFormValue {
  id: string | null;
  artist_id: string | null;
  placeholder_type: 'tbd' | 'secret_guest' | 'unknown' | '';
  display_name_override: string;
  is_headliner: boolean;
  participant_role: string;
  /** Label-only slot the publication names: create the artist record on save (type unknown, review task). */
  create_artist?: boolean;
}

export const PARTICIPANT_ROLES = Constants.public.Enums.participant_role;

export type SlotErrors = Partial<Record<keyof SlotFormValue, { message?: string }>>[] | undefined;

interface SlotsEditorProps {
  value: SlotFormValue[];
  onChange: (rows: SlotFormValue[]) => void;
  errors?: SlotErrors;
  /** Sets carry a participant role; line-ups do not. */
  showRole?: boolean;
  disabled?: boolean;
  addLabel?: string;
}

const HEADER_BASE = 'hidden gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid';
const GRID_LINEUP = 'sm:grid-cols-[7.5rem_minmax(0,1fr)_5.5rem_4.75rem]';
const GRID_SET = 'sm:grid-cols-[7.5rem_minmax(0,1fr)_7rem_5.5rem_4.75rem]';

export function emptySlot(): SlotFormValue {
  return { id: null, artist_id: null, placeholder_type: '', display_name_override: '', is_headliner: false, participant_role: 'unknown' };
}

export function SlotsEditor({ value, onChange, errors, showRole = false, disabled, addLabel = 'Add slot' }: SlotsEditorProps) {
  const lookup = useMemo(() => artistLookup(), []);
  const grid = showRole ? GRID_SET : GRID_LINEUP;

  function update(i: number, patch: Partial<SlotFormValue>) {
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }
  // "kind" is how the operator sees a slot: it is derived from the two stored fields.
  function kindOf(s: SlotFormValue): string {
    if (s.artist_id && s.placeholder_type === 'secret_guest') return 'revealed';
    if (s.artist_id) return 'artist';
    if (s.placeholder_type) return s.placeholder_type;
    return 'label';
  }
  function setKind(i: number, kind: string) {
    const s = value[i]!;
    if (kind === 'artist') update(i, { placeholder_type: '', display_name_override: '' });
    else if (kind === 'revealed') update(i, { placeholder_type: 'secret_guest', display_name_override: '' });
    else if (kind === 'tbd' || kind === 'secret_guest' || kind === 'unknown') update(i, { artist_id: null, placeholder_type: kind, display_name_override: s.display_name_override });
    else update(i, { artist_id: null, placeholder_type: '' });
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className={`${HEADER_BASE} ${grid}`}>
          <div>Kind</div><div>Who</div>{showRole && <div>Role</div>}<div>Headliner</div><div />
        </div>
      )}
      {value.length === 0 && <p className="text-sm text-muted-foreground">No slots yet.</p>}
      {value.map((s, i) => {
        const err = errors?.[i];
        const kind = kindOf(s);
        return (
          <div key={s.id ?? `new-${i}`} className={`grid grid-cols-1 items-start gap-2 rounded-lg border bg-muted/20 p-2 ${grid}`}>
            <Select value={kind} onValueChange={(v) => setKind(i, v)} disabled={disabled}>
              <SelectTrigger aria-label={`Slot ${i + 1} kind`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="artist">Artist</SelectItem>
                <SelectItem value="tbd">TBA</SelectItem>
                <SelectItem value="secret_guest">Secret guest</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
                <SelectItem value="revealed">Revealed guest</SelectItem>
                <SelectItem value="label">Label only</SelectItem>
              </SelectContent>
            </Select>
            <div>
              {kind === 'artist' || kind === 'revealed' ? (
                <LookupField value={s.artist_id} onChange={(id) => update(i, { artist_id: id })} search={lookup.search} resolve={lookup.resolve} placeholder="Search artists…" invalid={!!err?.artist_id || !!err?.display_name_override} disabled={disabled} />
              ) : (
                <>
                  <Input aria-label={`Slot ${i + 1} label`} placeholder={kind === 'label' ? 'Name as printed, not yet an artist record' : 'Optional label, e.g. "Special guest"'}
                    value={s.display_name_override} onChange={(e) => update(i, { display_name_override: e.target.value })} aria-invalid={!!err?.display_name_override} disabled={disabled} />
                  {kind === 'label' && (
                    <label className="mt-1 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={!!s.create_artist} onChange={(e) => update(i, { create_artist: e.target.checked })} disabled={disabled} />
                      create an artist record on save
                    </label>
                  )}
                </>
              )}
              {(err?.artist_id?.message || err?.display_name_override?.message) && (
                <p className="mt-1 text-xs text-destructive" role="alert">{err?.artist_id?.message ?? err?.display_name_override?.message}</p>
              )}
            </div>
            {showRole && (
              <Select value={s.participant_role} onValueChange={(v) => update(i, { participant_role: v })} disabled={disabled}>
                <SelectTrigger aria-label={`Slot ${i + 1} role`}><SelectValue /></SelectTrigger>
                <SelectContent>{PARTICIPANT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <label className="flex h-10 items-center gap-2 px-1 text-xs text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={s.is_headliner} onChange={(e) => update(i, { is_headliner: e.target.checked })} disabled={disabled} aria-label={`Slot ${i + 1} headliner`} />
              headliner
            </label>
            <div className="flex items-center">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Move up" disabled={disabled || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Move down" disabled={disabled || i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Remove" disabled={disabled} onClick={() => onChange(value.filter((_, idx) => idx !== i))}><Trash2 /></Button>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, emptySlot()])}><Plus /> {addLabel}</Button>
    </div>
  );
}
