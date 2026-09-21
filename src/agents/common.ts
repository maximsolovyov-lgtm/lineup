// zod/v4: the Anthropic SDK's zodOutputFormat() builds the JSON schema from v4 schemas.
import { z } from 'zod/v4';

/**
 * Shared shape of every research agent (place, artist, person, event).
 *
 * One call, three outcomes: a draft when the keywords identify one thing;
 * a list of candidates when two or more fit equally, so the operator picks
 * and calls again with the chosen candidate; not_found when nothing fits.
 */

export const CandidateSchema = z.object({
  label: z.string().describe('The name as it is publicly known'),
  description: z.string().describe('One line that tells the candidates apart: city and country, genre, active years, what kind of thing it is'),
  sources: z.array(z.string()).describe('URLs that identify this candidate'),
  confidence: z.number().describe('0..1 that this candidate is what the keywords meant'),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const OUTCOME_DESCRIPTION =
  '"draft" when the keywords identify exactly one thing (then draft is filled and candidates is empty). ' +
  '"ambiguous" when two or more different things fit the keywords about equally well (then candidates lists each of them, most likely first, and draft is null). ' +
  '"not_found" when nothing fits (candidates empty, draft null).';

export function outcomeSchema<T extends z.ZodType>(draft: T) {
  return z.object({
    outcome: z.enum(['draft', 'ambiguous', 'not_found']).describe(OUTCOME_DESCRIPTION),
    candidates: z.array(CandidateSchema).describe('Only for outcome "ambiguous": 2 to 6 candidates, most likely first'),
    draft: draft.nullable().describe('Only for outcome "draft"'),
    sources: z.array(z.string()).describe('URLs actually consulted'),
    confidence: z.number().describe('0..1 overall confidence in the outcome'),
    notes: z.string().describe('For the operator: what could not be established, what to double-check'),
  });
}

/** Request body of POST /api/agents/:kind. */
export const AgentRequestSchema = z.object({
  keywords: z.string().trim().min(2).max(2000).describe('Keywords separated by ";"'),
  candidate: CandidateSchema.optional().describe('The candidate the operator picked after an "ambiguous" answer'),
});
export type AgentRequest = z.infer<typeof AgentRequestSchema>;

export interface AgentUsage {
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
}

export interface AgentResult<TDraft> {
  outcome: 'draft' | 'ambiguous' | 'not_found';
  candidates: Candidate[];
  draft: TDraft | null;
  sources: string[];
  confidence: number;
  notes: string;
  keywords: string[];
  model: string;
  usage: AgentUsage;
}

export const AGENT_KINDS = ['place', 'artist', 'person', 'event', 'lineup'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export function splitKeywords(raw: string): string[] {
  return raw.split(';').map((k) => k.trim()).filter(Boolean);
}
