import GLib from 'gi://GLib';

import {BaseProvider} from './base.js';
import {parseCodexResponse} from './parsers.js';

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
                    callback(null, parseCodexResponse(data));
                } catch (e) {
                    callback(new Error(`Failed to parse response: ${e.message}`), null);
                }
            });
        });
    }
}
