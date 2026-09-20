import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LookupField } from '@/components/form/LookupField';
import { placeLookup } from '@/lib/lookups';
import { formatInZone } from '@/lib/datetime';
import { RECORD_STATUSES } from '@/types/enums';
import { emptyOccurrence, occurrenceWindow, type OccurrenceFormValue } from './schema';
import { fetchPlaceTimezones } from './api';

export type OccurrenceErrors = Partial<Record<keyof OccurrenceFormValue, { message?: string }>>[] | undefined;

interface OccurrencesEditorProps {
  value: OccurrenceFormValue[];
  onChange: (rows: OccurrenceFormValue[]) => void;
  errors?: OccurrenceErrors;
  disabled?: boolean;
}

// Statuses an operator sets on a date by hand. Removing the row is how a
// mistaken date goes away; 'cancelled' is the announcement that a real one
// will not happen.
const ROW_STATUSES = RECORD_STATUSES.filter((s) => ['draft', 'active', 'cancelled'].includes(s));

const HEADER = 'hidden gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)_6rem_6rem_7.5rem_2.25rem]';
const ROW = 'grid grid-cols-1 items-start gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_6rem_6rem_7.5rem_2.25rem]';

/** Occurrences block of the event record: one row per date (design/EventEdit.dc.html). */
export function OccurrencesEditor({ value, onChange, errors, disabled }: OccurrencesEditorProps) {
  const lookup = useMemo(() => placeLookup(), []);

  function update(i: number, patch: Partial<OccurrenceFormValue>) {
    onChange(value.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  // The venue's zone is what the wall times mean; it follows the place.
  async function setPlace(i: number, placeId: string | null) {
    let timezone = value[i]?.timezone ?? '';
    if (placeId) {
      const tz = (await fetchPlaceTimezones([placeId])).get(placeId);
      if (tz) timezone = tz;
    }
    onChange(value.map((o, idx) => (idx === i ? { ...o, primary_place_id: placeId, timezone } : o)));
  }

  function add() {
    const last = value[0];
    onChange([{ ...emptyOccurrence(last?.timezone ?? ''), primary_place_id: last?.primary_place_id ?? null, start_time: last?.start_time ?? '23:00', end_time: last?.end_time ?? '06:00' }, ...value]);
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className={HEADER}><div>Business day</div><div>Default place</div><div>Start</div><div>End</div><div>Status</div><div /></div>
      )}
      {value.length === 0 && <p className="text-sm text-muted-foreground">No dates yet.</p>}
      {value.map((o, i) => {
        const err = errors?.[i];
        const w = occurrenceWindow(o);
        return (
          <div key={o.occurrence_id ?? `new-${i}`} className="rounded-lg border bg-muted/20 p-2">
            <div className={ROW}>
              <div>
                <Input type="date" aria-label={`Date ${i + 1} business day`} value={o.event_date} onChange={(e) => update(i, { event_date: e.target.value })} aria-invalid={!!err?.event_date} disabled={disabled} />
                {err?.event_date?.message && <p className="mt-1 text-xs text-destructive" role="alert">{err.event_date.message}</p>}
              </div>
              <LookupField value={o.primary_place_id} onChange={(id) => void setPlace(i, id)} search={lookup.search} resolve={lookup.resolve} placeholder="Search places…" disabled={disabled} />
              <div>
                <Input type="time" aria-label={`Date ${i + 1} start`} value={o.start_time} onChange={(e) => update(i, { start_time: e.target.value })} aria-invalid={!!err?.start_time} disabled={disabled} />
                {err?.start_time?.message && <p className="mt-1 text-xs text-destructive" role="alert">{err.start_time.message}</p>}
              </div>
              <div>
                <Input type="time" aria-label={`Date ${i + 1} end`} value={o.end_time} onChange={(e) => update(i, { end_time: e.target.value })} aria-invalid={!!err?.end_time} disabled={disabled} />
                {err?.end_time?.message && <p className="mt-1 text-xs text-destructive" role="alert">{err.end_time.message}</p>}
              </div>
              <Select value={o.status} onValueChange={(v) => update(i, { status: v })} disabled={disabled}>
                <SelectTrigger aria-label={`Date ${i + 1} status`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROW_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  {!ROW_STATUSES.includes(o.status as never) && <SelectItem value={o.status}>{o.status}</SelectItem>}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" disabled={disabled}
                title={o.occurrence_id ? 'Remove date (deactivated on save; refused while a schedule refers to it)' : 'Remove date'}
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
                <Trash2 />
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 px-1 text-xs text-muted-foreground">
              <span>{o.timezone || 'browser zone'}</span>
              {w && <span>{formatInZone(w.starts_at, o.timezone)} → {formatInZone(w.ends_at, o.timezone)}{w.nextDay && ' (next morning)'}</span>}
              <Input className="ml-auto h-7 max-w-xs text-xs" placeholder="Occurrence name (optional)" value={o.occurrence_name} onChange={(e) => update(i, { occurrence_name: e.target.value })} disabled={disabled} aria-label={`Date ${i + 1} name`} />
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={add}><Plus /> Add date</Button>
    </div>
  );
}
