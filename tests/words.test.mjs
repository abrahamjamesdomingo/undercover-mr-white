// Data validation: every pair in words.json must be usable by the game.
// Run with: npm test  (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const words = JSON.parse(fs.readFileSync(path.join(root, 'words.json'), 'utf8'));

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

const entries = Object.entries(words).flatMap(([category, pairs]) =>
  pairs.map((pair) => ({ ...pair, category })),
);

test('words.json has at least one category', () => {
  assert.ok(Object.keys(words).length > 0);
});

test('no category is empty or malformed', () => {
  for (const [name, pairs] of Object.entries(words)) {
    assert.ok(name.trim().length > 0, 'category name must not be blank');
    assert.ok(Array.isArray(pairs) && pairs.length > 0, `category "${name}" must be a non-empty array`);
  }
});

test('every entry has a unique id', () => {
  const seen = new Map();
  for (const entry of entries) {
    assert.equal(typeof entry.id, 'string', `${entry.main}: id must be a string`);
    assert.ok(entry.id.trim().length > 0, `${entry.main}: id must not be blank`);
    assert.ok(!seen.has(entry.id), `duplicate id "${entry.id}" in "${entry.category}" and "${seen.get(entry.id)}"`);
    seen.set(entry.id, entry.category);
  }
});

test('every entry has a non-empty main word and impostor word', () => {
  for (const entry of entries) {
    assert.equal(typeof entry.main, 'string', `entry ${entry.id}: main must be a string`);
    assert.equal(typeof entry.impostor, 'string', `entry ${entry.id}: impostor must be a string`);
    assert.ok(entry.main.trim().length > 0, `entry ${entry.id}: main must not be blank`);
    assert.ok(entry.impostor.trim().length > 0, `entry ${entry.id}: impostor must not be blank`);
    assert.notEqual(
      entry.main.trim().toLowerCase(),
      entry.impostor.trim().toLowerCase(),
      `entry ${entry.id}: main and impostor must differ`,
    );
  }
});

test('every entry carries a valid difficulty', () => {
  for (const entry of entries) {
    assert.ok(DIFFICULTIES.has(entry.difficulty), `entry ${entry.id}: difficulty "${entry.difficulty}" is not easy/medium/hard`);
  }
});

test('the Pinoy categories were merged', () => {
  for (const name of [
    'Pinoy Food & Street Food',
    'Pinoy Culture & Everyday Life',
    'Pinoy Pop Culture & Showbiz',
    'Philippine Places & Landmarks',
  ]) {
    assert.ok(words[name], `missing category "${name}"`);
    assert.equal(words[name].length, 25, `"${name}" should hold 25 pairs`);
  }
});
