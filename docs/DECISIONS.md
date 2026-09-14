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
