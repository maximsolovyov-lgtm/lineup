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

const dateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

/** Occurrences: "Circoloco · 17 Jul 2026 · UNVRS". Upcoming first. */
export function occurrenceLookup(): Lookup {
  const select = 'occurrence_id,event_date,occurrence_name,status,event(name,normalized_name),place:primary_place_id(name)';
  const toOption = (o: { occurrence_id: string; event_date: string; occurrence_name: string | null; status: string; event: { name: string } | null; place: { name: string } | null }): LookupOption => ({
    id: o.occurrence_id,
    label: `${o.event?.name ?? '?'} · ${dateLabel(o.event_date)}`,
    sublabel: [o.occurrence_name, o.place?.name, o.status !== 'active' ? o.status : null].filter(Boolean).join(' · '),
  });
  return {
    search: async (q) => {
      let query = supabase.from('event_occurrence').select(select).in('status', ['active', 'draft', 'cancelled'])
        .order('event_date', { ascending: false }).limit(30);
      const term = safeFilterTerm(q);
      if (term) {
        // The event name lives on the joined row: filter the embedded resource and drop rows that lost it.
        query = query.not('event', 'is', null).ilike('event.normalized_name', `%${normalizeName(term)}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data.filter((o) => o.event).map(toOption);
    },
    resolve: async (id) => {
      const { data } = await supabase.from('event_occurrence').select(select).eq('occurrence_id', id).maybeSingle();
      return data ? toOption(data) : null;
    },
  };
}

/** Line-ups of one occurrence: "v2 · UNVRS · published 15 May". */
export function lineupLookup(occurrenceId?: string | null): Lookup {
  const select = 'lineup_id,version,published_at,status,occurrence_id,place(name),event_occurrence(event_date,event(name))';
  const toOption = (l: { lineup_id: string; version: number; published_at: string | null; status: string; place: { name: string } | null; event_occurrence: { event_date: string; event: { name: string } | null } | null }): LookupOption => ({
    id: l.lineup_id,
    label: `v${l.version} · ${l.place?.name ?? 'place not announced'}`,
    sublabel: [l.event_occurrence?.event?.name, l.event_occurrence ? dateLabel(l.event_occurrence.event_date) : null,
      l.published_at ? `published ${new Date(l.published_at).toLocaleDateString()}` : null, l.status !== 'active' ? l.status : null].filter(Boolean).join(' · '),
  });
  return {
    search: async () => {
      if (!occurrenceId) return [];
      const { data, error } = await supabase.from('lineup').select(select).eq('occurrence_id', occurrenceId).eq('status', 'active')
        .order('version', { ascending: false }).limit(30);
      if (error) throw error;
      return data.map(toOption);
    },
    resolve: async (id) => {
      const { data } = await supabase.from('lineup').select(select).eq('lineup_id', id).maybeSingle();
      return data ? toOption(data) : null;
    },
  };
}

export function artistLookup(): Lookup {
  const toOption = (a: { artist_id: string; name: string; artist_type: string | null; country: string | null; is_placeholder?: boolean }): LookupOption =>
    ({ id: a.artist_id, label: a.name, sublabel: a.is_placeholder ? 'placeholder — a slot with no name yet' : [a.artist_type, a.country].filter(Boolean).join(' · ') });
  return {
    search: async (q) => {
      // Placeholders first: "TBA" should be the placeholder act, not a band called TBA.
      let query = supabase.from('artist').select('artist_id,name,artist_type,country,is_placeholder').eq('status', 'active')
        .order('is_placeholder', { ascending: false }).order('name').limit(20);
      const f = nameFilter(q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map(toOption);
    },
    resolve: async (id) => {
      const { data } = await supabase.from('artist').select('artist_id,name,artist_type,country,is_placeholder').eq('artist_id', id).maybeSingle();
      return data ? toOption(data) : null;
    },
  };
}

/** Rooms of one place — a set's room must belong to the set's place. */
export function placeSpaceLookup(placeId?: string | null): Lookup {
  const toOption = (s: { space_id: string; name: string; space_type: string | null; is_primary: boolean }): LookupOption =>
    ({ id: s.space_id, label: s.name, sublabel: [s.space_type, s.is_primary ? 'primary' : null].filter(Boolean).join(' · ') || undefined });
  return {
    search: async (q) => {
      if (!placeId) return [];
      let query = supabase.from('place_space').select('space_id,name,space_type,is_primary').eq('place_id', placeId).eq('status', 'active')
        .order('display_order', { ascending: true, nullsFirst: false }).limit(30);
      const f = nameFilter(q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map(toOption);
    },
    resolve: async (id) => {
      const { data } = await supabase.from('place_space').select('space_id,name,space_type,is_primary').eq('space_id', id).maybeSingle();
      return data ? toOption(data) : null;
    },
  };
}

export function eventLookup(): Lookup {
  const toOption = (e: { event_id: string; name: string; event_type: string }): LookupOption => ({ id: e.event_id, label: e.name, sublabel: e.event_type });
  return {
    search: async (q) => {
      let query = supabase.from('event').select('event_id,name,event_type').eq('status', 'active').order('name').limit(20);
      const f = nameFilter(q);
      if (f) query = query.or(f);
      const { data, error } = await query;
      if (error) throw error;
      return data.map(toOption);
    },
    resolve: async (id) => {
      const { data } = await supabase.from('event').select('event_id,name,event_type').eq('event_id', id).maybeSingle();
      return data ? toOption(data) : null;
    },
  };
}
