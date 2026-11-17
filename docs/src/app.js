import { store, DEFAULT_SETTINGS } from './store.js';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  categoryNames,
  categoryCounts,
  buildPool,
  drawPair,
  unusedPairs,
} from './words.js';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  ROLE_LABELS,
  allowedUndercoverCounts,
  mrWhiteAvailable,
  setupIssue,
  assignRoles,
  speakingOrder,
  checkWin,
  roundDeltas,
  guessMatches,
} from './game.js';

const app = document.getElementById('app');

const state = {
  words: null,
  error: null,
  screen: 'lobby',
  players: [],
  scores: {},
  settings: { ...DEFAULT_SETTINGS },
  round: null,
  pendingElimination: null,
  timerHandle: null,
  timerLeft: 0,
};

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `p${Math.random().toString(36).slice(2, 10)}`);

/* ------------------------------------------------------------------ boot -- */

boot();

async function boot() {
  state.scores = store.getScores();
  state.players = store.getPlayers();
  if (state.players.length < MIN_PLAYERS) state.players = seedPlayers();

  try {
    // The standalone build inlines the words, because fetch() is blocked on file://.
    if (globalThis.__UNDERCOVER_WORDS__) {
      state.words = globalThis.__UNDERCOVER_WORDS__;
    } else {
      const response = await fetch('words.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.words = await response.json();
    }
  } catch (error) {
    state.error = String(error.message ?? error);
  }

  normalizeSettings();
  render();
}

function seedPlayers() {
  const seeded = Array.from({ length: MIN_PLAYERS }, (_, i) => ({ id: uid(), name: `Player ${i + 1}` }));
  store.setPlayers(seeded);
  return seeded;
}

function normalizeSettings() {
  const settings = store.getSettings();
  const names = state.words ? categoryNames(state.words) : [];

  let categories = Array.isArray(settings.categories) ? settings.categories.filter((name) => names.includes(name)) : null;
  if (categories && !categories.length) categories = null;

  const difficulty = ['all', ...DIFFICULTIES].includes(settings.difficulty) ? settings.difficulty : 'all';
  const allowed = allowedUndercoverCounts(state.players.length);
  const undercoverCount = allowed.includes(settings.undercoverCount) ? settings.undercoverCount : allowed[0];
  const includeMrWhite = Boolean(settings.includeMrWhite) && mrWhiteAvailable(state.players.length);

  state.settings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    categories,
    difficulty,
    includeMrWhite,
    undercoverCount,
  };
  persistSettings();
}

function persistSettings() {
  store.setSettings(state.settings);
}

function selectedCategories() {
  const names = state.words ? categoryNames(state.words) : [];
  const chosen = state.settings.categories;
  return Array.isArray(chosen) && chosen.length ? chosen.filter((name) => names.includes(name)) : names;
}

/* ---------------------------------------------------------------- screens -- */

function render() {
  if (state.timerHandle) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }

  if (state.error) {
    app.innerHTML = `
      <div class="screen screen--center">
        <div class="empty-state">
          <h1>Could not load words</h1>
          <p class="muted">${esc(state.error)}</p>
          <p class="muted">Serve the folder over http with <code>npm run dev</code> instead of opening <code>index.html</code> directly.</p>
        </div>
      </div>`;
    return;
  }

  const screens = {
    lobby,
    pass: passScreen,
    reveal: revealScreen,
    discussion: discussionScreen,
    voting: votingScreen,
    elimination: eliminationScreen,
    roundOver: roundOverScreen,
  };

  (screens[state.screen] ?? lobby)();
}

const shell = (body, modifier = '') => `<div class="screen${modifier ? ` screen--${modifier}` : ''}">${body}</div>`;

/* ----------------------------------------------------------------- lobby -- */

