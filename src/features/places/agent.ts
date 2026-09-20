import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { PlaceAgentResponse, PlaceDraft } from '@/agents/place/schema';
import { emptyPlaceForm, type PlaceFormValues } from './schema';

/** Calls the place agent through the Pages Function (the API key never reaches the browser). */
export function useDraftPlace() {
  return useMutation({
    mutationFn: (keywords: string) =>
      apiFetch<PlaceAgentResponse>('/api/agents/place', { method: 'POST', body: JSON.stringify({ keywords }) }),
  });
}

const str = (v: string | null) => v ?? '';
const num = (v: number | null) => (v === null ? '' : String(v));

/** The agent's draft as form values — every field the form has, nothing else. */
export function fromDraft(d: PlaceDraft): PlaceFormValues {
  const p = d.place;
  return {
    ...emptyPlaceForm,
    name: p.name,
    lifecycle_type: p.lifecycle_type,
    status: 'active',
    address: str(p.address), city: str(p.city), region: str(p.region), country: str(p.country),
    latitude: num(p.latitude), longitude: num(p.longitude), timezone: str(p.timezone), capacity: num(p.capacity),
    website_url: str(p.website_url),
    instagram_account: str(p.instagram_account), instagram_url: str(p.instagram_url),
    facebook_account: str(p.facebook_account), facebook_url: str(p.facebook_url),
    news_pattern: str(p.news_pattern), lineup_pattern: str(p.lineup_pattern),
    typical_party_start_time: str(p.typical_party_start_time),
    typical_party_end_time: str(p.typical_party_end_time),
    typical_party_start_day_offset: p.typical_party_start_day_offset === null ? '0' : String(p.typical_party_start_day_offset),
    typical_party_end_day_offset: num(p.typical_party_end_day_offset),
    typical_headliner_start_time: str(p.typical_headliner_start_time),
    typical_headliner_start_day_offset: num(p.typical_headliner_start_day_offset),
    typical_headliner_end_time: str(p.typical_headliner_end_time),
    typical_headliner_end_day_offset: num(p.typical_headliner_end_day_offset),
    lineup_pattern_confidence_score: num(p.lineup_pattern_confidence_score),
    lineup_pattern_sample_size: num(p.lineup_pattern_sample_size),
    lineup_pattern_notes: str(p.lineup_pattern_notes),
    spaces: d.spaces.map((s) => ({
      space_id: null,
      name: s.name,
      space_type: str(s.space_type),
      capacity: num(s.capacity),
      notes: str(s.notes),
      is_primary: s.is_primary,
    })),
  };
}
