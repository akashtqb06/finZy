import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';

export async function GET() {
    try {
        const user = await requireUserApi();
        const res = NextResponse.json(user);
        res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        return res;
    } catch (err) {
        return handleApiError(err);
    }
}
