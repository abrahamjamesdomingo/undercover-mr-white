// The standalone build exists to be opened from file:// on a phone, where a
// browser refuses ES module imports, fetch() and external subresources. If any of
// those sneak back in, the game shows a blank screen on the phone and not in dev,
// so guard the contract here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildStandalone } from '../tools/build-standalone.mjs';

const dir = await mkdtemp(path.join(tmpdir(), 'undercover-standalone-'));
const built = await buildStandalone({ out: path.join(dir, 'undercover-game.html') });
const html = await readFile(built.out, 'utf8');

test.after(() => rm(dir, { recursive: true, force: true }));

test('the build is a single document with no external subresources', () => {
  assert.match(html, /^<!doctype html>/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<script[^>]+type="module"/i);
  assert.match(html, /<style>[\s\S]*--accent[\s\S]*<\/style>/);
});

test('module syntax is gone and boot runs last', () => {
  assert.doesNotMatch(html, /^\s*import\b/m);
  assert.doesNotMatch(html, /^\s*export\b/m);

  // The injectable word list is what makes the file work offline. The dev-only
  // fetch fallback may remain, but it must sit behind that check, never before it.
  const injected = html.indexOf('globalThis.__UNDERCOVER_WORDS__ = {');
  assert.ok(injected > -1, 'words are inlined');
  const fallback = html.indexOf("fetch('words.json'");
  assert.ok(fallback === -1 || fallback > injected, 'any network fallback comes after the inlined words');

  const bootIndex = html.lastIndexOf('\nboot();');
  assert.ok(bootIndex > -1, 'the bundle calls boot()');
  // boot() must come after every declaration it touches (const app, state, esc…)
  assert.ok(bootIndex > html.indexOf('const app = document.getElementById'), 'boot() runs after the app element lookup');
  assert.ok(html.length - bootIndex < 40, 'boot() is the last statement');
});

test('every word pair is inlined', () => {
  const ids = [...html.matchAll(/"id":"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 325);
  assert.equal(new Set(ids).size, 325);
  assert.equal(built.words, 325);
  assert.ok(built.bytes < 200 * 1024, 'stays small enough to share over chat');
});
