import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup'; // Used for Soup.Message

/**
 * Base class for all agent usage providers.
 *
 * Subclasses must override: id, displayName, iconName, fetchUsage(), isConfigured().
 * Shared helpers _readJsonFile() and _httpGet() handle file I/O and HTTP requests.
 */
export class BaseProvider {
    /**
     * @param {Gio.Settings} settings - Extension GSettings
     * @param {Soup.Session} session - Shared Soup session for HTTP requests
     */
    constructor(settings, session) {
        this._settings = settings;
        this._session = session;
    }

    /** @returns {string} Unique provider identifier (e.g. 'claude') */
    get id() {
        throw new Error('BaseProvider.id not implemented');
    }

    /** @returns {string} Human-readable name (e.g. 'Claude Code') */
    get displayName() {
        throw new Error('BaseProvider.displayName not implemented');
    }

    /** @returns {string} Icon filename in icons/ directory */
    get iconName() {
        throw new Error('BaseProvider.iconName not implemented');
    }

    /**
     * Fetch current usage data from this agent's API.
     * @param {function(Error|null, UsageWindow[]|null)} callback
     *
     * UsageWindow shape:
     *   { id: string, label: string, utilization: number (0-100), resetsAt: Date|null }
     */
    fetchUsage(callback) {
        throw new Error('BaseProvider.fetchUsage not implemented');
    }

    /** @returns {boolean} Whether credentials are available for this provider */
    isConfigured() {
        return false;
    }

    /**
     * Read and parse a JSON file asynchronously.
     * @param {string} path - Absolute file path
     * @param {function(Error|null, object|null)} callback
     */
    _readJsonFile(path, callback) {
        const file = Gio.File.new_for_path(path);
        file.load_contents_async(null, (source, result) => {
            try {
                const [ok, contents] = source.load_contents_finish(result);
                if (!ok) {
                    callback(new Error(`Failed to read ${path}`), null);
                    return;
                }
                const decoder = new TextDecoder('utf-8');
                const text = decoder.decode(contents);
                const data = JSON.parse(text);
                callback(null, data);
            } catch (e) {
                callback(e, null);
            }
        });
    }

    /**
     * Make an HTTP GET request and parse JSON response.
     * @param {string} url - Request URL
     * @param {Object<string, string>} headers - Request headers
     * @param {function(Error|null, number, object|null)} callback - (error, statusCode, parsedData)
     */
    _httpGet(url, headers, callback) {
        const message = Soup.Message.new('GET', url);
        if (!message) {
            callback(new Error(`Invalid URL: ${url}`), 0, null);
            return;
        }

        const requestHeaders = message.get_request_headers();
        for (const [key, value] of Object.entries(headers)) {
            requestHeaders.append(key, value);
        }

        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    const bytes = this._session.send_and_read_finish(result);
                    const statusCode = message.get_status();
                    if (!bytes) {
                        callback(new Error('Empty response'), statusCode, null);
                        return;
                    }
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(bytes.get_data());
                    const data = JSON.parse(text);
                    callback(null, statusCode, data);
                } catch (e) {
                    callback(e, 0, null);
                }
            },
        );
    }

    /**
     * Check if a file exists at the given path.
     * @param {string} path
     * @returns {boolean}
     */
    _fileExists(path) {
        return GLib.file_test(path, GLib.FileTest.EXISTS);
    }

    destroy() {}
}
