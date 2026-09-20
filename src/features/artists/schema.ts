import { z } from 'zod';
import { Constants, type Json, type Tables } from '@/types/database';
import { RECORD_STATUSES } from '@/types/enums';

export const ARTIST_TYPES = Constants.public.Enums.artist_type;
export const MEMBERSHIP_ROLES = Constants.public.Enums.membership_role;

const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use a date');
const optionalUrl = z.string().trim().max(2048).refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must start with http:// or https://');

/**
 * One row of the members block. Either an existing person (person_id) or one
 * created inline in the picker (new_person, saved with the artist in the same
 * transaction). display_name is carried for display only.
 */
export const memberSchema = z.object({
  membership_id: z.string().uuid().nullable(),
  person_id: z.string().uuid().nullable(),
  new_person: z.object({ display_name: z.string().trim().min(1), country: z.string().trim().max(64), notes: z.string().max(4000) }).nullable(),
  display_name: z.string(),
  sublabel: z.string(),
  membership_role: z.string(),
  is_primary: z.boolean(),
  started_at: optionalDate,
  ended_at: optionalDate,
}).refine((m) => !!m.person_id || !!m.new_person, { message: 'Pick or create a person', path: ['display_name'] })
  .refine((m) => !m.started_at || !m.ended_at || m.ended_at >= m.started_at, { message: 'Ends before it starts', path: ['ended_at'] });
export type MemberFormValue = z.infer<typeof memberSchema>;

export const artistFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(512),
  artist_type: z.string(),
  country: z.string().trim().max(64),
  instagram_url: optionalUrl,
  status: z.enum(RECORD_STATUSES as [string, ...string[]]),
  members: z.array(memberSchema).superRefine((members, ctx) => {
    // The same person twice with the same start date collides in the database too.
    const seen = new Map<string, number>();
    members.forEach((m, i) => {
      const key = m.person_id ? `${m.person_id}|${m.started_at}` : null;
      if (!key) return;
      const first = seen.get(key);
      if (first !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'display_name'], message: `Already listed as member ${first + 1}` });
      else seen.set(key, i);
    });
  }),
});
export type ArtistFormValues = z.infer<typeof artistFormSchema>;
export type ArtistRow = Tables<'artist'>;

export const emptyArtistForm: ArtistFormValues = { name: '', artist_type: 'unknown', country: '', instagram_url: '', status: 'active', members: [] };

type MemberRow = {
  membership_id: string; person_id: string; membership_role: string | null; is_primary: boolean;
  started_at: string | null; ended_at: string | null; person: { display_name: string; country: string | null } | null;
};

export function fromRow(row: ArtistRow, members: MemberRow[]): ArtistFormValues {
  return {
    name: row.name,
    artist_type: row.artist_type ?? 'unknown',
    country: row.country ?? '',
    instagram_url: row.instagram_url ?? '',
    status: row.status,
    members: members.map((m) => ({
      membership_id: m.membership_id,
      person_id: m.person_id,
      new_person: null,
      display_name: m.person?.display_name ?? '(person not visible)',
      sublabel: m.person?.country ?? '',
      membership_role: m.membership_role ?? '',
      is_primary: m.is_primary,
      started_at: m.started_at ?? '',
      ended_at: m.ended_at ?? '',
    })),
  };
}

/** Expected current member count per artist_type; null = no expectation. Mirrors the database check. */
export function expectedMembers(type: string): { min: number; max: number | null } | null {
  switch (type) {
    case 'solo': return { min: 1, max: 1 };
    case 'duo': return { min: 2, max: 2 };
    case 'group':
    case 'collective': return { min: 2, max: null };
    default: return null;
  }
}

export interface SaveArtistArgs {
  p_artist: { [k: string]: Json };
  p_members: { [k: string]: Json }[];
}

const nullIfEmpty = (v: string) => (v.trim() === '' ? null : v.trim());

export function toPayload(v: ArtistFormValues, artistId: string | null): SaveArtistArgs {
  return {
    p_artist: {
      artist_id: artistId,
      name: v.name.trim(),
      artist_type: v.artist_type || null,
      country: nullIfEmpty(v.country),
      instagram_url: nullIfEmpty(v.instagram_url),
      status: v.status,
    },
    p_members: v.members.map((m) => ({
      membership_id: m.membership_id,
      person_id: m.person_id,
      new_person: m.new_person && !m.person_id
        ? { display_name: m.new_person.display_name.trim(), country: nullIfEmpty(m.new_person.country), notes: nullIfEmpty(m.new_person.notes) }
        : null,
      membership_role: m.membership_role || null,
      is_primary: m.is_primary,
      started_at: m.started_at || null,
      ended_at: m.ended_at || null,
    })),
  };
}
