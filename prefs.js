import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AgentsUsagePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(500, 600);

        // --- General Page ---
        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        const generalGroup = new Adw.PreferencesGroup({
            title: 'Refresh',
        });
        generalPage.add(generalGroup);

        // Refresh interval
        const refreshRow = new Adw.SpinRow({
            title: 'Refresh Interval',
            subtitle: 'How often to poll usage APIs (seconds)',
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 600,
                step_increment: 10,
                page_increment: 60,
                value: settings.get_int('refresh-interval'),
            }),
        });
        refreshRow.adjustment.connect('value-changed', (adj) => {
            settings.set_int('refresh-interval', adj.value);
        });
        generalGroup.add(refreshRow);

        // --- Agents Page ---
        const agentsPage = new Adw.PreferencesPage({
            title: 'Agents',
            icon_name: 'system-users-symbolic',
        });
        window.add(agentsPage);

        // Claude group
        const claudeGroup = new Adw.PreferencesGroup({
            title: 'Claude Code',
        });
        agentsPage.add(claudeGroup);

        const claudeToggle = new Adw.SwitchRow({
            title: 'Enabled',
            subtitle: 'Track Claude Code usage',
        });
        claudeToggle.active = settings.get_strv('enabled-providers').includes('claude');
        claudeToggle.connect('notify::active', () => {
            this._toggleProvider(settings, 'claude', claudeToggle.active);
        });
        claudeGroup.add(claudeToggle);

        const claudePathRow = new Adw.EntryRow({
            title: 'Credentials Path',
            text: settings.get_string('claude-credentials-path'),
        });
        claudePathRow.add_suffix(this._createHintLabel('Leave empty for default'));
        claudePathRow.connect('changed', () => {
            settings.set_string('claude-credentials-path', claudePathRow.text);
        });
        claudeGroup.add(claudePathRow);

        // Codex group
        const codexGroup = new Adw.PreferencesGroup({
            title: 'Codex',
        });
        agentsPage.add(codexGroup);

        const codexToggle = new Adw.SwitchRow({
            title: 'Enabled',
            subtitle: 'Track Codex usage',
        });
        codexToggle.active = settings.get_strv('enabled-providers').includes('codex');
        codexToggle.connect('notify::active', () => {
            this._toggleProvider(settings, 'codex', codexToggle.active);
        });
        codexGroup.add(codexToggle);

        const codexPathRow = new Adw.EntryRow({
            title: 'Auth File Path',
            text: settings.get_string('codex-credentials-path'),
        });
        codexPathRow.add_suffix(this._createHintLabel('Leave empty for default'));
        codexPathRow.connect('changed', () => {
            settings.set_string('codex-credentials-path', codexPathRow.text);
        });
        codexGroup.add(codexPathRow);

        // Gemini group
        const geminiGroup = new Adw.PreferencesGroup({
            title: 'Gemini',
        });
        agentsPage.add(geminiGroup);

        const geminiToggle = new Adw.SwitchRow({
            title: 'Enabled',
            subtitle: 'Track Gemini usage',
        });
        geminiToggle.active = settings.get_strv('enabled-providers').includes('gemini');
        geminiToggle.connect('notify::active', () => {
            this._toggleProvider(settings, 'gemini', geminiToggle.active);
        });
        geminiGroup.add(geminiToggle);

        const geminiPathRow = new Adw.EntryRow({
            title: 'Credentials Path',
            text: settings.get_string('gemini-credentials-path'),
        });
        geminiPathRow.add_suffix(this._createHintLabel('Leave empty for default'));
        geminiPathRow.connect('changed', () => {
            settings.set_string('gemini-credentials-path', geminiPathRow.text);
        });
        geminiGroup.add(geminiPathRow);

        // --- Appearance Page ---
        const appearancePage = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(appearancePage);

        const appearanceGroup = new Adw.PreferencesGroup({
            title: 'Panel Appearance',
        });
        appearancePage.add(appearanceGroup);

        // Display mode
        const modeModel = new Gtk.StringList();
        modeModel.append('Text only');
        modeModel.append('Progress bar only');
        modeModel.append('Both');
        const modeValues = ['text', 'bar', 'both'];

        const modeRow = new Adw.ComboRow({
            title: 'Display Mode',
            subtitle: 'How to show usage in the panel',
            model: modeModel,
        });
        const currentMode = settings.get_string('display-mode');
        modeRow.selected = Math.max(0, modeValues.indexOf(currentMode));
        modeRow.connect('notify::selected', () => {
            settings.set_string('display-mode', modeValues[modeRow.selected]);
        });
        appearanceGroup.add(modeRow);

        // Show icon
        const iconRow = new Adw.SwitchRow({
            title: 'Show Icon',
            subtitle: 'Show the indicator icon in the top bar',
        });
        settings.bind('show-icon', iconRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearanceGroup.add(iconRow);
    }

    _toggleProvider(settings, id, enabled) {
        const current = settings.get_strv('enabled-providers');
        const idx = current.indexOf(id);

        if (enabled && idx === -1)
            current.push(id);
        else if (!enabled && idx !== -1)
            current.splice(idx, 1);

        settings.set_strv('enabled-providers', current);
    }

    _createHintLabel(text) {
        const label = new Gtk.Label({
            label: text,
            css_classes: ['dim-label'],
            margin_end: 8,
        });
        return label;
    }
}
