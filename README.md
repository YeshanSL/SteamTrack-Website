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
    ├── css/  base.css · components.css · animations.css
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

## Features

- Cinematic loading screen (plays once per session, with Skip) and animated background
- Profile summary: status ring, level, country, account age, currently playing game
- Stat tiles with animated counters, recent games, top 10 most played, played vs unplayed donut, level and XP bar, wishlist (when available)
- Friend leaderboard: rank by playtime, games owned, Steam level or last 2 weeks; podium, filter, animated re-ranking, CSV export
- "Your position": rank, percentile, and the gap to the next rank
- Online friends panel that refreshes every 60 seconds
- Achievements: completion by game, rarest unlocked, global rarity
- Game board: friends ranked in a chosen game, live player count, and official leaderboards for games that expose them
- Compare two players side by side with winners highlighted and shared games
- Game detail modal, share card (PNG), copy link, tracked players, light/dark theme, accent colours

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

`/api/resolve` · `/api/summary` · `/api/owned-games` · `/api/recent` · `/api/level` · `/api/badges` · `/api/friends` · `/api/friends-stats` · `/api/friends-game` · `/api/achievements` · `/api/player-count` · `/api/trending` · `/api/wishlist` · `/api/game-leaderboards`

## Notes

- Not affiliated with Valve. Steam and the Steam logo are trademarks of Valve Corporation.
- Wishlist and official game leaderboards rely on Steam endpoints that are not guaranteed; the site hides those sections when unavailable.
