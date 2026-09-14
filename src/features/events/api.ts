import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nameFilter } from '@/lib/lookups';
import type { Enums, TablesInsert, TablesUpdate } from '@/types/database';

export interface EventListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
}

export function useEvents(params: EventListParams) {
  return useQuery({
    queryKey: ['events', params],
    queryFn: async () => {
      let query = supabase
        .from('event')
        .select('event_id,name,event_type,status,created_at,updated_at')
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

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.from('event').select('*').eq('event_id', eventId!).single();
      if (error) throw error;
      return data;
    },
  });
}

/** Occurrences of one event, newest first — shown on the event form. */
export function useEventOccurrences(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-occurrences', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_occurrence')
        .select('occurrence_id,occurrence_name,starts_at,ends_at,timezone,status,place:primary_place_id(name)')
        .eq('event_id', eventId!)
        .order('starts_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesInsert<'event'>) => {
      const { data, error } = await supabase.from('event').insert(payload).select('event_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useUpdateEvent(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesUpdate<'event'>) => {
      const { data, error } = await supabase.from('event').update(payload).eq('event_id', eventId).select('event_id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] });
      void qc.invalidateQueries({ queryKey: ['event', eventId] });
    },
  });
}
