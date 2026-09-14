import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nameFilter } from '@/lib/lookups';
import type { Enums, TablesInsert, TablesUpdate } from '@/types/database';

export interface ArtistListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
}

export function useArtists(params: ArtistListParams) {
  return useQuery({
    queryKey: ['artists', params],
    queryFn: async () => {
      let query = supabase
        .from('artist')
        .select('artist_id,name,artist_type,status,created_at')
        .order('name')
        .limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      const f = nameFilter(params.q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useArtist(artistId: string | undefined) {
  return useQuery({
    queryKey: ['artist', artistId],
    enabled: !!artistId,
    queryFn: async () => {
      const { data, error } = await supabase.from('artist').select('*').eq('artist_id', artistId!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesInsert<'artist'>) => {
      const { data, error } = await supabase.from('artist').insert(payload).select('artist_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['artists'] }),
  });
}

export function useUpdateArtist(artistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesUpdate<'artist'>) => {
      const { data, error } = await supabase.from('artist').update(payload).eq('artist_id', artistId).select('artist_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['artists'] });
      void qc.invalidateQueries({ queryKey: ['artist', artistId] });
    },
  });
}
