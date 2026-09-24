# Decisions and source-document notes

## Decisions taken on 2026-09-14

Recorded here because the Drive documents (PRD / Solution Architecture /
Data Model, all v1.3 dated 2026-09-13) were ambiguous or silent on them.

| Question | Decision |
|---|---|
| The prose documents say MVP v1 = `place` + `app_user_profile`; the `.dbml` says "one tab per main data entity" and "operator can create and update any entity" and defines nine tables with UI notes. | **Two tabs now, schema for all nine.** Places and Users get UI; every DBML table is created with RLS and constraints so later tabs need no schema work. |
| Can an operator deactivate a place? SAD §2 gives "deactivate" to admin only; PRD and DBML give operator "create and update" with no carve-out. | **Yes.** Status is a field like any other; RLS grants operators UPDATE on all place columns. |
| `typical_rooms_json` shape (the DBML requires a validated structured editor but gives no schema). | Array of `{ name: string, is_headliner_room: boolean, capacity?: integer ≥ 0, notes?: string }`, no other keys. Enforced by a CHECK constraint (`is_valid_rooms_json`) and by the editor. `typical_room_count` is derived from it when present. |
| Supabase project | Exists; owner shares the URL and anon key in chat, secrets via environment configuration only. |

## Defaults chosen without asking

- Vite SPA on Pages; Hono in a Pages Function only for invite and
  activate/deactivate (the two operations that need the service-role key).
  Role changes go straight through supabase-js under RLS.
- Public signup disabled. Admin invites via Supabase Admin API. A trigger on
  `auth.users` creates the profile; it reads the role from
  `raw_app_meta_data` (service-role-writable only), never from
  `raw_user_meta_data` (user-writable), so a self-signup could never claim
  admin even if signup were re-enabled.
- No hard delete for anyone; "deactivate" is a status change. Deactivating a
  user also bans them in Auth so open sessions end.
- Deactivated users lose all business-data access but can read their own
  profile row, so the UI can tell them their account is inactive.
- An admin cannot demote or deactivate their own account (trigger), to avoid
  lock-out.
- `normalized_name` set by trigger (`unaccent` + lowercase + punctuation
  collapsed), not by a generated column, because `unaccent` is not
  `IMMUTABLE`.
- `artist.artist_type` is `varchar` in the DBML with a listed vocabulary;
  a CHECK enforces that vocabulary.
- UI in English; shadcn-style components hand-written (no CLI dependency).

## Contradictions in the source documents (as of 2026-09-14)

Worth fixing in Drive so the next reader doesn't have to reconcile them.

1. **PerformanceSetParticipant — removed or retained?** PRD §9 and Data
   Model §3 say *removed, superseded by `artist_list_json`*. The 2026-09-13
   change logs in all three documents, the SAD §5–§9, and the `.dbml` say the
   opposite: retained as the source of truth, `artist_list_json` is cache
   only. This repository follows the change logs and the `.dbml`.
2. **SAD reader summary** lists **PerformanceSet** under "Removed Future
   Tables" (with a non-existent "PerformanceSetParticipantRelation").
   Should read PerformanceSetRelation.
3. **Data Model §3 and §4** still describe OccurrencePlace (unmarked),
   OccurrenceSpace, LineupEntry, LineupPlacement, ScheduleScenario,
   PerformanceSetRelation, `collaboration_type = b2b`, PerformanceSetSegment
   and SetSegmentParticipant as current. All are removed in §7–§8.
4. **DBML document reader summary** lists `occurrence_place` under "Future
   Event Model"; it is removed and appears commented-out in the `.dbml`.
5. The 2026-09-13 change logs were pasted mid-paragraph in the PRD, Data
   Model and DBML documents, splitting words ("Mitigat…ion",
   "app_user_p…rofile", "typical_head…liner_start_day_offset").
6. **DBML document body vs `.dbml` file:** the document is missing the
   `participant_role` enum and the `performance_set_participant` table that
   the `.dbml` file has. The file is the authoritative one per the document
   itself, and is what this schema follows.

## Source documents updated to v1.4 (2026-09-19)

The Drive documents were rewritten. Every contradiction listed above is now
resolved there, in the way this repository had already chosen:

| Item above | Resolution in v1.4 |
|---|---|
| 1. PerformanceSetParticipant removed or retained? | **Retained** as the normalised source of truth; `artist_list_json` is cache only. PRD §9 and Data Model §3 no longer say otherwise. |
| 2. SAD reader summary | Corrected to ScheduleScenario and PerformanceSetRelation. |
| 3. Data Model §3–§4 describing removed tables | Section rewritten against the simplified model; legacy names kept only where a reader of an older document needs them. |
| 4. DBML reader summary listing `occurrence_place` | Removed. |
| 5. Change logs pasted mid-paragraph | Fixed; change logs are now their own section at the end of each document. |
| 6. DBML document missing `participant_role` and `performance_set_participant` | Both are in the document body now. The `.dbml` file remains authoritative. |

