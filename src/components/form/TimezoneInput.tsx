import * as React from 'react';
import { Input } from '@/components/ui/input';

const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
})();

/** Free-text IANA zone with a datalist of the browser's known zones. */
export const TimezoneInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  (props, ref) => (
    <>
      <Input ref={ref} list="iana-timezones" placeholder="Europe/Madrid" {...props} />
      <datalist id="iana-timezones">
        {ZONES.map((z) => <option key={z} value={z} />)}
      </datalist>
    </>
  ),
);
TimezoneInput.displayName = 'TimezoneInput';
