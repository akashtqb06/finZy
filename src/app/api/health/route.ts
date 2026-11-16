import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@src/lib/db/health';

export async function GET() {
    const health = await checkDatabaseHealth();

    if (!health.ok) {
        if (process.env.NODE_ENV !== 'production') {
            return NextResponse.json(
                {
                    status: 'error',
                    database: 'unhealthy',
                    financeBackend: process.env.FINANCE_BACKEND ?? 'db',
                    reason: health.reason,
                    error: health.exactFix,
                    fix: health.fix,
                    detail: health.detail,
                },
                { status: 503 }
            );
        }

        console.error('[Health Check Failure]', health.exactFix, health.error);
        return NextResponse.json(
            {
                status: 'error',
                database: 'unhealthy',
                financeBackend: process.env.FINANCE_BACKEND ?? 'db',
            },
            { status: 503 }
        );
    }

    return NextResponse.json(
        {
            status: 'ok',
            database: 'healthy',
            financeBackend: process.env.FINANCE_BACKEND ?? 'db',
        },
        { status: 200 }
    );
}