## Decisions taken on 2026-09-19

| Question | Decision |
|---|---|
| How to model who actually performs under a stage name. | `person` + `artist_membership`, many-to-many in both directions, with `started_at` / `ended_at` so a past event shows the line-up of its own time. |
| A collective arriving short of its full line-up (Keinemusik with two of three). | `performance_set_participant_person`, written **only** when the announced line-up differs from the membership. Empty means the default membership performs. |
| `person.display_name` vs the repo convention of `name`. | `display_name`, matching the Drive documents, with its own `set_person_normalized_name()` trigger. One extra function is cheaper than document/schema drift. |
| TBD and Secret Guest — one concept or two? | Two. Different guarantees, different notifications, different display. Stored as `placeholder_type` on the **participant**, not on `set_type`, because a b2b can have one known and one hidden artist. |
| A third value `special_guest`? | Deferred. It behaves identically to `secret_guest`; if the difference is only the wording on the poster, it belongs in `display_name_override`. |
| `+ more TBA` on a poster. | `performance_set.lineup_complete`, a property of the block. Phantom participant rows for slots that do not exist were rejected. |
| An event at two venues with an unattributed line-up. | **One** row with `place_id` null. Duplicating participants per venue was rejected: it asserts a fact no source stated, doubles artist counts, and produces two notifications about one person. This also removed the "defaults to `primary_place_id`" rule — null now always means unknown. |
| Sets with no end time ("till close") and festivals announced by day only. | `scheduled_start_at` and `scheduled_end_at` became nullable. They were `not null`, so neither case could be recorded at all. |
| Distinguishing "two venues at once" from "moves to an afterparty". | Explicit `place_role` (main / afterparty / satellite). Inferring it from whether the windows overlap is too fragile. |
| Uniqueness of `performance_set`. | Two partial unique indexes: one block per (place, room, version) for `group`, and start-time-distinguished for the rest. Both `nulls not distinct`, which fixes Postgres 15 as the floor. |
| Reprocessing the same source. | `evidence_source.content_hash`, unique. The idempotency NFR had no mechanism behind it. |
| `information_origin`, `confirmation_status`, `artist_type` as `varchar`. | Converted to enums. The vocabularies were already closed in practice. |
| Cancellation. | `cancelled` added to `record_status`; it was indistinguishable from `inactive` and `superseded`, although it is a separate notification event. |

### Still open after v1.4

Recorded so they are not rediscovered from scratch:

1. **Conflicting official sources** — a DJ's story says 02:00, the club's site
   says 03:00; both are `official` within one version. Needs source precedence
   or parallel rows with a conflict flag.
2. **Retracting a mistaken publication** — a new version repeating the previous
   one, or `confirmation_status = retracted` on the wrong one?
3. **Retiring predicted rows** once the official schedule arrives — who
   supersedes them, and when.
4. **An event postponed** — a new occurrence or a shift of the existing one.
   Affects favourites and notifications.
5. **A room renamed for one event** (Main Room becomes "Circoloco Stage") —
   no home today; the candidate is `display_name` on the set.
6. **Time zones and DST** — a festival on a zone boundary, the night the
   clocks change.

## Decision 2026-09-19 — one room list, one headliner marker

| Question | Decision |
|---|---|
| Rooms were described both as `place.typical_rooms_json` and as `place_space` rows; the headliner room was marked in three independent places. | **`place_space` is the only truth; `place_space.is_primary` is the only headliner marker.** `place.typical_rooms_json`, `typical_headliner_room_name` and `typical_room_count` are deprecated and will be dropped. |
| Why not keep the JSON for the "typical" nuance — which rooms a venue usually opens, as opposed to which exist? | The nuance is real but does not justify a second list. It belongs on the rooms as flags. `is_primary` covers the headliner room; a `typically_active` flag can be added later if the distinction earns its keep. It was left out for now. |
| Why not keep the JSON as the editable one? | A JSON array element has no identity. `performance_set.place_space_id` is a foreign key, so the JSON can never carry a schedule, while `place_space` can hold everything the JSON held. The asymmetry is one-directional. |
| How to sequence it, given the columns are referenced by the form, the seed and six RLS tests? | Two steps. `20260919200000_rooms_to_place_space.sql` backfills and is safe to apply immediately. `docs/pending/DROP_typical_rooms.sql` removes the columns, the CHECKs, the validator function and the trigger logic, and is applied only after the code stops referencing them. |
| More than one primary room per place? | Rejected by a partial unique index, not left to the interface. The backfill keeps the first candidate when the JSON marked two. |
| Verified how? | The whole migration chain was applied to a clean PostgreSQL 16 using `supabase/test/auth_stub.sql`: all eleven files apply without error, and the backfill produced 8 rooms across the 3 seeded venues with exactly one primary each, matching `typical_headliner_room_name` in all three. |
| `supabase db reset` runs migrations before `seed.sql`, so the backfill sees an empty database and does nothing. | `seed.sql` inserts the `place_space` rows directly (plain inserts, one primary per venue). Without them a freshly reset local database had venues and no rooms at all — found on 2026-09-19 when the backfill was verified: 0 rows on a fresh reset, 8 correct rows when its INSERT was re-run with the seed present. |

