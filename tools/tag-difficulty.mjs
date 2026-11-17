#!/usr/bin/env node
// Tags every pair in words.json with a difficulty: easy | medium | hard.
//
// Difficulty here means "how hard it is to tell the two words apart from a
// single clue". A hard pair is near-interchangeable (Turtle / Tortoise): an
// impostor can say almost anything and still sound right. An easy pair lives in
// the same broad domain but at different granularity (Netflix / YouTube), so a
// vague clue exposes the impostor.
//
// Two stages:
//   1. semantic table  - the 200 legacy pairs were assessed pair by pair
//   2. heuristic       - anything new (a merged category, a hand-added pair) is
//                        scored from token overlap and confusable families, so
//                        words.json can grow without editing this file.
//
// Pairs that already carry a difficulty (the Pinoy categories) are left alone.
// Run with --report to see the hard/easy lists without writing.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWords, writeWords, flattenWords } from './words-format.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const wordsPath = path.join(root, 'words.json');

// --- stage 1: semantic assessment of the legacy pairs ----------------------
// h = hard (near-synonyms / same object class), m = medium (same domain,
// different role), e = easy (same domain, clearly different thing).
const SEMANTIC = {
  // Food & Drinks
  fd1: 'm', fd2: 'h', fd3: 'm', fd4: 'm', fd5: 'h', fd6: 'h', fd7: 'm', fd8: 'h', fd9: 'm', fd10: 'h',
  fd11: 'm', fd12: 'm', fd13: 'h', fd14: 'm', fd15: 'h', fd16: 'e', fd17: 'm', fd18: 'h', fd19: 'm', fd20: 'm',
  fd21: 'h', fd22: 'h', fd23: 'h', fd24: 'h', fd25: 'm',
  // Tech & Gaming
  tg1: 'h', tg2: 'h', tg3: 'h', tg4: 'm', tg5: 'm', tg6: 'h', tg7: 'h', tg8: 'm', tg9: 'h', tg10: 'm',
  tg11: 'h', tg12: 'm', tg13: 'h', tg14: 'm', tg15: 'h', tg16: 'h', tg17: 'h', tg18: 'h', tg19: 'm', tg20: 'h',
  tg21: 'h', tg22: 'h', tg23: 'h', tg24: 'm', tg25: 'h',
  // Places & Travel
  pt1: 'm', pt2: 'e', pt3: 'e', pt4: 'm', pt5: 'h', pt6: 'h', pt7: 'e', pt8: 'h', pt9: 'm', pt10: 'h',
  pt11: 'e', pt12: 'm', pt13: 'h', pt14: 'e', pt15: 'h', pt16: 'm', pt17: 'm', pt18: 'h', pt19: 'e', pt20: 'm',
  pt21: 'm', pt22: 'm', pt23: 'm', pt24: 'h', pt25: 'e',
  // Daily Objects
  do1: 'm', do2: 'h', do3: 'h', do4: 'm', do5: 'e', do6: 'h', do7: 'h', do8: 'm', do9: 'h', do10: 'h',
  do11: 'm', do12: 'e', do13: 'h', do14: 'e', do15: 'e', do16: 'h', do17: 'h', do18: 'e', do19: 'm', do20: 'h',
  do21: 'h', do22: 'h', do23: 'm', do24: 'm', do25: 'm',
  // Animals & Nature
  an1: 'm', an2: 'h', an3: 'h', an4: 'e', an5: 'h', an6: 'h', an7: 'h', an8: 'm', an9: 'e', an10: 'h',
  an11: 'h', an12: 'h', an13: 'm', an14: 'h', an15: 'h', an16: 'h', an17: 'e', an18: 'm', an19: 'h', an20: 'h',
  an21: 'm', an22: 'm', an23: 'h', an24: 'm', an25: 'e',
  // Movies, TV & Pop Culture
  mp1: 'e', mp2: 'm', mp3: 'h', mp4: 'm', mp5: 'h', mp6: 'h', mp7: 'e', mp8: 'h', mp9: 'm', mp10: 'm',
  mp11: 'm', mp12: 'h', mp13: 'h', mp14: 'h', mp15: 'h', mp16: 'm', mp17: 'h', mp18: 'h', mp19: 'm', mp20: 'e',
  mp21: 'e', mp22: 'e', mp23: 'm', mp24: 'm', mp25: 'm',
  // Sports & Activities
  sa1: 'm', sa2: 'h', sa3: 'm', sa4: 'h', sa5: 'h', sa6: 'e', sa7: 'm', sa8: 'm', sa9: 'h', sa10: 'h',
  sa11: 'm', sa12: 'e', sa13: 'h', sa14: 'h', sa15: 'e', sa16: 'e', sa17: 'm', sa18: 'h', sa19: 'm', sa20: 'h',
  sa21: 'h', sa22: 'h', sa23: 'e', sa24: 'm', sa25: 'm',
  // Jobs & Professions
  jp1: 'm', jp2: 'm', jp3: 'm', jp4: 'm', jp5: 'h', jp6: 'm', jp7: 'h', jp8: 'h', jp9: 'h', jp10: 'm',
  jp11: 'm', jp12: 'm', jp13: 'm', jp14: 'm', jp15: 'h', jp16: 'm', jp17: 'h', jp18: 'e', jp19: 'm', jp20: 'e',
  jp21: 'm', jp22: 'm', jp23: 'h', jp24: 'e', jp25: 'h',
  // Clothing & Fashion
  cf1: 'h', cf2: 'h', cf3: 'h', cf4: 'm', cf5: 'h', cf6: 'm', cf7: 'h', cf8: 'h', cf9: 'm', cf10: 'h',
  cf11: 'h', cf12: 'm', cf13: 'm', cf14: 'h', cf15: 'm', cf16: 'h', cf17: 'h', cf18: 'm', cf19: 'm', cf20: 'm',
  cf21: 'm', cf22: 'h', cf23: 'h', cf24: 'e', cf25: 'm',
};

