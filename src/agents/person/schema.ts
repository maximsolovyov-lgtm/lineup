// zod/v4: the Anthropic SDK's zodOutputFormat() builds the JSON schema from v4 schemas.
import { z } from 'zod/v4';

/**
 * Draft of the person agent: one human and the stage names they stand behind.
 * Maps onto public.person; `performs_as` is information for the operator —
 * memberships are edited on the artist record.
 * Only publicly known names — never legal or birth names.
 */
const nullableStr = z.string().nullable().describe('null when not established from a source');

export const PersonDraftSchema = z.object({
  person: z.object({
    display_name: z.string().describe('The PUBLIC name this person is known by. Never a legal or birth name unless they publish it themselves'),
    country: nullableStr.describe('Country name in English'),
    notes: nullableStr.describe('Two or three lines for an operator: who this is, where the identity is established'),
  }),
  performs_as: z.array(z.object({
    artist_name: z.string().describe('A stage name or act this person performs under or is a member of'),
    artist_type: z.enum(['solo', 'duo', 'group', 'collective', 'alias', 'unknown']),
    role: z.enum(['dj', 'producer', 'live', 'vocalist', 'mc', 'visual', 'other']).nullable(),
    started_at: z.string().nullable().describe('YYYY-MM-DD or YYYY-01-01; null if unknown'),
    ended_at: z.string().nullable().describe('null if current'),
  })).describe('Every act this person is publicly known to be part of, current first'),
});
export type PersonDraft = z.infer<typeof PersonDraftSchema>;
