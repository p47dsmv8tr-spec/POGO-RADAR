// Local persistence (this device only). Every access is guarded: storage can be
// unavailable (private browsing, blocked site data) and the app must still work.
import { DEFAULT_WATCHLIST } from '../lib/watchlist.js';

const KEYS = {
  watchlist: 'pogo-radar.watchlist.v1',
  cache: 'pogo-radar.cache.v1',
  seenAlerts: 'pogo-radar.seen-alerts.v1',
  prefs: 'pogo-radar.prefs.v1',
};

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const store = {
  getWatchlist: () => {
    const list = read(KEYS.watchlist, null);
    return Array.isArray(list) ? list : DEFAULT_WATCHLIST.map((w) => ({ ...w }));
  },
  setWatchlist: (list) => write(KEYS.watchlist, list),
  resetWatchlist: () => write(KEYS.watchlist, DEFAULT_WATCHLIST),
  getCache: () => read(KEYS.cache, null),
  setCache: (data) => write(KEYS.cache, data),
  getSeenAlerts: () => new Set(read(KEYS.seenAlerts, [])),
  setSeenAlerts: (set) => write(KEYS.seenAlerts, [...set].slice(-300)),
  getPrefs: () => read(KEYS.prefs, {}),
  setPrefs: (p) => write(KEYS.prefs, p),
};
