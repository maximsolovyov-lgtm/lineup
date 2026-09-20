/**
 * Place agent: keywords in, a Place draft out.
 *
 * One Messages request with the server-side web search and web fetch tools,
 * constrained by structured output to the PlaceDraft schema. Runs only in
 * the Pages Function (it needs ANTHROPIC_API_KEY); the browser and other
 * agents reach it through POST /api/agents/place.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { PlaceDraftSchema, splitKeywords, type PlaceAgentResponse, type PlaceDraft } from '../../src/agents/place/schema';
import { geocodePlace } from '../geocode';

export const PLACE_AGENT_MODEL = 'claude-opus-5';

// Frozen so prompt caching can serve it: nothing request-specific in here.
const SYSTEM_PROMPT = `You are the venue-research agent of LineApp, an admin tool for nightlife and electronic-music line-ups. An operator gives you a few keywords about ONE venue ("place"): a name, a city, an Instagram profile, a website. You identify the venue on the web and return a draft of its Place record.

How to work:
1. Identify the venue. Use web_search with the keywords; if a URL was given, web_fetch it first — the official site or Instagram profile is the best source. Prefer official sources (venue site, official social profiles) over listings.
2. Read enough to fill the record: address, city/region/country, capacity, official links, and how the venue runs a night.
3. Return ONLY the structured record. Every field you could not establish from a source is null. Do not invent addresses, capacities, coordinates or handles. Coordinates only if a source states them — otherwise leave them null; the street address you found is geocoded afterwards.

Field semantics that operators get wrong:
- The record describes the PLACE, never one event. lifecycle_type is "permanent" for a club with a fixed address.
- typical_* fields describe how a usual night runs: doors, closing, when the headliner plays. Day offsets are relative to the event date: a night that opens 23:00 and closes 06:00 next morning has end offset 1. Use HH:MM 24-hour wall time in the venue's own zone.
- news_pattern: where and when the venue publishes announcements (site event pages, Instagram posts/stories, RA listings), phrased as advice for an operator who will watch those channels.
- lineup_pattern: opening window, days, room count, which room the headliner plays and around what time.
- spaces: the rooms/stages the venue documents (e.g. "Terrace", "Main Room", "Room 2"). Exactly one is_primary — the main room. If rooms are not documented, return an empty array rather than guessing.
- instagram_account is the bare handle; instagram_url is the full profile URL.
- lineup_pattern_confidence_score is your confidence in the typical-night pattern specifically, from 0 to 1. lineup_pattern_sample_size is how many concrete nights you read it from.
- confidence is your overall confidence that this is the right venue and that the facts are current. matched is false when the keywords do not identify one venue.

Write text fields in English, concise, for an operator.`;

export interface PlaceAgentOptions {
  apiKey: string;
  /** Overrides for tests; defaults are production values. */
  maxSearches?: number;
  maxFetches?: number;
}

export async function draftPlace(rawKeywords: string, opts: PlaceAgentOptions): Promise<PlaceAgentResponse> {
  const keywords = splitKeywords(rawKeywords);
  if (keywords.length === 0) throw new Error('No keywords given');

  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2 });
  const format = zodOutputFormat(PlaceDraftSchema);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Keywords: ${keywords.map((k) => JSON.stringify(k)).join('; ')}\n\nResearch this venue and return its Place draft.` },
  ];

  let usage = { input_tokens: 0, output_tokens: 0, web_searches: 0 };
  let draft: PlaceDraft | null = null;

  // Server tools run inside the API; a long research turn can come back as
  // pause_turn, in which case the assistant turn is appended and the request
  // re-sent — the API resumes where it left off.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await client.messages.parse({
      model: PLACE_AGENT_MODEL,
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: opts.maxSearches ?? 6 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: opts.maxFetches ?? 6, max_content_tokens: 30000 },
      ],
      messages,
    });

    usage = {
      input_tokens: usage.input_tokens + response.usage.input_tokens,
      output_tokens: usage.output_tokens + response.usage.output_tokens,
      web_searches: usage.web_searches + (response.usage.server_tool_use?.web_search_requests ?? 0),
    };

    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    if (response.stop_reason === 'refusal') {
      throw new Error(`The model declined this request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ''}`);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('The draft was cut off (max_tokens); try fewer keywords');
    }
    if (!response.parsed_output) {
      throw new Error('The model returned no structured draft');
    }
    draft = PlaceDraftSchema.parse(response.parsed_output);
    break;
  }

  if (!draft) throw new Error('Research did not finish within the allowed turns');

  // One primary room at most — the database index would refuse two.
  let seenPrimary = false;
  draft.spaces = draft.spaces.map((s) => {
    const p = s.is_primary && !seenPrimary;
    if (s.is_primary) seenPrimary = true;
    return { ...s, is_primary: p };
  });

  // Venue sites rarely publish coordinates; the address they do publish is
  // geocoded here (OpenStreetMap Nominatim) when the model left them null.
  if (draft.matched && draft.place.latitude === null && draft.place.longitude === null) {
    try {
      const hit = await geocodePlace(draft.place);
      if (hit && !hit.approximate) {
        draft.place.latitude = hit.latitude;
        draft.place.longitude = hit.longitude;
        draft.sources.push(hit.source);
        draft.notes = `${draft.notes} Coordinates come from OpenStreetMap for "${hit.display_name}" — check them on a map.`.trim();
      } else if (hit) {
        draft.notes = `${draft.notes} No street-level match on OpenStreetMap; coordinates left empty (only the city centroid was found).`.trim();
      }
    } catch (err) {
      console.error('geocode:', err);
    }
  }

  return { draft, keywords, model: PLACE_AGENT_MODEL, usage };
}

/** The JSON schema consumers (other agents) can use as a tool result schema. */
export function placeDraftJsonSchema(): Record<string, unknown> {
  return zodOutputFormat(PlaceDraftSchema).schema;
}
