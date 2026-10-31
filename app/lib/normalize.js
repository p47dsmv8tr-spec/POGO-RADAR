// Turns raw source data into one normalized shape used by the whole app.
import { parseEventTime, DEFAULT_TZ } from './time.js';
import { parsePokemonName } from './pokemon.js';

export const CATEGORIES = {
  'community-day': 'Community Day',
  raids: 'Raids',
  gbl: 'GO Battle League',
  research: 'Research',
  'tour-fest': 'GO Tour / GO Fest',
  spotlight: 'Spotlight Hour',
  max: 'Max Battles',
  season: 'Season',
  pass: 'GO Pass',
  event: 'Event',
};

const TYPE_TO_CATEGORY = {
  'community-day': 'community-day',
  'raid-day': 'raids', 'raid-hour': 'raids', 'raid-battles': 'raids', 'raid-weekend': 'raids', 'elite-raids': 'raids',
  'go-battle-league': 'gbl',
  research: 'research', 'timed-research': 'research', 'special-research': 'research', 'research-breakthrough': 'research', 'research-day': 'research',
  'pokemon-go-tour': 'tour-fest', 'pokemon-go-fest': 'tour-fest', 'go-tour': 'tour-fest', 'safari-zone': 'tour-fest', 'wild-area': 'tour-fest', 'city-safari': 'tour-fest',
  'pokemon-spotlight-hour': 'spotlight',
  'max-battles': 'max', 'max-mondays': 'max',
  season: 'season',
  'go-pass': 'pass',
};

export function categoryFor(eventType, name = '') {
  if (TYPE_TO_CATEGORY[eventType]) return TYPE_TO_CATEGORY[eventType];
  if (/go fest|go tour/i.test(name)) return 'tour-fest';
  if (/community day/i.test(name)) return 'community-day';
  return 'event';
}

/** Raid kind from the event type/name: five | mega | shadow | raid-hour | raid-day | max | null */
export function raidTierFor(type, name = '') {
  if (type === 'raid-hour') return 'raid-hour';
  if (type === 'raid-day') return 'raid-day';
  if (/shadow raid/i.test(name)) return 'shadow';
  if (/mega raid/i.test(name)) return 'mega';
  if (/5-star|five-star|5★/i.test(name)) return 'five';
  if (/max battle/i.test(name)) return 'max';
  return type === 'raid-battles' ? 'other' : null;
}

/** Raid tier from ScrapedDuck raids.json tier text. */
export function tierKeyFromLabel(tier = '', name = '') {
  const t = tier.toLowerCase();
  const shadow = /^shadow\b/i.test(name);
  if (t.includes('mega')) return 'mega';
  if (t.startsWith('5')) return shadow ? 'shadow' : 'five';
  if (t.startsWith('6') || t.includes('elite')) return 'five';
  if (t.startsWith('3')) return shadow ? 'shadow-3' : 'three';
  if (t.startsWith('1')) return shadow ? 'shadow-1' : 'one';
  return 'other';
}

