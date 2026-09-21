import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAgent } from '@/agents/client';
import { hostnameOf } from '@/agents/client';
import type { AgentResult, Candidate } from '@/agents/common';
import type { LineupDraft } from '@/agents/lineup/schema';
import type { SlotFormValue } from '@/components/form/SlotsEditor';
import { LineupFinder } from './LineupFinder';
import { compareRosters, createOccurrenceFromDraft, keywordsFor, resolveRoster, type FinderParams, type FoundLineup, type FoundOccurrence, type RosterDiff } from './generate';

export interface GeneratedFill {
  occurrence_id: string;
  place_id: string | null;
  published_at: string;
  notes: string;
  artists: SlotFormValue[];
  /** When the fill is the next version of this line-up. */
  fromLineupId: string | null;
}

interface LineupGenerateProps {
  onFill: (fill: GeneratedFill) => void;
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'choose'; occurrences: FoundOccurrence[]; params: FinderParams }
  | { kind: 'researching'; what: string }
  | { kind: 'done'; message: ReactNode; tone: 'ok' | 'warn' | 'info' }
  | { kind: 'proposeOccurrence'; draft: LineupDraft; result: AgentResult<LineupDraft>; params: FinderParams }
  | { kind: 'proposeVersion'; occ: FoundOccurrence; current: FoundLineup; draft: LineupDraft; diff: RosterDiff; result: AgentResult<LineupDraft> }
  | { kind: 'candidates'; candidates: Candidate[]; keywords: string; occ: FoundOccurrence | null; params: FinderParams };

/**
 * "Find and AI generate" on the New line-up page. The finder resolves the
 * night from the database; then, depending on what it found:
 *   one occurrence, no line-up     → research the publication, fill the form
 *   one occurrence with a line-up  → research, compare, offer the next version
 *   several occurrences            → choose one, then as above
 *   none                           → research the night itself, offer to create it
 * Nothing is written until the operator saves (creating a missing night is
 * the one exception, and it asks first).
 */
