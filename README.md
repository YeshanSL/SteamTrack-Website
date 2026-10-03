# SteamTrack

Search any Steam player and see their summary, playtime, achievements, friend leaderboard, your position among friends, who is online right now, and a head-to-head compare. Built with HTML, CSS and vanilla JavaScript (ES modules) plus a tiny Node/Express proxy that keeps your Steam API key private.

## Folder structure

```
steamtrack/
├── server.js            Express proxy: holds the API key, validates input, caches, rate limits, CORS
├── package.json
├── .env.example         copy to .env and add your key
└── public/              the website (static files)
    ├── index.html
    ├── css/  base.css · components.css · animations.css · gaming.css
    └── js/   main.js · api.js · ui.js · charts.js · loader.js · bg.js · utils.js
```

## Setup

1. **Get a free Steam Web API key** at https://steamcommunity.com/dev/apikey (any domain name works, e.g. `localhost`).
2. Install Node.js 18 or newer.
3. In this folder run:
   ```bash
   npm install
   cp .env.example .env      # Windows: copy .env.example .env
   ```
4. Open `.env` and set `STEAM_API_KEY=your_key_here`.
5. Start it:
   ```bash
   npm start
   ```
6. Open http://localhost:3000

The key only ever lives in the server's environment. The browser never sees it.

## How searching works

- Enter a **custom URL name** (the `NAME` in `steamcommunity.com/id/NAME`), a **17-digit SteamID64**, or a full profile URL.
- Steam does not offer a search by display name, so display names are not supported.
- Share links look like `?user=NAME`.

## Tabs

- **Home**: boot-sequence loader, live summary dashboard (best golden game, active players, sale season, best player on Steam), top 3 games in each of 8 categories, trending now.
- **Stats**: search any player (custom URL name, SteamID64 or URL). Overview, friend leaderboard, online friends, achievements, game board, share card, track.
- **Leaderboard**: global board ranked by Steam level, playtime, games owned or last 2 weeks. Add players from the page.
- **Compare**: two players head to head.

Dark mode only. Palette: black, white, red.

## How the home dashboard is computed

- **Top 3 per category** = 60% live player count + 40% position in Steam's top sellers list (store featured categories). Games come from the curated lists in `CATEGORIES` in `server.js`; edit them freely.
- **Best golden game** = highest positive-review percentage (min 30,000 reviews) among the tracked games.
- **Active players** = live players summed across the tracked games. Steam's API has no single "all of Steam" number.
- **Sale season** = Steam's yearly sale calendar (dates are approximate, edit `SALES` in `server.js`) plus the live count of weekly deals.
- **Best player on Steam** = #1 on the SteamTrack global board by level.

## Global leaderboard

Steam has no global ranking API, so SteamTrack builds its own. Members are `SEED_IDS` (default: Gabe Newell) plus their public friends, plus every public profile anyone searches or adds. The list is saved in `data/board.json` (capped by `MAX_BOARD`, default 150). The more profiles are searched, the closer it gets to a real "top players" list. Add well-known high-level SteamID64s to `SEED_IDS` in `.env` (comma separated) to speed that up.

## Privacy limits (Steam's rules)

Steam only returns data for **public** profiles. If a profile, its game details or its friends list is private, SteamTrack shows a friendly explanation. To make your own profile public: Steam → Edit Profile → Privacy Settings → set My profile, Game details and Friends list to Public.

Friends with private game details are left out of the playtime rankings (they still count in the level ranking if their level is available). Only the first `MAX_FRIENDS` (default 60) public friends are analysed, because each friend costs Steam API calls.

## Configuration (.env)

| Variable | Default | Meaning |
|---|---|---|
| `STEAM_API_KEY` | none | Your Steam Web API key (required) |
| `PORT` | 3000 | Server port |
| `MAX_FRIENDS` | 60 | Friends analysed for the leaderboard |
| `RATE_LIMIT_PER_MIN` | 120 | Requests per IP per minute |
| `CORS_ORIGIN` | `*` | Restrict to your site's origin in production |

## Deploying

Any host that runs Node works (Render, Railway, Fly.io, a VPS).

1. Push this folder to a Git repo.
2. Create a Web Service, build command `npm install`, start command `npm start`.
3. Add `STEAM_API_KEY` as an environment variable in the host's dashboard (never commit `.env`).
4. If you host the frontend elsewhere, set `window.STEAMTRACK_API = "https://your-api-host/api"` before the module script in `index.html` and set `CORS_ORIGIN` to your site's URL.

## API endpoints (proxy)

`/api/resolve` · `/api/summary` · `/api/owned-games` · `/api/recent` · `/api/level` · `/api/badges` · `/api/friends` · `/api/friends-stats` · `/api/friends-game` · `/api/achievements` · `/api/player-count` · `/api/trending` · `/api/home` · `/api/leaderboard` · `/api/wishlist` · `/api/game-leaderboards`

## Notes

- Not affiliated with Valve. Steam and the Steam logo are trademarks of Valve Corporation.
- Wishlist and official game leaderboards rely on Steam endpoints that are not guaranteed; the site hides those sections when unavailable.
