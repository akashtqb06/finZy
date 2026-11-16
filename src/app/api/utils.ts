import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
} from '@src/lib/auth/policy';

export { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError };

export class TooManyRequestsError extends Error {
    constructor(message = 'Too many requests') {
        super(message);
        this.name = 'TooManyRequestsError';
    }
}

export class NotImplementedError extends Error {
    constructor(message = 'Not implemented') {
        super(message);
        this.name = 'NotImplementedError';
    }
}

export function apiError(message: string, status: number): NextResponse {
    const res = NextResponse.json({ error: message }, { status });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return res;
}

export function handleApiError(err: unknown): NextResponse {
    if (err instanceof NotImplementedError || (err instanceof Error && err.name === 'NotImplementedError')) {
        const methodMatch = (err as Error).message.match(/:\s*(\w+)\s+not implemented/i);
        const method = methodMatch ? methodMatch[1] : (err as Error).message;
        const res = NextResponse.json({ error: 'not_implemented', method }, { status: 501 });
        res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        return res;
    }
    if (err instanceof UnauthorizedError) {
        return apiError(err.message, 401);
    }
    if (err instanceof ForbiddenError) {
        return apiError(err.message, 403);
    }
    if (err instanceof TooManyRequestsError) {
        return apiError(err.message, 429);
    }
    if (err instanceof ZodError) {
        const message = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        return apiError(`Validation error: ${message}`, 400);
    }
    if (err instanceof BadRequestError) {
        return apiError(err.message, 400);
    }
    if (err instanceof NotFoundError) {
        return apiError('Not found', 404);
    }
    if (err instanceof ConflictError) {
        const res = NextResponse.json(
            {
                error: 'Conflict',
                message: err.message,
                currentRecord: err.currentRecord,
            },
            { status: 409 }
        );
        res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        return res;
    }

    console.error('Unhandled API error:', err);
    return apiError('Internal server error', 500);
}
