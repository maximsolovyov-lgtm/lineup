import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { LookupField } from '@/components/form/LookupField';
import { SpacesEditor, type SpaceErrors } from '@/components/form/SpacesEditor';
import { TimezoneInput } from '@/components/form/TimezoneInput';
import { PLACE_LIFECYCLE_TYPES, RECORD_STATUSES } from '@/types/enums';
import { emptyPlaceForm, fromRow, placeFormSchema, toPayload, type PlaceFormValues } from './schema';
import { placeLookup, usePlace, useProfileNames, useSavePlace } from './api';
import { fromDraft, useDraftPlace } from './agent';
import type { PlaceDraft } from '@/agents/place/schema';

export function PlaceFormPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const isNew = !placeId;
  const navigate = useNavigate();
  const existing = usePlace(placeId);
  const names = useProfileNames();
  const save = useSavePlace();
  const lookup = useMemo(() => placeLookup(placeId), [placeId]);
  const agent = useDraftPlace();
  const [keywords, setKeywords] = useState('');
  const [draft, setDraft] = useState<PlaceDraft | null>(null);

  const form = useForm<PlaceFormValues>({
    resolver: zodResolver(placeFormSchema),
    defaultValues: emptyPlaceForm,
    mode: 'onBlur',
  });
  const { register, control, handleSubmit, reset, watch, formState: { errors, isSubmitting, isDirty } } = form;
  const spaces = watch('spaces');

  useEffect(() => {
    if (existing.data) reset(fromRow(existing.data.place, existing.data.spaces));
  }, [existing.data, reset]);

  // The agent fills the form; nothing is saved until the operator reviews
  // the draft and presses Create. keepDefaultValues keeps the form dirty.
  async function fillFromKeywords() {
    if (keywords.trim().length < 2) return;
    try {
      const result = await agent.mutateAsync(keywords);
      setDraft(result.draft);
      reset(fromDraft(result.draft), { keepDefaultValues: true });
      if (result.draft.matched) toast.success(`Draft filled from ${result.draft.sources.length} source${result.draft.sources.length === 1 ? '' : 's'} — review before creating`);
      else toast.warning('The keywords did not identify one venue — only what is certain was filled');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // One RPC call saves the place and its rooms in one transaction; on any
  // error nothing is written, so the form simply stays dirty.
  async function onSubmit(values: PlaceFormValues) {
    try {
      const saved = await save.mutateAsync(toPayload(values, placeId ?? null));
      if (isNew) {
        toast.success('Place created');
        navigate(`/places/${saved.place_id}`, { replace: true });
      } else {
        toast.success('Place saved');
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isNew && existing.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && existing.isError) return <p className="text-destructive">{(existing.error as Error).message}</p>;

  const row = existing.data?.place;
  const audit = row
    ? `Created ${new Date(row.created_at).toLocaleString()} by ${names.data?.get(row.created_by_user_id ?? '') ?? '—'}` +
      (row.updated_at ? ` · Updated ${new Date(row.updated_at).toLocaleString()} by ${names.data?.get(row.updated_by_user_id ?? '') ?? '—'}` : '')
    : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/places" title="Back to places"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-[23px] font-semibold tracking-[-0.4px]">{isNew ? 'New place' : row?.name}</h1>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create place' : 'Save changes'}
        </Button>
      </div>
      {audit && <p className="text-xs text-muted-foreground">{audit}</p>}

      {isNew && (
        <section className="space-y-3 rounded-xl border border-[#C9BCE6] bg-secondary/40 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-secondary-foreground">Create from keywords</h2>
            <span className="rounded-full bg-card px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">place agent</span>
          </div>
          <p className="text-sm text-muted-foreground">
            A venue name, a city, an Instagram profile or a website — several keywords separated by <code>;</code>.
            The agent researches the venue on the web and fills every field below, including rooms. Nothing is saved until you press Create.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Keywords"
              placeholder="Club Space; Miami; https://www.instagram.com/clubspacemiami"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void fillFromKeywords(); } }}
              disabled={agent.isPending}
              className="h-11 bg-card"
            />
            <Button type="button" size="lg" onClick={() => void fillFromKeywords()} disabled={agent.isPending || keywords.trim().length < 2}>
              <Sparkles /> {agent.isPending ? 'Researching…' : 'Fill the form'}
            </Button>
          </div>
          {agent.isPending && <p className="text-xs text-muted-foreground">Searching the web and reading the venue's pages — usually 20–60 seconds.</p>}
          {draft && (
            <div className={draft.matched ? 'space-y-1 rounded-md border bg-card p-3 text-sm' : 'space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm'} role="status">
              <div>
                <b>{draft.matched ? 'Venue identified' : 'Venue not identified with certainty'}</b>
                {' · '}confidence <span className="font-mono">{Math.round(draft.confidence * 100)}%</span>
              </div>
              {draft.notes && <p className="text-muted-foreground">{draft.notes}</p>}
              {draft.sources.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sources: {draft.sources.map((u, i) => (
                    <span key={u}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noreferrer" className="underline">{hostnameOf(u)}</a></span>
                  ))}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <FormSection title="Identity">
        <Field label="Name" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
          <Input id="name" {...register('name')} aria-invalid={!!errors.name} autoFocus={isNew} />
        </Field>
        <Field label="Parent place" htmlFor="parent_place_id" hint="For a club inside a hotel, a stage area inside a festival site, etc." error={errors.parent_place_id?.message}>
          <Controller control={control} name="parent_place_id" render={({ field }) => (
            <LookupField id="parent_place_id" value={field.value} onChange={field.onChange} search={lookup.search} resolve={lookup.resolve} placeholder="Search places…" invalid={!!errors.parent_place_id} />
          )} />
        </Field>
        <Field label="Lifecycle" htmlFor="lifecycle_type" required error={errors.lifecycle_type?.message}>
          <Controller control={control} name="lifecycle_type" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="lifecycle_type"><SelectValue /></SelectTrigger>
              <SelectContent>{PLACE_LIFECYCLE_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Status" htmlFor="status" required error={errors.status?.message} hint="Deactivate by setting inactive or closed; records are never deleted.">
          <Controller control={control} name="status" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>{RECORD_STATUSES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Capacity" htmlFor="capacity" error={errors.capacity?.message}>
          <Input id="capacity" inputMode="numeric" {...register('capacity')} aria-invalid={!!errors.capacity} />
        </Field>
      </FormSection>

      <FormSection title="Location">
        <Field label="Address" htmlFor="address" error={errors.address?.message} className="sm:col-span-2">
          <Textarea id="address" rows={2} {...register('address')} />
        </Field>
        <Field label="City" htmlFor="city" error={errors.city?.message}><Input id="city" {...register('city')} /></Field>
        <Field label="Region" htmlFor="region" error={errors.region?.message}><Input id="region" {...register('region')} /></Field>
        <Field label="Country" htmlFor="country" error={errors.country?.message}><Input id="country" {...register('country')} /></Field>
        <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message} hint="IANA name, e.g. Europe/Madrid">
          <TimezoneInput id="timezone" {...register('timezone')} />
        </Field>
        <Field label="Latitude" htmlFor="latitude" error={errors.latitude?.message}>
          <Input id="latitude" inputMode="decimal" {...register('latitude')} aria-invalid={!!errors.latitude} />
        </Field>
        <Field label="Longitude" htmlFor="longitude" error={errors.longitude?.message}>
          <Input id="longitude" inputMode="decimal" {...register('longitude')} aria-invalid={!!errors.longitude} />
        </Field>
      </FormSection>

      <FormSection title="Links" description="Official web and social presence. Monitored ingestion of these is roadmap; for now they are reference links.">
        <Field label="Website" htmlFor="website_url" error={errors.website_url?.message} className="sm:col-span-2">
          <Input id="website_url" type="url" placeholder="https://" {...register('website_url')} aria-invalid={!!errors.website_url} />
        </Field>
        <Field label="Instagram account" htmlFor="instagram_account" error={errors.instagram_account?.message} hint="Handle without @">
          <Input id="instagram_account" {...register('instagram_account')} aria-invalid={!!errors.instagram_account} />
        </Field>
        <Field label="Instagram URL" htmlFor="instagram_url" error={errors.instagram_url?.message}>
          <Input id="instagram_url" type="url" placeholder="https://www.instagram.com/…" {...register('instagram_url')} aria-invalid={!!errors.instagram_url} />
        </Field>
        <Field label="Facebook account" htmlFor="facebook_account" error={errors.facebook_account?.message}>
          <Input id="facebook_account" {...register('facebook_account')} />
        </Field>
        <Field label="Facebook URL" htmlFor="facebook_url" error={errors.facebook_url?.message}>
          <Input id="facebook_url" type="url" placeholder="https://www.facebook.com/…" {...register('facebook_url')} aria-invalid={!!errors.facebook_url} />
        </Field>
      </FormSection>

      <FormSection title="Publishing pattern" description="How this venue announces things. Free text — these are notes for operators and, later, hints for the Schedule Agent.">
        <Field label="News pattern" htmlFor="news_pattern" hint="When and where announcements, lineup changes, room updates, cancellations and final timetables appear." className="sm:col-span-2">
          <Textarea id="news_pattern" rows={3} {...register('news_pattern')} />
        </Field>
        <Field label="Lineup pattern" htmlFor="lineup_pattern" hint="Start/end window, day-of-week behaviour, room count, headliner room and timing." className="sm:col-span-2">
          <Textarea id="lineup_pattern" rows={3} {...register('lineup_pattern')} />
        </Field>
      </FormSection>

      <FormSection title="Typical night" description="Prediction hints, not official facts. Day offset is relative to the event date: 0 = same day, 1 = the next morning.">
        <Field label="Party start" htmlFor="typical_party_start_time" error={errors.typical_party_start_time?.message}>
          <Input id="typical_party_start_time" type="time" {...register('typical_party_start_time')} aria-invalid={!!errors.typical_party_start_time} />
        </Field>
        <Field label="Start day offset" htmlFor="typical_party_start_day_offset" error={errors.typical_party_start_day_offset?.message}>
          <Input id="typical_party_start_day_offset" inputMode="numeric" {...register('typical_party_start_day_offset')} />
        </Field>
        <Field label="Party end" htmlFor="typical_party_end_time" error={errors.typical_party_end_time?.message}>
          <Input id="typical_party_end_time" type="time" {...register('typical_party_end_time')} aria-invalid={!!errors.typical_party_end_time} />
        </Field>
        <Field label="End day offset" htmlFor="typical_party_end_day_offset" error={errors.typical_party_end_day_offset?.message}>
          <Input id="typical_party_end_day_offset" inputMode="numeric" {...register('typical_party_end_day_offset')} />
        </Field>
        <Field label="Headliner start" htmlFor="typical_headliner_start_time" error={errors.typical_headliner_start_time?.message}>
          <Input id="typical_headliner_start_time" type="time" {...register('typical_headliner_start_time')} />
        </Field>
        <Field label="Headliner start day offset" htmlFor="typical_headliner_start_day_offset" error={errors.typical_headliner_start_day_offset?.message}>
          <Input id="typical_headliner_start_day_offset" inputMode="numeric" {...register('typical_headliner_start_day_offset')} />
        </Field>
        <Field label="Headliner end" htmlFor="typical_headliner_end_time" error={errors.typical_headliner_end_time?.message}>
          <Input id="typical_headliner_end_time" type="time" {...register('typical_headliner_end_time')} />
        </Field>
        <Field label="Headliner end day offset" htmlFor="typical_headliner_end_day_offset" error={errors.typical_headliner_end_day_offset?.message}>
          <Input id="typical_headliner_end_day_offset" inputMode="numeric" {...register('typical_headliner_end_day_offset')} />
        </Field>
      </FormSection>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Rooms and stages</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">place_space</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Rooms are edited together with the place and saved in one transaction. The primary room is
          the venue's main room; it is used as a hint when predicting headliner timing.
        </p>
        <Controller control={control} name="spaces" render={({ field }) => (
          <SpacesEditor value={field.value} onChange={field.onChange} errors={errors.spaces as SpaceErrors} />
        )} />
        <p className="text-xs text-muted-foreground">
          Rooms: <span className="font-mono text-foreground">{spaces.length}</span>
          {' · '}a removed room is deactivated, not deleted, and the save is refused while a performance set still refers to it.
        </p>
      </section>

      <FormSection title="Pattern confidence">
        <Field label="Confidence score" htmlFor="lineup_pattern_confidence_score" error={errors.lineup_pattern_confidence_score?.message} hint="0 to 1">
          <Input id="lineup_pattern_confidence_score" inputMode="decimal" {...register('lineup_pattern_confidence_score')} aria-invalid={!!errors.lineup_pattern_confidence_score} />
        </Field>
        <Field label="Sample size" htmlFor="lineup_pattern_sample_size" error={errors.lineup_pattern_sample_size?.message} hint="How many nights the pattern is based on">
          <Input id="lineup_pattern_sample_size" inputMode="numeric" {...register('lineup_pattern_sample_size')} />
        </Field>
        <Field label="Notes" htmlFor="lineup_pattern_notes" className="sm:col-span-2">
          <Textarea id="lineup_pattern_notes" rows={2} {...register('lineup_pattern_notes')} />
        </Field>
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><Link to="/places">Cancel</Link></Button>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create place' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

/** Hostname for a source link; the raw string if the agent returned something that is not a URL. */
function hostnameOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}
