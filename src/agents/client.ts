import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { AgentKind, AgentResult, Candidate } from './common';

/**
 * Calls a research agent through the Pages Function (the API key never
 * reaches the browser). Pass the chosen candidate on the second call after
 * an "ambiguous" answer.
 */
export function useAgent<TDraft>(kind: AgentKind) {
  return useMutation({
    mutationFn: ({ keywords, candidate }: { keywords: string; candidate?: Candidate }) =>
      apiFetch<AgentResult<TDraft>>(`/api/agents/${kind}`, { method: 'POST', body: JSON.stringify({ keywords, candidate }) }),
  });
}

export interface GeocodeHit {
  latitude: number;
  longitude: number;
  display_name: string;
  kind: string;
  approximate: boolean;
  source: string;
}

/** Address → coordinates through the Function (OpenStreetMap Nominatim); null when nothing matched. */
export function useGeocode() {
  return useMutation({
    mutationFn: (input: { name?: string; address?: string; city?: string; region?: string; country?: string }) =>
      apiFetch<GeocodeHit | null>('/api/agents/geocode', { method: 'POST', body: JSON.stringify(input) }),
  });
}

/** Hostname for a source link; the raw string if the agent returned something that is not a URL. */
export function hostnameOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}
