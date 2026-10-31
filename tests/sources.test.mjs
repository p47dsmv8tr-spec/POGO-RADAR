import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, fetchJsonArraySource, parseOfficialNews, fetchOfficialNews } from '../app/lib/sources.js';

const okFetch = (body, type = 'json') => async () => ({ ok: true, status: 200, json: async () => body, text: async () => (type === 'json' ? JSON.stringify(body) : body) });
const failFetch = (status) => async () => ({ ok: false, status, statusText: 'Error' });

test('a working source reports ok with a count', async () => {
  const r = await fetchJsonArraySource(SOURCES.scrapedduckEvents, { fetchImpl: okFetch([{ a: 1 }, { a: 2 }]) });
  assert.equal(r.status.ok, true);
  assert.equal(r.status.count, 2);
});

test('an unavailable source reports a clear error and no data', async () => {
  const r = await fetchJsonArraySource(SOURCES.scrapedduckEvents, { fetchImpl: failFetch(503) });
  assert.equal(r.status.ok, false);
  assert.match(r.status.error, /503/);
  assert.deepEqual(r.data, []);
});

test('network errors and wrong formats are reported, not thrown', async () => {
  const r1 = await fetchJsonArraySource(SOURCES.scrapedduckRaids, { fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
  assert.match(r1.status.error, /ENOTFOUND/);
  const r2 = await fetchJsonArraySource(SOURCES.scrapedduckRaids, { fetchImpl: okFetch({ not: 'a list' }) });
  assert.match(r2.status.error, /Unexpected format/);
});

test('timeouts are reported', async () => {
  const hang = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const r = await fetchJsonArraySource(SOURCES.scrapedduckRaids, { fetchImpl: hang, timeoutMs: 20 });
  assert.match(r.status.error, /Timed out/);
});

test('parses official news HTML', () => {
  const html = `<ul>
    <li><a href="/en/news/community-day-november-2026"><h3>Pawniard Community Day</h3><time datetime="2026-10-28T17:00:00Z">October 28, 2026</time></a></li>
    <li><a href="https://pokemongo.com/en/post/go-battle-league-season"><span>GO Battle League: Twilight Trails &amp; rewards</span></a><p>October 20, 2026</p></li>
    <li><a href="/en/news/community-day-november-2026">duplicate</a></li>
    <li><a href="/en/about">About</a></li>
  </ul>`;
  const items = parseOfficialNews(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Pawniard Community Day');
  assert.equal(items[0].url, 'https://pokemongo.com/en/news/community-day-november-2026');
  assert.equal(new Date(items[0].publishedAt).toISOString(), '2026-10-28T17:00:00.000Z');
  assert.equal(items[1].title, 'GO Battle League: Twilight Trails & rewards');
  assert.equal(new Date(items[1].publishedAt).toISOString().slice(0, 10), '2026-10-20');
});

test('parses RSS feeds', () => {
  const rss = `<rss><channel><item><title><![CDATA[Elite Charged TM in Special Research]]></title><link>https://pokemongo.com/en/post/x</link><pubDate>Wed, 28 Oct 2026 17:00:00 GMT</pubDate></item></channel></rss>`;
  const items = parseOfficialNews(rss);
  assert.equal(items[0].title, 'Elite Charged TM in Special Research');
  assert.equal(items[0].url, 'https://pokemongo.com/en/post/x');
});

test('official news reports a clear error when the layout yields nothing', async () => {
  const r = await fetchOfficialNews({ fetchImpl: okFetch('<html><body>nothing</body></html>', 'html') });
  assert.equal(r.status.ok, false);
  assert.match(r.status.error, /no news items/);
});
