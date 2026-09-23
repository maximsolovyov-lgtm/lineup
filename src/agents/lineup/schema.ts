// zod/v4: the Anthropic SDK's zodOutputFormat() builds the JSON schema from v4 schemas.
import { z } from 'zod/v4';

/**
 * Draft of the line-up agent. Two questions in one answer:
 *  - occurrence: does this night exist (or which night the keywords mean)?
 *    Filled when the request did not name a stored occurrence, or when the
 *    publication corrects the date or venue. null when the occurrence given
 *    is the right one as it stands.
 *  - lineup: the announced roster for that night — null when nothing has
 *    been published yet. One entry per printed LINE, not per artist: the
 *    acts on that line and the format that joins them.
 */
const nullableStr = z.string().nullable().describe('null when not established from a source');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().describe('HH:MM wall time in the venue zone, or null');

export const LINEUP_SLOT_KINDS = ['solo', 'b2b', 'b3b', 'b4b', 'collaboration', 'featuring', 'multiple_guests', 'label_only', 'unknown'] as const;
export const PERFORMANCE_FORMATS = ['dj_set', 'live', 'live_pa', 'hybrid', 'dj_live_pa', 'av', 'acoustic', 'other', 'unknown'] as const;
export const LINEUP_SLOT_TAGS = ['standard', 'all_night_long', 'open_to_close', 'opening', 'closing', 'sunrise', 'sunset', 'afterhours', 'peak_time'] as const;

export const LineupDraftSlotSchema = z.object({
  printed_as: z.string().describe('The line exactly as the announcement prints it: "Solomun b2b Dixon", "Jamie Jones feat. Seth Troxler", "Marco Carola", "Resident DJs"'),
  artists: z.array(z.string()).describe('The individual acts on that line, in the printed order. "TBA", "TBC", "Secret guest", "Surprise guest" and "Unknown" are acts too — keep them as printed. Empty only when the line names no act at all (then kind is label_only)'),
  kind: z.enum(LINEUP_SLOT_KINDS).describe(
    'The format of the line. solo = one act on its own (a duo or collective that is ONE act — Tale Of Us, Keinemusik — is solo: that is the act, not the format). '
    + 'b2b / b3b / b4b = exactly 2 / 3 / 4 acts sharing one set ("b2b", "back to back", "vs", "x", "b2b2b"). '
    + 'collaboration = 2+ acts announced as one joint performance that is not a back-to-back ("presents", "meets", a live A/V show, a one-off project). '
    + 'featuring = "A feat./featuring/with/invites B": the first act is the main one, the rest join part of it. '
    + 'multiple_guests = one host act plus several guests ("A + friends", "A & guests"). '
    + 'label_only = a line naming no identifiable act ("Resident DJs", "Local support"). '
    + 'unknown = the wording allows more than one reading and nothing settles it — "A & B" with no other signal can be two separate sets, a b2b, or A feat. B'),
  kind_alternatives: z.array(z.string()).describe('Only when kind is "unknown": the readings the wording allows, most likely first, e.g. ["two separate sets", "b2b", "A feat. B"]. Empty otherwise'),
  format: z.enum(PERFORMANCE_FORMATS).describe(
    'How the act performs, AS ANNOUNCED. dj_set = an ordinary DJ set — use it whenever the bill says nothing, because that is what a club bill means; '
    + 'live = "(live)", a band, a live show; live_pa = "live PA"; hybrid = a DJ set with live elements; dj_live_pa = announced as both a DJ set and a live PA; '
    + 'av = "A/V", "audiovisual"; acoustic; other = stated but none of these; unknown = ONLY when the source deliberately leaves the format open'),
  tags: z.array(z.enum(LINEUP_SLOT_TAGS)).describe(
    'What the announcement says about where this line sits in the night, as printed: all_night_long ("all night long"), open_to_close ("open to close"), '
    + 'opening, closing, sunrise, sunset, afterhours, peak_time. Several can be true ("closing" + "sunrise"). standard only when the bill explicitly calls it an ordinary slot. Empty when it says nothing'),
  is_headliner: z.boolean().describe('true for the line(s) the announcement emphasises'),
  place: nullableStr.describe('The VENUE this line is assigned to, only when the publication spreads its lines over several venues (Sónar by Day / by Night, "Ushuaïa & Hï"); null when the whole line-up is at one venue or none is named'),
  room: nullableStr.describe('The room or stage WITHIN the venue this line is assigned to, if the announcement says'),
  note: nullableStr.describe('Anything else printed about the line that format and tags do not carry: "hosted by …", "extended set", "vinyl only". null when there is none'),
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
    artists: z.array(LineupDraftSlotSchema).describe('Every printed line, in billing order. Empty only when the publication lists no names yet'),
    complete: z.boolean().describe('false when the announcement says more names are to come ("+ more TBA", "more to be announced")'),
    source_url: nullableStr.describe('The URL of the announcement itself'),
  }).nullable().describe('null when no line-up has been published for this night (say so in notes)'),
  place_lineup_pattern: nullableStr.describe('What this venue\'s line-ups look like and, above all, what its wording MEANS: which separator marks a shared set ("b2b" spelled out, "x", "&"), whether several names on one line are one slot or consecutive sets, whether rooms are printed. One or two sentences an operator can store on the place; null when the publication gives no evidence'),
  date_or_venue_changed: z.boolean().describe('true when the publication gives a different date or venue than the request — the operator must decide'),
});
export type LineupDraft = z.infer<typeof LineupDraftSchema>;
export type LineupDraftSlot = z.infer<typeof LineupDraftSlotSchema>;
