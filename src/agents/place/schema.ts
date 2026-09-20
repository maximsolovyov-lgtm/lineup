// zod/v4: the Anthropic SDK's zodOutputFormat() builds the JSON schema from v4 schemas.
import { z } from 'zod/v4';

/**
 * Contract of the place agent: what it returns for a keyword string.
 * Shared by the browser (typing the response) and the Pages Function (the
 * structured-output schema Claude must follow, and the validation of what
 * came back). Field names match public.place and public.place_space, so a
 * consumer can hand `place` to save_place_with_spaces() as p_place and
 * `spaces` as p_spaces without renaming anything.
 *
 * Every fact the agent could not establish is null — never a guess.
 */

const nullableStr = z.string().nullable().describe('null when not established from a source');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().describe('Wall-clock time HH:MM in the venue zone, or null');

export const PlaceDraftPlaceSchema = z.object({
  name: z.string().describe('Official venue name as it presents itself, e.g. "Club Space" not "space miami"'),
  lifecycle_type: z.enum(['permanent', 'temporary', 'mobile', 'virtual']).describe('permanent for a fixed club; temporary for a pop-up or festival site; mobile for a boat/bus party; virtual for online'),
  address: nullableStr.describe('Street address without city; null if unknown'),
  city: nullableStr,
  region: nullableStr.describe('State, province or island, e.g. "Florida", "Balearic Islands"'),
  country: nullableStr.describe('Country name in English, e.g. "United States", "Spain"'),
  latitude: z.number().nullable().describe('Decimal degrees, -90..90, only if found in a source'),
  longitude: z.number().nullable().describe('Decimal degrees, -180..180, only if found in a source'),
  timezone: nullableStr.describe('IANA zone of the venue, e.g. "America/New_York" — derive from the city'),
  capacity: z.number().int().nullable().describe('Total venue capacity as an integer; null if unknown'),

  website_url: nullableStr.describe('Official website, https://…'),
  instagram_account: nullableStr.describe('Instagram handle WITHOUT @, e.g. "clubspacemiami"'),
  instagram_url: nullableStr.describe('https://www.instagram.com/<handle>'),
  facebook_account: nullableStr,
  facebook_url: nullableStr,

  news_pattern: nullableStr.describe('1–3 sentences for an operator: where and when this venue announces events, line-ups, room changes, cancellations and final timetables'),
  lineup_pattern: nullableStr.describe('1–3 sentences: opening window, days of the week, number of rooms, which room the headliner plays and when'),
  typical_party_start_time: hhmm.describe('Usual doors/start time'),
  typical_party_end_time: hhmm.describe('Usual closing time'),
  typical_party_start_day_offset: z.number().int().nullable().describe('0 = same day as the event date'),
  typical_party_end_day_offset: z.number().int().nullable().describe('1 when the night ends the next morning'),
  typical_headliner_start_time: hhmm,
  typical_headliner_start_day_offset: z.number().int().nullable(),
  typical_headliner_end_time: hhmm,
  typical_headliner_end_day_offset: z.number().int().nullable(),
  lineup_pattern_confidence_score: z.number().nullable().describe('0..1: how well the sources support the typical-night pattern; null if no pattern was found'),
  lineup_pattern_sample_size: z.number().int().nullable().describe('How many concrete nights/events the pattern was read from; null if none'),
  lineup_pattern_notes: nullableStr.describe('Where the pattern came from and what is uncertain'),
});

export const PlaceDraftSpaceSchema = z.object({
  name: z.string().describe('Room or stage name as the venue calls it, e.g. "Terrace", "Room 1"'),
  space_type: nullableStr.describe('One of main_room, room, terrace, outdoor, stage, garden, intimate, bar, vip — or null'),
  capacity: z.number().int().nullable(),
  notes: nullableStr,
  is_primary: z.boolean().describe('true for exactly one room: the main room where headliners play. false for all others'),
});

export const PlaceDraftSchema = z.object({
  matched: z.boolean().describe('true if the keywords identify one real venue. false if nothing was found or several venues are equally plausible — then fill only what is certain'),
  place: PlaceDraftPlaceSchema,
  spaces: z.array(PlaceDraftSpaceSchema).describe('Known rooms and stages; empty if none are documented. At most one is_primary'),
  sources: z.array(z.string()).describe('URLs actually consulted for the facts above'),
  confidence: z.number().describe('0..1 overall confidence that this is the right venue and the facts are current'),
  notes: z.string().describe('For the operator: what could not be established, ambiguities, what to double-check'),
});

export type PlaceDraft = z.infer<typeof PlaceDraftSchema>;

/** Request body of POST /api/agents/place. */
export const PlaceAgentRequestSchema = z.object({
  keywords: z.string().trim().min(2).max(2000).describe('Keywords separated by ";" — a venue name, a city, an Instagram profile or website URL'),
});
export type PlaceAgentRequest = z.infer<typeof PlaceAgentRequestSchema>;

/** Response body: the draft plus what it cost. */
export interface PlaceAgentResponse {
  draft: PlaceDraft;
  keywords: string[];
  model: string;
  usage: { input_tokens: number; output_tokens: number; web_searches: number };
}

export function splitKeywords(raw: string): string[] {
  return raw.split(';').map((k) => k.trim()).filter(Boolean);
}
