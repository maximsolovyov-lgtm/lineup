import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SET, minutesToWallTime, planRoom, timeToMinutes } from './plan.ts';

const slot = (key: string, is_headliner = false) => ({ key, label: key, is_headliner });
// A club night: doors 23:30, close 06:00 the next morning.
const NIGHT = { startMin: timeToMinutes('23:30')!, endMin: timeToMinutes('06:00', 1)! };

test('the night starts and ends exactly where the occurrence says', () => {
  const plan = planRoom([slot('a'), slot('b'), slot('c')], NIGHT);
  assert.equal(plan[0]!.startMin, NIGHT.startMin);
  assert.equal(plan.at(-1)!.endMin, NIGHT.endMin);
  assert.deepEqual(plan.map((p) => p.sequence), [1, 2, 3]);
});

test('with no headliner window the night is divided evenly, on the quarter hour', () => {
  const plan = planRoom([slot('a'), slot('b'), slot('c')], NIGHT);
  for (const p of plan) {
    assert.equal(p.startMin % 15, 0);
    assert.equal(p.endMin % 15, 0);
    assert.ok(p.endMin - p.startMin >= MIN_SET);
  }
  assert.equal(plan[0]!.endMin, plan[1]!.startMin, 'no gap');
  assert.equal(plan[1]!.endMin, plan[2]!.startMin, 'no overlap');
});

test('the venue headliner slot is taken as it stands, and the rest fill around it', () => {
  const head = { startMin: timeToMinutes('01:30', 1)!, endMin: timeToMinutes('04:00', 1)! };
  const plan = planRoom([slot('open'), slot('star', true), slot('close')], NIGHT, head);
  const star = plan.find((p) => p.key === 'star')!;
  assert.equal(star.startMin, head.startMin);
  assert.equal(star.endMin, head.endMin);
  assert.equal(plan.find((p) => p.key === 'open')!.endMin, head.startMin);
  assert.equal(plan.find((p) => p.key === 'close')!.startMin, head.endMin);
});

test('two headliners, or a window outside the night, fall back to an even division', () => {
  const head = { startMin: timeToMinutes('01:30', 1)!, endMin: timeToMinutes('04:00', 1)! };
  const two = planRoom([slot('a', true), slot('b', true)], NIGHT, head);
  assert.equal(two[0]!.startMin, NIGHT.startMin);
  assert.equal(two[0]!.endMin, two[1]!.startMin);
  const outside = planRoom([slot('a'), slot('b', true)], NIGHT, { startMin: 100, endMin: 200 });
  assert.equal(outside[0]!.startMin, NIGHT.startMin);
});

test('more acts than the night can hold gives each the whole window, not a five-minute lie', () => {
  const many = Array.from({ length: 40 }, (_, i) => slot(`s${i}`));
  const plan = planRoom(many, NIGHT);
  assert.equal(plan.length, 40);
  assert.ok(plan.every((p) => p.startMin === NIGHT.startMin && p.endMin === NIGHT.endMin));
});

test('an empty room, or a window that ends before it starts, plans nothing', () => {
  assert.deepEqual(planRoom([], NIGHT), []);
  assert.deepEqual(planRoom([slot('a')], { startMin: 100, endMin: 100 }), []);
});

test('minutes convert back to the wall time of the right day', () => {
  assert.equal(minutesToWallTime('2026-09-26', timeToMinutes('23:30')!), '2026-09-26T23:30');
  assert.equal(minutesToWallTime('2026-09-26', timeToMinutes('06:00', 1)!), '2026-09-27T06:00');
  assert.equal(timeToMinutes('24:00'), null);
});