export function LineupGenerate({ onFill }: LineupGenerateProps) {
  const agent = useAgent<LineupDraft>('lineup');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });

  async function research(keywords: string, candidate?: Candidate) {
    return agent.mutateAsync({ keywords, candidate });
  }

  function sourcesLine(r: AgentResult<LineupDraft>) {
    return r.sources.length > 0 ? (
      <span className="block text-xs text-muted-foreground">
        Sources: {r.sources.map((u, i) => <span key={`${u}-${i}`}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noreferrer" className="underline">{hostnameOf(u)}</a></span>)}
      </span>
    ) : null;
  }

  async function fillFrom(occ: FoundOccurrence, placeId: string | null, draft: NonNullable<LineupDraft['lineup']>, r: AgentResult<LineupDraft>, fromLineupId: string | null) {
    const roster = await resolveRoster(draft);
    onFill({
      occurrence_id: occ.occurrence_id,
      place_id: placeId,
      published_at: toLocalDateTime(draft.published_at),
      notes: [`Generated from ${draft.source_url ?? r.sources[0] ?? 'the web'}.`, r.notes, draft.complete ? null : 'Announcement says more names are to come.'].filter(Boolean).join(' '),
      artists: roster.slots,
      fromLineupId,
    });
    setStage({
      kind: 'done', tone: 'ok',
      message: (
        <>
          <b>Form filled from the publication</b> — {roster.slots.length} slot{roster.slots.length === 1 ? '' : 's'}.
          {roster.matched.length > 0 && <> Matched artists: {roster.matched.join(', ')}.</>}
          {roster.toCreate.length > 0 && <> <b>Created on save</b> (type unknown, review task): {roster.toCreate.join(', ')}.</>}
          {!draft.complete && <> The announcement promises more names — a TBA slot was added.</>}
          {r.draft?.date_or_venue_changed && <> <span className="text-amber-700">The publication gives a different date or venue than this occurrence: {describeOcc(r.draft.occurrence)}. Check before saving.</span></>}
          {sourcesLine(r)}
        </>
      ),
    });
  }

  // Scenario 1 and 3: one occurrence chosen.
  async function handleOccurrence(occ: FoundOccurrence, params: FinderParams) {
    if (occ.occurrence_status === 'cancelled') {
      setStage({ kind: 'done', tone: 'warn', message: <>This occurrence is <b>cancelled</b>. No line-up is generated for a cancelled night.</> });
      return;
    }
    const lineups = (occ.lineups as unknown as FoundLineup[]) ?? [];
    const current = lineups.find((l) => l.is_current && (params.placeId ? l.place_id === params.placeId : true)) ?? lineups.find((l) => l.is_current) ?? null;
    const keywords = keywordsFor(params, occ, current ? current.artists : null);
    setStage({ kind: 'researching', what: `${occ.event_name} · ${occ.event_date}` });
    try {
      const r = await research(keywords);
      if (r.outcome === 'ambiguous') { setStage({ kind: 'candidates', candidates: r.candidates, keywords, occ, params }); return; }
      await afterResearch(r, occ, current, params);
    } catch (e) {
      setStage({ kind: 'done', tone: 'warn', message: <>{(e as Error).message}</> });
    }
  }

  async function afterResearch(r: AgentResult<LineupDraft>, occ: FoundOccurrence, current: FoundLineup | null, params: FinderParams) {
    const draft = r.draft;
    if (r.outcome !== 'draft' || !draft || !draft.lineup) {
      setStage({ kind: 'done', tone: 'info', message: <><b>No line-up published yet</b> for {occ.event_name} on {occ.event_date}. {r.notes}{sourcesLine(r)}</> });
      // Still hand the occurrence to the form so the operator can enter it by hand.
      onFill({ occurrence_id: occ.occurrence_id, place_id: params.placeId ?? occ.primary_place_id, published_at: '', notes: '', artists: [], fromLineupId: null });
      return;
    }
    const placeId = await resolvePlace(draft.lineup.place_name, params.placeId ?? occ.primary_place_id, occ);
    if (!current) {
      await fillFrom(occ, placeId, draft.lineup, r, null);
      return;
    }
    const stored = current.artists.map((n) => ({ name: n, is_headliner: false }));
    // Headliner flags are not in the finder's summary; compare names and placeholders only.
    const diff = compareRosters(stored, draft.lineup.artists.map((a) => ({ ...a, is_headliner: false })));
    if (diff.same) {
      setStage({ kind: 'done', tone: 'ok', message: <><b>Nothing changed.</b> The published line-up matches v{current.version} ({current.artist_count} artists).{sourcesLine(r)}</> });
      return;
    }
    setStage({ kind: 'proposeVersion', occ, current, draft, diff, result: r });
  }

  // Scenario 4: nothing stored — research the night itself.
  async function discover(params: FinderParams) {
    const keywords = keywordsFor(params, null, null);
    setStage({ kind: 'researching', what: 'a night matching the search on the web' });
    try {
      const r = await research(keywords);
      if (r.outcome === 'ambiguous') { setStage({ kind: 'candidates', candidates: r.candidates, keywords, occ: null, params }); return; }
      if (r.outcome !== 'draft' || !r.draft?.occurrence) {
        setStage({ kind: 'done', tone: 'info', message: <><b>Nothing found</b> — no night matching the search is stored, and none was found on the web. {r.notes}{sourcesLine(r)}</> });
        return;
      }
      setStage({ kind: 'proposeOccurrence', draft: r.draft, result: r, params });
    } catch (e) {
      setStage({ kind: 'done', tone: 'warn', message: <>{(e as Error).message}</> });
    }
  }

  async function createAndFill(st: Extract<Stage, { kind: 'proposeOccurrence' }>) {
    setStage({ kind: 'researching', what: 'creating the night' });
    try {
      const created = await createOccurrenceFromDraft(st.draft.occurrence!);
      toast.success(`Created ${st.draft.occurrence!.event_name} on ${st.draft.occurrence!.event_date}`);
      // The generated type declares these columns non-null; the function returns nulls for them, as the finder's rendering already assumes.
      const occ = {
        occurrence_id: created.occurrence_id, event_id: created.event_id, event_name: st.draft.occurrence!.event_name, event_date: st.draft.occurrence!.event_date,
        occurrence_name: st.draft.occurrence!.occurrence_name, occurrence_status: 'active', primary_place_id: created.place_id, primary_place_name: st.draft.occurrence!.place_name, lineups: [],
      } as unknown as FoundOccurrence;
      if (st.draft.lineup) await fillFrom(occ, created.place_id, st.draft.lineup, st.result, null);
      else {
        onFill({ occurrence_id: occ.occurrence_id, place_id: created.place_id, published_at: '', notes: '', artists: [], fromLineupId: null });
        setStage({ kind: 'done', tone: 'info', message: <>The night is created, but <b>no line-up is published yet</b>. {st.result.notes}</> });
      }
    } catch (e) {
      setStage({ kind: 'done', tone: 'warn', message: <>{(e as Error).message}</> });
    }
  }

  async function onResults(results: FoundOccurrence[], params: FinderParams) {
    if (results.length === 0) { await discover(params); return; }
    if (results.length === 1) { await handleOccurrence(results[0]!, params); return; }
    setStage({ kind: 'choose', occurrences: results, params });
  }

  const busy = stage.kind === 'researching' || agent.isPending;

  return (
    <div className="space-y-3">
      <LineupFinder onResults={(r, p) => void onResults(r, p)} submitLabel="Find & AI generate" submitIcon="sparkles" busy={busy} />

      {stage.kind === 'researching' && (
        <p className="rounded-md border bg-secondary/40 p-3 text-sm"><Sparkles className="mr-1 inline h-4 w-4" /> Researching {stage.what} — reading the venue, promoter and RA pages. Usually 20–60 seconds.</p>
      )}

      {stage.kind === 'choose' && (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <b>{stage.occurrences.length} nights match.</b> Which one?
          <ul className="divide-y rounded-md border">
            {stage.occurrences.map((o) => {
              const n = ((o.lineups as unknown as FoundLineup[]) ?? []).length;
              return (
                <li key={o.occurrence_id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="font-medium">{o.event_name}</span>
                  <span className="text-muted-foreground">· {o.event_date}{o.occurrence_name ? ` · ${o.occurrence_name}` : ''} · {o.primary_place_name ?? 'no default place'}</span>
                  <span className="text-xs text-muted-foreground">{n === 0 ? 'no line-up yet' : `${n} line-up version${n === 1 ? '' : 's'}`}</span>
                  <span className="flex-1" />
                  <Button type="button" size="sm" onClick={() => void handleOccurrence(o, stage.params)}>This one</Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {stage.kind === 'candidates' && (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <b>The web gives several possible nights.</b> Which did you mean?
          <ul className="divide-y rounded-md border">
            {stage.candidates.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="font-medium">{c.label}</span><span className="text-muted-foreground">— {c.description}</span>
                <span className="flex-1" />
                <Button type="button" size="sm" onClick={async () => {
                  setStage({ kind: 'researching', what: c.label });
                  try {
                    const r = await research(stage.keywords, c);
                    if (stage.occ) {
                      const lineups = (stage.occ.lineups as unknown as FoundLineup[]) ?? [];
                      await afterResearch(r, stage.occ, lineups.find((l) => l.is_current) ?? null, stage.params);
                    } else if (r.outcome === 'draft' && r.draft?.occurrence) {
                      setStage({ kind: 'proposeOccurrence', draft: r.draft, result: r, params: stage.params });
                    } else {
                      setStage({ kind: 'done', tone: 'info', message: <>Nothing usable came back for that candidate. {r.notes}</> });
                    }
                  } catch (e) { setStage({ kind: 'done', tone: 'warn', message: <>{(e as Error).message}</> }); }
                }}>This one</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage.kind === 'proposeOccurrence' && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" role="alert">
          <b>Not in the system.</b> The web says: <b>{describeOcc(stage.draft.occurrence)}</b>.
          {stage.draft.lineup ? <> A line-up is published ({stage.draft.lineup.artists.length} acts).</> : <> No line-up is published yet.</>}
          <span className="block text-xs text-muted-foreground">Creating it adds the event and the occurrence (and the place, if missing — tagged with the event name), reusing what already exists by name. {stage.result.notes}</span>
          {sourcesLine(stage.result)}
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={() => void createAndFill(stage)}>Create the night{stage.draft.lineup ? ' and fill the line-up' : ''}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setStage({ kind: 'idle' })}>Not this</Button>
          </div>
        </div>
      )}

      {stage.kind === 'proposeVersion' && (
        <div className="space-y-2 rounded-md border border-blue-300 bg-blue-50/60 p-3 text-sm" role="alert">
          <b>The publication differs from v{stage.current.version}</b> ({stage.current.place_name ?? 'place not announced'}).
          <ul className="list-disc pl-5">
            {stage.diff.added.length > 0 && <li>Added: {stage.diff.added.join(', ')}</li>}
            {stage.diff.removed.length > 0 && <li>No longer listed: {stage.diff.removed.join(', ')}</li>}
          </ul>
          <span className="block text-xs text-muted-foreground">{stage.result.notes}</span>
          {sourcesLine(stage.result)}
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={() => void fillFrom(stage.occ, stage.current.place_id, stage.draft.lineup!, stage.result, stage.current.lineup_id)}>
              Create v{stage.current.version + 1} with the published line-up
            </Button>
            <Button asChild size="sm" variant="outline"><Link to={`/lineups/${stage.current.lineup_id}`}>Open v{stage.current.version}</Link></Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setStage({ kind: 'idle' })}>Dismiss</Button>
          </div>
        </div>
      )}

      {stage.kind === 'done' && (
        <div className={`rounded-md border p-3 text-sm ${stage.tone === 'ok' ? 'bg-card' : stage.tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'bg-muted/40'}`} role="status">
          {stage.message}
        </div>
      )}
    </div>
  );
}

/** "YYYY-MM-DD" or an ISO datetime → the datetime-local value the form holds ("YYYY-MM-DDTHH:MM"), or '' when unusable. */
function toLocalDateTime(v: string | null): string {
  if (!v) return '';
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(v);
  if (!m) return '';
  return `${m[1]}T${m[2] ?? '12:00'}`;
}

function describeOcc(o: LineupDraft['occurrence']): string {
  if (!o) return '';
  return `${o.event_name} on ${o.event_date}${o.place_name ? ` at ${o.place_name}` : ''}${o.city ? `, ${o.city}` : ''}`;
}

/** The place a published line-up is for: the announced venue if it is stored, else the default given. */
async function resolvePlace(announced: string | null, fallback: string | null, occ: FoundOccurrence): Promise<string | null> {
  if (!announced) return fallback;
  const { supabase } = await import('@/lib/supabase');
  const { normalizeName } = await import('@/lib/normalize');
  const { data } = await supabase.from('place').select('place_id').eq('status', 'active').eq('normalized_name', normalizeName(announced)).limit(1);
  if (data?.[0]) return data[0].place_id;
  if (occ.primary_place_name && normalizeName(occ.primary_place_name) === normalizeName(announced)) return occ.primary_place_id;
  return fallback;
}
