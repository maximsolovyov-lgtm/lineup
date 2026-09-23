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

  // A long agent call answers 200 and puts its outcome in the body: the status
  // has to be sent before the work is done, or Cloudflare drops the connection.
  if (!res.ok || (body.error !== undefined && body.data === undefined)) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body.data as T;
}
