import GLib from 'gi://GLib';

import {BaseProvider} from './base.js';

const API_URL = 'https://api.anthropic.com/api/oauth/usage';

export class ClaudeProvider extends BaseProvider {
    get id() {
        return 'claude';
    }

    get displayName() {
        return 'Claude Code';
    }

    get iconName() {
        return 'claude-symbolic.svg';
    }

    _getCredentialsPath() {
        const custom = this._settings.get_string('claude-credentials-path');
        if (custom && custom.trim() !== '')
            return custom.trim();

        const configDir = GLib.getenv('CLAUDE_CONFIG_DIR')
            ?? GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
        return GLib.build_filenamev([configDir, '.credentials.json']);
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

            const token = creds?.claudeAiOauth?.accessToken;
            if (!token) {
                callback(new Error('No OAuth access token found in credentials'), null);
                return;
            }

            const headers = {
                'Authorization': `Bearer ${token}`,
                'anthropic-beta': 'oauth-2025-04-20',
            };

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

        if (data.five_hour) {
            windows.push({
                id: 'five_hour',
                label: '5-Hour',
                utilization: this._normalizeUtilization(data.five_hour.utilization),
                resetsAt: data.five_hour.resets_at ? new Date(data.five_hour.resets_at) : null,
            });
        }

        if (data.seven_day) {
            windows.push({
                id: 'seven_day',
                label: '7-Day',
                utilization: this._normalizeUtilization(data.seven_day.utilization),
                resetsAt: data.seven_day.resets_at ? new Date(data.seven_day.resets_at) : null,
            });
        }

        if (data.seven_day_sonnet) {
            windows.push({
                id: 'seven_day_sonnet',
                label: '7-Day (Sonnet)',
                utilization: this._normalizeUtilization(data.seven_day_sonnet.utilization),
                resetsAt: data.seven_day_sonnet.resets_at ? new Date(data.seven_day_sonnet.resets_at) : null,
            });
        }

        return windows;
    }

    /**
     * Normalize utilization to 0-100 range.
     * API may return 0-1 (fraction) or 0-100 (percentage).
     */
    _normalizeUtilization(value) {
        if (value == null) return 0;
        // If value is <= 1.0, treat as fraction and multiply by 100
        if (value <= 1.0)
            return value * 100;
        return Math.min(value, 100);
    }
}
