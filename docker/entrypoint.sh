#!/bin/sh
# Arrivo container entrypoint: own the uploads folder, settle the auth secret, migrate, then start the server.
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
STORAGE_DIR="${STORAGE_LOCAL_ROOT_DIR:-/app/storage}"
SECRET_FILE="$STORAGE_DIR/.arrivo/auth-secret"
DATA_KEY_FILE="$STORAGE_DIR/.arrivo/data-key"

is_root() {
  [ "$(id -u)" = "0" ]
}

# Runs a command as PUID:PGID when the container starts as root, or as-is when compose already set `user:`.
as_app_user() {
  if is_root; then
    su-exec "$PUID:$PGID" "$@"
  else
    "$@"
  fi
}

if is_root; then
  mkdir -p "$STORAGE_DIR"
  # Only touch entries with the wrong owner, so an already-correct folder costs one walk and no writes.
  find "$STORAGE_DIR" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown "$PUID:$PGID" {} +
fi

# An explicit NEXTAUTH_SECRET (or AUTH_SECRET) wins; otherwise generate one on first boot and keep it with the data.
if [ -z "${NEXTAUTH_SECRET:-}" ] && [ -z "${AUTH_SECRET:-}" ]; then
  if [ ! -s "$SECRET_FILE" ]; then
    as_app_user mkdir -p "$(dirname "$SECRET_FILE")"
    as_app_user sh -c 'umask 077 && head -c 32 /dev/urandom | base64 > "$1"' sh "$SECRET_FILE"
    echo "Generated an auth secret in $SECRET_FILE; keep it in your backups."
  else
    echo "Using the auth secret in $SECRET_FILE."
  fi
  NEXTAUTH_SECRET="$(cat "$SECRET_FILE")"
  export NEXTAUTH_SECRET
fi

# Same pattern for the key that encrypts passport numbers and MFA secrets. Losing it loses that data, so it
# lives with the uploads and is never regenerated once it exists.
if [ -z "${DATA_ENCRYPTION_KEY:-}" ]; then
  if [ ! -s "$DATA_KEY_FILE" ]; then
    as_app_user mkdir -p "$(dirname "$DATA_KEY_FILE")"
    as_app_user sh -c 'umask 077 && head -c 32 /dev/urandom | base64 > "$1"' sh "$DATA_KEY_FILE"
    echo "Generated a data encryption key in $DATA_KEY_FILE; keep it in your backups."
  fi
  DATA_ENCRYPTION_KEY="$(cat "$DATA_KEY_FILE")"
  export DATA_ENCRYPTION_KEY
fi

as_app_user node /app/migrate.mjs

if is_root; then
  exec su-exec "$PUID:$PGID" "$@"
fi
exec "$@"
