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
CHUNK = 15 * 60          # 15-minute pieces: each request comes back in a few minutes
RUN_BUDGET = 17 * 60     # stop starting new pieces after this long; the next run picks up where this one left off
REQ_TIMEOUT = 840
THINK = {'on': True}     # ask for minimal "thinking" (faster); dropped automatically if the model doesn't take it
START = time.time()
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
"text": "<one short sentence, under 14 words, e.g. 'Smith 45-yard TD pass to Jones'>"}}],
"notes": "<2-4 sentences on how this part of the game went: momentum, standout players, anything the streamers made a big deal of>"}}
If nothing from this game happens in this part, reply {{"moments": [], "notes": ""}}."""
    body = {'contents': [{'parts': [
        {'file_data': {'file_uri': url, 'mime_type': 'video/*'},
         'video_metadata': {'start_offset': f'{start}s', 'end_offset': f'{end}s', 'fps': 0.25}},
        {'text': prompt}]}],
        'generationConfig': {'responseMimeType': 'application/json', 'mediaResolution': 'MEDIA_RESOLUTION_LOW', 'temperature': 0.2}}
    if THINK['on']: body['generationConfig']['thinkingConfig'] = {'thinkingBudget': 0}
    try:
        r = http(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', body, {'x-goog-api-key': KEY}, timeout=REQ_TIMEOUT)
    except urllib.error.HTTPError as x:
        if x.code == 400 and THINK['on']:
            msg = x.read().decode()[:300]
            if 'think' in msg.lower():
                THINK['on'] = False; return ask(model, url, start, end, ctx)
            raise urllib.error.HTTPError(x.url, 400, msg, x.headers, None)
        raise
    txt = ''.join(p.get('text', '') for c in r.get('candidates', []) for p in (c.get('content') or {}).get('parts', []))
    m = re.search(r'\{.*\}', txt, re.S)
    out = json.loads(m.group(0)) if m else {}
    return out.get('moments') or [], str(out.get('notes') or '').strip()


def text_call(prompt):
    """A text-only request (no video): cheap, and doesn't count toward the daily video budget."""
    err = None
    for model in list(MODELS):
        try:
            r = http(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                     {'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0.6}},
                     {'x-goog-api-key': KEY}, timeout=180)
            txt = ''.join(p.get('text', '') for c in r.get('candidates', []) for p in (c.get('content') or {}).get('parts', []))
            m = re.search(r'\{.*\}', txt, re.S)
            return json.loads(m.group(0)) if m else {}
        except urllib.error.HTTPError as x:
            err = f'{x.code} {x.read().decode()[:200]}'
            if x.code == 404: MODELS.remove(model); continue
            raise RuntimeError(err)
    raise RuntimeError(err or 'no model available')


def write_recap(ctx, moments, notes):
    """Turns the moments (and the notes from watching each part) into the game story the site shows on a final."""
    plays = '\n'.join(f"- {m['x']} ({m['k']}{', Q' + str(m['q']) if m.get('q') else ''}{', score away-home ' + m['sc'] if m.get('sc') else ''})" for m in moments)
    prompt = f"""You write game recaps for an online College Football 27 video game dynasty league's website.
{ctx}
Key plays, in order:
{plays or '(none found)'}
Notes from watching the broadcast:
{chr(10).join('- ' + n for n in notes if n) or '(none)'}
Write it like a sports site recap: confident and fun, no made-up stats or player names beyond what's above, never
mention AI, streams or video. Use the coaches' names and the schools. Reply with JSON only:
{{"headline": "<under 70 characters, names the winner>",
"recap": ["<paragraph 1: the result and the story of the game>", "<paragraph 2: the turning point and key plays>", "<optional short paragraph 3: what it means>"],
"oneliner": "<one sentence recap of the game, under 30 words>",
"potg_title": "<the single best play, under 45 characters, e.g. 'Smith's 99-yard pick-six'>",
"potg": "<one sentence describing the play of the game and why it mattered, under 35 words>"}}"""
    out = text_call(prompt)
    clip = lambda v, n: re.sub(r'\s+', ' ', str(v or '')).strip()[:n]
    paras = [clip(x, 900) for x in (out.get('recap') or []) if clip(x, 900)][:3]
    if not out.get('headline') or not paras: raise RuntimeError('recap came back empty')
    return {'h': clip(out.get('headline'), 90), 'p': paras, 'o': clip(out.get('oneliner'), 260),
            'pt': clip(out.get('potg_title'), 60), 'pp': clip(out.get('potg'), 300)}


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

    nm = lambda t, tid: t.get('name') or tid.replace('-', ' ').title()

    def make_ctx(g):
        A, H = teams.get(g['away'], {}), teams.get(g['home'], {})
        coach = lambda side, t: g.get(side + 'Coach') or t.get('coach') or 'CPU'
        kind = {'ccg': ' This was the league championship game.', 'bowl': ' This was a postseason bowl game.'}.get(g.get('type'), '')
        return (f"The game: Season {g['season'] - int(season.get('firstSeason') or g['season']) + 1}, Week {g.get('week')}. "
                f"{nm(A, g['away'])} ({A.get('abbr', '')}, coached by {coach('away', A)}) is the AWAY team; "
                f"{nm(H, g['home'])} ({H.get('abbr', '')}, coached by {coach('home', H)}) is the HOME team"
                f"{' (neutral site)' if g.get('neutral') else ''}. Final score: away {g['awayScore']}, home {g['homeScore']}.{kind}")

    # Games that have moments but no written recap yet (text only, so no video budget): up to 3 a run.
    wrote = 0
    for gid, rec in sorted(done.items(), key=lambda kv: -kv[1].get('at', 0)):
        if wrote >= 3 or rec.get('r') or gid not in games or rec.get('rfail', 0) >= 3: continue
        try:
            rec['r'] = write_recap(make_ctx(games[gid]), rec.get('m') or [], rec.get('n') or []); wrote += 1
            print(f'moments: wrote the recap for {gid}')
        except Exception as x:
            rec['rfail'] = rec.get('rfail', 0) + 1; print('moments: recap failed:', str(x)[:200])
            if '429' in str(x): break

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
        wait = 25 * 60 if f.get('slow') or 'timed out' in str(f.get('err', '')) else 6 * 3600 * f.get('n', 1)   # a timeout just tries again next run
        if f and NOW - f.get('last', 0) < wait and not want_redo: continue
        todo.append((0 if want_redo or (state.get('partial') or {}).get('gid') == gid else 1, -(g.get('playedAt') or 0), -g.get('season', 0), -(g.get('week') or 0), gid, vl))
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
        print(f'moments: daily video budget used ({q["sec"] / 3600:.1f}h); {len(todo)} game(s) waiting')
        json.dump(state, open('moments.json', 'w'), separators=(',', ':')); return
    A, H = teams.get(g['away'], {}), teams.get(g['home'], {})
    ctx = make_ctx(g)
    print(f"moments: {gid} — {nm(A, g['away'])} @ {nm(H, g['home'])}, {len(vl)} part(s), {total / 60:.0f} min")
    # Progress is saved after every piece, so a slow or failed request never throws away the pieces already done.
    part = state.get('partial') or {}
    if part.get('gid') != gid or part.get('vids') != vl: part = {'gid': gid, 'vids': vl, 'chunks': {}}
    state['partial'] = part
    used, used_model = 0, part.get('model') or MODELS[0]
    try:
        for i, v in enumerate(vl):
            L = lens.get(v) or 3 * 3600
            url = f'https://www.youtube.com/watch?v={v}'
            for s in range(0, L, CHUNK):
                key = f'{v}@{s}'
                if key in part['chunks']: continue
                if time.time() - START > RUN_BUDGET:
                    q['sec'] += used
                    print(f'moments: out of time this run; {len(part["chunks"])} piece(s) saved, continuing next run')
                    json.dump(state, open('moments.json', 'w'), separators=(',', ':')); return
                e = min(L, s + CHUNK + 60)   # a minute of overlap so a play on the seam isn't lost
                raw, err, note, t0 = None, None, '', time.time()
                for model in list(MODELS):
                    try:
                        raw, note = ask(model, url, s, e, ctx); used_model = model; break
                    except urllib.error.HTTPError as x:
                        err = f'{x.code} {(x.read() or b"").decode()[:200] if x.fp else x.msg}'
                        if x.code == 404: MODELS.remove(model); continue   # model name not available: try the next one
                        raise RuntimeError(err)
                if raw is None: raise RuntimeError(err or 'no model available')
                part['chunks'][key] = {'i': i, 'm': clean(raw, v, s, e, L), 'n': note[:600]}
                part['model'] = used_model
                used += e - s
                print(f'  part {i + 1} {s // 60}-{e // 60} min: {len(raw)} moment(s) in {time.time() - t0:.0f}s ({used_model})')
                json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
                time.sleep(15)   # stay under the free tier's per-minute limit
    except Exception as x:
        f = fails.get(gid) or {}
        slow = 'timed out' in str(x).lower() or 'timeout' in str(x).lower()
        fails[gid] = {'n': f.get('n', 0) + (0.5 if slow else 1), 'last': int(NOW), 'err': str(x)[:300], 'slow': slow}
        q['sec'] += used
        print('moments: failed:', str(x)[:300])
        json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
        return
    chunks = sorted(part['chunks'].values(), key=lambda c: c['i'])
    found = [dict(m, v_i=c['i']) for c in chunks for m in c['m']]
    notes = [c['n'] for c in chunks if c.get('n')]
    state.pop('partial', None)
    q['sec'] += used
    fails.pop(gid, None)
    done[gid] = {'vids': vl, 'at': int(NOW), 'model': used_model, 'm': pick(found), 'n': notes}
    try:
        done[gid]['r'] = write_recap(ctx, done[gid]['m'], notes)
    except Exception as x:
        print('moments: recap not written yet:', str(x)[:200])
    json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
    print(f'moments: saved {len(done[gid]["m"])} moment(s) for {gid}; {len(todo) - 1} game(s) left')


if __name__ == '__main__':
    run()
