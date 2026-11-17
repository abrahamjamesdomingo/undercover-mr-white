// Rules: role distribution, Mr. White never speaks first, win conditions, scoring.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  allowedUndercoverCounts,
  mrWhiteAvailable,
  setupIssue,
  assignRoles,
  speakingOrder,
  checkWin,
  roundDeltas,
  guessMatches,
} from '../src/game.js';

function sequence(...values) {
  let index = 0;
  return () => values[index++ % values.length];
}

function count(roles, role) {
  return roles.filter((entry) => entry === role).length;
}

test('player bounds are 3 to 10', () => {
  assert.equal(MIN_PLAYERS, 3);
  assert.equal(MAX_PLAYERS, 10);
});

test('undercover count follows the player count', () => {
  assert.deepEqual(allowedUndercoverCounts(6), [1]);
  assert.deepEqual(allowedUndercoverCounts(7), [1, 2]);
  assert.deepEqual(allowedUndercoverCounts(10), [1, 2]);
});

test('Mr. White needs at least 4 players', () => {
  assert.equal(mrWhiteAvailable(3), false);
  assert.equal(mrWhiteAvailable(4), true);
});

test('specials must stay strictly under half the players', () => {
  // 4 players: 1 undercover + Mr. White = 2, which is not < 2.
  assert.match(setupIssue({ playerCount: 4, includeMrWhite: true, undercoverCount: 1 }), /under half/);
  assert.equal(setupIssue({ playerCount: 4, includeMrWhite: false, undercoverCount: 1 }), null);
  assert.equal(setupIssue({ playerCount: 5, includeMrWhite: true, undercoverCount: 1 }), null);
  assert.equal(setupIssue({ playerCount: 3, includeMrWhite: true, undercoverCount: 1 }), 'Mr. White needs at least 4 players.');
  assert.equal(setupIssue({ playerCount: 8, includeMrWhite: true, undercoverCount: 2 }), null);
  assert.equal(setupIssue({ playerCount: 8, includeMrWhite: false, undercoverCount: 3 }), '8 players allows 1 or 2 undercover.');
});

test('assignRoles deals exactly the configured roles', () => {
  for (let playerCount = MIN_PLAYERS; playerCount <= MAX_PLAYERS; playerCount += 1) {
    for (const undercoverCount of allowedUndercoverCounts(playerCount)) {
      for (const includeMrWhite of [false, true]) {
        const setup = { playerCount, includeMrWhite, undercoverCount };
        if (setupIssue(setup)) continue;

        const roles = assignRoles(playerCount, { includeMrWhite, undercoverCount }, sequence(0.31, 0.77, 0.12));
        assert.equal(roles.length, playerCount);
        assert.equal(count(roles, 'undercover'), undercoverCount);
        assert.equal(count(roles, 'mrwhite'), includeMrWhite ? 1 : 0);
        assert.equal(count(roles, 'civilian'), playerCount - undercoverCount - (includeMrWhite ? 1 : 0));
      }
    }
  }
});

test('assignRoles rejects an illegal setup', () => {
  assert.throws(() => assignRoles(4, { includeMrWhite: true, undercoverCount: 1 }), /under half/);
});

test('Mr. White never speaks first', () => {
  const roles = ['mrwhite', 'civilian', 'civilian', 'undercover'];
  for (let seed = 0; seed < 40; seed += 1) {
    const rng = sequence(seed / 41, (seed * 7) / 43, (seed * 13) / 47);
    const order = speakingOrder(roles.length, roles, rng);
    assert.notEqual(roles[order[0]], 'mrwhite', `seed ${seed} put Mr. White first`);
    assert.equal(order.length, roles.length);
  }
});

test('win conditions', () => {
  // 5 players: 3 civilians + undercover + Mr. White.
  const roles = ['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite'];
  // Still playing: 2 specials against 3 civilians, then 1 against 3.
  assert.equal(checkWin(roles, [0, 1, 2, 3, 4]), null);
  assert.equal(checkWin(roles, [0, 1, 2, 3]), null);
  // No specials left: the civilians have it.
  assert.equal(checkWin(roles, [0, 1, 2]), 'civilians');
  // 2 specials against 1 civilian: the impostors have it.
  assert.equal(checkWin(roles, [2, 3, 4]), 'impostors');
  const shortGame = ['civilian', 'civilian', 'undercover', 'mrwhite'];
  assert.equal(checkWin(shortGame, [0, 2, 3]), 'impostors');
  // 1 special vs 1 civilian is not a civilian win.
  assert.equal(checkWin(roles, [1, 3]), 'impostors');
});

test('scoring awards only the winning side', () => {
  const roles = ['civilian', 'civilian', 'undercover', 'mrwhite'];

  assert.deepEqual(roundDeltas({ roles, alive: [0, 1], winner: 'civilians' }), [
    { index: 0, points: 2 },
    { index: 1, points: 2 },
  ]);

  assert.deepEqual(roundDeltas({ roles, alive: [2], winner: 'impostors' }), [{ index: 2, points: 4 }]);

  assert.deepEqual(
    roundDeltas({ roles, alive: [0, 1], winner: 'mrwhite', mrWhiteIndex: 3 }),
    [{ index: 3, points: 5 }],
  );
});

test('the Mr. White guess is case-insensitive and trimmed', () => {
  assert.equal(guessMatches('  ice cream ', 'Ice Cream'), true);
  assert.equal(guessMatches('Ice  Cream', 'ice cream'), true);
  assert.equal(guessMatches('gelato', 'Ice Cream'), false);
  assert.equal(guessMatches('', ''), false);
});
