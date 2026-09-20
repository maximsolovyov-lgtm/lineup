# LineApp — project memory

Real-time lineup and schedule data for nightlife and electronic music events.
This repository is the **Place Admin** application: an internal tool where
operators enter the master data everything else will depend on.

Authoritative specifications live in Google Drive (`My Drive / LineApp /`),
currently **v1.4, 2026-09-19**: PRD, Solution Architecture Document, Data
Model, Data Model DBML. This file carries the rules an implementer needs; the
Drive documents carry the reasoning. `docs/DECISIONS.md` records choices made
here when the documents were silent or contradicted each other.

## Current state

Built and working: authentication with admin/operator roles, Places with
their rooms (`place_space`), People, Artists with their members, Events with
their occurrences, Users management, RLS across every table. Every parent is
saved with its children through one RPC (`save_*_with_*` functions).

Next: `docs/pending/DROP_typical_rooms.sql` once the seed and the "rooms
json" tests stop using the old columns, then the Phase 7 acceptance run.

Schedule tables exist in the database. Their UI does not, and must not be
built yet — see the stage boundary below.

## Invariants

These are not preferences. Each one has cost someone a bug or a wrong fact.

**`performance_set.place_id = null` means the place was not announced.**
There is no default to `event_occurrence.primary_place_id`. A lineup published
without venue attribution is **one row with null**, never one copy per venue:
duplicating it asserts "this artist plays at venue X", which no source said,
doubles artist counts and sends two notifications about one person. A venue
page answers the reader by showing that venue's sets *plus* the occurrence's
unassigned sets, labelled as such. Same rule one level down for
`place_space_id`.

**Never UPDATE a `performance_set` row with new information.** Insert a new row
and point `supersedes_performance_set_id` at the old one. History is what lets
predictions be compared against what happened.

**`scenario_version` is advanced by a publication** (`program_release`), not by
a change to one room. Current official state resolves **per room**:
`max(scenario_version)` grouped by `(occurrence_id, place_space_id)`. A club
publishing one room's timetable leaves the other rooms on an earlier version,
and that is correct.

**`placeholder_type` is never cleared when a slot is revealed.** The pair
`(artist_id, placeholder_type)` tells the whole story: `null + tbd` shows
"TBA"; `null + secret_guest` shows "Secret Guest" with emphasis; `set + null`
is an ordinary announcement; `set + secret_guest` shows the name with a "was a
secret guest" badge. A `tbd` slot vanishing from an announcement is normal; a
`secret_guest` vanishing is an anomaly worth a review task.

**A parent and its children are saved in one transaction.** Place with its
rooms, event with its occurrences, artist with its members. Never a sequence of
per-row requests from the client — that is the usual cause of half-saved
records in nested forms.

**Deletion is a status change.** There is no hard delete for anyone, including
admin. `status` carries `cancelled` as distinct from `inactive` and
`superseded`, because cancellation is a notification event.

**RLS is the authority on permissions, not the UI.** Anything the interface
forbids must also fail when called directly with an `authenticated` key. The
service-role key is server-side only, in Pages Functions, never in the browser.

**`artist_list_json` is a cache.** The normalised truth about who performs is
`performance_set_participant`.

**Validation that can fire on incomplete data creates a review task, it does
not block the save.** Artist type against member count is the live example:
master data arrives incomplete and a hard constraint there would reject good
records.

**Only publicly known names are stored for people.** No legal or birth names
unless the artist published them.

**`duo`, `group` and `collective` are `artist_type` values.** B2B is a
set-level format (`performance_set.set_type`), never an artist type.

## Schema

`supabase/migrations/` is the contract. **Never edit an existing migration** —
if the schema has to change, add a new one. If code and schema disagree, the
schema is right until a migration says otherwise.

Postgres **15 or newer is required**, not preferred: uniqueness on
`performance_set` uses partial indexes with `NULLS NOT DISTINCT`, and without
it two rows with an unknown room do not collide.

Conventions already established here, worth keeping:

- `normalized_name` is set by a trigger, not a generated column (`unaccent` is
  not `IMMUTABLE`).
- `updated_at` via `set_updated_at()`; audit triggers per table.
- Role reads come from `raw_app_meta_data`, which only the service role can
  write — never from `raw_user_meta_data`.
- An admin cannot demote or deactivate their own account.

After a migration: `npm run db:types` to regenerate `src/types/database.ts`,
then `npm run db:verify`.

## Stage boundary

Do not build the schedule entry screen. The tables are there so the versioning
and integrity decisions were settled before any live data existed — not as an
invitation. It is the hardest screen in the system, and without proven master
data behind it, it will be rewritten. If it looks like the obvious next thing
to do, that is the trap this paragraph exists to name.

## Commands

```
npm run dev        # Vite
npm run dev:full   # Vite behind wrangler pages dev (needed for /api)
npm run typecheck  # src, tests and functions
npm run test       # node --test over src/**/*.test.ts
npm run lint
npm run build
npm run db:types   # regenerate database.ts from the local schema
npm run db:verify
```

## Layout

```
src/features/<area>/   page, api.ts, schema.ts per area
src/components/ui/     hand-written shadcn-style components, no CLI
src/components/form/   shared form pieces
functions/api/         Hono: service-role operations and the /api/agents routes
agents/                server-side research agents (Anthropic key); contracts and UI panel in src/agents/
supabase/migrations/   the schema contract
supabase/test/         RLS tests — extend these when adding a table
design/                interface mockups for the screens not yet built
docs/                  DECISIONS.md, the .dbml, stage plan
```

## Working style here

State assumptions instead of asking when the answer is in the Drive documents
or in `docs/DECISIONS.md`. When those are genuinely silent or contradict each
other, add the question and the chosen answer to `docs/DECISIONS.md` in the
same change — that file exists because the source documents were ambiguous
three times already, and each time the reasoning was worth keeping.
