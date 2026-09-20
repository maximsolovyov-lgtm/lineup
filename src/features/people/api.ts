import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nameFilter } from '@/lib/lookups';
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@/types/database';

export type PersonRow = Tables<'person'>;

export interface PeopleListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
}

// Each person row carries the stage names they perform under, so the list
// answers "who is this" without a second query per row.
const LIST_SELECT = 'person_id,display_name,country,status,updated_at,created_at,artist_membership(status,ended_at,artist(artist_id,name))' as const;

export function usePeople(params: PeopleListParams) {
  return useQuery({
    queryKey: ['people', params],
    queryFn: async () => {
      let query = supabase.from('person').select(LIST_SELECT).order('display_name').limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      const f = nameFilter(params.q, ['country']);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map((p) => ({
        ...p,
        artists: p.artist_membership
          .filter((m) => m.status === 'active' && m.artist)
          .map((m) => ({ ...m.artist!, current: m.ended_at === null })),
      }));
    },
  });
}

/** The person with every membership, current and past — the reverse view of the artist record. */
export function usePerson(personId: string | undefined) {
  return useQuery({
    queryKey: ['person', personId],
    enabled: !!personId,
    queryFn: async () => {
      const [person, memberships] = await Promise.all([
        supabase.from('person').select('*').eq('person_id', personId!).single(),
        supabase.from('artist_membership')
          .select('membership_id,membership_role,started_at,ended_at,status,artist(artist_id,name,artist_type,status)')
          .eq('person_id', personId!).eq('status', 'active')
          .order('ended_at', { ascending: true, nullsFirst: true }).order('started_at', { ascending: false }),
      ]);
      if (person.error) throw person.error;
      if (memberships.error) throw memberships.error;
      return { person: person.data, memberships: memberships.data };
    },
  });
}

export function useSavePerson(personId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesInsert<'person'>) => {
      const q = personId
        ? supabase.from('person').update(payload as TablesUpdate<'person'>).eq('person_id', personId)
        : supabase.from('person').insert(payload);
      const { data, error } = await q.select('person_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: ({ person_id }) => {
      void qc.invalidateQueries({ queryKey: ['people'] });
      void qc.invalidateQueries({ queryKey: ['person', person_id] });
    },
  });
}

/**
 * People whose normalised name contains the candidate's — the duplicate
 * warning in the picker. One human under several names is normal; two
 * person rows for one human is not.
 */
export async function findSimilarPeople(displayName: string) {
  const f = nameFilter(displayName);
  if (!f) return [];
  const { data, error } = await supabase.from('person')
    .select('person_id,display_name,country,artist_membership(status,artist(name))')
    .eq('status', 'active').or(f).limit(5);
  if (error) throw error;
  return data.map((p) => ({
    person_id: p.person_id,
    display_name: p.display_name,
    country: p.country,
    artists: p.artist_membership.filter((m) => m.status === 'active' && m.artist).map((m) => m.artist!.name),
  }));
}