function lobby() {
  const words = state.words;
  const names = categoryNames(words);
  const difficulty = state.settings.difficulty;
  const selected = selectedCategories();
  const counts = categoryCounts(words, difficulty);
  const pool = buildPool(words, { categories: selected, difficulty });
  const used = store.getUsedWordIds();
  const left = unusedPairs(pool, used).length;
  const allSelected = selected.length === names.length;

  const playerCount = state.players.length;
  const issue = setupIssue({
    playerCount,
    includeMrWhite: state.settings.includeMrWhite,
    undercoverCount: state.settings.undercoverCount,
  });
  const undercoverOptions = allowedUndercoverCounts(playerCount);
  const mwAvailable = mrWhiteAvailable(playerCount);

  const playerRows = state.players
    .map(
      (player, index) => `
        <li class="player-row">
          <span class="seat">${index + 1}</span>
          <input class="name-input" data-name="${index}" value="${esc(player.name)}" maxlength="16" aria-label="Player ${index + 1} name" />
          <span class="player-score">${state.scores[player.id] ?? 0}<small>pts</small></span>
          <button class="icon-btn" data-remove="${index}" aria-label="Remove ${esc(player.name)}" ${playerCount <= MIN_PLAYERS ? 'disabled' : ''}>×</button>
        </li>`,
    )
    .join('');

  const chips = names
    .map((name) => {
      const on = selected.includes(name);
      const count = counts[name] ?? 0;
      return `<button class="chip ${on ? 'is-on' : ''}" data-category="${esc(name)}" aria-pressed="${on}" ${count === 0 ? 'disabled' : ''}>
        <span>${esc(name)}</span><em>${count}</em>
      </button>`;
    })
    .join('');

  const difficultyButtons = ['all', ...DIFFICULTIES]
    .map((level) => {
      const count = level === 'all' ? poolCountFor('all') : poolCountFor(level);
      return `<button data-difficulty="${level}" class="${difficulty === level ? 'is-active' : ''}" aria-pressed="${difficulty === level}">
        ${DIFFICULTY_LABELS[level]}<em>${count}</em>
      </button>`;
    })
    .join('');

  app.innerHTML = shell(`
    <header class="topbar">
      <div>
        <p class="eyebrow">Pass &amp; play</p>
        <h1>Undercover<span class="accent">.</span></h1>
      </div>
      <div class="pool-badge ${left === 0 ? 'is-empty' : ''}">
        <strong>${left}</strong>
        <span>${left === 0 ? 'resets next round' : 'words left'}</span>
      </div>
    </header>

    <section class="card">
      <div class="card-head">
        <h2>Players</h2>
        <span class="muted">${playerCount}/${MAX_PLAYERS}</span>
      </div>
      <ul class="player-list">${playerRows}</ul>
      <button class="btn btn-ghost" id="add-player" ${playerCount >= MAX_PLAYERS ? 'disabled' : ''}>+ Add player</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>Roles</h2></div>
      <label class="switch-row ${mwAvailable ? '' : 'is-disabled'}">
        <span class="switch-copy">
          <strong>Mr. White</strong>
          <small>${mwAvailable ? 'Sees no word, guesses it when caught' : `Needs ${MIN_PLAYERS + 1}+ players`}</small>
        </span>
        <input type="checkbox" id="mr-white" ${state.settings.includeMrWhite ? 'checked' : ''} ${mwAvailable ? '' : 'disabled'} />
      </label>

      <div class="field">
        <span class="field-label">Undercover count</span>
        <div class="segmented" role="group" aria-label="Undercover count">
          ${undercoverOptions
            .map(
              (count) =>
                `<button data-undercover="${count}" class="${state.settings.undercoverCount === count ? 'is-active' : ''}" aria-pressed="${state.settings.undercoverCount === count}">${count}</button>`,
            )
            .join('')}
        </div>
      </div>

      <div class="field field--row">
        <label class="field-label" for="timer">Discussion timer</label>
        <select id="timer" class="select">
          <option value="0" ${state.settings.timerSeconds === 0 ? 'selected' : ''}>Off</option>
          <option value="120" ${state.settings.timerSeconds === 120 ? 'selected' : ''}>2 min</option>
          <option value="180" ${state.settings.timerSeconds === 180 ? 'selected' : ''}>3 min</option>
        </select>
      </div>

      ${issue ? `<p class="warn">${esc(issue)}</p>` : ''}
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Difficulty</h2>
        <span class="muted">${left} unused</span>
      </div>
      <div class="segmented segmented--wide" role="group" aria-label="Difficulty">${difficultyButtons}</div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Categories</h2>
        <button class="link" id="toggle-all">${allSelected ? 'Clear all' : 'Select all'}</button>
      </div>
      <div class="chips">${chips}</div>
    </section>

    <footer class="dock">
      <button class="btn btn-primary btn-lg" id="start-round" ${issue ? 'disabled' : ''}>Start round</button>
      <p class="dock-note">${selected.length} ${selected.length === 1 ? 'category' : 'categories'} · ${left} ${left === 1 ? 'word' : 'words'} in rotation</p>
    </footer>
  `);

  bindLobby();
}

