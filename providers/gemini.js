import GLib from 'gi://GLib';

import {BaseProvider} from './base.js';
import {parseGeminiResponse} from './parsers.js';

const API_BASE = 'https://cloudcode-pa.googleapis.com/v1internal';
const LOAD_URL = `${API_BASE}:loadCodeAssist`;
const QUOTA_URL = `${API_BASE}:retrieveUserQuota`;

const CLIENT_METADATA = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
};

export class GeminiProvider extends BaseProvider {
    constructor(settings, session) {
        super(settings, session);
        this._projectId = null;
    }

    get id() {
        return 'gemini';
    }

    get displayName() {
        return 'Gemini';
    }

    get iconName() {
        return 'gemini-symbolic.svg';
    }

    _getCredentialsPath() {
        const custom = this._settings.get_string('gemini-credentials-path');
        if (custom && custom.trim() !== '')
            return custom.trim();

        return GLib.build_filenamev([GLib.get_home_dir(), '.gemini', 'oauth_creds.json']);
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

            const token = creds?.access_token;
            if (!token) {
                callback(new Error('No access_token found in oauth_creds.json'), null);
                return;
            }

            if (creds?.expiry_date && Date.now() >= creds.expiry_date) {
                callback(new Error('Token expired, run `gemini` to refresh'), null);
                return;
            }

            const headers = {'Authorization': `Bearer ${token}`};

            const doQuota = () => {
                this._httpPost(QUOTA_URL, headers, {project: this._projectId}, (e, status, data) => {
                    if (e) {
                        callback(new Error(`Quota request failed: ${e.message}`), null);
                        return;
                    }
                    if (status === 401 || status === 403) {
                        this._projectId = null;
                        callback(new Error(`Quota returned HTTP ${status}`), null);
                        return;
                    }
                    if (status !== 200) {
                        callback(new Error(`Quota returned HTTP ${status}`), null);
                        return;
                    }
                    try {
                        callback(null, parseGeminiResponse(data));
                    } catch (parseErr) {
                        callback(new Error(`Failed to parse quota: ${parseErr.message}`), null);
                    }
                });
            };

            if (this._projectId) {
                doQuota();
                return;
            }

            this._httpPost(LOAD_URL, headers, {metadata: CLIENT_METADATA}, (e, status, data) => {
                if (e) {
                    callback(new Error(`loadCodeAssist failed: ${e.message}`), null);
                    return;
                }
                if (status !== 200) {
                    callback(new Error(`loadCodeAssist returned HTTP ${status}`), null);
                    return;
                }
                const projectId = data?.cloudaicompanionProject;
                if (!projectId) {
                    callback(new Error('No cloudaicompanionProject in loadCodeAssist response'), null);
                    return;
                }
                this._projectId = projectId;
                doQuota();
            });
        });
    }
}
