import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotLabel } from '../../lib/slot-label.ts';

// Mirrors public.lineup_slot_label(): the two must read the same, because the
// finder compares what the database wrote with what the agent published.
test('one act reads as itself, whatever the kind', () => {
  assert.equal(slotLabel('solo', ['Solomun'], ''), 'Solomun');
  assert.equal(slotLabel('b2b', ['Solomun'], ''), 'Solomun');
});

test('back-to-back joins with the kind itself', () => {
  assert.equal(slotLabel('b2b', ['Solomun', 'Dixon'], ''), 'Solomun b2b Dixon');
  assert.equal(slotLabel('b3b', ['A', 'B', 'C'], ''), 'A b3b B b3b C');
});

test('featuring keeps the main act first, guests join it', () => {
  assert.equal(slotLabel('featuring', ['Jamie Jones', 'Seth Troxler'], ''), 'Jamie Jones feat. Seth Troxler');
  assert.equal(slotLabel('multiple_guests', ['Solomun', 'A', 'B'], ''), 'Solomun + A, B');
});

test('a collaboration and an unclear line both read with &', () => {
  assert.equal(slotLabel('collaboration', ['A', 'B'], ''), 'A & B');
  assert.equal(slotLabel('unknown', ['Solomun', 'Dixon'], 'Solomun & Dixon'), 'Solomun & Dixon');
});

test('with no acts the printed line is the label', () => {
  assert.equal(slotLabel('label_only', [], 'Resident DJs'), 'Resident DJs');
  assert.equal(slotLabel('solo', ['', ' '], 'Local support'), 'Local support');
});
