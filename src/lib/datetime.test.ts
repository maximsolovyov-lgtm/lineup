import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatInZone, instantToWallTime, wallTimeToInstant } from './datetime.ts';

// Run with: npm test

test('wall time in the venue zone converts to the right instant', () => {
  // Ibiza in summer is CEST (UTC+2): doors at 23:30 are 21:30 UTC.
  assert.equal(wallTimeToInstant('2026-07-15T23:30', 'Europe/Madrid'), '2026-07-15T21:30:00.000Z');
  // In winter the same wall time is an hour later in UTC.
  assert.equal(wallTimeToInstant('2026-01-15T23:30', 'Europe/Madrid'), '2026-01-15T22:30:00.000Z');
  // Miami in summer is EDT (UTC-4): a 23:00 start is 03:00 UTC the next day.
  assert.equal(wallTimeToInstant('2026-07-15T23:00', 'America/New_York'), '2026-07-16T03:00:00.000Z');
  // A Club Space sunrise set.
  assert.equal(wallTimeToInstant('2026-07-19T10:00', 'America/New_York'), '2026-07-19T14:00:00.000Z');
});

test('round trips, including across DST boundaries', () => {
  const cases: [string, string][] = [
    ['2026-07-15T23:30', 'Europe/Madrid'],
    ['2026-01-15T23:30', 'Europe/Madrid'],
    ['2026-07-16T06:00', 'Europe/Madrid'],
    ['2026-10-25T04:00', 'Europe/London'],      // clocks go back that morning
    ['2026-03-29T04:00', 'Europe/Madrid'],      // clocks go forward
    ['2026-11-01T05:00', 'America/New_York'],
  ];
  for (const [wall, zone] of cases) {
    assert.equal(instantToWallTime(wallTimeToInstant(wall, zone), zone), wall, `${zone} ${wall}`);
  }
});

test('a night crossing midnight keeps its ordering and length', () => {
  const start = wallTimeToInstant('2026-07-15T23:30', 'Europe/Madrid')!;
  const end = wallTimeToInstant('2026-07-16T06:00', 'Europe/Madrid')!;
  assert.ok(new Date(end) > new Date(start));
  assert.equal((new Date(end).getTime() - new Date(start).getTime()) / 3_600_000, 6.5);
});

test('one instant reads as different wall times in different zones', () => {
  assert.equal(instantToWallTime('2026-07-15T21:30:00.000Z', 'Europe/Madrid'), '2026-07-15T23:30');
  assert.equal(instantToWallTime('2026-07-15T21:30:00.000Z', 'America/New_York'), '2026-07-15T17:30');
});

test('display is 24-hour regardless of locale', () => {
  const out = formatInZone('2026-07-15T21:30:00.000Z', 'Europe/Madrid');
  assert.ok(out.includes('23:30'), out);
  assert.ok(!/AM|PM/i.test(out), out);
});

test('bad input degrades instead of throwing', () => {
  assert.equal(wallTimeToInstant('', 'Europe/Madrid'), null);
  assert.equal(wallTimeToInstant('not a date', 'Europe/Madrid'), null);
  assert.equal(instantToWallTime(null, 'Europe/Madrid'), '');
  assert.equal(instantToWallTime('nonsense', 'Europe/Madrid'), '');
  // An unknown zone falls back to the browser's rather than throwing.
  assert.equal(typeof wallTimeToInstant('2026-07-15T23:30', 'Not/AZone'), 'string');
  assert.equal(typeof wallTimeToInstant('2026-07-15T23:30', null), 'string');
});
