# POGO RADAR

A free, mobile-first Pokémon GO tracker for raids, events and rewards, with a personal watchlist.
It is built for iPhone, runs in dark mode, and shows times in Europe/Oslo.

- **Raids**: current 5★, Mega and Shadow bosses with countdowns, form badges (regular vs Origin, Altered, Crowned and so on), shiny status, CP and weather boost.
- **Watchlist**: starts with Origin Palkia, Origin Dialga, Crowned Zacian, Elite Fast TM, Elite Charged TM and Rare Candy XL. You can add or remove Pokémon, items and events. Matches show *how* and *when* to get each target. A different form is shown as "related", never as a match.
- **Events and rewards**: Community Days, Raid Hours and Raid Days, GO Battle League (Master League highlighted), research, GO Tour and GO Fest, Spotlight Hours and Max Battles. Each event shows free/paid status and its basis, and special research rewards.
- **Automatic updates**: data is fetched every 2 hours. Every event shows its source link and when it was fetched.
- **Honest data**: events are labeled *Confirmed by source*, *Unverified* or *Unavailable*. Nothing is invented. Missing dates show as "TBA".

## How it works

```
GitHub Actions (every 2 h, free)            Your iPhone (Safari)
 ├─ npm test                                 ├─ loads app + data/feed.json
 ├─ scripts/fetch-data.mjs ──► feed.json     ├─ feed older than 3 h? → fetches ScrapedDuck live
 └─ deploy to GitHub Pages ────────────────► ├─ nothing reachable? → last copy saved on device
                                             └─ watchlist saved on device (localStorage)
```

There are no servers to run and nothing to pay for. There is no build step and there are no npm dependencies.

| Folder | What it is |
|---|---|
| `app/` | The website (HTML, CSS, JS). Published as-is. |
| `app/lib/` | Shared logic: time zones, name and form parsing, watchlist matching, normalization, sources. Used by both the browser and the updater. |
| `app/js/` | UI: pages, storage, data loading, notifications. |
| `scripts/fetch-data.mjs` | Fetches all sources and writes `app/data/feed.json`. |
| `tests/` | Automated tests (`npm test`). |
| `.github/workflows/update-and-deploy.yml` | Schedule, tests and deploy. |

## Data sources (checked October 2026)

| Source | Used? | Notes |
|---|---|---|
| **ScrapedDuck** (`raw.githubusercontent.com/bigfoott/ScrapedDuck/data/…`) | ✅ Main source | Scrapes LeekDuck.com *with permission*. Its terms allow free use as long as there is no paywall and no ads, and ScrapedDuck and LeekDuck are credited (the app does this). GitHub caches the files for 5 minutes, and the limit is 5,000 requests per hour. Browsers can fetch it directly (CORS allowed). Gives events with dates, raid bosses, shiny status, Community Day bonuses and special research rewards. |
| **Official Pokémon GO news** (`pokemongo.com/en/news`) | ⚠️ Best effort | There is no public API or documented feed. The updater reads only headlines and links, once every 2 hours. The parser is tolerant but **could not be tested against the live site** from the build environment. If it can't read the page, the Sources tab says *Unavailable* and links to the site. Browsers cannot fetch it directly (no CORS). |
| **PoGo API** (`pogoapi.net`) | ❌ Not used | It could not be verified from the build environment. Its raid boss list has not been reliably maintained in recent years, and it has no event schedule. It could be added later for move data. |

### Known limitations (honest list)
- **Featured raid attacks** are not in any free structured feed. The app says so and links to the source page.
- **GO Battle League rank rewards** (such as Elite TMs at certain ranks) are not in the feed. GBL weeks and cups are shown, and Master League is highlighted.
- **Elite TM detection** works by finding text in event bonuses, rewards and names. If a source only mentions an Elite TM inside a long article, the app may miss it.
- **Free/paid** labels are inferred from the event type unless the source states the cost. The basis is shown next to each label.
- **Background push notifications** need a push server, which is not in Version 1. Alerts are delivered while the app is open: as an in-app banner, plus a system notification if you allow it. The code is already structured for push (`computeAlerts()` and `app/js/notify.js`).
- **Images** are loaded from LeekDuck's image server, as provided in the feed. If an image is blocked, a lettered placeholder is shown.

## Deploy to your iPhone (free, about 5 minutes, no computer needed)

All steps work in Safari on iPhone. Use "Request Desktop Website" (the **aA** button) if a GitHub setting is hidden.

1. **Merge the code into your main branch.** The code is on branch `claude/pogo-radar-app-xn6gpu`.
   Open the repo on github.com. If GitHub offers **"Compare & pull request"**, tap it, then tap **Create pull request**, then **Merge**.
   (If this is the repo's only branch, it is already the default branch and you can skip this step.)
2. **Turn on GitHub Pages**: repo → **Settings** → **Pages** → under *Build and deployment*, set **Source** to **GitHub Actions**.
3. **Run the first deploy**: repo → **Actions** → **Update data & deploy** → **Run workflow**. Wait about 1 minute for a green tick.
4. **Open the app** at `https://<your-username>.github.io/<repo-name>/`. The link is also shown under Settings → Pages.
5. **Install it**: in Safari tap **Share** → **Add to Home Screen**. It then opens full-screen like a real app.

After that, everything runs automatically. GitHub refreshes the data every 2 hours (scheduled runs can be delayed a few minutes at busy times). The ↻ button in the app fetches live data at any time.

> Note: GitHub pauses scheduled workflows in repositories with no activity for 60 days. If the data stops updating, go to Actions and tap **Enable workflow** or **Run workflow**.
> If the repository is **private**, GitHub Pages needs a paid plan. Make the repo **public** (Settings → General → Danger Zone → Change visibility) to keep everything free. Your watchlist is never uploaded, so nothing personal is published.

## Run locally (optional, on a computer)

```bash
npm test          # run the automated tests
npm run fetch     # download fresh data to app/data/feed.json
npm start         # open http://localhost:8080
```

Requires Node.js 20 or newer. There is nothing to install.

## Credits
Event data © [LeekDuck.com](https://leekduck.com), delivered by [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck).
POGO RADAR is a free, non-commercial fan project. It is not affiliated with Niantic, Nintendo or The Pokémon Company.
Pokémon and Pokémon GO are trademarks of their respective owners.
