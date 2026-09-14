-- LineApp / LineupIN — MVP v1 schema, part 1: extensions, enums, shared helpers.
-- Source of truth: docs/LineApp-Data-Model.dbml (v1.3, 2026-09-13).

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

-- Enums ------------------------------------------------------------------
create type public.app_role as enum ('admin', 'operator');

create type public.record_status as enum (
  'draft', 'active', 'inactive', 'closed', 'superseded', 'archived', 'deleted'
);

create type public.place_lifecycle_type as enum ('permanent', 'temporary', 'mobile', 'virtual');

create type public.event_type as enum (
  'party', 'festival', 'concert', 'afterparty', 'label_night', 'other', 'unknown'
);

create type public.set_scenario_type as enum ('official', 'predicted', 'actual', 'manual');

create type public.performance_set_type as enum (
  'group', 'single_artist_set', 'b2b', 'multi_b2b', 'featuring',
  'hosted_set', 'placeholder', 'service_block', 'unknown'
);

create type public.participant_role as enum (
  'primary', 'b2b', 'featured', 'guest', 'host', 'mc', 'support',
  'headliner', 'placeholder', 'unknown'
);

-- Helpers ----------------------------------------------------------------

-- Lowercase, accent-stripped, punctuation collapsed: "Hï Ibiza" -> "hi ibiza".
-- Used for search and for future entity resolution.
create or replace function public.normalize_name(p_name text)
returns text
language sql
stable
as $$
  select nullif(
    trim(regexp_replace(lower(extensions.unaccent(coalesce(p_name, ''))), '[^[:alnum:]]+', ' ', 'g')),
    ''
  );
$$;

create or replace function public.set_normalized_name()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := public.normalize_name(new.name);
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
