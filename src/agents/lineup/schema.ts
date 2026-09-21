// zod/v4: the Anthropic SDK's zodOutputFormat() builds the JSON schema from v4 schemas.
import { z } from 'zod/v4';

/**
 * Draft of the line-up agent. Two questions in one answer:
 *  - occurrence: does this night exist (or which night the keywords mean)?
 *    Filled when the request did not name a stored occurrence, or when the
 *    publication corrects the date or venue. null when the occurrence given
 *    is the right one as it stands.
 *  - lineup: the announced roster for that night — null when nothing has
 *    been published yet. Names as printed; the form matches them to artist
 *    records and creates the missing ones.
 */
const nullableStr = z.string().nullable().describe('null when not established from a source');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().describe('HH:MM wall time in the venue zone, or null');

export const LineupDraftSlotSchema = z.object({
  name: z.string().describe('The act exactly as the announcement prints it, e.g. "Solomun", "Tale Of Us", "Keinemusik"'),
  is_headliner: z.boolean().describe('true for the headliner(s) the announcement emphasises'),
  placeholder: z.enum(['tbd', 'secret_guest']).nullable().describe('"tbd" for a slot printed as TBA/TBC; "secret_guest" for "special guest"/"secret guest"; null for a named act'),
  room: nullableStr.describe('The room or stage the announcement assigns the act to, if it does'),
  note: nullableStr.describe('"b2b with X", "live", "closing set", "all night long" — only if printed'),
});

export const LineupDraftSchema = z.object({
  occurrence: z.object({
    event_name: z.string().describe('The event brand as announced, e.g. "Solomun +1"'),
    event_type: z.enum(['party', 'festival', 'concert', 'afterparty', 'label_night', 'other', 'unknown']),
    event_date: z.string().describe('YYYY-MM-DD, the business day: the night the party starts'),
    end_date: z.string().nullable().describe('YYYY-MM-DD if it ends on a later day; null for the same night'),
    place_name: nullableStr.describe('Venue as announced'),
    city: nullableStr,
    country: nullableStr.describe('Country name in English'),
    timezone: nullableStr.describe('IANA zone of the venue'),
    start_time: hhmm,
    end_time: hhmm,
    occurrence_name: nullableStr.describe('Edition or night name if the announcement has one'),
  }).nullable().describe('The night the line-up is for. Filled when the request did not name a stored occurrence, or when the publication gives a different date or venue than the request; null when the request\'s occurrence is right'),
  lineup: z.object({
    published_at: nullableStr.describe('YYYY-MM-DD (or full ISO datetime) of the announcement, if the source shows it'),
    place_name: nullableStr.describe('The venue the line-up is announced for, if the announcement says. null when it does not — never assume the default venue'),
    artists: z.array(LineupDraftSlotSchema).describe('Every act in billing order as printed. Empty only when the publication lists no names yet'),
    complete: z.boolean().describe('false when the announcement says more names are to come ("+ more TBA", "more to be announced")'),
    source_url: nullableStr.describe('The URL of the announcement itself'),
  }).nullable().describe('null when no line-up has been published for this night (say so in notes)'),
  date_or_venue_changed: z.boolean().describe('true when the publication gives a different date or venue than the request — the operator must decide'),
});
export type LineupDraft = z.infer<typeof LineupDraftSchema>;
