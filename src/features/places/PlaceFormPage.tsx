import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { LookupField } from '@/components/form/LookupField';
import { SpacesEditor, type SpaceErrors } from '@/components/form/SpacesEditor';
import { TimezoneInput } from '@/components/form/TimezoneInput';
import { TagsInput } from '@/components/form/TagsInput';
import { PLACE_LIFECYCLE_TYPES, RECORD_STATUSES } from '@/types/enums';
import { emptyPlaceForm, fromRow, placeFormSchema, toPayload, type PlaceFormValues } from './schema';
import { placeLookup, usePlace, useProfileNames, useSavePlace, useTagCounts } from './api';
import { fromDraft } from './agent';
import { useAgent, useGeocode } from '@/agents/client';
import { useDuplicates } from '@/lib/duplicates';
import { DuplicateWarning } from '@/components/form/DuplicateWarning';

import { actualize, keywordsFor, type ActualizedField, type Actualization } from './actualize';
import { AgentPanel } from '@/agents/AgentPanel';
import type { PlaceDraft } from '@/agents/place/schema';

export function PlaceFormPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const isNew = !placeId;
  const navigate = useNavigate();
  const existing = usePlace(placeId);
  const names = useProfileNames();
  const save = useSavePlace();
  const lookup = useMemo(() => placeLookup(placeId), [placeId]);
  const geocoder = useGeocode();
  const tagCounts = useTagCounts();
  const refresher = useAgent<PlaceDraft>('place');
  const [actual, setActual] = useState<Actualization | null>(null);

  // Marks for a scalar field: blue ring + the stored value in red, once the actualization changed it.
  const prev = (key: ActualizedField) => actual?.previous[key];

  const form = useForm<PlaceFormValues>({
    resolver: zodResolver(placeFormSchema),
    defaultValues: emptyPlaceForm,
    mode: 'onBlur',
  });
  const { register, control, handleSubmit, reset, watch, getValues, setValue, formState: { errors, isSubmitting, isDirty } } = form;
  const spaces = watch('spaces');
  // Duplicate guard for a new record: warn on similar names, block Create on the same name until "anyway".
  const nameForDup = watch('name');
  const dup = useDuplicates('place', nameForDup, isNew);
  const [dupAck, setDupAck] = useState(false);
  useEffect(() => { setDupAck(false); }, [nameForDup]);
  const dupBlocked = isNew && !dupAck && (dup.data ?? []).some((m) => m.exact);

  // Fills latitude/longitude from the address fields as they stand in the form.
  async function findCoordinates() {
    const v = getValues();
    if (!v.city.trim() && !v.address.trim()) { toast.error('Enter at least a city or an address first'); return; }
    try {
      const hit = await geocoder.mutateAsync({ name: v.name, address: v.address, city: v.city, region: v.region, country: v.country });
      if (!hit) { toast.warning('Nothing matched on OpenStreetMap'); return; }
      if (hit.approximate) { toast.warning(`Only the city matched (${hit.display_name}) — add a street address for venue coordinates`); return; }
      setValue('latitude', String(hit.latitude), { shouldDirty: true, shouldValidate: true });
      setValue('longitude', String(hit.longitude), { shouldDirty: true, shouldValidate: true });
      toast.success(`Matched “${hit.display_name}” — check it on a map`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  useEffect(() => {
    if (existing.data) { reset(fromRow(existing.data.place, existing.data.spaces)); setActual(null); }
  }, [existing.data, reset]);

  // "AI actualization": research the stored venue again and lay the result
  // over the form as a diff. Nothing is written until Save.
  async function actualizeFromWeb() {
    const current = getValues();
    try {
      const r = await refresher.mutateAsync({ keywords: keywordsFor(current) });
      if (r.outcome !== 'draft' || !r.draft) {
        toast.warning(r.outcome === 'ambiguous' ? 'The agent found several venues for this record — refine name, city or links first' : 'The agent could not identify this venue on the web');
        return;
      }
      const a = actualize(current, r.draft);
      const n = Object.keys(a.previous).length + a.spaces.added + a.spaces.changed + a.spaces.removed;
      setActual(a);
      reset(a.values, { keepDefaultValues: true });
      if (n === 0) toast.success('Up to date — nothing differs from the web');
      else toast.success(`${Object.keys(a.previous).length} field${Object.keys(a.previous).length === 1 ? '' : 's'} changed, rooms: +${a.spaces.added} ~${a.spaces.changed} −${a.spaces.removed}. Review and save.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // One RPC call saves the place and its rooms in one transaction; on any
  // error nothing is written, so the form simply stays dirty.
  async function onSubmit(values: PlaceFormValues) {
    if (dupBlocked) { toast.error('A record with this name already exists — open it, or press "Create anyway"'); return; }
    try {
      const saved = await save.mutateAsync(toPayload(values, placeId ?? null));
      setActual(null);
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
        {!isNew && (
          <Button type="button" variant="secondary" onClick={() => void actualizeFromWeb()} disabled={refresher.isPending || isSubmitting}
            title="Research this venue on the web again and show what differs; nothing is saved until you press Save">
            <RefreshCw className={refresher.isPending ? 'animate-spin' : ''} /> {refresher.isPending ? 'Actualizing…' : 'AI actualization'}
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? (dupBlocked ? 'Same name exists' : 'Create place') : 'Save changes'}
        </Button>
      </div>
      {audit && <p className="text-xs text-muted-foreground">{audit}</p>}
      {actual && (
        <div className="rounded-md border border-blue-300 bg-blue-50/60 p-3 text-sm" role="status">
          <b>Actualization applied to the form.</b> Fields with a blue frame changed — the stored value is shown in red under each. Rooms: {actual.spaces.added} added,
          {' '}{actual.spaces.changed} changed, {actual.spaces.removed} no longer found (deactivated on save unless you keep them). Nothing is written until you press Save.
          <button type="button" className="ml-2 underline" onClick={() => { if (existing.data) { reset(fromRow(existing.data.place, existing.data.spaces)); setActual(null); } }}>Discard</button>
        </div>
      )}

      {isNew && (
        <AgentPanel<PlaceDraft>
          kind="place"
          noun="venue"
          placeholder="Club Space; Miami; https://www.instagram.com/clubspacemiami"
          onDraft={(r) => { reset(fromDraft(r.draft), { keepDefaultValues: true }); }}
        />
      )}

      <FormSection title="Identity">
        <Field label="Name" htmlFor="name" previous={prev('name')} required error={errors.name?.message} className="sm:col-span-2">
          <Input id="name" {...register('name')} aria-invalid={!!errors.name} autoFocus={isNew} />
        </Field>
        {isNew && (dup.data?.length ?? 0) > 0 && (
          <div className="sm:col-span-2">
            <DuplicateWarning matches={dup.data ?? []} noun="venue" blocked={dupBlocked} onCreateAnyway={() => setDupAck(true)} />
          </div>
        )}
        <Field label="Parent place" htmlFor="parent_place_id" hint="For a club inside a hotel, a stage area inside a festival site, etc." error={errors.parent_place_id?.message}>
          <Controller control={control} name="parent_place_id" render={({ field }) => (
            <LookupField id="parent_place_id" value={field.value} onChange={field.onChange} search={lookup.search} resolve={lookup.resolve} placeholder="Search places…" invalid={!!errors.parent_place_id} />
          )} />
        </Field>
        <Field label="Lifecycle" htmlFor="lifecycle_type" previous={prev('lifecycle_type')} required error={errors.lifecycle_type?.message}>
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
        <Field label="Capacity" htmlFor="capacity" previous={prev('capacity')} error={errors.capacity?.message}>
          <Input id="capacity" inputMode="numeric" {...register('capacity')} aria-invalid={!!errors.capacity} />
        </Field>
        <Field label="Tags" htmlFor="tags" className="sm:col-span-2" error={errors.tags?.message}
          hint="Operator vocabulary, several per venue: IBIZA, BIG5 (the five biggest clubs on the island), Tomorrowland (a temporary festival site). Enter adds one; existing tags are suggested.">
          <Controller control={control} name="tags" render={({ field }) => (
            <TagsInput id="tags" value={field.value} onChange={field.onChange} suggestions={(tagCounts.data ?? []).map((t) => t.tag)} invalid={!!errors.tags} />
          )} />
        </Field>
      </FormSection>

      <FormSection title="Location">
        <Field label="Address" htmlFor="address" previous={prev('address')} error={errors.address?.message} className="sm:col-span-2">
          <Textarea id="address" rows={2} {...register('address')} />
        </Field>
        <Field label="City" htmlFor="city" previous={prev('city')} error={errors.city?.message}><Input id="city" {...register('city')} /></Field>
        <Field label="Region" htmlFor="region" previous={prev('region')} error={errors.region?.message}><Input id="region" {...register('region')} /></Field>
        <Field label="Country" htmlFor="country" previous={prev('country')} error={errors.country?.message}><Input id="country" {...register('country')} /></Field>
        <Field label="Timezone" htmlFor="timezone" previous={prev('timezone')} error={errors.timezone?.message} hint="IANA name, e.g. Europe/Madrid">
          <TimezoneInput id="timezone" {...register('timezone')} />
        </Field>
        <Field label="Latitude" htmlFor="latitude" previous={prev('latitude')} error={errors.latitude?.message}>
          <Input id="latitude" inputMode="decimal" {...register('latitude')} aria-invalid={!!errors.latitude} />
        </Field>
        <Field label="Longitude" htmlFor="longitude" previous={prev('longitude')} error={errors.longitude?.message}>
          <div className="flex gap-2">
            <Input id="longitude" inputMode="decimal" {...register('longitude')} aria-invalid={!!errors.longitude} />
            <Button type="button" variant="outline" onClick={() => void findCoordinates()} disabled={geocoder.isPending} title="Look the address up on OpenStreetMap and fill both fields">
              <MapPin /> {geocoder.isPending ? 'Looking up…' : 'Find'}
            </Button>
          </div>
        </Field>
      </FormSection>

      <FormSection title="Links" description="Official web and social presence. Monitored ingestion of these is roadmap; for now they are reference links.">
        <Field label="Website" htmlFor="website_url" previous={prev('website_url')} error={errors.website_url?.message} className="sm:col-span-2">
          <Input id="website_url" type="url" placeholder="https://" {...register('website_url')} aria-invalid={!!errors.website_url} />
        </Field>
        <Field label="Instagram account" htmlFor="instagram_account" previous={prev('instagram_account')} error={errors.instagram_account?.message} hint="Handle without @">
          <Input id="instagram_account" {...register('instagram_account')} aria-invalid={!!errors.instagram_account} />
        </Field>
        <Field label="Instagram URL" htmlFor="instagram_url" previous={prev('instagram_url')} error={errors.instagram_url?.message}>
          <Input id="instagram_url" type="url" placeholder="https://www.instagram.com/…" {...register('instagram_url')} aria-invalid={!!errors.instagram_url} />
        </Field>
        <Field label="Facebook account" htmlFor="facebook_account" previous={prev('facebook_account')} error={errors.facebook_account?.message}>
          <Input id="facebook_account" {...register('facebook_account')} />
        </Field>
        <Field label="Facebook URL" htmlFor="facebook_url" previous={prev('facebook_url')} error={errors.facebook_url?.message}>
          <Input id="facebook_url" type="url" placeholder="https://www.facebook.com/…" {...register('facebook_url')} aria-invalid={!!errors.facebook_url} />
        </Field>
      </FormSection>

      <FormSection title="Publishing pattern" description="How this venue announces things. Free text — these are notes for operators and, later, hints for the Schedule Agent.">
        <Field label="News pattern" htmlFor="news_pattern" previous={prev('news_pattern')} hint="When and where announcements, lineup changes, room updates, cancellations and final timetables appear." className="sm:col-span-2">
          <Textarea id="news_pattern" rows={3} {...register('news_pattern')} />
        </Field>
        <Field label="Lineup pattern" htmlFor="lineup_pattern" previous={prev('lineup_pattern')} hint="Start/end window, day-of-week behaviour, room count, headliner room and timing." className="sm:col-span-2">
          <Textarea id="lineup_pattern" rows={3} {...register('lineup_pattern')} />
        </Field>
      </FormSection>

      <FormSection title="Typical night" description="Prediction hints, not official facts. Day offset is relative to the event date: 0 = same day, 1 = the next morning.">
        <Field label="Party start" htmlFor="typical_party_start_time" previous={prev('typical_party_start_time')} error={errors.typical_party_start_time?.message}>
          <Input id="typical_party_start_time" type="time" {...register('typical_party_start_time')} aria-invalid={!!errors.typical_party_start_time} />
        </Field>
        <Field label="Start day offset" htmlFor="typical_party_start_day_offset" previous={prev('typical_party_start_day_offset')} error={errors.typical_party_start_day_offset?.message}>
          <Input id="typical_party_start_day_offset" inputMode="numeric" {...register('typical_party_start_day_offset')} />
        </Field>
        <Field label="Party end" htmlFor="typical_party_end_time" previous={prev('typical_party_end_time')} error={errors.typical_party_end_time?.message}>
          <Input id="typical_party_end_time" type="time" {...register('typical_party_end_time')} aria-invalid={!!errors.typical_party_end_time} />
        </Field>
        <Field label="End day offset" htmlFor="typical_party_end_day_offset" previous={prev('typical_party_end_day_offset')} error={errors.typical_party_end_day_offset?.message}>
          <Input id="typical_party_end_day_offset" inputMode="numeric" {...register('typical_party_end_day_offset')} />
        </Field>
        <Field label="Headliner start" htmlFor="typical_headliner_start_time" previous={prev('typical_headliner_start_time')} error={errors.typical_headliner_start_time?.message}>
          <Input id="typical_headliner_start_time" type="time" {...register('typical_headliner_start_time')} />
        </Field>
        <Field label="Headliner start day offset" htmlFor="typical_headliner_start_day_offset" previous={prev('typical_headliner_start_day_offset')} error={errors.typical_headliner_start_day_offset?.message}>
          <Input id="typical_headliner_start_day_offset" inputMode="numeric" {...register('typical_headliner_start_day_offset')} />
        </Field>
        <Field label="Headliner end" htmlFor="typical_headliner_end_time" previous={prev('typical_headliner_end_time')} error={errors.typical_headliner_end_time?.message}>
          <Input id="typical_headliner_end_time" type="time" {...register('typical_headliner_end_time')} />
        </Field>
        <Field label="Headliner end day offset" htmlFor="typical_headliner_end_day_offset" previous={prev('typical_headliner_end_day_offset')} error={errors.typical_headliner_end_day_offset?.message}>
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
        <Field label="Confidence score" htmlFor="lineup_pattern_confidence_score" previous={prev('lineup_pattern_confidence_score')} error={errors.lineup_pattern_confidence_score?.message} hint="0 to 1">
          <Input id="lineup_pattern_confidence_score" inputMode="decimal" {...register('lineup_pattern_confidence_score')} aria-invalid={!!errors.lineup_pattern_confidence_score} />
        </Field>
        <Field label="Sample size" htmlFor="lineup_pattern_sample_size" previous={prev('lineup_pattern_sample_size')} error={errors.lineup_pattern_sample_size?.message} hint="How many nights the pattern is based on">
          <Input id="lineup_pattern_sample_size" inputMode="numeric" {...register('lineup_pattern_sample_size')} />
        </Field>
        <Field label="Notes" htmlFor="lineup_pattern_notes" previous={prev('lineup_pattern_notes')} className="sm:col-span-2">
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
