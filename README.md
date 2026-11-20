# Nix Music — Telegram music, together

Fresh installation: see [SETUP.md](SETUP.md) for Python 3.11+, Node.js, FFmpeg, cloudflared, MongoDB, and Windows/Linux setup. Python package pins and system requirement notes are in [requirements.txt](requirements.txt).

## Optional yt-dlp cookies

Place a Netscape-format export at `cookies/cookies.txt`. The bot checks for it on each extraction; no restart is needed when adding or replacing the file. Override the path with `YT_DLP_COOKIES_FILE` in `.env` if needed. Cookie exports are excluded from Git and Docker images. See [cookies/README.md](cookies/README.md) for details.

## Start everything with one command

```powershell
python start.py
```

The launcher reads `.env`, checks dependencies, creates a temporary HTTPS tunnel, saves its URL, and starts the app and Telegram bot with MongoDB. It runs from any working directory. Keep the terminal open; Ctrl+C stops the server, its workers, and the tunnel. It refuses to start if the port is already occupied instead of killing another process.

The bot menu URL updates automatically. Each fresh temporary tunnel has a new URL: paste the printed URL into BotFather's **Main Mini App** settings too. For a permanent HTTPS domain, use `python start.py --no-tunnel`. Use `python start.py --check` for offline setup checks, or `python start.py --demo --port 3001` for a local preview without the real bot or database. The launcher uses your existing Atlas database; it does not install or launch a separate database server.

A responsive liquid-glass Telegram Mini App and bot, backed by Node.js, MongoDB, yt-dlp and FFmpeg. Includes desktop and mobile layouts inspired by the supplied reference images. Artwork is original CSS; demo audio is synthesized in the browser.

## Live music (updated)

Home now loads YouTube Music recommendation shelves, including songs from recommended playlists. Trending loads the actual regional chart playlist, preserving its source title and track order. India, Global, US, and UK are available. Search uses YouTube Music's song filter and returns titles, artists, albums, duration, and artwork. Playback uses yt-dlp and FFmpeg, including in local-listener mode.

`DEMO_MODE=true` now only controls local authentication and in-memory profile storage. **It no longer selects fake music.** `MUSIC_MODE=live` is the default; set `MUSIC_MODE=sample` explicitly for offline generated audio and sample data.

This workspace has a project-local Python virtual environment and Windows FFmpeg in `vendor/ffmpeg.exe`, with `.env` configured for live music and local authentication. Start it with:

```powershell
node --env-file=.env server.mjs
```

For a fresh machine, install dependencies with `python -m venv .venv` and the virtual environment's Python: `python -m pip install -r requirements.txt`. Install FFmpeg or set `FFMPEG_PATH` to its executable. Set `PYTHON_PATH` if your virtual environment is outside the automatically detected locations. Docker installs these dependencies automatically.

Home and charts refresh on request after 30 minutes; searches cache for 10 minutes. Refresh timestamps and source links are visible. A failed refresh can show the last successful cached result with a warning. There is no automatic fallback to fabricated songs or charts. These are public, unauthenticated YouTube Music recommendations, not recommendations from a listener's personal YouTube account. ytmusicapi is an unofficial client and upstream changes can affect availability.

Verified locally: live Home recommendations, India charts, YouTube Music search, yt-dlp download, FFmpeg MP3 conversion, and signed/range audio delivery. `node scripts/live-smoke.mjs` exercises these against a running local-listener server, including downloading one song. Telegram/MongoDB production setup is still required separately.

## Try the offline sample mode

Node.js 22+ is required. No packages or credentials are needed for the demo.

```powershell
$env:DEMO_MODE='true'
$env:MUSIC_MODE='sample'
node server.mjs
```

Open http://localhost:3000. The demo binds to loopback only, uses an in-memory sample account, and plays original 30-second ambient previews. Demo state disappears on restart; owner actions are disabled. The sample track titles are design content, not commercial recordings. Search the sample catalog by title or genre.

## Run your real bot

