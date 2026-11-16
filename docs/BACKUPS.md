# Database Backup Strategy & Recovery Guide

This document outlines the backup policy, retention rules, disaster recovery procedures, and Supabase platform guarantees for the live personal finance database.

---

## 1. Supabase Platform Guarantees & Dashboard Checks

Before relying on hosted cloud features, inspect the following settings in your [Supabase Project Dashboard](https://supabase.com/dashboard):

1. **Automated Daily Backups**:
   - Check **Settings > Database > Backups**.
   - Supabase Pro/Team plans include daily automated database backups retained for 7 to 30 days. Free tier projects do not include downloadable snapshot restore points.
2. **Point-In-Time Recovery (PITR)**:
   - Check **Settings > Add-ons > Point in Time Recovery**.
   - If enabled, WAL archiving allows rolling back the database to any specific second (within 7–28 days).
3. **Project Inactivity Pausing**:
   - Free tier Supabase projects are paused after 7 days of inactivity. Upgraded plans stay active indefinitely.

> [!IMPORTANT]
> **Hosted backups are supplementary; your own encrypted off-site dumps are the baseline.**
> You should never rely solely on a cloud provider's internal snapshots. Independent, self-managed backups guarantee data sovereignty and zero vendor lock-in.

---

## 2. Self-Managed Encrypted Live Backups

The primary backup system uses `scripts/db/backup-live.sh`, which dumps the PostgreSQL database into a binary custom-format snapshot (`pg_dump -Fc`), verifies table-of-contents integrity with `pg_restore --list`, encrypts the payload using `age` (or `gpg`), and enforces retention pruning.

### Encryption Keys
- **Public Recipient Key** (`BACKUP_AGE_RECIPIENT`): Safe to store in scripts, environment variables, or launchd plists.
- **Private Identity Key** (`BACKUP_AGE_IDENTITY`): Must be kept securely in your **password manager** (1Password, Bitwarden, Apple Keychain). It is never kept on the server.

### Generating an Age Keypair
```bash
# If not installed: brew install age
age-keygen -o ~/.config/bikit-age-key.txt
# Public key: age1... (use for BACKUP_AGE_RECIPIENT)
# Private key: AGE-SECRET-KEY-1... (save to password manager and protect)
```

---

## 3. Retention Policy

The retention engine (`scripts/db/retention.ts`) organizes snapshots into three historical tiers:
- **14 Daily Backups**: Keeps the most recent backup from each of the last 14 distinct days.
- **8 Weekly Backups**: Keeps one snapshot per week for the last 8 weeks.
- **12 Monthly Backups**: Keeps one snapshot per month for the last 12 months.

Backups older than these thresholds that do not represent weekly or monthly boundaries are automatically pruned.

---

## 4. Scheduling with macOS `launchd`

To run automated daily backups on macOS at 02:00 AM:

1. Copy the launchd template:
   ```bash
   cp scripts/db/com.bikit.backup.plist ~/Library/LaunchAgents/
   ```
2. Edit `~/Library/LaunchAgents/com.bikit.backup.plist` to provide your `DIRECT_URL` and `BACKUP_AGE_RECIPIENT`.
3. Load the daemon:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.bikit.backup.plist
   ```
4. Verify execution:
   ```bash
   tail -f backups/backup.log
   ```

*On failure, `backup-live.sh` sends a macOS desktop notification with the `Basso` alert chime and exits with an error code.*

---

## 5. Verification & Disaster Recovery

### Verifying a Backup Snapshot
To ensure a backup is restorable and that the database has not suffered data corruption:

```bash
# Decrypts the latest backup into a local scratch database and verifies account balances
BACKUP_AGE_IDENTITY="/path/to/age-key.txt" ./scripts/db/verify-backup.sh
```

### Restoring to the Live Database
To restore a snapshot to the live database (`DIRECT_URL`), use the interactive restore script. It requires typing the target hostname to prevent accidental overwrites:

```bash
BACKUP_AGE_IDENTITY="/path/to/age-key.txt" \
DIRECT_URL="postgres://postgres:[PASS]@[HOST]:5432/postgres" \
./scripts/db/restore-live.sh ./backups/backup-20261116-020000.dump.age
```
