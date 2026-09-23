import { useMemo } from 'react';
import { CalendarSearch, MapPinPlus, Plus, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LookupField } from '@/components/form/LookupField';
import { occurrenceLookup, placeLookup } from '@/lib/lookups';
import { formatInZone } from '@/lib/datetime';
import { RECORD_STATUSES } from '@/types/enums';
import { addDays, emptyOccurrence, occurrenceWindow, type OccurrenceFormValue } from './schema';
import { fetchPlaceTimezones } from './api';

export type OccurrenceErrors = Partial<Record<keyof OccurrenceFormValue, { message?: string }>>[] | undefined;

interface OccurrencesEditorProps {
  value: OccurrenceFormValue[];
  onChange: (rows: OccurrenceFormValue[]) => void;
  errors?: OccurrenceErrors;
  /** The event name — the tag a venue created from a row will carry. */
  eventName: string;
  disabled?: boolean;
}

// Statuses an operator sets on a date by hand. Removing the row is how a
// mistaken date goes away; 'cancelled' is the announcement that a real one
// will not happen.
const ROW_STATUSES = RECORD_STATUSES.filter((s) => ['draft', 'active', 'cancelled'].includes(s));

const HEADER = 'hidden gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[9.5rem_5.5rem_9.5rem_5.5rem_minmax(0,1fr)_7.5rem_4.5rem]';
const ROW = 'grid grid-cols-1 items-start gap-2 sm:grid-cols-[9.5rem_5.5rem_9.5rem_5.5rem_minmax(0,1fr)_7.5rem_4.5rem]';

/**
 * Occurrences block of the event record (design/EventEdit.dc.html): one row
 * per date with a start day and an end day — a club night ends the next
 * morning, a festival a week later. The default place is a stored place, or
 * a venue the row brings with it (created on save, tagged with the event).
 */
