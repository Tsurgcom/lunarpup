function parseAllowedOrigins(): string[] {
    const raw = process.env.MP_ALLOWED_ORIGINS?.trim();
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
