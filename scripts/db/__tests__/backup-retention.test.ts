import { describe, it, expect } from 'vitest';
import { parseBackupFilename, pruneBackups, type BackupEntry } from '../retention';

describe('Backup Retention Pruning', () => {
    it('correctly parses backup timestamps from filename', () => {
        const d = parseBackupFilename('backup-20261116-020000.dump.age');
        expect(d).not.toBeNull();
        expect(d?.getUTCFullYear()).toBe(2026);
        expect(d?.getUTCMonth()).toBe(10); // 0-indexed November
        expect(d?.getUTCDate()).toBe(16);
        expect(d?.getUTCHours()).toBe(2);
    });

    it('returns null for unparseable filenames', () => {
        expect(parseBackupFilename('random-file.txt')).toBeNull();
        expect(parseBackupFilename('backup-invalid.dump')).toBeNull();
    });

    it('preserves all backups when count is under retention thresholds', () => {
        const entries: BackupEntry[] = [];
        for (let i = 1; i <= 10; i++) {
            const dateStr = String(i).padStart(2, '0');
            entries.push({
                filename: `backup-202611${dateStr}-020000.dump.age`,
                timestamp: new Date(Date.UTC(2026, 10, i, 2, 0, 0)),
            });
        }

        const { toKeep, toDelete } = pruneBackups(entries);
        expect(toKeep.length).toBe(10);
        expect(toDelete.length).toBe(0);
    });

    it('retains 14 daily, 8 weekly, and 12 monthly backups over a long timeline and prunes intermediate files', () => {
        // Generate daily backups for 400 consecutive days
        const entries: BackupEntry[] = [];
        const baseDate = new Date(Date.UTC(2025, 0, 1, 2, 0, 0)); // Jan 1, 2025

        for (let day = 0; day < 400; day++) {
            const d = new Date(baseDate.getTime() + day * 86400000);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dt = String(d.getUTCDate()).padStart(2, '0');
            entries.push({
                filename: `backup-${y}${m}${dt}-020000.dump.age`,
                timestamp: d,
            });
        }

        expect(entries.length).toBe(400);

        const { toKeep, toDelete } = pruneBackups(entries, { daily: 14, weekly: 8, monthly: 12 });

        // Total kept should be: 14 daily + unique weekly + unique monthly
        expect(toKeep.length).toBeLessThanOrEqual(14 + 8 + 12);
        expect(toKeep.length).toBeGreaterThanOrEqual(14);
        expect(toDelete.length).toBe(400 - toKeep.length);

        // Verify the 14 most recent daily backups are all kept
        const latest14Filenames = entries.slice(-14).map((e) => e.filename);
        const keptFilenames = new Set(toKeep.map((e) => e.filename));
        for (const fname of latest14Filenames) {
            expect(keptFilenames.has(fname)).toBe(true);
        }

        // Verify older files kept include representatives from earlier months
        const oldestKept = toKeep[toKeep.length - 1];
        expect(oldestKept.timestamp.getUTCFullYear()).toBe(2025);
    });
});
