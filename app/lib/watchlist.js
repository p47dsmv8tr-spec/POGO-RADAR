// Watchlist model + matching against normalized events.
import { parsePokemonName, formMatches, normalizeForm } from './pokemon.js';

export const ITEM_SYNONYMS = {
  'elite fast tm': ['elite fast tm', 'elite fast technical machine', 'elite fast attack tm', 'elite fast attack technical machine'],
  'elite charged tm': ['elite charged tm', 'elite charged technical machine', 'elite charged attack tm', 'elite charged attack technical machine'],
  'rare candy xl': ['rare candy xl'],
};
// Text that mentions Elite TMs without saying which kind.
const GENERIC_ELITE_TM = /\belite (?:tms?|technical machines?)\b/;

export const DEFAULT_WATCHLIST = [
  { id: 'pkm-palkia-origin', kind: 'pokemon', label: 'Origin Palkia', name: 'Palkia', form: 'origin' },
  { id: 'pkm-dialga-origin', kind: 'pokemon', label: 'Origin Dialga', name: 'Dialga', form: 'origin' },
  { id: 'pkm-zacian-crowned', kind: 'pokemon', label: 'Crowned Zacian', name: 'Zacian', form: 'crowned' },
  { id: 'item-elite-fast-tm', kind: 'item', label: 'Elite Fast TM', name: 'elite fast tm' },
  { id: 'item-elite-charged-tm', kind: 'item', label: 'Elite Charged TM', name: 'elite charged tm' },
  { id: 'item-rare-candy-xl', kind: 'item', label: 'Rare Candy XL', name: 'rare candy xl' },
];

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build a watchlist entry from user input. */
export function createWatchItem(kind, text) {
  const label = String(text || '').trim().replace(/\s+/g, ' ');
  if (!label) throw new Error('Name is required');
  if (!['pokemon', 'item', 'event'].includes(kind)) throw new Error(`Unknown kind: ${kind}`);
  if (kind === 'pokemon') {
    const p = parsePokemonName(label);
    if (!p.base) throw new Error('Pokémon name is required');
    return {
      id: `pkm-${slug(p.base)}${p.form ? '-' + slug(p.form) : ''}${p.shadow ? '-shadow' : ''}${p.mega ? '-mega' : ''}`,
      kind, label, name: p.base, form: p.form, shadow: p.shadow || undefined, mega: p.mega || undefined,
    };
  }
  return { id: `${kind}-${slug(label)}`, kind, label, name: label.toLowerCase() };
}

/** Add an item unless an equivalent one exists. Returns a new array. */
export function addWatchItem(list, item) {
  return list.some((w) => w.id === item.id) ? list : [...list, item];
}

export function removeWatchItem(list, id) {
  return list.filter((w) => w.id !== id);
}

function mentionsNear(text, base) {
  // Every mention of the base name in free text, with ~25 characters of context each side.
  const re = new RegExp(`\\b${escapeRe(base.toLowerCase())}\\b`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(text.slice(Math.max(0, m.index - 25), m.index + base.length + 25));
  return out;
}

function matchPokemon(w, ev) {
  const wantForm = normalizeForm(w.form);
  const results = [];
  const groups = [
    ['raid boss', ev.bosses || []],
    ['wild spawn', ev.spawns || []],
    ['spotlight', ev.spotlight ? ev.spotlight.list || [] : []],
  ];
  for (const [where, list] of groups) {
    for (const mon of list) {
      const p = mon.parsed || parsePokemonName(mon.name);
      if (p.base.toLowerCase() !== w.name.toLowerCase()) continue;
      if (w.shadow && !p.shadow) { results.push({ level: 'related', where, reason: `${mon.name} is listed, but not as Shadow` }); continue; }
      if (w.mega && !p.mega) { results.push({ level: 'related', where, reason: `${mon.name} is listed, but not as Mega` }); continue; }
      if (formMatches(wantForm, p.form)) {
        results.push({ level: 'exact', where, reason: `${mon.name} as ${where}` });
      } else {
        results.push({
          level: 'related', where,
          reason: p.form
            ? `${mon.name} is a different form (${p.form}), not ${wantForm}`
            : `Only regular ${p.base} is listed — not the ${wantForm} form`,
        });
      }
    }
  }
  if (results.length) return results;

  // Fall back to free text (event name, bonuses, notes).
  for (const ctx of mentionsNear(ev.searchText || '', w.name)) {
    if (!wantForm) { results.push({ level: 'exact', where: 'text', reason: `${w.name} is mentioned` }); break; }
    if (new RegExp(`\\b${escapeRe(wantForm)}\\b`).test(ctx)) {
      results.push({ level: 'exact', where: 'text', reason: `${w.label} is mentioned` });
      break;
    }
    results.push({ level: 'related', where: 'text', reason: `${w.name} is mentioned, but the ${wantForm} form is not confirmed` });
  }
  return results;
}

function matchKeyword(w, ev) {
  const text = ev.searchText || '';
  const key = w.name.toLowerCase();
  const patterns = ITEM_SYNONYMS[key] || [key];
  const reward = (ev.rewards || []).find((r) => patterns.some((p) => r.toLowerCase().includes(p)));
  if (reward) return [{ level: 'exact', where: 'reward', reason: `Reward: ${reward}` }];
  if (patterns.some((p) => text.includes(p))) {
    return [{ level: 'exact', where: 'text', reason: `${w.label} is mentioned` }];
  }
  if ((key === 'elite fast tm' || key === 'elite charged tm') && GENERIC_ELITE_TM.test(text)) {
    return [{ level: 'related', where: 'text', reason: 'An Elite TM is mentioned, type not specified' }];
  }
  if (w.kind === 'event' && (ev.categoryLabel || '').toLowerCase().includes(key)) {
    return [{ level: 'exact', where: 'category', reason: `Event type: ${ev.categoryLabel}` }];
  }
  return [];
}

/** Match one watch item against one event. Returns the best match or null. */
export function matchItem(w, ev) {
  const hits = w.kind === 'pokemon' ? matchPokemon(w, ev) : matchKeyword(w, ev);
  if (!hits.length) return null;
  const exact = hits.find((h) => h.level === 'exact');
  return { itemId: w.id, label: w.label, ...(exact || hits[0]) };
}

/** All matches for an event. */
export function matchEvent(watchlist, ev) {
  return watchlist.map((w) => matchItem(w, ev)).filter(Boolean);
}

/** Per watch item: which events match it. */
export function matchesByItem(watchlist, events) {
  return watchlist.map((w) => ({
    item: w,
    matches: events.map((ev) => ({ ev, m: matchItem(w, ev) })).filter((x) => x.m),
  }));
}
