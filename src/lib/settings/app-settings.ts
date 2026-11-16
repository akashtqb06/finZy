export interface GeneralSettings {
    appName: string;
    allowRegistration: boolean;
    sessionLifetimeDays: number;
    allowedConnectorTypes: string[];
}

export interface PublicSettings {
    appName: string;
}

export interface EnvironmentInfo {
    publicUrl: string;
    networkPolicy: string;
    nodeEnv: string;
    secureCookies: boolean;
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
    return {
        appName: process.env.APP_NAME || 'Finzy',
        allowRegistration: false,
        sessionLifetimeDays: 30,
        allowedConnectorTypes: [],
    };
}

export async function getPublicSettings(): Promise<PublicSettings> {
    return {
        appName: process.env.APP_NAME || 'Finzy',
    };
}

export function getEnvironmentInfo(): EnvironmentInfo {
    const publicUrl = process.env.APP_URL || 'http://localhost:3000';
    return {
        publicUrl,
        networkPolicy: 'SSRF Protection Active (RFC 1918 private & loopback addresses blocked)',
        nodeEnv: process.env.NODE_ENV || 'development',
        secureCookies: publicUrl.toLowerCase().startsWith('https://'),
    };
}

export async function updateGeneralSettings(
    updates: Partial<GeneralSettings>,
    _adminUserId?: string
): Promise<GeneralSettings> {
    return {
        appName: updates.appName || process.env.APP_NAME || 'Finzy',
        allowRegistration: updates.allowRegistration ?? false,
        sessionLifetimeDays: updates.sessionLifetimeDays ?? 30,
        allowedConnectorTypes: updates.allowedConnectorTypes ?? [],
    };
}
