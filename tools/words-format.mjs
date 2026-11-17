// Shared JSON reader/writer for words.json.
// Keeps the compact "one pair per line" layout the file already used, so diffs
// stay readable instead of exploding into four lines per entry.

import fs from 'node:fs';

const ORDER = ['id', 'main', 'impostor', 'difficulty'];

function quote(value) {
  return JSON.stringify(value);
}

function formatEntry(entry) {
  const keys = ORDER.filter((key) => entry[key] !== undefined);
  for (const key of Object.keys(entry)) {
    if (!keys.includes(key)) keys.push(key);
  }
  return '    { ' + keys.map((key) => `${quote(key)}: ${quote(entry[key])}`).join(', ') + ' }';
}

/**
 * Serialize a category map ({ "Food & Drinks": [ {id, main, impostor, difficulty} ] })
 * into the repository's JSON layout.
 */
export function formatWords(categories) {
  const blocks = Object.entries(categories).map(([name, entries]) => {
    const rows = entries.map(formatEntry).join(',\n');
    return `  ${quote(name)}: [\n${rows}\n  ]`;
  });
  return `{\n${blocks.join(',\n')}\n}\n`;
}

export function readWords(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeWords(file, categories) {
  fs.writeFileSync(file, formatWords(categories), 'utf8');
}

/** Flat list of every pair, tagged with its category. */
export function flattenWords(categories) {
  return Object.entries(categories).flatMap(([category, entries]) =>
    entries.map((entry) => ({ ...entry, category })),
  );
}
