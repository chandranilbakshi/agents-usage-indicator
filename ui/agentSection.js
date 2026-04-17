import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {getUsageClass} from './usageClass.js';
import {clampPercent} from '../providers/parsers.js';

/**
 * Format an absolute reset time as a short local time string.
 * Dates in the future get "at HH:MM"; same-day past or very recent → "now".
 */
function formatResetAt(date) {
    if (!date) return '';
    const remaining = date.getTime() - Date.now();
    if (remaining <= 0) return 'Resetting…';
    const time = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    });
    // If the reset is more than ~20 hours out, include the weekday so the label
    // isn't misleading ("Resets at 09:00" without a date).
    if (remaining > 20 * 3600 * 1000) {
        const day = date.toLocaleDateString(undefined, {weekday: 'short'});
        return `Resets ${day} at ${time}`;
    }
    return `Resets at ${time}`;
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

        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'agent-section',
            x_expand: true,
        });
        this.add_child(this._box);

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

        this._windowsBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });
        this._box.add_child(this._windowsBox);

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
        this._windowsBox.destroy_all_children();

        if (error) {
            this._setStatus('status-error', error.message);
            return;
        }

        if (!windows || windows.length === 0) {
            this._setStatus('status-unconfigured', 'Not configured');
            return;
        }

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
            style_class: 'agent-window-row',
        });

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

        const progressBg = new St.Widget({
            style_class: 'agent-progress-bg',
            x_expand: true,
        });
        const pct = clampPercent(win.utilization);
        const progressBar = new St.Widget({
            style_class: `agent-progress-bar ${getUsageClass(pct)}`,
        });
        progressBg.add_child(progressBar);

        progressBg.connect('notify::allocation', () => {
            progressBar.width = Math.round(progressBg.width * (pct / 100));
        });

        container.add_child(progressBg);

        if (win.resetsAt) {
            container.add_child(new St.Label({
                text: formatResetAt(win.resetsAt),
                style_class: 'agent-reset-label',
            }));
        }

        return container;
    }
});
