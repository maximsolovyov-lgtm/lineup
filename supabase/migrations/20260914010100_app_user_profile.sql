-- Part 2: application users and roles.
-- Supabase Auth owns auth.users; this table adds the application role.

create table public.app_user_profile (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      varchar(320) not null,
  full_name  varchar(256),
  role       public.app_role not null default 'operator',
  status     public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
comment on table public.app_user_profile is
  'Application profile and authorization role. Admin manages users and places; operator creates/updates business data only.';

create index idx_app_user_profile_role_status on public.app_user_profile (role, status);

create trigger trg_app_user_profile_updated_at
  before update on public.app_user_profile
  for each row execute function public.set_updated_at();

-- Role lookups -------------------------------------------------------------
-- SECURITY DEFINER so RLS policies on other tables can consult the profile
-- table without recursing into its own policies.

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
    from public.app_user_profile
   where user_id = auth.uid()
     and status = 'active';
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

create or replace function public.is_operator_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('admin', 'operator'), false);
$$;

-- Profile creation on signup -----------------------------------------------
-- The role is read from raw_app_meta_data, which only the service role can
-- set (the admin invite endpoint does). raw_user_meta_data is user-writable
-- and is deliberately NOT consulted for the role, so a self-signup could
-- never claim admin even if signups were enabled.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role := 'operator';
begin
  if (new.raw_app_meta_data ->> 'app_role') in ('admin', 'operator') then
    v_role := (new.raw_app_meta_data ->> 'app_role')::public.app_role;
  end if;

  insert into public.app_user_profile (user_id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_app_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'full_name'),
    v_role
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Keep the denormalised email current if it changes in Auth.
create or replace function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.app_user_profile
       set email = coalesce(new.email, '')
     where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_auth_user_email_change();

-- Lock-out guard: an admin cannot demote or deactivate their own account.
create or replace function public.prevent_admin_self_lockout()
returns trigger
language plpgsql
as $$
begin
  if old.user_id = auth.uid()
     and old.role = 'admin'
     and (new.role <> 'admin' or new.status <> 'active') then
    raise exception 'An admin cannot demote or deactivate their own account'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_admin_self_lockout
  before update on public.app_user_profile
  for each row execute function public.prevent_admin_self_lockout();
