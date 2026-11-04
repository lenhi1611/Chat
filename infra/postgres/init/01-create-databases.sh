#!/usr/bin/env bash
# Creates one database per name listed in POSTGRES_MULTIPLE_DATABASES
# (comma-separated). The official postgres image runs this only when the data
# volume is empty (first start). To run it again you must recreate the
# postgres volume, which deletes its data.
set -euo pipefail

if [[ -z "${POSTGRES_MULTIPLE_DATABASES:-}" ]]; then
  exit 0
fi

IFS=',' read -ra databases <<< "$POSTGRES_MULTIPLE_DATABASES"
for db in "${databases[@]}"; do
  db="$(echo "$db" | xargs)"
  [[ -z "$db" ]] && continue
  if [[ ! "$db" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "Skipping invalid database name: $db" >&2
    continue
  fi
  echo "Creating database: $db"
  echo "SELECT 'CREATE DATABASE \"$db\"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\\gexec" |
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${POSTGRES_DB:-postgres}"
done
