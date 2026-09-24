// zod/v4: the Anthropic SDK's zodOutputFormat() builds the JSON schema from v4 schemas.
import { z } from 'zod/v4';

/**
 * Draft of the artist agent: the name on the poster and the people behind it.
 * `artist` maps onto p_artist of save_artist_with_members(); each member
 * becomes either an existing person (matched by the form) or new_person.
 * Only publicly known names — never legal or birth names.
 */
const nullableStr = z.string().nullable().describe('null when not established from a source');

export const ArtistDraftMemberSchema = z.object({
  display_name: z.string().describe('The PUBLIC name this person is known by (their own stage name if they have one). Never a legal or birth name unless the artist publishes it'),
  country: nullableStr.describe('Country name in English'),
  membership_role: z.enum(['dj', 'producer', 'live', 'vocalist', 'mc', 'visual', 'other']).nullable(),
  started_at: z.string().nullable().describe('YYYY-MM-DD when they joined, or YYYY-01-01 if only the year is known; null if unknown'),
  ended_at: z.string().nullable().describe('YYYY-MM-DD when they left; null if current'),
  notes: nullableStr.describe('The source that establishes this membership'),
});

export const ArtistDraftSchema = z.object({
  artist: z.object({
    name: z.string().describe('The name as printed on posters and line-ups'),
    artist_type: z.enum(['solo', 'duo', 'group', 'collective', 'alias', 'unknown']).describe('solo = one person; duo = two people under one name; group/collective = three or more; alias = another name of a person who already performs under a different one. B2B is never a type'),
    country: nullableStr.describe('Country name in English'),
    instagram_url: nullableStr.describe('https://www.instagram.com/<handle>'),
    news_pattern: nullableStr.describe('Where news about this act really comes from — the booking agency page, the label, which account is the official one, what is out of date. Merged with the "news pattern:" already in the request; null when nothing durable was learned'),
    lineup_pattern: nullableStr.describe('How this act appears on a bill: the spelling to expect, the aliases it plays under, whether it is usually announced as a b2b or live. Merged with the "lineup pattern:" already in the request; null when nothing durable was learned'),
  }),
  members: z.array(ArtistDraftMemberSchema).describe('The people behind the name. One for a solo act, two for a duo, all known members for a group or collective. Empty if nobody is publicly named'),
  genres: z.array(z.string()).describe('Up to 3 genres, for the operator to recognise the act'),
});
export type ArtistDraft = z.infer<typeof ArtistDraftSchema>;
