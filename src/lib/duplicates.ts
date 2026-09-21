import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { normalizeName, safeFilterTerm } from './normalize';

/**
 * Duplicate detection for a new record: active rows whose normalised name
 * contains, or is contained in, the name being typed. "Exact" means the
 * same normalised name — the same thing under the same spelling; "similar"
 * is everything else that matched. One human under several names is normal;
 * two rows for one venue is not.
 */

export type DuplicateKind = 'place' | 'event' | 'artist' | 'person';

export interface DuplicateMatch {
  id: string;
  name: string;
  detail: string;
  path: string;
  exact: boolean;
}

const CONFIG: Record<DuplicateKind, { table: 'place' | 'event' | 'artist' | 'person'; id: string; name: string; select: string; path: string; detail: (r: Record<string, unknown>) => string }> = {
  place: { table: 'place', id: 'place_id', name: 'name', select: 'place_id,name,normalized_name,city,country', path: '/places', detail: (r) => [r.city, r.country].filter(Boolean).join(', ') },
  event: { table: 'event', id: 'event_id', name: 'name', select: 'event_id,name,normalized_name,event_type', path: '/events', detail: (r) => String(r.event_type ?? '') },
  artist: { table: 'artist', id: 'artist_id', name: 'name', select: 'artist_id,name,normalized_name,artist_type,country', path: '/artists', detail: (r) => [r.artist_type, r.country].filter(Boolean).join(' · ') },
  person: { table: 'person', id: 'person_id', name: 'display_name', select: 'person_id,display_name,normalized_name,country', path: '/people', detail: (r) => String(r.country ?? '') },
};

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export async function findDuplicates(kind: DuplicateKind, name: string, excludeId?: string): Promise<DuplicateMatch[]> {
  const cfg = CONFIG[kind];
  const term = normalizeName(safeFilterTerm(name));
  if (term.length < 2) return [];
  // Rows containing the typed name, or whose name the typed name contains
  // ("Pacha" finds "Pacha Ibiza"; "Pacha Ibiza Club" finds "Pacha Ibiza").
  const words = term.split(' ').filter((w) => w.length >= 3);
  const clauses = [`normalized_name.ilike.%${term}%`, ...words.slice(0, 3).map((w) => `normalized_name.ilike.%${w}%`)];
  let query = supabase.from(cfg.table).select(cfg.select).eq('status', 'active').or(clauses.join(',')).limit(8);
  if (excludeId) query = query.neq(cfg.id, excludeId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows
    .map((r) => {
      const norm = String(r.normalized_name ?? '');
      const exact = norm === term;
      const contains = norm.includes(term) || term.includes(norm);
      const shared = norm.split(' ').filter((w) => w.length >= 3 && words.includes(w)).length;
      return { r, norm, exact, score: exact ? 3 : contains ? 2 : shared >= Math.max(1, words.length - 1) ? 1 : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ r, exact }) => ({ id: String(r[cfg.id]), name: String(r[cfg.name]), detail: cfg.detail(r), path: `${cfg.path}/${String(r[cfg.id])}`, exact }));
}

/** Debounced duplicate lookup for a name field of a new record. */
export function useDuplicates(kind: DuplicateKind, name: string, enabled: boolean, excludeId?: string) {
  const debounced = useDebounced(name.trim(), 350);
  return useQuery({
    queryKey: ['duplicates', kind, debounced, excludeId ?? null],
    enabled: enabled && debounced.length >= 2,
    staleTime: 30_000,
    queryFn: () => findDuplicates(kind, debounced, excludeId),
  });
}
