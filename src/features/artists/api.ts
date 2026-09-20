import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nameFilter } from '@/lib/lookups';
import type { Enums, Tables } from '@/types/database';
import type { SaveArtistArgs } from './schema';

export type ArtistRow = Tables<'artist'>;

export interface ArtistsListParams {
  q: string;
  status: Enums<'record_status'> | 'all';
}

const LIST_SELECT = 'artist_id,name,artist_type,country,status,updated_at,created_at,artist_membership(status,ended_at)' as const;

export function useArtists(params: ArtistsListParams) {
  return useQuery({
    queryKey: ['artists', params],
    queryFn: async () => {
      let query = supabase.from('artist').select(LIST_SELECT).order('name').limit(200);
      if (params.status !== 'all') query = query.eq('status', params.status);
      const f = nameFilter(params.q, ['country']);
      if (f) query = query.or(f);
      // review_task has no foreign key to artist (entity_id is polymorphic),
      // so PostgREST cannot embed it; one extra query covers the whole page.
      const [list, reviews] = await Promise.all([
        query,
        supabase.from('review_task').select('entity_id').eq('entity_type', 'artist').eq('status', 'active'),
      ]);
      if (list.error) throw list.error;
      if (reviews.error) throw reviews.error;
      const open = new Map<string, number>();
      for (const r of reviews.data) open.set(r.entity_id, (open.get(r.entity_id) ?? 0) + 1);
      return list.data.map(({ artist_membership, ...a }) => ({
        ...a,
        member_count: artist_membership.filter((m) => m.status === 'active' && m.ended_at === null).length,
        open_reviews: open.get(a.artist_id) ?? 0,
      }));
    },
  });
}

/** The artist, its active memberships in display order, and its open review tasks. */
export function useArtist(artistId: string | undefined) {
  return useQuery({
    queryKey: ['artist', artistId],
    enabled: !!artistId,
    queryFn: async () => {
      const [artist, members, reviews] = await Promise.all([
        supabase.from('artist').select('*').eq('artist_id', artistId!).single(),
        supabase.from('artist_membership')
          .select('membership_id,person_id,membership_role,is_primary,display_order,started_at,ended_at,person(display_name,country)')
          .eq('artist_id', artistId!).eq('status', 'active')
          .order('display_order', { ascending: true, nullsFirst: false }).order('created_at'),
        supabase.from('review_task').select('review_task_id,kind,message,created_at')
          .eq('entity_type', 'artist').eq('entity_id', artistId!).eq('status', 'active'),
      ]);
      if (artist.error) throw artist.error;
      if (members.error) throw members.error;
      if (reviews.error) throw reviews.error;
      return { artist: artist.data, members: members.data, reviews: reviews.data };
    },
  });
}

/** Artist and members in one RPC — one transaction, people created inline included. */
export function useSaveArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveArtistArgs) => {
      const { data, error } = await supabase.rpc('save_artist_with_members', args);
      if (error) throw error;
      return { artist_id: data };
    },
    onSuccess: ({ artist_id }) => {
      void qc.invalidateQueries({ queryKey: ['artists'] });
      void qc.invalidateQueries({ queryKey: ['artist', artist_id] });
      void qc.invalidateQueries({ queryKey: ['people'] });
    },
  });
}