## Decision 2026-09-19 — saving a place with its rooms (Phase 3b)

| Question | Decision |
|---|---|
| How does the form save a place and its rooms in one transaction, given supabase-js has no client-side transactions? | A Postgres function, `save_place_with_spaces(p_place jsonb, p_spaces jsonb)`, called through RPC (`20260919230000_place_space_editing.sql`). It inserts or updates the place, then inserts/updates each room in display order. Any error rolls back everything. |
| SECURITY DEFINER or INVOKER? | **INVOKER.** Every statement runs under the caller's RLS, so the function adds no permission the tables do not already grant; a deactivated user or `anon` fails exactly as with direct table access. The one DEFINER function is the status guard trigger, which must see every `performance_set` row regardless of who is saving. |
| What happens to a room the operator removes from the list? | It is set to `inactive` — never deleted. The form does not show inactive rooms; re-adding the same name creates a new row (the name index is partial on active rows). Reactivation from the UI is deferred until someone needs it. |
| A room a `performance_set` refers to is removed from the list. | The save is refused as a whole (`trg_place_space_guard_status`). The operator keeps the room or the schedule, not half of each. |
| Moving the primary flag from one room to another. | The function clears every primary flag of the place first, then applies the list; otherwise `uq_place_space_primary` fires halfway through the loop. Two primaries in one call are rejected before any write. |
| `typical_room_count` after the form stopped sending it. | Left alone. The form shows the count of active rooms; the column is deprecated and goes with `docs/pending/DROP_typical_rooms.sql`. |
| `src/types/database.ts` was hand-written. | Now generated (`postgres-meta` v0.99.0, the version CLI 2.117.0 pins). The three constant arrays the app used moved to `src/types/enums.ts`, derived from the generated `Constants`, so a new enum value cannot be forgotten. |

## Decisions 2026-09-20 — people, artists, events (Phases 4 and 5)

| Question | Decision |
|---|---|
| Where does "a review task" live? CLAUDE.md requires advisory validation to create one; no table existed. | `review_task` (`20260920100000_master_data_editing.sql`): `entity_type` + `entity_id` (polymorphic, no FK), `kind`, `message`, `status` (`active` = open, `closed` = resolved). One open task per (entity, kind), enforced by a partial unique index. Because there is no FK, PostgREST cannot embed it; lists fetch open tasks in a second query. |
| Artist type vs member count — what exactly is checked, and when? | `solo` → exactly 1 current member, `duo` → 2, `group`/`collective` → 2 or more, `alias`/`unknown` → nothing. Current = active membership with no `ended_at`. Judged only once at least one member is recorded: an artist with no members yet is incomplete, not wrong. A mismatch records the task and the save succeeds; a later consistent save closes it. The form shows the same verdict live. |
| Creating a person inline from the artist form. | The picker does not write. A new person travels inside the member row (`new_person`) and `save_artist_with_members()` creates it in the artist's transaction, so a failed save leaves no orphan person. The duplicate warning queries `person` by normalised name while the operator types and offers the existing person instead. |
| A member sent without `membership_id` for a person already in the line-up. | Matched on (person, `started_at`), nulls equal, and updated rather than inserted — the same rule as `uq_artist_membership`. Makes the call idempotent. |
| Removing a member vs ending a membership. | Removing the row sets the membership `inactive` (a data-entry mistake). A member who left keeps the row with `ended_at` set — that is what lets a 2019 event show the line-up of its own time. |
| Fields on the mockups that the v1.4 model lacked. | Added: `event.description`, `event.website_url`, `artist.country`, `artist.instagram_url`. Plain reference fields; nothing reads them yet. |
| How an operator enters an occurrence's window. | Business day (a date) plus two wall-clock times in the default place's time zone, as drawn in `design/EventEdit.dc.html`. An end time at or before the start means the next morning. The form converts to instants with `src/lib/datetime.ts` (from the old line, with its tests) and stores the place's zone on the occurrence. `event_date` is entered, never derived. |
| Removing a date from an event. | Left out of the list → `inactive`, unless a `performance_set` or `program_release` refers to it, in which case the whole save is refused and the form says to cancel it instead. Cancelling (`cancelled`) is always allowed: it is a notification event, not a deletion. |
| `DELETE` was granted to `authenticated` on the four v1.4 tables. | Supabase's default privileges grant ALL on new tables; `20260919120300` granted select/insert/update without revoking. RLS had no delete policy, so no row could go, but the invariant was enforced once. Revoked, and default privileges for new tables and functions now revoke all from `anon` and `authenticated`, so every migration must grant explicitly. |
| Unit tests. | `npm test` runs `node --test` on `src/**/*.test.ts` (Node 22 strips types natively; no runner dependency). `tsconfig.test.json` type-checks them with `@types/node`. |

