export type AuthUser = {
    id: string;
    email: string;
    name?: string;
    role?: string;
    avatarUrl?: string | null;
    createdAt?: Date;
    lastLoginAt?: Date | null;
    mustChangePassword?: boolean;
    status?: string;
};

export type SafeUser = AuthUser;

export type AuthActionResult = {
    ok: boolean;
    fieldErrors?: Record<string, string>;
    formError?: string;
};
