export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };
export type Validator<T> = (value: unknown, path?: string) => ValidationResult<T>;

export function ok<T>(value: T): ValidationResult<T> { return { ok: true, value }; }
export function fail<T = never>(error: string): ValidationResult<T> { return { ok: false, error }; }

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(obj: Record<string, unknown>, key: string, path = key): ValidationResult<string> {
    const value = obj[key];
    return typeof value === 'string' && value.length > 0 ? ok(value) : fail(`${path} must be a non-empty string`);
}

export function readOptionalString(obj: Record<string, unknown>, key: string): ValidationResult<string | undefined> {
    const value = obj[key];
    return value === undefined || typeof value === 'string' ? ok(value) : fail(`${key} must be a string`);
}

export function readNumber(obj: Record<string, unknown>, key: string, path = key): ValidationResult<number> {
    const value = obj[key];
    return typeof value === 'number' && Number.isFinite(value) ? ok(value) : fail(`${path} must be a finite number`);
}

export function readBoolean(obj: Record<string, unknown>, key: string, path = key): ValidationResult<boolean> {
    const value = obj[key];
    return typeof value === 'boolean' ? ok(value) : fail(`${path} must be a boolean`);
}

export function readEnum<T extends readonly string[]>(obj: Record<string, unknown>, key: string, values: T, path = key): ValidationResult<T[number]> {
    const value = obj[key];
    return typeof value === 'string' && values.includes(value) ? ok(value as T[number]) : fail(`${path} must be one of ${values.join(', ')}`);
}

export function readArray<T>(obj: Record<string, unknown>, key: string, item: Validator<T>, path = key): ValidationResult<T[]> {
    const value = obj[key];
    if (!Array.isArray(value)) return fail(`${path} must be an array`);
    const out: T[] = [];
    for (let i = 0; i < value.length; i++) {
        const parsed = item(value[i], `${path}[${i}]`);
        if (!parsed.ok) return parsed;
        out.push(parsed.value);
    }
    return ok(out);
}

export function readRecordOfStrings(obj: Record<string, unknown>, key: string, path = key): ValidationResult<Record<string, string>> {
    const value = obj[key];
    if (!isRecord(value)) return fail(`${path} must be an object`);
    const out: Record<string, string> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
        if (typeof entryValue !== 'string' || entryValue.length === 0) return fail(`${path}.${entryKey} must be a non-empty string`);
        out[entryKey] = entryValue;
    }
    return ok(out);
}

export function assertValid<T>(result: ValidationResult<T>): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
}
