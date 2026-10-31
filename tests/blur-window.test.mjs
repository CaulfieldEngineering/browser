import test from 'node:test';
import assert from 'node:assert/strict';
import { addWindow, instant } from '../scripts/blur-window.mjs';

const now = new Date('2026-10-31T00:00:00-04:00');
test('tonight ends at exactly 07:00 New York, with no implicit timezone', () => {
  assert.deepEqual(addWindow({ windows: [] }, now.toISOString(), '2026-10-31T07:00:00-04:00', now), {
    windows: [{ from: '2026-10-31T04:00:00.000Z', until: '2026-10-31T11:00:00.000Z' }]
  });
  assert.throws(() => instant('2026-10-31T07:00:00'));
});
test('a requested shorter window cannot truncate an existing active window', () => {
  const result = addWindow({ windows: [{ from: '2026-10-30T23:00:00-04:00', until: '2026-10-31T07:00:00-04:00' }] }, now.toISOString(), '2026-10-31T02:00:00-04:00', now);
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].until, '2026-10-31T11:00:00.000Z');
});
test('future windows survive and expired windows are pruned', () => {
  const result = addWindow({ windows: [
    { from: '2026-10-20T01:00:00Z', until: '2026-10-20T02:00:00Z' },
    { from: '2026-11-02T01:00:00Z', until: '2026-11-02T02:00:00Z' }
  ] }, now.toISOString(), '2026-10-31T07:00:00-04:00', now);
  assert.equal(result.windows.length, 2);
  assert.equal(result.windows[1].from, '2026-11-02T01:00:00.000Z');
});
test('bad existing schedules, reversed and expired intervals fail without a write', () => {
  for (const doc of [{}, { windows: [{ from: 'garbage', until: 'garbage' }] }]) {
    assert.throws(() => addWindow(doc, now.toISOString(), '2026-10-31T07:00:00-04:00', now));
  }
  assert.throws(() => addWindow({ windows: [] }, now.toISOString(), '2026-10-30T07:00:00-04:00', now));
});
test('DST offsets are compared as instants', () => {
  assert.equal(instant('2026-11-01T01:30:00-05:00') - instant('2026-11-01T01:30:00-04:00'), 3600000);
});
