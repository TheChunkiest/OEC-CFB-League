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
MODELS = list(dict.fromkeys(m for m in [os.environ.get('GEMINI_MODEL', '').strip(), 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'] if m))
BUSY = (429, 500, 502, 503, 504)   # Google's "busy / try again later" answers: never count against a game
DAILY_HOURS = float(os.environ.get('MOMENTS_DAILY_HOURS') or 0)    # 0 = no cap of our own: on a free key Google just refuses (429) past its limits, it never bills
CHUNK = 15 * 60          # 15-minute pieces: each request comes back in a few minutes
RUN_BUDGET = 17 * 60     # stop starting new pieces after this long; the next run picks up where this one left off
REQ_TIMEOUT = 300       # a piece that takes longer than this is too big: it gets split
MIN_CHUNK = 7 * 60       # smaller pieces don't help a slow Gemini and just use up the daily request limit faster
THINK = {'on': True}
SIMPLE = {'on': True}   # low resolution + fewer frames; dropped if a model refuses those settings     # ask for minimal "thinking" (faster); dropped automatically if the model doesn't take it
START = time.time()
SCRIPT_VERSION = 4       # bump when the way games are processed changes: failed games then get fresh retries
MAX_MOMENTS = 14
KINDS = {'td': '🏈', 'fg': '🥅', 'safety': '🛡️', 'turnover': '🔄', 'big': '💥', 'stop': '🧱', 'twopt': '✌️', 'final': '🏁', 'other': '⭐'}


def load(path, default):
    try:
        return json.load(open(path))
    except Exception:
        return default


class ApiErr(Exception):
    """An error answer from Google, with its message kept (so the log says what actually went wrong)."""
    def __init__(self, code, body):
        self.code, self.body = code, body
        super().__init__(f'{code} {body}')


def gemini(model, body, timeout):
    try:
        return http(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', body, {'x-goog-api-key': KEY}, timeout=timeout)
    except urllib.error.HTTPError as x:
        try: raw = x.read().decode()
        except Exception: raw = ''
        try: msg = json.loads(raw)['error']['message']
        except Exception: msg = raw
        raise ApiErr(x.code, re.sub(r'\s+', ' ', msg or str(x.reason or ''))[:300])


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
"notes": "<2-4 sentences on how this part of the game went: momentum, standout players, anything the streamers made a big deal of>",
"players": [{{"name": "<player name as shown on screen or said by the streamers>", "team": "home|away", "pos": "QB|RB|WR|TE|OL|DL|LB|CB|S|K|P|?", "did": "<what they did in this part, e.g. '2 TD passes, 1 INT' or 'sacked the QB twice'>"}}]}}
Only list players who actually made plays in this part. Spell names exactly as shown on screen.
If nothing from this game happens in this part, reply {{"moments": [], "notes": "", "players": []}}."""
    body = {'contents': [{'parts': [
        {'file_data': {'file_uri': url, 'mime_type': 'video/*'},
         'video_metadata': {'start_offset': f'{start}s', 'end_offset': f'{end}s', 'fps': 0.25}},
        {'text': prompt}]}],
        'generationConfig': {'responseMimeType': 'application/json', 'mediaResolution': 'MEDIA_RESOLUTION_LOW', 'temperature': 0.2}}
    if THINK['on']: body['generationConfig']['thinkingConfig'] = {'thinkingBudget': 0}
    if not SIMPLE['on']:   # a model that rejected the extra settings: plain request (just the clip and the prompt)
        body['generationConfig'].pop('mediaResolution', None); body['generationConfig'].pop('thinkingConfig', None)
        body['contents'][0]['parts'][0]['video_metadata'].pop('fps', None)
    try:
        r = gemini(model, body, REQ_TIMEOUT)
    except ApiErr as x:
        if x.code == 400 and SIMPLE['on']:   # "invalid argument": retry once with the plain request
            print(f'  {model}: rejected the request settings ({x.body[:120]}); retrying with plain settings')
            SIMPLE['on'] = False; THINK['on'] = False
            return ask(model, url, start, end, ctx)
        raise
    txt = ''.join(p.get('text', '') for c in r.get('candidates', []) for p in (c.get('content') or {}).get('parts', []))
    out = parse_json(txt)
    pl = [p for p in (out.get('players') or []) if isinstance(p, dict) and p.get('name')][:20]
    return out.get('moments') or [], str(out.get('notes') or '').strip(), pl


def parse_json(txt):
    """Reads the JSON out of a model reply, even when the model adds a second object, notes or code fences after it.
    Several objects in one reply (some models split their answer) are merged."""
    dec, out, i = json.JSONDecoder(), {}, 0
    txt = re.sub(r'```(?:json)?', ' ', txt or '')
    while True:
        i = txt.find('{', i)
        if i < 0: break
        try:
            obj, end = dec.raw_decode(txt, i)
        except ValueError:
            i += 1; continue
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, list) and isinstance(out.get(k), list): out[k] += v
                elif k not in out or not out[k]: out[k] = v
        i = end
    return out


def text_call(prompt):
    """A text-only request (no video): cheap, and doesn't count toward the daily video budget."""
    err = None
    for model in list(MODELS):
        try:
            r = gemini(model, {'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0.6}}, 180)
            txt = ''.join(p.get('text', '') for c in r.get('candidates', []) for p in (c.get('content') or {}).get('parts', []))
            return parse_json(txt)
        except ApiErr as x:
            err = str(x)
            if x.code == 404: MODELS.remove(model); continue
            if x.code in BUSY: time.sleep(5); continue   # busy: try the next model
            raise RuntimeError(err)
    raise RuntimeError(err or 'no model available')


def write_recap(ctx, moments, notes, players=(), known=''):
    """Turns what was seen in the broadcast into (1) the recap the site shows on a final, (2) who played well for each
    team and (3) a scouting note per team. Those build up into the league's picture of its players over a season,
    and the "how much did the score flatter the winner" number feeds the betting model a little."""
    plays = '\n'.join(f"- {m['x']} ({m['k']}{', Q' + str(m['q']) if m.get('q') else ''}{', score away-home ' + m['sc'] if m.get('sc') else ''})" for m in moments)
    seen = '\n'.join(f"- {p.get('name')} ({p.get('team')}, {p.get('pos') or '?'}): {p.get('did') or ''}" for p in players)
    prompt = f"""You write game recaps for an online College Football 27 video game dynasty league's website.
{ctx}
Key plays, in order:
{plays or '(none found)'}
Players seen making plays:
{seen or '(none listed)'}
Notes from watching the broadcast:
{chr(10).join('- ' + n for n in notes if n) or '(none)'}
Players already known on these teams from earlier games (use these spellings when it's clearly the same person):
{known or '(none yet)'}
Write a short sports-site recap: 2-3 paragraphs that tell the story of the game and mention only the few moments
that decided it. Confident and fun. No made-up stats or player names beyond what's above. Never mention AI, streams
or video. Use the coaches' names and the schools. Reply with JSON only:
{{"headline": "<under 70 characters, names the winner>",
"recap": ["<paragraph>", "<paragraph>", "<optional short paragraph>"],
"oneliner": "<one sentence recap of the game, under 30 words>",
"potg_title": "<the single best play, under 45 characters>",
"potg": "<one sentence describing the play of the game and why it mattered, under 35 words>",
"players": [{{"name": "<full name if known>", "team": "home|away", "pos": "QB|RB|WR|TE|OL|DL|LB|CB|S|K|P|?", "line": "<just their numbers/plays, under 10 words, no adjectives: e.g. '30-yd TD pass, 40-yd TD run' or '2 sacks, forced fumble'>", "grade": <1-10, how well they played>}}],
"teams": {{"home": {{"good": "<what worked for them, under 20 words>", "bad": "<where they struggled, under 20 words>"}}, "away": {{"good": "...", "bad": "..."}}}},
"luck": <number from -10 to 10: how many points the final margin FLATTERED the home team compared with how the game was
actually played (garbage-time scores, fluky tips, return TDs, a missed kick). Positive = home looked better on the
scoreboard than on the field, negative = away did. 0 if the score was fair.>}}
List the 3-8 players who mattered most, best first."""
    out = text_call(prompt)
    clip = lambda v, n: re.sub(r'\s+', ' ', str(v or '')).strip()[:n]
    paras = [clip(x, 900) for x in (out.get('recap') or []) if clip(x, 900)][:3]
    if not out.get('headline') or not paras: raise RuntimeError('recap came back empty')
    pl = []
    for p in (out.get('players') or [])[:10]:
        if not isinstance(p, dict) or not clip(p.get('name'), 40) or p.get('team') not in ('home', 'away'): continue
        try: gr = max(1, min(10, int(round(float(p.get('grade'))))))
        except Exception: gr = None
        pl.append({'n': clip(p.get('name'), 40), 's': p['team'], 'pos': clip(p.get('pos'), 3).upper() or '?', 'l': clip(p.get('line'), 90), 'g': gr})
    tn = {}
    for side in ('home', 'away'):
        x = (out.get('teams') or {}).get(side) or {}
        if isinstance(x, dict): tn[side] = {'good': clip(x.get('good'), 140), 'bad': clip(x.get('bad'), 140)}
    try: lk = max(-10.0, min(10.0, float(out.get('luck') or 0)))
    except Exception: lk = 0.0
    return {'v': 2, 'h': clip(out.get('headline'), 90), 'p': paras, 'o': clip(out.get('oneliner'), 260),
            'pt': clip(out.get('potg_title'), 60), 'pp': clip(out.get('potg'), 300), 'pl': pl, 'tn': tn, 'lk': round(lk, 1)}


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

    def known(g):
        """Players already on record for these two teams (this season and last), so names stay consistent."""
        out = []
        for side in ('away', 'home'):
            tid, names = g[side], {}
            for ogid, orec in done.items():
                og = games.get(ogid); rr = orec.get('r') or {}
                if not og or ogid == g['id'] or og['season'] < g['season'] - 1 or tid not in (og['home'], og['away']): continue
                for p in rr.get('pl') or []:
                    if og[p.get('s')] == tid: names.setdefault(p['n'], p.get('pos') or '?')
            if names: out.append(f"{nm(teams.get(tid, {}), tid)} ({side}): " + ', '.join(f'{n} ({ps})' for n, ps in list(names.items())[:25]))
        return '\n'.join(out)

    def recap_for(gid, rec):
        g = games[gid]
        return write_recap(make_ctx(g), rec.get('m') or [], rec.get('n') or [], rec.get('p') or [], known(g))

    # Games that have moments but no recap in the current format yet (text only, so no video budget): up to 3 a run.
    wrote = 0
    for gid, rec in sorted(done.items(), key=lambda kv: -kv[1].get('at', 0)):
        if wrote >= 3 or (rec.get('r') or {}).get('v', 1) >= 2 or gid not in games or rec.get('rfail', 0) >= 3: continue
        try:
            rec['r'] = recap_for(gid, rec); wrote += 1
            print(f'moments: wrote the recap for {gid}')
        except Exception as x:
            rec['rfail'] = rec.get('rfail', 0) + 1; print('moments: recap failed:', str(x)[:200])
            if '429' in str(x): break

    # Games that failed get 2 quick retries (right away, ahead of new games). After that they wait their turn
    # behind new games. A new version of this script gives every failed game a fresh 2 tries.
    if state.get('ver') != SCRIPT_VERSION:
        for f in fails.values(): f['tries'] = 0; f['n'] = 0
        state['ver'] = SCRIPT_VERSION
    # The newest unfinished game never gives up: no retry limit, no waiting, always first in line.
    def unfinished(gid, g):
        if g.get('homeScore') is None or g.get('awayScore') is None or g.get('forfeit'): return False
        vl = vlist(g); have = done.get(gid)
        return bool(vl) and not (have and have.get('vids') == vl and not redo.get(gid, 0) > have.get('at', 0) * 1000)
    newest = max((g for gid, g in games.items() if unfinished(gid, g)),
                 key=lambda g: (g.get('playedAt') or 0, g.get('season', 0), g.get('week') or 0), default=None)
    newest = newest and newest['id']
    todo = []
    for gid, g in games.items():
        if g.get('homeScore') is None or g.get('awayScore') is None or g.get('forfeit'): continue
        vl = vlist(g)
        if not vl: continue
        have = done.get(gid)
        want_redo = redo.get(gid, 0) > (have or {}).get('at', 0) * 1000
        if have and have.get('vids') == vl and not want_redo: continue
        f = fails.get(gid) or {}
        fresh = bool(f) and (f.get('tries', 0) < 2 or gid == newest)   # still in its quick retries (newest: always)
        if f.get('n', 0) >= 3 and not want_redo and not fresh: continue
        wait = 0 if fresh else 25 * 60 if f.get('slow') or 'timed out' in str(f.get('err', '')) or str(f.get('err', ''))[:3] in {str(c) for c in BUSY} else 6 * 3600 * f.get('n', 1)   # a timeout just tries again next run
        if f and wait and NOW - f.get('last', 0) < wait and not want_redo: continue
        rank = 0 if want_redo or gid == newest or gid in (state.get('partials') or {}) else 1 if fresh else 3 if f else 2
        todo.append((rank, -(g.get('playedAt') or 0), -g.get('season', 0), -(g.get('week') or 0), gid, vl))
    if not todo:
        print('moments: up to date')
        if state != load('moments.json', {}): json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
        return
    todo.sort()
    _, _, _, _, gid, vl = todo[0]
    g = games[gid]
    lens = durations(vl)
    total = sum(lens.get(v) or 3 * 3600 for v in vl)
    if DAILY_HOURS and q['sec'] + total > DAILY_HOURS * 3600:
        print(f'moments: daily video budget used ({q["sec"] / 3600:.1f}h); {len(todo)} game(s) waiting')
        json.dump(state, open('moments.json', 'w'), separators=(',', ':')); return
    A, H = teams.get(g['away'], {}), teams.get(g['home'], {})
    ctx = make_ctx(g)
    print(f"moments: {gid} — {nm(A, g['away'])} @ {nm(H, g['home'])}, {len(vl)} part(s), {total / 60:.0f} min")
    # Progress is saved after every piece, so a slow or failed request never throws away the pieces already done.
    # Piece size adapts: if Gemini is busy or slow with a piece, it's cut in half and tried again right away
    # (down to 2 minutes); after a few good pieces it grows back. The size that works is remembered.
    # Saved progress is kept per game, so switching to a newer game never throws away pieces of another one.
    parts = state.setdefault('partials', {})
    if state.get('partial'): old = state.pop('partial'); parts.setdefault(old.get('gid'), old)   # older format
    part = parts.get(gid) or {}
    if part.get('gid') != gid or part.get('vids') != vl: part = {'gid': gid, 'vids': vl, 'chunks': {}, 'pos': {}}
    part.setdefault('pos', {})
    parts[gid] = part
    used, used_model = 0, part.get('model') or MODELS[0]
    size, good = CHUNK, 0   # every run starts at full-size pieces
    try:
        for i, v in enumerate(vl):
            L = lens.get(v) or 3 * 3600
            url = f'https://www.youtube.com/watch?v={v}'
            pos = int(part['pos'].get(v, 0))
            while pos < L - 20:
                if time.time() - START > RUN_BUDGET:
                    q['sec'] += used
                    print(f'moments: out of time this run; {len(part["chunks"])} piece(s) saved, continuing next run')
                    json.dump(state, open('moments.json', 'w'), separators=(',', ':')); return
                e = min(L, pos + size + 30)   # 30 seconds of overlap so a play on the seam isn't lost
                raw, err, note, t0, slow = None, None, '', time.time(), False
                for model in list(MODELS):
                    try:
                        raw, note, plays_by = ask(model, url, pos, e, ctx); used_model = model
                        if MODELS[0] != model: MODELS.remove(model); MODELS.insert(0, model)   # it works: use it first for the rest of the run
                        break
                    except ApiErr as x:
                        err = str(x)
                        if x.code == 404: MODELS.remove(model); print(f'  {model}: not available'); continue
                        if x.code == 429: MODELS.remove(model); print(f'  {model}: free limit used up for now ({x.body[:100]})'); continue
                        if x.code in BUSY: print(f'  {model}: busy ({x.code}) on a {size // 60}-min piece: {x.body[:100]}'); time.sleep(5); continue
                        # Anything else (400 bad request, 403 key problem...): say exactly what Google said, then try the next model.
                        print(f'  {model}: error {x.code}: {x.body}'); MODELS.remove(model); continue
                    except (TimeoutError, OSError, urllib.error.URLError) as x:
                        err, slow = f'timed out after {time.time() - t0:.0f}s on a {size // 60}-min piece', True
                        print(f'  {model}: {err}'); break   # too much for one request: shrink it rather than try other models
                if raw is None and not MODELS: raise RuntimeError(err or 'no model available')
                if raw is None and slow and size > MIN_CHUNK:   # only a timeout means "too big"; busy just means busy
                    size = max(MIN_CHUNK, size // 2); good = 0; state['size'] = size
                    print(f'  trying smaller pieces: {size // 60} min'); continue
                if raw is None:
                    if not slow:   # Is Gemini busy in general, or just with video? (one tiny text request, for the log)
                        try:
                            text_call('Reply with JSON {"ok": true}'); print('  a plain text request worked, so only video requests are being turned away')
                            err = f'{(err or "")[:3]} busy for video even in {size // 60}-min pieces (text requests work); trying again next run'
                        except Exception:
                            err = f'{(err or "")[:3]} every model busy right now; trying again next run'
                    raise RuntimeError(err or 'no model available')
                part['chunks'][f'{v}@{pos}'] = {'i': i, 'm': clean(raw, v, pos, e, L), 'n': note[:600], 'p': plays_by}
                part['model'] = used_model
                used += e - pos
                print(f'  part {i + 1} {pos // 60}-{e // 60} min: {len(raw)} moment(s) in {time.time() - t0:.0f}s ({used_model})')
                pos = e if e >= L else e - 30
                part['pos'][v] = pos if e < L else L
                good += 1
                if good >= 6 and size < CHUNK: size = min(CHUNK, size * 2); good = 0; state['size'] = size
                json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
                time.sleep(10)   # stay under the free tier's per-minute limit
    except Exception as x:
        f = fails.get(gid) or {}
        slow = 'timed out' in str(x).lower() or 'timeout' in str(x).lower() or str(x)[:3] in {str(c) for c in BUSY} or 'busy' in str(x)
        busy = str(x)[:3] in {str(c) for c in BUSY}
        fails[gid] = {'n': f.get('n', 0) + (0 if busy else 0.5 if slow else 1), 'tries': f.get('tries', 0) + 1, 'last': int(NOW), 'err': str(x)[:300], 'slow': slow}
        q['sec'] += used
        print('moments: failed:', str(x)[:300])
        json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
        return
    chunks = sorted(part['chunks'].values(), key=lambda c: c['i'])
    found = [dict(m, v_i=c['i']) for c in chunks for m in c['m']]
    notes = [c['n'] for c in chunks if c.get('n')]
    seen = [p for c in chunks for p in (c.get('p') or [])]
    parts.pop(gid, None)
    q['sec'] += used
    fails.pop(gid, None)
    done[gid] = {'vids': vl, 'at': int(NOW), 'model': used_model, 'm': pick(found), 'n': notes, 'p': seen[:60]}
    try:
        done[gid]['r'] = recap_for(gid, done[gid])
    except Exception as x:
        print('moments: recap not written yet:', str(x)[:200])
    json.dump(state, open('moments.json', 'w'), separators=(',', ':'))
    print(f'moments: saved {len(done[gid]["m"])} moment(s) for {gid}; {len(todo) - 1} game(s) left')


if __name__ == '__main__':
    run()
