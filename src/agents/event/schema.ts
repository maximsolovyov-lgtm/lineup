// zod/v4: the Anthropic SDK's zodOutputFormat() builds the JSON schema from v4 schemas.
import { z } from 'zod/v4';

/**
 * Draft of the event agent: a reusable brand and its announced dates.
 * `event` maps onto p_event of save_event_with_occurrences(); each date
 * becomes an occurrence once the form has matched its venue to a place.
 */
const nullableStr = z.string().nullable().describe('null when not established from a source');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().describe('HH:MM wall time in the venue zone, or null');

export const EventDraftOccurrenceSchema = z.object({
  event_date: z.string().describe('YYYY-MM-DD, the START day = the BUSINESS DAY: the night the party starts. 23:00 Friday to 08:00 Saturday is Friday'),
  end_date: z.string().nullable().describe('YYYY-MM-DD, the day it ends: the next morning for a club night, days later for a festival. null if it ends the same night or is unknown'),
  place_name: nullableStr.describe('Venue name as the announcement gives it, e.g. "Black Rock City", "Hï Ibiza"'),
  city: nullableStr,
  region: nullableStr.describe('State, province or island, e.g. "Nevada", "Balearic Islands"'),
  country: nullableStr.describe('Country name in English'),
  timezone: nullableStr.describe('IANA zone of the venue, e.g. "America/Los_Angeles"'),
  place_lifecycle_type: z.enum(['permanent', 'temporary', 'mobile', 'virtual']).nullable().describe('permanent for a club or arena; temporary for a festival site or pop-up; mobile for a boat; virtual for online'),
  start_time: hhmm.describe('Doors/start; null if not announced'),
  end_time: hhmm.describe('Close; null if not announced'),
  occurrence_name: nullableStr.describe('The name of this edition or night as announced, filled whenever one exists: "Tomorrowland Winter", "Opening Party", "Closing Party", "Weekend 2", "Circoloco x DC-10 Season Opening". null only when the date has no name of its own'),
  source: nullableStr.describe('URL of the announcement'),
});

export const EventDraftSchema = z.object({
  event: z.object({
    name: z.string().describe('The brand or concept name, e.g. "Circoloco" — not one date'),
    event_type: z.enum(['party', 'festival', 'concert', 'afterparty', 'label_night', 'other', 'unknown']),
    website_url: nullableStr.describe('Official site, https://…'),
    description: nullableStr.describe('Two or three sentences for an operator: what this brand is, who runs it, where it usually happens'),
  }),
  occurrences: z.array(EventDraftOccurrenceSchema).describe('Announced dates from today onwards, soonest first, at most 20. Empty if none are announced'),
  instagram_url: nullableStr.describe('Official Instagram profile, for the operator'),
});
export type EventDraft = z.infer<typeof EventDraftSchema>;
