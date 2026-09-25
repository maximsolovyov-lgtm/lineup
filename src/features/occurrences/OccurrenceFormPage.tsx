import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ListMusic, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FavoriteStar } from '@/components/FavoriteStar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { LookupField } from '@/components/form/LookupField';
import { StatusBadge } from '@/components/StatusBadge';
import { occurrenceLookup, placeLookup } from '@/lib/lookups';
import { formatInZone, instantToWallTime, wallTimeToInstant } from '@/lib/datetime';
import { RECORD_STATUSES } from '@/types/enums';
import type { Enums } from '@/types/database';
import { fetchPlaceTimezones } from '@/features/events/api';
import { SlotSummary, type SlotSummaryRow } from '@/features/lineups/SlotSummary';
import { useGeneratePredictedSets, useOccurrence, useOccurrenceLineups, useOccurrenceSets, useSaveOccurrence } from './api';
import { buildSchedule, planToPayload, type ScheduleLineup } from './schedule';

interface FormState {
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  timezone: string;
  primary_place_id: string | null;
  occurrence_name: string;
  website_url: string;
  part_of_occurrence_id: string | null;
  status: string;
}

/**
 * One night, on its own screen. The event owns the calendar; this is where the
 * night itself is corrected and where its timetable is generated from the
 * line-up that is already published for it.
 */
