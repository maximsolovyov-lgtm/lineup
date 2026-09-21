import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { LookupField } from '@/components/form/LookupField';
import { SlotsEditor, type SlotErrors } from '@/components/form/SlotsEditor';
import { StatusBadge } from '@/components/StatusBadge';
import { occurrenceLookup, placeLookup } from '@/lib/lookups';
import { RECORD_STATUSES } from '@/types/enums';
import { emptyLineupForm, fromRow, lineupFormSchema, toPayload, type LineupFormValues } from './schema';
import { useLineup, useLineupVersions, useSaveLineup, fetchLineupForClone } from './api';

export function LineupFormPage() {
  const { lineupId } = useParams<{ lineupId: string }>();
  const [params] = useSearchParams();
  const isNew = !lineupId;
  const [clonedFrom, setClonedFrom] = useState<{ id: string; version: number } | null>(null);
  const navigate = useNavigate();
  const existing = useLineup(lineupId);
  const save = useSaveLineup();
  const occurrences = useMemo(() => occurrenceLookup(), []);
  const places = useMemo(() => placeLookup(), []);

  const form = useForm<LineupFormValues>({ resolver: zodResolver(lineupFormSchema), defaultValues: emptyLineupForm, mode: 'onBlur' });
  const { register, control, handleSubmit, reset, watch, getValues, formState: { errors, isSubmitting, isDirty } } = form;
  const occurrenceId = watch('occurrence_id');
  const placeId = watch('place_id');
  const versions = useLineupVersions(occurrenceId || undefined, placeId);

  useEffect(() => {
    if (existing.data) reset(fromRow(existing.data.lineup, existing.data.artists));
  }, [existing.data, reset]);

  // Arriving from the finder: the occurrence and place are known, and with
  // ?from=<lineup> the previous version's artists become the starting point
  // of the next one (their ids dropped — new rows for a new publication).
  useEffect(() => {
    if (!isNew) return;
    const occurrence = params.get('occurrence');
    const place = params.get('place');
    const from = params.get('from');
    if (!occurrence && !from) return;
    (async () => {
      let values = { ...emptyLineupForm, occurrence_id: occurrence ?? '', place_id: place };
      if (from) {
        const src = await fetchLineupForClone(from);
        if (src) {
          values = { ...values, occurrence_id: src.lineup.occurrence_id, place_id: src.lineup.place_id,
            artists: fromRow(src.lineup, src.artists).artists.map((a) => ({ ...a, id: null })) };
          setClonedFrom({ id: from, version: src.lineup.version });
        }
      }
      reset(values, { keepDefaultValues: true });
    })().catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, params]);

  async function onSubmit(values: LineupFormValues) {
    try {
      const saved = await save.mutateAsync(toPayload(values, lineupId ?? null));
      if (isNew) {
        toast.success('Line-up published');
        navigate(`/lineups/${saved.lineup_id}`, { replace: true });
      } else {
        toast.success('Line-up saved');
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // A new publication of the same (occurrence, place): the current form
  // content becomes the next version; this version stays as it was.
  async function publishAsNewVersion() {
    const ok = await form.trigger();
    if (!ok) return;
    try {
      const saved = await save.mutateAsync(toPayload(getValues(), lineupId ?? null, true));
      toast.success('New version published');
      navigate(`/lineups/${saved.lineup_id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isNew && existing.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && existing.isError) return <p className="text-destructive">{(existing.error as Error).message}</p>;

  const row = existing.data?.lineup;
  const title = isNew ? 'New line-up' : `${row?.event_occurrence?.event?.name ?? 'Line-up'} · ${row?.event_occurrence?.event_date ?? ''} · v${row?.version}`;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/lineups" title="Back to line-ups"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-[23px] font-semibold tracking-[-0.4px]">{title}</h1>
        {!isNew && (
          <Button type="button" variant="secondary" onClick={() => void publishAsNewVersion()} disabled={isSubmitting} title="Save the current content as the next version; this version stays unchanged">
            <Copy /> Publish as new version
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Publish line-up' : 'Save corrections'}
        </Button>
      </div>

      <FormSection title="Publication" description="An official announcement: who plays at this date. A new announcement is a new version; saving here corrects this version in place.">
        <Field label="Occurrence" htmlFor="occurrence_id" required error={errors.occurrence_id?.message} className="sm:col-span-2" hint="Event and business day this line-up is for.">
          <Controller control={control} name="occurrence_id" render={({ field }) => (
            <LookupField id="occurrence_id" value={field.value || null} onChange={(id) => field.onChange(id ?? '')} search={occurrences.search} resolve={occurrences.resolve} placeholder="Search events…" invalid={!!errors.occurrence_id} disabled={!isNew} />
          )} />
        </Field>
        <Field label="Place" htmlFor="place_id" error={errors.place_id?.message} className="sm:col-span-2"
          hint="Leave empty when the announcement did not say where. A multi-venue line-up published without attribution is ONE line-up with no place — never one copy per venue.">
          <Controller control={control} name="place_id" render={({ field }) => (
            <LookupField id="place_id" value={field.value} onChange={field.onChange} search={places.search} resolve={places.resolve} placeholder="Not announced" invalid={!!errors.place_id} />
          )} />
        </Field>
        <Field label="Version" htmlFor="version" error={errors.version?.message} hint={isNew ? 'Empty = next version for this occurrence and place.' : 'Change only to renumber; a new announcement is “Publish as new version”.'}>
          <Input id="version" inputMode="numeric" placeholder={versions.data ? String((versions.data.at(-1)?.version ?? 0) + 1) : ''} {...register('version')} aria-invalid={!!errors.version} />
        </Field>
        <Field label="Published at" htmlFor="published_at" error={errors.published_at?.message} hint="When the announcement went out.">
          <Input id="published_at" type="datetime-local" {...register('published_at')} aria-invalid={!!errors.published_at} />
        </Field>
        <Field label="Status" htmlFor="status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>{RECORD_STATUSES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2" hint="Where the announcement was seen; what changed against the previous version.">
          <Textarea id="notes" rows={2} {...register('notes')} />
        </Field>
        {isNew && versions.data && versions.data.length > 0 && (
          <div className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            <b>A line-up already exists</b> for this occurrence{placeId ? ' and place' : ' (place not announced)'}:{' '}
            {versions.data.map((v, i) => (
              <span key={v.lineup_id}>{i > 0 && ', '}<Link to={`/lineups/${v.lineup_id}`} className="underline">v{v.version}</Link>{v.status !== 'active' && ` (${v.status})`}</span>
            ))}
            . Publishing creates <b>v{(versions.data.at(-1)?.version ?? 0) + 1}</b>
            {clonedFrom ? <> starting from v{clonedFrom.version}</> : null}
            ; to correct an existing version instead, open it.
          </div>
        )}
        {!isNew && versions.data && versions.data.length > 0 && (
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">
              Versions for this occurrence{placeId ? '' : ' (place not announced)'}:{' '}
              {versions.data.map((v, i) => (
                <span key={v.lineup_id}>
                  {i > 0 && ' · '}
                  {v.lineup_id === lineupId ? <b>v{v.version}</b> : <Link to={`/lineups/${v.lineup_id}`} className="underline">v{v.version}</Link>}
                  {v.status !== 'active' && <span className="text-muted-foreground"> ({v.status})</span>}
                </span>
              ))}
            </p>
          </div>
        )}
      </FormSection>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Artists</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">lineup_artist</span>
        </div>
        <p className="text-sm text-muted-foreground">
          In billing order. <b>TBA</b> is a slot nobody has a name for yet — it may vanish, that is normal. <b>Secret guest</b> is a slot the organiser
          deliberately withholds — it is guaranteed, and its disappearance is worth a review. When a secret guest is revealed, set the kind to
          <b> Revealed guest</b> and pick the artist: the placeholder is kept so the badge stays.
        </p>
        <Controller control={control} name="artists" render={({ field }) => (
          <SlotsEditor value={field.value} onChange={field.onChange} errors={errors.artists as SlotErrors} addLabel="Add artist" />
        )} />
      </section>

      {!isNew && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Sets of this version</h2>
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">performance_set</span>
            <span className="flex-1" />
            <Button asChild variant="outline" size="sm"><Link to={`/sets/new?lineup=${lineupId}`}>Add set</Link></Button>
          </div>
          {(existing.data?.sets ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No sets yet. The timeline of who plays when is entered on the Sets tab.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {existing.data!.sets.map((s) => (
                <li key={s.performance_set_id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <Link to={`/sets/${s.performance_set_id}`} className="font-medium underline-offset-2 hover:underline">
                    {(s.artist_list_json as { name: string }[] | null)?.map((a) => a.name).join(', ') || s.set_type}
                  </Link>
                  <span className="text-xs text-muted-foreground">{s.set_type} · {s.scenario_type}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{s.scheduled_start_at ? new Date(s.scheduled_start_at).toLocaleString() : 'no time'}</span>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><Link to="/lineups">Cancel</Link></Button>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Publish line-up' : 'Save corrections'}
        </Button>
      </div>
    </form>
  );
}
