/**
 * Place agent: keywords in, a venue draft out (or candidates to choose from).
 * The research loop is shared (../research.ts); this file is the prompt and
 * the geocoding step.
 */
import { PlaceDraftSchema, type PlaceDraft } from '../../src/agents/place/schema';
import { geocodePlace } from '../geocode';
import type { AgentKindDefinition } from '../research';

const SYSTEM_PROMPT = `You are the venue-research agent of LineApp, an admin tool for nightlife and electronic-music line-ups. An operator gives you a few keywords about ONE venue ("place"): a name, a city, an Instagram profile, a website. You identify the venue on the web and return a draft of its Place record.

How to work:
1. Identify the venue. Use web_search with the keywords; if a URL was given, web_fetch it first — the official site or Instagram profile is the best source. Prefer official sources (venue site, official social profiles) over listings.
2. Read enough to fill the record: address, city/region/country, capacity, official links, and how the venue runs a night.
3. Return ONLY the structured record. Do not invent addresses, capacities, coordinates or handles. Coordinates only if a source states them — otherwise leave them null; the street address you found is geocoded afterwards.

Field semantics that operators get wrong:
- The record describes the PLACE, never one event. lifecycle_type is "permanent" for a club with a fixed address.
- typical_* fields describe how a usual night runs: doors, closing, when the headliner plays. Day offsets are relative to the event date: a night that opens 23:00 and closes 06:00 next morning has end offset 1. Use HH:MM 24-hour wall time in the venue's own zone.
- news_pattern: where and when the venue publishes announcements (site event pages, Instagram posts/stories, RA listings), phrased as advice for an operator who will watch those channels.
- lineup_pattern: opening window, days, room count, which room the headliner plays and around what time.
- spaces: the rooms/stages the venue documents (e.g. "Terrace", "Main Room", "Room 2"). Exactly one is_primary — the main room. If rooms are not documented, return an empty array rather than guessing. Name each room the way the venue itself does, once: "Theatre", "The Theatre" and "Theatre Room" are one room — pick the venue's own spelling and do not list it twice.
- instagram_account is the bare handle; instagram_url is the full profile URL.
- lineup_pattern_confidence_score is your confidence in the typical-night pattern specifically, from 0 to 1. lineup_pattern_sample_size is how many concrete nights you read it from.`;

export const placeAgent: AgentKindDefinition<PlaceDraft> = {
  kind: 'place',
  noun: 'venue',
  draftSchema: PlaceDraftSchema,
  systemPrompt: SYSTEM_PROMPT,
  postProcess: async (draft, ctx) => {
    // One primary room at most — the database index would refuse two.
    let seenPrimary = false;
    draft.spaces = draft.spaces.map((s) => {
      const p = s.is_primary && !seenPrimary;
      if (s.is_primary) seenPrimary = true;
      return { ...s, is_primary: p };
    });

    // Venue sites rarely publish coordinates; the address they do publish is
    // geocoded here (OpenStreetMap Nominatim) when the model left them null.
    let { notes, sources } = ctx;
    if (draft.place.latitude === null && draft.place.longitude === null) {
      try {
        const hit = await geocodePlace(draft.place);
        if (hit && !hit.approximate) {
          draft.place.latitude = hit.latitude;
          draft.place.longitude = hit.longitude;
          sources = [...sources, hit.source];
          notes = `${notes} Coordinates come from OpenStreetMap for "${hit.display_name}" — check them on a map.`.trim();
        } else if (hit) {
          notes = `${notes} No street-level match on OpenStreetMap; coordinates left empty (only the city centroid was found).`.trim();
        }
      } catch (err) {
        console.error('geocode:', err);
      }
    }
    return { draft, notes, sources };
  },
};
