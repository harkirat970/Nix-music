"""Start Nix Music and its temporary HTTPS tunnel: python start.py."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parent
TUNNEL_URL = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com\b')


def read_env(path):
    if not path.exists():
        raise RuntimeError('Missing .env. Copy .env.example to .env and configure your bot first.')
    values = {}
    for raw in path.read_text(encoding='utf-8-sig').splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.removeprefix('export ').partition('=')
        if separator:
            values[key.strip()] = value.strip().strip('"\'')
    return values


def save_url(path, url):
    lines = path.read_text(encoding='utf-8-sig').splitlines()
    lines = [line for line in lines if not line.strip().startswith('PUBLIC_URL=')]
    lines.append('PUBLIC_URL=' + url)
    temporary = path.with_name('.env.launcher.tmp')
    try:
        temporary.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def redact(message, env):
    for key, value in env.items():
        if value and any(word in key.upper() for word in ('TOKEN', 'PASSWORD', 'MONGODB_URI')):
            message = message.replace(value, '[redacted]')
    return re.sub(r'mongodb(?:\+srv)?://[^\s]+', '[database connection redacted]', message)


def available_port(port):
    with socket.socket() as probe:
        probe.settimeout(1)
        return probe.connect_ex(('127.0.0.1', port)) != 0


def launch(command, env, messages, label):
    child = subprocess.Popen(
        command, cwd=ROOT, env=env, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace',
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        start_new_session=os.name != 'nt',
    )

    def pump():
        for line in child.stdout:
            messages.put((label, line.strip()))
        child.stdout.close()

    threading.Thread(target=pump, daemon=True).start()
    return child


def stop(child):
    if child is None:
        return
    if os.name == 'nt':
        if child.poll() is None:
            subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        import signal
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name != 'nt':
            import signal
            os.killpg(child.pid, signal.SIGKILL)
        else:
            child.kill()
        child.wait(timeout=5)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Start the Nix Music bot, Mini App, and temporary HTTPS tunnel.')
    parser.add_argument('--no-tunnel', action='store_true', help='Use the HTTPS PUBLIC_URL already in .env.')
    parser.add_argument('--check', action='store_true', help='Check configuration and installed dependencies without starting anything.')
    parser.add_argument('--demo', action='store_true', help='Local listener only; no Telegram polling, MongoDB, or tunnel.')
    parser.add_argument('--port', type=int, help='Override the local HTTP port.')
    args = parser.parse_args(argv)
    children = []
    try:
        if sys.version_info < (3, 11):
            raise RuntimeError('Python 3.11 or newer is required by the pinned music dependencies.')
        settings = read_env(ROOT / '.env')
        env = {**os.environ, **settings}
        if args.demo:
            env['DEMO_MODE'] = 'true'
        demo = env.get('DEMO_MODE', '').lower() == 'true'
        port = args.port if args.port is not None else int(env.get('PORT', '3000'))
        if not 1 <= port <= 65535:
            raise RuntimeError('PORT must be between 1 and 65535.')
        env['PORT'] = str(port)
        node = shutil.which('node')
        if not node:
            raise RuntimeError('Node.js is missing from PATH. Install Node.js 22 or newer.')
        version = subprocess.check_output([node, '--version'], text=True).strip()
        if int(version.lstrip('v').split('.')[0]) < 22:
            raise RuntimeError('Nix Music requires Node.js 22 or newer.')
        if not demo:
            for keys in [('TELEGRAM_BOT_TOKEN', 'BOT_TOKEN'), ('OWNER_ID', 'OWNER_IDS'), ('MONGODB_URI',)]:
                if not any(env.get(key) for key in keys):
                    raise RuntimeError('Missing ' + ' or '.join(keys) + ' in .env.')
            if not (ROOT / 'node_modules/mongodb').exists():
                raise RuntimeError('MongoDB driver is missing. Run npm install first.')
        if env.get('MUSIC_MODE', 'live') != 'sample':
            python = env.get('PYTHON_PATH') or next((str(ROOT / p) for p in (
                '.venv/Scripts/python.exe', '.venv/bin/python.exe', '.venv/bin/python'
            ) if (ROOT / p).exists()), shutil.which('python3') or sys.executable)
            check = subprocess.run([python, '-c', 'import sys; assert sys.version_info >= (3, 11); import ytmusicapi, yt_dlp'], capture_output=True)
            if check.returncode:
                raise RuntimeError('The music interpreter needs Python 3.11+ and requirements.txt. Check PYTHON_PATH and reinstall dependencies in that environment.')
            env['PYTHON_PATH'] = python
            if not (env.get('FFMPEG_PATH') or (ROOT / 'vendor/ffmpeg.exe').exists() or shutil.which('ffmpeg')):
                raise RuntimeError('FFmpeg is missing. Install it or set FFMPEG_PATH in .env.')
        tunnel_enabled = not demo and not args.no_tunnel
        tunnel = ROOT / 'vendor' / ('cloudflared.exe' if os.name == 'nt' else 'cloudflared')
        tunnel_exe = str(tunnel) if tunnel.exists() else shutil.which('cloudflared')
        if tunnel_enabled and not tunnel_exe:
            raise RuntimeError('cloudflared is missing. Install it, or use --no-tunnel with your own HTTPS URL.')
        if not demo and not tunnel_enabled and not env.get('PUBLIC_URL', '').startswith('https://'):
            raise RuntimeError('--no-tunnel requires an HTTPS PUBLIC_URL in .env.')
        print(f'Nix Music configuration OK. Node {version}. Mode: {"local preview" if demo else "Telegram bot"}.', flush=True)
        if args.check:
            print('Checks passed. Network credentials have not been tested. Run python start.py to start.')
            return 0
        if not available_port(port):
            raise RuntimeError(f'Port {port} is already in use. Stop the existing bot first; no process was terminated.')
        messages = queue.Queue()
        if tunnel_enabled:
            print('Creating temporary HTTPS tunnel...', flush=True)
            tunnel_process = launch([tunnel_exe, 'tunnel', '--url', f'http://127.0.0.1:{port}', '--no-autoupdate'], env, messages, 'tunnel')
            children.append(tunnel_process)
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if tunnel_process.poll() is not None:
                    raise RuntimeError('The tunnel exited before it provided a URL.')
                try:
                    _, line = messages.get(timeout=0.25)
                except queue.Empty:
                    continue
                match = TUNNEL_URL.search(line)
                if match:
                    env['PUBLIC_URL'] = match.group(0)
                    save_url(ROOT / '.env', env['PUBLIC_URL'])
                    print('Mini App URL: ' + env['PUBLIC_URL'], flush=True)
                    print('Group room links and private bot buttons use this URL automatically. Only the separate profile Main Mini App button needs its URL updated in BotFather.', flush=True)
                    break
            else:
                raise RuntimeError('Timed out creating the tunnel. Check your Internet connection.')
        server = launch([node, 'server.mjs'], env, messages, 'bot')
        children.append(server)
        print(f'Starting Nix Music on port {port}. Press Ctrl+C to stop everything.', flush=True)
        ready = False
        deadline = time.monotonic() + 90
        while True:
            for child in children:
                if child.poll() is not None:
                    while not messages.empty():
                        label, line = messages.get_nowait()
                        if label == 'bot':
                            print(redact(line, env), flush=True)
                    raise RuntimeError('A Nix Music process stopped. Both services are shutting down; review the messages above.')
            if not ready and time.monotonic() > deadline:
                raise RuntimeError('Bot startup timed out. Check MongoDB and Telegram connectivity.')
            try:
                label, line = messages.get(timeout=0.25)
            except queue.Empty:
                continue
            if label == 'bot':
                print(redact(line, env), flush=True)
                if 'Telegram polling started' in line or (demo and 'http://localhost:' in line):
                    ready = True
                    print('Nix Music is ready.', flush=True)
    except KeyboardInterrupt:
        print('\nStopping Nix Music...', flush=True)
        return 0
    except (RuntimeError, OSError, ValueError) as error:
        print('Startup error: ' + redact(str(error), locals().get('env', {})), file=sys.stderr)
        return 1
    finally:
        for child in reversed(children):
            stop(child)


if __name__ == '__main__':
    raise SystemExit(main())
