import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nameFilter } from '@/lib/lookups';
import type { Enums, Tables } from '@/types/database';
import type { SaveEventArgs } from './schema';

export type EventRow = Tables<'event'>;

export interface EventsListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
}

const LIST_SELECT = 'event_id,name,event_type,status,updated_at,created_at,event_occurrence(event_date,status)' as const;

export function useEvents(params: EventsListParams) {
  return useQuery({
    queryKey: ['events', params],
    queryFn: async () => {
      let query = supabase.from('event').select(LIST_SELECT).order('name').limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      const f = nameFilter(params.q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      return data.map(({ event_occurrence, ...e }) => {
        const active = event_occurrence.filter((o) => o.status === 'active').map((o) => o.event_date).sort();
        return {
          ...e,
          occurrence_count: active.length,
          next_date: active.find((d) => d >= today) ?? null,
          last_date: active.length ? active[active.length - 1]! : null,
        };
      });
    },
  });
}

/** The event with its non-inactive occurrences (active and cancelled), newest business day first. */
export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const [event, occurrences] = await Promise.all([
        supabase.from('event').select('*').eq('event_id', eventId!).single(),
        supabase.from('event_occurrence').select('*').eq('event_id', eventId!)
          .in('status', ['active', 'cancelled', 'draft']).order('event_date', { ascending: false }),
      ]);
      if (event.error) throw event.error;
      if (occurrences.error) throw occurrences.error;
      return { event: event.data, occurrences: occurrences.data };
    },
  });
}

/** Timezones of the places used in the occurrences block, so wall times are read in the venue's zone. */
export async function fetchPlaceTimezones(placeIds: string[]): Promise<Map<string, string | null>> {
  if (placeIds.length === 0) return new Map();
  const { data, error } = await supabase.from('place').select('place_id,timezone').in('place_id', placeIds);
  if (error) throw error;
  return new Map(data.map((p) => [p.place_id, p.timezone]));
}

/** Event and occurrences in one RPC — one transaction. */
export function useSaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveEventArgs) => {
      const { data, error } = await supabase.rpc('save_event_with_occurrences', args);
      if (error) throw error;
      return { event_id: data };
    },
    onSuccess: ({ event_id }) => {
      void qc.invalidateQueries({ queryKey: ['events'] });
      void qc.invalidateQueries({ queryKey: ['event', event_id] });
    },
  });
}
