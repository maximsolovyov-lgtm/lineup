/**
 * Address → coordinates through OpenStreetMap Nominatim.
 *
 * No key, no account. Its usage policy allows light, attributed use like
 * this admin (a request per operator action), asks for an identifying
 * User-Agent and at most one request per second, and forbids bulk
 * geocoding — do not loop this over a table.
 */

export interface GeocodeHit {
  latitude: number;
  longitude: number;
  /** What Nominatim matched, for the operator to sanity-check. */
  display_name: string;
  /** OSM feature class/type, e.g. "amenity/nightclub" or "place/city". */
  kind: string;
  /** The request URL, recorded as a source. */
  source: string;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'LineApp-Admin/0.1 (+https://github.com/maximsolovyov-lgtm/lineup)';

/** One lookup; null when nothing matched. Throws only on network/HTTP failure. */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeHit | null> {
  const q = query.replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const url = `${ENDPOINT}?${new URLSearchParams({ q, format: 'jsonv2', limit: '1', addressdetails: '0' })}`;
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json', 'accept-language': 'en' }, signal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string; category?: string; class?: string; type?: string }[];
  const hit = rows[0];
  if (!hit) return null;
  const latitude = Number(hit.lat);
  const longitude = Number(hit.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    display_name: hit.display_name,
    kind: [hit.category ?? hit.class, hit.type].filter(Boolean).join('/'),
    source: url,
  };
}

export interface GeocodeInput {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

/**
 * Tries the most specific query first, then falls back: the street address
 * with the city, then the venue name with the city (Nominatim knows many
 * clubs as POIs), then the city alone — the last one is flagged as
 * approximate, because a city centroid is not a venue.
 */
export async function geocodePlace(input: GeocodeInput, signal?: AbortSignal): Promise<(GeocodeHit & { approximate: boolean }) | null> {
  const city = [input.city, input.region, input.country].filter(Boolean).join(', ');
  const attempts: { q: string; approximate: boolean }[] = [];
  if (input.address && city) attempts.push({ q: `${input.address}, ${city}`, approximate: false });
  if (input.name && city) attempts.push({ q: `${input.name}, ${city}`, approximate: false });
  if (input.address && !city) attempts.push({ q: input.address, approximate: false });
  if (city) attempts.push({ q: city, approximate: true });

  for (const [i, a] of attempts.entries()) {
    // The usage policy asks for at most one request per second.
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    const hit = await geocode(a.q, signal);
    if (hit) return { ...hit, approximate: a.approximate };
  }
  return null;
}