## Decision 2026-09-20 — the place agent

| Question | Decision |
|---|---|
| Where does an LLM agent run? | In the Pages Function (`/api/agents/*`), next to the other server-side secrets. `agents/place/agent.ts` holds the prompt and the loop; `src/agents/place/schema.ts` is the contract shared with the browser. The browser never holds the Anthropic key. |
| Model and tools. | `claude-opus-5`, adaptive thinking at medium effort, server-side `web_search` + `web_fetch` (six uses each), one request re-sent on `pause_turn`. Structured output constrained to the draft schema, so the caller always gets a valid object or an error — never free text to parse. |
| What the agent returns. | A **draft**, never a saved row. `draft.place` and `draft.spaces` are shaped for `save_place_with_spaces()`; unknown facts are `null`; `sources`, `confidence`, `notes` and `matched` let the operator judge. Writing stays with the operator (the UI) or the calling agent. |
| How another agent calls it. | `x-api-key: <AGENT_API_KEY>` on the same endpoint; `GET /api/agents/place/schema` serves the result schema for tool registration. A per-agent identity was not needed yet; the shared secret is a Pages secret. See `docs/AGENTS.md`. |
| zod v4 next to zod v3. | The SDK's `zodOutputFormat()` needs zod v4 schemas; the app's forms use v3. The agent contract imports `zod/v4` (shipped inside zod 3.25); the rest of the app is untouched. |

## Decision 2026-09-20 — research agents for artists, people and events

| Question | Decision |
|---|---|
| Four agents or one? | One research loop (`agents/research.ts`) with a prompt and a draft schema per kind. The answer shape is shared: `outcome` of `draft` / `ambiguous` / `not_found`, plus `candidates`, `sources`, `confidence`, `notes`. The place agent moved onto it; its only extra is the geocoding step. |
| Keywords that fit two or more things ("Eagle", a brand that exists in several cities). | The agent must not pick. It returns `ambiguous` with 2–6 candidates, each with one line that tells them apart and the URLs that identify it. The UI shows a chooser; the operator's pick is sent back as `candidate` and the second call returns the draft for exactly that one. Two calls at most. |
| Members the artist agent names. | Matched to existing people by normalised public name — one exact match links the person, otherwise a `new_person` created with the artist in one transaction. Two existing people with the same normalised name link neither; the operator decides in the picker. |
| Venues the event agent names. | Matched to stored places by normalised name and the place's time zone is used; an unmatched venue stays in the occurrence name (`at <venue>, <city>`) so nothing is lost and the operator picks or creates the place. Times not announced default to 23:00–06:00 and the note says so. |
| The person agent and memberships. | It lists the acts the person performs under, but memberships are only editable on the artist record; the list is kept in the person's note rather than half-modelled. |
| Legal names. | Both prompts carry the CLAUDE.md rule verbatim: only publicly known names, never a legal or birth name the artist has not published. |

## Decision 2026-09-20 — tags on place

| Question | Decision |
|---|---|
| How to model an operator vocabulary like IBIZA, BIG5, Tomorrowland with several values per venue? | `place.tags text[]` with a GIN index (`20260920120000_place_tags.sql`). Not a tag table: the vocabulary is small, invented by operators as they go, and only ever filtered on. The list of existing tags with counts is derived by `place_tag_counts()` for autocomplete and the list filter, never maintained by hand. |
| Case: `Ibiza` vs `IBIZA`? | Stored as typed, but a place cannot carry two tags that differ only in case (`is_valid_tags` CHECK), and the form compares case-insensitively when adding. Renaming a tag across all places is an `update … set tags = array_replace(...)` for now. |
| Does the agent suggest tags? | No. Tags are operator meaning (BIG5 is a judgement, Tomorrowland is a relationship to an event), not a web fact; the draft leaves them empty. |

## Decision 2026-09-20 — stage 2 opens: line-ups and performance sets

