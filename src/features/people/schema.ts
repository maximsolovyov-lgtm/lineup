import { z } from 'zod';
import { RECORD_STATUSES } from '@/types/enums';
import type { TablesInsert } from '@/types/database';
import type { PersonRow } from './api';

export const personFormSchema = z.object({
  display_name: z.string().trim().min(1, 'Name is required').max(512),
  country: z.string().trim().max(64),
  notes: z.string().max(4000),
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
});
export type PersonFormValues = z.infer<typeof personFormSchema>;

export const emptyPersonForm: PersonFormValues = { display_name: '', country: '', notes: '', status: 'active' };

export function fromRow(row: PersonRow): PersonFormValues {
  return { display_name: row.display_name, country: row.country ?? '', notes: row.notes ?? '', status: row.status };
}

const nullIfEmpty = (v: string) => (v.trim() === '' ? null : v.trim());

export function toPayload(v: PersonFormValues): TablesInsert<'person'> {
  return {
    display_name: v.display_name.trim(),
    country: nullIfEmpty(v.country),
    notes: nullIfEmpty(v.notes),
    status: v.status as PersonRow['status'],
  };
}
