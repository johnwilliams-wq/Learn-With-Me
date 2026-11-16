-- Learn With Me: the family's private data.
--
-- One family = one signed-in account. Every row belongs to that account, and row level security
-- on every table means nobody else can read or change it. Visitors who are not signed in get
-- nothing at all. The app only ever uses the publishable key plus the family's own sign-in.
--
-- How the app uses it:
--   family_state   one row per family: what a grown-up needs to see on their own device - the reward,
--                  chore and expectation lists, his points, what he is owed, chores waiting for a check.
--                  Written by the device he plays on, which stays the source of truth.
--   commands       what a grown-up does on another device (add, change or remove something, approve
--                  a chore, mark a reward as given). The device he plays on carries them out, in
--                  order, the next time the app is open there, and marks them as applied.
--   storage bucket "photos"   reward pictures and chore photos, each family in its own folder
--                  (the folder is named after the account id).
-- His detailed play history never leaves the device.

create table if not exists public.family_state (
  owner uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  player_device text,
  updated_at timestamptz not null default now(),
  constraint family_state_small check (pg_column_size(data) < 400000 and char_length(coalesce(player_device, '')) <= 80)
);

create table if not exists public.commands (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device text not null default '',
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  outcome text,
  constraint commands_small check (pg_column_size(payload) < 20000 and char_length(type) <= 40 and char_length(device) <= 80 and char_length(coalesce(outcome, '')) <= 200)
);
create index if not exists commands_waiting on public.commands (owner, created_at) where applied_at is null;

-- Row level security: a signed-in family sees and changes its own rows, and only those.
alter table public.family_state enable row level security;
alter table public.commands enable row level security;

drop policy if exists "a family reads and writes its own state" on public.family_state;
create policy "a family reads and writes its own state" on public.family_state
  for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

drop policy if exists "a family reads and writes its own commands" on public.commands;
create policy "a family reads and writes its own commands" on public.commands
  for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

-- Access is granted table by table: signed-in users only, never visitors.
revoke all on table public.family_state, public.commands from anon;
revoke all on table public.family_state, public.commands from public;
grant select, insert, update, delete on table public.family_state, public.commands to authenticated;

-- Keep "updated_at" honest whoever writes.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists family_state_touch on public.family_state;
create trigger family_state_touch
  before update on public.family_state
  for each row execute function public.touch_updated_at();

-- Pictures: a private bucket; each family may only touch files inside its own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "a family reads its own photos" on storage.objects;
create policy "a family reads its own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "a family adds its own photos" on storage.objects;
create policy "a family adds its own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "a family replaces its own photos" on storage.objects;
create policy "a family replaces its own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "a family deletes its own photos" on storage.objects;
create policy "a family deletes its own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Leaving: a signed-in family can delete its account. Its rows go with it (on delete cascade);
-- the app removes the family's pictures through the storage API before it calls this.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
