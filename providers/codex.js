import GLib from 'gi://GLib';

import {BaseProvider} from './base.js';

const API_URL = 'https://chatgpt.com/backend-api/wham/usage';

export class CodexProvider extends BaseProvider {
    get id() {
        return 'codex';
    }

    get displayName() {
        return 'Codex';
    }

    get iconName() {
        return 'codex-symbolic.svg';
    }

    _getCredentialsPath() {
        const custom = this._settings.get_string('codex-credentials-path');
        if (custom && custom.trim() !== '')
            return custom.trim();

        return GLib.build_filenamev([GLib.get_home_dir(), '.codex', 'auth.json']);
    }

    isConfigured() {
        return this._fileExists(this._getCredentialsPath());
    }

    fetchUsage(callback) {
        const credPath = this._getCredentialsPath();
        this._readJsonFile(credPath, (err, creds) => {
            if (err) {
                callback(new Error(`Cannot read credentials: ${err.message}`), null);
                return;
            }

            const token = creds?.tokens?.access_token;
            if (!token) {
                callback(new Error('No access token found in auth.json'), null);
                return;
            }

            const accountId = creds?.tokens?.account_id;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Origin': 'https://chatgpt.com',
                'Referer': 'https://chatgpt.com/',
            };
            if (accountId)
                headers['ChatGPT-Account-Id'] = accountId;

            this._httpGet(API_URL, headers, (err, status, data) => {
                if (err) {
                    callback(new Error(`API request failed: ${err.message}`), null);
                    return;
                }
                if (status !== 200) {
                    callback(new Error(`API returned HTTP ${status}`), null);
                    return;
                }

                try {
                    const windows = this._parseResponse(data);
                    callback(null, windows);
                } catch (e) {
                    callback(new Error(`Failed to parse response: ${e.message}`), null);
                }
            });
        });
    }

    _parseResponse(data) {
        const windows = [];
        const rateLimit = data.rate_limit ?? {};

        const primary = rateLimit.primary_window;
        if (primary) {
            windows.push({
                id: 'five_hour',
                label: '5-Hour',
                utilization: this._extractUtilization(primary),
                resetsAt: this._parseResetTime(primary),
            });
        }

        const secondary = rateLimit.secondary_window;
        if (secondary) {
            windows.push({
                id: 'weekly',
                label: 'Weekly',
                utilization: this._extractUtilization(secondary),
                resetsAt: this._parseResetTime(secondary),
            });
        }

        return windows;
    }

    /**
     * Extract utilization from Codex response.
     * Codex reports percent_left/remaining_percent, so we invert it.
     * Also handles usedPercent if present.
     */
    _extractUtilization(windowData) {
        // Actual Codex API field (snake_case)
        if (windowData.used_percent != null)
            return Math.min(windowData.used_percent, 100);

        // Fallback: camelCase variant
        if (windowData.usedPercent != null)
            return Math.min(windowData.usedPercent, 100);

        // percent_left / remaining_percent: invert to get utilization
        const left = windowData.percent_left ?? windowData.remaining_percent;
        if (left != null)
            return Math.min(100 - left, 100);

        return 0;
    }

    _parseResetTime(windowData) {
        const raw = windowData.reset_at ?? windowData.resets_at;
        if (raw != null) {
            // API returns Unix seconds; Date() expects milliseconds
            const ts = raw < 1e12 ? raw * 1000 : raw;
            return new Date(ts);
        }
        if (windowData.reset_time_ms)
            return new Date(windowData.reset_time_ms);
        return null;
    }
}