const LABEL = { h: 'hard', m: 'medium', e: 'easy' };

// --- stage 2: heuristic fallback for pairs not in the table ----------------

const STOP = new Set(['and', 'the', 'of', 'a', 'an', 'to', 'with', 'in', 'on']);

function tokens(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOP.has(token));
}

// Groups of words that name essentially the same thing.
const FAMILIES = [
  ['tv', 'television', 'netflix', 'youtube', 'twitch', 'streaming'],
  ['phone', 'smartphone', 'tablet', 'laptop', 'computer', 'pc'],
  ['shoe', 'shoes', 'sneakers', 'boots', 'sandals', 'slippers', 'loafers', 'crocs'],
  ['hat', 'cap', 'beanie', 'helmet'],
  ['car', 'vehicle', 'truck', 'van', 'bus'],
  ['dog', 'wolf', 'husky', 'fox', 'coyote'],
  ['cat', 'kitten', 'tiger', 'leopard', 'lion'],
  ['sea', 'ocean', 'water', 'river', 'lake', 'stream'],
  ['bread', 'baguette', 'croissant', 'pandesal', 'toast'],
  ['coffee', 'latte', 'espresso', 'cappuccino', 'tea'],
  ['game', 'gaming', 'videogame', 'console'],
  ['movie', 'film', 'cinema', 'series', 'show'],
  ['song', 'music', 'track', 'album'],
  ['doctor', 'nurse', 'medic', 'physician'],
  ['money', 'cash', 'wallet', 'payment'],
];

function familyScore(a, b) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  let shared = 0;
  for (const family of FAMILIES) {
    const inA = family.some((word) => ta.has(word));
    const inB = family.some((word) => tb.has(word));
    if (inA && inB) shared += 1;
  }
  return Math.min(1, shared * 0.5);
}

/** 0 (unrelated) .. 1 (interchangeable) similarity score. */
export function similarity(main, impostor) {
  const ta = tokens(main);
  const tb = tokens(impostor);
  if (!ta.length || !tb.length) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);
  const overlap = [...setA].filter((token) => setB.has(token)).length;
  const containment = overlap / Math.min(setA.size, setB.size);
  // Token overlap is capped below 1 so "Skirt" / "Pleated Skirt" reads hard-ish
  // but never as certain as an explicit entry in the table.
  const score = containment * 0.55 + familyScore(main, impostor) * 0.35;
  return Math.min(1, score);
}

function heuristicDifficulty(main, impostor) {
  const score = similarity(main, impostor);
  if (score >= 0.6) return 'hard';
  if (score >= 0.25) return 'medium';
  return 'easy';
}

// --- run ------------------------------------------------------------------

const categories = readWords(wordsPath);
const report = process.argv.includes('--report');
const counts = { easy: 0, medium: 0, hard: 0 };
const assigned = { curated: 0, heuristic: 0, kept: 0 };
const byCategory = {};

for (const [name, entries] of Object.entries(categories)) {
  byCategory[name] = { easy: 0, medium: 0, hard: 0 };
  for (const entry of entries) {
    if (!entry.difficulty) {
      const curated = SEMANTIC[entry.id];
      entry.difficulty = curated ? LABEL[curated] : heuristicDifficulty(entry.main, entry.impostor);
      assigned[curated ? 'curated' : 'heuristic'] += 1;
    } else {
      assigned.kept += 1;
    }
    counts[entry.difficulty] += 1;
    byCategory[name][entry.difficulty] += 1;
  }
}

const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
const pct = (n) => `${Math.round((n / total) * 100)}%`;

console.log(`difficulty: easy ${counts.easy} (${pct(counts.easy)}), medium ${counts.medium} (${pct(counts.medium)}), hard ${counts.hard} (${pct(counts.hard)})`);
console.log(`assigned: ${assigned.curated} reviewed, ${assigned.heuristic} heuristic, ${assigned.kept} kept`);
console.log('');
for (const [name, list] of Object.entries(byCategory)) {
  console.log(`  ${name.padEnd(30)} e:${String(list.easy).padStart(2)}  m:${String(list.medium).padStart(2)}  h:${String(list.hard).padStart(2)}`);
}

if (report) {
  const flat = flattenWords(categories);
  for (const level of ['hard', 'easy']) {
    console.log(`\n${level}:`);
    const picks = flat.filter((entry) => entry.difficulty === level);
    for (const entry of picks) console.log(`  ${entry.id.padEnd(5)} ${entry.main} / ${entry.impostor}`);
  }
  console.log('\n(report only, words.json not modified)');
} else {
  writeWords(wordsPath, categories);
  console.log('\nwords.json written');
}

if (assigned.heuristic) {
  console.warn(`\n${assigned.heuristic} pair(s) fell back to the heuristic; check them with --report.`);
}