function poolCountFor(difficulty) {
  if (!state.words) return 0;
  return buildPool(state.words, { categories: selectedCategories(), difficulty }).length;
}

function bindLobby() {
  app.querySelectorAll('[data-name]').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.name);
      state.players[index].name = input.value;
      store.setPlayers(state.players);
    });
    input.addEventListener('blur', () => {
      const index = Number(input.dataset.name);
      const trimmed = input.value.trim() || `Player ${index + 1}`;
      state.players[index].name = trimmed;
      input.value = trimmed;
      store.setPlayers(state.players);
    });
  });

  app.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.remove);
      const [removed] = state.players.splice(index, 1);
      if (removed) {
        delete state.scores[removed.id];
        store.setScores(state.scores);
      }
      store.setPlayers(state.players);
      normalizeSettings();
      render();
    });
  });

  app.querySelector('#add-player')?.addEventListener('click', () => {
    if (state.players.length >= MAX_PLAYERS) return;
    state.players.push({ id: uid(), name: `Player ${state.players.length + 1}` });
    store.setPlayers(state.players);
    normalizeSettings();
    render();
  });

  app.querySelector('#mr-white')?.addEventListener('change', (event) => {
    state.settings.includeMrWhite = event.target.checked;
    persistSettings();
    render();
  });

  app.querySelectorAll('[data-undercover]').forEach((button) => {
    button.addEventListener('click', () => {
      state.settings.undercoverCount = Number(button.dataset.undercover);
      persistSettings();
      render();
    });
  });

  app.querySelector('#timer')?.addEventListener('change', (event) => {
    state.settings.timerSeconds = Number(event.target.value);
    persistSettings();
  });

  app.querySelectorAll('[data-difficulty]').forEach((button) => {
    button.addEventListener('click', () => {
      state.settings.difficulty = button.dataset.difficulty;
      persistSettings();
      render();
    });
  });

  app.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.category;
      const names = categoryNames(state.words);
      const current = selectedCategories();
      const next = current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name];
      // Keep the JSON order so the selection stays stable between renders.
      state.settings.categories = next.length === names.length ? null : names.filter((entry) => next.includes(entry));
      persistSettings();
      render();
    });
  });

  app.querySelector('#toggle-all')?.addEventListener('click', () => {
    state.settings.categories = selectedCategories().length === categoryNames(state.words).length ? [] : null;
    if (Array.isArray(state.settings.categories) && !state.settings.categories.length) {
      // Empty selection is illegal; fall back to everything so the button never traps the player.
      state.settings.categories = null;
    }
    persistSettings();
    render();
  });

  app.querySelector('#start-round')?.addEventListener('click', startRound);
}

/* ----------------------------------------------------------------- round -- */

function startRound() {
  const playerCount = state.players.length;
  const issue = setupIssue({
    playerCount,
    includeMrWhite: state.settings.includeMrWhite,
    undercoverCount: state.settings.undercoverCount,
  });
  if (issue) return;

  const pool = buildPool(state.words, {
    categories: selectedCategories(),
    difficulty: state.settings.difficulty,
  });
  if (!pool.length) return;

  const usedIds = store.getUsedWordIds();
  const draw = drawPair(pool, usedIds);
  store.setUsedWordIds(draw.usedIds);

  const roles = assignRoles(
    playerCount,
    { includeMrWhite: state.settings.includeMrWhite, undercoverCount: state.settings.undercoverCount },
    Math.random,
  );

  state.round = {
    pair: draw.pair,
    origin: draw.pick,
    swapped: draw.swapped,
    reset: draw.reset,
    roles,
    order: speakingOrder(playerCount, roles),
    revealIndex: 0,
    revealedOnce: false,
    alive: [...Array(playerCount).keys()],
    eliminated: [],
    awaitingGuess: false,
    guess: '',
    guessCorrect: false,
    winner: null,
    deltas: [],
  };
  state.timerLeft = state.settings.timerSeconds;
  state.pendingElimination = null;
  state.screen = 'pass';
  render();
}

