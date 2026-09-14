import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { LookupField } from '@/components/form/LookupField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { TimezoneInput } from '@/components/form/TimezoneInput';
import { eventLookup, placeLookup } from '@/lib/lookups';
import { formatInZone } from '@/lib/datetime';
import { RECORD_STATUSES } from '@/types/database';
import { useCreateOccurrence, useOccurrence, usePlaceTimezone, useUpdateOccurrence } from './api';

const schema = z
  .object({
    event_id: z.string().uuid({ message: 'Choose an event' }),
    primary_place_id: z.string().uuid().nullable(),
    occurrence_name: z.string().trim().max(512),
    timezone: z.string().trim().max(64),
    starts_at: z.string().min(1, 'Start is required'),
    ends_at: z.string().min(1, 'End is required'),
    status: z.enum(RECORD_STATUSES as [string, ...string[]]),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: 'End must be after start',
    path: ['ends_at'],
  });
type Values = z.infer<typeof schema>;

export function OccurrenceFormPage() {
  const { occurrenceId } = useParams<{ occurrenceId: string }>();
  const [searchParams] = useSearchParams();
  const isNew = !occurrenceId;
  const navigate = useNavigate();
  const existing = useOccurrence(occurrenceId);
  const create = useCreateOccurrence();
  const update = useUpdateOccurrence(occurrenceId ?? '');
  const events = useMemo(() => eventLookup(), []);
  const places = useMemo(() => placeLookup(), []);

  const { register, control, handleSubmit, reset, setValue, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      event_id: searchParams.get('event') ?? '',
      primary_place_id: null,
      occurrence_name: '',
      timezone: '',
      starts_at: '',
      ends_at: '',
      status: 'active',
    },
    mode: 'onBlur',
  });

  const placeId = useWatch({ control, name: 'primary_place_id' });
  const timezone = useWatch({ control, name: 'timezone' });
  const startsAt = useWatch({ control, name: 'starts_at' });
  const endsAt = useWatch({ control, name: 'ends_at' });
  const venueTimezone = usePlaceTimezone(placeId);

  useEffect(() => {
    if (existing.data) {
      reset({
        event_id: existing.data.event_id,
        primary_place_id: existing.data.primary_place_id,
        occurrence_name: existing.data.occurrence_name ?? '',
        timezone: existing.data.timezone ?? '',
        starts_at: existing.data.starts_at,
        ends_at: existing.data.ends_at,
        status: existing.data.status,
      });
    }
  }, [existing.data, reset]);

  // A new occurrence inherits the venue's timezone, so times are entered in
  // the zone the night actually happens in.
  useEffect(() => {
    if (isNew && !timezone && venueTimezone.data) {
      setValue('timezone', venueTimezone.data, { shouldDirty: false });
    }
  }, [isNew, timezone, venueTimezone.data, setValue]);

  async function onSubmit(values: Values) {
    const payload = {
      event_id: values.event_id,
      primary_place_id: values.primary_place_id,
      occurrence_name: values.occurrence_name.trim() || null,
      timezone: values.timezone.trim() || null,
      starts_at: values.starts_at,
      ends_at: values.ends_at,
      status: values.status as (typeof RECORD_STATUSES)[number],
    };
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);
        toast.success('Occurrence created');
        navigate(`/occurrences/${created.occurrence_id}`, { replace: true });
      } else {
        await update.mutateAsync(payload);
        toast.success('Occurrence saved');
        reset(values);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isNew && existing.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && existing.isError) return <p className="text-destructive">{(existing.error as Error).message}</p>;

  const zoneLabel = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/occurrences" title="Back to occurrences"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-xl font-semibold">
          {isNew ? 'New occurrence' : existing.data?.occurrence_name || 'Occurrence'}
        </h1>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create occurrence' : 'Save changes'}
        </Button>
      </div>

      <FormSection title="What and where">
        <Field label="Event" htmlFor="event_id" required error={errors.event_id?.message}>
          <Controller control={control} name="event_id" render={({ field }) => (
            <LookupField id="event_id" value={field.value || null} onChange={(id) => field.onChange(id ?? '')}
              search={events.search} resolve={events.resolve} placeholder="Search events…" invalid={!!errors.event_id} />
          )} />
        </Field>
        <Field label="Primary venue" htmlFor="primary_place_id" error={errors.primary_place_id?.message}
          hint="The default place. A set at another venue overrides it individually.">
          <Controller control={control} name="primary_place_id" render={({ field }) => (
            <LookupField id="primary_place_id" value={field.value} onChange={field.onChange}
              search={places.search} resolve={places.resolve} placeholder="Search venues…" />
          )} />
        </Field>
        <Field label="Name" htmlFor="occurrence_name" error={errors.occurrence_name?.message}
          hint="Optional, e.g. “Opening Party” or “Day 2”." className="sm:col-span-2">
          <Input id="occurrence_name" {...register('occurrence_name')} />
        </Field>
      </FormSection>

      <FormSection
        title="When"
        description={`Entered and shown in ${zoneLabel}. A night that runs past midnight ends on the following date.`}
      >
        <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}
          hint={venueTimezone.data && !timezone ? `The venue's zone is ${venueTimezone.data}.` : 'IANA name; defaults to the venue’s.'}>
          <TimezoneInput id="timezone" {...register('timezone')} />
        </Field>
        <div />
        <Field label="Starts" htmlFor="starts_at" required error={errors.starts_at?.message}
          hint={startsAt ? formatInZone(startsAt, timezone) : undefined}>
          <Controller control={control} name="starts_at" render={({ field }) => (
            <DateTimeField id="starts_at" value={field.value || null} onChange={(iso) => field.onChange(iso ?? '')}
              timeZone={timezone} invalid={!!errors.starts_at} />
          )} />
        </Field>
        <Field label="Ends" htmlFor="ends_at" required error={errors.ends_at?.message}
          hint={endsAt ? formatInZone(endsAt, timezone) : undefined}>
          <Controller control={control} name="ends_at" render={({ field }) => (
            <DateTimeField id="ends_at" value={field.value || null} onChange={(iso) => field.onChange(iso ?? '')}
              timeZone={timezone} invalid={!!errors.ends_at} />
          )} />
        </Field>
        <Field label="Status" htmlFor="status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>{RECORD_STATUSES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
      </FormSection>
    </form>
  );
}
