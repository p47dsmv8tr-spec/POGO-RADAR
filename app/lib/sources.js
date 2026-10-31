// Data sources. Every source reports status so the UI can show clear errors.
// Works in both Node 18+ (GitHub Action) and the browser (uses global fetch).

export const SOURCES = {
  scrapedduckEvents: {
    id: 'scrapedduck-events',
    name: 'ScrapedDuck — events (data from LeekDuck.com)',
    kind: 'community',
    url: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json',
    homepage: 'https://github.com/bigfoott/ScrapedDuck',
    terms: 'Free use allowed; no paywall, no ads; credit ScrapedDuck and LeekDuck.com. Files are cached by GitHub for 5 minutes.',
    browserFetchable: true,
  },
  scrapedduckRaids: {
    id: 'scrapedduck-raids',
    name: 'ScrapedDuck — current raid bosses (data from LeekDuck.com)',
    kind: 'community',
    url: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.min.json',
    homepage: 'https://leekduck.com/raid-bosses/',
    terms: 'Same terms as above.',
    browserFetchable: true,
  },
  officialNews: {
    id: 'official-news',
    name: 'Official Pokémon GO news (pokemongo.com)',
    kind: 'official',
    url: 'https://pokemongo.com/en/news',
    homepage: 'https://pokemongo.com/en/news',
    terms: 'Public news pages; only headlines and links are read, at most every 2 hours. Not fetchable from the browser (no CORS), so it comes from the scheduled update.',
    browserFetchable: false,
  },
};

export async function fetchWithTimeout(url, { timeoutMs = 15000, fetchImpl = globalThis.fetch, headers } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}`);
    return res;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a JSON array source and report status. Never throws. */
export async function fetchJsonArraySource(source, opts = {}) {
  const fetchedAt = Date.now();
  try {
    const res = await fetchWithTimeout(source.url, opts);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected format (expected a list)');
    return { status: { id: source.id, ok: true, fetchedAt, count: data.length }, data };
  } catch (err) {
    return { status: { id: source.id, ok: false, fetchedAt, error: String(err.message || err) }, data: [] };
  }
}

// ---------- Official news parsing (tolerant; the site has no public API) ----------

const decodeEntities = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const clean = (s) => decodeEntities(String(s).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december';
const DATE_RE = new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2}),\\s+(\\d{4})\\b|\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`, 'i');

function findDate(fragment) {
  const m = DATE_RE.exec(fragment);
  if (!m) return null;
  const ms = m[1] ? Date.parse(`${m[1]} ${m[2]}, ${m[3]} UTC`) : Date.UTC(+m[4], +m[5] - 1, +m[6]);
  return Number.isNaN(ms) ? null : ms;
}

/** Parse RSS/Atom or the HTML news list into [{title, url, publishedAt}] */
export function parseOfficialNews(body, baseUrl = 'https://pokemongo.com/en/news') {
  const text = String(body || '');
  const items = [];
  const seen = new Set();
  const push = (title, href, publishedAt) => {
    let url;
    try { url = new URL(decodeEntities(href), baseUrl).href; } catch { return; }
    const t = clean(title);
    if (!t || t.length < 6 || seen.has(url)) return;
    seen.add(url);
    items.push({ title: t, url, publishedAt: publishedAt ?? null });
  };

  // RSS / Atom
  if (/<rss\b|<feed\b/i.test(text)) {
    for (const m of text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
      const block = m[0];
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block)?.[1];
      const link = /<link[^>]*href="([^"]+)"/i.exec(block)?.[1] || /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block)?.[1];
      const date = /<(?:pubDate|published|updated)[^>]*>([\s\S]*?)</i.exec(block)?.[1];
      const ms = date ? Date.parse(clean(date)) : NaN;
      if (title && link) push(title, clean(link), Number.isNaN(ms) ? null : ms);
    }
    return items;
  }

  // HTML: links to /news/<slug> or /post/<slug>
  const linkRe = /<a\b[^>]*href="([^"]*\/(?:news|post)\/[a-z0-9][a-z0-9-]*\/?)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of text.matchAll(linkRe)) {
    const inner = m[2];
    const heading = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(inner)?.[1];
    const titleAttr = /title="([^"]+)"/i.exec(m[0])?.[1];
    // Date: inside the link, else just after it (cards usually put it below), else just before.
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 250).split(/<a\b/i)[0];
    const before = text.slice(Math.max(0, m.index - 250), m.index).split(/<\/a>/i).pop();
    const timeAttr = /datetime="([^"]+)"/i.exec(inner)?.[1];
    const ms = timeAttr ? Date.parse(timeAttr) : findDate(clean(inner)) ?? findDate(clean(after)) ?? findDate(clean(before));
    push(heading || titleAttr || inner, m[1], Number.isNaN(ms) ? null : ms);
  }
  return items;
}

/** Fetch official news. Tries the HTML list, then common feed URLs. Never throws. */
export async function fetchOfficialNews(opts = {}) {
  const src = SOURCES.officialNews;
  const fetchedAt = Date.now();
  const candidates = [src.url, 'https://pokemongo.com/en/rss', 'https://pokemongolive.com/en/news'];
  const errors = [];
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, { ...opts, headers: { 'User-Agent': 'POGO-RADAR (personal, non-commercial event tracker)' } });
      const items = parseOfficialNews(await res.text(), url);
      if (items.length) return { status: { id: src.id, ok: true, fetchedAt, count: items.length, url }, data: items.slice(0, 30) };
      errors.push(`${url}: page loaded but no news items could be read (layout may have changed)`);
    } catch (err) {
      errors.push(`${url}: ${err.message || err}`);
    }
  }
  return { status: { id: src.id, ok: false, fetchedAt, error: errors.join(' · ') }, data: [] };
}
