import GLib from 'gi://GLib';

import {BaseProvider} from './base.js';
import {parseClaudeResponse} from './parsers.js';

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

            this._httpGet(API_URL, headers, (httpErr, status, data) => {
                if (httpErr) {
                    callback(new Error(`API request failed: ${httpErr.message}`), null);
                    return;
                }
                if (status !== 200) {
                    callback(new Error(`API returned HTTP ${status}`), null);
                    return;
                }

                try {
                    callback(null, parseClaudeResponse(data));
                } catch (e) {
                    callback(new Error(`Failed to parse response: ${e.message}`), null);
                }
            });
        });
    }
}