| Question | Decision |
|---|---|
| The stage boundary in CLAUDE.md forbade the schedule screens. | Lifted by the owner: the master data it waited for exists and has been entered through the admin. Recorded in CLAUDE.md; the remaining stage-2 items (ingestion, predictions by agent, notifications, public pages) stay out of scope. |
| One object or two? | Two, kept apart on purpose. **`lineup`** = WHO is announced for an occurrence and a place: official only, one row per publication (`version`), artists in `lineup_artist` with billing order, headliner flag and the placeholder pair. **`performance_set`** = WHEN and WHERE each set plays: `scenario_type` official or predicted, `completeness` full or partial (`set_type = group` for a split by day/room only), version, `place_space_id`, `supersedes` chain. |
| `program_release` from v1.4. | Dropped (`20260920150000_lineup_and_sets.sql`); it held no data. `lineup` is the publication that advances the version. |
| Which place does a set's room belong to? | `place_id` of the set, else the **line-up's** place. Never the occurrence's primary place: null means "not announced", and there is no default (CLAUDE.md). The v1 trigger used the occurrence default and was restated. |
| Official sets and line-ups. | An official set must reference a line-up (`ck_performance_set_official_has_lineup`) and inherits its version by default. A prediction may reference the line-up it was derived from, or stand alone, and must carry a confidence. |
| "Never UPDATE a performance_set" — how is it enforced and how does the form behave? | `trg_performance_set_immutable` rejects any change except `status`. `save_performance_set()` with a `performance_set_id` supersedes: the old row leaves `active` first (the partial unique indexes only see active rows), the replacement is inserted pointing at it. The form says "Save as new row" and shows both ends of the chain; a superseded row is read-only. Cancelling is a status change through a separate button. |
| Correcting a line-up vs publishing a new one. | A line-up version is corrected in place (typo, missed name); a new announcement is **Publish as new version**, which clones the form content into `max(version)+1` for the same (occurrence, place) and leaves the old version untouched. |
| Placeholders. | The same `(artist_id, placeholder_type)` pair on both `lineup_artist` and `performance_set_participant`; the slot editor exposes it as Artist / TBA / Secret guest / Revealed guest / Label only, and never clears the placeholder on reveal. |

## Decision 2026-09-20 — occurrences: start and end day; a venue the row brings with it

| Question | Decision |
|---|---|
| "Business day + times, end before start = next morning" could not express a festival. | The occurrences block has a **start day** and an **end day** with a time each. `event_date` = the start day (still the business day); `ends_at` = end day + end time. Typing a start day moves the end day along unless it was set further away. |
| The event agent names a venue that is not in Places yet (Black Rock City, a beach stage). | The row carries `new_place {name, city, region, country, timezone, lifecycle_type}`. `save_event_with_occurrences()` creates the place in the same transaction — or reuses an active place with the same normalised name — sets it as the default place, and **tags it with the event name** (`20260920170000_occurrence_new_place.sql`). An existing venue used this way gets the tag too. The chip in the form says what will be created; the operator can pick an existing place instead or drop it. |
| Lifecycle of a venue created this way. | What the agent says (`place_lifecycle_type`), else `temporary` for a festival, `permanent` otherwise. |

## Decision 2026-09-20 — AI actualization of a place

| Question | Decision |
|---|---|
| How does a stored venue get refreshed from the web? | **AI actualization** on the Place record: the place agent runs with keywords built from the record (name, city, country, site, Instagram); the draft is laid over the form as a diff (`src/features/places/actualize.ts`). Nothing is written until Save; Discard restores the stored values. |
| Which of the two values wins? | The agent's, in the field, with the stored value in red underneath and a blue frame — the operator sees both and can retype. A field the agent left empty **never** overwrites what is stored. Tags, status and parent are never touched. |
| Rooms. | Matched by normalised name. New → added row (blue). Changed type/capacity/notes/primary → blue field with the old value in red. Not found by the agent → flagged in red and **deactivated on save**, with a "Keep this room" link — and only when the agent found rooms at all, because an empty answer means "did not look", not "there are none". |
| Ambiguous or not found. | No diff is applied; the operator is told to refine name, city or links first. |

## Decision 2026-09-20 — duplicate guard on every new record

| Question | Decision |
|---|---|
| Two rows for one venue appeared after two agent runs. | Every New form (place, event, artist, person) looks up active rows whose normalised name contains or is contained in the typed name (`src/lib/duplicates.ts`, debounced) and shows them under the name with a link to open each. The **same normalised name blocks Create** until the operator presses "Create anyway"; a merely similar name only warns. Applies whether the name was typed or filled by an agent. |
| Why not a unique index? | Two different venues can legitimately share a name (Club Space Miami / Space Ibiza), and people do; the operator decides, the form makes sure they saw. |

## Decision 2026-09-21 — finding a line-up

| Question | Decision |
|---|---|
| An operator knows a date and a place (or event, or artist), not the occurrence id. | `find_lineups()` (`20260921100000_find_lineups.sql`): any combination of occurrence, date (± a window), event, place, artist → the occurrences that fit, each with its active line-ups (version, place, artists, "current", "has this artist"). A place matches through the occurrence's default place, a line-up announced for it, or a set at it; an artist through line-ups and set participants — placeholders never match. Security invoker. |
| What the interface does with the answer. | The finder on the Line-ups tab lists each occurrence: **Open** an existing version, **Publish new version** from the current one (its artists prefilled, ids dropped, version = next), or **Create the first line-up** when there is none. The New line-up form, given an occurrence and place that already have versions, shows them in an amber notice with the version it will create — a second first version by accident is the mistake this prevents. |

