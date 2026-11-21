#!/usr/bin/env bash
# Roda as migrations num Postgres vazio (com a imitação do Supabase) e executa os testes de RLS.
# Uso: PGURL=postgres://postgres@127.0.0.1:5432/postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?defina PGURL apontando para um Postgres descartável}"
DB="shape_real_test_$$"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -c "create database $DB"
URL="${PGURL%/*}/$DB"
trap 'psql "$PGURL" -q -c "drop database if exists $DB with (force)" >/dev/null 2>&1; for r in anon authenticated service_role; do psql "$PGURL" -q -c "drop role if exists $r" >/dev/null 2>&1 || true; done' EXIT
for r in anon authenticated service_role; do psql "$PGURL" -q -c "drop role if exists $r" >/dev/null 2>&1 || true; done
psql "$URL" -v ON_ERROR_STOP=1 -q -f tests/00_supabase_stubs.sql
for f in migrations/*.sql; do psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql "$URL" -v ON_ERROR_STOP=1 -q -o /dev/null -f tests/rls.test.sql
psql "$URL" -At -c "select case when ok then 'ok   ' else 'FALHA ' end || name || coalesce(' — ' || detail, '') from tests.results order by n"
FAILED=$(psql "$URL" -At -c "select count(*) from tests.results where not ok")
TOTAL=$(psql "$URL" -At -c "select count(*) from tests.results")
echo "$((TOTAL - FAILED))/$TOTAL testes de RLS passaram"
[ "$FAILED" = "0" ]