function passScreen() {
  const round = state.round;
  const player = state.players[round.revealIndex];
  const total = state.players.length;

  app.innerHTML = shell(`
    <div class="stage">
      <p class="eyebrow">Card ${round.revealIndex + 1} of ${total}</p>
      <h2 class="stage-title">Pass the phone to<br /><span class="accent">${esc(player.name)}</span></h2>
      <p class="muted">Everyone else, look away.</p>
    </div>
    <footer class="dock">
      <button class="btn btn-primary btn-lg" id="im-ready">I am ${esc(player.name)}</button>
    </footer>
  `);

  app.querySelector('#im-ready').addEventListener('click', () => {
    state.screen = 'reveal';
    state.round.revealedOnce = false;
    render();
  });
}

function revealScreen() {
  const round = state.round;
  const seat = round.revealIndex;
  const player = state.players[seat];
  const role = round.roles[seat];
  const isMrWhite = role === 'mrwhite';
  const word = role === 'undercover' ? round.pair.impostor : round.pair.main;
  const isLast = seat === state.players.length - 1;

  const secret = isMrWhite
    ? `<p class="mw-flag">You are MR. WHITE</p>
       <p class="mw-copy">No word for you. Blend in, and if you get voted out, guess the secret word.</p>`
    : `<p class="word">${esc(word)}</p>
       <p class="word-note">Don't say it out loud.</p>`;

  app.innerHTML = shell(`
    <div class="stage stage--tight">
      <p class="eyebrow">${esc(player.name)} · ${seat + 1} of ${state.players.length}</p>
    </div>

    <div class="hold-card" id="hold" tabindex="0" role="button" aria-label="Press and hold to reveal your card">
      <div class="hold-idle">
        <span class="hold-icon">◉</span>
        <strong>Press &amp; hold</strong>
        <small>Release to hide</small>
      </div>
      <div class="hold-word">${secret}</div>
    </div>

    <footer class="dock">
      <button class="btn btn-primary btn-lg" id="next-player" disabled>${isLast ? 'Start discussion' : 'Next player'}</button>
    </footer>
  `, 'reveal');

  const hold = app.querySelector('#hold');
  const next = app.querySelector('#next-player');

  const show = () => {
    hold.classList.add('is-revealed');
    next.disabled = false;
    state.round.revealedOnce = true;
  };
  const hide = () => hold.classList.remove('is-revealed');

  hold.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    try {
      hold.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; the reveal still works.
    }
    show();
  });
  ['pointerup', 'pointercancel'].forEach((type) => hold.addEventListener(type, hide));
  hold.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      show();
    }
  });
  hold.addEventListener('keyup', hide);
  hold.addEventListener('blur', hide);

  next.addEventListener('click', () => {
    if (!state.round.revealedOnce) return;
    hide();
    if (seat + 1 < state.players.length) {
      state.round.revealIndex = seat + 1;
      state.round.revealedOnce = false;
      state.screen = 'pass';
    } else {
      state.screen = 'discussion';
      state.timerLeft = state.settings.timerSeconds;
    }
    render();
  });
}

function eliminationSummary() {
  const round = state.round;
  if (!round.eliminated.length) return '';
  return `<div class="vote-history">
    ${round.eliminated
      .map((seat) => `<span class="tag tag--${round.roles[seat]}">${esc(state.players[seat].name)} · ${ROLE_LABELS[round.roles[seat]]}</span>`)
      .join('')}
  </div>`;
}

