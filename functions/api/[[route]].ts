/**
 * Admin endpoints — Cloudflare Pages Function at /api/*.
 *
 * Only operations that need the Supabase service-role key live here:
 * creating auth users (invites) and banning/unbanning them on deactivation.
 * Everything else the browser does directly against Supabase under RLS.
 *
 * The service-role key bypasses RLS, so every route re-checks that the
 * caller's own profile is an active admin before doing anything.
 */
import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../src/types/database';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface Variables {
  userId: string;
  supabase: SupabaseClient<Database>;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>().basePath('/api');

function serviceClient(env: Env): SupabaseClient<Database> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for the Function');
  }
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'Internal error' }, 500);
});

app.use('/admin/*', async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'Not signed in' }, 401);

  const sb = serviceClient(c.env);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return c.json({ error: 'Invalid or expired session' }, 401);

  const { data: me } = await sb
    .from('app_user_profile')
    .select('role,status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!me || me.status !== 'active' || me.role !== 'admin') {
    return c.json({ error: 'Admin role required' }, 403);
  }

  c.set('userId', user.id);
  c.set('supabase', sb);
  await next();
});

const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
  full_name: z.string().trim().min(1).max(256).optional(),
  role: z.enum(['admin', 'operator']).default('operator'),
});

app.post('/admin/users/invite', async (c) => {
  const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }
  const { email, full_name, role } = parsed.data;
  const sb = c.get('supabase');

  const origin = new URL(c.req.url).origin;
  const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
    data: full_name ? { full_name } : undefined,
    redirectTo: `${origin}/auth/set-password`,
  });
  if (error) return c.json({ error: error.message }, 400);

  // The auth trigger has already created the profile as an operator; apply
  // the requested role (and name, if given) now.
  const patch: Database['public']['Tables']['app_user_profile']['Update'] = { role };
  if (full_name) patch.full_name = full_name;

  const { data: profile, error: profileError } = await sb
    .from('app_user_profile')
    .update(patch)
    .eq('user_id', data.user.id)
    .select()
    .single();
  if (profileError) return c.json({ error: profileError.message }, 500);

  return c.json({ data: profile }, 201);
});

const statusSchema = z.object({ status: z.enum(['active', 'inactive']) });

app.patch('/admin/users/:id/status', async (c) => {
  const id = c.req.param('id');
  if (!z.string().uuid().safeParse(id).success) return c.json({ error: 'Invalid user id' }, 400);
  if (id === c.get('userId')) return c.json({ error: 'You cannot change your own status' }, 400);

  const parsed = statusSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid payload' }, 400);
  const { status } = parsed.data;
  const sb = c.get('supabase');

  // Banning ends the user's sessions immediately; RLS would already deny
  // them data access, this closes the auth side too.
  const { error: banError } = await sb.auth.admin.updateUserById(id, {
    ban_duration: status === 'inactive' ? '876000h' : 'none',
  });
  if (banError) return c.json({ error: banError.message }, 400);

  const { data: profile, error } = await sb
    .from('app_user_profile')
    .update({ status })
    .eq('user_id', id)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ data: profile });
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export const onRequest = handle(app);
