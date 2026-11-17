// localStorage-backed persistence.
//
// Everything lives under the "ucw." namespace:
//   ucw.players    [{ id, name }]
//   ucw.scores     { [playerId]: number }
//   ucw.settings   { categories, difficulty, includeMrWhite, undercoverCount, timerSeconds }
//   ucw.usedWordIds [ "fd3", "pf1", ... ]
//
// The backend is injectable so the draw/tests can run without a browser.

export const KEYS = {
  players: 'players',
  scores: 'scores',
  settings: 'settings',
  usedWordIds: 'usedWordIds',
};

export const DEFAULT_SETTINGS = {
  categories: null, // null means "every category in words.json"
  difficulty: 'all', // 'all' | 'easy' | 'medium' | 'hard'
  includeMrWhite: true,
  undercoverCount: 1,
  timerSeconds: 0,
};

function memoryBackend() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

export function createStore(backend) {
  const base = `ucw.`;

  function read(key, fallback) {
    if (!backend) return fallback;
    try {
      const raw = backend.getItem(base + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    if (!backend) return;
    try {
      backend.setItem(base + key, JSON.stringify(value));
    } catch {
      // Quota or private mode: the game still works, it just forgets.
    }
  }

  return {
    getPlayers() {
      const players = read(KEYS.players, []);
      return Array.isArray(players) ? players.filter((p) => p && typeof p.name === 'string') : [];
    },
    setPlayers(players) {
      write(KEYS.players, players);
    },
    getScores() {
      const scores = read(KEYS.scores, {});
      return scores && typeof scores === 'object' ? scores : {};
    },
    setScores(scores) {
      write(KEYS.scores, scores);
    },
    getSettings() {
      const settings = read(KEYS.settings, {});
      return { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) };
    },
    setSettings(settings) {
      write(KEYS.settings, settings);
    },
    /** Ids of pairs already drawn on this device. */
    getUsedWordIds() {
      const ids = read(KEYS.usedWordIds, []);
      return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
    },
    setUsedWordIds(ids) {
      write(KEYS.usedWordIds, [...new Set(ids)]);
    },
    reset() {
      Object.values(KEYS).forEach((key) => backend?.removeItem(base + key));
    },
  };
}

function browserBackend() {
  try {
    const probe = '__ucw_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export const store = createStore(typeof globalThis.localStorage === 'undefined' ? memoryBackend() : browserBackend());