## Decision 2026-09-21 — generating a line-up from a publication

| Question | Decision |
|---|---|
| What the "Find & AI generate" button does, case by case. | The finder resolves the occurrence(s) first; the web is read only for the night chosen. **One occurrence, no line-up** → the agent finds the announcement and fills the form; nothing published → the operator is told, and the form gets the occurrence for manual entry. **Several** → a list to pick from, then as before. **One with a line-up** → the published roster is compared with the current version by normalised name (order is not a change); different → the added/dropped names are shown and the form is prefilled as the next version; same → "nothing changed", nothing filled. **None** → the agent researches the night; the operator confirms *Create the night* before anything is written. `src/features/lineups/LineupGenerate.tsx`, helpers in `generate.ts`. |
| Names the database does not have. | Not a reason to stop, not silently created either: they become label rows flagged *create an artist record on save*. `save_lineup()` (`20260921130000_lineup_new_artist.sql`) creates each as `artist_type = 'unknown'` — reusing an active artist with the same normalised name — and opens a review task `artist_created_from_lineup`, so the artist agent can enrich it later. The operator can untick the flag and keep a plain label. |
| The publication names a venue. | Used only if it is a stored place (by normalised name) — then that place becomes the line-up's place. Otherwise the finder's place, else the occurrence's default place. The invariant stands: a line-up published without a venue is one row with null. |
| The publication's date or venue differs from the stored occurrence. | Noted in amber, never applied: changing an occurrence is an event edit with its own consequences (notifications, sets). The agent reports it (`date_or_venue_changed`, `draft.occurrence`). |
| Cancelled occurrence. | Stops the flow with a warning; a line-up for a cancelled night is a mistake. |
| "+ more TBA". | `complete = false` adds one TBA slot and says so in the notes; the next announcement is the next version. |
| Creating a night the system does not have. | Event (`save_event_with_occurrences`, one transaction with the place) when the event name is new; otherwise the occurrence is inserted under the existing event, the place created with `save_place_with_spaces` and tagged with the event name if missing. Everything reused by normalised name. |

## Decision 2026-09-21 — one night, several places

| Question | Decision |
|---|---|
| Does one occurrence happen at several places at once? | Yes, but as four different things. **A. An umbrella** (Miami Music Week, ADE, a closing weekend): a brand with no roster or ticket of its own under which independent parties happen, each at its own venue. **B. One party, one ticket, two venues at once** (Sónar by Day / by Night; a day at Ushuaïa continuing at Hï). **C. An afterparty** elsewhere. **D. One brand, one night, two cities** (Elrow in Ibiza and London) — two occurrences, never one. |
| A. | `event_occurrence.part_of_occurrence_id` (`20260921160000_occurrence_part_of.sql`): the umbrella is an ordinary event (usually `festival`) with one occurrence spanning its days, place null or the city; each party's occurrence points at it. One level only — a trigger refuses a parent that has a parent and a child that has children. `find_lineups()` by the umbrella's event or occurrence lists its parts, and every row says what it is part of. The occurrences block has a **Part of** lookup; the event agent returns `part_of` per date and the form resolves it to the stored umbrella covering that date — it must exist already, creating a second brand inside one save was rejected. |
| B and C. | Nothing new: the v1.4 model already carries them — `lineup.place_id` per venue (version per (occurrence, place)), `performance_set.place_id` + `place_role`, null = not announced. `occurrence_place` stays removed; a declared venue list before any publication was considered and deferred until a reader-side need appears. |
| A publication that spreads its acts over venues. | The line-up agent fills `place` per act (as `room` does for rooms). The generator groups the acts by venue and asks which venue to fill — a line-up is one publication for one place — then fills that group as the line-up of (occurrence, that place), and says which venues remain. Acts attributed to a venue that is not a stored place get `place_id` null with a note, never the default place. |
| D. | The finder lists both; the operator chooses (the existing "several nights" step). |

## Decision 2026-09-22 — a line of a line-up is a slot, and a slot holds several acts

