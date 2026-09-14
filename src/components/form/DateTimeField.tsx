import * as React from 'react';
import { Input } from '@/components/ui/input';
import { instantToWallTime, wallTimeToInstant } from '@/lib/datetime';

interface DateTimeFieldProps {
  id?: string;
  /** ISO instant, or null. */
  value: string | null;
  onChange: (iso: string | null) => void;
  /** IANA zone the wall time is read in. Falls back to the browser's. */
  timeZone?: string | null;
  invalid?: boolean;
  disabled?: boolean;
}

/**
 * Calendar + time picker (the DBML requires real pickers for date/time
 * fields, not free text) that reads and writes venue-local wall time while
 * storing an instant.
 */
export function DateTimeField({ id, value, onChange, timeZone, invalid, disabled }: DateTimeFieldProps) {
  const [wall, setWall] = React.useState(() => instantToWallTime(value, timeZone));

  // Re-derive when the row loads, or when the zone changes under us.
  React.useEffect(() => {
    setWall(instantToWallTime(value, timeZone));
  }, [value, timeZone]);

  return (
    <Input
      id={id}
      type="datetime-local"
      value={wall}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      onChange={(e) => {
        setWall(e.target.value);
        onChange(e.target.value ? wallTimeToInstant(e.target.value, timeZone) : null);
      }}
    />
  );
}
