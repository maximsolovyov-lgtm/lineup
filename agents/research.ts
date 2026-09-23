/**
 * The research loop every agent shares: one Messages request with the
 * server-side web search and web fetch tools, constrained by structured
 * output to the kind's outcome schema (draft / ambiguous / not_found),
 * re-sent on pause_turn. The kind supplies the prompt, the draft schema and
 * an optional post-processing step (the place agent geocodes there).
 *
 * Runs only in the Pages Function — it needs ANTHROPIC_API_KEY.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod/v4';
import { outcomeSchema, splitKeywords, type AgentResult, type Candidate } from '../src/agents/common';

export const AGENT_MODEL = 'claude-opus-5';

export interface AgentKindDefinition<TDraft> {
  kind: string;
  /** What one "thing" is, for the ambiguity rule: "venue", "artist or act", ... */
  noun: string;
  draftSchema: z.ZodType<TDraft>;
  /** Frozen text: nothing request-specific, so prompt caching serves it. */
  systemPrompt: string;
  maxSearches?: number;
  maxFetches?: number;
  /** Output budget, thinking included. A festival bill is hundreds of lines. */
  maxTokens?: number;
  /** How many times a paused turn may be resumed before giving up. */
  maxTurns?: number;
  /**
   * Runs before the model is called; whatever it returns is appended to the
   * user message. The line-up agent uses it to list the venue site's pages
   * for the night — web_fetch opens only URLs that already appeared in the
   * conversation, and a JavaScript-rendered listing shows the model none.
   */
  prepare?: (keywords: string[]) => Promise<string | null>;
  /** Runs on a draft outcome before it is returned; may enrich the draft and the notes/sources. */
  postProcess?: (draft: TDraft, ctx: { notes: string; sources: string[] }) => Promise<{ draft: TDraft; notes: string; sources: string[] }>;
}

/** The part of the system prompt that is the same for every kind: how to disambiguate. */
export function disambiguationRules(noun: string): string {
  return `Outcome rules:
- If the keywords identify exactly one ${noun}, return outcome "draft" with the draft filled and candidates empty.
- If two or more different ${noun}s fit the keywords about equally well (same or similar names in different places, a name that is also a common word, a brand that exists in several cities), do NOT pick one: return outcome "ambiguous" with 2 to 6 candidates, most likely first, each with a description that tells them apart (city and country, genre, years active, what kind of thing it is) and the URLs that identify it. draft is null.
- If nothing fits, return outcome "not_found" with candidates empty and draft null, and say in notes what you looked for.
- When the request names a chosen candidate, that ${noun} is the one: research it and return outcome "draft" — never "ambiguous" again.
Every fact you could not establish from a source is null. Never invent names, dates, addresses or handles. Write text fields in English, concise, for an operator.`;
}

export async function runResearch<TDraft>(
  def: AgentKindDefinition<TDraft>,
  rawKeywords: string,
  candidate: Candidate | undefined,
  apiKey: string,
): Promise<AgentResult<TDraft>> {
  const keywords = splitKeywords(rawKeywords);
  if (keywords.length === 0) throw new Error('No keywords given');

  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const schema = outcomeSchema(def.draftSchema);
  const format = zodOutputFormat(schema);

  const today = new Date().toISOString().slice(0, 10);
  const chosen = candidate
    ? `\n\nThe operator chose this candidate from an earlier "ambiguous" answer — research exactly this one:\n${JSON.stringify(candidate)}`
    : '';
  const prepared = def.prepare ? await def.prepare(keywords).catch(() => null) : null;
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Today is ${today}.\nKeywords: ${keywords.map((k) => JSON.stringify(k)).join('; ')}${chosen}${prepared ? `\n\n${prepared}` : ''}\n\nResearch this ${def.noun} and answer with the structured outcome.` },
  ];

  let usage = { input_tokens: 0, output_tokens: 0, web_searches: 0 };
  let parsed: z.infer<typeof schema> | null = null;

  // Server tools run inside the API; a long research turn can come back as
  // pause_turn, in which case the assistant turn is appended and the request
  // re-sent — the API resumes where it left off.
  for (let attempt = 0; attempt < (def.maxTurns ?? 4); attempt += 1) {
    const response = await client.messages.parse({
      model: AGENT_MODEL,
      max_tokens: def.maxTokens ?? 16000,
      system: [{ type: 'text', text: `${def.systemPrompt}\n\n${disambiguationRules(def.noun)}`, cache_control: { type: 'ephemeral' } }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: def.maxSearches ?? 6 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: def.maxFetches ?? 6, max_content_tokens: 30000 },
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
      throw new Error('The answer was longer than the agent may write. For a festival bill, generate one day or one stage at a time; otherwise narrow the keywords.');
    }
    if (!response.parsed_output) {
      throw new Error('The model returned no structured answer');
    }
    parsed = schema.parse(response.parsed_output);
    break;
  }

  if (!parsed) throw new Error('Research did not finish within the allowed turns');

  // Keep the three outcomes mutually consistent whatever the model did.
  let outcome = parsed.outcome;
  let draft = parsed.draft;
  let candidates = parsed.candidates;
  if (outcome === 'draft' && !draft) outcome = candidates.length >= 2 ? 'ambiguous' : 'not_found';
  if (outcome === 'ambiguous' && candidates.length < 2) outcome = draft ? 'draft' : 'not_found';
  if (outcome !== 'draft') draft = null;
  if (outcome !== 'ambiguous') candidates = [];

  let notes = parsed.notes;
  let sources = parsed.sources;
  if (outcome === 'draft' && draft && def.postProcess) {
    const out = await def.postProcess(draft, { notes, sources });
    draft = out.draft; notes = out.notes; sources = out.sources;
  }

  return { outcome, candidates, draft, sources, confidence: parsed.confidence, notes, keywords, model: AGENT_MODEL, usage };
}

/** The JSON schema of a kind's full answer — what another agent registers as this tool's result shape. */
export function answerJsonSchema<TDraft>(def: AgentKindDefinition<TDraft>): Record<string, unknown> {
  return zodOutputFormat(outcomeSchema(def.draftSchema)).schema;
}
