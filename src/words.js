// Word pool + drawing. Pure functions: no DOM, no storage, RNG injected.

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

export const DIFFICULTY_LABELS = {
  all: 'All',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/** Category names straight from the JSON keys - no hardcoded list anywhere. */
export function categoryNames(words) {
  return Object.keys(words).filter((name) => Array.isArray(words[name]) && words[name].length > 0);
}

/** How many pairs each category holds for a given difficulty ('all' counts everything). */
export function categoryCounts(words, difficulty = 'all') {
  const counts = {};
  for (const name of categoryNames(words)) {
    counts[name] = words[name].filter((pair) => difficulty === 'all' || pair.difficulty === difficulty).length;
  }
  return counts;
}

export function poolSize(words, { categories, difficulty }) {
  return buildPool(words, { categories, difficulty }).length;
}

/**
 * Every pair matching the selected categories and difficulty.
 * `categories` is a list of names; null/empty means all of them.
 */
export function buildPool(words, { categories = null, difficulty = 'all' } = {}) {
  const wanted = Array.isArray(categories) && categories.length ? categories : categoryNames(words);
  const pool = [];
  for (const name of wanted) {
    const pairs = words[name];
    if (!Array.isArray(pairs)) continue;
    for (const pair of pairs) {
      if (difficulty !== 'all' && pair.difficulty !== difficulty) continue;
      pool.push({
        id: pair.id,
        main: pair.main,
        impostor: pair.impostor,
        difficulty: pair.difficulty ?? 'medium',
        category: name,
      });
    }
  }
  return pool;
}

/** Pairs in the pool that have not been drawn yet. */
export function unusedPairs(pool, usedIds) {
  const used = new Set(usedIds ?? []);
  return pool.filter((pair) => !used.has(pair.id));
}

/**
 * Draw a pair and decide whether the two words swap.
 *
 * Repeat protection: pairs already in `usedIds` are skipped. When every pair in
 * the *current* pool has been used, only those ids are cleared - a category that
 * is not selected keeps its progress, so switching filters never hands out a
 * word twice.
 *
 * Returns the pair in its final orientation, the updated id list, and flags the
 * caller can surface in the UI.
 */
export function drawPair(pool, usedIds = [], rng = Math.random) {
  if (!pool.length) throw new Error('drawPair: the pool is empty');

  let used = [...usedIds];
  let candidates = unusedPairs(pool, used);
  let reset = false;

  if (!candidates.length) {
    const poolIds = new Set(pool.map((pair) => pair.id));
    used = used.filter((id) => !poolIds.has(id));
    candidates = pool.slice();
    reset = true;
  }

  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  const chosen = candidates[index];
  const swapped = rng() < 0.5;

  return {
    pick: chosen,
    pair: {
      ...chosen,
      main: swapped ? chosen.impostor : chosen.main,
      impostor: swapped ? chosen.main : chosen.impostor,
    },
    usedIds: [...used, chosen.id],
    swapped,
    reset,
  };
}
