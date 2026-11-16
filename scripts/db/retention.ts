/**
 * scripts/db/retention.ts
 *
 * Retention pruning engine for database backups:
 * Keeps:
 * - 14 most recent daily backups (one per day for the 14 most recent days)
 * - 8 weekly backups (one per week for the 8 most recent weeks)
 * - 12 monthly backups (one per month for the 12 most recent months)
 */

export interface BackupEntry {
    filename: string;
    timestamp: Date;
}

export function parseBackupFilename(filename: string): Date | null {
    // Matches backup-YYYYMMDD-HHMMSS.dump.age or backup-YYYYMMDD-HHMMSS.dump
    const match = filename.match(/backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    if (!match) return null;
    const [_, y, m, d, hh, mm, ss] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
}

function getDayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function getWeekKey(d: Date): string {
    // Returns YYYY-Www ISO week key
    const target = new Date(d.valueOf());
    const dayNr = (d.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
        target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
    }
    const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getMonthKey(d: Date): string {
    return d.toISOString().slice(0, 7);
}

export function pruneBackups(
    entries: BackupEntry[],
    limits: { daily: number; weekly: number; monthly: number } = { daily: 14, weekly: 8, monthly: 12 }
): { toKeep: BackupEntry[]; toDelete: BackupEntry[] } {
    // Sort descending by timestamp (newest first)
    const sorted = [...entries].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const keptSet = new Set<string>();

    // 1. Daily buckets
    const dailyBuckets = new Map<string, BackupEntry>();
    for (const entry of sorted) {
        const key = getDayKey(entry.timestamp);
        if (!dailyBuckets.has(key)) {
            dailyBuckets.set(key, entry);
        }
    }
    const dailyKept = Array.from(dailyBuckets.values()).slice(0, limits.daily);
    for (const e of dailyKept) keptSet.add(e.filename);

    // 2. Weekly buckets
    const weeklyBuckets = new Map<string, BackupEntry>();
    for (const entry of sorted) {
        const key = getWeekKey(entry.timestamp);
        if (!weeklyBuckets.has(key)) {
            weeklyBuckets.set(key, entry);
        }
    }
    const weeklyKept = Array.from(weeklyBuckets.values()).slice(0, limits.weekly);
    for (const e of weeklyKept) keptSet.add(e.filename);

    // 3. Monthly buckets
    const monthlyBuckets = new Map<string, BackupEntry>();
    for (const entry of sorted) {
        const key = getMonthKey(entry.timestamp);
        if (!monthlyBuckets.has(key)) {
            monthlyBuckets.set(key, entry);
        }
    }
    const monthlyKept = Array.from(monthlyBuckets.values()).slice(0, limits.monthly);
    for (const e of monthlyKept) keptSet.add(e.filename);

    const toKeep: BackupEntry[] = [];
    const toDelete: BackupEntry[] = [];

    for (const entry of sorted) {
        if (keptSet.has(entry.filename)) {
            toKeep.push(entry);
        } else {
            toDelete.push(entry);
        }
    }

    return { toKeep, toDelete };
}
