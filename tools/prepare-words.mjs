#!/usr/bin/env node
// One-time (idempotent) repair of words.json + merge of the Pinoy categories.
//
// words.json was truncated mid-token at byte 14167, leaving the Clothing &
// Fashion category unfinished at cf14. This restores cf14-cf25 and the closing
// brackets, then merges every category from words_difficulty.json.
//
// Safe to re-run: if the file already parses and already contains the Pinoy
// categories, it just reports and exits.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWords, writeWords } from './words-format.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const wordsPath = path.join(root, 'words.json');
const difficultyPath = path.join(root, 'words_difficulty.json');

// Reconstructed tail of "Clothing & Fashion" (cf14-cf25). The original file
// ended at: { "id": "cf14", "main": "Gloves", "impost
const CF_TAIL = [
  ['cf14', 'Gloves', 'Mittens'],
  ['cf15', 'Belt', 'Suspenders'],
  ['cf16', 'Dress', 'Gown'],
  ['cf17', 'Skirt', 'Pleated Skirt'],
  ['cf18', 'Ring', 'Earrings'],
  ['cf19', 'Raincoat', 'Poncho'],
  ['cf20', 'Pajamas', 'Bathrobe'],
  ['cf21', 'Blazer', 'Cardigan'],
  ['cf22', 'Leggings', 'Tights'],
  ['cf23', 'Bucket Hat', 'Sun Hat'],
  ['cf24', 'Apron', 'Oven Mitt'],
  ['cf25', 'Flip-flops', 'Crocs'],
];

function repairTruncatedFile(raw) {
  const base = raw.slice(0, raw.lastIndexOf('\n'));
  const rows = CF_TAIL.map(
    ([id, main, impostor]) => `    { "id": ${JSON.stringify(id)}, "main": ${JSON.stringify(main)}, "impostor": ${JSON.stringify(impostor)} }`,
  ).join(',\n');
  const candidate = `${base}\n${rows}\n  ]\n}`;
  return JSON.parse(candidate);
}

let raw = fs.readFileSync(wordsPath, 'utf8');
let categories;
let repaired = false;

try {
  categories = JSON.parse(raw);
} catch (error) {
  console.log(`words.json is invalid (${error.message.split('\n')[0]}); repairing tail...`);
  categories = repairTruncatedFile(raw);
  repaired = true;
  // Keep the broken original for reference before overwriting.
  fs.copyFileSync(wordsPath, `${wordsPath}.truncated.bak`);
}

const extra = readWords(difficultyPath);
const merged = [];

for (const [name, entries] of Object.entries(extra)) {
  if (categories[name]) {
    console.log(`skip "${name}" (already present)`);
    continue;
  }
  categories[name] = entries;
  merged.push(name);
}

const total = Object.values(categories).reduce((sum, entries) => sum + entries.length, 0);
const ids = new Set();
const duplicates = [];

for (const [name, entries] of Object.entries(categories)) {
  for (const entry of entries) {
    if (ids.has(entry.id)) duplicates.push(`${name}: ${entry.id}`);
    ids.add(entry.id);
  }
}

if (duplicates.length) {
  console.error(`duplicate ids: ${duplicates.join(', ')}`);
  process.exitCode = 1;
} else {
  writeWords(wordsPath, categories);
  console.log(`repaired: ${repaired ? 'yes' : 'no'}`);
  console.log(`merged categories: ${merged.length ? merged.join(', ') : 'none'}`);
  console.log(`categories: ${Object.keys(categories).length}, pairs: ${total}, unique ids: ${ids.size}`);
}
