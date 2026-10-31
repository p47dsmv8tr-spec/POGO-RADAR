import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePokemonName, formMatches } from '../app/lib/pokemon.js';
import { DEFAULT_WATCHLIST, createWatchItem, addWatchItem, removeWatchItem, matchItem } from '../app/lib/watchlist.js';

const W = Object.fromEntries(DEFAULT_WATCHLIST.map((w) => [w.label, w]));
const raid = (...names) => ({ bosses: names.map((name) => ({ name })), searchText: names.join(' ').toLowerCase(), rewards: [] });

test('parses forms in all common spellings', () => {
  assert.deepEqual(pick(parsePokemonName('Giratina (Origin)')), { base: 'Giratina', form: 'origin' });
  assert.deepEqual(pick(parsePokemonName('Origin Forme Palkia')), { base: 'Palkia', form: 'origin' });
  assert.deepEqual(pick(parsePokemonName('Palkia (Origin Forme)')), { base: 'Palkia', form: 'origin' });
  assert.deepEqual(pick(parsePokemonName('Zacian (Crowned Sword)')), { base: 'Zacian', form: 'crowned sword' });
  assert.deepEqual(pick(parsePokemonName('Crowned Zacian')), { base: 'Zacian', form: 'crowned' });
  assert.deepEqual(pick(parsePokemonName('Palkia')), { base: 'Palkia', form: null });
  const sh = parsePokemonName('Shadow Landorus (Incarnate)');
  assert.equal(sh.shadow, true); assert.equal(sh.base, 'Landorus'); assert.equal(sh.form, 'incarnate');
  const mx = parsePokemonName('Mega Charizard X');
  assert.equal(mx.mega, true); assert.equal(mx.base, 'Charizard'); assert.equal(mx.form, 'x');
});
const pick = (p) => ({ base: p.base, form: p.form });

test('form matching', () => {
  assert.ok(formMatches('crowned', 'crowned sword'));
  assert.ok(formMatches(null, 'origin'));
  assert.ok(!formMatches('origin', null));
  assert.ok(!formMatches('origin', 'altered'));
});

test('regular Palkia is NOT reported as Origin Palkia', () => {
  const m = matchItem(W['Origin Palkia'], raid('Palkia'));
  assert.equal(m.level, 'related');
  assert.match(m.reason, /not the origin form/i);
});

test('Origin Palkia raid is an exact match', () => {
  assert.equal(matchItem(W['Origin Palkia'], raid('Palkia (Origin)')).level, 'exact');
  assert.equal(matchItem(W['Origin Dialga'], raid('Origin Forme Dialga')).level, 'exact');
});

test('Crowned Zacian vs Hero Zacian', () => {
  assert.equal(matchItem(W['Crowned Zacian'], raid('Zacian (Crowned Sword)')).level, 'exact');
  assert.equal(matchItem(W['Crowned Zacian'], raid('Zacian (Hero)')).level, 'related');
});

test('unrelated Pokémon do not match', () => {
  assert.equal(matchItem(W['Origin Palkia'], raid('Giratina (Origin)')), null);
});

test('free-text mentions respect forms', () => {
  const ev = { bosses: [], searchText: 'origin forme dialga returns to raids', rewards: [] };
  assert.equal(matchItem(W['Origin Dialga'], ev).level, 'exact');
  const ev2 = { bosses: [], searchText: 'dialga returns to 5-star raids', rewards: [] };
  assert.equal(matchItem(W['Origin Dialga'], ev2).level, 'related');
});

test('Elite TMs: specific vs generic mentions; plain Charged TM is not elite', () => {
  const ev = (text, rewards = []) => ({ bosses: [], searchText: text, rewards });
  assert.equal(matchItem(W['Elite Fast TM'], ev('reward: elite fast tm')).level, 'exact');
  assert.equal(matchItem(W['Elite Charged TM'], ev('reward: elite fast tm')), null);
  assert.equal(matchItem(W['Elite Charged TM'], ev('earn an elite tm at rank 20')).level, 'related');
  assert.equal(matchItem(W['Elite Charged TM'], ev('charged tm ×1', ['Charged TM ×1'])), null);
});

test('Rare Candy XL found in rewards says how to get it', () => {
  const m = matchItem(W['Rare Candy XL'], { bosses: [], searchText: 'rare candy xl ×1', rewards: ['Rare Candy XL ×1'] });
  assert.equal(m.level, 'exact');
  assert.equal(m.where, 'reward');
});

test('creating, adding and removing watch items', () => {
  const p = createWatchItem('pokemon', '  Origin   Giratina ');
  assert.equal(p.name, 'Giratina'); assert.equal(p.form, 'origin'); assert.equal(p.id, 'pkm-giratina-origin');
  const i = createWatchItem('item', 'Premium Battle Pass');
  assert.equal(i.name, 'premium battle pass');
  assert.throws(() => createWatchItem('pokemon', '   '));
  let list = addWatchItem(DEFAULT_WATCHLIST, p);
  assert.equal(list.length, DEFAULT_WATCHLIST.length + 1);
  assert.equal(addWatchItem(list, p).length, list.length, 'no duplicates');
  list = removeWatchItem(list, p.id);
  assert.equal(list.length, DEFAULT_WATCHLIST.length);
});

test('default watchlist contains the requested targets', () => {
  assert.deepEqual(DEFAULT_WATCHLIST.map((w) => w.label),
    ['Origin Palkia', 'Origin Dialga', 'Crowned Zacian', 'Elite Fast TM', 'Elite Charged TM', 'Rare Candy XL']);
});

test('form descriptions read naturally', async () => {
  const { describeForm } = await import('../app/lib/pokemon.js');
  assert.equal(describeForm(parsePokemonName('Mega Sableye')), 'Mega');
  assert.equal(describeForm(parsePokemonName('Mega Charizard Y')), 'Mega Y');
  assert.equal(describeForm(parsePokemonName('Palkia')), 'Regular form');
  assert.equal(describeForm(parsePokemonName('Shadow Landorus (Incarnate)')), 'Shadow · Incarnate Forme');
});
