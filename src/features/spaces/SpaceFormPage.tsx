import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { LookupField } from '@/components/form/LookupField';
import { placeLookup } from '@/lib/lookups';
import { RECORD_STATUSES, SPACE_TYPE_SUGGESTIONS } from '@/types/database';
import { useCreateSpace, useSpace, useUpdateSpace } from './api';

const schema = z.object({
  place_id: z.string().uuid({ message: 'Choose a venue' }),
  name: z.string().trim().min(1, 'Name is required').max(512),
  space_type: z.string().trim().max(64),
  capacity: z.string().trim().regex(/^\d*$/, 'Whole number'),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
});
type Values = z.infer<typeof schema>;

export function SpaceFormPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [searchParams] = useSearchParams();
  const isNew = !spaceId;
  const navigate = useNavigate();
  const existing = useSpace(spaceId);
  const create = useCreateSpace();
  const update = useUpdateSpace(spaceId ?? '');
  const lookup = useMemo(() => placeLookup(), []);

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      place_id: searchParams.get('place') ?? '',
      name: '',
      space_type: '',
      capacity: '',
      status: 'active',
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (existing.data) {
      reset({
        place_id: existing.data.place_id,
        name: existing.data.name,
        space_type: existing.data.space_type ?? '',
        capacity: existing.data.capacity === null ? '' : String(existing.data.capacity),
        status: existing.data.status,
      });
    }
  }, [existing.data, reset]);

  async function onSubmit(values: Values) {
    const payload = {
      place_id: values.place_id,
      name: values.name.trim(),
      space_type: values.space_type.trim() || null,
      capacity: values.capacity.trim() === '' ? null : Number.parseInt(values.capacity, 10),
      status: values.status as (typeof RECORD_STATUSES)[number],
    };
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);
        toast.success('Space created');
        navigate(`/spaces/${created.space_id}`, { replace: true });
      } else {
        await update.mutateAsync(payload);
        toast.success('Space saved');
        reset(values);
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
        <Button asChild variant="ghost" size="icon"><Link to="/spaces" title="Back to spaces"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-xl font-semibold">{isNew ? 'New space' : existing.data?.name}</h1>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create space' : 'Save changes'}
        </Button>
      </div>

      <FormSection title="Space" description="A room, stage, floor or terrace that belongs to a venue.">
        <Field label="Venue" htmlFor="place_id" required error={errors.place_id?.message}>
          <Controller control={control} name="place_id" render={({ field }) => (
            <LookupField
              id="place_id"
              value={field.value || null}
              onChange={(id) => field.onChange(id ?? '')}
              search={lookup.search}
              resolve={lookup.resolve}
              placeholder="Search venues…"
              invalid={!!errors.place_id}
            />
          )} />
        </Field>
        <Field label="Name" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" {...register('name')} aria-invalid={!!errors.name} autoFocus={isNew} />
        </Field>
        <Field label="Type" htmlFor="space_type" error={errors.space_type?.message} hint="Free text; the list is a suggestion.">
          <Input id="space_type" list="space-type-suggestions" {...register('space_type')} />
          <datalist id="space-type-suggestions">
            {SPACE_TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
          </datalist>
        </Field>
        <Field label="Capacity" htmlFor="capacity" error={errors.capacity?.message}>
          <Input id="capacity" inputMode="numeric" {...register('capacity')} aria-invalid={!!errors.capacity} />
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
