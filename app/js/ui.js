// Small rendering helpers. Views are plain HTML strings; every value from a
// data source passes through esc() before it reaches the page.
import { formatCountdown, formatRange, formatAgo, eventPhase, DEFAULT_TZ } from '../lib/time.js';
import { describeForm } from '../lib/pokemon.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? esc(u) : '');

export const TIER_LABEL = {
  five: '5★ Raid', mega: 'Mega Raid', shadow: 'Shadow Raid', 'raid-hour': 'Raid Hour', 'raid-day': 'Raid Day',
  max: 'Max Battle', other: 'Raid', three: '3★ Raid', one: '1★ Raid', 'shadow-3': 'Shadow 3★', 'shadow-1': 'Shadow 1★',
};
const TIER_CLASS = { five: 'five', mega: 'mega', shadow: 'shadow', 'raid-hour': 'five', 'raid-day': 'mega' };

export function monImg(name, image, cls = 'mon') {
  const initial = esc(String(name || '?').replace(/^(shadow|mega)\s+/i, '').charAt(0));
  if (!safeUrl(image)) return `<span class="mon-fallback">${initial}</span>`;
  return `<img class="${cls}" src="${safeUrl(image)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer" data-fallback="${initial}">`;
}

/** Replace broken images with a lettered placeholder (no inline handlers). */
export function installImageFallback() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.fallback != null) {
      const span = document.createElement('span');
      span.className = 'mon-fallback';
      span.textContent = img.dataset.fallback;
      img.replaceWith(span);
    } else {
      img.remove();
    }
  }, true);
}

export function countdown(startMs, endMs, now = Date.now()) {
  const phase = eventPhase(startMs, endMs, now);
  const attrs = `data-cd data-start="${startMs ?? ''}" data-end="${endMs ?? ''}" data-phase="${phase}"`;
  return `<div class="countdown ${phase === 'live' ? 'live' : ''}" ${attrs}>${countdownInner(startMs, endMs, now)}</div>`;
}

export function countdownInner(startMs, endMs, now = Date.now()) {
  const phase = eventPhase(startMs, endMs, now);
  if (phase === 'upcoming') return `<span>Starts in</span><b>${formatCountdown(startMs - now)}</b>`;
  if (phase === 'live') return endMs != null ? `<span>Ends in</span><b>${formatCountdown(endMs - now)}</b>` : '<span>Status</span><b>Live</b>';
  if (phase === 'ended') return '<span>Status</span><b>Ended</b>';
  return '<span>Dates</span><b>TBA</b>';
}

export function phaseBadge(phase) {
  if (phase === 'live') return '<span class="badge live">Live</span>';
  if (phase === 'upcoming') return '<span class="badge">Upcoming</span>';
  if (phase === 'ended') return '<span class="badge">Ended</span>';
  return '<span class="badge unverified">Dates TBA</span>';
}

export function verificationBadge(v) {
  return v === 'confirmed'
    ? '<span class="badge confirmed" title="Dates and details listed by the source">✓ Confirmed by source</span>'
    : '<span class="badge unverified" title="Source lists this without full details">? Unverified</span>';
}

export const costBadge = (c) => (c ? `<span class="badge ${esc(c.tone)}" title="${esc(c.basis)}">${esc(c.label)}</span>` : '');
export const tierBadge = (t) => (t && TIER_LABEL[t] ? `<span class="badge ${TIER_CLASS[t] || ''}">${esc(TIER_LABEL[t])}</span>` : '');

export function formBadge(parsed) {
  if (!parsed) return '';
  const regular = !parsed.form && !parsed.shadow && !parsed.mega;
  return `<span class="badge form ${regular ? 'regular' : ''}">${esc(describeForm(parsed))}</span>`;
}

export function shinyBadge(shiny) {
  if (shiny === true) return '<span class="badge shiny" title="Shiny availability reported by source">✦ Shiny available</span>';
  if (shiny === false) return '<span class="badge" title="Source reports no shiny">No shiny</span>';
  return '<span class="badge unverified" title="Not stated by source">Shiny: unconfirmed</span>';
}

export function flagBadges(f = {}) {
  const out = [];
  if (f.eliteFastTM) out.push('<span class="badge elite">Elite Fast TM</span>');
  if (f.eliteChargedTM) out.push('<span class="badge elite">Elite Charged TM</span>');
  if (f.eliteTM && !f.eliteFastTM && !f.eliteChargedTM) out.push('<span class="badge elite">Elite TM</span>');
  if (f.rareCandyXL) out.push('<span class="badge elite">Rare Candy XL</span>');
  if (f.masterLeague) out.push('<span class="badge ml">Master League</span>');
  if (f.featuredAttack) out.push('<span class="badge">Featured attack</span>');
  return out.join('');
}

