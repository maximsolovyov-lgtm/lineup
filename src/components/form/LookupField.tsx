import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export interface LookupOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface LookupFieldProps {
  id?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  /** Resolves a query to options; called on every keystroke (debounced). */
  search: (query: string) => Promise<LookupOption[]>;
  /** Resolves the current value to a label when the form loads with an id. */
  resolve: (id: string) => Promise<LookupOption | null>;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}

/**
 * Searchable foreign-key picker. The DBML forbids raw UUID inputs for FK
 * fields; this shows names and stores the id.
 */
export function LookupField({ id, value, onChange, search, resolve, placeholder = 'Search…', invalid, disabled }: LookupFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [selected, setSelected] = useState<LookupOption | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    let cancelled = false;
    resolve(value).then((opt) => {
      if (!cancelled) setSelected(opt);
    });
    return () => {
      cancelled = true;
    };
  }, [value, resolve, selected?.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      search(query).then((opts) => {
        if (cancelled) return;
        setOptions(opts);
        setSearching(false);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, search]);

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', invalid && 'border-destructive')}
          >
            <span className="truncate">{selected ? selected.label : placeholder}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>{searching ? 'Searching…' : 'No matches.'}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.id}
                    onSelect={() => {
                      setSelected(opt);
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('h-4 w-4', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      {opt.sublabel && <span className="text-xs text-muted-foreground">{opt.sublabel}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && !disabled && (
        <Button type="button" variant="ghost" size="icon" title="Clear" onClick={() => { setSelected(null); onChange(null); }}>
          <X />
        </Button>
      )}
    </div>
  );
}
