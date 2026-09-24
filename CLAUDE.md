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
their occurrences (an occurrence may be *part of* an umbrella one — Miami
Music Week, ADE), Users management, RLS across every table. Every parent is
saved with its children through one RPC (`save_*_with_*` functions). Research
agents (`docs/AGENTS.md`) draft any of the four master-data records from
keywords.

Stage 2 has started (owner decision 2026-09-20): **Line-ups** and **Sets**
have their screens. `lineup` + `lineup_artist` say WHO is announced for an
occurrence and place, official only, one row per publication (version). A
`lineup_artist` row is one announced LINE with its `kind` (solo, b2b, feat. …)
and its acts in `lineup_artist_participant`.
`performance_set` says WHEN and WHERE each set plays — official (linked to
its line-up) or predicted, full or partial, per room — and is never updated
with new information.

Next: `docs/pending/DROP_typical_rooms.sql` once the seed and the "rooms
json" tests stop using the old columns, then the acceptance run.

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

**`scenario_version` is advanced by a publication** — a new `lineup` version
(`program_release` was replaced by `lineup` on 2026-09-20) — not by a change
to one room. Current official state resolves **per room**:
`max(scenario_version)` grouped by `(occurrence_id, place_space_id)`. A club
publishing one room's timetable leaves the other rooms on an earlier version,
and that is correct. The same rule one level up: `lineup.version` resolves per
`(occurrence_id, place_id)`, and a line-up with `place_id = null` is the
unattributed announcement, one row.

**`performance_set` rows are immutable except for `status`** — enforced by
`trg_performance_set_immutable`. `save_performance_set()` with an existing id
inserts the replacement and marks the old row `superseded`; the form says so.

**`placeholder_type` is never cleared when a slot is revealed.** TBA,
Surprise guest, Secret guest and Unknown are **artists** (`is_placeholder`), so
a slot can be half-known — "Solomun b2b TBA" — and a reveal is swapping the
act. What the pair says: a placeholder act in the slot shows that placeholder;
a real act plus `placeholder_type = secret_guest` shows the name with a "was a
secret guest" badge; a real act and no placeholder_type is an ordinary
announcement. A `tbd` slot vanishing from an announcement is normal; a
`secret_guest` vanishing is an anomaly worth a review task.

**A slot's `performance_format` defaults to `dj_set`, not `unknown`.** A club
bill that says nothing about the format means a DJ set; `unknown` is only for a
source that leaves it open. `tags` (all night long, opening, closing, sunrise…)
record what the bill prints, never what the billing order suggests.

**A line-up's room and day are what the poster said, nothing more.**
`lineup_artist.place_space_id` is NULL when the bill did not split by room —
never a default to the main room — and it must belong to the line-up's place.
`lineup_artist.slot_date` only applies to an occurrence that runs over several
days; `lineup.split_by_day = false` there means the bill announces the whole
run, which is a fact, not missing data.

**`lineup.published_at` is stamped when the version is saved.** `save_lineup()`
fills it with `now()` when the caller sends none and never clears it; an earlier
date is entered only when the announcement itself carries one.

**A slot's `kind` is the format of the set, never an artist type.** `b2b`,
`b3b`, `b4b`, `collaboration`, `featuring`, `multiple_guests` describe how the
acts of one line play together; `duo`, `group`, `collective` stay
`artist_type`. A kind that disagrees with the number of acts opens a review
task, it does not block the save.

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

**A record's `news_pattern` and `lineup_pattern` are accumulated knowledge,
not a description.** Place, event and artist each carry both. An AI
actualization is given them and returns them merged — keeping what is still
true, correcting what is not — and the instruction the operator typed for that
run lands there too when it says something durable. Never replace one with a
log of runs.

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

The original boundary — do not build the schedule entry screen until the
master data behind it is proven — was lifted by the owner on 2026-09-20, once
Places with rooms, Artists with members and Events with occurrences existed
and were used. The Line-ups and Sets screens are deliberately plain: a set is
one row, a line-up is one publication. What is still out of scope: evidence
and releases beyond `evidence_source`, ingestion, OCR, predictions generated
by an agent, favourites, notifications, public pages.

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
src/features/<area>/   page, api.ts, schema.ts per area (lineups and sets included)
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
