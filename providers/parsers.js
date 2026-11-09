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
    const rateLimit = data?.rate_limit ?? data?.rate_limits ?? {};
    const candidates = [
        rateLimit.five_hour,
        rateLimit.primary_window,
        rateLimit.primary,
        rateLimit.weekly,
        rateLimit.secondary_window,
        rateLimit.secondary,
    ];

    for (const window of candidates) {
        if (!window || window.used_percent == null)
            continue;

        const duration = Number(window.limit_window_seconds);
        const {id, label} = codexWindowType(duration);
        windows.push({
            id,
            label,
            utilization: clampPercent(window.used_percent),
            resetsAt: parseResetAt(window.reset_at),
        });
    }
    return windows;
}

function codexWindowType(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0)
        return {id: "codex-window", label: "Usage"};
    if (seconds >= 28 * 86400 && seconds <= 31 * 86400)
        return {id: "monthly", label: "Monthly"};
    if (seconds === 18000)
        return {id: "five_hour", label: "5-Hour"};
    if (seconds === 604800)
        return {id: "weekly", label: "Weekly"};

    const hours = seconds / 3600;
    if (Number.isInteger(hours))
        return {id: `window-${seconds}`, label: `${hours}-Hour`};
    const days = seconds / 86400;
    if (Number.isInteger(days))
        return {id: `window-${seconds}`, label: `${days}-Day`};
    return {id: `window-${seconds}`, label: `${Math.round(seconds / 60)}-Minute`};
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
