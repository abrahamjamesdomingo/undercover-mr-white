// Game rules: player limits, role distribution, speaking order, win conditions
// and scoring. All pure functions with an injectable RNG.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;

export const ROLES = {
  civilian: 'civilian',
  undercover: 'undercover',
  mrwhite: 'mrwhite',
};

export const ROLE_LABELS = {
  civilian: 'Civilian',
  undercover: 'Undercover',
  mrwhite: 'Mr. White',
};

export const POINTS = {
  civiliansWin: 2,
  impostorsWin: 4,
  mrWhiteGuess: 5,
};

/** Spec: 1 undercover at 3-6 players, 1 or 2 at 7-10. */
export function allowedUndercoverCounts(playerCount) {
  return playerCount >= 7 ? [1, 2] : [1];
}

/** Spec: Mr. White only exists from 4 players up. */
export function mrWhiteAvailable(playerCount) {
  return playerCount >= MIN_PLAYERS + 1;
}

export function specialCount({ includeMrWhite, undercoverCount }) {
  return undercoverCount + (includeMrWhite ? 1 : 0);
}

/**
 * Spec: special roles must be strictly fewer than half the players.
 * Returns a human-readable reason when the setup is illegal, null when fine.
 */
export function setupIssue({ playerCount, includeMrWhite, undercoverCount }) {
  if (playerCount < MIN_PLAYERS) return `You need at least ${MIN_PLAYERS} players.`;
  if (playerCount > MAX_PLAYERS) return `At most ${MAX_PLAYERS} players.`;
  if (!allowedUndercoverCounts(playerCount).includes(undercoverCount)) {
    return `${playerCount} players allows ${allowedUndercoverCounts(playerCount).join(' or ')} undercover.`;
  }
  if (includeMrWhite && !mrWhiteAvailable(playerCount)) {
    return `Mr. White needs at least ${MIN_PLAYERS + 1} players.`;
  }
  const specials = specialCount({ includeMrWhite, undercoverCount });
  if (specials >= playerCount / 2) {
    return `${specials} special roles is too many for ${playerCount} players (must stay under half).`;
  }
  return null;
}

function shuffle(list, rng) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Deal roles to seat indexes. Returns one role per player, in seat order.
 * Throws when the setup breaks the rules instead of silently rebalancing.
 */
export function assignRoles(playerCount, { includeMrWhite = false, undercoverCount = 1 } = {}, rng = Math.random) {
  const issue = setupIssue({ playerCount, includeMrWhite, undercoverCount });
  if (issue) throw new Error(issue);

  const seats = shuffle([...Array(playerCount).keys()], rng);
  const roles = new Array(playerCount).fill(ROLES.civilian);
  let cursor = 0;

  for (let i = 0; i < undercoverCount; i += 1) roles[seats[cursor++]] = ROLES.undercover;
  if (includeMrWhite) roles[seats[cursor++]] = ROLES.mrwhite;

  return roles;
}

/**
 * Randomized speaking order. Mr. White is never first, so they always get at
 * least one clue to work from (spec requirement).
 */
export function speakingOrder(playerCount, roles, rng = Math.random) {
  const order = shuffle([...Array(playerCount).keys()], rng);
  if (roles[order[0]] === ROLES.mrwhite) {
    const spot = order.findIndex((seat) => roles[seat] !== ROLES.mrwhite);
    if (spot > 0) [order[0], order[spot]] = [order[spot], order[0]];
  }
  return order;
}

/**
 * 'civilians' when no special is left alive, 'impostors' when the specials
 * match the civilians, null while the round continues.
 */
export function checkWin(roles, alive) {
  const living = alive.filter((seat) => seat >= 0 && seat < roles.length);
  const specials = living.filter((seat) => roles[seat] !== ROLES.civilian).length;
  const civilians = living.length - specials;
  if (specials === 0) return 'civilians';
  if (specials >= civilians) return 'impostors';
  return null;
}

/** Points per seat for a finished round. */
export function roundDeltas({ roles, alive, winner, mrWhiteIndex = -1 }) {
  const deltas = [];
  if (winner === 'civilians') {
    for (const seat of alive) {
      if (roles[seat] === ROLES.civilian) deltas.push({ index: seat, points: POINTS.civiliansWin });
    }
  } else if (winner === 'impostors') {
    for (const seat of alive) {
      if (roles[seat] !== ROLES.civilian) deltas.push({ index: seat, points: POINTS.impostorsWin });
    }
  } else if (winner === 'mrwhite' && mrWhiteIndex >= 0) {
    deltas.push({ index: mrWhiteIndex, points: POINTS.mrWhiteGuess });
  }
  return deltas;
}

/** Case-insensitive, whitespace-trimmed comparison for the Mr. White guess. */
export function guessMatches(guess, mainWord) {
  const normalize = (text) => String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalize(guess) === normalize(mainWord) && normalize(guess).length > 0;
}
