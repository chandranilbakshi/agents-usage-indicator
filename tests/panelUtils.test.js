import {test} from 'node:test';
import assert from 'node:assert/strict';

import {pickPanelUtilization} from '../ui/panelUtils.js';

test('pickPanelUtilization: null/empty → null', () => {
    assert.equal(pickPanelUtilization(null), null);
    assert.equal(pickPanelUtilization(undefined), null);
    assert.equal(pickPanelUtilization([]), null);
});

test('pickPanelUtilization: prefers five_hour window', () => {
    const windows = [
        {id: 'seven_day', utilization: 95},
        {id: 'five_hour', utilization: 20},
    ];
    assert.equal(pickPanelUtilization(windows), 20);
});

test('pickPanelUtilization: no five_hour → max utilization', () => {
    const windows = [
        {id: 'weekly', utilization: 30},
        {id: 'seven_day', utilization: 60},
        {id: 'seven_day_sonnet', utilization: 15},
    ];
    assert.equal(pickPanelUtilization(windows), 60);
});

test('pickPanelUtilization: single non-five_hour window', () => {
    assert.equal(pickPanelUtilization([{id: 'weekly', utilization: 42}]), 42);
});
