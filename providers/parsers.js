/**
 * Pure response parsers for each provider's usage API.
 * No GJS imports — safe to require from Node-based tests.
 *
 * Output shape (UsageWindow):
 *   { id: string, label: string, utilization: number (0-100), resetsAt: Date|null }
 */

export function clampPercent(value) {
    if (value == null || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(100, value));
}

/**
 * Anthropic /api/oauth/usage response → UsageWindow[].
 * Shape:
 *   { five_hour?: { utilization: 0-100, resets_at: ISO8601 },
 *     seven_day?: {...}, seven_day_sonnet?: {...} }
 */
export function parseClaudeResponse(data) {
    const windows = [];
    const mapping = [
        ['five_hour', '5-Hour'],
        ['seven_day', '7-Day'],
        ['seven_day_sonnet', '7-Day (Sonnet)'],
    ];
    for (const [key, label] of mapping) {
        const w = data?.[key];
        if (!w) continue;
        windows.push({
            id: key,
            label,
            utilization: clampPercent(w.utilization),
            resetsAt: w.resets_at ? new Date(w.resets_at) : null,
        });
    }
    return windows;
}

/**
 * ChatGPT /backend-api/wham/usage response → UsageWindow[].
 * Shape (per API schema):
 *   rate_limit: {
 *     primary_window:   { used_percent: int, reset_at: int (unix seconds) },
 *     secondary_window: { used_percent: int, reset_at: int (unix seconds) }
 *   }
 */
export function parseCodexResponse(data) {
    const windows = [];
    const rateLimit = data?.rate_limit ?? {};
    const mapping = [
        ['primary_window', 'five_hour', '5-Hour'],
        ['secondary_window', 'weekly', 'Weekly'],
    ];
    for (const [key, id, label] of mapping) {
        const w = rateLimit[key];
        if (!w) continue;
        windows.push({
            id,
            label,
            utilization: clampPercent(w.used_percent),
            resetsAt: parseResetAt(w.reset_at),
        });
    }
    return windows;
}

/**
 * Google Code Assist :retrieveUserQuota response → UsageWindow[].
 * Shape:
 *   { buckets: [{ modelId, remainingFraction (0..1), resetTime (ISO8601) }, ...] }
 * Buckets with a 1970 epoch resetTime signal "no quota on current tier" and are skipped.
 */
export function parseGeminiResponse(data) {
    const windows = [];
    for (const bucket of data?.buckets ?? []) {
        if (!bucket?.modelId) continue;
        if (bucket.remainingFraction == null) continue;
        const resetsAt = parseGeminiResetTime(bucket.resetTime);
        if (bucket.remainingFraction === 0 && resetsAt === null) continue;
        windows.push({
            id: bucket.modelId,
            label: prettifyGeminiModel(bucket.modelId),
            utilization: clampPercent((1 - bucket.remainingFraction) * 100),
            resetsAt,
        });
    }
    return windows;
}

function parseGeminiResetTime(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    // 1970 epoch → no active reset (quota not allocated on this tier).
    if (d.getUTCFullYear() < 2000) return null;
    return d;
}

function prettifyGeminiModel(id) {
    return id.replace(/^gemini-/, '');
}

function parseResetAt(raw) {
    if (raw == null) return null;
    // Unix seconds → ms (guard against callers already passing ms).
    const ts = raw < 1e12 ? raw * 1000 : raw;
    return new Date(ts);
}
