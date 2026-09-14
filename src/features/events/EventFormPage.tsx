import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Field, FormSection } from '@/components/form/Field';
import { StatusBadge } from '@/components/StatusBadge';
import { formatInZone } from '@/lib/datetime';
import { EVENT_TYPES, RECORD_STATUSES } from '@/types/database';
import { useCreateEvent, useEvent, useEventOccurrences, useUpdateEvent } from './api';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(512),
  event_type: z.enum(EVENT_TYPES as [string, ...string[]]),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
});
type Values = z.infer<typeof schema>;

export function EventFormPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const isNew = !eventId;
  const navigate = useNavigate();
  const existing = useEvent(eventId);
  const occurrences = useEventOccurrences(eventId);
  const create = useCreateEvent();
  const update = useUpdateEvent(eventId ?? '');

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', event_type: 'party', status: 'active' },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (existing.data) {
      reset({ name: existing.data.name, event_type: existing.data.event_type, status: existing.data.status });
    }
  }, [existing.data, reset]);

  async function onSubmit(values: Values) {
    const payload = {
      name: values.name.trim(),
      event_type: values.event_type as typeof EVENT_TYPES[number],
      status: values.status as (typeof RECORD_STATUSES)[number],
    };
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);
        toast.success('Event created');
        navigate(`/events/${created.event_id}`, { replace: true });
      } else {
        await update.mutateAsync(payload);
        toast.success('Event saved');
        reset(values);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isNew && existing.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && existing.isError) return <p className="text-destructive">{(existing.error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="icon"><Link to="/events" title="Back to events"><ArrowLeft /></Link></Button>
          <h1 className="mr-auto text-xl font-semibold">{isNew ? 'New event' : existing.data?.name}</h1>
          <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
            {isSubmitting ? 'Saving…' : isNew ? 'Create event' : 'Save changes'}
          </Button>
        </div>

        <FormSection title="Event" description="The reusable brand or concept. Dates and venues belong to its occurrences.">
          <Field label="Name" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
            <Input id="name" {...register('name')} aria-invalid={!!errors.name} autoFocus={isNew} />
          </Field>
          <Field label="Type" htmlFor="event_type" required error={errors.event_type?.message}>
            <Controller control={control} name="event_type" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="event_type"><SelectValue /></SelectTrigger>
                <SelectContent>{EVENT_TYPES.map((v) => <SelectItem key={v} value={v} className="capitalize">{v.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
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

      {!isNew && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <h2 className="mr-auto font-semibold">Occurrences</h2>
            <Button asChild size="sm" variant="outline">
              <Link to={`/occurrences/new?event=${eventId}`}><Plus /> Add occurrence</Link>
            </Button>
          </div>
          {occurrences.data?.length === 0 && <p className="text-sm text-muted-foreground">No dates yet for this event.</p>}
          {occurrences.data && occurrences.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Starts</TableHead><TableHead>Name</TableHead><TableHead>Venue</TableHead><TableHead>Status</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {occurrences.data.map((o) => {
                  const place = o.place as { name: string } | null;
                  return (
                    <TableRow key={o.occurrence_id} className="cursor-pointer" onClick={() => navigate(`/occurrences/${o.occurrence_id}`)}>
                      <TableCell>{formatInZone(o.starts_at, o.timezone)}</TableCell>
                      <TableCell>{o.occurrence_name}</TableCell>
                      <TableCell>{place?.name}</TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}
