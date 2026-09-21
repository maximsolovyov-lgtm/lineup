import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { matchRooms, roomKey, roomSimilarity } from './matching.ts';

// Run with: npm test

test('articles and generic words do not make a different room', () => {
  assert.equal(roomKey('The Theatre'), 'theatre');
  assert.equal(roomKey('Theatre Room'), 'theatre');
  assert.equal(roomKey('The Club'), 'club');
  assert.ok(roomSimilarity('Theatre', 'The Theatre') >= 3);
  assert.ok(roomSimilarity('Club', 'The Club Room') >= 3);
});

test('spelling variants of one room match', () => {
  assert.ok(roomSimilarity('Theatre', 'Theater') >= 2);
  assert.ok(roomSimilarity('Wild Corner', 'The Wild Corner') >= 3);
});

test('numbered rooms never collapse', () => {
  assert.equal(roomSimilarity('Room 1', 'Room 2'), 0);
  assert.equal(roomSimilarity('Room 1', 'Room One'), 0); // "one" is not a digit: different by design, the operator merges
  assert.ok(roomSimilarity('Room 1', 'Room 1 (Main)') >= 1);
});

test('generic words are kept when nothing else identifies the room', () => {
  assert.equal(roomKey('The Room'), 'room');
  assert.ok(roomSimilarity('Room', 'The Room') >= 3);
  assert.equal(roomSimilarity('Room', 'Stage'), 0);
});

test('matchRooms pairs each current room with its best candidate once', () => {
  const current = ['Theatre', 'Club', 'Wild Corner'];
  const candidates = ['The Wild Corner', 'The Theatre', 'Theatre Bar', 'Garden'];
  assert.deepEqual(matchRooms(current, candidates), [1, -1, 0]);
});

test('Hï Ibiza: the agent renaming Theatre to The Theatre is not a new room', () => {
  const stored = ['Theatre', 'Club', 'Wild Corner'];
  const fromAgent = ['The Theatre', 'The Club', 'Wild Corner'];
  assert.deepEqual(matchRooms(stored, fromAgent), [0, 1, 2]);
});
