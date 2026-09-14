import { supabase } from './supabase';
import { normalizeName, safeFilterTerm } from './normalize';
import type { LookupOption } from '@/components/form/LookupField';

/** Adds a case-insensitive filter over normalized_name plus any extra columns. */
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

export function placeLookup(excludeId?: string): Lookup {
  return {
    search: async (q) => {
      let query = supabase.from('place').select('place_id,name,city,country').order('name').limit(20);
      if (excludeId) query = query.neq('place_id', excludeId);
      const f = nameFilter(q, ['city']);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map((p) => ({
        id: p.place_id,
        label: p.name,
        sublabel: [p.city, p.country].filter(Boolean).join(', '),
      }));
    },
    resolve: async (id) => {
      const { data } = await supabase.from('place').select('place_id,name,city,country').eq('place_id', id).maybeSingle();
      return data ? { id: data.place_id, label: data.name, sublabel: [data.city, data.country].filter(Boolean).join(', ') } : null;
    },
  };
}

export function eventLookup(): Lookup {
  return {
    search: async (q) => {
      let query = supabase.from('event').select('event_id,name,event_type').order('name').limit(20);
      const f = nameFilter(q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map((e) => ({ id: e.event_id, label: e.name, sublabel: e.event_type }));
    },
    resolve: async (id) => {
      const { data } = await supabase.from('event').select('event_id,name,event_type').eq('event_id', id).maybeSingle();
      return data ? { id: data.event_id, label: data.name, sublabel: data.event_type } : null;
    },
  };
}

/** Spaces, optionally constrained to one place — a stage must belong to the set's place. */
export function placeSpaceLookup(placeId?: string | null): Lookup {
  return {
    search: async (q) => {
      let query = supabase.from('place_space').select('space_id,name,space_type,place_id').order('name').limit(20);
      if (placeId) query = query.eq('place_id', placeId);
      const f = nameFilter(q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map((s) => ({ id: s.space_id, label: s.name, sublabel: s.space_type ?? undefined }));
    },
    resolve: async (id) => {
      const { data } = await supabase.from('place_space').select('space_id,name,space_type').eq('space_id', id).maybeSingle();
      return data ? { id: data.space_id, label: data.name, sublabel: data.space_type ?? undefined } : null;
    },
  };
}

export function artistLookup(): Lookup {
  return {
    search: async (q) => {
      let query = supabase.from('artist').select('artist_id,name,artist_type').order('name').limit(20);
      const f = nameFilter(q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map((a) => ({ id: a.artist_id, label: a.name, sublabel: a.artist_type ?? undefined }));
    },
    resolve: async (id) => {
      const { data } = await supabase.from('artist').select('artist_id,name,artist_type').eq('artist_id', id).maybeSingle();
      return data ? { id: data.artist_id, label: data.name, sublabel: data.artist_type ?? undefined } : null;
    },
  };
}
