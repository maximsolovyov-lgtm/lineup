import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { favoriteFilter } from '@/features/favorites/api';
import { supabase } from '@/lib/supabase';
import { instantToWallTime } from '@/lib/datetime';
import type { Enums } from '@/types/database';
import { slotLabel, type LineupSlotRow, type SaveLineupArgs } from './schema';

/** The acts of a slot, in printed order, for every query that shows a line-up. */
const SLOT_SELECT = '*,lineup_artist_participant(participant_order,artist_id,artist(name))' as const;

/**
 * The night a line-up is for, as the operator needs to see it: start day and
 * time, end day and time, in the venue's zone — a line-up published for "26
 * September" belongs to the night that starts then, whatever hour it ends.
 */
export function useOccurrenceWindow(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['occurrence-window', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('event_occurrence')
        .select('occurrence_id,event_id,event_date,starts_at,ends_at,timezone,occurrence_name,status,event(name),place:primary_place_id(name)')
        .eq('occurrence_id', occurrenceId!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const start = instantToWallTime(data.starts_at, data.timezone);
      const end = instantToWallTime(data.ends_at, data.timezone);
      return {
        ...data,
        start_date: start.slice(0, 10) || data.event_date,
        start_time: start.slice(11, 16),
        end_date: end.slice(0, 10) || data.event_date,
        end_time: end.slice(11, 16),
      };
    },
  });
}

/** TBA, Surprise guest, Secret guest, Unknown — pickable in a slot like any act. */
export function usePlaceholderArtists() {
  return useQuery({
    queryKey: ['placeholder-artists'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('artist').select('artist_id,name,placeholder_type')
        .eq('is_placeholder', true).eq('status', 'active').order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

/** The rooms of the line-up's place, by id: a collapsed slot shows a name, not a picker. */
export function usePlaceSpaces(placeId: string | null | undefined) {
  return useQuery({
    queryKey: ['place-spaces', placeId],
    enabled: !!placeId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('place_space').select('space_id,name').eq('place_id', placeId!).eq('status', 'active');
      if (error) throw error;
      return new Map(data.map((s) => [s.space_id, s.name]));
    },
  });
}

/** The acts of one slot in printed order. */
function actNames(slot: { lineup_artist_participant?: { participant_order: number; artist: { name: string } | null }[] | null }): string[] {
  return [...(slot.lineup_artist_participant ?? [])]
    .sort((a, b) => a.participant_order - b.participant_order)
    .map((p) => p.artist?.name ?? '')
    .filter(Boolean);
}

export interface LineupsListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
  /** Given, only these ids — the operator's favourites. */
  favoriteIds?: string[] | null;
}

const LIST_SELECT =
  'lineup_id,version,published_at,status,updated_at,created_at,place(name),event_occurrence(event_date,occurrence_name,event(name,normalized_name)),lineup_artist(status,is_headliner,kind,placeholder_type,display_name_override,lineup_artist_participant(participant_order,artist(name))),performance_set(status)' as const;

export function useLineups(params: LineupsListParams) {
  return useQuery({
    queryKey: ['lineups', params],
    queryFn: async () => {
      let query = supabase.from('lineup').select(LIST_SELECT).order('created_at', { ascending: false }).limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      const favorites = favoriteFilter(params.favoriteIds);
      if (favorites) query = query.in('lineup_id', favorites);
      const term = params.q.trim();
      if (term) query = query.not('event_occurrence', 'is', null).ilike('event_occurrence.event.normalized_name', `%${term.toLowerCase()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data
        .filter((l) => l.event_occurrence)
        .map(({ lineup_artist, performance_set, ...l }) => {
          const active = lineup_artist.filter((a) => a.status === 'active');
          const labels = new Map(active.map((a) => [a, slotLabel(a.kind, actNames(a), a.display_name_override ?? '')]));
          const names = active.map((a) => labels.get(a) || '?');
          return {
            ...l,
            artist_count: active.reduce((n, a) => n + actNames(a).length, 0) || active.length,
            headliners: active.filter((a) => a.is_headliner).map((a) => labels.get(a) || '?'),
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
        supabase.from('lineup_artist').select(SLOT_SELECT).eq('lineup_id', lineupId!).eq('status', 'active')
          .order('billing_order', { ascending: true, nullsFirst: false }).order('created_at'),
        supabase.from('performance_set').select('performance_set_id,set_type,scenario_type,scheduled_start_at,status,artist_list_json')
          .eq('lineup_id', lineupId!).in('status', ['active', 'cancelled']).order('scheduled_start_at', { ascending: true, nullsFirst: false }),
      ]);
      if (lineup.error) throw lineup.error;
      if (artists.error) throw artists.error;
      if (sets.error) throw sets.error;
      return { lineup: lineup.data, artists: artists.data as LineupSlotRow[], sets: sets.data };
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

/** A line-up and its active artists, to start the next version from. */
export async function fetchLineupForClone(lineupId: string) {
  const [lineup, artists] = await Promise.all([
    supabase.from('lineup').select('*').eq('lineup_id', lineupId).maybeSingle(),
    supabase.from('lineup_artist').select(SLOT_SELECT).eq('lineup_id', lineupId).eq('status', 'active').order('billing_order', { ascending: true, nullsFirst: false }),
  ]);
  if (lineup.error) throw lineup.error;
  if (artists.error) throw artists.error;
  return lineup.data ? { lineup: lineup.data, artists: artists.data as LineupSlotRow[] } : null;
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