| Question | Decision |
|---|---|
| "Solomun b2b Dixon" — one row or two? | **One slot with two acts.** `lineup_artist` is the announced LINE: it gained `kind` and lost `artist_id`; its acts live in `lineup_artist_participant` in printed order (`20260922100000_lineup_slots.sql`). The old shape became one-participant slots. This is the CLAUDE.md invariant one level up: b2b is a FORMAT, never an `artist_type`. |
| The vocabulary of kinds, and the rule for each. | `solo` (one act — a duo or collective that IS one act, like Keinemusik, is solo); `b2b` / `b3b` / `b4b` (exactly 2 / 3 / 4 acts sharing one set: "b2b", "back to back", "vs", "x"); `collaboration` (2+ acts, one joint performance that is not a back-to-back: "presents", "meets", a live A/V show); `featuring` ("A feat./with/invites B" — the first act is the main one); `multiple_guests` (a host act plus guests: "A + friends"); `label_only` (a line naming no identifiable act: "Resident DJs"); `unknown` (the wording allows more than one reading). One rule each, in `SLOT_KIND_INFO` — the operator reads them in the editor and the agent gets the same text in its prompt, so both classify the same way. |
| A kind that disagrees with the number of acts (b3b with two names). | Saved, with a **review task** (`lineup_slot_kind_mismatch`) — master data arrives incomplete and a hard constraint would reject good records (CLAUDE.md). The editor warns in amber. Same for `unknown`: `lineup_slot_kind_unclear`. |
| "Solomun & Dixon" — two sets, a b2b, or A feat. B? | `&` alone never decides. The agent returns `kind = unknown` with `kind_alternatives`, and what settles it, in order: the announcement elsewhere on the page (a timetable with one slot or two start times), **the venue's `place.lineup_pattern`** given to the agent as `lineup pattern: …`, then the venue's other dates. When a publication shows how a venue writes its line-ups, the agent returns `place_lineup_pattern` and the generator offers to store it on the place — that is what makes the next parse unambiguous instead of a guess. |
| TBA and Secret guest as placeholders inside a multi-act slot. | They became **artists**: `artist.is_placeholder` with `artist.placeholder_type` — **TBA** (`tbd`), **Surprise guest** and **Secret guest** (`secret_guest`), **Unknown** (`unknown`, a new `placeholder_type` value for "on the bill, nobody knows who"). So "Solomun b2b TBA" is a b2b with two acts, and a publication naming "TBC" resolves to the TBA record instead of creating an artist. |
| Then what is `lineup_artist.placeholder_type` for? | The reveal memory, unchanged and still never cleared: a slot whose act is the *placeholder artist* displays the placeholder; the same slot with a real act plus `placeholder_type = secret_guest` is a revealed guest. `save_lineup()` sets it from the placeholder act and never clears it. |
| Two slots naming the same artist in one line-up. | Allowed now (`uq_lineup_artist` dropped): a festival day legitimately has "Carl Cox" and "Carl Cox b2b Adam Beyer". Uniqueness moved down to the slot — the same act twice in one b2b is still impossible. |
| "Surprise guest" vs "Secret guest" — two placeholders for one `placeholder_type`. | Yes. The 2026-09-19 decision deferred a third enum value because the difference is only the wording; the wording now lives in *which placeholder artist* is picked, while the semantics stay `secret_guest`. |

## Decision 2026-09-22 — what a slot is, where it sits, and when a version is published

| Question | Decision |
|---|---|
| A bill says "(live)", "live PA", "A/V". | `lineup_artist.performance_format` (`performance_format` enum): `dj_set`, `live`, `live_pa`, `hybrid`, `dj_live_pa`, `av`, `acoustic`, `other`, `unknown`. **A bill that states nothing is `dj_set`** — that is what a club line-up means, and the column defaults to it; `unknown` is reserved for a source that deliberately leaves the format open. The agent follows the same rule. |
| A bill says "all night long", "closing", "sunrise". | `lineup_artist.tags` (`lineup_slot_tag[]`): `standard`, `all_night_long`, `open_to_close`, `opening`, `closing`, `sunrise`, `sunset`, `afterhours`, `peak_time`. Several are true at once (a closing set is often the sunrise set), so an array, not one value. `standard` claims "nothing special" and `save_lineup()` drops it as soon as a real claim is present; the editor does the same as you click. Only what is printed — a tag is never inferred from the billing order. |
| Why on the line-up and not on the set. | Because the poster says it before any timetable exists. The set keeps its own facts (`set_type`, times); this is what was announced. |
| When is `published_at` filled? | **At publication.** `save_lineup()` stamps `now()` on a new version when the caller sends none, and never clears one on a correction. The form leaves the field empty by default and says so; it is filled by hand (or by the agent) only when the announcement itself is dated earlier. |
| The line-up form showed only the occurrence's name. | It now shows the night in full — start date, start time, end date, end time in the venue's zone, with the event, the default place and the status — read-only, with a link to the event, which is where a night is changed. The start date is the business day the line-up belongs to. |
| Getting from an event's date to what is announced for it. | Each saved occurrence row on the event has a link to `/lineups?occurrence=<id>`; the finder opens on that night alone (an umbrella lists its parts), with its versions and "create the first line-up". One click from the calendar to the publication. |

