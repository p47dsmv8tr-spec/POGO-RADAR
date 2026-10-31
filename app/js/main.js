import { normalizeAll, CATEGORIES } from '../lib/normalize.js';
import { annotate, buildDashboard, enrichCurrentRaids, watchStatus, computeAlerts } from '../lib/dashboard.js';
import { createWatchItem, addWatchItem, removeWatchItem, ITEM_SYNONYMS } from '../lib/watchlist.js';
import { formatRange, formatAgo, formatDateTime, eventPhase } from '../lib/time.js';
import { loadData } from './data.js';
import { store } from './store.js';
import { deliver, notificationSupport, requestPermission } from './notify.js';
import {
  esc, eventCard, currentRaidCard, eventSheet, countdownInner, installImageFallback,
  whereLabel, monImg, TIER_LABEL,
} from './ui.js';

const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');

const state = {
  data: null,
  error: null,
  watchlist: store.getWatchlist(),
  ui: { eventFilter: 'all', eventPhase: 'active', eventQuery: '', raidFilter: 'all', addKind: 'pokemon' },
  derived: null,
};

// ---------- Derived data ----------
function derive() {
  if (!state.data) return null;
  const now = Date.now();
  const { events, raids } = normalizeAll(state.data.raw);
  const eventsSource = state.data.sources.find((s) => s.id === 'scrapedduck-events');
  for (const e of events) e.source.fetchedAt = eventsSource?.fetchedAt ?? state.data.loadedAt;
  const annotated = annotate(events, state.watchlist, now);
  const currentRaids = enrichCurrentRaids(raids, annotated, state.watchlist)
    .filter((r) => ['five', 'mega', 'shadow'].includes(r.tierKey));
  return {
    annotated, currentRaids,
    dash: buildDashboard(annotated, now),
    watch: watchStatus(state.watchlist, annotated, currentRaids),
    byId: new Map(annotated.map((e) => [e.id, e])),
  };
}

function refreshDerived() { state.derived = derive(); }

// ---------- Pages ----------
const section = (title, body, count) => `
  <section class="section">
    <div class="section-head"><h2>${esc(title)}</h2>${count != null ? `<span class="count">${esc(count)}</span>` : ''}</div>
    ${body}
  </section>`;
const cards = (list, empty, opts) => (list.length ? `<div class="stack">${list.map((e, i) => eventCard(e, i, opts)).join('')}</div>` : `<div class="empty">${esc(empty)}</div>`);

function pageHome() {
  const { dash, watch, currentRaids } = state.derived;
  const found = watch.filter((w) => w.found).length;
  const watchedRaidsNow = currentRaids.filter((r) => r.exactMatches.length);
  return `
    <div class="hero">
      <h1>${greeting()}, Trainer</h1>
      <p>${esc(formatDateTime(Date.now()))} · Europe/Oslo</p>
      <div class="stats">
        <div class="stat live"><b>${dash.live.length}</b><span>Live now</span></div>
        <div class="stat gold"><b>${found}/${watch.length}</b><span>Watch found</span></div>
        <div class="stat"><b>${dash.next.length}</b><span>Next 14 days</span></div>
      </div>
    </div>

    ${section('★ Watchlist matches',
      watchedRaidsNow.length || dash.watchHits.length
        ? `<div class="stack">${watchedRaidsNow.map((r, i) => currentRaidCard(r, i)).join('')}${dash.watchHits.map((e, i) => eventCard(e, i)).join('')}</div>`
        : `<div class="empty">None of your watchlist targets are in announced events right now. POGO RADAR checks every 2 hours.</div>`,
      dash.watchHits.length + watchedRaidsNow.length || null)}

    ${dash.watchRelated.length ? section('Related (not your exact target)', `<div class="stack">${dash.watchRelated.slice(0, 3).map((e, i) => eventCard(e, i)).join('')}</div>`) : ''}

    ${section('Live now', cards(dash.live.slice(0, 6), 'No live events in the data feed.'), dash.live.length)}
    ${dash.live.length > 6 ? '<p class="small" style="margin:8px 2px 0"><a href="#/events">See all live events →</a></p>' : ''}

    ${dash.endingSoon.length ? section('⏳ Ending within 48 h', cards(dash.endingSoon, '')) : ''}

    ${section('Raids', cards(dash.upcomingRaids.slice(0, 5), 'No raid schedule in the data feed.'), null)}
    <p class="small" style="margin:8px 2px 0"><a href="#/raids">All raids →</a></p>

    ${section('Important rewards & events', cards(dash.rewards.slice(0, 6), 'No highlighted rewards right now.'))}

    ${section('Coming up', cards(dash.next.slice(0, 6), 'Nothing announced for the next 14 days.'))}
    <p class="small" style="margin:16px 2px 0">Data from LeekDuck via ScrapedDuck${state.data.news?.length ? ' and official Pokémon GO news' : ''}. See <a href="#/sources">Sources</a> for status and update times.</p>`;
}

