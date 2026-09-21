import { useEffect, useState } from 'react';
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
import { RECORD_STATUSES } from '@/types/enums';
import { EVENT_TYPES, emptyEventForm, eventFormSchema, fromRow, toPayload, type EventFormValues } from './schema';
import { useEvent, useSaveEvent } from './api';
import { OccurrencesEditor, type OccurrenceErrors } from './OccurrencesEditor';
import { AgentPanel } from '@/agents/AgentPanel';
import { useDuplicates } from '@/lib/duplicates';
import { DuplicateWarning } from '@/components/form/DuplicateWarning';

import type { EventDraft } from '@/agents/event/schema';
import { fromDraft } from './agent';

export function EventFormPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const isNew = !eventId;
  const navigate = useNavigate();
  const existing = useEvent(eventId);
  const save = useSaveEvent();

  const form = useForm<EventFormValues>({ resolver: zodResolver(eventFormSchema), defaultValues: emptyEventForm, mode: 'onBlur' });
  const { register, control, handleSubmit, reset, watch, formState: { errors, isSubmitting, isDirty } } = form;
  const occurrences = watch('occurrences');
  const eventName = watch('name');
  // Duplicate guard for a new record: warn on similar names, block Create on the same name until "anyway".
  const nameForDup = eventName;
  const dup = useDuplicates('event', nameForDup, isNew);
  const [dupAck, setDupAck] = useState(false);
  useEffect(() => { setDupAck(false); }, [nameForDup]);
  const dupBlocked = isNew && !dupAck && (dup.data ?? []).some((m) => m.exact);


  useEffect(() => {
    if (existing.data) reset(fromRow(existing.data.event, existing.data.occurrences));
  }, [existing.data, reset]);

  async function onSubmit(values: EventFormValues) {
    if (dupBlocked) { toast.error('A record with this name already exists — open it, or press "Create anyway"'); return; }
    try {
      const saved = await save.mutateAsync(toPayload(values, eventId ?? null));
      if (isNew) {
        toast.success('Event created');
        navigate(`/events/${saved.event_id}`, { replace: true });
      } else {
        toast.success('Event saved');
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isNew && existing.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && existing.isError) return <p className="text-destructive">{(existing.error as Error).message}</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/events" title="Back to events"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-[23px] font-semibold tracking-[-0.4px]">{isNew ? 'New event' : existing.data?.event.name}</h1>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create event' : 'Save changes'}
        </Button>
      </div>

      {isNew && (
        <AgentPanel<EventDraft>
          kind="event"
          noun="event brand"
          placeholder="Circoloco; Ibiza; https://www.instagram.com/circolocoibiza"
          onDraft={async (r) => {
            const m = await fromDraft(r.draft);
            reset(m.values, { keepDefaultValues: true });
            return (
              <p className="text-xs text-muted-foreground">
                {r.draft.occurrences.length} date{r.draft.occurrences.length === 1 ? '' : 's'} announced.{' '}
                {m.matchedPlaces.length > 0 && <>Venues matched to stored places: <b>{m.matchedPlaces.join(', ')}</b>. </>}
                {m.newPlaces.length > 0 && <>Not in Places yet, created on save and tagged <code>{r.draft.event.name}</code>: <b>{m.newPlaces.join(', ')}</b>. </>}
                Times not announced were set to 23:00–06:00; check each row.
                {r.draft.instagram_url && <> Instagram: <a href={r.draft.instagram_url} target="_blank" rel="noreferrer" className="underline">{r.draft.instagram_url}</a></>}
              </p>
            );
          }}
        />
      )}

      <FormSection title="Event brand" description="A reusable brand or concept — Circoloco, Music On, a festival. Created once; each date is an occurrence below.">
        <Field label="Name" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
          <Input id="name" {...register('name')} aria-invalid={!!errors.name} autoFocus={isNew} />
        </Field>
        {isNew && (dup.data?.length ?? 0) > 0 && (
          <div className="sm:col-span-2">
            <DuplicateWarning matches={dup.data ?? []} noun="event" blocked={dupBlocked} onCreateAnyway={() => setDupAck(true)} />
          </div>
        )}
        <Field label="Type" htmlFor="event_type" required error={errors.event_type?.message}>
          <Controller control={control} name="event_type" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="event_type"><SelectValue /></SelectTrigger>
              <SelectContent>{EVENT_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
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
        <Field label="Website" htmlFor="website_url" error={errors.website_url?.message} className="sm:col-span-2">
          <Input id="website_url" type="url" placeholder="https://" {...register('website_url')} aria-invalid={!!errors.website_url} />
        </Field>
        <Field label="Description" htmlFor="description" error={errors.description?.message} className="sm:col-span-2">
          <Textarea id="description" rows={3} {...register('description')} />
        </Field>
      </FormSection>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Occurrences</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">event_occurrence</span>
        </div>
        <p className="text-sm text-muted-foreground">
          The <b>start day</b> is the business day — the night of the event, not the calendar date of the close: a party from 23:00 Friday to
          08:00 Saturday starts Friday and ends Saturday. A festival ends days later. Times are wall clock in the default place's time zone.
        </p>
        <Controller control={control} name="occurrences" render={({ field }) => (
          <OccurrencesEditor value={field.value} onChange={field.onChange} errors={errors.occurrences as OccurrenceErrors} eventName={eventName} />
        )} />
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <b>The default place is not the place of a set.</b> If an event runs in two venues, a line-up published without saying
          who plays where is stored as <b>one</b> record with an empty <code>place_id</code> — never one copy per venue.
          Dates: <span className="font-mono text-foreground">{occurrences.length}</span> · a removed date is deactivated, not deleted;
          the save is refused while a schedule or release refers to it — cancel it instead.
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><Link to="/events">Cancel</Link></Button>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create event' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
