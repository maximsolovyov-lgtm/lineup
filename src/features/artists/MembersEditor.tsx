import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { initials } from './PersonPickerDialog';
import { MEMBERSHIP_ROLES, type MemberFormValue } from './schema';

export type MemberErrors = Partial<Record<keyof MemberFormValue, { message?: string }>>[] | undefined;

interface MembersEditorProps {
  value: MemberFormValue[];
  onChange: (members: MemberFormValue[]) => void;
  errors?: MemberErrors;
  showPrimary: boolean;
  disabled?: boolean;
}

const HEADER = 'hidden gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[minmax(0,2fr)_7rem_8.5rem_8.5rem_2.25rem]';
const ROW = 'grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,2fr)_7rem_8.5rem_8.5rem_2.25rem]';

/** Members block of the artist record: one row per active artist_membership. */
export function MembersEditor({ value, onChange, errors, showPrimary, disabled }: MembersEditorProps) {
  function update(i: number, patch: Partial<MemberFormValue>) {
    onChange(value.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className={HEADER}><div>Person</div><div>Role</div><div>From</div><div>Until</div><div /></div>
      )}
      {value.length === 0 && <p className="text-sm text-muted-foreground">No members recorded yet.</p>}
      {value.map((m, i) => {
        const err = errors?.[i];
        return (
          <div key={m.membership_id ?? m.person_id ?? `new-${i}`} className="rounded-lg border bg-muted/20 p-2">
            <div className={ROW}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{initials(m.display_name)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{m.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.sublabel}</span>
                </span>
              </div>
              <Select value={m.membership_role || '_none'} onValueChange={(v) => update(i, { membership_role: v === '_none' ? '' : v })} disabled={disabled}>
                <SelectTrigger aria-label={`Member ${i + 1} role`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {MEMBERSHIP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" aria-label={`Member ${i + 1} from`} value={m.started_at} onChange={(e) => update(i, { started_at: e.target.value })} aria-invalid={!!err?.started_at} disabled={disabled} />
              <Input type="date" aria-label={`Member ${i + 1} until`} value={m.ended_at} onChange={(e) => update(i, { ended_at: e.target.value })} aria-invalid={!!err?.ended_at} disabled={disabled} />
              <Button type="button" variant="ghost" size="icon" disabled={disabled} title="Remove member (the membership is deactivated on save)"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
                <Trash2 />
              </Button>
            </div>
            {showPrimary && (
              <label className="mt-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <input type="radio" name="primary-member" className="h-3.5 w-3.5 accent-primary" checked={m.is_primary} onChange={() => undefined}
                  onClick={() => onChange(value.map((x, idx) => ({ ...x, is_primary: !m.is_primary && idx === i })))} disabled={disabled} />
                main bearer of the alias
              </label>
            )}
            {(err?.display_name?.message || err?.ended_at?.message) && (
              <p className="mt-1 px-1 text-xs text-destructive" role="alert">{err?.display_name?.message ?? err?.ended_at?.message}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
