export class UnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends Error {
    constructor(message = 'Forbidden') {
        super(message);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends Error {
    constructor(message = 'Not Found') {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class BadRequestError extends Error {
    constructor(message = 'Bad Request') {
        super(message);
        this.name = 'BadRequestError';
    }
}

export class ConflictError extends Error {
    constructor(message = 'Conflict') {
        super(message);
        this.name = 'ConflictError';
    }
}

/**
 * Tiny assertOwner helper used by repositories.
 * Throws NotFoundError if ownerId does not match userId (preventing resource existence leakage).
 */
export function assertOwner(userId: string, ownerId: string | null | undefined): void {
    if (!ownerId || ownerId !== userId) {
        throw new NotFoundError();
    }
}

// Backward-compatible assertCan alias mapping to assertOwner
export function assertCan(user: { id: string }, _action: string, resource: { ownerId?: string }): void {
    assertOwner(user.id, resource.ownerId);
}

export function can(user: { id: string }, _action: string, resource: { ownerId?: string }): boolean {
    return Boolean(resource.ownerId && resource.ownerId === user.id);
}
