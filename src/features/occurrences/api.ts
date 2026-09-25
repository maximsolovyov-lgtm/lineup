import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { favoriteFilter } from '@/features/favorites/api';
import type { Enums, Json } from '@/types/database';

export interface OccurrencesListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
  /** From this business day on; '' = no lower bound. */
  from: string;
  /** Given, only these ids — the operator's favourites. */
  favoriteIds?: string[] | null;
}

const LIST_SELECT = 'occurrence_id,event_date,starts_at,ends_at,timezone,occurrence_name,status,website_url,part_of_occurrence_id,event:event_id(event_id,name,normalized_name,event_type),place:primary_place_id(place_id,name,city),lineup(lineup_id,version,status,place_id),performance_set(performance_set_id,scenario_type,status)' as const;

/**
 * The nights, newest first. One row answers "is this night ready": does it have
 * a place, a line-up, a timetable — which is what the Occurrences tab is for.
 */
export function useOccurrences(params: OccurrencesListParams) {
  return useQuery({
    queryKey: ['occurrences', params],
    queryFn: async () => {
      let query = supabase.from('event_occurrence').select(LIST_SELECT).order('event_date', { ascending: false }).limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      if (params.from) query = query.gte('event_date', params.from);
      const favorites = favoriteFilter(params.favoriteIds);
      if (favorites) query = query.in('occurrence_id', favorites);
      const term = params.q.trim();
      if (term) query = query.not('event', 'is', null).ilike('event.normalized_name', `%${term.toLowerCase()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data
        .filter((o) => o.event)
        .map(({ lineup, performance_set, ...o }) => {
          const lineups = lineup.filter((l) => l.status === 'active');
          const sets = performance_set.filter((s) => s.status === 'active');
          return {
            ...o,
            lineup_count: lineups.length,
            lineup_versions: lineups.map((l) => l.version),
            set_count: sets.length,
            predicted_count: sets.filter((s) => s.scenario_type === 'predicted').length,
          };
        });
    },
  });
}

const ONE_SELECT = '*,event:event_id(event_id,name,event_type,website_url),place:primary_place_id(place_id,name,city,timezone,typical_party_start_time,typical_party_end_time,typical_party_start_day_offset,typical_party_end_day_offset,typical_headliner_start_time,typical_headliner_start_day_offset,typical_headliner_end_time,typical_headliner_end_day_offset)' as const;

/** One night with everything the form and the timetable generator need. */
export function useOccurrence(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['occurrence', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('event_occurrence').select(ONE_SELECT).eq('occurrence_id', occurrenceId!).single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * An occurrence has no children of its own — its line-ups and sets are edited
 * on their own screens — so it is saved with a plain update, not an RPC.
 */
export interface OccurrencePatch {
  event_date: string;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  primary_place_id: string | null;
  occurrence_name: string | null;
  website_url: string | null;
  part_of_occurrence_id: string | null;
  status: Enums<'record_status'>;
}

export function useSaveOccurrence(occurrenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: OccurrencePatch) => {
      const { error } = await supabase.from('event_occurrence').update(patch).eq('occurrence_id', occurrenceId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['occurrence', occurrenceId] });
      void qc.invalidateQueries({ queryKey: ['occurrences'] });
      void qc.invalidateQueries({ queryKey: ['occurrence-window', occurrenceId] });
    },
  });
}

/** The line-ups of a night, with their slots — what a timetable is generated from. */
export function useOccurrenceLineups(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['occurrence-lineups', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('lineup')
        .select('lineup_id,version,place_id,published_at,status,split_by_day,place:place_id(name),lineup_artist(lineup_artist_id,kind,is_headliner,billing_order,status,place_space_id,slot_date,display_name_override,space:place_space_id(name),lineup_artist_participant(participant_order,artist_id,artist(name)))')
        .eq('occurrence_id', occurrenceId!).eq('status', 'active').order('version', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** The sets already on a night, newest generation first. */
export function useOccurrenceSets(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['occurrence-sets', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('performance_set')
        .select('performance_set_id,scenario_type,scenario_version,set_type,scheduled_start_at,scheduled_end_at,status,lineup_id,place_space_id,artist_list_json,space:place_space_id(name)')
        .eq('occurrence_id', occurrenceId!).in('status', ['active', 'cancelled'])
        .order('scheduled_start_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}

export interface PredictedSetPayload { [k: string]: Json }

/** Writes a whole predicted timetable in one transaction (save_predicted_sets). */
export function useGeneratePredictedSets(occurrenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lineupId, sets, replace }: { lineupId: string; sets: PredictedSetPayload[]; replace: boolean }) => {
      const { data, error } = await supabase.rpc('save_predicted_sets', {
        p_occurrence_id: occurrenceId, p_lineup_id: lineupId, p_sets: sets, p_replace: replace,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['occurrence-sets', occurrenceId] });
      void qc.invalidateQueries({ queryKey: ['occurrences'] });
      void qc.invalidateQueries({ queryKey: ['sets'] });
    },
  });
}
