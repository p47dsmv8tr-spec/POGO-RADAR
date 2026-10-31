import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventTime, wallTimeToUtcMs, eventPhase, formatCountdown, formatDateTime, formatRange } from '../app/lib/time.js';

test('local-time events use Oslo winter time (UTC+1)', () => {
  const t = parseEventTime('2026-11-21T14:00:00.000');
  assert.equal(t.isLocalTime, true);
  assert.equal(new Date(t.ms).toISOString(), '2026-11-21T13:00:00.000Z');
});

test('local-time events use Oslo summer time (UTC+2)', () => {
  const t = parseEventTime('2026-07-11T14:00:00.000');
  assert.equal(new Date(t.ms).toISOString(), '2026-07-11T12:00:00.000Z');
});

test('handles the DST switch night (25 Oct 2026, 03:00 CEST -> 02:00 CET)', () => {
  assert.equal(new Date(wallTimeToUtcMs(2026, 10, 25, 1, 0)).toISOString(), '2026-10-24T23:00:00.000Z');
  assert.equal(new Date(wallTimeToUtcMs(2026, 10, 25, 4, 0)).toISOString(), '2026-10-25T03:00:00.000Z');
  assert.equal(new Date(wallTimeToUtcMs(2026, 3, 29, 4, 0)).toISOString(), '2026-03-29T02:00:00.000Z');
});

test('global (Z) events keep their exact instant', () => {
  const t = parseEventTime('2026-11-03T21:00:00.000Z');
  assert.equal(t.isLocalTime, false);
  assert.equal(new Date(t.ms).toISOString(), '2026-11-03T21:00:00.000Z');
  assert.match(formatDateTime(t.ms), /22:00/); // shown in Oslo time
});

test('missing or broken times are null, never invented', () => {
  assert.equal(parseEventTime(null), null);
  assert.equal(parseEventTime(''), null);
  assert.equal(parseEventTime('soon'), null);
  assert.equal(formatRange(null, null), 'Dates not announced');
});

test('local times can be shown in another timezone', () => {
  const t = parseEventTime('2026-11-21T14:00:00.000', 'America/New_York');
  assert.equal(new Date(t.ms).toISOString(), '2026-11-21T19:00:00.000Z');
});

test('event phase', () => {
  assert.equal(eventPhase(100, 200, 50), 'upcoming');
  assert.equal(eventPhase(100, 200, 150), 'live');
  assert.equal(eventPhase(100, 200, 200), 'ended');
  assert.equal(eventPhase(null, null, 0), 'unscheduled');
});

test('countdown formatting', () => {
  assert.equal(formatCountdown(2 * 86400e3 + 4 * 3600e3), '2d 4h');
  assert.equal(formatCountdown(3 * 3600e3 + 5 * 60e3), '3h 05m');
  assert.equal(formatCountdown(65e3), '1m 05s');
  assert.equal(formatCountdown(-1), 'now');
});
