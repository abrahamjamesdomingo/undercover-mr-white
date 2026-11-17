// Drawing rules: category/difficulty filtering, no repeats until the pool is
// exhausted, and a coin flip on which word the civilians get.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPool, drawPair, unusedPairs, categoryNames } from '../src/words.js';

const words = {
  Alpha: [
    { id: 'a1', main: 'One', impostor: 'Uno', difficulty: 'easy' },
    { id: 'a2', main: 'Two', impostor: 'Dos', difficulty: 'hard' },
  ],
  Beta: [{ id: 'b1', main: 'Three', impostor: 'Tres', difficulty: 'hard' }],
};

/** Deterministic RNG that replays the given values. */
function sequence(...values) {
  let index = 0;
  return () => values[index++ % values.length];
}

test('buildPool reads categories from the words object', () => {
  assert.deepEqual(categoryNames(words), ['Alpha', 'Beta']);
  assert.equal(buildPool(words).length, 3);
  assert.equal(buildPool(words, { categories: ['Beta'] }).length, 1);
});

test('buildPool filters by difficulty', () => {
  assert.deepEqual(buildPool(words, { difficulty: 'easy' }).map((pair) => pair.id), ['a1']);
  assert.deepEqual(buildPool(words, { difficulty: 'hard' }).map((pair) => pair.id), ['a2', 'b1']);
  assert.equal(buildPool(words, { difficulty: 'medium' }).length, 0);
});

test('drawPair skips pairs already used', () => {
  const pool = buildPool(words);
  const draw = drawPair(pool, ['a1', 'a2'], sequence(0, 0.9));
  assert.equal(draw.pick.id, 'b1');
  assert.deepEqual(draw.usedIds, ['a1', 'a2', 'b1']);
  assert.equal(draw.reset, false);
});

test('drawPair resets only the current pool when every pair is used', () => {
  const pool = buildPool(words, { categories: ['Alpha'] });
  const draw = drawPair(pool, ['a1', 'a2', 'b1'], sequence(0, 0.9));

  assert.equal(draw.reset, true);
  // b1 belongs to another category, so its progress survives the reset.
  assert.ok(draw.usedIds.includes('b1'));
  assert.equal(draw.usedIds.length, 2);
  assert.ok(['a1', 'a2'].includes(draw.pick.id));
});

test('no pair repeats until all pairs in the pool have been drawn', () => {
  const pool = buildPool(words);
  const seen = [];
  let used = [];

  for (let round = 0; round < pool.length; round += 1) {
    const draw = drawPair(pool, used, sequence(0.4, 0.9));
    seen.push(draw.pick.id);
    used = draw.usedIds;
    assert.equal(draw.reset, false, 'should not reset before the pool is exhausted');
  }

  assert.equal(new Set(seen).size, pool.length, 'each pair appears exactly once');
});

test('the words swap on roughly half the draws', () => {
  const pool = buildPool(words);
  const forward = drawPair(pool, [], sequence(0, 0.49));
  const backward = drawPair(pool, [], sequence(0, 0.5));

  assert.equal(forward.swapped, true);
  assert.equal(forward.pair.main, forward.pick.impostor);
  assert.equal(forward.pair.impostor, forward.pick.main);
  assert.equal(backward.swapped, false);
  assert.equal(backward.pair.main, backward.pick.main);
});

test('unusedPairs counts what is left', () => {
  const pool = buildPool(words);
  assert.equal(unusedPairs(pool, ['a1']).length, 2);
  assert.equal(unusedPairs(pool, []).length, 3);
});

test('drawPair refuses an empty pool', () => {
  assert.throws(() => drawPair([], []), /empty/);
});