function discussionScreen() {
  const round = state.round;
  const names = round.order.map((seat) => state.players[seat].name);
  const timerOn = state.settings.timerSeconds > 0;

  app.innerHTML = shell(`
    <div class="stage stage--tight">
      <p class="eyebrow">Clue round ${round.eliminated.length + 1}</p>
      <h2 class="stage-title">Speaking order</h2>
      <p class="muted">Mr. White never goes first.</p>
    </div>

    <ol class="order-list">
      ${names
        .map(
          (name, index) => `<li class="${round.alive.includes(round.order[index]) ? '' : 'is-out'}">
            <span class="order-index">${index + 1}</span>
            <span>${esc(name)}</span>
            ${round.alive.includes(round.order[index]) ? '' : '<em class="out-flag">out</em>'}
          </li>`,
        )
        .join('')}
    </ol>

    ${timerOn ? `<div class="clock" id="clock">${formatClock(state.timerLeft)}</div>` : ''}
    ${eliminationSummary()}

    <footer class="dock">
      <button class="btn btn-primary btn-lg" id="to-voting">Go to voting</button>
    </footer>
  `);

  if (timerOn) startClock();

  app.querySelector('#to-voting').addEventListener('click', () => {
    state.pendingElimination = null;
    state.screen = 'voting';
    render();
  });
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function startClock() {
  const clock = app.querySelector('#clock');
  if (!clock) return;
  let left = state.timerLeft;
  clock.textContent = formatClock(left);

  state.timerHandle = setInterval(() => {
    left -= 1;
    state.timerLeft = Math.max(0, left);
    const node = app.querySelector('#clock');
    if (!node) return;
    node.textContent = formatClock(left);
    if (left <= 0) {
      node.classList.add('is-done');
      node.textContent = "Time's up";
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }
  }, 1000);
}

function votingScreen() {
  const round = state.round;
  const alive = round.alive;

  app.innerHTML = shell(`
    <div class="stage stage--tight">
      <p class="eyebrow">Who gets voted out?</p>
      <h2 class="stage-title">Pick one player</h2>
    </div>

    <div class="vote-grid">
      ${alive
        .map((seat) => {
          const active = state.pendingElimination === seat;
          return `<button class="vote-btn ${active ? 'is-active' : ''}" data-vote="${seat}" aria-pressed="${active}">
            <span class="avatar">${esc(state.players[seat].name.slice(0, 1).toUpperCase())}</span>
            <span>${esc(state.players[seat].name)}</span>
          </button>`;
        })
        .join('')}
    </div>

    ${
      state.pendingElimination !== null
        ? `<div class="confirm">
            <p>Eliminate <strong>${esc(state.players[state.pendingElimination].name)}</strong>?</p>
            <div class="confirm-actions">
              <button class="btn btn-danger" id="confirm-vote">Yes, eliminate</button>
              <button class="btn btn-ghost" id="cancel-vote">Cancel</button>
            </div>
          </div>`
        : ''
    }

    ${eliminationSummary()}

    <footer class="dock">
      <button class="btn btn-ghost" id="skip-vote">Skip this vote</button>
    </footer>
  `);

  app.querySelectorAll('[data-vote]').forEach((button) => {
    button.addEventListener('click', () => {
      const seat = Number(button.dataset.vote);
      state.pendingElimination = state.pendingElimination === seat ? null : seat;
      render();
    });
  });

  app.querySelector('#confirm-vote')?.addEventListener('click', () => eliminate(state.pendingElimination));

  app.querySelector('#cancel-vote')?.addEventListener('click', () => {
    state.pendingElimination = null;
    render();
  });

  app.querySelector('#skip-vote')?.addEventListener('click', () => {
    state.pendingElimination = null;
    state.timerLeft = state.settings.timerSeconds;
    state.screen = 'discussion';
    render();
  });
}

function eliminate(seat) {
  if (seat === null || seat === undefined || !state.round) return;
  const round = state.round;
  if (!round.alive.includes(seat)) return;

  round.alive = round.alive.filter((entry) => entry !== seat);
  round.eliminated.push(seat);
  state.pendingElimination = null;

  const role = round.roles[seat];
  if (role === 'mrwhite') {
    round.awaitingGuess = true;
    round.guess = '';
  } else {
    round.awaitingGuess = false;
    const winner = checkWin(round.roles, round.alive);
    if (winner) conclude(winner);
  }

  state.screen = 'elimination';
  render();
}

function conclude(winner) {
  const round = state.round;
  round.winner = winner;
  round.deltas = roundDeltas({
    roles: round.roles,
    alive: round.alive,
    winner,
    mrWhiteIndex: round.roles.indexOf('mrwhite'),
  });

  for (const delta of round.deltas) {
    const player = state.players[delta.index];
    if (!player) continue;
    state.scores[player.id] = (state.scores[player.id] ?? 0) + delta.points;
  }
  store.setScores(state.scores);
}

function eliminationScreen() {
  const round = state.round;
  const seat = round.eliminated[round.eliminated.length - 1];
  const role = round.roles[seat];
  const player = state.players[seat];

  const guessForm = round.awaitingGuess
    ? `<form class="guess" id="guess-form">
         <label class="field-label" for="guess-input">Mr. White, what was the secret word?</label>
         <input class="input" id="guess-input" name="guess" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Type your guess" />
         <button class="btn btn-primary" type="submit">Lock in guess</button>
         <p class="muted small">Exact word wins 5 points.</p>
       </form>`
    : '';

  const outcome = round.winner
    ? `<div class="outcome">
         <p class="outcome-title">${winnerHeadline(round.winner)}</p>
         <button class="btn btn-primary btn-lg" id="to-results">See results</button>
       </div>`
    : `<div class="outcome">
         <p class="outcome-title">Not over yet</p>
         <p class="muted">The game continues with ${round.alive.length} players.</p>
         <button class="btn btn-primary btn-lg" id="next-clue-round">Next clue round</button>
       </div>`;

  app.innerHTML = shell(`
    <div class="stage stage--tight">
      <p class="eyebrow">Eliminated</p>
      <h2 class="stage-title">${esc(player.name)} was</h2>
    </div>

    <div class="reveal-card reveal-card--${role}">
      <p class="role-flag">${ROLE_LABELS[role]}</p>
      <p class="muted">${role === 'mrwhite' ? 'No word, all nerve.' : `Their word: <strong>${esc(role === 'undercover' ? round.pair.impostor : round.pair.main)}</strong>`}</p>
    </div>

    ${guessForm}
    ${outcome}
  `);

  app.querySelector('#guess-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = app.querySelector('#guess-input').value;
    round.guess = value;
    round.guessCorrect = guessMatches(value, round.pair.main);

    if (round.guessCorrect) {
      round.awaitingGuess = false;
      conclude('mrwhite');
    } else {
      round.awaitingGuess = false;
      const winner = checkWin(round.roles, round.alive);
      if (winner) conclude(winner);
    }
    render();
  });

  app.querySelector('#to-results')?.addEventListener('click', () => {
    state.screen = 'roundOver';
    render();
  });

  app.querySelector('#next-clue-round')?.addEventListener('click', () => {
    state.timerLeft = state.settings.timerSeconds;
    state.screen = 'discussion';
    render();
  });
}

