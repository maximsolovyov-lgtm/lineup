import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormSection } from '@/components/form/Field';
import { ARTIST_TYPES, RECORD_STATUSES } from '@/types/database';
import { useArtist, useCreateArtist, useUpdateArtist } from './api';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(512),
  artist_type: z.enum(ARTIST_TYPES),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
});
type Values = z.infer<typeof schema>;

export function ArtistFormPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const isNew = !artistId;
  const navigate = useNavigate();
  const existing = useArtist(artistId);
  const create = useCreateArtist();
  const update = useUpdateArtist(artistId ?? '');

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', artist_type: 'solo', status: 'active' },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (existing.data) {
      reset({
        name: existing.data.name,
        artist_type: (existing.data.artist_type ?? 'unknown') as Values['artist_type'],
        status: existing.data.status,
      });
    }
  }, [existing.data, reset]);

  async function onSubmit(values: Values) {
    const payload = {
      name: values.name.trim(),
      artist_type: values.artist_type,
      status: values.status as (typeof RECORD_STATUSES)[number],
    };
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);
        toast.success('Artist created');
        navigate(`/artists/${created.artist_id}`, { replace: true });
      } else {
        await update.mutateAsync(payload);
        toast.success('Artist saved');
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
        <Button asChild variant="ghost" size="icon"><Link to="/artists" title="Back to artists"><ArrowLeft /></Link></Button>
        <h1 className="mr-auto text-xl font-semibold">{isNew ? 'New artist' : existing.data?.name}</h1>
        <Button type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>
          {isSubmitting ? 'Saving…' : isNew ? 'Create artist' : 'Save changes'}
        </Button>
      </div>

      <FormSection title="Artist" description="The public identity as it appears on a lineup.">
        <Field label="Name" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
          <Input id="name" {...register('name')} aria-invalid={!!errors.name} autoFocus={isNew} />
        </Field>
        <Field
          label="Type"
          htmlFor="artist_type"
          required
          error={errors.artist_type?.message}
          hint="duo, group and collective describe the artist. A one-off B2B is a set format, not a type."
        >
          <Controller control={control} name="artist_type" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="artist_type"><SelectValue /></SelectTrigger>
              <SelectContent>{ARTIST_TYPES.map((v) => <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>)}</SelectContent>
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
  );
}
