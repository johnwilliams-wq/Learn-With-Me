-- Who can read and write what, once the migrations are applied (run by tools/db/check.sh).
-- Every line that starts with a label and the word WRONG means a rule let something through that it must not.
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'), ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com');

\echo '--- family A (signed in)'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.family_state (data, player_device) values ('{"xp": 463}', 'ipad') returning 'A1 own state inserted, owner=' || owner;
insert into public.family_state (data) values ('{"xp": 500}') on conflict (owner) do update set data = excluded.data returning 'A2 upsert ok, xp=' || (data->>'xp');
insert into public.commands (device, type, payload) values ('phone', 'addItem', '{"kind":"tier","raw":{"title":"Bike","points":4000}}') returning 'A3 command added, owner=' || owner;
insert into public.family_state (owner, data) values ('bbbbbbbb-0000-0000-0000-000000000002', '{}') returning 'A4 WRONG: wrote a row for family B';
insert into storage.objects (bucket_id, name) values ('photos', 'aaaaaaaa-0000-0000-0000-000000000001/rewards/p1.jpg') returning 'A5 own photo added';
insert into storage.objects (bucket_id, name) values ('photos', 'bbbbbbbb-0000-0000-0000-000000000002/rewards/p9.jpg') returning 'A6 WRONG: put a photo into the folder of family B';
insert into storage.objects (bucket_id, name) values ('photos', 'loose.jpg') returning 'A7 WRONG: put a photo outside any folder';
insert into public.commands (type, payload) values ('big', jsonb_build_object('x', repeat('y', 30000))) returning 'A8 WRONG: a huge command was accepted';
select 'A9 sees ' || count(*) || ' state row(s), ' || (select count(*) from public.commands) || ' command(s), ' || (select count(*) from storage.objects) || ' photo(s)' from public.family_state;

\echo '--- family B (signed in)'
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select 'B1 sees ' || count(*) || ' state row(s), ' || (select count(*) from public.commands) || ' command(s), ' || (select count(*) from storage.objects) || ' photo(s) of others' from public.family_state;
update public.family_state set data = '{"xp": 0}' returning 'B2 WRONG: changed a row of family A';
delete from public.commands returning 'B3 WRONG: deleted a command of family A';
update public.commands set applied_at = now() returning 'B4 WRONG: marked a command of family A as applied';
delete from storage.objects returning 'B5 WRONG: deleted a photo of family A';
insert into public.family_state (data) values ('{"xp": 7}') returning 'B6 own state inserted';
select 'B7 after its own insert sees ' || count(*) || ' state row(s)' from public.family_state;

\echo '--- a visitor who is not signed in'
reset request.jwt.claim.sub;
set role anon;
select 'V1 WRONG: a visitor can read family_state: ' || count(*) from public.family_state;
select 'V2 WRONG: a visitor can read commands: ' || count(*) from public.commands;
insert into public.commands (type) values ('x') returning 'V3 WRONG: a visitor added a command';
select 'V4 a visitor sees ' || count(*) || ' photo(s)' from storage.objects;
select public.delete_my_account();

\echo '--- signed in but with no id (should not happen): nothing matches'
set role authenticated;
select 'N1 sees ' || count(*) || ' state row(s)' from public.family_state;
select public.delete_my_account();

\echo '--- family A again: the device he plays on applies the command; then the family leaves'
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.commands set applied_at = now(), outcome = 'ok' where applied_at is null returning 'A10 command marked applied';
select pg_sleep(0.02);
update public.family_state set data = '{"xp": 600}' returning 'A11 state updated, stamped later than created: ' || (updated_at > '2000-01-01');
delete from storage.objects where name like 'aaaaaaaa-%' returning 'A12 own photo removed';
select public.delete_my_account();
\echo '--- family A is gone, but a device of theirs is still signed in for a while'
insert into storage.objects (bucket_id, name) values ('photos', 'aaaaaaaa-0000-0000-0000-000000000001/late.jpg') returning 'A13 WRONG: added a photo after the account was deleted';
insert into public.family_state (data) values ('{}') returning 'A14 WRONG: wrote a row after the account was deleted';
insert into public.commands (type) values ('late') returning 'A15 WRONG: added a command after the account was deleted';
select 'A16 a signed-in family cannot read the table of accounts itself: ' || count(*) from auth.users;
reset role;
reset request.jwt.claim.sub;
select 'END users left: ' || string_agg(email, ',') from auth.users;
select 'END rows left: state ' || (select count(*) from public.family_state) || ' (family B only), commands ' || (select count(*) from public.commands);
select 'END grants to anon on the tables: ' || coalesce(string_agg(privilege_type, ','), 'none') from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public';
select 'END rls on: ' || string_agg(relname || '=' || relrowsecurity, ', ') from pg_class where relname in ('family_state', 'commands');
