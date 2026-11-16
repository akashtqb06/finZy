import { describe, it, expect, vi } from 'vitest';
import { isSafeRelativePath } from '@src/proxy';

describe('proxy safe relative path checks', () => {
    it('accepts valid relative paths', () => {
        expect(isSafeRelativePath('/dashboard')).toBe(true);
        expect(isSafeRelativePath('/finance/transactions?tab=all')).toBe(true);
        expect(isSafeRelativePath('/settings/profile')).toBe(true);
        expect(isSafeRelativePath('/')).toBe(true);
    });

    it('rejects external open-redirect attempts', () => {
        expect(isSafeRelativePath('https://evil.com')).toBe(false);
        expect(isSafeRelativePath('http://evil.com')).toBe(false);
        expect(isSafeRelativePath('//evil.com')).toBe(false);
        expect(isSafeRelativePath('/\\evil.com')).toBe(false);
        expect(isSafeRelativePath('javascript:alert(1)')).toBe(false);
        expect(isSafeRelativePath('/settings\\profile')).toBe(false);
        expect(isSafeRelativePath('')).toBe(false);
        expect(isSafeRelativePath(null as unknown as string)).toBe(false);
        expect(isSafeRelativePath(undefined as unknown as string)).toBe(false);
    });
});
