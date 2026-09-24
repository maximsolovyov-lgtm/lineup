import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFavorites, useToggleFavorite, type FavoriteEntity } from '@/features/favorites/api';

/**
 * The star on a record. Personal to the signed-in operator, and it never
 * opens the row it sits in — list rows navigate on click.
 */
export function FavoriteStar({ entity, id, className }: { entity: FavoriteEntity; id: string; className?: string }) {
  const favorites = useFavorites(entity);
  const toggle = useToggleFavorite(entity);
  const on = favorites.data?.has(id) ?? false;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Remove from favourites' : 'Add to favourites'}
      title={on ? 'In your favourites — click to remove' : 'Add to your favourites'}
      className={cn('rounded-md p-1 transition-colors hover:bg-black/5', className)}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggle.mutate({ id, on: !on }); }}
    >
      <Star className={cn('h-4 w-4', on ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40')} />
    </button>
  );
}

/** The "only my favourites" toggle for a list header. */
export function FavoriteFilter({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title="Show only the records you starred"
      onClick={() => onChange(!on)}
      className={cn('flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
        on ? 'border-amber-300 bg-amber-50 text-amber-900' : 'bg-card text-muted-foreground hover:bg-secondary/60')}
    >
      <Star className={cn('h-4 w-4', on ? 'fill-amber-400 text-amber-500' : '')} />
      Favourites
    </button>
  );
}
