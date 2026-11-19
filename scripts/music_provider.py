"""Small JSON bridge for public YouTube Music metadata (no account cookies)."""
import json
import re
import sys
from dataclasses import asdict, is_dataclass
from ytmusicapi import YTMusic

def track(item):
    video_id = item.get('videoId')
    if not video_id or not re.fullmatch(r'[\w-]{11}', video_id):
        return None
    duration = item.get('duration_seconds') or 0
    if not duration:
        try:
            for part in str(item.get('duration', '0')).split(':'):
                duration = duration * 60 + int(part)
        except (ValueError, TypeError):
            duration = 0
    thumbs = item.get('thumbnails') or []
    return dict(id=video_id, title=item.get('title') or 'Untitled',
                artist=', '.join(a.get('name', '') for a in item.get('artists', [])) or 'YouTube Music',
                duration=duration, thumbnail=thumbs[-1]['url'] if thumbs else f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg',
                art='orbit', source='YouTube Music', album=(item.get('album') or {}).get('name'),
                explicit=bool(item.get('isExplicit')))

def normalize(items):
    result, seen = [], set()
    for item in items:
        t = track(item)
        if t and t['id'] not in seen:
            result.append(t)
            seen.add(t['id'])
    return result

def main():
    request = json.loads(sys.stdin.read())
    country = request.get('country', 'IN')
    yt = YTMusic(language='en', location=country if country != 'ZZ' else 'US')
    kind = request['kind']
    if kind == 'lyrics':
        video_id = request.get('query', '')
        if not re.fullmatch(r'[\w-]{11}', video_id):
            raise ValueError('Invalid track ID')
        watch = yt.get_watch_playlist(videoId=video_id, limit=1)
        browse_id = watch.get('lyrics')
        if not browse_id:
            return dict(available=False, lines=[], text='', source='')
        result = yt.get_lyrics(browse_id, timestamps=True)
        if not result:
            return dict(available=False, lines=[], text='', source='')
        result = asdict(result) if is_dataclass(result) else result
        content = result.get('lyrics', '')
        lines = []
        if isinstance(content, list):
            for line in content:
                line = asdict(line) if is_dataclass(line) else line
                lines.append(dict(text=line.get('text', ''), start=float(line.get('start_time', 0))/1000, end=float(line.get('end_time', 0))/1000))
        return dict(available=bool(content), lines=lines, text=content if isinstance(content, str) else '', source=result.get('source', ''), synced=bool(lines))
    if kind == 'search':
        return dict(tracks=normalize(yt.search(request['query'], filter='songs', limit=24)))
    if kind == 'charts':
        charts = yt.get_charts(request.get('country', 'IN'))
        videos = charts.get('videos') or []
        if isinstance(videos, dict):
            videos = videos.get('items', [videos])
        for entry in videos:
            playlist_id = entry.get('playlistId')
            if playlist_id:
                playlist = yt.get_playlist(playlist_id, limit=30)
                songs = normalize(playlist.get('tracks', []))[:30]
                if songs:
                    return dict(tracks=songs, title=entry.get('title') or playlist.get('title'),
                                source='YouTube Music charts', sourceUrl=f'https://music.youtube.com/playlist?list={playlist_id}')
        raise RuntimeError('YouTube Music did not return an available chart playlist for this region.')
    if kind == 'home':
        sections = []
        for row in yt.get_home(limit=6):
            contents = row.get('contents', [])
            songs = normalize(contents)
            if not songs:
                for entry in contents[:3]:
                    playlist_id = entry.get('playlistId')
                    if playlist_id:
                        try:
                            songs = normalize(yt.get_playlist(playlist_id, limit=12).get('tracks', []))
                        except Exception:
                            continue
                        if songs:
                            break
            if songs:
                sections.append(dict(title=row.get('title', 'Discover'), tracks=songs[:12]))
            if len(sections) >= 4:
                break
        if not sections:
            raise RuntimeError('YouTube Music did not return playable home recommendations.')
        return dict(sections=sections, tracks=normalize_flat(sections), source='YouTube Music', sourceUrl='https://music.youtube.com/')
    raise ValueError('Unknown metadata operation')

def normalize_flat(sections):
    return list({t['id']: t for s in sections for t in s['tracks']}.values())

if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=True))
    except Exception as error:
        print(json.dumps({'error': str(error)[:300]}))
        sys.exit(1)
