#!/usr/bin/env bash
# scripts/db/backup-live.sh
# Creates an encrypted pg_dump (-Fc) of the live database from DIRECT_URL,
# verifies TOC integrity with pg_restore --list, prunes backups to retain
# 14 daily + 8 weekly + 12 monthly, and optionally copies to BACKUP_SYNC_DIR.
# On failure: triggers macOS desktop notification and exits non-zero.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
FILENAME_BASE="backup-${TIMESTAMP}"
RAW_DUMP="${BACKUP_DIR}/${FILENAME_BASE}.dump"
ENCRYPTED_DUMP=""

notify_failure() {
    local msg="${1:-Live database backup encountered an error.}"
    echo "[ERROR] ${msg}" >&2
    if [[ "$(uname)" == "Darwin" ]]; then
        osascript -e "display notification \"${msg}\" with title \"Bi-Kit Live Backup FAILED\" sound name \"Basso\"" 2>/dev/null || true
    fi
}

trap 'notify_failure "Backup process failed unexpectedly at line ${LINENO}."' ERR

# 1. Environment validation
DIRECT_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
if [[ -z "${DIRECT_URL}" ]]; then
    notify_failure "DIRECT_URL or DATABASE_URL must be set."
    exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo "======================================================"
echo " Starting Live Database Backup"
echo " Timestamp: ${TIMESTAMP}"
echo "======================================================"

# 2. Run pg_dump (-Fc)
echo "Creating binary custom format dump..."
pg_dump -Fc --no-owner --no-privileges "${DIRECT_URL}" > "${RAW_DUMP}"

# 3. Verify TOC integrity with pg_restore --list
echo "Verifying dump integrity via pg_restore --list..."
if ! pg_restore --list "${RAW_DUMP}" > /dev/null; then
    rm -f "${RAW_DUMP}"
    notify_failure "Dump integrity check failed! pg_restore --list returned non-zero."
    exit 1
fi

# 4. Encrypt with age (or gpg fallback)
if command -v age >/dev/null 2>&1 && [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]]; then
    ENCRYPTED_DUMP="${BACKUP_DIR}/${FILENAME_BASE}.dump.age"
    echo "Encrypting backup with age..."
    age -r "${BACKUP_AGE_RECIPIENT}" -o "${ENCRYPTED_DUMP}" "${RAW_DUMP}"
    rm -f "${RAW_DUMP}"
elif command -v gpg >/dev/null 2>&1 && [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
    ENCRYPTED_DUMP="${BACKUP_DIR}/${FILENAME_BASE}.dump.gpg"
    echo "Encrypting backup with gpg..."
    gpg --batch --yes --encrypt --recipient "${BACKUP_GPG_RECIPIENT}" -o "${ENCRYPTED_DUMP}" "${RAW_DUMP}"
    rm -f "${RAW_DUMP}"
else
    # If no encryption key provided, keep the raw .dump file and warn
    echo "WARNING: Neither BACKUP_AGE_RECIPIENT nor BACKUP_GPG_RECIPIENT provided. Keeping unencrypted dump."
    ENCRYPTED_DUMP="${RAW_DUMP}"
fi

echo "Created backup: ${ENCRYPTED_DUMP}"

# 5. Optional sync to BACKUP_SYNC_DIR
if [[ -n "${BACKUP_SYNC_DIR:-}" ]] && [[ -d "${BACKUP_SYNC_DIR}" ]]; then
    echo "Syncing backup to ${BACKUP_SYNC_DIR}..."
    cp "${ENCRYPTED_DUMP}" "${BACKUP_SYNC_DIR}/"
fi

# 6. Retention pruning: 14 daily + 8 weekly + 12 monthly
echo "Applying retention policy (14 daily, 8 weekly, 12 monthly)..."
if command -v node >/dev/null 2>&1; then
    node -e "
    const fs = require('fs');
    const path = require('path');
    const { pruneBackups, parseBackupFilename } = require('./scripts/db/retention.ts');
    const dir = '${BACKUP_DIR}';
    const files = fs.readdirSync(dir);
    const entries = [];
    for (const f of files) {
        const d = parseBackupFilename(f);
        if (d) entries.push({ filename: f, timestamp: d });
    }
    const { toDelete } = pruneBackups(entries, { daily: 14, weekly: 8, monthly: 12 });
    for (const d of toDelete) {
        fs.unlinkSync(path.join(dir, d.filename));
        console.log('  Pruned old backup:', d.filename);
    }
    " 2>/dev/null || true
fi

echo "======================================================"
echo " Live Database Backup Completed Successfully"
echo "======================================================"