export function OccurrenceFormPage() {
  const { occurrenceId } = useParams<{ occurrenceId: string }>();
  const navigate = useNavigate();
  const occurrence = useOccurrence(occurrenceId);
  const lineups = useOccurrenceLineups(occurrenceId);
  const sets = useOccurrenceSets(occurrenceId);
  const save = useSaveOccurrence(occurrenceId ?? '');
  const generate = useGeneratePredictedSets(occurrenceId ?? '');
  const places = useMemo(() => placeLookup(), []);
  const umbrellas = useMemo(() => occurrenceLookup(), []);

  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lineupId, setLineupId] = useState<string>('');
  const [replace, setReplace] = useState(true);

  const row = occurrence.data;
  useEffect(() => {
    if (!row) return;
    const start = instantToWallTime(row.starts_at, row.timezone);
    const end = instantToWallTime(row.ends_at, row.timezone);
    setForm({
      start_date: start.slice(0, 10) || row.event_date,
      start_time: start.slice(11, 16),
      end_date: end.slice(0, 10) || row.event_date,
      end_time: end.slice(11, 16),
      timezone: row.timezone ?? '',
      primary_place_id: row.primary_place_id,
      occurrence_name: row.occurrence_name ?? '',
      website_url: row.website_url ?? '',
      part_of_occurrence_id: row.part_of_occurrence_id,
      status: row.status,
    });
    setDirty(false);
  }, [row]);

  // The current line-up is the highest version; the operator can pick another.
  const active = lineups.data ?? [];
  useEffect(() => {
    if (!lineupId && active.length > 0) setLineupId(active[0]!.lineup_id);
  }, [active, lineupId]);
  const chosen = active.find((l) => l.lineup_id === lineupId) ?? null;

  const plan = useMemo(() => {
    if (!row || !chosen) return null;
    return buildSchedule(chosen as unknown as ScheduleLineup, row, row.place ?? null);
  }, [row, chosen]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setDirty(true);
  }

  async function pickPlace(id: string | null) {
    let timezone = form?.timezone ?? '';
    if (id) {
      const tz = (await fetchPlaceTimezones([id])).get(id);
      if (tz) timezone = tz;
    }
    setForm((f) => (f ? { ...f, primary_place_id: id, timezone } : f));
    setDirty(true);
  }

  async function onSave() {
    if (!form || !occurrenceId) return;
    const starts_at = wallTimeToInstant(`${form.start_date}T${form.start_time}`, form.timezone || null);
    const ends_at = wallTimeToInstant(`${form.end_date}T${form.end_time}`, form.timezone || null);
    if (!starts_at || !ends_at) { toast.error('Fill the start and the end of the night'); return; }
    if (ends_at <= starts_at) { toast.error('The night ends before it starts'); return; }
    try {
      await save.mutateAsync({
        event_date: form.start_date,
        starts_at,
        ends_at,
        timezone: form.timezone.trim() || null,
        primary_place_id: form.primary_place_id,
        occurrence_name: form.occurrence_name.trim() || null,
        website_url: form.website_url.trim() || null,
        part_of_occurrence_id: form.part_of_occurrence_id,
        status: form.status as Enums<'record_status'>,
      });
      setDirty(false);
      toast.success('Night saved');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onGenerate() {
    if (!row || !chosen || !plan) return;
    const payload = planToPayload(plan, chosen as unknown as ScheduleLineup, row);
    if (payload.length === 0) { toast.error('Nothing to generate — this line-up has no lines with acts'); return; }
    try {
      const n = await generate.mutateAsync({ lineupId: chosen.lineup_id, sets: payload, replace });
      toast.success(`${n} predicted set${n === 1 ? '' : 's'} written from v${chosen.version}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (occurrence.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (occurrence.isError) return <p className="text-destructive">{(occurrence.error as Error).message}</p>;
  if (!row || !form) return <p className="text-muted-foreground">This night is no longer in the system.</p>;

  const existingPredicted = (sets.data ?? []).filter((s) => s.scenario_type === 'predicted' && s.status === 'active');
  const planned = plan?.groups.reduce((n, g) => n + g.rows.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/occurrences" title="Back to occurrences"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-[23px] font-semibold tracking-[-0.4px]">
          {row.event?.name} · {row.event_date}{row.occurrence_name ? ` · ${row.occurrence_name}` : ''}
        </h1>
        {occurrenceId && <FavoriteStar entity="event_occurrence" id={occurrenceId} className="-ml-1" />}
        <Button type="button" onClick={() => void onSave()} disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <FormSection title="The night" description="When it runs and where. The event owns the calendar — a date is added there; here it is corrected.">
        <Field label="Event" className="sm:col-span-2" hint="Owns this date and everything about the brand.">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
            <Link to={`/events/${row.event?.event_id}`} className="font-medium underline-offset-2 hover:underline">{row.event?.name}</Link>
            <span className="text-muted-foreground">· {row.event?.event_type}</span>
            <span className="flex-1" />
            <StatusBadge status={row.status} />
          </div>
        </Field>
        <Field label="Start day" htmlFor="start_date" required hint="The business day: the night the party starts.">
          <Input id="start_date" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field label="Start" htmlFor="start_time" required>
          <Input id="start_time" type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
        </Field>
        <Field label="End day" htmlFor="end_date" required hint="The next morning for a club night, the last day for a festival.">
          <Input id="end_date" type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </Field>
        <Field label="End" htmlFor="end_time" required>
          <Input id="end_time" type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
        </Field>
        <Field label="Default place" className="sm:col-span-2" hint="Empty means the venue was never announced — it is not a default for the sets.">
          <LookupField value={form.primary_place_id} onChange={(id) => void pickPlace(id)} search={places.search} resolve={places.resolve} placeholder="Not announced" />
        </Field>
        <Field label="Time zone" htmlFor="timezone" hint="What the wall times above mean; follows the place.">
          <Input id="timezone" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="Europe/Madrid" />
        </Field>
        <Field label="Status" htmlFor="status" required>
          <Select value={form.status} onValueChange={(v) => set('status', v)}>
            <SelectTrigger id="status"><SelectValue /></SelectTrigger>
            <SelectContent>{RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Night name" htmlFor="occurrence_name" hint="Edition or night name: “Opening Party”, “Weekend 2”.">
          <Input id="occurrence_name" value={form.occurrence_name} onChange={(e) => set('occurrence_name', e.target.value)} />
        </Field>
        <Field label="Site" htmlFor="website_url" hint="This edition's own site, when it has one apart from the event's — the line-up agent reads it first.">
          <Input id="website_url" type="url" value={form.website_url} onChange={(e) => set('website_url', e.target.value)} placeholder="https://edcorlando.com" />
        </Field>
        <Field label="Part of" className="sm:col-span-2" hint="The umbrella this night belongs to — Miami Music Week, ADE, a closing weekend.">
          <LookupField value={form.part_of_occurrence_id} onChange={(id) => set('part_of_occurrence_id', id)} search={umbrellas.search} resolve={umbrellas.resolve} placeholder="Stands on its own" />
        </Field>
      </FormSection>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Line-ups of this night</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">lineup</span>
          <span className="flex-1" />
          {/* A publication is never edited into the next one: the button starts the
              next version FROM the open one, which arrives with its lines already in. */}
          <Button asChild variant="outline" size="sm">
            <Link to={`/lineups/new?occurrence=${occurrenceId}${chosen?.place_id ? `&place=${chosen.place_id}` : form.primary_place_id ? `&place=${form.primary_place_id}` : ''}${chosen ? `&from=${chosen.lineup_id}` : ''}`}>
              <ListMusic /> {chosen ? `New version from v${chosen.version}` : 'New line-up'}
            </Link>
          </Button>
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing published for this night yet. A timetable is generated from a line-up, so start there.</p>
        ) : (
          <>
            {/* Newest version first and open: that is the one that is current. */}
            <div role="tablist" aria-label="Line-up versions" className="-mb-px flex flex-wrap items-end gap-1 border-b">
              {active.map((l, i) => {
                const on = l.lineup_id === lineupId;
                return (
                  <button
                    key={l.lineup_id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setLineupId(l.lineup_id)}
                    className={`flex items-center gap-2 rounded-t-lg border border-b-0 px-3 py-1.5 text-sm transition-colors ${
                      on ? 'border-[#C9BCE6] bg-secondary/50 font-medium' : 'border-transparent text-muted-foreground hover:bg-secondary/30'}`}
                  >
                    <span className="font-mono font-semibold">v{l.version}</span>
                    <span className={l.place?.name ? '' : 'italic'}>{l.place?.name ?? 'no place'}</span>
                    {i === 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">current</span>}
                  </button>
                );
              })}
            </div>
            {chosen && (
              <div className="space-y-2 rounded-b-lg border border-t-0 border-[#C9BCE6] bg-secondary/20 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Link to={`/lineups/${chosen.lineup_id}`} className="underline underline-offset-2">Open v{chosen.version} to edit</Link>
                  <span>·</span>
                  <span>{chosen.lineup_artist.filter((s) => s.status === 'active').length} lines</span>
                  {chosen.published_at && <span>· published {new Date(chosen.published_at).toLocaleDateString()}</span>}
                  {chosen.split_by_day && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">split by day</span>}
                </div>
                <SlotSummary
                  slots={chosen.lineup_artist.filter((s) => s.status === 'active') as unknown as SlotSummaryRow[]}
                  showDays={chosen.split_by_day}
                />
              </div>
            )}
          </>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-[#C9BCE6] bg-secondary/40 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-secondary-foreground">Generate the timetable</h2>
          <span className="rounded-full bg-card px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">predicted performance_set</span>
          <span className="flex-1" />
          {active.length > 1 && <span className="text-xs text-muted-foreground">from the version open above</span>}
          <Button type="button" onClick={() => void onGenerate()} disabled={!plan || planned === 0 || generate.isPending}>
            <Wand2 /> {generate.isPending ? 'Writing…' : `Generate ${planned || ''} set${planned === 1 ? '' : 's'}`}
          </Button>
        </div>

        {!chosen && <p className="text-sm text-muted-foreground">Publish a line-up first — the timetable is who plays when, and it comes from who plays.</p>}

        {chosen && plan && (
          <>
            <p className="text-sm text-muted-foreground">
              From <b>v{chosen.version}</b> ({chosen.place?.name ?? 'place not announced'}), inside{' '}
              {formatInZone(row.starts_at, row.timezone)} → {formatInZone(row.ends_at, row.timezone)}. {plan.notes.join(' ')}
              {' '}These are <b>predictions</b>: they are written as such, with the version of the line-up they came from, and they never claim to be announced.
            </p>
            {plan.groups.map((g) => (
              <div key={`${g.day}|${g.roomId ?? ''}`} className="space-y-1 rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{g.roomName}</span>
                  <span className="text-muted-foreground">· {g.day}</span>
                  {g.pinned && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">headliner slot from the venue</span>}
                </div>
                <ul className="divide-y text-sm">
                  {g.rows.map((r) => (
                    <li key={r.slot.lineup_artist_id} className="flex flex-wrap items-center gap-2 py-1">
                      <span className="w-28 font-mono text-[12px] text-muted-foreground">{r.start.slice(11)}–{r.end.slice(11)}</span>
                      <span>{r.label}</span>
                      {r.slot.is_headliner && <span className="text-[11px] font-semibold uppercase text-amber-700">headliner</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              supersede the previous prediction from this line-up ({existingPredicted.length} active now) — the old rows are kept, not deleted
            </label>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Sets of this night</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">performance_set</span>
          <span className="flex-1" />
          <Button asChild variant="outline" size="sm"><Link to={`/sets/new?occurrence=${occurrenceId}`}>Add one by hand</Link></Button>
        </div>
        {(sets.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No sets yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {sets.data!.map((s) => (
              <li key={s.performance_set_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="w-32 font-mono text-[12px] text-muted-foreground">
                  {s.scheduled_start_at ? formatInZone(s.scheduled_start_at, row.timezone).slice(-5) : '—'}
                  {s.scheduled_end_at ? `–${formatInZone(s.scheduled_end_at, row.timezone).slice(-5)}` : ''}
                </span>
                <Link to={`/sets/${s.performance_set_id}`} className="font-medium underline-offset-2 hover:underline">
                  {(s.artist_list_json as { name: string }[] | null)?.map((a) => a.name).join(', ') || s.set_type}
                </Link>
                {s.space?.name && <span className="text-xs text-muted-foreground">· {s.space.name}</span>}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">{s.scenario_type} v{s.scenario_version}</span>
                {s.status !== 'active' && <StatusBadge status={s.status} />}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          A predicted set is never edited into an official one: publishing a timetable is a new set that supersedes it.
          {' '}<button type="button" className="underline" onClick={() => navigate('/sets')}>Open the Sets tab</button>
        </p>
      </section>
    </div>
  );
}
