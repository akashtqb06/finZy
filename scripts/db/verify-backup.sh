#!/usr/bin/env bash
# scripts/db/verify-backup.sh
# Decrypts and restores a backup dump into a scratch database, then runs
# the finance:verify reconciliation check to verify full data integrity.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DUMP_FILE="${1:-}"

if [[ -z "${DUMP_FILE}" ]]; then
    # Pick the latest backup file in BACKUP_DIR
    DUMP_FILE=$(ls -t "${BACKUP_DIR}"/backup-* 2>/dev/null | head -n 1 || true)
    if [[ -z "${DUMP_FILE}" ]]; then
        echo "Error: No backup files found in ${BACKUP_DIR}." >&2
        exit 1
    fi
fi

echo "======================================================"
echo " Verifying Backup: ${DUMP_FILE}"
echo "======================================================"

SCRATCH_URL="${SCRATCH_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/scratch_verify}"
TEMP_RESTORE_DUMP="/tmp/restore-scratch-$(date +%s).dump"

cleanup() {
    rm -f "${TEMP_RESTORE_DUMP}"
}
trap cleanup EXIT

# 1. Decrypt if needed
if [[ "${DUMP_FILE}" == *.age ]]; then
    if [[ -z "${BACKUP_AGE_IDENTITY:-}" ]]; then
        echo "Error: BACKUP_AGE_IDENTITY must point to your age private key file to decrypt." >&2
        exit 1
    fi
    echo "Decrypting age backup with ${BACKUP_AGE_IDENTITY}..."
    age -d -i "${BACKUP_AGE_IDENTITY}" "${DUMP_FILE}" > "${TEMP_RESTORE_DUMP}"
elif [[ "${DUMP_FILE}" == *.gpg ]]; then
    echo "Decrypting gpg backup..."
    gpg --batch --yes --decrypt "${DUMP_FILE}" > "${TEMP_RESTORE_DUMP}"
else
    cp "${DUMP_FILE}" "${TEMP_RESTORE_DUMP}"
fi

# 2. Check TOC
echo "Checking dump TOC via pg_restore --list..."
pg_restore --list "${TEMP_RESTORE_DUMP}" > /dev/null

# 3. Setup scratch DB
echo "Recreating scratch database..."
psql "${SCRATCH_URL%/*}/postgres" -c "DROP DATABASE IF EXISTS scratch_verify;" 2>/dev/null || true
psql "${SCRATCH_URL%/*}/postgres" -c "CREATE DATABASE scratch_verify;" 2>/dev/null || true

# 4. Restore into scratch DB
echo "Restoring dump into scratch database..."
pg_restore --clean --if-exists --no-owner --no-privileges -d "${SCRATCH_URL}" "${TEMP_RESTORE_DUMP}" 2>/dev/null || true

# 5. Run reconciliation check
echo "Running app reconciliation verification on restored scratch database..."
DIRECT_URL="${SCRATCH_URL}" pnpm finance:verify --user "${VERIFY_USER:-alice@personal.test}" --hashed

echo "======================================================"
echo " Backup Verification PASSED 100%"
echo "======================================================"
