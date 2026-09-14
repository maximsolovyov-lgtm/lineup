#!/usr/bin/env bash
# Applies the auth stub, all migrations, the seed and the RLS test suite to a
# plain PostgreSQL database. For environments where the Supabase local stack
# (Docker) is unavailable. Usage:
#   DATABASE_URL=postgres://postgres@localhost:5432/lineapp scripts/verify-schema.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to a throwaway local database}"

run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$1"; }

echo "→ reset (drops public/auth/extensions/test schemas in $DATABASE_URL)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "drop schema if exists public, auth, extensions, test cascade; create schema public;"

echo "→ auth stub (local only)"; run supabase/test/auth_stub.sql
for f in supabase/migrations/*.sql; do echo "→ $(basename "$f")"; run "$f"; done
echo "→ seed";                   run supabase/seed.sql
echo "→ tests";                  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/test/rls_test.sql
