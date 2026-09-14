import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { LookupField } from '@/components/form/LookupField';
import { RoomsEditor, type RoomErrors } from '@/components/form/RoomsEditor';
import { TimezoneInput } from '@/components/form/TimezoneInput';
import { PLACE_LIFECYCLE_TYPES, RECORD_STATUSES } from '@/types/database';
import { emptyPlaceForm, fromRow, placeFormSchema, toPayload, type PlaceFormValues } from './schema';
import { placeLookup, useCreatePlace, usePlace, useProfileNames, useUpdatePlace } from './api';

export function PlaceFormPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const isNew = !placeId;
  const navigate = useNavigate();
  const existing = usePlace(placeId);
  const names = useProfileNames();
  const create = useCreatePlace();
  const update = useUpdatePlace(placeId ?? '');
  const lookup = useMemo(() => placeLookup(placeId), [placeId]);

  const form = useForm<PlaceFormValues>({
    resolver: zodResolver(placeFormSchema),
    defaultValues: emptyPlaceForm,
    mode: 'onBlur',
  });
  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = form;

  useEffect(() => {
    if (existing.data) reset(fromRow(existing.data));
  }, [existing.data, reset]);

  async function onSubmit(values: PlaceFormValues) {
    const payload = toPayload(values);
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);
        toast.success('Place created');
        navigate(`/places/${created.place_id}`, { replace: true });
      } else {
        await update.mutateAsync(payload);
        toast.success('Place saved');
        reset(values);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isNew && existing.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && existing.isError) return <p className="text-destructive">{(existing.error as Error).message}</p>;

  const row = existing.data;
  const audit = row
    ? `Created ${new Date(row.created_at).toLocaleString()} by ${names.data?.get(row.created_by_user_id ?? '') ?? '—'}` +
      (row.updated_at ? ` · Updated ${new Date(row.updated_at).toLocaleString()} by ${names.data?.get(row.updated_by_user_id ?? '') ?? '—'}` : '')
    : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/places" title="Back to places"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-xl font-semibold">{isNew ? 'New place' : row?.name}</h1>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create place' : 'Save changes'}
        </Button>
      </div>
      {audit && <p className="text-xs text-muted-foreground">{audit}</p>}

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
        <Field label="Headliner room" htmlFor="typical_headliner_room_name" error={errors.typical_headliner_room_name?.message}>
          <Input id="typical_headliner_room_name" {...register('typical_headliner_room_name')} />
        </Field>
        <div />
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

      <FormSection title="Rooms" description="Known rooms and stages. Room count is derived from this list when it is filled in.">
        <div className="sm:col-span-2">
          <Controller control={control} name="typical_rooms" render={({ field }) => (
            <RoomsEditor value={field.value} onChange={field.onChange} errors={errors.typical_rooms as RoomErrors} />
          )} />
        </div>
        <Field label="Room count (if rooms above are unknown)" htmlFor="typical_room_count" error={errors.typical_room_count?.message}>
          <Input id="typical_room_count" inputMode="numeric" {...register('typical_room_count')} />
        </Field>
      </FormSection>

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
