# Finds the big plays and key moments in each game's broadcast with Google Gemini, for the game recap.
# Run by the "Game moments" workflow. Needs the GEMINI_API_KEY secret (free key from Google AI Studio).
#
# - Works from files the other workflow already keeps: videos.json (which stream goes with which game),
#   season.json and archive.json (scores, teams, coaches). Reads 1 database document per run (the league doc,
#   for the commissioner's "Redo" requests) and nothing else.
# - One game per run, newest finals first, then the backlog of older broadcasts. Streams are sent in
#   40-minute pieces at low resolution so each request stays small, with a daily cap on video hours to stay
#   inside the free tier.
# - Writes moments.json: the site loads it for free and shows "Key moments" on the game page, each one a
#   link that jumps to that spot in the stream.
import json, os, re, sys, time, urllib.request, urllib.parse, urllib.error

NOW = time.time()
KEY = os.environ.get('GEMINI_API_KEY', '').strip()
MODELS = [m for m in [os.environ.get('GEMINI_MODEL', '').strip(), 'gemini-flash-latest', 'gemini-2.5-flash'] if m]
DAILY_HOURS = float(os.environ.get('MOMENTS_DAILY_HOURS') or 6)    # free tier allows about 8 hours of YouTube a day
CHUNK = 40 * 60
MAX_MOMENTS = 14
KINDS = {'td': '🏈', 'fg': '🥅', 'safety': '🛡️', 'turnover': '🔄', 'big': '💥', 'stop': '🧱', 'twopt': '✌️', 'final': '🏁', 'other': '⭐'}


def load(path, default):
    try:
        return json.load(open(path))
    except Exception:
        return default


def http(url, body=None, headers=None, timeout=300):
    rq = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                headers={'Content-Type': 'application/json', **(headers or {})})
    with urllib.request.urlopen(rq, timeout=timeout) as r:
        return json.load(r)


def iso_secs(d):   # YouTube ISO 8601 duration -> seconds
    m = re.match(r'P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', d or '')
    if not m: return 0
    dd, h, mi, s = (int(x or 0) for x in m.groups())
    return dd * 86400 + h * 3600 + mi * 60 + s


def durations(ids):
    k = os.environ.get('YT_API_KEY')
    if not k or not ids: return {}
    q = urllib.parse.urlencode({'part': 'contentDetails', 'id': ','.join(ids), 'key': k})
    r = http('https://www.googleapis.com/youtube/v3/videos?' + q)
    return {it['id']: iso_secs(it['contentDetails'].get('duration')) for it in r.get('items', [])}


def league_doc():
    """The commissioner's Redo requests live on the league doc (1 read)."""
    try:
        cfg = open('firebase-config.js').read()
        api = re.search(r'apiKey\s*:\s*["\']([^"\']+)', cfg).group(1); pid = re.search(r'projectId\s*:\s*["\']([^"\']+)', cfg).group(1)
        if 'PASTE' in api or not pid: return {}
        d = http(f'https://firestore.googleapis.com/v1/projects/{pid}/databases/(default)/documents/meta/league?key={api}&mask.fieldPaths=momRedo', timeout=30)
        f = (d.get('fields') or {}).get('momRedo', {}).get('mapValue', {}).get('fields', {})
        return {'momRedo': {k: int(v.get('integerValue') or float(v.get('doubleValue') or 0)) for k, v in f.items()}}
    except Exception as e:
        print('moments: league doc skipped:', repr(e)[:150])
        return {}


