import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAgent } from '@/agents/client';
import { hostnameOf } from '@/agents/client';
import type { AgentResult, Candidate } from '@/agents/common';
import type { LineupDraft } from '@/agents/lineup/schema';
import { LineupFinder } from './LineupFinder';
import { compareRosters, createOccurrenceFromDraft, draftSlotLabel, fetchLineupPattern, fetchRun, keywordsFor, placeHints, resolveRoster, saveLineupPattern, type FinderParams, type FoundLineup, type FoundOccurrence, type RosterDiff } from './generate';
import type { LineupSlotValue } from './schema';

export interface GeneratedFill {
  occurrence_id: string;
  place_id: string | null;
  published_at: string;
  notes: string;
  artists: LineupSlotValue[];
  /** The publication assigns its lines to days. */
  split_by_day: boolean;
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
  | { kind: 'candidates'; candidates: Candidate[]; keywords: string; occ: FoundOccurrence | null; params: FinderParams }
  | { kind: 'chooseVenue'; groups: VenueGroup[]; result: AgentResult<LineupDraft>; occ: FoundOccurrence; params: FinderParams };

type PublishedLineup = NonNullable<LineupDraft['lineup']>;
interface VenueGroup { place: string | null; acts: PublishedLineup['artists'] }

/** The acts of a publication grouped by the venue it assigns them to; one group when it assigns none. */
function venueGroups(lineup: PublishedLineup): VenueGroup[] {
  const groups = new Map<string | null, PublishedLineup['artists']>();
  for (const a of lineup.artists) {
    const key = a.place?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const named = [...groups.entries()].filter(([k]) => k !== null);
  if (named.length === 0) return [{ place: null, acts: lineup.artists }];
  return [...named, ...(groups.has(null) ? [[null, groups.get(null)!] as const] : [])].map(([place, acts]) => ({ place, acts }));
}

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
  // What the publication showed about how this venue writes its line-ups. Stored
  // on the place only when the operator says so — it decides future parses.
  const [pattern, setPattern] = useState<{ placeId: string; text: string; current: string | null; saved: boolean } | null>(null);

  async function offerPattern(placeId: string | null, text: string | null) {
    if (!placeId || !text?.trim()) { setPattern(null); return; }
    const current = await fetchLineupPattern(placeId).catch(() => null);
    if ((current ?? '').trim() === text.trim()) { setPattern(null); return; }
    setPattern({ placeId, text: text.trim(), current, saved: false });
  }

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
    const roster = await resolveRoster(draft, placeId);
    void offerPattern(placeId, r.draft?.place_lineup_pattern ?? null);
    onFill({
      occurrence_id: occ.occurrence_id,
      place_id: placeId,
      published_at: toLocalDateTime(draft.published_at),
      notes: [`Generated from ${draft.source_url ?? r.sources[0] ?? 'the web'}.`, r.notes, draft.complete ? null : 'Announcement says more names are to come.'].filter(Boolean).join(' '),
      artists: roster.slots,
      split_by_day: roster.splitByDay,
      fromLineupId,
    });
    setStage({
      kind: 'done', tone: 'ok',
      message: (
        <>
          <b>Form filled from the publication</b> — {roster.slots.length} line{roster.slots.length === 1 ? '' : 's'}.
          {roster.matched.length > 0 && <> Matched acts: {roster.matched.join(', ')}.</>}
          {roster.toCreate.length > 0 && <> <b>Created on save</b> (type unknown, review task): {roster.toCreate.join(', ')}.</>}
          {roster.slots.some((s) => s.place_space_id) && <> Rooms filled from the bill.</>}
          {roster.unmatchedRooms.length > 0 && (
            <span className="mt-1 block text-amber-700">
              The bill names {roster.unmatchedRooms.map((r) => `“${r}”`).join(', ')}, which {roster.unmatchedRooms.length === 1 ? 'is not a room' : 'are not rooms'} of this place —
              those lines were left without a room. Add the room on the place, or pick another.
            </span>
          )}
          {roster.splitByDay && <> The bill names the day of each line.</>}
          {roster.unclear.length > 0 && (
            <span className="mt-1 block text-amber-700">
              <b>Unclear how {roster.unclear.length === 1 ? 'one line is' : `${roster.unclear.length} lines are`} meant</b>{' '}
              — {roster.unclear.map((u) => `“${u.printed}”${u.alternatives.length > 0 ? ` (${u.alternatives.join(' / ')})` : ''}`).join('; ')}.
              Pick the kind on each; saving as <i>Unclear</i> opens a review task.
            </span>
          )}
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
    setStage({ kind: 'researching', what: `${occ.event_name} · ${occ.event_date}` });
    try {
      const [hints, run] = await Promise.all([placeHints(params.placeId ?? occ.primary_place_id, occ.event_id), fetchRun(occ.occurrence_id)]);
      const keywords = keywordsFor(params, occ, current ? current.artists : null, hints, run);
      const r = await research(keywords);
      if (r.outcome === 'ambiguous') { setStage({ kind: 'candidates', candidates: r.candidates, keywords, occ, params }); return; }
      await afterResearch(r, occ, params);
    } catch (e) {
      setStage({ kind: 'done', tone: 'warn', message: <>{(e as Error).message}</> });
    }
  }

  /**
   * The publication is in hand. A publication that spreads its acts over
   * several venues is one line-up per venue (version per (occurrence, place)):
   * the operator picks which venue to fill — `venue` undefined means not asked
   * yet, null means the acts the publication attributes to no venue.
   */
  async function afterResearch(r: AgentResult<LineupDraft>, occ: FoundOccurrence, params: FinderParams, venue?: string | null) {
    const draft = r.draft;
    if (r.outcome !== 'draft' || !draft || !draft.lineup) {
      setStage({ kind: 'done', tone: 'info', message: <><b>No line-up published yet</b> for {occ.event_name} on {occ.event_date}. {r.notes}{sourcesLine(r)}</> });
      // Still hand the occurrence to the form so the operator can enter it by hand.
      onFill({ occurrence_id: occ.occurrence_id, place_id: params.placeId ?? occ.primary_place_id, published_at: '', notes: '', artists: [], split_by_day: false, fromLineupId: null });
      return;
    }
    const groups = venueGroups(draft.lineup);
    if (venue === undefined && groups.length > 1) {
      setStage({ kind: 'chooseVenue', groups, result: r, occ, params });
      return;
    }
    const group = venue === undefined ? groups[0]! : groups.find((g) => g.place === venue) ?? groups[0]!;
    const lineup: PublishedLineup = venue === undefined ? draft.lineup : { ...draft.lineup, artists: group.acts, place_name: venue };
    // A venue the publication names is the line-up's place when it is stored. Acts attributed
    // to a venue that is not stored get place null — attributing them to the default place
    // would assert something the publication did not say.
    const announced = lineup.place_name;
    const stored = announced ? await resolvePlace(announced, null, occ) : null;
    const placeId = announced ? stored : (params.placeId ?? occ.primary_place_id);
    const placeNote = announced && !stored ? `The publication puts these acts at "${announced}", which is not a stored place — the line-up is saved with place not announced; create the place and pick it if that is wrong.` : null;
    const lineups = (occ.lineups as unknown as FoundLineup[]) ?? [];
    const current = lineups.find((l) => l.is_current && (l.place_id ?? null) === placeId) ?? null;
    const others = groups.filter((g) => g !== group).map((g) => `${g.place ?? 'not attributed'} (${g.acts.length})`);
    const tail = [placeNote, others.length > 0 ? `The publication also covers ${others.join(', ')}: run “Find & AI generate” again for those after saving.` : null].filter(Boolean).join(' ');
    const r2: AgentResult<LineupDraft> = tail ? { ...r, notes: [r.notes, tail].filter(Boolean).join(' ') } : r;
    if (!current) {
      await fillFrom(occ, placeId, lineup, r2, null);
      return;
    }
    // The finder returns the stored lines as labels ("Solomun b2b Dixon"); compare those.
    const diff = compareRosters(current.artists, lineup.artists);
    if (diff.same) {
      setStage({ kind: 'done', tone: 'ok', message: <><b>Nothing changed.</b> The published line-up matches v{current.version} ({current.artist_count} artists){current.place_name ? ` at ${current.place_name}` : ''}.{tail && <> {tail}</>}{sourcesLine(r)}</> });
      return;
    }
    setStage({ kind: 'proposeVersion', occ, current, draft: { ...draft, lineup }, diff, result: r2 });
  }

  // Scenario 4: nothing stored — research the night itself.
  async function discover(params: FinderParams) {
    setStage({ kind: 'researching', what: 'a night matching the search on the web' });
    try {
      const keywords = keywordsFor(params, null, null, await placeHints(params.placeId, params.eventId));
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
        onFill({ occurrence_id: occ.occurrence_id, place_id: created.place_id, published_at: '', notes: '', artists: [], split_by_day: false, fromLineupId: null });
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
                  {o.part_of_name && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">part of {o.part_of_name}</span>}
                  <span className="text-xs text-muted-foreground">{n === 0 ? 'no line-up yet' : `${n} line-up version${n === 1 ? '' : 's'}`}</span>
                  {stage.params.placeId && o.primary_place_id !== stage.params.placeId && ((o.lineups as unknown as FoundLineup[]) ?? []).some((l) => l.place_id === stage.params.placeId) && (
                    <span className="text-xs text-muted-foreground">found through its line-up at the searched place</span>
                  )}
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
                      await afterResearch(r, stage.occ, stage.params);
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

      {stage.kind === 'chooseVenue' && (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <b>The publication covers {stage.groups.filter((g) => g.place).length} venues.</b> A line-up is one publication for one place — which one to fill?
          <ul className="divide-y rounded-md border">
            {stage.groups.map((g) => (
              <li key={g.place ?? '∅'} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className={g.place ? 'font-medium' : 'italic'}>{g.place ?? 'Not attributed to a venue'}</span>
                <span className="text-xs text-muted-foreground">{g.acts.length} line{g.acts.length === 1 ? '' : 's'}: {g.acts.slice(0, 6).map(draftSlotLabel).join(', ')}{g.acts.length > 6 ? '…' : ''}</span>
                <span className="flex-1" />
                <Button type="button" size="sm" onClick={() => void afterResearch(stage.result, stage.occ, stage.params, g.place).catch((e) => setStage({ kind: 'done', tone: 'warn', message: <>{(e as Error).message}</> }))}>Fill this one</Button>
              </li>
            ))}
          </ul>
          <span className="block text-xs text-muted-foreground">{stage.result.notes}{sourcesLine(stage.result)}</span>
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

      {pattern && (
        <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
          <b>How this venue writes its line-ups</b>
          <p className="text-muted-foreground">{pattern.text}</p>
          {pattern.current && <p className="text-xs text-muted-foreground">Stored now: <span className="line-through">{pattern.current}</span></p>}
          <p className="text-xs text-muted-foreground">
            Stored on the place, this is what settles the next “A &amp; B” — whether it is two sets, a b2b, or A feat. B — instead of the agent guessing.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={pattern.saved}
              onClick={() => void saveLineupPattern(pattern.placeId, pattern.text)
                .then(() => { setPattern({ ...pattern, saved: true }); toast.success('Line-up pattern saved on the place'); })
                .catch((e) => toast.error((e as Error).message))}>
              {pattern.saved ? 'Saved' : pattern.current ? 'Replace the stored pattern' : 'Save to the place'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPattern(null)}>Dismiss</Button>
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

/** The place a published line-up is for: the announced venue if it is stored, else the fallback given (null = not announced). */
async function resolvePlace(announced: string | null, fallback: string | null, occ: FoundOccurrence): Promise<string | null> {
  if (!announced) return fallback;
  const { supabase } = await import('@/lib/supabase');
  const { normalizeName } = await import('@/lib/normalize');
  const { data } = await supabase.from('place').select('place_id').eq('status', 'active').eq('normalized_name', normalizeName(announced)).limit(1);
  if (data?.[0]) return data[0].place_id;
  if (occ.primary_place_name && normalizeName(occ.primary_place_name) === normalizeName(announced)) return occ.primary_place_id;
  return fallback;
}
