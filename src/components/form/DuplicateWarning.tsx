import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DuplicateMatch } from '@/lib/duplicates';

interface DuplicateWarningProps {
  matches: DuplicateMatch[];
  /** What a row is called, for the copy: "venue", "event", "artist", "person". */
  noun: string;
  /** Set once the operator pressed Create and an exact match blocked it. */
  blocked: boolean;
  onCreateAnyway: () => void;
}

/**
 * Under the name of a new record: the active rows that look like the same
 * thing, with a link to open each. An exact match blocks Create until the
 * operator says "anyway" — a second row for one thing is the mistake this
 * exists to prevent.
 */
export function DuplicateWarning({ matches, noun, blocked, onCreateAnyway }: DuplicateWarningProps) {
  if (matches.length === 0) return null;
  const exact = matches.filter((m) => m.exact);
  const tone = exact.length > 0 || blocked ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900';
  return (
    <div className={`space-y-2 rounded-md border p-3 text-sm ${tone}`} role="alert">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p>
            {exact.length > 0
              ? <>A {noun} with this name already exists. Open it instead of creating a second one.</>
              : <>Similar {noun}{matches.length === 1 ? '' : 's'} already exist — check before creating a new one.</>}
          </p>
          <ul className="space-y-0.5">
            {matches.map((m) => (
              <li key={m.id}>
                <Link to={m.path} className="font-medium underline underline-offset-2">{m.name}</Link>
                {m.detail && <span className="opacity-80"> · {m.detail}</span>}
                {m.exact && <span className="ml-1 rounded bg-red-200 px-1.5 py-0.5 text-[11px] font-semibold uppercase">same name</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {blocked && (
        <div className="flex items-center gap-2 pl-6">
          <span className="text-xs">Not the same thing? </span>
          <Button type="button" size="sm" variant="outline" onClick={onCreateAnyway}>Create anyway</Button>
        </div>
      )}
    </div>
  );
}
