import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface TagsInputProps {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  /** Existing vocabulary, for the datalist. */
  suggestions?: string[];
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * Chips plus a text input. Enter, comma or Tab adds the typed tag; Backspace
 * on an empty input removes the last one. Duplicates are compared
 * case-insensitively, the same rule as the database CHECK.
 */
export function TagsInput({ id, value, onChange, suggestions = [], disabled, invalid }: TagsInputProps) {
  const [draft, setDraft] = useState('');
  const listId = `${id ?? 'tags'}-suggestions`;

  function add(raw: string) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) { setDraft(''); return; }
    onChange([...value, tag.slice(0, 64)]);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && draft.trim())) {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2 py-1 ${invalid ? 'border-destructive' : 'border-input'}`}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
          {tag}
          {!disabled && (
            <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))} className="rounded-full hover:bg-black/10">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <Input
        id={id}
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={value.length === 0 ? 'Add a tag and press Enter' : ''}
        disabled={disabled}
        className="h-7 min-w-[8rem] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        aria-label="New tag"
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase())).map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
