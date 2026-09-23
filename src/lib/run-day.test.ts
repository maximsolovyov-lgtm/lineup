import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayInRun, runDays } from './run-day.ts';

// EDC Orlando 2026: Friday 6 to Sunday 8 November.
const RUN = { from: '2026-11-06', to: '2026-11-08' };

test('the run is every day from the business day to the last', () => {
  assert.deepEqual(runDays(RUN), ['2026-11-06', '2026-11-07', '2026-11-08']);
  assert.deepEqual(runDays({ from: '2026-11-06', to: '2026-11-06' }), ['2026-11-06']);
});

test('an ISO day is taken as given, inside the run or not', () => {
  assert.equal(dayInRun('2026-11-07', RUN), '2026-11-07');
  assert.equal(dayInRun('2026-12-01', RUN), '2026-12-01'); // kept, and flagged on save
});

test('"Day 2" counts from the first day of the run', () => {
  assert.equal(dayInRun('Day 1', RUN), '2026-11-06');
  assert.equal(dayInRun('day 3', RUN), '2026-11-08');
  assert.equal(dayInRun('Day 9', RUN), '');
});

test('a weekday picks the day of the run that falls on it', () => {
  assert.equal(dayInRun('Friday', RUN), '2026-11-06');
  assert.equal(dayInRun('sat', RUN), '2026-11-07');
  assert.equal(dayInRun('Sunday', RUN), '2026-11-08');
  assert.equal(dayInRun('Tuesday', RUN), '');
});

test('a printed date resolves with or without its month', () => {
  assert.equal(dayInRun('Nov 7', RUN), '2026-11-07');
  assert.equal(dayInRun('8 November', RUN), '2026-11-08');
  assert.equal(dayInRun('6', RUN), '2026-11-06');
  assert.equal(dayInRun('December 7', RUN), '');
});

test('nothing usable, or no run at all, gives nothing', () => {
  assert.equal(dayInRun(null, RUN), '');
  assert.equal(dayInRun('whenever', RUN), '');
  assert.equal(dayInRun('Friday', null), '');
});