1. Create a bot using Telegram's **@BotFather**. Copy `.env.example` to `.env` and set `DEMO_MODE=false`.
2. Set `BOT_TOKEN`, `BOT_USERNAME` (without `@`), `OWNER_IDS` (your numeric Telegram ID; comma-separated for multiple owners), `PUBLIC_URL` (your HTTPS origin), and MongoDB connection details. Do not commit `.env` or put the bot token in browser code. The bot's `/id` command reports your numeric ID once running; you may use an existing trusted Telegram ID utility for initial setup.
3. Install Docker and run `docker compose up --build -d`. The compose file starts MongoDB on an internal network and binds the app to `127.0.0.1:3000` on the host. Put your HTTPS reverse proxy in front of this port, on the same server. MongoDB is not exposed on the host.
4. In BotFather, enable the bot's **Main Mini App** and set its URL to `PUBLIC_URL`. This is needed for `https://t.me/<bot>?startapp=room_<id>` room links. The running bot automatically configures its menu button and command list.
5. Add the bot to a group. Use `/room` to create a group-bound room, or `/start` to open the app. Make the bot a group administrator for reliable `getChatMember` checks. Privacy mode can remain enabled; commands are sufficient.
6. Open the Mini App from Telegram while logged into an ID in `OWNER_IDS`. The owner console appears automatically. It can ban/unban users, block groups and leave them, and send a reviewed announcement to all active unblocked groups.

For installation without Docker: install Node.js 22+, MongoDB, Python, yt-dlp and FFmpeg; run `npm install`, then `npm start`. Ensure `yt-dlp` and `ffmpeg` are in PATH, or set `YT_DLP_PATH` to the executable. MongoDB must be reachable through `MONGODB_URI`. yt-dlp sometimes requires updates or additional YouTube authentication/runtime configuration; consult its upstream documentation. No user cookies are collected by this app.

## Included behavior

- Home, mood filters, Search, editorial Trending, Telegram Profile, playlists, liked songs, a persistent mini player and expanded player.
- Play/pause, seek, previous/next, shuffle, repeat, volume, and generated demo audio.
- Production YouTube search through yt-dlp, bounded audio extraction to MP3 through FFmpeg, signed media URLs, HTTP range playback, and daily cache expiry.
- One shared room per Telegram group, invitations, listener presence, and an ordered song queue. The server advances songs automatically; devices poll every three seconds and correct drift over 1.5 seconds. Rooms exist only for Telegram groups and support everyone or admins-only controls. There is no public room directory or private room creation. Users may need to tap play to allow audio on mobile browsers.
- User ID display and copying; profiles, saved track metadata, playlists, user bans and group bans persist in MongoDB.
- `/start`, `/room`, `/play song name`, `/pause`, `/resume`, `/skip`, `/queue`, `/settings`, `/id`, `/help`, automatic group registration, and refusal to remain in blocked groups.
- Server-validated Telegram initData, one-hour server sessions, role checks on every owner operation, expiring media tickets, bounded subprocess concurrency and per-user API limits. Demo mode cannot grant owner access.

## Important boundaries

- **Music plays on each participant's device in the Mini App.** The bot does not inject audio into Telegram group voice calls. That requires a separate MTProto/userbot voice transport and account setup.
- Home and Trending use live YouTube Music data by default; editorial samples exist only in explicitly selected offline sample mode. No fabricated popularity counts are displayed. There is no lyrics provider, paid plan, follow graph, or social feed.
- Playback, queues, sessions, search results and in-flight broadcasts live in one server process and reset on restart. Group room links and the admins-only setting persist in MongoDB. Deploy a single replica; shared playback persistence and a durable broadcast worker would be needed for horizontal scaling and resumable campaigns.
- A blocked group is left immediately and cannot create or join group-bound rooms. Unblocking permits it to be added again; it does not automatically rejoin. User bans revoke API/media access on subsequent requests; an already downloaded audio buffer cannot be recalled.
- Group broadcasts send plain text, pace delivery, handle Telegram retry-after once, and report sent/failed counts. The owner must review and confirm each message. They are not automatically retried after a server restart.
- Playback is best-effort synchronization, not sample-accurate streaming. Mobile operating systems may suspend background tabs. Only use audio you are authorized to access or distribute.

