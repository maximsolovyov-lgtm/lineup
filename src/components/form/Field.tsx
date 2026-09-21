import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  /** The stored value an actualization replaced — shown small and red under the control. */
  previous?: string;
  className?: string;
  children: ReactNode;
}

/** Label + required marker + hint + error, in the layout every form field shares. */
export function Field({ label, htmlFor, required, error, hint, previous, className, children }: FieldProps) {
  const changed = previous !== undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
      </Label>
      <div className={cn(changed && 'rounded-lg ring-2 ring-blue-500 ring-offset-1 [&_input]:border-blue-500 [&_textarea]:border-blue-500 [&_button]:border-blue-500')}>{children}</div>
      {changed && <p className="text-xs text-red-600">was: {previous.trim() === '' ? <i>empty</i> : previous}</p>}
      {error ? (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
