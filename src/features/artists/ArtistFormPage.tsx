import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { RECORD_STATUSES } from '@/types/enums';
import { ARTIST_TYPES, artistFormSchema, emptyArtistForm, expectedMembers, fromRow, toPayload, type ArtistFormValues } from './schema';
import { useArtist, useSaveArtist } from './api';
import { MembersEditor, type MemberErrors } from './MembersEditor';
import { PersonPickerDialog } from './PersonPickerDialog';
import { AgentPanel } from '@/agents/AgentPanel';
import { useDuplicates } from '@/lib/duplicates';
import { DuplicateWarning } from '@/components/form/DuplicateWarning';

import type { ArtistDraft } from '@/agents/artist/schema';
import { fromDraft } from './agent';

export function ArtistFormPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const isNew = !artistId;
  const navigate = useNavigate();
  const existing = useArtist(artistId);
  const save = useSaveArtist();
  const [pickerOpen, setPickerOpen] = useState(false);

  const form = useForm<ArtistFormValues>({ resolver: zodResolver(artistFormSchema), defaultValues: emptyArtistForm, mode: 'onBlur' });
  const { register, control, handleSubmit, reset, watch, setValue, getValues, formState: { errors, isSubmitting, isDirty } } = form;
  const members = watch('members');
  const artistType = watch('artist_type');
  const name = watch('name');
  // Duplicate guard for a new record: warn on similar names, block Create on the same name until "anyway".
  const nameForDup = name;
  const dup = useDuplicates('artist', nameForDup, isNew);
  const [dupAck, setDupAck] = useState(false);
  useEffect(() => { setDupAck(false); }, [nameForDup]);
  const dupBlocked = isNew && !dupAck && (dup.data ?? []).some((m) => m.exact);


  useEffect(() => {
    if (existing.data) reset(fromRow(existing.data.artist, existing.data.members));
  }, [existing.data, reset]);

  async function onSubmit(values: ArtistFormValues) {
    if (dupBlocked) { toast.error('A record with this name already exists — open it, or press "Create anyway"'); return; }
    try {
      const saved = await save.mutateAsync(toPayload(values, artistId ?? null));
      if (isNew) {
        toast.success('Artist created');
        navigate(`/artists/${saved.artist_id}`, { replace: true });
      } else {
        toast.success('Artist saved');
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isNew && existing.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && existing.isError) return <p className="text-destructive">{(existing.error as Error).message}</p>;

  // Advisory only — the same rule the database applies; a mismatch records a review_task, it never blocks.
  const current = members.filter((m) => !m.ended_at).length;
  const expected = expectedMembers(artistType);
  const consistent = !expected || current === 0 || (current >= expected.min && (expected.max === null || current <= expected.max));
  const expectedText = expected ? (expected.max === null ? `${expected.min}+` : String(expected.min)) : null;
  const openReviews = existing.data?.reviews ?? [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/artists" title="Back to artists"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-[23px] font-semibold tracking-[-0.4px]">{isNew ? 'New artist' : existing.data?.artist.name}</h1>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create artist' : 'Save changes'}
        </Button>
      </div>

      {isNew && (
        <AgentPanel<ArtistDraft>
          kind="artist"
          noun="artist"
          placeholder="Tale Of Us; Berlin; https://www.instagram.com/taleofus"
          onDraft={async (r) => {
            const m = await fromDraft(r.draft);
            reset(m.values, { keepDefaultValues: true });
            return (
              <p className="text-xs text-muted-foreground">
                {m.linked.length > 0 && <>Linked to existing people: <b>{m.linked.join(', ')}</b>. </>}
                {m.created.length > 0 && <>Will be created as new people: <b>{m.created.join(', ')}</b>. </>}
                {r.draft.genres.length > 0 && <>Genres: {r.draft.genres.join(', ')}.</>}
              </p>
            );
          }}
        />
      )}

      <FormSection title="Name on the poster" description="What users follow and what appears in a line-up. The humans behind it are members below.">
        <Field label="Name" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
          <Input id="name" {...register('name')} aria-invalid={!!errors.name} autoFocus={isNew} />
        </Field>
        {isNew && (dup.data?.length ?? 0) > 0 && (
          <div className="sm:col-span-2">
            <DuplicateWarning matches={dup.data ?? []} noun="artist" blocked={dupBlocked} onCreateAnyway={() => setDupAck(true)} />
          </div>
        )}
        <Field label="Type" htmlFor="artist_type" required error={errors.artist_type?.message}
          hint="B2B is not a type: it is the format of one set, not the nature of an artist.">
          <Controller control={control} name="artist_type" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="artist_type"><SelectValue /></SelectTrigger>
              <SelectContent>{ARTIST_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
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
        <Field label="Country" htmlFor="country" error={errors.country?.message}>
          <Input id="country" placeholder="IT" {...register('country')} />
        </Field>
        <Field label="Instagram" htmlFor="instagram_url" error={errors.instagram_url?.message}>
          <Input id="instagram_url" type="url" placeholder="https://www.instagram.com/…" {...register('instagram_url')} aria-invalid={!!errors.instagram_url} />
        </Field>
      </FormSection>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Members</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">artist_membership → person</span>
          <span className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}><Plus /> Add member</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick an existing person or create one on the spot. Members are saved with the artist in one transaction.
          An empty “until” means the membership is current; the dates are what lets a 2019 event show the line-up of its own time.
        </p>
        <Controller control={control} name="members" render={({ field }) => (
          <MembersEditor value={field.value} onChange={field.onChange} errors={errors.members as MemberErrors} showPrimary={artistType === 'alias'} />
        )} />
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">Checks</h2>
        <p className={consistent ? 'text-sm text-emerald-700' : 'text-sm text-amber-700'} role="status">
          {expected === null
            ? `Type “${artistType}” has no expected member count.`
            : current === 0
              ? `No current members yet — the type check waits until at least one is recorded.`
              : consistent
                ? `Type “${artistType}” and ${current} current member${current === 1 ? '' : 's'} agree.`
                : `Type “${artistType}” expects ${expectedText} current member${expected.max === 1 ? '' : 's'} — ${current} recorded. Saving records a review task; it does not block.`}
        </p>
        {openReviews.length > 0 && (
          <ul className="space-y-1 text-sm">
            {openReviews.map((r) => (
              <li key={r.review_task_id} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5">
                <span className="font-mono text-xs text-muted-foreground">{r.kind}</span> — {r.message}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Master data often arrives incomplete; a mismatch creates a <code>review_task</code> instead of rejecting the record.</p>
      </section>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><Link to="/artists">Cancel</Link></Button>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create artist' : 'Save changes'}
        </Button>
      </div>

      <PersonPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        artistName={name}
        excludePersonIds={members.flatMap((m) => (m.person_id ? [m.person_id] : []))}
        onAdd={(m) => setValue('members', [...getValues('members'), m], { shouldDirty: true, shouldValidate: true })}
      />
    </form>
  );
}