export function whereLabel(m, ev) {
  switch (m.where) {
    case 'raid boss': return `${TIER_LABEL[ev.raidTier] || 'Raid'} battles`;
    case 'wild spawn': return 'Wild spawns';
    case 'spotlight': return 'Spotlight Hour spawns';
    case 'reward': return 'Event reward (Special Research)';
    case 'category': return ev.categoryLabel;
    default: return 'Mentioned in event details';
  }
}

export function matchLines(ev) {
  const lines = [];
  for (const m of ev.exactMatches || []) {
    lines.push(`<div class="match-line">★ <b>${esc(m.label)}</b> — ${esc(whereLabel(m, ev))}. ${esc(m.reason)}</div>`);
  }
  for (const m of (ev.relatedMatches || []).slice(0, 2)) {
    lines.push(`<div class="match-line related">◇ ${esc(m.label)}: ${esc(m.reason)}</div>`);
  }
  return lines.join('');
}

export function eventCard(ev, i = 0, { showImage = false } = {}) {
  const cls = ev.exactMatches?.length ? 'watched' : ev.relatedMatches?.length ? 'related' : '';
  const firstMon = ev.bosses?.[0] || ev.spotlight?.list?.[0] || ev.spawns?.[0];
  const visual = firstMon ? monImg(firstMon.name, firstMon.image) : (safeUrl(ev.image) ? `<img class="thumb" src="${safeUrl(ev.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '');
  return `
  <div class="card ${cls}" style="--i:${i}" role="button" tabindex="0" data-event="${esc(ev.id)}">
    ${showImage && safeUrl(ev.image) ? `<img class="banner-img" src="${safeUrl(ev.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
    <div class="card-row">
      ${visual}
      <div class="card-body">
        <div class="card-title">${esc(ev.name)}</div>
        <div class="card-meta">${esc(ev.categoryLabel)} · ${esc(formatRange(ev.startMs, ev.endMs, DEFAULT_TZ))}</div>
      </div>
      ${countdown(ev.startMs, ev.endMs)}
    </div>
    <div class="card-foot">
      ${ev.exactMatches?.length ? '<span class="badge watch">★ Watchlist</span>' : ''}
      ${phaseBadge(ev.phase)} ${tierBadge(ev.raidTier)} ${ev.cost?.tone !== 'unknown' ? costBadge(ev.cost) : ''} ${flagBadges(ev.flags)}
      ${ev.verification !== 'confirmed' ? verificationBadge(ev.verification) : ''}
    </div>
    ${matchLines(ev)}
  </div>`;
}

export function currentRaidCard(r, i = 0) {
  const cls = r.exactMatches.length ? 'watched' : r.matches.length ? 'related' : '';
  return `
  <div class="card ${cls}" style="--i:${i}" ${r.event ? `role="button" tabindex="0" data-event="${esc(r.event.id)}"` : ''}>
    <div class="card-row">
      ${monImg(r.name, r.image)}
      <div class="card-body">
        <div class="card-title">${esc(r.name)}</div>
        <div class="card-meta">${esc(r.types.join(' / '))}${r.cp ? ` · CP ${esc(r.cp.min)}–${esc(r.cp.max)}` : ''}${r.cpBoosted ? ` · Boosted ${esc(r.cpBoosted.max)}` : ''}</div>
      </div>
      ${r.endMs ? countdown(null, r.endMs) : '<div class="countdown"><span>Status</span><b>Active</b></div>'}
    </div>
    <div class="card-foot">
      ${r.exactMatches.length ? '<span class="badge watch">★ Watchlist</span>' : ''}
      ${tierBadge(r.tierKey)} ${formBadge(r.parsed)} ${shinyBadge(r.shiny)}
      ${r.weather.length ? `<span class="badge">Boost: ${esc(r.weather.join(', '))}</span>` : ''}
    </div>
    ${r.matches.filter((m) => m.level === 'related').map((m) => `<div class="match-line related">◇ ${esc(m.label)}: ${esc(m.reason)}</div>`).join('')}
  </div>`;
}

export function sourceLine(src) {
  return `Source: <a href="${safeUrl(src.url)}" target="_blank" rel="noopener">${esc(src.name)}</a> · data fetched ${esc(formatAgo(src.fetchedAt))}`;
}

export function eventSheet(ev) {
  const isWatchedMon = (m) => (ev.exactMatches || []).some((x) => x.reason.startsWith(m.name));
  const monTiles = (list) => `<div class="mons">${list.map((m) => `
      <div class="mon-tile ${isWatchedMon(m) ? 'watched' : ''}">
        ${monImg(m.name, m.image)}
        <div><b>${esc(m.name)}</b></div>
        <div class="small">${esc(describeForm(m.parsed))}</div>
        <div class="small">${m.shiny === true ? '✦ Shiny' : m.shiny === false ? 'No shiny' : 'Shiny: unconfirmed'}</div>
      </div>`).join('')}</div>`;
  const uniqueRewards = [...new Set(ev.rewards || [])];

  return `
    ${safeUrl(ev.image) ? `<img class="hero-img" src="${safeUrl(ev.image)}" alt="" referrerpolicy="no-referrer">` : ''}
    <h2 id="sheet-title">${esc(ev.name)}</h2>
    <div class="card-foot">
      ${ev.exactMatches?.length ? '<span class="badge watch">★ Watchlist match</span>' : ''}
      ${phaseBadge(ev.phase)} ${verificationBadge(ev.verification)} ${tierBadge(ev.raidTier)} ${costBadge(ev.cost)} ${flagBadges(ev.flags)}
    </div>
    ${matchLines(ev)}

    <h3>When (Europe/Oslo)</h3>
    <dl class="kv">
      <dt>Dates</dt><dd>${esc(formatRange(ev.startMs, ev.endMs))}</dd>
      <dt>Timing</dt><dd>${ev.start?.isLocalTime || ev.end?.isLocalTime ? 'Local time — the same clock time in every timezone' : ev.start ? 'Global — one moment worldwide, shown in Oslo time' : 'Not announced by the source'}</dd>
      <dt>Countdown</dt><dd>${countdown(ev.startMs, ev.endMs).replace('class="countdown', 'style="text-align:left" class="countdown')}</dd>
      <dt>Type</dt><dd>${esc(ev.categoryLabel)}${ev.heading && ev.heading !== ev.categoryLabel ? ` (${esc(ev.heading)})` : ''}</dd>
      <dt>Cost</dt><dd>${esc(ev.cost.label)} <span class="small">— ${esc(ev.cost.basis)}${ev.cost.note ? `. ${esc(ev.cost.note)}` : ''}</span></dd>
    </dl>

    ${ev.bosses?.length ? `<h3>Raid bosses</h3>${monTiles(ev.bosses)}
      <p class="small">Featured / exclusive attacks: not included in the data feed. Check the source link for confirmed moves.</p>` : ''}
    ${ev.spotlight ? `<h3>Spotlight${ev.spotlight.bonus ? ` · Bonus: ${esc(ev.spotlight.bonus)}` : ''}</h3>${monTiles(ev.spotlight.list)}` : ''}
    ${ev.spawns?.length ? `<h3>Featured spawns</h3>${monTiles(ev.spawns)}` : ''}
    ${ev.shinies?.length ? `<h3>Shiny available (per source)</h3><p class="small">${esc([...new Set(ev.shinies)].join(', '))}</p>` : ''}
    ${ev.bonuses?.length ? `<h3>Bonuses</h3><ul class="bullets">${ev.bonuses.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    ${ev.disclaimers?.length ? `<ul class="bullets small">${ev.disclaimers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    ${ev.research?.length ? `<h3>Special Research rewards</h3>
      ${ev.research.map((s) => `<p style="margin:8px 0 4px"><b>${esc(s.name)}</b></p>
        <ul class="bullets">${s.tasks.map((t) => `<li>${esc(t.text)} → ${esc(t.reward)}</li>`).join('')}
        <li><b>Completion:</b> ${esc(s.rewards.join(', '))}</li></ul>`).join('')}` : ''}
    ${!ev.research?.length && uniqueRewards.length ? `<h3>Rewards</h3><p>${esc(uniqueRewards.join(', '))}</p>` : ''}
    ${ev.promoCodes?.length ? `<h3>Promo codes</h3><p>${ev.promoCodes.map((c) => `<code>${esc(c)}</code>`).join(' ')}</p>` : ''}
    ${ev.notes?.length ? `<h3>Notes</h3><ul class="bullets">${ev.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}

    <div class="source-box">
      ${sourceLine(ev.source)}<br>
      <a href="${safeUrl(ev.source.url)}" target="_blank" rel="noopener">Open full details ↗</a>
    </div>`;
}
