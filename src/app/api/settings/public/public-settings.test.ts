import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('Public Settings API Route (/api/settings/public)', () => {
    it('returns 200 with appName', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data).toBeDefined();
        expect(typeof json.data.appName).toBe('string');
        expect(json.data.appName.length).toBeGreaterThan(0);
    });
});