export function OccurrencesEditor({ value, onChange, errors, eventName, disabled }: OccurrencesEditorProps) {
  const lookup = useMemo(() => placeLookup(), []);
  // Umbrellas a date can be part of: any occurrence but this event's own rows.
  const own = new Set(value.map((o) => o.occurrence_id).filter(Boolean));
  const umbrellas = useMemo(() => occurrenceLookup(), []);
  const umbrellaSearch = async (q: string) => (await umbrellas.search(q)).filter((o) => !own.has(o.id));

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
    onChange(value.map((o, idx) => (idx === i ? { ...o, primary_place_id: placeId, new_place: placeId ? null : o.new_place, timezone } : o)));
  }

  // Start day typed: the end day follows unless the operator set it further away.
  function setStart(i: number, start_date: string) {
    const o = value[i]!;
    const end_date = !o.end_date || o.end_date < start_date ? (o.end_time <= o.start_time && start_date ? addDays(start_date, 1) : start_date) : o.end_date;
    update(i, { start_date, end_date });
  }

  function add() {
    const last = value[0];
    onChange([{ ...emptyOccurrence(last?.timezone ?? ''), primary_place_id: last?.primary_place_id ?? null, start_time: last?.start_time ?? '23:00', end_time: last?.end_time ?? '06:00' }, ...value]);
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className={HEADER}><div>Start day</div><div>Start</div><div>End day</div><div>End</div><div>Occurrence name</div><div>Status</div><div /></div>
      )}
      {value.length === 0 && <p className="text-sm text-muted-foreground">No dates yet.</p>}
      {value.map((o, i) => {
        const err = errors?.[i];
        const w = occurrenceWindow(o);
        return (
          <div key={o.occurrence_id ?? `new-${i}`} className="space-y-2 rounded-lg border bg-muted/20 p-2">
            <div className={ROW}>
              <div>
                <Input type="date" aria-label={`Date ${i + 1} start day`} value={o.start_date} onChange={(e) => setStart(i, e.target.value)} aria-invalid={!!err?.start_date} disabled={disabled} />
                {err?.start_date?.message && <p className="mt-1 text-xs text-destructive" role="alert">{err.start_date.message}</p>}
              </div>
              <Input type="time" aria-label={`Date ${i + 1} start time`} value={o.start_time} onChange={(e) => update(i, { start_time: e.target.value })} aria-invalid={!!err?.start_time} disabled={disabled} />
              <div>
                <Input type="date" aria-label={`Date ${i + 1} end day`} value={o.end_date} min={o.start_date || undefined} onChange={(e) => update(i, { end_date: e.target.value })} aria-invalid={!!err?.end_date} disabled={disabled} />
                {err?.end_date?.message && <p className="mt-1 text-xs text-destructive" role="alert">{err.end_date.message}</p>}
              </div>
              <Input type="time" aria-label={`Date ${i + 1} end time`} value={o.end_time} onChange={(e) => update(i, { end_time: e.target.value })} aria-invalid={!!err?.end_time} disabled={disabled} />
              <Input aria-label={`Date ${i + 1} name`} placeholder="Edition or night, e.g. Tomorrowland Winter" value={o.occurrence_name} onChange={(e) => update(i, { occurrence_name: e.target.value })} disabled={disabled} />
              <Select value={o.status} onValueChange={(v) => update(i, { status: v })} disabled={disabled}>
                <SelectTrigger aria-label={`Date ${i + 1} status`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROW_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  {!ROW_STATUSES.includes(o.status as never) && <SelectItem value={o.status}>{o.status}</SelectItem>}
                </SelectContent>
              </Select>
              <div className="flex items-center">
                {o.occurrence_id && (
                  <Button asChild variant="ghost" size="icon" title="Open this night: its line-ups and what is announced for it">
                    <Link to={`/lineups?occurrence=${o.occurrence_id}`}><CalendarSearch /></Link>
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon" disabled={disabled}
                  title={o.occurrence_id ? 'Remove date (deactivated on save; refused while a line-up or schedule refers to it)' : 'Remove date'}
                  onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_4.5rem_minmax(0,18rem)]">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Default place</span>
              {o.new_place && !o.primary_place_id ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[#C9BCE6] bg-secondary/40 px-3 py-1.5 text-sm">
                  <MapPinPlus className="h-4 w-4 text-secondary-foreground" aria-hidden />
                  <span>
                    New place <b>{o.new_place.name}</b>
                    {[o.new_place.city, o.new_place.country].filter(Boolean).length > 0 && <span className="text-muted-foreground"> · {[o.new_place.city, o.new_place.country].filter(Boolean).join(', ')}</span>}
                    <span className="text-muted-foreground"> · created on save, tagged </span><code className="text-xs">{eventName.trim() || 'the event name'}</code>
                  </span>
                  <span className="flex-1" />
                  <div className="w-56"><LookupField value={null} onChange={(id) => void setPlace(i, id)} search={lookup.search} resolve={lookup.resolve} placeholder="Pick an existing one instead…" disabled={disabled} /></div>
                  <button type="button" className="rounded-full p-1 hover:bg-black/10" aria-label="Drop the new place" title="Drop the new place" onClick={() => update(i, { new_place: null })} disabled={disabled}><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <LookupField value={o.primary_place_id} onChange={(id) => void setPlace(i, id)} search={lookup.search} resolve={lookup.resolve} placeholder="Search places… (empty = not the place of any set, just the default)" disabled={disabled} />
              )}
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" title="The umbrella this date belongs to — Miami Music Week, ADE, a closing weekend">Part of</span>
              <LookupField value={o.part_of_occurrence_id} onChange={(id) => update(i, { part_of_occurrence_id: id })} search={umbrellaSearch} resolve={umbrellas.resolve} placeholder="Umbrella, e.g. Miami Music Week 2027" disabled={disabled} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 px-1 text-xs text-muted-foreground">
              <span>{o.timezone || 'browser zone'}</span>
              {w && <span>{formatInZone(w.starts_at, o.timezone)} → {formatInZone(w.ends_at, o.timezone)}{w.days === 1 ? ' (next morning)' : w.days > 1 ? ` (${w.days} days)` : ''}</span>}
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={add}><Plus /> Add date</Button>
    </div>
  );
}
