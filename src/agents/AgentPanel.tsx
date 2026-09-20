import { useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { hostnameOf, useAgent } from './client';
import type { AgentKind, AgentResult, Candidate } from './common';

interface AgentPanelProps<TDraft> {
  kind: AgentKind;
  /** "venue", "artist", ... — for the copy. */
  noun: string;
  placeholder: string;
  /** Called with a draft outcome; the form fills itself. May return a note to show under the result. */
  onDraft: (result: AgentResult<TDraft> & { draft: TDraft }) => Promise<ReactNode | void> | ReactNode | void;
}

/**
 * The "Create from keywords" block at the top of every new-record form:
 * keywords in, one of three outcomes out. On "ambiguous" the operator picks
 * a candidate and the agent is called again for that one. Nothing is saved
 * here — the form is filled, the operator reviews and presses Create.
 */
export function AgentPanel<TDraft>({ kind, noun, placeholder, onDraft }: AgentPanelProps<TDraft>) {
  const agent = useAgent<TDraft>(kind);
  const [keywords, setKeywords] = useState('');
  const [result, setResult] = useState<AgentResult<TDraft> | null>(null);
  const [extra, setExtra] = useState<ReactNode>(null);
  const [chooser, setChooser] = useState<Candidate[] | null>(null);

  async function run(candidate?: Candidate) {
    if (keywords.trim().length < 2) return;
    setChooser(null);
    try {
      const r = await agent.mutateAsync({ keywords, candidate });
      setResult(r);
      setExtra(null);
      if (r.outcome === 'draft' && r.draft) {
        const note = await onDraft({ ...r, draft: r.draft });
        setExtra(note ?? null);
        toast.success(`Draft filled from ${r.sources.length} source${r.sources.length === 1 ? '' : 's'} — review before creating`);
      } else if (r.outcome === 'ambiguous') {
        setChooser(r.candidates);
      } else {
        toast.warning(`No ${noun} matched these keywords`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-[#C9BCE6] bg-secondary/40 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-secondary-foreground">Create from keywords</h2>
        <span className="rounded-full bg-card px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">{kind} agent</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Several keywords separated by <code>;</code> — a name, a city, an Instagram profile or a website. The agent researches the {noun}
        on the web and fills the form. If more than one {noun} fits, you choose which one. Nothing is saved until you press Create.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Keywords"
          placeholder={placeholder}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } }}
          disabled={agent.isPending}
          className="h-11 bg-card"
        />
        <Button type="button" size="lg" onClick={() => void run()} disabled={agent.isPending || keywords.trim().length < 2}>
          <Sparkles /> {agent.isPending ? 'Researching…' : 'Fill the form'}
        </Button>
      </div>
      {agent.isPending && <p className="text-xs text-muted-foreground">Searching the web and reading pages — usually 20–60 seconds.</p>}

      {result && result.outcome !== 'ambiguous' && (
        <div className={result.outcome === 'draft' ? 'space-y-1 rounded-md border bg-card p-3 text-sm' : 'space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm'} role="status">
          <div>
            <b>{result.outcome === 'draft' ? `${capitalize(noun)} identified` : `No ${noun} identified`}</b>
            {' · '}confidence <span className="font-mono">{Math.round(result.confidence * 100)}%</span>
          </div>
          {result.notes && <p className="text-muted-foreground">{result.notes}</p>}
          {extra}
          {result.sources.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Sources: {result.sources.map((u, i) => (
                <span key={`${u}-${i}`}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noreferrer" className="underline">{hostnameOf(u)}</a></span>
              ))}
            </p>
          )}
        </div>
      )}
      {result?.outcome === 'ambiguous' && !chooser && (
        <p className="text-sm text-muted-foreground">
          {result.candidates.length} {noun}s matched. <button type="button" className="underline" onClick={() => setChooser(result.candidates)}>Choose one</button>
        </p>
      )}

      <Dialog open={!!chooser} onOpenChange={(o) => { if (!o) setChooser(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Which {noun} did you mean?</DialogTitle>
            <DialogDescription>
              The keywords fit {chooser?.length ?? 0} different {noun}s. Pick one and the agent will research exactly that one.
              {result?.notes ? ` ${result.notes}` : ''}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-md border">
            {(chooser ?? []).map((c, i) => (
              <li key={`${c.label}-${i}`}>
                <button type="button" onClick={() => void run(c)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-sm text-muted-foreground">{c.description}</span>
                    {c.sources.length > 0 && (
                      <span className="block truncate text-xs text-muted-foreground">{c.sources.map(hostnameOf).join(' · ')}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{Math.round(c.confidence * 100)}%</span>
                </button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setChooser(null)}>None of these</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
