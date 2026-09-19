-- v1.4 delta, part 1 of 4: new enum types, and one value added to an existing one.
--
-- Source: Drive documents v1.4 (2026-09-19) — PRD, Solution Architecture,
-- Data Model, Data Model DBML. This file is kept separate because a value
-- added to an existing enum cannot be USED in the same transaction that
-- adds it; parts 2-4 use these types.

-- Cancellation is its own notification event. Previously it was
-- indistinguishable from 'inactive' and 'superseded'.
alter type public.record_status add value if not exists 'cancelled' after 'closed';

-- Two different kinds of unrevealed slot. The distinction lives on the
-- PARTICIPANT, not on set_type: a b2b can have one known and one hidden artist.
--
--   tbd          - nobody knows the name; the slot may disappear entirely,
--                  and that is normal.
--   secret_guest - the organiser knows and withholds deliberately; the slot
--                  is guaranteed, and its disappearance is an anomaly.
create type public.placeholder_type as enum ('tbd', 'secret_guest');

-- Separates "running in two places at once" from "moving later on".
-- Deriving this from whether the time windows overlap is too fragile.
create type public.place_role as enum ('main', 'afterparty', 'satellite');

create type public.membership_role as enum (
  'dj', 'producer', 'live', 'vocalist', 'mc', 'visual', 'other'
);

-- artist.artist_type is varchar + CHECK today; part 2 converts the column.
-- The vocabulary is unchanged, so the conversion cannot lose data.
create type public.artist_type as enum (
  'solo', 'duo', 'group', 'collective', 'alias', 'unknown'
);

-- performance_set.information_origin / confirmation_status are varchar(64)
-- today with no vocabulary at all; part 3 converts them.
create type public.information_origin as enum (
  'venue_announced', 'artist_announced', 'ticketing', 'press',
  'user_submitted', 'predicted', 'observed', 'manual'
);

create type public.confirmation_status as enum (
  'unconfirmed', 'confirmed', 'disputed', 'retracted'
);

-- A public announcement. What advances scenario_version.
create type public.release_kind as enum (
  'lineup', 'stage_split', 'partial_schedule', 'full_timetable',
  'cancellation', 'replacement', 'other'
);
