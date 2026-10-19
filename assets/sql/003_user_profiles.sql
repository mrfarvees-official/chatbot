-- Add authenticated visitor profiles for advanced browser-tool fillables.
-- Run after the RAG schema/migration scripts. This migration is non-destructive.

begin;

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text,
  last_name     text,
  full_name     text,
  mobile_number text,
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

create or replace function public.create_profile_for_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

commit;

notify pgrst, 'reload schema';
