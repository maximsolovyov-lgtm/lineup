import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { safeFilterTerm } from '@/lib/normalize';
import type { Enums, TablesInsert, TablesUpdate } from '@/types/database';

export interface OccurrenceListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
  /** 'upcoming' hides dates that have already ended. */
  when: 'upcoming' | 'past' | 'all';
}

export function useOccurrences(params: OccurrenceListParams) {
  return useQuery({
    queryKey: ['occurrences', params],
    queryFn: async () => {
      let query = supabase
        .from('event_occurrence')
        .select('occurrence_id,occurrence_name,starts_at,ends_at,timezone,status,event:event_id(name),place:primary_place_id(name,city)')
        .limit(200);

      if (params.status !== 'all') query = query.eq('status', params.status);
      if (params.when === 'upcoming') {
        query = query.gte('ends_at', new Date().toISOString()).order('starts_at', { ascending: true });
      } else if (params.when === 'past') {
        query = query.lt('ends_at', new Date().toISOString()).order('starts_at', { ascending: false });
      } else {
        query = query.order('starts_at', { ascending: false });
      }

      const term = safeFilterTerm(params.q);
      if (term) query = query.ilike('occurrence_name', `%${term}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useOccurrence(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['occurrence', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('event_occurrence').select('*').eq('occurrence_id', occurrenceId!).single();
      if (error) throw error;
      return data;
    },
  });
}

/** The venue's default timezone, offered when creating an occurrence there. */
export function usePlaceTimezone(placeId: string | null) {
  return useQuery({
    queryKey: ['place-timezone', placeId],
    enabled: !!placeId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('place').select('timezone').eq('place_id', placeId!).maybeSingle();
      if (error) throw error;
      return data?.timezone ?? null;
    },
  });
}

export function useCreateOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesInsert<'event_occurrence'>) => {
      const { data, error } = await supabase.from('event_occurrence').insert(payload).select('occurrence_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['occurrences'] });
      void qc.invalidateQueries({ queryKey: ['event-occurrences'] });
    },
  });
}

export function useUpdateOccurrence(occurrenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesUpdate<'event_occurrence'>) => {
      const { data, error } = await supabase.from('event_occurrence').update(payload).eq('occurrence_id', occurrenceId).select('occurrence_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['occurrences'] });
      void qc.invalidateQueries({ queryKey: ['event-occurrences'] });
      void qc.invalidateQueries({ queryKey: ['occurrence', occurrenceId] });
    },
  });
}
