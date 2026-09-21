import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { LookupField } from '@/components/form/LookupField';
import { SlotsEditor, type SlotErrors } from '@/components/form/SlotsEditor';
import { StatusBadge } from '@/components/StatusBadge';
import { lineupLookup, occurrenceLookup, placeLookup, placeSpaceLookup } from '@/lib/lookups';
import { fetchPlaceTimezones } from '@/features/events/api';
import { CONFIRMATION_STATUSES, INFORMATION_ORIGINS, PLACE_ROLES, SET_TYPES, emptySetForm, fromRow, setFormSchema, toPayload, type SetFormValues } from './schema';
import { fetchLineupContext, useSaveSet, useSet, useSetStatus } from './api';

export function SetFormPage() {
  const { setId } = useParams<{ setId: string }>();
  const [params] = useSearchParams();
  const isNew = !setId;
  const navigate = useNavigate();
  const existing = useSet(setId);
  const save = useSaveSet();
  const setStatus = useSetStatus();
  const occurrences = useMemo(() => occurrenceLookup(), []);
  const places = useMemo(() => placeLookup(), []);

  const form = useForm<SetFormValues>({ resolver: zodResolver(setFormSchema), defaultValues: emptySetForm, mode: 'onBlur' });
  const { register, control, handleSubmit, reset, watch, setValue, getValues, formState: { errors, isSubmitting, isDirty } } = form;
  const occurrenceId = watch('occurrence_id');
  const placeId = watch('place_id');
  const scenario = watch('scenario_type');
  const timezone = watch('timezone');
  const lineups = useMemo(() => lineupLookup(occurrenceId || null), [occurrenceId]);
  const rooms = useMemo(() => placeSpaceLookup(placeId), [placeId]);

  useEffect(() => {
    if (existing.data) reset(fromRow(existing.data.set, existing.data.participants, existing.data.timezone));
  }, [existing.data, reset]);

  // Arriving from a line-up ("Add set"): occurrence, place, version and zone come from it.
  useEffect(() => {
    const fromLineup = params.get('lineup');
    if (!isNew || !fromLineup) return;
    void applyLineup(fromLineup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, params]);

  async function applyLineup(lineupId: string | null) {
    setValue('lineup_id', lineupId, { shouldDirty: true });
    if (!lineupId) return;
    try {
      const l = await fetchLineupContext(lineupId);
      setValue('occurrence_id', l.occurrence_id, { shouldDirty: true });
      if (l.place_id && !getValues('place_id')) setValue('place_id', l.place_id, { shouldDirty: true });
      if (!getValues('scenario_version')) setValue('scenario_version', String(l.version), { shouldDirty: true });
      if (!getValues('event_day') && l.event_occurrence?.event_date) setValue('event_day', l.event_occurrence.event_date, { shouldDirty: true });
      const tz = l.place?.timezone ?? l.event_occurrence?.timezone ?? '';
      if (tz && !getValues('timezone')) setValue('timezone', tz, { shouldDirty: true });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function applyPlace(id: string | null) {
    setValue('place_id', id, { shouldDirty: true });
    setValue('place_space_id', null, { shouldDirty: true });
    if (id) {
      const tz = (await fetchPlaceTimezones([id])).get(id);
      if (tz) setValue('timezone', tz, { shouldDirty: true });
    }
  }

  async function onSubmit(values: SetFormValues) {
    try {
      const saved = await save.mutateAsync(toPayload(values, setId ?? null));
      toast.success(isNew ? 'Set created' : 'New row saved; the previous one is superseded');
      navigate(`/sets/${saved.performance_set_id}`, { replace: isNew });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function cancelSet() {
    if (!setId) return;
    try {
      await setStatus.mutateAsync({ setId, status: 'cancelled' });
      toast.success('Set cancelled');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isNew && existing.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && existing.isError) return <p className="text-destructive">{(existing.error as Error).message}</p>;

  const row = existing.data?.set;
  const superseded = row?.status === 'superseded';
  const names = (row?.artist_list_json as { name: string }[] | null)?.map((a) => a.name).join(', ');
  const title = isNew ? 'New set' : `${row?.event_occurrence?.event?.name ?? 'Set'} · ${row?.event_day ?? ''} · ${row?.display_name || names || row?.set_type}`;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/sets" title="Back to sets"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-[23px] font-semibold tracking-[-0.4px]">{title}</h1>
        {row && <StatusBadge status={row.status} />}
        {!isNew && !superseded && row?.status !== 'cancelled' && (
          <Button type="button" variant="outline" onClick={() => void cancelSet()} disabled={setStatus.isPending} title="A cancellation is a status change and a notification event; the row itself stays">
            <Ban /> Cancel set
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || superseded || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create set' : 'Save as new row'}
        </Button>
      </div>

      {!isNew && (
        <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          A set is never updated with new information. Saving inserts a <b>new row</b> with these values and marks this one <i>superseded</i>, so predictions can
          always be compared with what happened.
          {row?.supersedes_performance_set_id && <> This row supersedes <Link className="underline" to={`/sets/${row.supersedes_performance_set_id}`}>an earlier one</Link>.</>}
          {(existing.data?.supersededBy.length ?? 0) > 0 && <> It is superseded by <Link className="underline" to={`/sets/${existing.data!.supersededBy[0]!.performance_set_id}`}>a later row</Link> — edit that one.</>}
        </p>
      )}

      <FormSection title="Where it belongs" description="An official set belongs to a line-up version. A prediction may point at the line-up it was derived from, or stand alone.">
        <Field label="Scenario" htmlFor="scenario_type" required error={errors.scenario_type?.message}>
          <Controller control={control} name="scenario_type" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={superseded}>
              <SelectTrigger id="scenario_type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="official">official</SelectItem><SelectItem value="predicted">predicted</SelectItem></SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Completeness" htmlFor="completeness" required error={errors.completeness?.message} hint="partial = only a coarser split is known (a group block per day or room).">
          <Controller control={control} name="completeness" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={superseded}>
              <SelectTrigger id="completeness"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="full">full</SelectItem><SelectItem value="partial">partial</SelectItem></SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Occurrence" htmlFor="occurrence_id" required error={errors.occurrence_id?.message} className="sm:col-span-2">
          <Controller control={control} name="occurrence_id" render={({ field }) => (
            <LookupField id="occurrence_id" value={field.value || null} onChange={(id) => { field.onChange(id ?? ''); setValue('lineup_id', null); }} search={occurrences.search} resolve={occurrences.resolve} placeholder="Search events…" invalid={!!errors.occurrence_id} disabled={!isNew || superseded} />
          )} />
        </Field>
        <Field label="Line-up" htmlFor="lineup_id" required={scenario === 'official'} error={errors.lineup_id?.message} className="sm:col-span-2"
          hint={occurrenceId ? 'Versions of this occurrence. The version below defaults to the line-up version.' : 'Pick the occurrence first.'}>
          <Controller control={control} name="lineup_id" render={({ field }) => (
            <LookupField id="lineup_id" value={field.value} onChange={(id) => void applyLineup(id)} search={lineups.search} resolve={lineups.resolve} placeholder="Choose a line-up version" invalid={!!errors.lineup_id} disabled={!occurrenceId || superseded} />
          )} />
        </Field>
        <Field label="Place" htmlFor="place_id" error={errors.place_id?.message} hint="Empty = the place of this set was not announced. There is no default to the occurrence's place.">
          <Controller control={control} name="place_id" render={({ field }) => (
            <LookupField id="place_id" value={field.value} onChange={(id) => void applyPlace(id)} search={places.search} resolve={places.resolve} placeholder="Not announced" invalid={!!errors.place_id} disabled={superseded} />
          )} />
        </Field>
        <Field label="Room" htmlFor="place_space_id" error={errors.place_space_id?.message} hint={placeId ? 'Rooms of the chosen place.' : 'Pick the place first. Empty = room not known — the normal case early on.'}>
          <Controller control={control} name="place_space_id" render={({ field }) => (
            <LookupField id="place_space_id" value={field.value} onChange={field.onChange} search={rooms.search} resolve={rooms.resolve} placeholder="Room not known" invalid={!!errors.place_space_id} disabled={!placeId || superseded} />
          )} />
        </Field>
        <Field label="Place role" htmlFor="place_role" error={errors.place_role?.message} hint="main / afterparty / satellite — two venues at once vs. moving on later.">
          <Controller control={control} name="place_role" render={({ field }) => (
            <Select value={field.value || '_none'} onValueChange={(v) => field.onChange(v === '_none' ? '' : v)} disabled={superseded}>
              <SelectTrigger id="place_role"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="_none">—</SelectItem>{PLACE_ROLES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Version" htmlFor="scenario_version" error={errors.scenario_version?.message} hint="Advanced by a publication (the line-up version). Keep it for a correction; raise it for a new announcement.">
          <Input id="scenario_version" inputMode="numeric" {...register('scenario_version')} aria-invalid={!!errors.scenario_version} disabled={superseded} />
        </Field>
      </FormSection>

      <FormSection title="The set" description="Business day and wall-clock times in the place's zone. Both times may stay empty: “till close” and “only the day is known” are real cases.">
        <Field label="Set type" htmlFor="set_type" required error={errors.set_type?.message} hint="group = a block of artists without individual slots. b2b is a set format, never an artist type.">
          <Controller control={control} name="set_type" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={superseded}>
              <SelectTrigger id="set_type"><SelectValue /></SelectTrigger>
              <SelectContent>{SET_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Display name" htmlFor="display_name" error={errors.display_name?.message} hint="How the slot is labelled on the poster, if not just the artists (e.g. a room renamed for the night).">
          <Input id="display_name" {...register('display_name')} disabled={superseded} />
        </Field>
        <Field label="Business day" htmlFor="event_day" error={errors.event_day?.message} hint="A 02:00 set belongs to the previous night. Defaults to the occurrence's day.">
          <Input id="event_day" type="date" {...register('event_day')} aria-invalid={!!errors.event_day} disabled={superseded} />
        </Field>
        <Field label="Time zone" htmlFor="timezone" hint="Follows the place; the times below are read in it.">
          <Input id="timezone" {...register('timezone')} disabled={superseded} />
        </Field>
        <Field label="Starts" htmlFor="scheduled_start" error={errors.scheduled_start?.message}>
          <Input id="scheduled_start" type="datetime-local" {...register('scheduled_start')} aria-invalid={!!errors.scheduled_start} disabled={superseded} />
        </Field>
        <Field label="Ends" htmlFor="scheduled_end" error={errors.scheduled_end?.message} hint="Empty = till close.">
          <Input id="scheduled_end" type="datetime-local" {...register('scheduled_end')} aria-invalid={!!errors.scheduled_end} disabled={superseded} />
        </Field>
        <Field label="Confidence" htmlFor="confidence_score" required={scenario === 'predicted'} error={errors.confidence_score?.message} hint="0 to 1. Required for a prediction — one without a score is not presentable as one.">
          <Input id="confidence_score" inputMode="decimal" {...register('confidence_score')} aria-invalid={!!errors.confidence_score} disabled={superseded} />
        </Field>
        <Field label="Line-up complete?" htmlFor="lineup_complete" hint="Off = “+ more TBA”: a property of the block, not a phantom participant.">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input id="lineup_complete" type="checkbox" className="h-4 w-4 accent-primary" {...register('lineup_complete')} disabled={superseded} />
            all names of this block are known
          </label>
        </Field>
        <Field label="Information origin" htmlFor="information_origin" error={errors.information_origin?.message}>
          <Controller control={control} name="information_origin" render={({ field }) => (
            <Select value={field.value || '_none'} onValueChange={(v) => field.onChange(v === '_none' ? '' : v)} disabled={superseded}>
              <SelectTrigger id="information_origin"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="_none">—</SelectItem>{INFORMATION_ORIGINS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Confirmation" htmlFor="confirmation_status" error={errors.confirmation_status?.message}>
          <Controller control={control} name="confirmation_status" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={superseded}>
              <SelectTrigger id="confirmation_status"><SelectValue /></SelectTrigger>
              <SelectContent>{CONFIRMATION_STATUSES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Status" htmlFor="status" required error={errors.status?.message} hint="For the new row. To cancel this set, use the button above.">
          <Controller control={control} name="status" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={superseded}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>{['draft', 'active', 'cancelled'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" rows={2} {...register('notes')} disabled={superseded} />
        </Field>
      </FormSection>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Participants</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">performance_set_participant</span>
        </div>
        <p className="text-sm text-muted-foreground">
          The normalised truth about who plays; <code>artist_list_json</code> is rebuilt from it on save. One primary for a single set; two rows with role b2b for a
          back-to-back; primary plus featured/guest for a featuring; a placeholder for TBA or a secret guest.
        </p>
        <Controller control={control} name="participants" render={({ field }) => (
          <SlotsEditor value={field.value} onChange={field.onChange} errors={errors.participants as SlotErrors} showRole addLabel="Add participant" disabled={superseded} />
        )} />
        {timezone === '' && (getValues('scheduled_start') || getValues('scheduled_end')) && (
          <p className="text-xs text-amber-700">No time zone: the times are read in your browser's zone. Pick the place, or type the venue's IANA zone above.</p>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><Link to="/sets">Cancel</Link></Button>
        <Button type="submit" disabled={isSubmitting || superseded || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create set' : 'Save as new row'}
        </Button>
      </div>
    </form>
  );
}
