import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Enums } from '@/types/database';
import type { SaveLineupArgs } from './schema';

export interface LineupsListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
}

const LIST_SELECT =
  'lineup_id,version,published_at,status,updated_at,created_at,place(name),event_occurrence(event_date,occurrence_name,event(name,normalized_name)),lineup_artist(status,is_headliner,artist(name),placeholder_type,display_name_override),performance_set(status)' as const;

export function useLineups(params: LineupsListParams) {
  return useQuery({
    queryKey: ['lineups', params],
    queryFn: async () => {
      let query = supabase.from('lineup').select(LIST_SELECT).order('created_at', { ascending: false }).limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      const term = params.q.trim();
      if (term) query = query.not('event_occurrence', 'is', null).ilike('event_occurrence.event.normalized_name', `%${term.toLowerCase()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data
        .filter((l) => l.event_occurrence)
        .map(({ lineup_artist, performance_set, ...l }) => {
          const active = lineup_artist.filter((a) => a.status === 'active');
          const names = active.map((a) => a.artist?.name ?? a.display_name_override ?? (a.placeholder_type === 'tbd' ? 'TBA' : 'Secret guest'));
          return {
            ...l,
            artist_count: active.length,
            headliners: active.filter((a) => a.is_headliner).map((a) => a.artist?.name ?? a.display_name_override ?? '?'),
            preview: names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : ''),
            set_count: performance_set.filter((s) => s.status === 'active').length,
          };
        });
    },
  });
}

/** The line-up with its active artists in billing order, plus the occurrence and place for the header. */
export function useLineup(lineupId: string | undefined) {
  return useQuery({
    queryKey: ['lineup', lineupId],
    enabled: !!lineupId,
    queryFn: async () => {
      const [lineup, artists, sets] = await Promise.all([
        supabase.from('lineup').select('*,place(name),event_occurrence(event_date,occurrence_name,event(name))').eq('lineup_id', lineupId!).single(),
        supabase.from('lineup_artist').select('*').eq('lineup_id', lineupId!).eq('status', 'active')
          .order('billing_order', { ascending: true, nullsFirst: false }).order('created_at'),
        supabase.from('performance_set').select('performance_set_id,set_type,scenario_type,scheduled_start_at,status,artist_list_json')
          .eq('lineup_id', lineupId!).in('status', ['active', 'cancelled']).order('scheduled_start_at', { ascending: true, nullsFirst: false }),
      ]);
      if (lineup.error) throw lineup.error;
      if (artists.error) throw artists.error;
      if (sets.error) throw sets.error;
      return { lineup: lineup.data, artists: artists.data, sets: sets.data };
    },
  });
}

/** Other versions of the same (occurrence, place), for the version strip. */
export function useLineupVersions(occurrenceId: string | undefined, placeId: string | null | undefined) {
  return useQuery({
    queryKey: ['lineup-versions', occurrenceId, placeId ?? null],
    enabled: !!occurrenceId,
    queryFn: async () => {
      let query = supabase.from('lineup').select('lineup_id,version,published_at,status').eq('occurrence_id', occurrenceId!).order('version');
      query = placeId ? query.eq('place_id', placeId) : query.is('place_id', null);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveLineup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveLineupArgs) => {
      const { data, error } = await supabase.rpc('save_lineup', args);
      if (error) throw error;
      return { lineup_id: data };
    },
    onSuccess: ({ lineup_id }) => {
      void qc.invalidateQueries({ queryKey: ['lineups'] });
      void qc.invalidateQueries({ queryKey: ['lineup', lineup_id] });
      void qc.invalidateQueries({ queryKey: ['lineup-versions'] });
    },
  });
}
