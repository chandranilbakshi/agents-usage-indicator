import {test} from 'node:test';
import assert from 'node:assert/strict';

import {getUsageClass} from '../ui/usageClass.js';

test('getUsageClass: low < 40', () => {
    assert.equal(getUsageClass(0), 'usage-low');
    assert.equal(getUsageClass(39), 'usage-low');
    assert.equal(getUsageClass(39.99), 'usage-low');
});

test('getUsageClass: medium 40-69', () => {
    assert.equal(getUsageClass(40), 'usage-medium');
    assert.equal(getUsageClass(55), 'usage-medium');
    assert.equal(getUsageClass(69.99), 'usage-medium');
});

test('getUsageClass: high 70-89', () => {
    assert.equal(getUsageClass(70), 'usage-high');
    assert.equal(getUsageClass(89.99), 'usage-high');
});

test('getUsageClass: critical >= 90', () => {
    assert.equal(getUsageClass(90), 'usage-critical');
    assert.equal(getUsageClass(100), 'usage-critical');
});
