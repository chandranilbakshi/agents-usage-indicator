import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Soup from 'gi://Soup';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {AgentSection} from './ui/agentSection.js';
import {ClaudeProvider} from './providers/claude.js';
import {CodexProvider} from './providers/codex.js';

/** Registry mapping provider IDs to their classes. */
const PROVIDER_REGISTRY = {
    'claude': ClaudeProvider,
    'codex': CodexProvider,
};

/**
 * Get the CSS class for a utilization level (for the panel bar).
 */
function getPanelUsageClass(utilization) {
    if (utilization >= 90) return 'usage-critical';
    if (utilization >= 70) return 'usage-high';
    if (utilization >= 40) return 'usage-medium';
    return 'usage-low';
}

export const AgentsUsageIndicator = GObject.registerClass(
class AgentsUsageIndicator extends PanelMenu.Button {
    _init(extensionPath, settings, openPrefsCallback) {
        super._init(0.0, 'Agents Usage Indicator', false);

        this._extensionPath = extensionPath;
        this._settings = settings;
        this._openPrefsCallback = openPrefsCallback;
        this._timerId = null;

        // Shared HTTP session
        this._session = new Soup.Session({
            timeout: 30,
        });

        // Active providers and their UI sections
        this._providers = [];    // Array of { provider, section, windows, error }
        this._lastUpdated = null;

        // Build panel UI
        this._buildPanel();

        // Build dropdown menu
        this._buildMenu();

        // Initialize providers from settings
        this._initProviders();

        // Listen for settings changes
        this._settingsChangedId = this._settings.connect('changed', (s, key) => {
            this._onSettingChanged(key);
        });

        // Start refresh cycle
        this._startTimer();
        this._refreshAll();
    }

    _buildPanel() {
        this._panelBox = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
        });
        this.add_child(this._panelBox);
        this._panelItems = new Map();
        
        // Generic items for when no providers are configured
        this._genericBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER });
        this._panelBox.add_child(this._genericBox);
        
        this._panelIcon = new St.Icon({
            gicon: Gio.FileIcon.new(
                Gio.File.new_for_path(`${this._extensionPath}/icons/agents-symbolic.svg`)
            ),
            style_class: 'system-status-icon agent-icon',
        });
        this._genericBox.add_child(this._panelIcon);
        
        this._panelLabel = new St.Label({
            text: '—',
            style_class: 'agent-usage-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._genericBox.add_child(this._panelLabel);

        this._applyDisplayMode();
    }

    _buildMenu() {
        // Sections container — agent sections are added here dynamically
        this._sectionsBox = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._sectionsBox);

        // Separator before footer
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Footer
        const footerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        const footerBox = new St.BoxLayout({
            style_class: 'agent-footer-box',
            x_expand: true,
        });
        footerItem.add_child(footerBox);

        this._lastUpdatedLabel = new St.Label({
            text: 'Not updated yet',
            style_class: 'agent-last-updated-label',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        footerBox.add_child(this._lastUpdatedLabel);

        const refreshButton = new St.Button({
            label: '↻ Refresh',
            style_class: 'agent-refresh-button',
        });
        refreshButton.connect('clicked', () => {
            this._refreshAll();
        });
        footerBox.add_child(refreshButton);

        const settingsButton = new St.Button({
            label: '⚙ Settings',
            style_class: 'agent-refresh-button',
        });
        settingsButton.connect('clicked', () => {
            this.menu.close();
            this._openPrefsCallback?.();
        });
        footerBox.add_child(settingsButton);

        this.menu.addMenuItem(footerItem);
    }

    _initProviders() {
        // Destroy existing providers
        for (const entry of this._providers) {
            entry.provider.destroy();
        }
        this._providers = [];

        // Clear menu sections
        this._sectionsBox.removeAll();

        const enabledIds = this._settings.get_strv('enabled-providers');

        for (const id of enabledIds) {
            const ProviderClass = PROVIDER_REGISTRY[id];
            if (!ProviderClass)
                continue;

            const provider = new ProviderClass(this._settings, this._session);
            const iconPath = `${this._extensionPath}/icons/${provider.iconName}`;
            const section = new AgentSection(provider.displayName, iconPath);

            // Add separator before non-first sections
            if (this._providers.length > 0)
                this._sectionsBox.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._sectionsBox.addMenuItem(section);

            this._providers.push({
                provider,
                section,
                windows: null,
                error: null,
            });
        }
    }

    _startTimer() {
        this._stopTimer();
        const interval = this._settings.get_int('refresh-interval');
        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            interval,
            () => {
                this._refreshAll();
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
    }

    _refreshAll() {
        if (this._providers.length === 0) {
            this._updatePanel();
            return;
        }

        let pending = this._providers.length;

        for (const entry of this._providers) {
            if (!entry.provider.isConfigured()) {
                entry.windows = null;
                entry.error = null;
                entry.section.update(null, null);
                pending--;
                if (pending === 0)
                    this._onAllRefreshComplete();
                continue;
            }

            entry.provider.fetchUsage((error, windows) => {
                entry.error = error;
                entry.windows = windows;
                entry.section.update(windows, error);
                pending--;
                if (pending === 0)
                    this._onAllRefreshComplete();
            });
        }
    }

    _onAllRefreshComplete() {
        this._lastUpdated = new Date();
        const timeStr = this._lastUpdated.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        });
        this._lastUpdatedLabel.text = `Updated ${timeStr}`;
        this._updatePanel();
    }

    _updatePanel() {
        const mode = this._settings.get_string('display-mode');
        const showIcon = this._settings.get_boolean('show-icon');

        const activeProviders = this._providers.filter(e => e.provider.isConfigured());

        if (activeProviders.length === 0) {
            this._genericBox.visible = true;
            this._panelIcon.visible = showIcon;
            this._panelLabel.visible = (mode === 'text' || mode === 'both');
            
            // Hide all individual provider boxes
            for (const item of this._panelItems.values()) {
                item.box.visible = false;
            }
            return;
        }

        this._genericBox.visible = false;

        // Ensure we have UI elements for all active providers
        let i = 0;
        for (const entry of activeProviders) {
            let items = this._panelItems.get(entry.provider.id);
            if (!items) {
                const box = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER });
                
                const icon = new St.Icon({
                    gicon: Gio.FileIcon.new(
                        Gio.File.new_for_path(`${this._extensionPath}/icons/${entry.provider.iconName}`)
                    ),
                    style_class: 'system-status-icon agent-icon',
                });
                box.add_child(icon);
                
                const progressBg = new St.Widget({
                    style_class: 'agent-panel-progress-bg',
                    y_align: Clutter.ActorAlign.CENTER,
                });
                const progressBar = new St.Widget({
                    style_class: 'agent-panel-progress-bar',
                });
                progressBg.add_child(progressBar);
                box.add_child(progressBg);
                
                const label = new St.Label({
                    text: '—',
                    style_class: 'agent-usage-label',
                    y_align: Clutter.ActorAlign.CENTER,
                });
                box.add_child(label);
                
                this._panelBox.add_child(box);
                
                items = { box, icon, progressBg, progressBar, label };
                this._panelItems.set(entry.provider.id, items);
            }

            items.box.visible = true;
            if (i > 0) {
                items.box.style = 'margin-left: 8px;';
            } else {
                items.box.style = '';
            }

            items.icon.visible = showIcon;
            items.progressBg.visible = (mode === 'bar' || mode === 'both');
            items.label.visible = (mode === 'text' || mode === 'both');

            let utilization = null;
            if (entry.windows) {
                // Determine usage based on what's available
                const fiveHour = entry.windows.find(w => w.id === 'five_hour');
                const highest = entry.windows.reduce((max, w) => w.utilization > max.utilization ? w : max, entry.windows[0]);
                utilization = fiveHour ? fiveHour.utilization : (highest ? highest.utilization : null);
            }

            if (utilization !== null) {
                const pct = Math.max(0, Math.min(100, utilization));
                items.label.text = `${Math.round(pct)}%`;
                items.progressBar.width = Math.round(pct * 0.5); // 50px max
                items.progressBar.style_class = `agent-panel-progress-bar ${getPanelUsageClass(pct)}`;
            } else {
                items.label.text = '—';
                items.progressBar.width = 0;
                items.progressBar.style_class = 'agent-panel-progress-bar';
            }
            i++;
        }

        // Hide boxes for providers that are no longer active
        for (const [id, items] of this._panelItems.entries()) {
            if (!activeProviders.find(e => e.provider.id === id)) {
                items.box.visible = false;
            }
        }
    }

    _applyDisplayMode() {
        this._updatePanel();
    }

    _onSettingChanged(key) {
        switch (key) {
        case 'refresh-interval':
            this._startTimer();
            break;
        case 'enabled-providers':
            this._initProviders();
            this._refreshAll();
            break;
        case 'display-mode':
        case 'show-icon':
            this._applyDisplayMode();
            break;
        case 'claude-credentials-path':
        case 'codex-credentials-path':
            this._refreshAll();
            break;
        }
    }

    destroy() {
        this._stopTimer();

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        for (const entry of this._providers) {
            entry.provider.destroy();
        }
        this._providers = [];

        this._session?.abort();
        this._session = null;

        super.destroy();
    }
});
