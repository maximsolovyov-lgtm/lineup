import { supabase } from '@/lib/supabase';
import { normalizeName } from '@/lib/normalize';
import type { ArtistDraft } from '@/agents/artist/schema';
import { emptyArtistForm, type ArtistFormValues, type MemberFormValue } from './schema';

const str = (v: string | null) => v ?? '';

export interface ArtistDraftMapping {
  values: ArtistFormValues;
  /** Members that were linked to a person already in the database, by public name. */
  linked: string[];
  /** Members that will be created as new people when the artist is saved. */
  created: string[];
}

/**
 * The agent's draft as form values. Each drafted member is looked up among
 * existing people by normalised public name: one exact match links that
 * person (the same rule the picker's duplicate warning uses); anything else
 * becomes a new person created with the artist in one transaction.
 */
export async function fromDraft(d: ArtistDraft): Promise<ArtistDraftMapping> {
  const names = d.members.map((m) => normalizeName(m.display_name)).filter(Boolean);
  const existing = new Map<string, { person_id: string; display_name: string; country: string | null }>();
  if (names.length > 0) {
    const { data } = await supabase.from('person').select('person_id,display_name,country,normalized_name')
      .eq('status', 'active').in('normalized_name', names);
    for (const p of data ?? []) {
      // Two people with the same normalised name: link neither — the operator decides in the picker.
      if (p.normalized_name) existing.set(p.normalized_name, existing.has(p.normalized_name) ? { person_id: '', display_name: '', country: null } : p);
    }
  }

  const linked: string[] = [];
  const created: string[] = [];
  const members: MemberFormValue[] = d.members.map((m) => {
    const hit = existing.get(normalizeName(m.display_name));
    const base = {
      membership_id: null,
      membership_role: m.membership_role ?? '',
      is_primary: false,
      started_at: m.started_at ?? '',
      ended_at: m.ended_at ?? '',
    };
    if (hit && hit.person_id) {
      linked.push(hit.display_name);
      return { ...base, person_id: hit.person_id, new_person: null, display_name: hit.display_name, sublabel: hit.country ?? 'existing person' };
    }
    created.push(m.display_name);
    return {
      ...base,
      person_id: null,
      new_person: { display_name: m.display_name, country: str(m.country), notes: str(m.notes) },
      display_name: m.display_name,
      sublabel: m.country ? `${m.country} · new` : 'new',
    };
  });

  return {
    values: {
      ...emptyArtistForm,
      name: d.artist.name,
      artist_type: d.artist.artist_type,
      country: str(d.artist.country),
      instagram_url: str(d.artist.instagram_url),
      status: 'active',
      members,
    },
    linked,
    created,
  };
}
