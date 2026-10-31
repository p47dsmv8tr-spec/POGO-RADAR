import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeScrapedDuckEvent, normalizeScrapedDuckRaids, rewardLabel, costInfo } from '../app/lib/normalize.js';
import { annotate, buildDashboard, computeAlerts, enrichCurrentRaids, watchStatus } from '../app/lib/dashboard.js';
import { DEFAULT_WATCHLIST } from '../app/lib/watchlist.js';

// Fixtures are a snapshot of real ScrapedDuck data, used ONLY by tests.
const rawEvents = JSON.parse(readFileSync(new URL('./fixtures/scrapedduck-events.json', import.meta.url)));
const rawRaids = JSON.parse(readFileSync(new URL('./fixtures/scrapedduck-raids.json', import.meta.url)));
const events = rawEvents.map((e) => normalizeScrapedDuckEvent(e, { fetchedAt: 1 }));
const byId = (id) => events.find((e) => e.id === `sd:${id}`);

test('every event keeps its source URL and fetch time', () => {
  for (const e of events) {
    assert.match(e.source.url, /^https:\/\//);
    assert.equal(e.source.fetchedAt, 1);
  }
});

test('events without dates are unverified, never given invented dates', () => {
  const palkia = byId('palkia-in-5-star-raid-battles-october-2026');
  assert.equal(palkia.start, null);
  assert.equal(palkia.verification, 'unverified');
  assert.ok(palkia.notes.some((n) => /not listed/.test(n)));
});

test('raid events: tier, bosses, shiny and shadow', () => {
  const g = byId('giratina-origin-forme-in-5-star-raid-battles-october-2026') || events.find((e) => /Giratina \(Origin Forme\) in 5-star/.test(e.name));
  assert.equal(g.raidTier, 'five');
  assert.equal(g.bosses[0].parsed.form, 'origin');
  assert.equal(g.bosses[0].shiny, true);
  assert.equal(g.verification, 'confirmed');
  const sh = events.find((e) => e.raidTier === 'shadow');
  assert.ok(sh.bosses.every((b) => b.parsed.shadow), 'shadow raid bosses are marked shadow');
});

test('Community Day: bonuses, research rewards from image names, and Rare Candy XL flag', () => {
  const cd = byId('november-communityday2026');
  assert.equal(cd.category, 'community-day');
  assert.ok(cd.bonuses.length > 3);
  assert.ok(cd.rewards.includes('Rare Candy XL ×1'));
  assert.equal(cd.flags.rareCandyXL, true);
  assert.equal(cd.flags.eliteTM, false, 'plain Charged TM is not an Elite TM');
  assert.equal(cd.cost.label, 'Free');
  assert.equal(new Date(cd.start.ms).toISOString(), '2026-11-21T13:00:00.000Z');
});

test('GO Battle League uses global UTC times and flags Master League', () => {
  const gbl = events.find((e) => e.category === 'gbl');
  assert.equal(gbl.start.isLocalTime, false);
  assert.ok(gbl.flags.masterLeague);
});

test('reward label recovers item names from image URLs', () => {
  assert.equal(rewardLabel({ text: '×1', image: 'https://x/items/Rare%20Candy%20XL.png' }), 'Rare Candy XL ×1');
  assert.equal(rewardLabel({ text: 'Ultra Ball ×20', image: 'https://x/items/Ultra%20Ball.png' }), 'Ultra Ball ×20');
  assert.equal(rewardLabel({ text: '×5', image: 'https://x/candy/xl/624.png' }), 'Candy XL ×5');
  assert.equal(rewardLabel({ text: 'Pawniard', image: 'https://x/pokemon_icons_crop/x.png' }), 'Pawniard');
});

test('cost labels say what they are based on', () => {
  assert.equal(costInfo('tour-fest', 'pokemon-go-tour', '').tone, 'paid');
  assert.equal(costInfo('event', 'event', 'buy a ticket for us$5').tone, 'mixed');
  assert.equal(costInfo('event', 'event', '').label, 'Not stated');
});

test('dashboard puts watchlist matches first and flags regular Palkia as related', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const ann = annotate(events, DEFAULT_WATCHLIST, now);
  const dash = buildDashboard(ann, now);
  assert.ok(dash.watchHits.some((e) => e.id === 'sd:november-communityday2026'), 'Rare Candy XL reward found');
  assert.ok(dash.watchRelated.some((e) => /Palkia/.test(e.name)));
  assert.ok(!dash.watchHits.some((e) => /Palkia/.test(e.name)), 'regular Palkia is not a hit');
  assert.ok(dash.live.every((e) => e.phase === 'live'));
  assert.ok(dash.next.every((e) => e.phase === 'upcoming'));
});

test('current raids link to their scheduled end time', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const ann = annotate(events, DEFAULT_WATCHLIST, now);
  const raids = enrichCurrentRaids(normalizeScrapedDuckRaids(rawRaids), ann, DEFAULT_WATCHLIST);
  const gir = raids.find((r) => r.name === 'Giratina (Origin)');
  assert.ok(gir.endMs, 'end time from the matching raid event');
  const ws = watchStatus(DEFAULT_WATCHLIST, ann, raids);
  assert.equal(ws.length, DEFAULT_WATCHLIST.length);
  assert.equal(ws.find((w) => w.item.label === 'Rare Candy XL').found, true);
});

test('alerts are notification-ready with stable ids', () => {
  const now = Date.parse('2026-11-20T15:00:00Z');
  const ann = annotate(events, DEFAULT_WATCHLIST, now);
  const alerts = computeAlerts(ann, now);
  const cd = alerts.filter((a) => a.id.startsWith('sd:november-communityday2026'));
  assert.ok(cd.some((a) => a.kind === 'starting-soon'));
  assert.ok(cd.every((a) => a.url.startsWith('https://')));
});

test('shiny list from the source is applied to Community Day spawns', () => {
  const cd = byId('november-communityday2026');
  assert.equal(cd.spawns.find((s) => s.name === 'Pawniard').shiny, true);
});
