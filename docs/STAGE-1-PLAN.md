# Stage 1 — master data admin

Goal: an operator can enter every piece of master data the later stages depend
on, without asking a developer. Nothing about schedules.

Source: Solution Architecture Document v1.4, §3 and §4.

## Where we are

- [x] Phase 1 — Supabase project, migrations, RLS, first admin
- [x] Phase 2 — application shell, login, role-aware navigation
- [x] Phase 3a — Places list and record with enriched venue fields
- [ ] **Phase 3b — nested `place_space` block inside the Place record**
- [ ] Phase 4 — People and Artists
- [ ] Phase 5 — Events and occurrences
- [x] Phase 6 — Users management
- [ ] Phase 7 — deployment and acceptance run

Phases 4 and 5 are ordered that way deliberately: the person picker is the
least trivial component in the stage, and it is better debugged before a third
screen depends on it.

## Phase 3b — rooms inside a place

- Repeating block in the Place record: name, type, capacity, primary flag.
- Exactly one room may be primary; selecting one clears the others.
- Save in the same transaction as the place.
- Deleting a room is refused while any `performance_set` references it.
- Order comes from `display_order`.

Mockup: `design/PlaceEdit.dc.html`.

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
