import { useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { hostnameOf, useAgent } from './client';
import type { AgentKind, AgentResult } from './common';

interface ActualizePanelProps<TDraft> {
  kind: AgentKind;
  /** "venue", "event brand", "act", "line-up" — for the copy. */
  noun: string;
  /** What the stored record is, as keywords. Built when the button is pressed. */
  keywords: () => string | Promise<string>;
  /**
   * Lay the draft over the form. Returns what to tell the operator, or null
   * when nothing differed. The instruction is passed on so the mapping can
   * keep it as knowledge when the agent did not fold it in itself.
   */
  onDraft: (draft: TDraft, result: AgentResult<TDraft>, instruction: string) => Promise<ReactNode | null> | ReactNode | null;
  /** Put the stored values back. */
  onDiscard: () => void;
  disabled?: boolean;
  /** An example of a useful instruction for this kind. */
  hint?: string;
}

/**
 * "AI actualization": research a record that already exists and lay the
 * answer over the form as a diff, with the stored value kept in red under
 * each changed field. Nothing is written until the operator saves.
 *
 * The instruction box is what makes a second run better than the first: the
 * operator says what the record does not (a URL to watch, a line to ignore),
 * the agent follows it, and what is durable about it comes back merged into
 * the record's news / line-up pattern — so the next run already knows.
 */
export function ActualizePanel<TDraft>({ kind, noun, keywords, onDraft, onDiscard, disabled, hint }: ActualizePanelProps<TDraft>) {
  const agent = useAgent<TDraft>(kind);
  const [instruction, setInstruction] = useState('');
  const [applied, setApplied] = useState<{ note: ReactNode; sources: string[] } | null>(null);

  async function run() {
    setApplied(null);
    try {
      const r = await agent.mutateAsync({ keywords: await keywords(), instruction: instruction.trim() || undefined });
      if (r.outcome !== 'draft' || !r.draft) {
        toast.warning(r.outcome === 'ambiguous'
          ? `The agent found several ${noun}s for this record — say which in the instruction, or refine the record first`
          : `The agent could not identify this ${noun} on the web`);
        return;
      }
      const note = await onDraft(r.draft, r, instruction.trim());
      setApplied({ note: note ?? <>Up to date — nothing differs from what was found.</>, sources: r.sources });
      toast.success(note ? 'Actualization applied to the form — review and save' : 'Up to date');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-[#C9BCE6] bg-secondary/40 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-secondary-foreground">AI actualization</h2>
        <span className="rounded-full bg-card px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">{kind} agent</span>
        <span className="flex-1" />
        <Button type="button" variant="secondary" onClick={() => void run()} disabled={disabled || agent.isPending}
          title={`Research this ${noun} again and show what differs; nothing is saved until you press Save`}>
          <RefreshCw className={agent.isPending ? 'animate-spin' : ''} /> {agent.isPending ? 'Actualizing…' : 'Actualize'}
        </Button>
      </div>
      <div className="space-y-1.5">
        <Textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={disabled || agent.isPending}
          aria-label="Extra instruction for the agent"
          placeholder={hint ?? 'Optional instruction: “the bill is at …”, “ignore the last line”, “the label page is stale, use the agency”'} />
        <p className="text-xs text-muted-foreground">
          Optional. The agent follows it for this run, and what is durable about it comes back folded into this record’s
          news / line-up pattern — stored when you save, so the next run already knows it.
        </p>
      </div>
      {applied && (
        <div className="rounded-md border border-blue-300 bg-blue-50/60 p-3 text-sm" role="status">
          {applied.note}
          {applied.sources.length > 0 && (
            <span className="mt-1 block text-xs text-muted-foreground">
              Sources: {applied.sources.map((u, i) => <span key={`${u}-${i}`}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noreferrer" className="underline">{hostnameOf(u)}</a></span>)}
            </span>
          )}
          <button type="button" className="mt-1 block underline" onClick={() => { onDiscard(); setApplied(null); }}>Discard the actualization</button>
        </div>
      )}
    </section>
  );
}
