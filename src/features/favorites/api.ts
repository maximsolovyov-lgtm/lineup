import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Favourites are personal: the table is scoped to auth.uid() by RLS, so a
 * star is never shared and never cleared by someone else. Toggling is an
 * insert or a delete — there is nothing to update.
 */
export const FAVORITE_ENTITIES = ['place', 'event', 'artist', 'person', 'lineup', 'performance_set', 'event_occurrence'] as const;
export type FavoriteEntity = (typeof FAVORITE_ENTITIES)[number];

/** A filter that matches nothing, for "favourites only" with no favourites yet. */
const NO_MATCH = '00000000-0000-0000-0000-000000000000';

/** ids for an `.in()` filter: null = no filtering, [] = match nothing. */
export function favoriteFilter(ids: string[] | null | undefined): string[] | null {
  if (!ids) return null;
  return ids.length > 0 ? ids : [NO_MATCH];
}

export function useFavorites(entity: FavoriteEntity) {
  return useQuery({
    queryKey: ['favorites', entity],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_favorite').select('entity_id').eq('entity_type', entity);
      if (error) throw error;
      return new Set(data.map((r) => r.entity_id));
    },
  });
}

export function useToggleFavorite(entity: FavoriteEntity) {
  const qc = useQueryClient();
  const key = ['favorites', entity];
  return useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) throw new Error('Signed out — sign in again to star records');
      if (on) {
        const { error } = await supabase.from('user_favorite').insert({ user_id: userId, entity_type: entity, entity_id: id });
        // 23505 = already starred in another tab; that is the wanted state.
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await supabase.from('user_favorite').delete().eq('entity_type', entity).eq('entity_id', id);
        if (error) throw error;
      }
    },
    // The star must answer the click, not the round trip.
    onMutate: async ({ id, on }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Set<string>>(key);
      const next = new Set(before ?? []);
      if (on) next.add(id); else next.delete(id);
      qc.setQueryData(key, next);
      return { before };
    },
    onError: (_e, _v, ctx) => { if (ctx?.before) qc.setQueryData(key, ctx.before); },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key }); },
  });
}
