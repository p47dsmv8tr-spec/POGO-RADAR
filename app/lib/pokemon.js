// Parses Pokémon names as written by sources, e.g.
//   "Giratina (Origin)", "Origin Forme Palkia", "Shadow Landorus (Incarnate)",
//   "Mega Charizard X", "Zacian (Crowned Sword)", "Crowned Zacian".

const FORM_PREFIXES = [
  'origin', 'altered', 'crowned', 'hero', 'incarnate', 'therian', 'alolan', 'galarian',
  'hisuian', 'paldean', 'armored', 'black', 'white', 'dusk mane', 'dawn wings', 'ultra',
];
const FLAG_PREFIXES = { shadow: 'shadow', mega: 'mega', primal: 'primal', dynamax: 'dynamax', gigantamax: 'gigantamax', apex: 'apex', purified: 'purified' };

const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function normalizeForm(form) {
  if (!form) return null;
  const f = String(form).toLowerCase().replace(/\bformes?\b|\bforms?\b/g, '').replace(/\s+/g, ' ').trim();
  return f || null;
}

/**
 * @returns {{base:string, form:string|null, shadow:boolean, mega:boolean, primal:boolean, dynamax:boolean, gigantamax:boolean, display:string}}
 */
export function parsePokemonName(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  const out = { base: '', form: null, shadow: false, mega: false, primal: false, dynamax: false, gigantamax: false, display: s };

  // Parenthesised form: "Giratina (Origin Forme)"
  const paren = /\(([^)]+)\)\s*$/.exec(s);
  if (paren) {
    out.form = normalizeForm(paren[1]);
    s = s.slice(0, paren.index).trim();
  }

  // Leading flags / form words: "Shadow", "Mega", "Origin Forme", "Crowned"
  let changed = true;
  while (changed) {
    changed = false;
    const lower = s.toLowerCase();
    for (const [word, flag] of Object.entries(FLAG_PREFIXES)) {
      if (lower.startsWith(word + ' ')) { out[flag] = true; s = s.slice(word.length + 1); changed = true; }
    }
    for (const word of FORM_PREFIXES) {
      if (s.toLowerCase().startsWith(word + ' ')) {
        out.form = out.form || word;
        s = s.slice(word.length + 1).replace(/^(forme?s?)\s+/i, '');
        changed = true;
      }
    }
  }

  // Trailing mega letter: "Mega Charizard X"
  const megaXY = /^(.+?)\s+([XY])$/.exec(s);
  if (out.mega && megaXY) { s = megaXY[1]; out.form = out.form || megaXY[2].toLowerCase(); }

  // Trailing "Origin Forme"/"Crowned Sword" without parentheses: "Palkia Origin Forme"
  const trailing = new RegExp(`^(.+?)\\s+(${FORM_PREFIXES.join('|')})(?:\\s+(?:forme?|sword|shield))?$`, 'i').exec(s);
  if (trailing) { s = trailing[1]; out.form = out.form || trailing[2].toLowerCase(); }

  out.base = cap(s.toLowerCase());
  return out;
}

/** Does the parsed source form satisfy the watched form? (watched form null = any form) */
export function formMatches(watchedForm, sourceForm) {
  const w = normalizeForm(watchedForm);
  if (!w) return true;
  const s = normalizeForm(sourceForm);
  if (!s) return false;
  return s === w || s.startsWith(w + ' ') || w.startsWith(s + ' ');
}

export function describeForm(p) {
  const bits = [];
  if (p.shadow) bits.push('Shadow');
  const megaLetter = p.mega && /^[xy]$/.test(p.form || '');
  if (p.mega) bits.push(megaLetter ? `Mega ${p.form.toUpperCase()}` : 'Mega');
  if (p.primal) bits.push('Primal');
  if (p.dynamax) bits.push('Dynamax');
  if (p.gigantamax) bits.push('Gigantamax');
  if (p.form && !megaLetter) bits.push(cap(p.form) + ' Forme');
  if (!bits.length) bits.push('Regular form');
  return bits.join(' · ');
}
