// The installable build is only useful if it really survives with no network.
// These checks pin the two things that silently break that: an asset missing from
// the precache list, and a cache name that never changes (so a stale shell sticks).

import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPwa } from '../tools/build-pwa.mjs';
import { pngSize } from '../tools/make-icons.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(path.join(tmpdir(), 'undercover-pwa-'));
const site = path.join(dir, 'site');

const built = await buildPwa({ out: site });
const [html, manifestRaw, sw] = await Promise.all([
  readFile(path.join(site, 'index.html'), 'utf8'),
  readFile(path.join(site, 'manifest.webmanifest'), 'utf8'),
  readFile(path.join(site, 'sw.js'), 'utf8'),
]);
const manifest = JSON.parse(manifestRaw);

test.after(() => rm(dir, { recursive: true, force: true }));

test('the shell is wired for installation', () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /navigator\.serviceWorker\.register\('sw\.js'\)/);
  assert.match(html, /<script type="module" src="\.\/src\/app\.js"><\/script>/);
});

test('the manifest describes a standalone app with real icons', async () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.theme_color, '#0c0b12');
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes).sort(),
    ['192x192', '512x512'],
  );

  for (const [file, size] of [
    ['icons/icon-192.png', 192],
    ['icons/icon-512.png', 512],
    ['icons/apple-touch-icon.png', 180],
  ]) {
    const png = await readFile(path.join(site, file));
    assert.deepEqual(pngSize(png), { width: size, height: size }, file);
  }
});

test('every asset the page asks for is precached', async () => {
  // Local references in the shell, ignoring the inline data: favicon.
  const referenced = [...html.matchAll(/(?:href|src)="(\.\/)?([^":]+\.(?:css|js|webmanifest|png|json))"/g)].map(
    (match) => match[2],
  );
  assert.ok(referenced.length >= 4);

  for (const file of referenced) {
    const content = await readFile(path.join(site, file));
    assert.ok(content.length > 0, `${file} exists`);
    assert.ok(sw.includes(JSON.stringify(file)), `${file} is in the precache list`);
  }

  assert.match(sw, /cache\.addAll\(ASSETS\)/);
  assert.match(sw, /caches\.match\(request, \{ ignoreSearch: true \}\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
});

test('a rebuild after a change retires the old cache', async () => {
  const root = path.join(dir, 'root');
  await cp(path.join(ROOT, 'src'), path.join(root, 'src'), { recursive: true });
  await cp(path.join(ROOT, 'index.html'), path.join(root, 'index.html'));
  await cp(path.join(ROOT, 'words.json'), path.join(root, 'words.json'));

  const first = await buildPwa({ root, out: path.join(dir, 'first') });
  assert.match(first.cache, /^undercover-[0-9a-f]{8}$/);

  const words = JSON.parse(await readFile(path.join(root, 'words.json'), 'utf8'));
  const [category] = Object.keys(words);
  words[category][0].main = `${words[category][0].main} `;
  await writeFile(path.join(root, 'words.json'), JSON.stringify(words, null, 2));

  const second = await buildPwa({ root, out: path.join(dir, 'second') });
  assert.notEqual(second.cache, first.cache, 'the cache name follows the content');

  const stable = await buildPwa({ root, out: path.join(dir, 'third') });
  assert.equal(stable.cache, second.cache, 'and it is stable for identical content');
});
