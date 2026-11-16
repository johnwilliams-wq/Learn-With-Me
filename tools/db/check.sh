#!/usr/bin/env bash
# Try the database migrations on a throw-away local Postgres and check who can read and write what.
#
#   bash tools/db/check.sh
#
# Needs PostgreSQL installed (initdb, pg_ctl, psql; Ubuntu: /usr/lib/postgresql/<version>/bin).
# It never talks to the real database. The stand-in (tools/db/supabase-stand-in.sql) plays the part
# of what a Supabase project already has; the checks run twice: once as a project that grants new
# tables to everyone by default, once as one that grants nothing.
set -euo pipefail
cd "$(dirname "$0")/../.."
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)
[ -n "$BIN" ] && PATH="$BIN:$PATH"
command -v initdb >/dev/null && command -v psql >/dev/null || { echo "SKIP: PostgreSQL is not installed here"; exit 0; }

DIR=$(mktemp -d /tmp/lwm-db.XXXXXX)
chmod 755 "$DIR"
run() { if [ "$(id -u)" = 0 ]; then su postgres -c "PATH=$PATH $*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$DIR"
cleanup() { run "pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
run "initdb -D $DIR/data -A trust -U postgres" >/dev/null
run "pg_ctl -D $DIR/data -o '-c listen_addresses= -k $DIR' -l $DIR/log -w start" >/dev/null
SQL="psql -h $DIR -U postgres -q"

fail=0
for mode in open strict; do
  $SQL -c "create database lwm_$mode" >/dev/null
  if [ "$mode" = open ]; then
    $SQL -d lwm_$mode -v ON_ERROR_STOP=1 -f tools/db/supabase-stand-in.sql >/dev/null
  else
    grep -v "alter default privileges" tools/db/supabase-stand-in.sql | $SQL -d lwm_$mode -v ON_ERROR_STOP=1 >/dev/null
  fi
  for f in supabase/migrations/*.sql; do
    $SQL -d lwm_$mode -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "FAIL ($mode): $f does not apply"; fail=1; }
    $SQL -d lwm_$mode -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "FAIL ($mode): $f cannot be applied a second time"; fail=1; }
  done
  out=$($SQL -d lwm_$mode -f tools/db/who-can-do-what.sql 2>&1 || true)
  if echo "$out" | grep -q "WRONG"; then echo "FAIL ($mode): a rule let something through:"; echo "$out" | grep "WRONG"; fail=1; fi
  for want in "A1 own state inserted" "A2 upsert ok, xp=500" "A3 command added" "A5 own photo added" \
    "A9 sees 1 state row(s), 1 command(s), 1 photo(s)" "B1 sees 0 state row(s), 0 command(s), 0 photo(s) of others" "B7 after its own insert sees 1 state row(s)" \
    "V4 a visitor sees 0 photo(s)" "N1 sees 0 state row(s)" "A10 command marked applied" "A11 state updated, stamped later than created: true" \
    "END users left: b@example.com" "END rows left: state 1 (family B only), commands 0" "END grants to anon on the tables: none" "END rls on: family_state=true, commands=true"; do
    echo "$out" | grep -qF "$want" || { echo "FAIL ($mode): expected \"$want\""; fail=1; }
  done
  [ "$(echo "$out" | grep -c 'permission denied')" -ge 5 ] || { echo "FAIL ($mode): a visitor was not refused everywhere, or a family can read the accounts"; fail=1; }
  echo "$out" | grep -q "A16" && { echo "FAIL ($mode): a signed-in family can read the table of accounts"; fail=1; }
  [ "$fail" = 0 ] && echo "ok ($mode): migrations apply (twice); each family sees only its own rows and photos; visitors get nothing; nothing can be added once an account is deleted"
done
exit $fail