// Some rewards only carry their name in the image file name, e.g. ".../items/Rare%20Candy%20XL.png" + "×1".
export function rewardLabel(r) {
  const text = String(r?.text ?? r?.name ?? '').trim();
  const img = String(r?.image || '');
  let name = '';
  try {
    const file = decodeURIComponent(img.split('/').pop() || '').replace(/\.[a-z]+$/i, '');
    if (img.includes('/items/')) name = file;
    else if (img.includes('/candy/xl/')) name = 'Candy XL';
    else if (img.includes('/candy/regular/')) name = 'Candy';
  } catch { /* malformed URL: ignore */ }
  if (name && text && !text.toLowerCase().includes(name.toLowerCase())) return `${name} ${text}`.trim();
  return text || name;
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function mon(m, extra = {}) {
  const parsed = parsePokemonName(m.name);
  if (extra.shadow) parsed.shadow = true;
  return { name: m.name, image: m.image || null, shiny: typeof m.canBeShiny === 'boolean' ? m.canBeShiny : null, parsed };
}

/** Free vs paid. Source data rarely states this, so we say what it is based on. */
export function costInfo(category, type, text, extra = {}) {
  const mentionsPaid = /\bticket(?:ed)?\b|\bpaid\b|us\$|\$\d|\bpurchase\b/i.test(text);
  if (extra.promoCodes?.length) return { label: 'Free (promo code)', tone: 'free', basis: 'Promo code listed by source' };
  switch (category) {
    case 'community-day':
    case 'spotlight':
    case 'gbl':
    case 'season':
      return { label: 'Free', tone: 'free', basis: 'Free event type', note: mentionsPaid ? 'Source mentions a ticket/purchase for some content' : undefined };
    case 'raids':
    case 'max':
      return { label: 'Free to join', tone: 'free', basis: 'Event type; raid passes still needed', note: mentionsPaid ? 'Source mentions a ticket/purchase' : undefined };
    case 'pass':
      return { label: 'Free tier + paid Deluxe', tone: 'mixed', basis: 'GO Pass structure' };
    case 'tour-fest':
      return { label: 'Paid ticket likely', tone: 'paid', basis: 'Ticketed event type — verify at source' };
    default:
      return mentionsPaid
        ? { label: 'Paid parts possible', tone: 'mixed', basis: 'Source mentions a ticket/purchase' }
        : { label: 'Not stated', tone: 'unknown', basis: 'Source does not state cost' };
  }
}

const KEYWORDS = {
  eliteFastTM: /elite fast (?:attack )?(?:tm|technical machine)/,
  eliteChargedTM: /elite charged (?:attack )?(?:tm|technical machine)/,
  eliteTM: /\belite (?:fast |charged )?(?:attack )?(?:tms?|technical machines?)\b/,
  rareCandyXL: /rare candy xl/,
  masterLeague: /master league/,
  featuredAttack: /featured (?:attack|move)|exclusive (?:attack|move)|special (?:attack|move)|signature move/,
};

/**
 * Normalize one ScrapedDuck event.
 */
export function normalizeScrapedDuckEvent(raw, { fetchedAt = null, tz = DEFAULT_TZ } = {}) {
  const x = raw.extraData || {};
  const type = raw.eventType || 'event';
  const category = categoryFor(type, raw.name);
  const raidTier = raidTierFor(type, raw.name || '');
  const start = parseEventTime(raw.start, tz);
  const end = parseEventTime(raw.end, tz);

  const bosses = (x.raidbattles?.bosses || []).map((b) => mon(b, { shadow: raidTier === 'shadow' }));
  const shinies = [...(x.raidbattles?.shinies || []), ...(x.communityday?.shinies || [])].map((s) => s.name);
  const spawns = [...(x.communityday?.spawns || [])].map((s) => mon(s));
  // The source lists shinies separately; carry that onto the matching Pokémon.
  const shinySet = new Set(shinies.map((n) => n.toLowerCase()));
  for (const m of spawns) if (m.shiny == null && shinySet.has(m.name.toLowerCase())) m.shiny = true;
  const spotlight = x.spotlight ? { name: x.spotlight.name, bonus: x.spotlight.bonus || null, list: (x.spotlight.list || []).map((s) => mon(s)) } : null;
  const bonuses = [
    ...(x.communityday?.bonuses || []).map((b) => stripHtml(b.text)),
    ...(spotlight?.bonus ? [spotlight.bonus] : []),
  ].filter(Boolean);
  const disclaimers = (x.communityday?.bonusDisclaimers || []).map(stripHtml);
  const promoCodes = x.promocodes || [];

  const research = (x.communityday?.specialresearch || []).map((step) => ({
    name: step.name,
    tasks: (step.tasks || []).map((t) => ({ text: stripHtml(t.text), reward: rewardLabel(t.reward) })),
    rewards: (step.rewards || []).map(rewardLabel),
  }));
  const rewards = [
    ...research.flatMap((s) => [...s.rewards, ...s.tasks.map((t) => t.reward)]),
  ].filter(Boolean);

  const searchText = [
    raw.name, raw.heading, type,
    ...bosses.map((b) => b.name), ...spawns.map((s) => s.name),
    ...(spotlight ? [spotlight.name, ...spotlight.list.map((s) => s.name)] : []),
    ...bonuses, ...disclaimers, ...rewards, ...research.map((r) => r.name),
  ].filter(Boolean).join(' \n ').toLowerCase();

  const flags = Object.fromEntries(Object.entries(KEYWORDS).map(([k, re]) => [k, re.test(searchText)]));
  flags.legendaryTier = raidTier === 'five' || raidTier === 'shadow' || (category === 'max' && /eternatus|legendary|gigantamax/i.test(raw.name || ''));

  const notes = [];
  const tba = /to be announced|\btba\b|\btbd\b/i.test(raw.name || '');
  if (!start || !end) notes.push('Exact dates are not listed by the source yet.');
  if (tba) notes.push('Details are marked "to be announced" by the source.');
  if (category === 'raids' && bosses.length) notes.push('Featured attacks are not included in the data feed — check the source link.');
  if (research.length) notes.push('Ticket requirement for this Special Research is not stated by the data source.');

  return {
    id: `sd:${raw.eventID || raw.name}`,
    name: raw.name || 'Unnamed event',
    type, heading: raw.heading || '', category, categoryLabel: CATEGORIES[category],
    raidTier,
    image: raw.image || null,
    start, end,
    bosses, spawns, shinies, spotlight, bonuses, disclaimers, promoCodes, research, rewards,
    cost: costInfo(category, type, searchText, { promoCodes }),
    flags,
    verification: !start || !end || tba ? 'unverified' : 'confirmed',
    notes,
    source: { id: 'scrapedduck', name: 'LeekDuck via ScrapedDuck', url: raw.link || 'https://leekduck.com/events/', fetchedAt },
    searchText,
  };
}

/** Normalize ScrapedDuck raids.json (bosses active right now). */
export function normalizeScrapedDuckRaids(list, { fetchedAt = null } = {}) {
  return (list || []).map((r) => {
    const parsed = parsePokemonName(r.name);
    return {
      id: `sdraid:${r.tier}:${r.name}`,
      name: r.name,
      tier: r.tier,
      tierKey: tierKeyFromLabel(r.tier, r.name),
      parsed,
      shiny: typeof r.canBeShiny === 'boolean' ? r.canBeShiny : null,
      types: (r.types || []).map((t) => t.name),
      cp: r.combatPower?.normal || null,
      cpBoosted: r.combatPower?.boosted || null,
      weather: (r.boostedWeather || []).map((w) => w.name),
      image: r.image || null,
      source: { id: 'scrapedduck-raids', name: 'LeekDuck via ScrapedDuck', url: 'https://leekduck.com/raid-bosses/', fetchedAt },
    };
  });
}

export function normalizeAll({ events = [], raids = [], fetchedAt = {} } = {}, tz = DEFAULT_TZ) {
  return {
    events: events.map((e) => normalizeScrapedDuckEvent(e, { fetchedAt: fetchedAt.events ?? null, tz })),
    raids: normalizeScrapedDuckRaids(raids, { fetchedAt: fetchedAt.raids ?? null }),
  };
}
