#!/usr/bin/env node
// Fetches all sources and writes app/data/feed.json.
// Run by the scheduled GitHub Action (every 2 hours), or locally: npm run fetch
// Raw source data is stored as-is; the app normalizes it (same code as the browser fallback).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, fetchJsonArraySource, fetchOfficialNews } from '../app/lib/sources.js';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../app/data/feed.json');

export async function buildFeed(opts = {}) {
  const [events, raids, news] = await Promise.all([
    fetchJsonArraySource(SOURCES.scrapedduckEvents, opts),
    fetchJsonArraySource(SOURCES.scrapedduckRaids, opts),
    fetchOfficialNews(opts),
  ]);
  const meta = (src, st) => ({
    id: src.id, name: src.name, kind: src.kind, url: src.url, homepage: src.homepage, terms: src.terms,
    ok: st.ok, fetchedAt: st.fetchedAt, count: st.count ?? 0, error: st.error ?? null,
  });
  return {
    schemaVersion: 1,
    generatedAt: Date.now(),
    sources: [
      meta(SOURCES.scrapedduckEvents, events.status),
      meta(SOURCES.scrapedduckRaids, raids.status),
      meta(SOURCES.officialNews, news.status),
    ],
    raw: { events: events.data, raids: raids.data },
    news: news.data,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const feed = await buildFeed();
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(feed));
  for (const s of feed.sources) {
    console.log(`${s.ok ? 'OK  ' : 'FAIL'} ${s.id}: ${s.ok ? `${s.count} items` : s.error}`);
  }
  // Fail the build only if the primary event source is down, so a broken
  // optional source never blocks the site from updating.
  if (!feed.sources[0].ok) {
    console.error('Primary event source unavailable — not publishing an empty feed.');
    process.exit(1);
  }
}
