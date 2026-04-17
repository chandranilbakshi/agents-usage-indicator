import {test} from 'node:test';
import assert from 'node:assert/strict';

import {parseClaudeResponse, parseCodexResponse} from '../providers/parsers.js';

test('parseClaudeResponse: empty payload → no windows', () => {
    assert.deepEqual(parseClaudeResponse({}), []);
    assert.deepEqual(parseClaudeResponse(null), []);
    assert.deepEqual(parseClaudeResponse(undefined), []);
});

test('parseClaudeResponse: five_hour only', () => {
    const out = parseClaudeResponse({
        five_hour: {utilization: 80.0, resets_at: '2026-04-17T11:00:00Z'},
    });
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], {
        id: 'five_hour',
        label: '5-Hour',
        utilization: 80.0,
        resetsAt: new Date('2026-04-17T11:00:00Z'),
    });
});

test('parseClaudeResponse: all three windows, order preserved', () => {
    const out = parseClaudeResponse({
        five_hour: {utilization: 80.0, resets_at: '2026-04-17T11:00:00Z'},
        seven_day: {utilization: 11.0, resets_at: '2026-04-23T19:00:00Z'},
        seven_day_sonnet: {utilization: 5.5, resets_at: '2026-04-23T19:00:00Z'},
    });
    assert.deepEqual(out.map(w => w.id), ['five_hour', 'seven_day', 'seven_day_sonnet']);
    assert.deepEqual(out.map(w => w.label), ['5-Hour', '7-Day', '7-Day (Sonnet)']);
});

test('parseClaudeResponse: null window is skipped', () => {
    const out = parseClaudeResponse({
        five_hour: {utilization: 42, resets_at: '2026-04-17T11:00:00Z'},
        seven_day_oauth_apps: null, // real field seen in API response
        seven_day: null,
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'five_hour');
});

test('parseClaudeResponse: missing resets_at → resetsAt null', () => {
    const out = parseClaudeResponse({five_hour: {utilization: 50}});
    assert.equal(out[0].resetsAt, null);
});

test('parseClaudeResponse: utilization clamped to 0-100', () => {
    const out = parseClaudeResponse({
        five_hour: {utilization: 150, resets_at: null},
        seven_day: {utilization: -5, resets_at: null},
        seven_day_sonnet: {utilization: null, resets_at: null},
    });
    assert.equal(out[0].utilization, 100);
    assert.equal(out[1].utilization, 0);
    assert.equal(out[2].utilization, 0);
});

test('parseCodexResponse: empty payload → no windows', () => {
    assert.deepEqual(parseCodexResponse({}), []);
    assert.deepEqual(parseCodexResponse({rate_limit: {}}), []);
    assert.deepEqual(parseCodexResponse(null), []);
});

test('parseCodexResponse: primary + secondary windows', () => {
    const out = parseCodexResponse({
        rate_limit: {
            primary_window: {used_percent: 37, reset_at: 1744891200},
            secondary_window: {used_percent: 9, reset_at: 1745496000},
        },
    });
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], {
        id: 'five_hour',
        label: '5-Hour',
        utilization: 37,
        resetsAt: new Date(1744891200 * 1000),
    });
    assert.equal(out[1].id, 'weekly');
    assert.equal(out[1].label, 'Weekly');
});

test('parseCodexResponse: reset_at already in ms is passed through', () => {
    const ms = 1744891200000;
    const out = parseCodexResponse({
        rate_limit: {primary_window: {used_percent: 10, reset_at: ms}},
    });
    assert.equal(out[0].resetsAt.getTime(), ms);
});

test('parseCodexResponse: used_percent clamped', () => {
    const out = parseCodexResponse({
        rate_limit: {
            primary_window: {used_percent: 250, reset_at: 0},
            secondary_window: {used_percent: -10, reset_at: 0},
        },
    });
    assert.equal(out[0].utilization, 100);
    assert.equal(out[1].utilization, 0);
});

test('parseCodexResponse: missing used_percent defaults to 0', () => {
    const out = parseCodexResponse({
        rate_limit: {primary_window: {reset_at: 1744891200}},
    });
    assert.equal(out[0].utilization, 0);
});
