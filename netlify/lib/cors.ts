function parseAllowedOrigins(): string[] {
    // Canonical is MP_ALLOWED_ORIGINS (matches MP_SESSION_SECRET); ALLOWED_ORIGINS
    // is accepted as a fallback so the WS server (src/server.ts) and these Functions
    // read the SAME operator config instead of silently diverging.
    const raw = (process.env.MP_ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS)?.trim();
    if (!raw) return [];
    return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('origin');
    if (!origin) return {};

    const allowed = parseAllowedOrigins();
    if (!allowed.includes(origin)) return {};

    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
    };
}

export function isCorsAllowed(req: Request): boolean {
    const origin = req.headers.get('origin');
    if (!origin) return true;
    return parseAllowedOrigins().includes(origin);
}
