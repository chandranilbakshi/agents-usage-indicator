import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {AgentsUsageIndicator} from './indicator.js';

export default class AgentsUsageExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new AgentsUsageIndicator(
            this.path,
            this._settings,
            () => this.openPreferences(),
        );
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
