// Build a single self-contained HTML file that runs from file:// on a phone.
//
// Opened from local disk, a browser blocks ES module imports and fetch(), so the
// build inlines the stylesheet, all four modules and words.json into one classic
// <script>. Modules share a single scope here, so duplicate top-level names are a
// hard error rather than a mystery bug at runtime.
//
//   node tools/build-standalone.mjs [--out <path>]

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Dependency order: each module may only use what comes before it. */
const MODULES = ['src/words.js', 'src/game.js', 'src/store.js', 'src/app.js'];

const IMPORT = /^import\b[\s\S]*?from\s*['"][^'"]+['"];?[ \t]*$/gm;
const EXPORT = /^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)/gm;
const DECLARATION = /^(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

function stripModuleSyntax(source, file) {
  const code = source.replace(IMPORT, '').replace(EXPORT, '');
  if (/^\s*(import|export)\b/m.test(code)) {
    throw new Error(`${file}: unsupported module syntax left after stripping`);
  }
  return code;
}

function declaredNames(code) {
  return [...code.matchAll(DECLARATION)].map((match) => match[1]);
}

/** Wrap the JSON so a stray "</script" or line separator can never end the block. */
function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export async function buildStandalone({ root = ROOT, out = path.join(ROOT, 'undercover-game.html') } = {}) {
  const [html, css, wordsRaw, ...sources] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'src', 'styles.css'), 'utf8'),
    readFile(path.join(root, 'words.json'), 'utf8'),
    ...MODULES.map((file) => readFile(path.join(root, file), 'utf8')),
  ]);

  const words = JSON.parse(wordsRaw);

  // One shared scope: reject collisions instead of silently shadowing a helper.
  const seen = new Map();
  const parts = [];
  sources.forEach((source, index) => {
    const file = MODULES[index];
    const code = stripModuleSyntax(source, file);
    for (const name of declaredNames(code)) {
      if (seen.has(name)) {
        throw new Error(`duplicate top-level name "${name}" in ${file} and ${seen.get(name)}`);
      }
      seen.set(name, file);
    }
    parts.push(`// --- ${file} ---\n${code.trim()}`);
  });

  let bundle = parts.join('\n\n');

  // app.js calls boot() above the declarations it depends on. In a module that is
  // fine (the body only resumes after the first await); in a concatenated classic
  // script it would run before those consts exist. Move the call to the very end.
  const bootCall = /\nboot\(\);[ \t]*\n/;
  if (!bootCall.test(bundle)) throw new Error('app.js: expected a top-level boot() call to hoist');
  bundle = bundle.replace(bootCall, '\n');

  const script = [
    `globalThis.__UNDERCOVER_WORDS__ = ${inlineJson(words)};`,
    bundle,
    'boot();',
  ].join('\n');

  if (/<\/script/i.test(script)) throw new Error('bundle contains a closing script tag');

  const styleTag = `<style>\n${css.trim()}\n</style>`;
  const styleLink = /[ \t]*<link rel="stylesheet" href="\.\/src\/styles\.css" \/>/;
  const scriptTag = /[ \t]*<script type="module" src="\.\/src\/app\.js"><\/script>/;

  if (!styleLink.test(html)) throw new Error('index.html: stylesheet link not found');
  if (!scriptTag.test(html)) throw new Error('index.html: module script tag not found');

  const standalone = html
    .replace(styleLink, styleTag)
    .replace(scriptTag, `<script>\n${script}\n</script>`)
    .replace('<div class="boot">Loading words…</div>', '<div class="boot">Starting…</div>');

  await writeFile(out, standalone, 'utf8');
  return { out, bytes: Buffer.byteLength(standalone), words: Object.values(words).reduce((sum, list) => sum + list.length, 0) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv.indexOf('--out');
  const out = flag > -1 ? path.resolve(process.argv[flag + 1]) : undefined;
  buildStandalone({ out })
    .then(({ out: file, bytes, words }) => {
      console.log(`standalone: ${path.relative(ROOT, file)} — ${(bytes / 1024).toFixed(1)} KB, ${words} word pairs`);
    })
    .catch((error) => {
      console.error(`build failed: ${error.message}`);
      process.exitCode = 1;
    });
}
