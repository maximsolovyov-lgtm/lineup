import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeName, safeFilterTerm } from '@/lib/normalize';
import type { Enums, TablesInsert, TablesUpdate } from '@/types/database';
import type { LookupOption } from '@/components/form/LookupField';

export const PLACE_LIST_COLUMNS =
  'place_id,name,city,country,lifecycle_type,status,updated_at,created_at,updated_by_user_id,created_by_user_id' as const;

export interface PlaceListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
}

function applySearch<T extends { or: (f: string) => T }>(query: T, q: string): T {
  const term = safeFilterTerm(q);
  if (!term) return query;
  const norm = normalizeName(term);
  return query.or(`normalized_name.ilike.%${norm}%,city.ilike.%${term}%,instagram_account.ilike.%${term}%`);
}

export function usePlaces(params: PlaceListParams) {
  return useQuery({
    queryKey: ['places', params],
    queryFn: async () => {
      let query = supabase.from('place').select(PLACE_LIST_COLUMNS).order('name').limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      query = applySearch(query, params.q);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function usePlace(placeId: string | undefined) {
  return useQuery({
    queryKey: ['place', placeId],
    enabled: !!placeId,
    queryFn: async () => {
      const { data, error } = await supabase.from('place').select('*').eq('place_id', placeId!).single();
      if (error) throw error;
      return data;
    },
  });
}

/** user_id -> display name, for created-by / updated-by columns. */
export function useProfileNames() {
  return useQuery({
    queryKey: ['profile-names'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_user_profile').select('user_id,email,full_name');
      if (error) throw error;
      return new Map(data.map((p) => [p.user_id, p.full_name || p.email]));
    },
  });
}

export function useCreatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesInsert<'place'>) => {
      const { data, error } = await supabase.from('place').insert(payload).select('place_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['places'] }),
  });
}

export function useUpdatePlace(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesUpdate<'place'>) => {
      const { data, error } = await supabase.from('place').update(payload).eq('place_id', placeId).select('place_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['places'] });
      void qc.invalidateQueries({ queryKey: ['place', placeId] });
    },
  });
}

/** Lookup helpers for parent_place_id. `excludeId` keeps a place from choosing itself. */
export function placeLookup(excludeId?: string) {
  const search = async (q: string): Promise<LookupOption[]> => {
    let query = supabase.from('place').select('place_id,name,city,country').order('name').limit(20);
    if (excludeId) query = query.neq('place_id', excludeId);
    query = applySearch(query, q);
    const { data, error } = await query;
    if (error) throw error;
    return data.map((p) => ({ id: p.place_id, label: p.name, sublabel: [p.city, p.country].filter(Boolean).join(', ') }));
  };
  const resolve = async (id: string): Promise<LookupOption | null> => {
    const { data } = await supabase.from('place').select('place_id,name,city,country').eq('place_id', id).maybeSingle();
    return data ? { id: data.place_id, label: data.name, sublabel: [data.city, data.country].filter(Boolean).join(', ') } : null;
  };
  return { search, resolve };
}
