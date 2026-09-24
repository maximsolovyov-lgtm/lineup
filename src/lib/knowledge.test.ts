import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendKnowledge } from './knowledge.ts';

test('nothing stored yet: what was said becomes the knowledge', () => {
  assert.equal(appendKnowledge('', 'The bill is at edcorlando.com.'), 'The bill is at edcorlando.com.');
  assert.equal(appendKnowledge('  ', ' Two   spaces collapse. '), 'Two spaces collapse.');
});

test('what was said is added to what is stored, as one text', () => {
  assert.equal(
    appendKnowledge('Announces on Instagram.', 'The label site is stale.'),
    'Announces on Instagram. The label site is stale.',
  );
  // a stored text without a full stop still reads as a sentence
  assert.equal(appendKnowledge('Announces on Instagram', 'Then on RA'), 'Announces on Instagram. Then on RA');
});

test('the same knowledge is never added twice', () => {
  const stored = 'The bill is published at edcorlando.com, three weeks ahead.';
  assert.equal(appendKnowledge(stored, 'the bill is published at edcorlando.com'), stored);
  assert.equal(appendKnowledge(stored, stored), stored);
});

test('an empty instruction changes nothing', () => {
  assert.equal(appendKnowledge('Kept.', ''), 'Kept.');
  assert.equal(appendKnowledge('', ''), '');
});
