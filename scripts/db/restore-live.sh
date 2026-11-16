#!/usr/bin/env bash
# scripts/db/restore-live.sh
# Restores an encrypted or raw pg_dump into DIRECT_URL.
# SAFETY: Requires typed host confirmation to prevent accidental overwrites.

set -euo pipefail

DUMP_FILE="${1:-}"
DIRECT_URL="${DIRECT_URL:-${DATABASE_URL:-}}"

if [[ -z "${DUMP_FILE}" ]]; then
    echo "Usage: ./scripts/db/restore-live.sh <path-to-dump-file>" >&2
    exit 1
fi

if [[ -z "${DIRECT_URL}" ]]; then
    echo "Error: DIRECT_URL or DATABASE_URL must be set." >&2
    exit 1
fi

# Extract hostname safely
TARGET_HOST=$(node -e "try { console.log(new URL(process.env.DIRECT_URL).hostname) } catch { console.log('unknown') }")

echo "======================================================"
echo " CAUTION: DESTRUCTIVE DATABASE RESTORE"
echo " Target Host: ${TARGET_HOST}"
echo " Dump File:   ${DUMP_FILE}"
echo "======================================================"
echo "This operation will OVERWRITE data on '${TARGET_HOST}'."
echo -n "Type the hostname '${TARGET_HOST}' to confirm: "
read -r CONFIRMATION

if [[ "${CONFIRMATION}" != "${TARGET_HOST}" ]]; then
    echo "Error: Hostname confirmation did not match '${TARGET_HOST}'. Restore aborted." >&2
    exit 1
fi

TEMP_RESTORE_DUMP="/tmp/restore-live-$(date +%s).dump"
cleanup() {
    rm -f "${TEMP_RESTORE_DUMP}"
}
trap cleanup EXIT

# Decrypt if needed
if [[ "${DUMP_FILE}" == *.age ]]; then
    if [[ -z "${BACKUP_AGE_IDENTITY:-}" ]]; then
        echo "Error: BACKUP_AGE_IDENTITY must point to your age private key file." >&2
        exit 1
    fi
    echo "Decrypting age backup..."
    age -d -i "${BACKUP_AGE_IDENTITY}" "${DUMP_FILE}" > "${TEMP_RESTORE_DUMP}"
elif [[ "${DUMP_FILE}" == *.gpg ]]; then
    echo "Decrypting gpg backup..."
    gpg --batch --yes --decrypt "${DUMP_FILE}" > "${TEMP_RESTORE_DUMP}"
else
    cp "${DUMP_FILE}" "${TEMP_RESTORE_DUMP}"
fi

echo "Restoring database from dump..."
pg_restore --clean --if-exists --no-owner --no-privileges -d "${DIRECT_URL}" "${TEMP_RESTORE_DUMP}"

echo "======================================================"
echo " Restore Completed Successfully on ${TARGET_HOST}"
echo "======================================================"
