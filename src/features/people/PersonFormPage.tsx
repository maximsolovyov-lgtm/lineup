import { useEffect } from 'react';
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
import { StatusBadge } from '@/components/StatusBadge';
import { RECORD_STATUSES } from '@/types/enums';
import { emptyPersonForm, fromRow, personFormSchema, toPayload, type PersonFormValues } from './schema';
import { usePerson, useSavePerson } from './api';
import { AgentPanel } from '@/agents/AgentPanel';
import type { PersonDraft } from '@/agents/person/schema';

export function PersonFormPage() {
  const { personId } = useParams<{ personId: string }>();
  const isNew = !personId;
  const navigate = useNavigate();
  const existing = usePerson(personId);
  const save = useSavePerson(personId);

  const form = useForm<PersonFormValues>({ resolver: zodResolver(personFormSchema), defaultValues: emptyPersonForm, mode: 'onBlur' });
  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = form;

  useEffect(() => {
    if (existing.data) reset(fromRow(existing.data.person));
  }, [existing.data, reset]);

  async function onSubmit(values: PersonFormValues) {
    try {
      const saved = await save.mutateAsync(toPayload(values));
      if (isNew) {
        toast.success('Person created');
        navigate(`/people/${saved.person_id}`, { replace: true });
      } else {
        toast.success('Person saved');
        reset(values);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isNew && existing.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && existing.isError) return <p className="text-destructive">{(existing.error as Error).message}</p>;

  const memberships = existing.data?.memberships ?? [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/people" title="Back to people"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-[23px] font-semibold tracking-[-0.4px]">{isNew ? 'New person' : existing.data?.person.display_name}</h1>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create person' : 'Save changes'}
        </Button>
      </div>

      {isNew && (
        <AgentPanel<PersonDraft>
          kind="person"
          noun="person"
          placeholder="Adam Port; Keinemusik; https://www.instagram.com/adamport"
          onDraft={(r) => {
            const d = r.draft;
            const acts = d.performs_as.map((a) => `${a.artist_name} (${a.artist_type}${a.role ? `, ${a.role}` : ''}${a.started_at ? `, since ${a.started_at.slice(0, 4)}` : ''}${a.ended_at ? ` until ${a.ended_at.slice(0, 4)}` : ''})`);
            reset({
              display_name: d.person.display_name,
              country: d.person.country ?? '',
              notes: [d.person.notes ?? '', acts.length ? `Performs as: ${acts.join('; ')}.` : ''].filter(Boolean).join('\n'),
              status: 'active',
            }, { keepDefaultValues: true });
            return acts.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Performs as: <b>{d.performs_as.map((a) => a.artist_name).join(', ')}</b> — memberships are added on each artist record; the list is kept in the note.
              </p>
            ) : null;
          }}
        />
      )}

      <FormSection title="Person">
        <Field label="Public name" htmlFor="display_name" required error={errors.display_name?.message} className="sm:col-span-2"
          hint="The name this person is publicly known by. Legal or birth names are not stored unless the artist has published them.">
          <Input id="display_name" {...register('display_name')} aria-invalid={!!errors.display_name} autoFocus={isNew} />
        </Field>
        <Field label="Country" htmlFor="country" error={errors.country?.message} hint="ISO code or name, e.g. DE">
          <Input id="country" {...register('country')} />
        </Field>
        <Field label="Status" htmlFor="status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>{RECORD_STATUSES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Operator note" htmlFor="notes" className="sm:col-span-2" hint="The source that established who stands behind the name.">
          <Textarea id="notes" rows={2} {...register('notes')} />
        </Field>
      </FormSection>

      {!isNew && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Performs as</h2>
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">artist_membership</span>
          </div>
          <p className="text-sm text-muted-foreground">Every stage name this person stands behind. Memberships are edited on the artist record.</p>
          {memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not a member of any artist yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {memberships.map((m) => (
                <li key={m.membership_id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  {m.artist ? (
                    <Link to={`/artists/${m.artist.artist_id}`} className="font-medium underline-offset-2 hover:underline">{m.artist.name}</Link>
                  ) : <span className="text-muted-foreground">(artist not visible)</span>}
                  {m.artist?.artist_type && <span className="text-xs text-muted-foreground">{m.artist.artist_type}</span>}
                  {m.membership_role && <span className="text-xs text-muted-foreground">· {m.membership_role}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {m.started_at ?? '…'} → {m.ended_at ?? 'current'}
                  </span>
                  {m.artist && <StatusBadge status={m.artist.status} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><Link to="/people">Cancel</Link></Button>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create person' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
