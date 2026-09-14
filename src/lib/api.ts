import { supabase } from './supabase';

/**
 * Calls a Pages Function under /api with the current session's access token.
 * Only admin operations that need the service-role key go through here;
 * everything else talks to Supabase directly under RLS.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);

  const res = await fetch(path, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as { error?: string; data?: T };

  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body.data as T;
}
