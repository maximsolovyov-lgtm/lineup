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
