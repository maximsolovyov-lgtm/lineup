import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeName, safeFilterTerm } from '@/lib/normalize';
import type { Enums } from '@/types/database';
import type { LookupOption } from '@/components/form/LookupField';
import type { SavePlaceArgs } from './schema';

// place_space(count) is an embedded aggregate: one query, no N+1 for the rooms column.
export const PLACE_LIST_COLUMNS =
  'place_id,name,city,country,lifecycle_type,status,tags,updated_at,created_at,updated_by_user_id,created_by_user_id,place_space(count)' as const;

export interface PlaceListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
  /** Only places carrying this tag; '' = any. */
  tag: string;
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
      let query = supabase.from('place').select(PLACE_LIST_COLUMNS).eq('place_space.status', 'active').order('name').limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      if (params.tag) query = query.contains('tags', [params.tag]);
      query = applySearch(query, params.q);
      const { data, error } = await query;
      if (error) throw error;
      return data.map(({ place_space, ...p }) => ({ ...p, room_count: place_space[0]?.count ?? 0 }));
    },
  });
}

/** The place with its active rooms in display order — what the form edits. */
export function usePlace(placeId: string | undefined) {
  return useQuery({
    queryKey: ['place', placeId],
    enabled: !!placeId,
    queryFn: async () => {
      const [place, spaces] = await Promise.all([
        supabase.from('place').select('*').eq('place_id', placeId!).single(),
        supabase.from('place_space').select('*').eq('place_id', placeId!).eq('status', 'active')
          .order('display_order', { ascending: true, nullsFirst: false }).order('name'),
      ]);
      if (place.error) throw place.error;
      if (spaces.error) throw spaces.error;
      return { place: place.data, spaces: spaces.data };
    },
  });
}

/** Every tag in use with its count — the vocabulary for autocomplete and the list filter. */
export function useTagCounts() {
  return useQuery({
    queryKey: ['place-tags'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('place_tag_counts');
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

/**
 * Place and rooms go through one RPC so they are saved in one transaction.
 * A chain of per-row requests is what leaves half-saved records behind.
 */
export function useSavePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SavePlaceArgs) => {
      const { data, error } = await supabase.rpc('save_place_with_spaces', args);
      if (error) throw error;
      return { place_id: data };
    },
    onSuccess: ({ place_id }) => {
      void qc.invalidateQueries({ queryKey: ['places'] });
      void qc.invalidateQueries({ queryKey: ['place', place_id] });
      void qc.invalidateQueries({ queryKey: ['place-tags'] });
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
