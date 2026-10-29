#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway local Postgres cluster and runs
# the SQL tests in db-tests. Needs Postgres server binaries (initdb, pg_ctl).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [[ -z "$bin" || ! -x "$bin/initdb" ]]; then
  echo "Postgres server binaries not found. Set PG_BIN to the directory holding initdb." >&2
  exit 1
fi

work="$(mktemp -d)"
port="${PG_TEST_PORT:-54329}"
run_as=()
if [[ "$(id -u)" == "0" ]]; then
  chown -R postgres "$work"
  run_as=(runuser -u postgres --)
fi

cleanup() {
  "${run_as[@]}" "$bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

"${run_as[@]}" "$bin/initdb" -D "$work/data" -U postgres -A trust >/dev/null
"${run_as[@]}" "$bin/pg_ctl" -D "$work/data" -o "-p $port -k $work -c listen_addresses=''" -w start >/dev/null

psql_run() {
  "${run_as[@]}" psql -X -q -v ON_ERROR_STOP=1 -h "$work" -p "$port" -U postgres -d postgres "$@"
}

psql_run -f "$root/db-tests/auth_stub.sql"
for migration in "$root"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$migration")"
  psql_run -f "$migration"
done
psql_run -f "$root/db-tests/helpers.sql"
for test in "$root"/db-tests/*.test.sql; do
  echo "test: $(basename "$test")"
  psql_run -f "$test" >/dev/null
done
echo "database tests passed"