function winnerHeadline(winner) {
  if (winner === 'civilians') return 'Civilians win';
  if (winner === 'impostors') return 'Impostors win';
  return 'Mr. White wins';
}

function roundOverScreen() {
  const round = state.round;
  const pointsBySeat = new Map(round.deltas.map((delta) => [delta.index, delta.points]));
  const totals = [...state.players]
    .map((player) => ({ name: player.name, score: state.scores[player.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  app.innerHTML = shell(`
    <div class="stage stage--tight">
      <p class="eyebrow">Round over</p>
      <h2 class="stage-title">${winnerHeadline(round.winner)}</h2>
      <p class="muted">${round.winner === 'mrwhite' ? `Guessed “${esc(round.guess.trim())}” — spot on.` : 'Roles are public now.'}</p>
    </div>

    <section class="card card--words">
      <div class="word-pair">
        <div><small>Main word</small><strong>${esc(round.pair.main)}</strong></div>
        <div class="word-divider"></div>
        <div><small>Impostor word</small><strong>${esc(round.pair.impostor)}</strong></div>
      </div>
      <p class="muted small">${esc(round.pair.category)} · ${round.pair.difficulty}${round.swapped ? ' · swapped' : ''}</p>
    </section>

    <ul class="result-list">
      ${state.players
        .map((player, seat) => {
          const points = pointsBySeat.get(seat) ?? 0;
          return `<li>
            <span class="role-dot role-dot--${round.roles[seat]}"></span>
            <span class="result-name">${esc(player.name)}</span>
            <span class="result-role">${ROLE_LABELS[round.roles[seat]]}</span>
            <span class="result-points ${points ? 'is-scored' : ''}">${points ? `+${points}` : '—'}</span>
          </li>`;
        })
        .join('')}
    </ul>

    <section class="card">
      <div class="card-head"><h2>Scoreboard</h2></div>
      <ol class="scoreboard">
        ${totals.map((row, index) => `<li><span class="rank">${index + 1}</span><span>${esc(row.name)}</span><strong>${row.score}</strong></li>`).join('')}
      </ol>
    </section>

    <footer class="dock">
      <button class="btn btn-primary btn-lg" id="play-again">Play next round</button>
      <button class="btn btn-ghost" id="back-lobby">Back to lobby</button>
    </footer>
  `);

  app.querySelector('#play-again').addEventListener('click', startRound);
  app.querySelector('#back-lobby').addEventListener('click', () => {
    state.round = null;
    state.screen = 'lobby';
    render();
  });
}
