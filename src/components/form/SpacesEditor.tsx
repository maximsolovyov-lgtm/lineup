import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SpaceFormValue } from '@/features/places/schema';

export type SpaceErrors = Partial<Record<keyof SpaceFormValue, { message?: string }>>[] | undefined;

interface SpacesEditorProps {
  value: SpaceFormValue[];
  onChange: (spaces: SpaceFormValue[]) => void;
  errors?: SpaceErrors;
  disabled?: boolean;
}

// Suggestions only; space_type is free text in the database.
const SPACE_TYPES = ['main_room', 'room', 'terrace', 'outdoor', 'stage', 'garden', 'intimate', 'bar', 'vip'];

// Written out in full so Tailwind's scanner sees them.
const HEADER_GRID = 'hidden gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_6rem_5.5rem_2.25rem]';
const ROW_GRID = 'grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_6rem_5.5rem_2.25rem]';

/**
 * Rooms block of the Place record: one row per active place_space. Rows are
 * saved with the place in one transaction (save_place_with_spaces); a removed
 * row becomes inactive on save, and the database refuses that when a
 * performance_set still points at the room.
 */
export function SpacesEditor({ value, onChange, errors, disabled }: SpacesEditorProps) {
  function update(i: number, patch: Partial<SpaceFormValue>) {
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  // Radio semantics: choosing one clears the others. Clicking the chosen one clears it too.
  function setPrimary(i: number) {
    const on = !value[i]?.is_primary;
    onChange(value.map((s, idx) => ({ ...s, is_primary: on && idx === i })));
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className={HEADER_GRID}>
          <div>Name</div><div>Type</div><div>Capacity</div><div>Primary</div><div />
        </div>
      )}
      {value.length === 0 && <p className="text-sm text-muted-foreground">No rooms recorded.</p>}
      {value.map((sp, i) => {
        const err = errors?.[i];
        return (
          <div key={sp.space_id ?? `new-${i}`} className="space-y-2 rounded-lg border bg-muted/20 p-2">
            <div className={ROW_GRID}>
              <div>
                <Input
                  aria-label={`Room ${i + 1} name`}
                  placeholder="Room name"
                  value={sp.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  aria-invalid={!!err?.name}
                  disabled={disabled}
                />
                {err?.name?.message && <p className="mt-1 text-xs text-destructive" role="alert">{err.name.message}</p>}
              </div>
              <div>
                <Input
                  aria-label={`Room ${i + 1} type`}
                  placeholder="Type"
                  list="space-type-suggestions"
                  value={sp.space_type}
                  onChange={(e) => update(i, { space_type: e.target.value })}
                  aria-invalid={!!err?.space_type}
                  disabled={disabled}
                />
                {err?.space_type?.message && <p className="mt-1 text-xs text-destructive" role="alert">{err.space_type.message}</p>}
              </div>
              <div>
                <Input
                  aria-label={`Room ${i + 1} capacity`}
                  placeholder="Cap."
                  inputMode="numeric"
                  value={sp.capacity}
                  onChange={(e) => update(i, { capacity: e.target.value })}
                  aria-invalid={!!err?.capacity}
                  disabled={disabled}
                />
                {err?.capacity?.message && <p className="mt-1 text-xs text-destructive" role="alert">{err.capacity.message}</p>}
              </div>
              <div>
                <label className="flex h-9 cursor-pointer items-center gap-2 px-1 text-sm">
                  <input
                    type="radio"
                    name="primary-space"
                    className="h-4 w-4 accent-primary"
                    checked={sp.is_primary}
                    onChange={() => undefined}
                    onClick={() => setPrimary(i)}
                    disabled={disabled}
                    aria-label={`Room ${i + 1} is the primary room`}
                  />
                  <span className="text-xs text-muted-foreground">{sp.is_primary ? 'primary' : ''}</span>
                </label>
                {err?.is_primary?.message && <p className="mt-1 text-xs text-destructive" role="alert">{err.is_primary.message}</p>}
              </div>
              <Button
                type="button" variant="ghost" size="icon" disabled={disabled}
                title={sp.space_id ? 'Remove room (it is deactivated on save)' : 'Remove room'}
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                <Trash2 />
              </Button>
            </div>
            <Input
              aria-label={`Room ${i + 1} notes`}
              placeholder="Notes"
              className="h-8 text-sm"
              value={sp.notes}
              onChange={(e) => update(i, { notes: e.target.value })}
              disabled={disabled}
            />
          </div>
        );
      })}
      <datalist id="space-type-suggestions">
        {SPACE_TYPES.map((t) => <option key={t} value={t} />)}
      </datalist>
      <Button
        type="button" variant="outline" size="sm" disabled={disabled}
        onClick={() => onChange([...value, { space_id: null, name: '', space_type: '', capacity: '', notes: '', is_primary: value.length === 0 }])}
      >
        <Plus /> Add room
      </Button>
    </div>
  );
}
