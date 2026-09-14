# LineApp / LineupIN — Place Admin (MVP v1)

Internal admin application for the LineApp venue catalogue. Operators
maintain **places** — clubs, festival sites, temporary venues — with their
official links and the publishing and timing patterns that the future
Schedule Agent will use as prediction hints. Admins also manage users.

This is MVP v1 as decided on 2026-09-13 in the Drive documents under
`LineApp/` (PRD, Solution Architecture, Data Model, `LineApp - Data Model.dbml`).
Six tabs are built — **Places**, **Spaces**, **Events**, **Occurrences**,
**Artists** and **Users** — over a database schema covering all nine tables of
the DBML. The two schedule tables (`performance_set`,
`performance_set_participant`) exist with their constraints but have no UI
yet. See
[docs/DECISIONS.md](docs/DECISIONS.md) for the decisions taken on 2026-09-14
and the contradictions found in the source documents.

## Stack

| Layer | Choice |
|---|---|
| UI | React 18 + TypeScript, Vite, Tailwind, shadcn-style components, react-hook-form + zod |
| Data | Supabase Postgres, direct from the browser under row-level security |
| Auth | Supabase Auth, invite-only (public signup disabled) |
| Admin API | Hono in a Cloudflare Worker — only for operations that need the service-role key |
| Hosting | Cloudflare Workers with static assets |

## Permissions

| | admin | operator | deactivated / anon |
|---|---|---|---|
| Read places and other business tables | ✓ | ✓ | ✗ |
| Create / edit / deactivate places | ✓ | ✓ | ✗ |
| Read user list | ✓ | ✓ (names, for audit columns) | own row only |
| Invite users, change roles, deactivate users | ✓ | ✗ | ✗ |
| Hard delete anything | ✗ | ✗ | ✗ |

Every rule is enforced in the database by RLS policies
(`supabase/migrations/20260914010500_rls.sql`) independently of the UI. An
admin cannot demote or deactivate their own account (trigger). Audit
columns (`created_by`, `updated_by`, timestamps) and `normalized_name` are
set by a trigger and cannot be forged by clients.

## Repository layout

```
supabase/migrations/   Schema — the source of truth for the database
supabase/seed.sql      Local dev data: an admin, an operator, three venues
supabase/test/         RLS + constraint test suite (31 tests) and a local auth stub
scripts/verify-schema.sh   Runs the suite against any throwaway Postgres
src/                   Vite React app
  auth/                Session, guards, login, set-password
  layout/AppShell.tsx  Object tabs — add a route + one entry per new entity
  components/form/     LookupField (FK picker), RoomsEditor, DateTimeField, Field
  lib/datetime.ts      Venue-local wall time <-> instant (tested)
  lib/lookups.ts       Searchable foreign-key sources, shared across forms
  features/places/     Places tab: list, search, create/edit form
  features/spaces/     Spaces tab: rooms and stages, scoped to a venue
  features/events/     Events tab: brands, with their occurrences listed
  features/occurrences/  Occurrences tab: dated instances, venue-local times
  features/artists/    Artists tab
  features/users/      Users tab (admin): invite, role, activate/deactivate
  types/database.ts    Supabase types (hand-written from the migrations; see below)
  worker/              The Worker: POST /api/admin/users/invite, PATCH /api/admin/users/:id/status
docs/                  Source DBML and decisions log
```

## Running locally

### With the Supabase local stack (needs Docker)

```bash
npm install
npx supabase start            # Postgres + Auth + REST on localhost:54321
npx supabase db reset         # applies migrations + seed.sql
cp .env.example .env          # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from `supabase status`
cp .dev.vars.example .dev.vars # SUPABASE_URL + service role key from `supabase status`
npm run dev                   # UI on :5173, proxying /api to :8787
npm run dev:worker            # or the whole thing as it deploys, on :8787
```

Sign in as `admin@lineapp.local` or `operator@lineapp.local`. The seed
creates these users without passwords; set one with
`npx supabase auth` tooling or via Studio (localhost:54323) → Authentication.

### Schema only, without Docker

```bash
createdb lineapp_test
DATABASE_URL=postgres://localhost/lineapp_test npm run db:verify
```

This applies a small stand-in for Supabase's `auth` schema, all migrations,
the seed, and the 31-test RLS suite. It is how the schema in this repository
was verified.

