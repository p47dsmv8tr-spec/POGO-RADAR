// Loads data: 1) the feed built by the scheduled GitHub Action, 2) live from
// ScrapedDuck in the browser if the feed is missing/stale or on manual refresh,
// 3) the last good copy on this device if everything is offline.
import { SOURCES, fetchJsonArraySource } from '../lib/sources.js';
import { store } from './store.js';

const STALE_MS = 3 * 3600e3;

function sourceMeta(src, status, via) {
  return {
    id: src.id, name: src.name, kind: src.kind, url: src.url, homepage: src.homepage, terms: src.terms,
    ok: !!status?.ok, fetchedAt: status?.fetchedAt ?? null, count: status?.count ?? 0,
    error: status?.error ?? null, via,
  };
}

export async function loadData({ forceLive = false } = {}) {
  let feed = null;
  let feedError = null;
  try {
    const res = await fetch(`data/feed.json?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    feed = await res.json();
    if (!feed?.raw) throw new Error('Feed has an unexpected format');
  } catch (err) {
    feedError = `Scheduled feed not available (${err.message}). Loading directly from sources.`;
  }

  const sources = new Map();
  for (const s of feed?.sources || []) sources.set(s.id, { ...s, via: 'scheduled update' });
  if (!sources.has(SOURCES.officialNews.id)) {
    sources.set(SOURCES.officialNews.id, sourceMeta(SOURCES.officialNews, { ok: false, error: 'Only available through the scheduled update (the site blocks direct browser requests).' }, 'scheduled update'));
  }
  let raw = { events: feed?.raw?.events || [], raids: feed?.raw?.raids || [] };
  let mode = feed ? 'feed' : 'none';

  const stale = !feed || Date.now() - feed.generatedAt > STALE_MS;
  if (forceLive || stale) {
    const [ev, rd] = await Promise.all([
      fetchJsonArraySource(SOURCES.scrapedduckEvents),
      fetchJsonArraySource(SOURCES.scrapedduckRaids),
    ]);
    // Only replace feed data with live data that actually loaded.
    if (ev.status.ok) { raw.events = ev.data; mode = 'live'; }
    if (rd.status.ok) raw.raids = rd.data;
    if (ev.status.ok || !sources.has(SOURCES.scrapedduckEvents.id)) sources.set(SOURCES.scrapedduckEvents.id, sourceMeta(SOURCES.scrapedduckEvents, ev.status, 'live from browser'));
    if (rd.status.ok || !sources.has(SOURCES.scrapedduckRaids.id)) sources.set(SOURCES.scrapedduckRaids.id, sourceMeta(SOURCES.scrapedduckRaids, rd.status, 'live from browser'));
    if (!ev.status.ok && feed) feedError = `Live refresh failed (${ev.status.error}). Showing the scheduled feed instead.`;
  }

  let news = feed?.news || [];
  if (!raw.events.length) {
    const cache = store.getCache();
    if (cache?.raw?.events?.length) {
      return { ...cache, mode: 'cache', warning: 'Offline: showing the last data saved on this device. It may be out of date.' };
    }
  }

  const result = {
    raw, news, mode,
    sources: [...sources.values()],
    generatedAt: feed?.generatedAt ?? null,
    loadedAt: Date.now(),
    warning: feedError,
  };
  if (raw.events.length) store.setCache(result);
  return result;
}