function greeting() {
  const h = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Oslo' }).format(new Date());
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const RAID_FILTERS = [['all', 'All'], ['five', '5★'], ['mega', 'Mega'], ['shadow', 'Shadow'], ['hour', 'Raid Hour/Day']];

function pageRaids() {
  const f = state.ui.raidFilter;
  const { currentRaids, annotated } = state.derived;
  const nowRaids = currentRaids.filter((r) => f === 'all' || r.tierKey === f)
    .sort((a, b) => b.exactMatches.length - a.exactMatches.length);
  const sched = annotated.filter((e) => e.category === 'raids' && e.phase !== 'ended')
    .filter((e) => f === 'all' || (f === 'hour' ? ['raid-hour', 'raid-day'].includes(e.raidTier) : e.raidTier === f))
    .sort((a, b) => (b.exactMatches.length - a.exactMatches.length) || ((a.startMs ?? Infinity) - (b.startMs ?? Infinity)));
  const live = sched.filter((e) => e.phase === 'live');
  const upcoming = sched.filter((e) => e.phase !== 'live');
  return `
    <h1 class="page-title">Raids</h1>
    <p class="page-sub">5★, Mega and Shadow raids. Regular and Origin/other forms are shown separately.</p>
    <div class="segmented" role="group" aria-label="Raid type">
      ${RAID_FILTERS.map(([k, l]) => `<button data-raidfilter="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}
    </div>
    ${f !== 'hour' ? section('In raids right now', nowRaids.length ? `<div class="stack">${nowRaids.map((r, i) => currentRaidCard(r, i)).join('')}</div>` : '<div class="empty">No matching bosses in the current raid list.</div>', nowRaids.length) : ''}
    ${section('Scheduled — live', cards(live, 'Nothing live for this filter.'), live.length)}
    ${section('Scheduled — upcoming', cards(upcoming, 'No upcoming raids announced for this filter.'), upcoming.length)}
    <p class="small" style="margin-top:14px">Featured attacks are not included in the free data feed. Open a raid to check its source page. Shiny availability is shown only when the source states it.</p>`;
}

function pageEvents() {
  const { annotated } = state.derived;
  const { eventFilter: cat, eventPhase: ph, eventQuery: q } = state.ui;
  const list = annotated
    .filter((e) => cat === 'all' || (cat === 'watch' ? e.exactMatches.length : cat === 'rewards' ? (e.flags.eliteTM || e.flags.rareCandyXL || e.research?.length || e.promoCodes?.length) : e.category === cat))
    .filter((e) => (ph === 'all' ? true : ph === 'live' ? e.phase === 'live' : ph === 'upcoming' ? ['upcoming', 'unscheduled'].includes(e.phase) : e.phase !== 'ended'))
    .filter((e) => !q || e.searchText.includes(q.toLowerCase()))
    .sort((a, b) => (a.phase === 'live' ? a.endMs : a.startMs ?? Infinity) - (b.phase === 'live' ? b.endMs : b.startMs ?? Infinity));
  const chipsList = [['all', 'All'], ['watch', '★ Watchlist'], ['rewards', 'Rewards'], ...Object.entries(CATEGORIES)];
  return `
    <h1 class="page-title">Events</h1>
    <p class="page-sub">Community Days, raids, GO Battle League, research, tours and more.</p>
    <input class="search" type="search" placeholder="Search events, Pokémon, rewards…" value="${esc(q)}" id="event-search" autocomplete="off">
    <div class="chips" role="group" aria-label="Category">
      ${chipsList.map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${cat === k}">${esc(l)}</button>`).join('')}
    </div>
    <div class="segmented" role="group" aria-label="Time">
      ${[['active', 'Live + upcoming'], ['live', 'Live'], ['upcoming', 'Upcoming'], ['all', 'All']].map(([k, l]) => `<button data-phase="${k}" aria-pressed="${ph === k}">${l}</button>`).join('')}
    </div>
    <div id="event-list">${cards(list, 'No events match these filters.')}</div>
    ${cat === 'gbl' ? '<p class="small" style="margin-top:12px">GO Battle League rank rewards (such as Elite TMs at certain ranks) are not in the data feed. Check the official season announcement linked from Sources.</p>' : ''}`;
}

function pageWatchlist() {
  const { watch } = state.derived;
  const k = state.ui.addKind;
  const suggestions = k === 'item' ? Object.keys(ITEM_SYNONYMS).map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase())).concat(['Charged TM', 'Fast TM', 'Rare Candy', 'Premium Battle Pass'])
    : k === 'event' ? ['Community Day', 'Raid Hour', 'Raid Day', 'GO Fest', 'GO Tour', 'Master League', 'Spotlight Hour']
      : ['Origin Palkia', 'Origin Dialga', 'Crowned Zacian', 'Crowned Zamazenta', 'Shadow Mewtwo', 'Necrozma', 'Kyogre', 'Groudon', 'Zekrom', 'Reshiram'];
  return `
    <h1 class="page-title">Watchlist</h1>
    <p class="page-sub">Saved on this device. Matching runs on every update.</p>
    <form class="add-form" id="add-form" autocomplete="off">
      <div class="segmented" role="group" aria-label="Type" style="margin:0">
        ${[['pokemon', 'Pokémon'], ['item', 'Item'], ['event', 'Event / keyword']].map(([v, l]) => `<button type="button" data-addkind="${v}" aria-pressed="${k === v}">${l}</button>`).join('')}
      </div>
      <div class="row">
        <input class="search" id="add-input" list="add-suggest" placeholder="${k === 'pokemon' ? 'e.g. Origin Giratina, Shadow Mewtwo' : k === 'item' ? 'e.g. Elite Fast TM' : 'e.g. Community Day'}" required>
        <button class="btn" type="submit">Add</button>
      </div>
      <datalist id="add-suggest">${suggestions.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <div class="form-error" id="add-error"></div>
      <p class="small" style="margin:0">Tip: write the form for Pokémon (“Origin Dialga”, “Crowned Zacian”). Without a form, all forms match.</p>
    </form>

    <div class="stack" style="margin-top:16px">
      ${watch.map((w, i) => watchCard(w, i)).join('')}
    </div>
    <p style="margin-top:18px"><button class="btn secondary" id="reset-watch" type="button">Reset to defaults</button></p>`;
}

function watchCard({ item, hits, inRaidsNow, found }, i) {
  const exact = hits.filter((h) => h.m.level === 'exact');
  const related = hits.filter((h) => h.m.level === 'related');
  const raidNow = inRaidsNow.filter((r) => r.exact);
  const raidRelated = inRaidsNow.filter((r) => !r.exact);
  const status = found ? '<span class="badge watch">Found</span>' : related.length || raidRelated.length ? '<span class="badge related">Related only</span>' : '<span class="badge">Not announced</span>';
  return `
  <div class="card watch-card ${found ? 'watched' : ''}" style="--i:${i}">
    <div class="watch-head">
      <div style="flex:1;min-width:0"><div class="watch-kind">${esc(item.kind === 'pokemon' ? 'Pokémon' : item.kind)}${item.form ? ` · ${esc(item.form)} form` : ''}</div><h3>${esc(item.label)}</h3></div>
      ${status}
      <button class="remove-btn" data-remove="${esc(item.id)}" aria-label="Remove ${esc(item.label)}">✕</button>
    </div>
    ${raidNow.map(({ raid }) => `<div class="hit exact" ${raid.event ? `data-event="${esc(raid.event.id)}"` : ''}>${monImg(raid.name, raid.image, 'thumb')}<div class="grow"><b>In ${esc(TIER_LABEL[raid.tierKey] || raid.tier)}s now</b>${raid.endMs ? `Until ${esc(formatDateTime(raid.endMs))}` : 'End date not listed'} · ${raid.shiny ? 'Shiny available' : raid.shiny === false ? 'No shiny' : 'Shiny unconfirmed'}</div></div>`).join('')}
    ${exact.slice(0, 4).map(({ e, m }) => hitRow(e, m, true)).join('')}
    ${!exact.length && !raidNow.length ? '<p class="small" style="margin:10px 0 0">No announced event includes this target yet.</p>' : ''}
    ${related.slice(0, 2).map(({ e, m }) => hitRow(e, m, false)).join('')}
    ${raidRelated.map(({ raid }) => `<p class="small" style="margin:8px 0 0">◇ ${esc(raid.name)} is in raids now — different form, not ${esc(item.label)}.</p>`).join('')}
  </div>`;
}

function hitRow(e, m, exact) {
  return `<div class="hit ${exact ? 'exact' : ''}" data-event="${esc(e.id)}">
    <div class="grow"><b>${exact ? '★ ' : '◇ '}${esc(e.name)}</b>
      ${exact ? `How: ${esc(whereLabel(m, e))} · ` : `${esc(m.reason)} · `}When: ${esc(formatRange(e.startMs, e.endMs))}
      ${e.verification !== 'confirmed' ? ' · <span style="color:var(--warn)">unverified</span>' : ''}</div>
    ${countdownSmall(e)}
  </div>`;
}
const countdownSmall = (e) => `<div class="countdown ${e.phase === 'live' ? 'live' : ''}" data-cd data-start="${e.startMs ?? ''}" data-end="${e.endMs ?? ''}" data-phase="${e.phase}">${countdownInner(e.startMs, e.endMs)}</div>`;

function pageSources() {
  const d = state.data;
  const notif = notificationSupport();
  const prefs = store.getPrefs();
  const news = (d.news || []).map((n) => {
    const text = n.title.toLowerCase();
    const hit = state.watchlist.find((w) => (ITEM_SYNONYMS[w.name.toLowerCase()] || [w.name.toLowerCase()]).some((p) => text.includes(p)));
    return { ...n, hit };
  });
  return `
    <h1 class="page-title">Sources</h1>
    <p class="page-sub">Where the data comes from, and when it was last updated.</p>
    <div class="list">
      ${d.sources.map((s) => `
        <div class="list-item">
          <span class="status-dot ${s.ok ? 'ok' : 'err'}"></span>
          <div class="grow">
            <div class="title">${esc(s.name)} ${s.kind === 'official' ? '<span class="badge official">Official</span>' : '<span class="badge">Community</span>'}</div>
            <div class="sub">${s.ok ? `OK · ${esc(s.count)} items · fetched ${esc(formatAgo(s.fetchedAt))} (${esc(s.fetchedAt ? formatDateTime(s.fetchedAt) : '—')}) · ${esc(s.via || '')}` : `<span style="color:var(--err)">Unavailable</span>: ${esc(s.error || 'unknown error')}`}</div>
            <div class="sub small"><a href="${esc(s.homepage || s.url)}" target="_blank" rel="noopener">${esc(s.homepage || s.url)}</a> — ${esc(s.terms || '')}</div>
          </div>
        </div>`).join('')}
    </div>
    <p class="small" style="margin:8px 2px">Scheduled feed built ${esc(d.generatedAt ? `${formatAgo(d.generatedAt)} (${formatDateTime(d.generatedAt)})` : 'never (loaded directly)')} · Mode: ${esc(d.mode)}</p>
    <p><button class="btn secondary" id="force-refresh" type="button">Refresh live now</button></p>

    ${section('Official Pokémon GO news', news.length
      ? `<div class="list">${news.map((n) => `<a class="list-item" href="${esc(n.url)}" target="_blank" rel="noopener">
          <div class="grow"><div class="title">${n.hit ? '<span class="badge watch">★</span> ' : ''}${esc(n.title)}</div>
          <div class="sub">${n.publishedAt ? esc(formatDateTime(n.publishedAt).replace(/, \d\d:\d\d$/, '')) : 'Date not shown'} · pokemongo.com</div></div></a>`).join('')}</div>`
      : `<div class="empty">Official news is unavailable right now (see status above). Read it directly at <a href="https://pokemongo.com/en/news" target="_blank" rel="noopener">pokemongo.com/en/news</a>.</div>`)}

    ${section('What the labels mean', `<div class="legend">
      <div><span class="badge confirmed">✓ Confirmed by source</span> Dates and details are listed by the source.</div>
      <div><span class="badge unverified">? Unverified</span> Listed, but dates or details are missing or “to be announced”.</div>
      <div><span class="badge unavailable">Unavailable</span> The source could not be reached. Nothing is guessed.</div>
      <div><span class="badge official">Official</span> From pokemongo.com. Community data comes from LeekDuck, which reports official announcements.</div>
      <div><span class="badge free">Free</span>/<span class="badge paid">Paid</span> Inferred from the event type unless the source says otherwise. Tap a badge for its basis.</div>
    </div>`)}

    ${section('Alerts', `<div class="list"><div class="list-item"><div class="grow">
      <div class="title">Watchlist alerts</div>
      <div class="sub">${notif.supported ? `Permission: ${esc(notif.permission)}. ` : 'This browser does not support notifications. On iPhone, add POGO RADAR to your Home Screen first (iOS 16.4+). '}
      Alerts are checked whenever the app is open. Background push alerts need a push server, which is not part of Version 1.</div></div>
      ${notif.supported ? `<button class="btn ${prefs.systemNotifications ? 'secondary' : ''}" id="toggle-notif" type="button">${prefs.systemNotifications ? 'Turn off' : 'Enable'}</button>` : ''}
    </div></div>`)}

    ${section('About', `<p class="small">POGO RADAR is a free, non-commercial fan tool. It is not affiliated with Niantic, Nintendo, The Pokémon Company or LeekDuck. Event data © LeekDuck.com, delivered by <a href="https://github.com/bigfoott/ScrapedDuck" target="_blank" rel="noopener">ScrapedDuck</a>. Pokémon images are loaded from LeekDuck's image server, as provided in the data feed. Pokémon and Pokémon GO are trademarks of their respective owners. No login, no tracking: your watchlist stays on this device.</p>`)}`;
}

// ---------- Router ----------
const PAGES = { home: pageHome, raids: pageRaids, events: pageEvents, watchlist: pageWatchlist, sources: pageSources };

function currentRoute() {
  const [, page = 'home', ...rest] = (location.hash || '#/home').split('/');
  return { page: PAGES[page] ? page : 'home', param: rest.join('/') };
}

function render({ keepScroll = false } = {}) {
  const { page } = currentRoute();
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === page) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (state.error && !state.data?.raw?.events?.length) {
    const failed = (state.data?.sources || []).filter((src) => !src.ok).map((src) => `<li>${esc(src.name)}: ${esc(src.error)}</li>`).join('');
    view.innerHTML = `<div class="empty" style="margin-top:20vh;text-align:left">⚠️ ${esc(state.error)}${failed ? `<ul class="bullets small" style="margin-top:10px">${failed}</ul>` : ''}<br><button class="btn" id="force-refresh">Try again</button></div>`;
    return;
  }
  if (!state.derived) return;
  const y = window.scrollY;
  view.innerHTML = `<div class="view-enter">${PAGES[page]()}</div>`;
  if (keepScroll) window.scrollTo(0, y);
}

function openEvent(id) {
  const ev = state.derived?.byId.get(id);
  if (!ev) return;
  $('#sheet-body').innerHTML = eventSheet(ev);
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  $('.sheet-panel').scrollTop = 0;
}
function closeSheet() {
  $('#sheet').hidden = true;
  document.body.style.overflow = '';
}

// ---------- Events ----------
function setWatchlist(list) {
  state.watchlist = list;
  store.setWatchlist(list);
  refreshDerived();
  render({ keepScroll: true });
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-event], [data-close]');
  if (!t) return;
  if (t.matches('[data-close]')) return closeSheet();
  if (t.dataset.remove) return setWatchlist(removeWatchItem(state.watchlist, t.dataset.remove));
  if (t.dataset.raidfilter) { state.ui.raidFilter = t.dataset.raidfilter; return render({ keepScroll: true }); }
  if (t.dataset.cat) { state.ui.eventFilter = t.dataset.cat; return render({ keepScroll: true }); }
  if (t.dataset.phase && t.closest('.segmented')) { state.ui.eventPhase = t.dataset.phase; return render({ keepScroll: true }); }
  if (t.dataset.addkind) { state.ui.addKind = t.dataset.addkind; render({ keepScroll: true }); return $('#add-input')?.focus(); }
  if (t.id === 'reset-watch') { store.resetWatchlist(); return setWatchlist(store.getWatchlist()); }
  if (t.id === 'force-refresh' || t.id === 'refresh-btn' || t.closest('#refresh-btn')) return refresh({ forceLive: true });
  if (t.id === 'toggle-notif') {
    const prefs = store.getPrefs();
    if (!prefs.systemNotifications && (await requestPermission()) !== 'granted') {
      toast({ title: 'Notifications not allowed', body: 'You can allow them in your browser or iOS settings.' });
    } else {
      store.setPrefs({ ...prefs, systemNotifications: !prefs.systemNotifications });
    }
    return render({ keepScroll: true });
  }
  if (t.dataset.event) return openEvent(t.dataset.event);
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'add-form') return;
  e.preventDefault();
  const input = $('#add-input');
  try {
    const item = createWatchItem(state.ui.addKind, input.value);
    if (state.watchlist.some((w) => w.id === item.id)) throw new Error(`${item.label} is already on your watchlist`);
    setWatchlist(addWatchItem(state.watchlist, item));
    toast({ title: 'Added to watchlist', body: item.label });
  } catch (err) {
    $('#add-error').textContent = err.message;
  }
});

let searchTimer;
document.addEventListener('input', (e) => {
  if (e.target.id !== 'event-search') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.ui.eventQuery = e.target.value.trim();
    const pos = e.target.selectionStart;
    render({ keepScroll: true });
    const el = $('#event-search');
    el.focus();
    el.setSelectionRange(pos, pos);
  }, 200);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-event]')) {
    e.preventDefault();
    openEvent(e.target.dataset.event);
  }
});
window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });
window.addEventListener('pogo-alert', (e) => toast(e.detail));

function toast({ title, body }) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${esc(title)}</b>${esc(body || '')}`;
  el.addEventListener('click', () => el.remove());
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 6000);
}

// ---------- Countdown ticker ----------
setInterval(() => {
  const now = Date.now();
  let phaseChanged = false;
  document.querySelectorAll('[data-cd]').forEach((el) => {
    const s = el.dataset.start ? +el.dataset.start : null;
    const en = el.dataset.end ? +el.dataset.end : null;
    const phase = eventPhase(s, en, now);
    if (phase !== el.dataset.phase) {
      el.dataset.phase = phase;
      el.classList.toggle('live', phase === 'live');
      phaseChanged = true;
    }
    el.innerHTML = countdownInner(s, en, now);
  });
  if (phaseChanged && $('#sheet').hidden) { refreshDerived(); render({ keepScroll: true }); }
}, 1000);

// ---------- Loading ----------
function showBanner(msg, isError = false) {
  const b = $('#banner');
  b.hidden = !msg;
  b.className = `banner${isError ? ' err' : ''}`;
  b.textContent = msg || '';
}

async function refresh({ forceLive = false } = {}) {
  const btn = $('#refresh-btn');
  btn.classList.add('spinning');
  try {
    state.data = await loadData({ forceLive });
    state.error = null;
    refreshDerived();
    const failed = state.data.sources.filter((s) => !s.ok && s.kind !== 'official');
    showBanner(state.data.warning || (failed.length ? `Some sources are unavailable: ${failed.map((s) => s.name).join(', ')}. See Sources.` : ''), state.data.mode === 'cache' || !state.data.raw.events.length);
    if (!state.data.raw.events.length) state.error = 'No event data could be loaded. All sources are unavailable and nothing is saved on this device yet.';
    render({ keepScroll: true });
    deliver(computeAlerts(state.derived.annotated));
  } catch (err) {
    state.error = `Could not load data: ${err.message}`;
    render();
  } finally {
    btn.classList.remove('spinning');
  }
}

installImageFallback();
refresh();
// Re-check every 30 minutes while the app stays open.
setInterval(() => refresh(), 30 * 60e3);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.data && Date.now() - state.data.loadedAt > 15 * 60e3) refresh();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}

// Exposed for debugging in the browser console.
window.pogoRadar = { state };
