# Stage 1 — master data admin

Goal: an operator can enter every piece of master data the later stages depend
on, without asking a developer. Nothing about schedules.

Source: Solution Architecture Document v1.4, §3 and §4.

## Where we are

- [x] Phase 1 — Supabase project, migrations, RLS, first admin
- [x] Phase 2 — application shell, login, role-aware navigation
- [x] Phase 3a — Places list and record with enriched venue fields
- [x] Phase 3b — nested `place_space` block inside the Place record (2026-09-19; the column drop is still pending)
- [ ] Phase 4 — People and Artists
- [ ] Phase 5 — Events and occurrences
- [x] Phase 6 — Users management
- [ ] Phase 7 — deployment and acceptance run

Phases 4 and 5 are ordered that way deliberately: the person picker is the
least trivial component in the stage, and it is better debugged before a third
screen depends on it.

## Phase 3b — rooms inside a place

Rooms were described twice: `place.typical_rooms_json` (with a structured
editor already built) and the `place_space` table. The headliner room was
recorded three times — the JSON flag, `place.typical_headliner_room_name`, and
`place_space.is_primary` — with nothing keeping them in agreement.

**Decision (2026-09-19): `place_space` is the only truth, and `is_primary` is
the only headliner marker.** Only `place_space` can carry a schedule, because
`performance_set.place_space_id` is a foreign key and a JSON array element has
no identity to point at.

Order of work:

1. ✅ `20260919200000_rooms_to_place_space.sql` — applied, additive. Verified:
   its backfill is correct but sees no places on a fresh `db reset` (the seed
   runs after migrations), so `seed.sql` now inserts the rooms itself.
2. ✅ Rooms block rebuilt against `place_space` (`SpacesEditor`): name, type,
   capacity, notes, primary. Selecting a primary clears the others. Saved with
   the place through `save_place_with_spaces()` — one RPC, one transaction
   (`20260919230000_place_space_editing.sql`).
3. ✅ Room count is the count of active rooms; the free-text headliner field
   and the room-count field are gone from the form.
4. ✅ `seed.sql` inserts 8 rooms across the 3 venues; `rls_test.sql` has 12
   rooms tests, including a second primary room being rejected and a
   referenced room refusing deactivation. 43/43 pass.
5. ⏳ Apply `docs/pending/DROP_typical_rooms.sql` last. Remaining references
   to the old columns: `seed.sql` (still fills `typical_rooms_json`) and the
   five "rooms json" tests. Nothing in `src/` reads or writes them any more.

Two things that are easy to get wrong here:

- **The place and its rooms must be saved in one transaction.** supabase-js
  cannot do client-side transactions, so this needs a Postgres function taking
  the place and a rooms array, called through RPC. A chain of inserts from the
  client violates the invariant in `CLAUDE.md` and leaves half-saved records.
- **Deactivating a room that a `performance_set` references must be refused.**
  A hard delete is already blocked by the foreign key, but a status change is
  not, and a status change is how this application deletes.

Mockup: `design/PlaceEdit.dc.html`. The rooms block is implemented as drawn
(name / type / capacity / primary / remove, with notes under the row).

## Phase 4 — people and artists

- People directory: list, search, record.
- Artist record with a members block: person, role, period.
- **Person picker** — search existing people, or create one inline. On create,
  warn about a likely duplicate before saving; one human under several names is
  normal, two `person` rows for one human is not.
- Advisory validation: `artist_type` against member count. A mismatch creates a
  review task and does not block the save.
- Reverse view on the person record: which names they perform under.

Mockups: `design/ArtistEdit.dc.html`, `design/PersonPicker.dc.html`.

## Phase 5 — events and occurrences

- Event record: name, type, description, site.
- Occurrences block: business day, default place, window, status.
- Business day is not the calendar date of `starts_at`. A party running 23:00
  Friday to 08:00 Saturday is Friday. Say so in the form, not only in the docs.
- Say in the form that the default place is not the place of a set.

Mockup: `design/EventEdit.dc.html`.

## Phase 7 — acceptance

Not a demo. An operator enters, unaided:

- 10 real venues with their rooms,
- 3 events with their dates,
- 5 artists with their members, including one duo and one collective,

and does not hit a modelling limit. Separately, an operator calling the API
directly with an `authenticated` key must fail to change their own role and
fail to delete a record.

## Out of scope, deliberately

Schedule entry, evidence and releases, ingestion, OCR, predictions, favourites,
notifications, public pages. The tables for the first two exist; their screens
belong to stage 2. See the stage boundary in `CLAUDE.md`.
