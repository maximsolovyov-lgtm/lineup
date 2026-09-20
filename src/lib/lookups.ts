import { supabase } from './supabase';
import { normalizeName, safeFilterTerm } from './normalize';
import type { LookupOption } from '@/components/form/LookupField';

/** PostgREST `or=` filter over normalized_name plus any extra columns; null when the term is empty. */
export function nameFilter(q: string, extraColumns: string[] = []): string | null {
  const term = safeFilterTerm(q);
  if (!term) return null;
  const clauses = [`normalized_name.ilike.%${normalizeName(term)}%`];
  for (const col of extraColumns) clauses.push(`${col}.ilike.%${term}%`);
  return clauses.join(',');
}

export interface Lookup {
  search: (q: string) => Promise<LookupOption[]>;
  resolve: (id: string) => Promise<LookupOption | null>;
}

const placeLabel = (p: { place_id: string; name: string; city: string | null; country: string | null }): LookupOption =>
  ({ id: p.place_id, label: p.name, sublabel: [p.city, p.country].filter(Boolean).join(', ') });

/** Places for the occurrence's default place. `excludeId` keeps a place from choosing itself as parent. */
export function placeLookup(excludeId?: string): Lookup {
  return {
    search: async (q) => {
      let query = supabase.from('place').select('place_id,name,city,country').eq('status', 'active').order('name').limit(20);
      if (excludeId) query = query.neq('place_id', excludeId);
      const f = nameFilter(q, ['city']);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map(placeLabel);
    },
    resolve: async (id) => {
      const { data } = await supabase.from('place').select('place_id,name,city,country').eq('place_id', id).maybeSingle();
      return data ? placeLabel(data) : null;
    },
  };
}

/** People for the artist members picker. Sublabel lists the names they already perform under. */
export function personLookup(): Lookup {
  const select = 'person_id,display_name,country,artist_membership(status,artist(name))';
  const toOption = (p: {
    person_id: string; display_name: string; country: string | null;
    artist_membership: { status: string; artist: { name: string } | null }[];
  }): LookupOption => {
    const names = p.artist_membership.filter((m) => m.status === 'active' && m.artist).map((m) => m.artist!.name);
    return { id: p.person_id, label: p.display_name, sublabel: names.length ? names.join(', ') : p.country ?? undefined };
  };
  return {
    search: async (q) => {
      let query = supabase.from('person').select(select).eq('status', 'active').order('display_name').limit(20);
      const f = nameFilter(q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map(toOption);
    },
    resolve: async (id) => {
      const { data } = await supabase.from('person').select(select).eq('person_id', id).maybeSingle();
      return data ? toOption(data) : null;
    },
  };
}
