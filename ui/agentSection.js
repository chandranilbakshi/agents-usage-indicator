import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/**
 * Format a duration in milliseconds to a human-readable string.
 * e.g. "2h 15m", "3d 5h", "45m"
 */
function formatDuration(ms) {
    if (ms <= 0) return 'now';

    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return parts.join(' ');
}

/**
 * Get the CSS class for a utilization level.
 */
function getUsageClass(utilization) {
    if (utilization >= 90) return 'usage-critical';
    if (utilization >= 70) return 'usage-high';
    if (utilization >= 40) return 'usage-medium';
    return 'usage-low';
}

/**
 * A popup menu section that displays one agent's usage data.
 * Contains a header with agent name/icon and per-window usage rows.
 */
export const AgentSection = GObject.registerClass(
class AgentSection extends PopupMenu.PopupBaseMenuItem {
    _init(displayName, iconPath) {
        super._init({reactive: false, can_focus: false});

        this._displayName = displayName;
        this._iconPath = iconPath;

        // Main vertical container
        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'agent-section',
            x_expand: true,
        });
        this.add_child(this._box);

        // Header row: icon + name + status dot
        this._headerBox = new St.BoxLayout({
            style_class: 'agent-header-box',
            x_expand: true,
        });
        this._box.add_child(this._headerBox);

        if (iconPath) {
            this._icon = new St.Icon({
                gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath)),
                style_class: 'agent-header-icon',
            });
            this._headerBox.add_child(this._icon);
        }

        this._nameLabel = new St.Label({
            text: displayName,
            style_class: 'agent-name-label',
            x_expand: true,
        });
        this._headerBox.add_child(this._nameLabel);

        this._statusDot = new St.Widget({
            style_class: 'agent-status-dot status-unconfigured',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._headerBox.add_child(this._statusDot);

        // Container for usage window rows (built dynamically)
        this._windowsBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });
        this._box.add_child(this._windowsBox);

        // Status message (shown when not configured or error)
        this._statusMessage = new St.Label({
            style_class: 'agent-status-message',
            text: 'Not configured',
        });
        this._windowsBox.add_child(this._statusMessage);
    }

    /**
     * Update with fresh usage data.
     * @param {UsageWindow[]|null} windows - Null means error/unconfigured
     * @param {Error|null} error
     */
    update(windows, error) {
        // Clear previous window rows
        this._windowsBox.destroy_all_children();

        if (error) {
            this._setStatus('status-error', error.message);
            return;
        }

        if (!windows || windows.length === 0) {
            this._setStatus('status-unconfigured', 'Not configured');
            return;
        }

        // All good
        this._statusDot.style_class = 'agent-status-dot status-ok';

        for (const win of windows) {
            this._windowsBox.add_child(this._createWindowRow(win));
        }
    }

    _setStatus(dotClass, message) {
        this._statusDot.style_class = `agent-status-dot ${dotClass}`;
        const label = new St.Label({
            style_class: 'agent-status-message',
            text: message,
        });
        this._windowsBox.add_child(label);
    }

    _createWindowRow(win) {
        const container = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style: 'padding: 2px 0 6px 0;',
        });

        // Title + percentage row
        const titleRow = new St.BoxLayout({x_expand: true});
        titleRow.add_child(new St.Label({
            text: win.label,
            style_class: 'agent-window-title',
            x_expand: true,
        }));
        titleRow.add_child(new St.Label({
            text: `${Math.round(win.utilization)}%`,
            style_class: 'agent-percent-label',
        }));
        container.add_child(titleRow);

        // Progress bar
        const progressBg = new St.Widget({
            style_class: 'agent-progress-bg',
            x_expand: true,
        });
        const pct = Math.max(0, Math.min(100, win.utilization));
        const progressBar = new St.Widget({
            style_class: `agent-progress-bar ${getUsageClass(pct)}`,
        });
        progressBg.add_child(progressBar);

        progressBg.connect('notify::allocation', () => {
            progressBar.width = Math.round(progressBg.width * (pct / 100));
        });
        if (progressBg.width > 0) {
            progressBar.width = Math.round(progressBg.width * (pct / 100));
        }

        container.add_child(progressBg);

        // Reset countdown
        if (win.resetsAt) {
            const remaining = win.resetsAt.getTime() - Date.now();
            const resetText = remaining > 0
                ? `Resets in ${formatDuration(remaining)}`
                : 'Resetting...';
            container.add_child(new St.Label({
                text: resetText,
                style_class: 'agent-reset-label',
            }));
        }

        return container;
    }
});

