# Nix Music setup

## Requirements

| Component | Requirement |
| --- | --- |
| Python | 3.11+; locally tested with 3.14.5 |
| Node.js and npm | Node.js 22+; install Node packages with `npm ci` |
| Python packages | Pinned in `requirements.txt` |
| FFmpeg | `ffmpeg` and `ffprobe` available on PATH |
| cloudflared | Required for temporary tunnels; optional with your own HTTPS hosting |
| MongoDB | Reachable Atlas cluster or a separately running MongoDB instance |
| Telegram | Bot token and your numeric owner ID |
| Network | Access to Telegram, MongoDB, music sources, and Cloudflare when tunneling |

The launcher uses Python's standard library. The bot/server and MongoDB driver run in Node.js. Installing Python packages alone is not sufficient. Linux code paths are supported but have not been verified on a Linux host in this workspace.

## Linux

First install Python 3.11+ with its venv support, Node.js 22+ with npm, FFmpeg, and cloudflared for your distribution. Verify:

```bash
python3 --version
node --version
npm --version
ffmpeg -version
ffprobe -version
cloudflared --version
```

From the repository directory:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m pip check
npm ci
cp .env.example .env
```

Copy the example only on a fresh installation; preserve an existing `.env`. Edit the configuration before starting:

```bash
.venv/bin/python start.py --check
.venv/bin/python start.py
```

## Windows PowerShell

Install Python 3.11+, Node.js 22+ with npm, FFmpeg, and cloudflared. Reopen the terminal after changing PATH. From the repository directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
npm ci
Copy-Item .env.example .env
```

Copy the example only if you do not already have `.env`. After configuring it:

```powershell
.\.venv\Scripts\python.exe start.py --check
.\.venv\Scripts\python.exe start.py
```

The launcher also recognizes the MSYS-style `.venv/bin/python.exe` used in the original development workspace. Do not transfer virtual environments between operating systems.

## Configuration

Set these in `.env`:

```dotenv
DEMO_MODE=false
MUSIC_MODE=live
TELEGRAM_BOT_TOKEN=your_bot_token
OWNER_ID=your_numeric_telegram_id
MONGODB_URI=your_mongodb_connection_string
MONGODB_DATABASE=nix_music
PORT=3000
```

Allow the deployment server to reach your MongoDB cluster. Leave `PYTHON_PATH`, `FFMPEG_PATH`, and `YT_DLP_PATH` blank for auto-detection unless you need custom locations. The `imageio-ffmpeg` Python package does not automatically configure the bot's FFmpeg executable.

The temporary tunnel writes `PUBLIC_URL` automatically. Group room invitations open the bot's private chat, which provides a fresh Mini App button for the current URL. Telegram's separate profile Main Mini App button still uses the URL configured in BotFather.

For permanent hosting, set `PUBLIC_URL` to your HTTPS origin, configure a reverse proxy to the local app port, and run `python start.py --no-tunnel`. Use the appropriate virtual-environment interpreter shown above. Keep the process running with a service manager for unattended hosting.

Optional Netscape-format cookies go in `cookies/cookies.txt`. `.env`, cookies, cache, virtual environments, dependencies, and local binaries are excluded from Git; a fresh checkout must install its own dependencies.

`--check` validates local prerequisites. It does not prove Telegram credentials, MongoDB connectivity, music extraction, or public HTTPS access work. Test those after startup. The retained media cache is capped at 100 MB; extraction also needs temporary working disk space.