## Deploying

### 1. Supabase project

```bash
npx supabase link --project-ref enivasukccwjpvsgwcsd
npx supabase db push
```

Then in the dashboard:

- **Authentication → Sign In / Providers → Email:** turn **off** "Allow new
  users to sign up". The app is invite-only; the profile trigger deliberately
  ignores user-supplied metadata for the role, but there is no reason to
  allow self-registration at all.
- **Authentication → URL Configuration:** set Site URL to the Pages URL and
  add `<pages-url>/auth/set-password` to Redirect URLs.
- **Create the first admin:** Authentication → Users → *Invite user*. The
  trigger creates their profile as an operator; promote them in the SQL
  editor: `update public.app_user_profile set role = 'admin' where email = '<email>';`
  Every later user is invited from the app's Users tab.

  **If you signed in and the app says "Your account has no application
  profile"**, the account was created before the migrations were applied, so
  the trigger that creates profiles did not exist yet. Run
  `scripts/bootstrap-admin.sql` in the SQL Editor with your email substituted;
  it creates the row and makes you an admin.

### 2. Cloudflare Workers

The app deploys as a single Worker: `/api/*` runs the Hono handler in
`src/worker/`, everything else is served from the built SPA in `dist`, and a
navigation that matches no file falls back to `index.html` so
`/places/:id` survives a direct load. That routing lives in `wrangler.jsonc`
(`run_worker_first` and `not_found_handling`), not in redirect files.

This deploys to the Worker named **`lineapp-claude`**. That name is set in
`wrangler.jsonc` and, when a repository is connected, it must match the
Worker's name in the dashboard exactly or the build fails.

**Either** connect the repository once and let Cloudflare build on every push
— open the Worker → **Settings → Builds → Connect** — **or** deploy from your
machine:

```bash
npx wrangler login
npm run deploy
```

The build needs no configuration: `.env.production` carries the two public
values Vite inlines into the bundle (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`). They are public by design — every visitor to the
deployed app receives them, and row-level security, not secrecy, is what
protects the data. Dashboard build variables of the same name override them.

One secret is required, set on the Worker rather than in the build:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

or **Settings → Variables and Secrets → Add → Secret**. That key bypasses RLS
entirely, so it lives only there: never in the repository, never in a build
variable, never in the browser. `SUPABASE_URL`, which the Worker also needs,
is a plain var already in `wrangler.jsonc`.

Finally, in Supabase → **Authentication → URL Configuration**, set the Site
URL to the deployed address and add `<your-worker-url>/auth/set-password` to
Redirect URLs, or invitation links will bounce.

## Times and timezones

`event_occurrence.starts_at` and `ends_at` are instants (`timestamptz`), but a
night at UNVRS starts at 23:30 *Ibiza* time whether the operator entering it
is in Ibiza or Miami. The occurrence form therefore reads and writes wall
time in the occurrence's own `timezone`, defaulting to the venue's, and
converts on the way in and out. `src/lib/datetime.ts` holds that logic and
`npm test` covers it, including both DST boundaries and nights that cross
midnight. Display is always 24-hour, whatever the viewer's locale.

## Tests

```bash
npm test          # node:test over src/**/*.test.ts
npm run typecheck # app, tests, and the Worker
npm run db:verify # schema + RLS suite against a throwaway Postgres
```

## Regenerating database types

`src/types/database.ts` was written by hand against the migrations because
`supabase gen types` needs Docker. With the local stack running:

```bash
npm run db:types
```

## Roadmap

`performance_set`, `performance_set_participant` and `evidence_source` exist
with RLS and constraints but have no UI. The first two are not simply CRUD:
`performance_set` carries `scenario_type`, `scenario_version` and the lineage
pointers `source_performance_set_id` / `supersedes_performance_set_id`, and
the model depends on new information creating a *new row* rather than editing
an existing one. A form over its columns would make it easy to produce
contradictory rows by hand, so that screen needs to be designed around
versions and supersession rather than fields.

Adding a straightforward entity tab, by contrast, is mechanical: a list page,
a form page, a zod schema, an `api.ts`, and one entry in `AppShell.tsx`.
`LookupField` and `lib/lookups.ts` already cover the foreign keys.

Not in scope for this or any near phase: ingestion agents, OCR, notifications,
favourites, public pages.
