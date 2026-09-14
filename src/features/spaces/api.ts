import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nameFilter } from '@/lib/lookups';
import type { Enums, TablesInsert, TablesUpdate } from '@/types/database';

export interface SpaceListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
  placeId?: string;
}

export function useSpaces(params: SpaceListParams) {
  return useQuery({
    queryKey: ['spaces', params],
    queryFn: async () => {
      let query = supabase
        .from('place_space')
        .select('space_id,name,space_type,capacity,status,place_id,place:place_id(name,city)')
        .order('name')
        .limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      if (params.placeId) query = query.eq('place_id', params.placeId);
      const f = nameFilter(params.q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useSpace(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['space', spaceId],
    enabled: !!spaceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('place_space').select('*').eq('space_id', spaceId!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesInsert<'place_space'>) => {
      const { data, error } = await supabase.from('place_space').insert(payload).select('space_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['spaces'] }),
  });
}

export function useUpdateSpace(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesUpdate<'place_space'>) => {
      const { data, error } = await supabase.from('place_space').update(payload).eq('space_id', spaceId).select('space_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['spaces'] });
      void qc.invalidateQueries({ queryKey: ['space', spaceId] });
    },
  });
}
