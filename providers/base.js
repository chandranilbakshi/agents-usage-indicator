import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';

/**
 * Base class for all agent usage providers.
 *
 * Subclasses override: id, displayName, iconName, fetchUsage(), isConfigured().
 * _readJsonFile() and _httpGet() share a per-provider Gio.Cancellable so
 * in-flight ops are cancelled on destroy() — prevents callbacks touching a
 * destroyed indicator.
 *
 * fetchUsage callback receives (Error|null, UsageWindow[]|null).
 * UsageWindow = { id: string, label: string, utilization: 0..100, resetsAt: Date|null }
 */
export class BaseProvider {
    constructor(settings, session) {
        this._settings = settings;
        this._session = session;
        this._cancellable = new Gio.Cancellable();
    }

    get id() {
        throw new Error('BaseProvider.id not implemented');
    }

    get displayName() {
        throw new Error('BaseProvider.displayName not implemented');
    }

    get iconName() {
        throw new Error('BaseProvider.iconName not implemented');
    }

    fetchUsage(_callback) {
        throw new Error('BaseProvider.fetchUsage not implemented');
    }

    isConfigured() {
        return false;
    }

    _readJsonFile(path, callback) {
        const file = Gio.File.new_for_path(path);
        file.load_contents_async(this._cancellable, (source, result) => {
            if (this._cancellable.is_cancelled())
                return;
            try {
                const [ok, contents] = source.load_contents_finish(result);
                if (!ok) {
                    callback(new Error(`Failed to read ${path}`), null);
                    return;
                }
                const text = new TextDecoder('utf-8').decode(contents);
                callback(null, JSON.parse(text));
            } catch (e) {
                callback(e, null);
            }
        });
    }

    _httpGet(url, headers, callback) {
        const message = Soup.Message.new('GET', url);
        if (!message) {
            callback(new Error(`Invalid URL: ${url}`), 0, null);
            return;
        }

        const requestHeaders = message.get_request_headers();
        for (const [key, value] of Object.entries(headers))
            requestHeaders.append(key, value);

        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            this._cancellable,
            (_session, result) => {
                if (this._cancellable.is_cancelled())
                    return;
                const statusCode = message.get_status();
                try {
                    const bytes = this._session.send_and_read_finish(result);
                    if (!bytes) {
                        callback(new Error('Empty response'), statusCode, null);
                        return;
                    }
                    const text = new TextDecoder('utf-8').decode(bytes.get_data());
                    callback(null, statusCode, JSON.parse(text));
                } catch (e) {
                    callback(e, statusCode, null);
                }
            },
        );
    }

    _fileExists(path) {
        return GLib.file_test(path, GLib.FileTest.EXISTS);
    }

    destroy() {
        this._cancellable.cancel();
    }
}
