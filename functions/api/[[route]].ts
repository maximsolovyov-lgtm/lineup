/**
 * Server endpoints — Cloudflare Pages Function at /api/*.
 *
 * Two things live here because they need server-side secrets:
 *   /api/admin/*  — the Supabase service-role key: creating auth users
 *                   (invites) and banning/unbanning them on deactivation.
 *   /api/agents/* — the Anthropic API key: the place agent.
 * Everything else the browser does directly against Supabase under RLS.
 *
 * The service-role key bypasses RLS, so every route re-checks the caller's
 * own profile before doing anything.
 */
import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../src/types/database';
import Anthropic from '@anthropic-ai/sdk';
import { PlaceAgentRequestSchema } from '../../src/agents/place/schema';
import { draftPlace, placeDraftJsonSchema, PLACE_AGENT_MODEL } from '../../agents/place/agent';
import { geocodePlace } from '../../agents/geocode';

interface Env {
  SUPABASE_URL: string;
  /** Public anon key: enough to verify a session token and read the caller's own profile under RLS. */
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Anthropic API key for the agents. */
  ANTHROPIC_API_KEY?: string;
  /** Shared secret that lets another agent call /api/agents/* without a user session. */
  AGENT_API_KEY?: string;
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

/**
 * A client acting as the signed-in user: anon key plus their token, so RLS
 * applies. Verifying a session and reading one's own profile needs nothing
 * more — the service-role key stays reserved for /admin/*.
 */
function userClient(env: Env, token: string): SupabaseClient<Database> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be configured for the Function');
  }
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
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

// Agents ----------------------------------------------------------------------
// Two ways in: a signed-in operator or admin (Bearer session token, as the
// admin UI does), or another agent with the shared AGENT_API_KEY in an
// x-api-key header. Both are checked here; the routes trust c.get('caller').
app.use('/agents/*', async (c, next) => {
  if (c.req.path.endsWith('/agents/health')) { await next(); return; }
  const apiKey = c.req.header('x-api-key');
  if (apiKey) {
    if (!c.env.AGENT_API_KEY || !timingSafeEqual(apiKey, c.env.AGENT_API_KEY)) {
      return c.json({ error: 'Invalid agent key' }, 401);
    }
    c.set('userId', 'agent');
    await next();
    return;
  }

  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'Sign in, or send x-api-key' }, 401);

  const sb = userClient(c.env, token);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return c.json({ error: 'Invalid or expired session' }, 401);
  const { data: me } = await sb.from('app_user_profile').select('role,status').eq('user_id', user.id).maybeSingle();
  if (!me || me.status !== 'active') return c.json({ error: 'Active operator or admin role required' }, 403);

  c.set('userId', user.id);
  await next();
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Unauthenticated on purpose: it reveals only whether the Function's keys
 * are configured and accepted, never their values — the check an operator
 * needs right after `wrangler pages secret put`. Costs one models.retrieve.
 */
app.get('/agents/health', async (c) => {
  let anthropic: 'ok' | 'missing' | 'rejected' | 'unreachable' = 'missing';
  if (c.env.ANTHROPIC_API_KEY) {
    try {
      await new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY, maxRetries: 0 }).models.retrieve(PLACE_AGENT_MODEL);
      anthropic = 'ok';
    } catch (err) {
      anthropic = err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError ? 'rejected' : 'unreachable';
      console.error('agents/health:', err);
    }
  }
  return c.json({ data: { model: PLACE_AGENT_MODEL, anthropic, agent_key: c.env.AGENT_API_KEY ? 'set' : 'unset' } }, anthropic === 'ok' ? 200 : 503);
});

/** The draft's JSON schema — what another agent registers as this tool's result shape. */
app.get('/agents/place/schema', (c) =>
  c.json({ data: { model: PLACE_AGENT_MODEL, request: { keywords: 'string — keywords separated by ";"' }, response: placeDraftJsonSchema() } }));

/**
 * POST /api/agents/place  { "keywords": "Club Space; Miami; https://www.instagram.com/clubspacemiami" }
 * → { data: { draft: PlaceDraft, keywords, model, usage } }
 * The draft's `place` and `spaces` are shaped for save_place_with_spaces().
 */
app.post('/agents/place', async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY is not configured for the Function' }, 503);
  const parsed = PlaceAgentRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);

  try {
    const result = await draftPlace(parsed.data.keywords, { apiKey: c.env.ANTHROPIC_API_KEY });
    return c.json({ data: result });
  } catch (err) {
    // Most specific first; the raw API error body is logged, not returned.
    console.error('place agent:', err);
    if (err instanceof Anthropic.AuthenticationError) return c.json({ error: 'The Anthropic API key configured for the Function was rejected' }, 503);
    if (err instanceof Anthropic.RateLimitError) return c.json({ error: 'The agent is rate-limited right now — try again in a minute' }, 429);
    if (err instanceof Anthropic.APIConnectionError) return c.json({ error: 'Could not reach the Anthropic API' }, 502);
    if (err instanceof Anthropic.APIError) return c.json({ error: `Anthropic API error ${err.status ?? ''}: ${err.message}` }, 502);
    return c.json({ error: err instanceof Error ? err.message : 'Agent failed' }, 502);
  }
});

const geocodeSchema = z.object({
  name: z.string().trim().max(512).optional(),
  address: z.string().trim().max(2000).optional(),
  city: z.string().trim().max(256).optional(),
  region: z.string().trim().max(256).optional(),
  country: z.string().trim().max(128).optional(),
});

/**
 * POST /api/agents/geocode  { address?, city?, region?, country?, name? }
 * → { data: { latitude, longitude, display_name, kind, approximate, source } | null }
 * OpenStreetMap Nominatim; no model involved. Same auth as the other agents.
 */
app.post('/agents/geocode', async (c) => {
  const parsed = geocodeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  if (!parsed.data.city && !parsed.data.address) return c.json({ error: 'Give at least a city or an address' }, 400);
  try {
    return c.json({ data: await geocodePlace(parsed.data, AbortSignal.timeout(15_000)) });
  } catch (err) {
    console.error('geocode:', err);
    return c.json({ error: 'The geocoding service did not answer' }, 502);
  }
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export const onRequest = handle(app);