def ask(model, url, start, end, ctx):
    prompt = f"""This is part of a livestream of a College Football 27 video game (an online dynasty league).
{ctx}
This request covers the stream from {start} to {end} seconds. The stream may include pregame talk, menus or
other games before or after this one: only report plays from the game described above.
List the key moments in this part: touchdowns, field goals, safeties, turnovers (interceptions, fumbles,
turnovers on downs), long gains (25+ yards), big defensive stops, two-point tries, and the end of the game.
Use the on-screen scoreboard to tell which team scored and what the score became.
Reply with JSON only, shaped like:
{{"moments": [{{"t": <seconds from the very start of the stream>, "kind": "td|fg|safety|turnover|big|stop|twopt|final|other",
"team": "home|away|null", "q": <quarter 1-4, 5 for OT, or null>, "score": "<away>-<home> after the play, or null",
"text": "<one short sentence, under 14 words, e.g. 'Smith 45-yard TD pass to Jones'>"}}]}}
If nothing from this game happens in this part, reply {{"moments": []}}."""
    body = {'contents': [{'parts': [
        {'file_data': {'file_uri': url, 'mime_type': 'video/*'},
         'video_metadata': {'start_offset': f'{start}s', 'end_offset': f'{end}s', 'fps': 0.5}},
        {'text': prompt}]}],
        'generationConfig': {'responseMimeType': 'application/json', 'mediaResolution': 'MEDIA_RESOLUTION_LOW', 'temperature': 0.2}}
    r = http(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', body, {'x-goog-api-key': KEY}, timeout=600)
    txt = ''.join(p.get('text', '') for c in r.get('candidates', []) for p in (c.get('content') or {}).get('parts', []))
    m = re.search(r'\{.*\}', txt, re.S)
    out = json.loads(m.group(0)) if m else {}
    return out.get('moments') or []


def clean(raw, vid, start, end, part_len):
    out = []
    for x in raw:
        try:
            t = int(float(x.get('t')))
        except Exception:
            continue
        # The model sometimes counts from the start of the piece instead of the stream: fix that up.
        if t < start - 60 and 0 <= t <= (end - start) + 60: t += start
        if t < 0 or t > part_len + 30: continue
        kind = x.get('kind') if x.get('kind') in KINDS else 'other'
        text = re.sub(r'\s+', ' ', str(x.get('text') or '')).strip()[:110]
        if not text: continue
        side = x.get('team') if x.get('team') in ('home', 'away') else None
        q = x.get('q') if isinstance(x.get('q'), int) and 1 <= x.get('q') <= 9 else None
        sc = x.get('score') if isinstance(x.get('score'), str) and re.match(r'^\d+-\d+$', x.get('score') or '') else None
        out.append({'v': vid, 't': max(0, t - 8), 'k': kind, 's': side, 'q': q, 'sc': sc, 'x': text})   # start a few seconds early
    return out


def pick(ms):
    ms.sort(key=lambda m: (m['v_i'], m['t']))
    keep = []
    for m in ms:   # the same play reported twice (overlapping pieces, or a replay)
        if keep and keep[-1]['v'] == m['v'] and abs(keep[-1]['t'] - m['t']) < 25 and keep[-1]['k'] == m['k']: continue
        keep.append(m)
    if len(keep) > MAX_MOMENTS:   # scoring plays, turnovers and the finish first, then the biggest of the rest
        rank = {'td': 0, 'turnover': 1, 'final': 1, 'fg': 2, 'safety': 2, 'stop': 3, 'twopt': 3, 'big': 4, 'other': 5}
        top = sorted(keep, key=lambda m: rank.get(m['k'], 5))[:MAX_MOMENTS]
        keep = [m for m in keep if m in top]
    for m in keep: m.pop('v_i', None)
    return keep


def run():
    if not KEY:
        print('moments: no GEMINI_API_KEY secret yet; nothing to do'); return
    vids = load('videos.json', {})
    season, archive = load('season.json', {}), load('archive.json', {})
    teams = {t['id']: t for t in (season.get('teams') or []) + (archive.get('teams') or []) if isinstance(t, dict) and t.get('id')}
    games = {g['id']: g for g in (archive.get('games') or []) + (season.get('games') or []) if not g.get('deleted')}
    state = load('moments.json', {})
    done, fails = state.setdefault('games', {}), state.setdefault('fails', {})
    day = time.strftime('%Y-%m-%d', time.gmtime(NOW))
    q = state.get('quota') or {}
    if q.get('day') != day: q = {'day': day, 'sec': 0}
    state['quota'] = q
    redo = league_doc().get('momRedo', {})

    def vlist(g):
        v = g.get('video')
        if v == 'none': return []
        raw = v or (vids.get('links') or {}).get(g['id']) or []
        raw = raw if isinstance(raw, list) else [raw]
        when = {x['id']: x.get('d', 0) for x in vids.get('videos', [])}
        return sorted([x for x in raw if x], key=lambda x: when.get(x, 0))

    todo = []
    for gid, g in games.items():
        if g.get('homeScore') is None or g.get('awayScore') is None or g.get('forfeit'): continue
        vl = vlist(g)
        if not vl: continue
        have = done.get(gid)
        want_redo = redo.get(gid, 0) > (have or {}).get('at', 0) * 1000
        if have and have.get('vids') == vl and not want_redo: continue
        f = fails.get(gid) or {}
        if f.get('n', 0) >= 3 and not want_redo: continue
        if f and NOW - f.get('last', 0) < 6 * 3600 * f.get('n', 1) and not want_redo: continue
        todo.append((0 if want_redo else 1, -(g.get('playedAt') or 0), -g.get('season', 0), -(g.get('week') or 0), gid, vl))
    if not todo:
        print('moments: up to date')
        if state != load('moments.json', {}): json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
        return
    todo.sort()
    _, _, _, _, gid, vl = todo[0]
    g = games[gid]
    lens = durations(vl)
    total = sum(lens.get(v) or 3 * 3600 for v in vl)
    if q['sec'] + total > DAILY_HOURS * 3600:
        print(f'moments: daily video budget used ({q["sec"] / 3600:.1f}h); {len(todo)} game(s) waiting'); return
    A, H = teams.get(g['away'], {}), teams.get(g['home'], {})
    nm = lambda t, tid: t.get('name') or tid.replace('-', ' ').title()
    coach = lambda side, t: g.get(side + 'Coach') or t.get('coach') or 'CPU'
    ctx = (f"The game: {nm(A, g['away'])} ({A.get('abbr', '')}, coached by {coach('away', A)}) is the AWAY team; "
           f"{nm(H, g['home'])} ({H.get('abbr', '')}, coached by {coach('home', H)}) is the HOME team"
           f"{' (neutral site)' if g.get('neutral') else ''}. Final score: away {g['awayScore']}, home {g['homeScore']}.")
    print(f"moments: {gid} — {nm(A, g['away'])} @ {nm(H, g['home'])}, {len(vl)} part(s), {total / 60:.0f} min")
    found, used, used_model = [], 0, MODELS[0]
    try:
        for i, v in enumerate(vl):
            L = lens.get(v) or 3 * 3600
            url = f'https://www.youtube.com/watch?v={v}'
            for s in range(0, L, CHUNK):
                e = min(L, s + CHUNK + 60)   # a minute of overlap so a play on the seam isn't lost
                raw, err = None, None
                for model in list(MODELS):
                    try:
                        raw = ask(model, url, s, e, ctx); used_model = model; break
                    except urllib.error.HTTPError as x:
                        err = f'{x.code} {x.read().decode()[:200]}'
                        if x.code == 404: MODELS.remove(model); continue   # model name not available: try the next one
                        raise RuntimeError(err)
                if raw is None: raise RuntimeError(err or 'no model available')
                found += [dict(m, v_i=i) for m in clean(raw, v, s, e, L)]
                used += e - s
                print(f'  part {i + 1} {s // 60}-{e // 60} min: {len(raw)} moment(s)')
                time.sleep(20)   # stay under the free tier's per-minute limit
    except Exception as x:
        f = fails.get(gid) or {}
        fails[gid] = {'n': f.get('n', 0) + 1, 'last': int(NOW), 'err': str(x)[:300]}
        q['sec'] += used
        print('moments: failed:', str(x)[:300])
        json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
        return
    q['sec'] += used
    fails.pop(gid, None)
    done[gid] = {'vids': vl, 'at': int(NOW), 'model': used_model, 'm': pick(found)}
    json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
    print(f'moments: saved {len(done[gid]["m"])} moment(s) for {gid}; {len(todo) - 1} game(s) left')


if __name__ == '__main__':
    run()
