#!/bin/sh
set -eu
: "${DB_APP_PASSWORD:?DB_APP_PASSWORD is required}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$DB_APP_PASSWORD" <<'SQL'
CREATE ROLE pacaembu_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'app_password';
GRANT CONNECT ON DATABASE pacaembu TO pacaembu_app;
SQL
