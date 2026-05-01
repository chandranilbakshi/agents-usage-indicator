import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Soup from 'gi://Soup';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {AgentSection} from './ui/agentSection.js';
import {getUsageClass} from './ui/usageClass.js';
import {pickPanelUtilization} from './ui/panelUtils.js';
import {ClaudeProvider} from './providers/claude.js';
import {CodexProvider} from './providers/codex.js';
import {GeminiProvider} from './providers/gemini.js';
import {clampPercent} from './providers/parsers.js';

const PROVIDER_REGISTRY = {
    'claude': ClaudeProvider,
    'codex': CodexProvider,
    'gemini': GeminiProvider,
};

const PANEL_BAR_MAX_PX = 50;

export const AgentsUsageIndicator = GObject.registerClass(
class AgentsUsageIndicator extends PanelMenu.Button {
    _init(extensionPath, settings, openPrefsCallback) {
        super._init(0.5, 'Agents Usage Indicator', false);

        this._extensionPath = extensionPath;
        this._settings = settings;
        this._openPrefsCallback = openPrefsCallback;
        this._timerId = null;
        this._inFlight = false;
        this._destroyed = false;

        this._session = new Soup.Session({timeout: 30});

        // Array of { provider, section, windows }
        this._providers = [];
        this._lastUpdated = null;

        this._buildPanel();
        this._buildMenu();
        this._initProviders();

        this._settingsChangedId = this._settings.connect('changed', (_s, key) => {
            this._onSettingChanged(key);
        });

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
        this._genericBox = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER});
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

        this._updatePanel();
    }

    _buildMenu() {
        this._sectionsBox = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._sectionsBox);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

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
        refreshButton.connect('clicked', () => this._refreshAll());
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
        // Destroy existing providers — their cancellables fire, so in-flight
        // fetch callbacks never reach the _refreshAll handler below.
        for (const entry of this._providers)
            entry.provider.destroy();
        this._providers = [];
        this._sectionsBox.removeAll();

        const enabledIds = this._settings.get_strv('enabled-providers');

        // Remove panel items for providers that are no longer enabled.
        for (const [id, items] of this._panelItems.entries()) {
            if (!enabledIds.includes(id)) {
                items.box.destroy();
                this._panelItems.delete(id);
            }
        }

        for (const id of enabledIds) {
            const ProviderClass = PROVIDER_REGISTRY[id];
            if (!ProviderClass)
                continue;

            const provider = new ProviderClass(this._settings, this._session);
            const iconPath = `${this._extensionPath}/icons/${provider.iconName}`;
            const section = new AgentSection(provider.displayName, iconPath);

            if (this._providers.length > 0)
                this._sectionsBox.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._sectionsBox.addMenuItem(section);

            this._providers.push({provider, section, windows: null});
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
        if (this._destroyed) return;
        if (this._inFlight) return;

        if (this._providers.length === 0) {
            this._updatePanel();
            return;
        }

        this._inFlight = true;
        let pending = this._providers.length;
        const done = () => {
            pending--;
            if (pending === 0) {
                this._inFlight = false;
                if (!this._destroyed) this._onAllRefreshComplete();
            }
        };

        for (const entry of this._providers) {
            if (!entry.provider.isConfigured()) {
                entry.windows = null;
                entry.section.update(null, null);
                done();
                continue;
            }

            entry.provider.fetchUsage((error, windows) => {
                if (this._destroyed) {
                    done();
                    return;
                }
                entry.windows = windows;
                entry.section.update(windows, error);
                done();
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

    _ensurePanelItem(entry) {
        let items = this._panelItems.get(entry.provider.id);
        if (items) return items;

        const box = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER});
        const icon = new St.Icon({
            gicon: Gio.FileIcon.new(
                Gio.File.new_for_path(`${this._extensionPath}/icons/${entry.provider.iconName}`)
            ),
            style_class: 'system-status-icon agent-icon',
        });
        box.add_child(icon);

        const label = new St.Label({
            text: '—',
            style_class: 'agent-usage-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(label);

        const progressBg = new St.Widget({
            style_class: 'agent-panel-progress-bg',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const progressBar = new St.Widget({
            style_class: 'agent-panel-progress-bar',
        });
        progressBg.add_child(progressBar);
        box.add_child(progressBg);

        this._panelBox.add_child(box);

        items = {box, icon, progressBg, progressBar, label};
        this._panelItems.set(entry.provider.id, items);
        return items;
    }

    _renderPanelItem(items, entry, mode, showIcon, isFirst) {
        items.box.visible = true;
        if (isFirst)
            items.box.remove_style_class_name('agent-panel-item-spaced');
        else
            items.box.add_style_class_name('agent-panel-item-spaced');

        items.icon.visible = showIcon;
        items.progressBg.visible = (mode === 'bar' || mode === 'both');
        items.label.visible = (mode === 'text' || mode === 'both');

        const utilization = pickPanelUtilization(entry.windows);
        if (utilization == null) {
            items.label.text = '—';
            items.progressBar.width = 0;
            items.progressBar.style_class = 'agent-panel-progress-bar';
            return;
        }

        const pct = clampPercent(utilization);
        items.label.text = `${Math.round(pct)}%`;
        items.progressBar.width = Math.round(pct * PANEL_BAR_MAX_PX / 100);
        items.progressBar.style_class = `agent-panel-progress-bar ${getUsageClass(pct)}`;
    }

    _updatePanel() {
        const mode = this._settings.get_string('display-mode');
        const showIcon = this._settings.get_boolean('show-icon');
        const activeProviders = this._providers.filter(e => e.provider.isConfigured());

        if (activeProviders.length === 0) {
            this._genericBox.visible = true;
            this._panelIcon.visible = showIcon;
            this._panelLabel.visible = (mode === 'text' || mode === 'both');
            for (const item of this._panelItems.values())
                item.box.visible = false;
            return;
        }

        this._genericBox.visible = false;

        activeProviders.forEach((entry, i) => {
            const items = this._ensurePanelItem(entry);
            this._renderPanelItem(items, entry, mode, showIcon, i === 0);
        });

        // Hide boxes for providers that are configured-off (still in registry but no creds).
        const activeIds = new Set(activeProviders.map(e => e.provider.id));
        for (const [id, items] of this._panelItems.entries()) {
            if (!activeIds.has(id))
                items.box.visible = false;
        }
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
            this._updatePanel();
            break;
        case 'claude-credentials-path':
        case 'codex-credentials-path':
        case 'gemini-credentials-path':
            this._refreshAll();
            break;
        }
    }

    destroy() {
        this._destroyed = true;
        this._stopTimer();

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        for (const entry of this._providers)
            entry.provider.destroy();
        this._providers = [];

        this._session?.abort();
        this._session = null;

        super.destroy();
    }
});
