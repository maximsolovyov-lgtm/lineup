import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ActualizePanel } from '@/agents/ActualizePanel';
import type { LineupDraft } from '@/agents/lineup/schema';
import { appendKnowledge } from '@/lib/knowledge';
import { supabase } from '@/lib/supabase';
import {
  compareRosters, fetchRun, keywordsFor, placeHints, resolveRoster,
  type FoundOccurrence,
} from './generate';
import type { LineupSlotValue } from './schema';

interface LineupActualizeProps {
  occurrenceId: string;
  placeId: string | null;
  /** The lines as the form holds them now, for the comparison. */
  currentLabels: string[];
  onFill: (slots: LineupSlotValue[], splitByDay: boolean) => void;
  onDiscard: () => void;
  disabled?: boolean;
  /** Renders as one row for a caller that owns the layout (the draft tab on a night). */
  inline?: boolean;
}

/** Where a line-up's knowledge belongs: the venue that publishes the bill, else the brand. */
type PatternTarget = { kind: 'place' | 'event'; id: string; name: string };

/**
 * "AI actualization" of a published line-up: read the publication again and
 * lay it over the form. A line-up version is a publication, so what the
 * operator does with the result is their call — Save corrections if the
 * version was wrong, or Publish as new version if the bill really changed.
 *
 * What the operator tells the agent ("ignore the last line", "the bill moved
 * to this URL") is knowledge about the SOURCE, so it is offered to the venue
 * that publishes it, or to the brand when the line-up names no venue.
 */
export function LineupActualize({ occurrenceId, placeId, currentLabels, onFill, onDiscard, disabled, inline = false }: LineupActualizeProps) {
  const [pattern, setPattern] = useState<{ target: PatternTarget; text: string; current: string | null; saved: boolean } | null>(null);

  async function occurrence(): Promise<FoundOccurrence | null> {
    const { data, error } = await supabase.rpc('find_lineups', { p_occurrence_id: occurrenceId });
    if (error) throw error;
    return (data as FoundOccurrence[])[0] ?? null;
  }

  async function target(occ: FoundOccurrence): Promise<PatternTarget | null> {
    if (placeId) {
      const { data } = await supabase.from('place').select('name').eq('place_id', placeId).maybeSingle();
      return { kind: 'place', id: placeId, name: data?.name ?? 'the place' };
    }
    return occ.event_id ? { kind: 'event', id: occ.event_id, name: occ.event_name } : null;
  }

  async function offerPattern(occ: FoundOccurrence, learned: string | null, instruction: string) {
    const t = await target(occ);
    if (!t) { setPattern(null); return; }
    const { data } = t.kind === 'place'
      ? await supabase.from('place').select('lineup_pattern').eq('place_id', t.id).maybeSingle()
      : await supabase.from('event').select('lineup_pattern').eq('event_id', t.id).maybeSingle();
    const current = data?.lineup_pattern ?? null;
    // The agent's merged text, or — when it learned nothing durable — what the
    // operator said, kept next to what is already known.
    const text = learned?.trim() || (instruction.trim() ? appendKnowledge(current ?? '', instruction) : '');
    if (!text || text.trim() === (current ?? '').trim()) { setPattern(null); return; }
    setPattern({ target: t, text: text.trim(), current, saved: false });
  }

  async function store() {
    if (!pattern) return;
    const { error } = pattern.target.kind === 'place'
      ? await supabase.from('place').update({ lineup_pattern: pattern.text }).eq('place_id', pattern.target.id)
      : await supabase.from('event').update({ lineup_pattern: pattern.text }).eq('event_id', pattern.target.id);
    if (error) { toast.error(error.message); return; }
    setPattern({ ...pattern, saved: true });
    toast.success(`Line-up pattern saved on ${pattern.target.name}`);
  }

  return (
    <div className={inline ? 'contents' : 'space-y-3'}>
      <ActualizePanel<LineupDraft>
        kind="lineup"
        noun="line-up"
        inline={inline}
        disabled={disabled}
        hint="Optional: “the bill is at …”, “ignore the last line”, “the club room list is on a second page”"
        keywords={async () => {
          const occ = await occurrence();
          if (!occ) throw new Error('This night is no longer in the system');
          const [hints, run] = await Promise.all([placeHints(placeId, occ.event_id, occurrenceId), fetchRun(occurrenceId)]);
          return keywordsFor(
            { date: occ.event_date, days: 0, eventId: occ.event_id, eventName: occ.event_name, placeId, placeName: occ.primary_place_name, artistId: null, artistName: null },
            occ, currentLabels, hints, run,
          );
        }}
        onDiscard={() => { onDiscard(); setPattern(null); }}
        onDraft={async (draft, _r, instruction) => {
          const occ = await occurrence();
          if (!occ) throw new Error('This night is no longer in the system');
          void offerPattern(occ, draft.place_lineup_pattern, instruction);
          if (!draft.lineup) {
            return <><b>Nothing published for this night now.</b> The stored version is left as it is — a bill that has come down is not a bill that changed.</>;
          }
          const run = await fetchRun(occurrenceId).catch(() => null);
          const roster = await resolveRoster(draft.lineup, placeId, run);
          const diff = compareRosters(currentLabels, draft.lineup.artists);
          if (diff.same) return null;
          onFill(roster.slots, roster.splitByDay);
          return (
            <>
              <b>The publication differs from this version.</b>{' '}
              {diff.added.length > 0 && <>Added: {diff.added.join(', ')}. </>}
              {diff.removed.length > 0 && <>No longer listed: {diff.removed.join(', ')}. </>}
              {roster.toCreate.length > 0 && <>Created on save: {roster.toCreate.join(', ')}. </>}
              The form now holds the published line-up. <b>Save corrections</b> if this version was recorded wrong, or
              {' '}<b>Publish as new version</b> if the bill itself changed — that keeps this one as it was.
            </>
          );
        }}
      />

      {pattern && (
        <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
          <b>Keep this as knowledge about {pattern.target.name}</b>
          <p className="text-muted-foreground">{pattern.text}</p>
          {pattern.current && <p className="text-xs text-muted-foreground">Stored now: <span className="line-through">{pattern.current}</span></p>}
          <p className="text-xs text-muted-foreground">
            Stored on the {pattern.target.kind}, this is what the next actualization of any of its line-ups starts from.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={pattern.saved} onClick={() => void store()}>
              {pattern.saved ? 'Saved' : pattern.current ? 'Replace the stored pattern' : `Save on the ${pattern.target.kind}`}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPattern(null)}>Dismiss</Button>
          </div>
        </div>
      )}
    </div>
  );
}
