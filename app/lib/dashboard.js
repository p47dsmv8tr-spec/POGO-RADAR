// Pure functions that turn normalized data + watchlist into dashboard sections.
import { eventPhase } from './time.js';
import { matchEvent, matchItem } from './watchlist.js';
import { parsePokemonName, formMatches } from './pokemon.js';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const RAID_TIERS = ['five', 'mega', 'shadow', 'raid-hour', 'raid-day', 'max'];

export function annotate(events, watchlist, now = Date.now()) {
  return events.map((ev) => {
    const startMs = ev.start?.ms ?? null;
    const endMs = ev.end?.ms ?? null;
    const matches = matchEvent(watchlist, ev);
    return {
      ...ev,
      startMs, endMs,
      phase: eventPhase(startMs, endMs, now),
      matches,
      exactMatches: matches.filter((m) => m.level === 'exact'),
      relatedMatches: matches.filter((m) => m.level === 'related'),
    };
  });
}

const byStart = (a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity);
const byEnd = (a, b) => (a.endMs ?? Infinity) - (b.endMs ?? Infinity);
const notEnded = (e) => e.phase !== 'ended';
const watchFirst = (a, b) => (b.exactMatches.length > 0) - (a.exactMatches.length > 0);

export function isImportantReward(e) {
  const f = e.flags || {};
  return f.eliteTM || f.eliteFastTM || f.eliteChargedTM || f.rareCandyXL || f.featuredAttack ||
    e.category === 'community-day' || (e.category === 'gbl' && f.masterLeague) ||
    e.promoCodes?.length > 0 || f.legendaryTier;
}

export function buildDashboard(annotated, now = Date.now()) {
  const active = annotated.filter(notEnded);
  return {
    watchHits: active.filter((e) => e.exactMatches.length).sort(byStart),
    watchRelated: active.filter((e) => !e.exactMatches.length && e.relatedMatches.length).sort(byStart),
    live: active.filter((e) => e.phase === 'live').sort((a, b) => watchFirst(a, b) || byEnd(a, b)),
    endingSoon: active.filter((e) => e.phase === 'live' && e.endMs != null && e.endMs - now <= 48 * HOUR).sort(byEnd),
    upcomingRaids: active.filter((e) => e.category === 'raids' || RAID_TIERS.includes(e.raidTier))
      .sort((a, b) => watchFirst(a, b) || byStart(a, b)).slice(0, 8),
    rewards: active.filter(isImportantReward).sort((a, b) => watchFirst(a, b) || byStart(a, b)).slice(0, 8),
    next: active.filter((e) => e.phase === 'upcoming' && e.startMs - now <= 14 * DAY).sort(byStart).slice(0, 10),
  };
}

/** Current raid bosses (raids.json) enriched with the matching scheduled raid event and watch matches. */
export function enrichCurrentRaids(raids, annotated, watchlist) {
  const raidEvents = annotated.filter((e) => e.category === 'raids' && e.bosses?.length && e.phase === 'live');
  return raids.map((r) => {
    const ev = raidEvents.find((e) => e.bosses.some((b) => {
      const p = b.parsed || parsePokemonName(b.name);
      return p.base === r.parsed.base && (p.form || null) === (r.parsed.form || null) && !!p.shadow === !!r.parsed.shadow;
    }));
    const pseudo = { bosses: [{ name: r.name, parsed: r.parsed }], searchText: r.name.toLowerCase() };
    const matches = watchlist.filter((w) => w.kind === 'pokemon').map((w) => matchItem(w, pseudo)).filter(Boolean);
    return { ...r, event: ev || null, endMs: ev?.endMs ?? null, matches, exactMatches: matches.filter((m) => m.level === 'exact') };
  });
}

/** Per watch item: what's known now (exact + related matches, earliest first). */
export function watchStatus(watchlist, annotated, currentRaids = []) {
  return watchlist.map((w) => {
    const hits = annotated.filter(notEnded)
      .map((e) => ({ e, m: e.matches.find((m) => m.itemId === w.id) }))
      .filter((x) => x.m)
      .sort((a, b) => (a.m.level === 'exact' ? 0 : 1) - (b.m.level === 'exact' ? 0 : 1) || byStart(a.e, b.e));
    const inRaidsNow = w.kind === 'pokemon'
      ? currentRaids.filter((r) => r.parsed.base.toLowerCase() === w.name.toLowerCase())
        .map((r) => ({ raid: r, exact: formMatches(w.form, r.parsed.form) && (!w.shadow || r.parsed.shadow) }))
      : [];
    return { item: w, hits, inRaidsNow, found: hits.some((h) => h.m.level === 'exact') || inRaidsNow.some((r) => r.exact) };
  });
}

/**
 * Notification-ready alerts. A future push service only needs to deliver these.
 * Each alert has a stable id so it is never sent twice.
 */
export function computeAlerts(annotated, now = Date.now(), { startLeadMs = 24 * HOUR, endLeadMs = 24 * HOUR } = {}) {
  const alerts = [];
  for (const e of annotated) {
    if (!e.exactMatches?.length || e.phase === 'ended') continue;
    const what = e.exactMatches.map((m) => m.label).join(', ');
    if (e.phase === 'upcoming' && e.startMs != null && e.startMs - now <= startLeadMs) {
      alerts.push({ id: `${e.id}|start`, kind: 'starting-soon', fireAt: Math.max(now, e.startMs - startLeadMs), title: `Soon: ${e.name}`, body: `Watchlist: ${what}`, url: e.source.url });
    }
    if (e.phase === 'live' && e.endMs != null && e.endMs - now <= endLeadMs) {
      alerts.push({ id: `${e.id}|end`, kind: 'ending-soon', fireAt: now, title: `Ending soon: ${e.name}`, body: `Watchlist: ${what}`, url: e.source.url });
    }
    if (e.phase === 'upcoming' || e.phase === 'unscheduled') {
      alerts.push({ id: `${e.id}|announced`, kind: 'announced', fireAt: now, title: `Announced: ${e.name}`, body: `Watchlist: ${what}`, url: e.source.url });
    }
  }
  return alerts;
}
