import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Enums } from '@/types/database';
import type { SaveSetArgs } from './schema';

export interface SetsListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
  scenario: 'official' | 'predicted' | 'all';
}

const LIST_SELECT =
  'performance_set_id,scenario_type,scenario_version,completeness,set_type,display_name,scheduled_start_at,scheduled_end_at,artist_list_json,artist_count,confidence_score,status,event_day,supersedes_performance_set_id,place(name,timezone),place_space(name),lineup(version),event_occurrence(event_date,event(name,normalized_name))' as const;

export function useSets(params: SetsListParams) {
  return useQuery({
    queryKey: ['sets', params],
    queryFn: async () => {
      let query = supabase.from('performance_set').select(LIST_SELECT)
        .order('event_day', { ascending: false, nullsFirst: false }).order('scheduled_start_at', { ascending: true, nullsFirst: false }).limit(300);
      if (params.status !== 'all') query = query.eq('status', params.status);
      if (params.scenario !== 'all') query = query.eq('scenario_type', params.scenario);
      const term = params.q.trim();
      if (term) query = query.not('event_occurrence', 'is', null).ilike('event_occurrence.event.normalized_name', `%${term.toLowerCase()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data.filter((s) => s.event_occurrence);
    },
  });
}

/** One set with its participants, its lineup/place context, and the rows before and after it in the supersede chain. */
export function useSet(setId: string | undefined) {
  return useQuery({
    queryKey: ['set', setId],
    enabled: !!setId,
    queryFn: async () => {
      const [set, participants, next] = await Promise.all([
        supabase.from('performance_set').select('*,place(name,timezone),place_space(name),lineup(version,place_id,place(timezone)),event_occurrence(event_date,occurrence_name,timezone,event(name))')
          .eq('performance_set_id', setId!).single(),
        supabase.from('performance_set_participant').select('*').eq('performance_set_id', setId!).eq('status', 'active')
          .order('display_order', { ascending: true, nullsFirst: false }).order('created_at'),
        supabase.from('performance_set').select('performance_set_id,scenario_version,status,created_at').eq('supersedes_performance_set_id', setId!).order('created_at'),
      ]);
      if (set.error) throw set.error;
      if (participants.error) throw participants.error;
      if (next.error) throw next.error;
      const timezone = set.data.place?.timezone ?? set.data.lineup?.place?.timezone ?? set.data.event_occurrence?.timezone ?? null;
      return { set: set.data, participants: participants.data, supersededBy: next.data, timezone };
    },
  });
}

/** The context a new set needs from a line-up: occurrence, place and version. */
export async function fetchLineupContext(lineupId: string) {
  const { data, error } = await supabase.from('lineup').select('lineup_id,occurrence_id,place_id,version,place(timezone),event_occurrence(event_date,timezone)').eq('lineup_id', lineupId).single();
  if (error) throw error;
  return data;
}

export function useSaveSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveSetArgs) => {
      const { data, error } = await supabase.rpc('save_performance_set', args);
      if (error) throw error;
      return { performance_set_id: data };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sets'] });
      void qc.invalidateQueries({ queryKey: ['set'] });
      void qc.invalidateQueries({ queryKey: ['lineup'] });
      void qc.invalidateQueries({ queryKey: ['lineups'] });
    },
  });
}

/** The one edit a set row accepts: its status (cancel, deactivate, reactivate). */
export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ setId, status }: { setId: string; status: Enums<'record_status'> }) => {
      const { error } = await supabase.from('performance_set').update({ status }).eq('performance_set_id', setId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sets'] });
      void qc.invalidateQueries({ queryKey: ['set'] });
      void qc.invalidateQueries({ queryKey: ['lineup'] });
    },
  });
}