## Checks

```text
node --test
node --check server.mjs
node --check public/app.js
```

With the demo server running, `node scripts/smoke.mjs` checks session/owner gates, search, playback metadata, playlist storage, group-only creation gates, hidden group rooms, and static routes. It creates demo-only test state.

Live Telegram, MongoDB and Docker have not been exercised in this workspace. Live YouTube Music metadata, yt-dlp and FFmpeg have been verified locally. The local listener does not prove Telegram/MongoDB production integration.

## Primary references

- [Telegram Mini Apps and initData validation](https://core.telegram.org/bots/webapps)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [yt-dlp configuration](https://github.com/yt-dlp/yt-dlp)
- [YouTube Music charts via ytmusicapi](https://ytmusicapi.readthedocs.io/en/stable/reference/explore.html)

## Group music controls

Make the bot a group administrator so it can reliably verify members and their roles. Send `/room` or `/play song name` in the group, then open the **Join group room** button. Everyone opening that link joins the same room automatically. When Telegram supplies signed group context, opening the Mini App also selects that group's room. Telegram cannot automatically open the app for every group member; each listener must open it and may need to tap Play once.

- `/play song name`: start the first song or append another to the shared queue.
- `/pause`, `/resume`, `/skip`: control shared playback.
- `/queue`: show the current song and waiting songs.
- `/settings`: show control permissions and buttons for group admins.
- `/settings admins`: allow only group admins and the bot owner to add songs, pause, resume, skip, or seek.
- `/settings everyone`: allow all current group members to control music (the default).

The Mini App room also has an admin-only control toggle. Listening members can mute audio on their own device without pausing the group. Audio plays on each device, not in a Telegram group voice call. Synchronization is best effort and may be affected by background suspension or buffering.

Group setup: private `/start` includes **Add to group**, which requests administrator status through Telegram's group picker. The server checks the bot's own administrator status before group room access or playback, and checks again after preparing a song. Demotion pauses active group playback. New groups explicitly save admin-only controls as **Off**; a group admin's saved choice is retained. Use `/settings everyone` to turn off an existing restriction. The room shows listener/queue counts, an accessible On/Off control switch, and a separate device mute button.

Rooms are scoped to Telegram groups: each group has its own playback and queue. Only verified members can join its room. Opening the Mini App privately does not join a room; use the group’s room button to listen together. `/room` in private chat explains group setup instead of creating a public room. Leaving a room returns to independent listening.

### Tunnel-safe group links

New group invitations use `?start=room_ID`. They open the bot in private chat (press Start if prompted), where membership is verified and an **Open group room** Mini App button is sent with the currently running tunnel URL. Opening that button joins the group room automatically. This flow does not use BotFather’s Main Mini App URL; the profile’s separate Open App button still uses that setting. After a tunnel restart, reopen the group invitation to obtain a fresh button. Old `startapp` invitations must be replaced by sending `/room` again.

The retained audio cache is capped at 100 MB (100,000,000 bytes), including metadata. Oldest files are evicted before new tracks enter the cache, on startup, and during the minute-by-minute cleanup. Downloads and conversion use temporary staging outside the cache, removed after each operation; transient working disk usage can exceed 100 MB while extracting music.

## Black theme and queue behavior

The app uses a pure-black background, dark bordered controls, short transitions, and reduced-motion support. Continuous decorative glow/equalizer animations and backdrop blur are disabled. Room heartbeats update playback timing without rebuilding unchanged player and queue elements.

The queue panel separates the current song from upcoming songs. Personal playback follows a queue built from the selected list, supports removing upcoming songs, and stops when the queue finishes. Shuffle changes the upcoming order. Group queues remain shared; removing a queued track follows the group's control permissions and rejects stale edits. Queue panels support Escape, keyboard focus containment, and returning to the full player.
