-- Learn With Me: files can only be added to a family's folder while its account exists.
--
-- A sign-in keeps working for up to an hour after the family's account has been deleted on
-- another device (a token is checked for its signature, not for whether the account is still
-- there). Rows cannot be written any more then - they point to the account, which is gone -
-- but a file could still be added to the family's folder, where nobody could ever delete it
-- again. "Delete the family account" promises that nothing stays online, so the two rules that
-- let a family add or replace a file now also ask whether the account still exists.
--
-- The question is answered by a small function in a schema of its own that the API does not
-- show (it reads the table of accounts, which a signed-in family may not read itself).
-- Safe to apply more than once.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.family_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users where id = (select auth.uid()));
$$;

revoke all on function private.family_exists() from public;
grant execute on function private.family_exists() to authenticated;

drop policy if exists "a family adds its own photos" on storage.objects;
create policy "a family adds its own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.family_exists()));

drop policy if exists "a family replaces its own photos" on storage.objects;
create policy "a family replaces its own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.family_exists()));
