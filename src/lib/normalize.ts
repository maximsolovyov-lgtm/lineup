/**
 * Browser-side twin of public.normalize_name(): lowercase, accents stripped,
 * punctuation collapsed to single spaces. Used to build search filters
 * against place.normalized_name.
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Strips characters that would break a PostgREST `or=(...)` filter. */
export function safeFilterTerm(input: string): string {
  return input.replace(/[,()"\\%]/g, ' ').trim();
}