## Decision 2026-09-23 — a line can name its room and its day

| Question | Decision |
|---|---|
| Hï prints its bill as "Theatre: … / Club Room: …" and nothing stored it. | `lineup_artist.place_space_id`: the room the bill puts the line in. A trigger (`trg_lineup_artist_space_guard`) keeps it inside the line-up's place, and a room without a place on the line-up is refused — a room with no venue says nothing. NULL stays NULL: there is no default to the main room, the same rule as `performance_set.place_space_id`. The generator matches the printed room to the place's rooms with the fuzzy matcher already used for place actualization ("Theatre" = "The Theatre") and reports the ones it could not place instead of inventing them. |
| Isn't the room the schedule's business? | The timetable keeps its own room and times on `performance_set`. This is what the poster said, and the poster says it long before any timetable exists — a line-up that drops it loses information the source gave. |
| A festival occurrence runs several days. | `lineup_artist.slot_date`, a day inside the occurrence's run (business day → the day it ends). NULL on a one-night occurrence: the night is the occurrence's own day. |
| A multi-day bill that names no days. | `lineup.split_by_day`. false = the publication announces the whole run, which is a **fact about the bill**, not missing data; true = it assigns lines to days. Any dated line sets it to true in `save_lineup()`, so the two cannot contradict each other. The form shows the day picker only for a run of several days with the box ticked, bounded by the run. |
| A day outside the run. | Stored, with a review task (`lineup_slot_date_outside_run`): the operator must see what the source said before deciding whether the date is wrong or the occurrence is. |

## Decision 2026-09-23 — an edition has its own site

| Question | Decision |
|---|---|
| The line-up for EDC Orlando 2026 came back empty. | Three causes, none of them the model's: the answer budget (16k, shared with adaptive thinking) could not hold a bill of a few hundred lines, so the turn ended as `max_tokens`; the keywords named the brand ("EDC (Electric Daisy Carnival)") and the venue ("Tinker Field") but never the edition ("EDC Orlando 2026") or the city, which is what the bill is published under; and nothing said the night runs three days. The line-up agent now has 48k tokens and six turns, the keywords carry `edition`, `city` and `run`, and the prompt says to return every printed line and date them on a multi-day run. |
| A festival brand has one site, its editions have their own. | `event_occurrence.website_url` (`20260923140000`). electricdaisycarnival.com knows nothing about one night; edcorlando.com is where that bill lives. The line-up agent reads the occurrence's site **first**, then the place's, then the event's — the sitemap step that finds a venue's date page works for an edition the same way. The event agent returns it per date, and the occurrences block has a Site field. |
| Why not put it on the event? | Because the event is the brand and there is one row per brand; the site that publishes a bill belongs to the date, next to the venue and the umbrella it is part of. |

## Decision 2026-09-24 — actualization with an instruction, and the knowledge it leaves behind

| Question | Decision |
|---|---|
| Which records can be actualized? | **Place, Event, Artist and Line-up** (`src/agents/ActualizePanel.tsx`, one panel for all four). The rules are the place's from 2026-09-20, unchanged: an empty answer never overwrites a stored value, a differing one goes in with the stored value shown in red, and nothing is written until Save. |
| What each one refreshes. | Place: its fields and its rooms (added / changed / no longer found). Event: its fields, and **dates it did not have are added** — dates already on the record are left alone, because their place, times and name are curated by hand and the agent sees only what is announced today. Artist: its fields, and **members it did not have are added** — a membership ends by being dated, not by vanishing from a page. Line-up: the publication is read again and laid over the version, and the operator chooses *Save corrections* (the version was recorded wrong) or *Publish as new version* (the bill changed). |
| The operator knows things the record does not. | Every actualization has an **instruction box**: "the bill is at <url>", "ignore the last line", "the label page is stale, use the agency". It travels with the request (`instruction` on `/api/agents/:kind`) and every prompt carries the rule for it. |
| What happens to that instruction afterwards. | It is knowledge, not a one-off. The record's stored `news_pattern` / `lineup_pattern` travel with the request, and the agent returns them **merged** — one text that keeps what is still true, corrects what is not, adds what is new, and never becomes a log of runs. When it folds nothing in, the client keeps the instruction itself (`src/lib/knowledge.ts`, unit-tested: never added twice). Either way it lands in the form as a diffed field, visible before saving. |
| Where does it land for a line-up, which has no patterns of its own? | On the **place** that publishes the bill, or on the **event** when the line-up names no place — offered as a separate confirmation, because it changes another record. |
| So Event and Artist need the fields. | `event.news_pattern`, `event.lineup_pattern`, `artist.news_pattern`, `artist.lineup_pattern` (`20260924100000`), saved through the same RPCs in one transaction. A place has had both since the first migration; this is the same memory for a brand and an act, and it is what makes the second reading of a record better than the first. |
