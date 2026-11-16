# Links OEC YouTube broadcasts to league games. Run by the League notifications workflow.
#
# - Fetches new uploads from the channel with the YouTube Data API (YT_API_KEY secret), at most every 3 hours
#   or right after a stream ends. A few quota units a day; no Firestore reads at all.
# - Matches each video title to a played game using team names, abbreviations, mascots and nicknames
#   ("UD", "LA Tech", "KSU"...). "S3, W8" in a title pins the season/week; otherwise the upload date is compared
#   with when the score was entered. Videos that don't name two teams who played (other games, other content)
#   are left alone.
# - Writes videos.json: the site loads it for free. Commissioner links/unlinks (saved on the game) always win.
import json, os, re, time, calendar, urllib.request, urllib.parse

CHANNEL = '@originalentertainingcrackers'
NOW = time.time() * 1000


def load(path, default):
    try:
        return json.load(open(path))
    except Exception:
        return default


def yt(path, **q):
    q['key'] = os.environ['YT_API_KEY']
    with urllib.request.urlopen(f'https://www.googleapis.com/youtube/v3/{path}?' + urllib.parse.urlencode(q), timeout=30) as r:
        return json.load(r)


def ms(iso):
    return int(calendar.timegm(time.strptime(iso[:19], '%Y-%m-%dT%H:%M:%S')) * 1000)


# ---------------- team aliases ----------------
PROG = {}
try:
    for m in re.finditer(r"^\s*['\"]([^'\"]+)['\"]: \{ name: \"([^\"]+)\",(.*)$", open('programs.js').read(), re.M):
        rest = m.group(3)
        ab = re.search(r"abbr: '([^']+)'", rest)
        mc = re.search(r"mascot: '((?:[^'\\]|\\.)+)'", rest)
        PROG[m.group(1)] = {'name': m.group(2), 'abbr': ab.group(1) if ab else '', 'mascot': (mc.group(1).replace("\\'", "'") if mc else '')}
except Exception:
    pass
EXTRA = {   # nicknames people actually type; add more any time
    'delaware': ['UD'], 'kennesaw state': ['KSU', 'Kennesaw'], 'louisiana tech': ['LA Tech', 'La. Tech', 'LaTech', 'LTU'],
    'app state': ['App', 'Appalachian State', 'ASU'], 'east carolina': ['ECU'], 'georgia state': ['GSU', 'GA State'], 'north texas': ['UNT', 'Mean Green'],
    'boston college': ['BC'], 'west virginia': ['WVU', 'WV'], 'north carolina': ['UNC', 'Carolina'], 'kentucky': ['UK'],
    'florida international': ['FIU'], 'fiu': ['Florida International'], 'ucf': ['Central Florida'], 'purdue': ['PU'],
}


def aliases(t):
    name = (t.get('name') or '').strip()
    key = name.lower()
    out = {name, t.get('abbr') or ''}
    p = PROG.get(key) or {}
    out |= {p.get('abbr', ''), p.get('mascot', '')}
    out |= set(EXTRA.get(key, []))
    words = [w for w in re.split(r'\s+', re.sub(r'[()]', '', name)) if w]
    if len(words) > 1:
        ini = ''.join(w[0] for w in words).upper()
        out |= {ini, ini + 'U'}   # "Louisiana Tech" -> LT / LTU, "Kennesaw State" -> KS / KSU
        out.add(name.replace('State', 'St.').replace('  ', ' '))
        out.add(name.replace('State', 'St'))
        out.add(name.replace('Louisiana', 'LA'))
    return {a for a in out if a and len(a) >= 2}


def mentions(title, teams):
    T = ' ' + re.sub(r'\s+', ' ', title.upper()) + ' '
    found = {}
    for tid, al in teams.items():
        for a in sorted(al, key=len, reverse=True):
            m = re.search(r'(?<![A-Z0-9])' + re.escape(a.upper()) + r'(?![A-Z0-9])', T)
            if m:
                found[tid] = min(found.get(tid, 1e9), m.start())
                break
    return found


# Every FBS school's aliases (for spotting an opponent we don't track as a team).
PROGAL = {k: aliases({'name': p['name'], 'abbr': p['abbr']}) | ({p['mascot']} if p.get('mascot') else set()) for k, p in PROG.items()}
TEAMNAME = {}
def norm_name(tid):
    return (TEAMNAME.get(tid) or tid.replace('-', ' ')).lower()


def run():
    season = load('season.json', {})
    archive = load('archive.json', {})
    state = load('videos.json', {})
    games = [g for g in (season.get('games') or []) + (archive.get('games') or []) if not g.get('deleted')]
    teams = {t['id']: aliases(t) for t in (season.get('teams') or []) if not t.get('deleted')}
    TEAMNAME.update({t['id']: t.get('name', '') for t in (season.get('teams') or [])})
    # CPU opponents that only exist as an id on a game (no team doc): name them from programs.js
    for g in games:
        for tid in (g.get('home'), g.get('away')):
            if tid and tid not in teams:
                p = PROG.get(tid.replace('-', ' ')) or {}
                teams[tid] = aliases({'name': p.get('name') or tid.replace('-', ' ').title(), 'abbr': p.get('abbr', '')})
    if not games or not teams:
        print('broadcasts: no league data yet')
        return
    seasons = sorted({g['season'] for g in games})
    lg_first = int(season.get('firstSeason') or seasons[0])
    played = [g for g in games if g.get('homeScore') is not None and g.get('awayScore') is not None]
    # League teams each season = teams with several games on record that season (CPU opponents show up once or twice).
    from collections import Counter
    league = {}
    for yr in seasons:
        c = Counter(t for g in games if g['season'] == yr for t in (g['home'], g['away']))
        league[yr] = {t for t, n in c.items() if n >= 4}

    # 1) New uploads (every 3 hours, or right after a stream ends)
    vids = {v['id']: v for v in state.get('videos', [])}
    live = load('live.json', {})
    ended = (not live.get('live')) and live.get('notified') and live.get('notified') not in vids
    if os.environ.get('YT_API_KEY') and (NOW - state.get('fetchedAt', 0) > 3 * 3600e3 or ended):
        try:
            up = state.get('uploads')
            if not up:
                ch = yt('channels', part='contentDetails', forHandle=CHANNEL)
                up = ch['items'][0]['contentDetails']['relatedPlaylists']['uploads']
            tok, pages, added = None, 0, 0
            while pages < 20:
                q = {'part': 'snippet', 'playlistId': up, 'maxResults': 50}
                if tok: q['pageToken'] = tok
                r = yt('playlistItems', **q); pages += 1
                stop = False
                for it in r.get('items', []):
                    sn = it['snippet']; vid = sn['resourceId']['videoId']
                    if vid in vids: stop = True; continue
                    vids[vid] = {'id': vid, 't': sn.get('title', ''), 'd': ms(sn.get('publishedAt', '1970-01-01T00:00:00'))}; added += 1
                tok = r.get('nextPageToken')
                if stop or not tok: break
            state['uploads'] = up; state['fetchedAt'] = int(NOW)
            print(f'broadcasts: {added} new video(s)')
        except Exception as e:
            print('broadcasts: YouTube fetch skipped:', repr(e)[:200])

    # 2) Match every video to a game
    abbr = {t['id']: (t.get('abbr') or t.get('name') or t['id']) for t in (season.get('teams') or [])}
    nice = lambda ids: ', '.join(sorted(abbr.get(i, i) for i in ids))
    links, review, when, why, vteams = {}, [], {}, {}, {}   # links: gameId -> [videoIds] (several when a stream had to restart)
    for v in sorted(vids.values(), key=lambda v: v['d']):
        title = v['t']
        found = mentions(title, teams)
        sm = re.search(r'\bS(?:EASON)?\s*(\d+)\b', title, re.I)
        wm = re.search(r'\bW(?:EEK|K)?\s*(\d+)\b', title, re.I)
        yr = lg_first + int(sm.group(1)) - 1 if sm else None
        if found: vteams[v['id']] = sorted(found)
        if len(found) >= 2:
            cands = [g for g in played if g['home'] in found and g['away'] in found]
        elif len(found) == 1 and sm and wm:
            # Season + week given and one league team named (the other is a CPU team we may not know): a team
            # plays once a week, so that pins the game.
            t = next(iter(found)); cands = [g for g in played if t in (g['home'], g['away'])]
            # ...unless the title names some other school that isn't that game's opponent.
            others = {k for k in mentions(title, PROGAL)} - {norm_name(t)}
            if others: cands = [g for g in cands if norm_name(g['away'] if g['home'] == t else g['home']) in others]
        else:
            if found: why[v['id']] = 'only recognized ' + nice(found) + ('' if sm and wm else ' (title has no season/week)')
            continue
        if sm: cands = [g for g in cands if g['season'] == yr]
        if wm: cands = [g for g in cands if g.get('week') == int(wm.group(1))]
        if not cands:
            why[v['id']] = f"recognized {nice(found)} but no finished game" + (f" in S{sm.group(1)}" if sm else '') + (f" W{wm.group(1)}" if wm else '')
            continue
        # A restarted stream: same matchup uploaded within ~36 hours of a video already on one of these games.
        part = [g for g in cands if any(abs(v['d'] - d) < 36 * 3600e3 for d in when.get(g['id'], []))]
        if part:
            g = part[0]; links[g['id']].append(v['id']); when[g['id']].append(v['d']); continue
        free = [g for g in cands if g['id'] not in links]
        if free: cands = free
        how = 'title'
        if len(cands) > 1:
            dated = [g for g in cands if g.get('playedAt')]
            if dated:   # score entered closest to the upload (streams are usually entered within a few days)
                best = min(dated, key=lambda g: abs(g['playedAt'] - v['d']))
                if abs(best['playedAt'] - v['d']) < 10 * 86400e3: cands = [best]; how = 'date'
        if len(cands) > 1:   # still ambiguous: newest game played before the upload, flagged for a quick check
            before = [g for g in cands if not g.get('playedAt') or g['playedAt'] <= v['d'] + 86400e3] or cands
            cands = [max(before, key=lambda g: (g['season'], g.get('week') or 0))]; how = 'guess'
        g = cands[0]
        links.setdefault(g['id'], []).append(v['id']); when.setdefault(g['id'], []).append(v['d'])
        if how == 'guess': review.append(v['id'])
    out = {'uploads': state.get('uploads'), 'fetchedAt': state.get('fetchedAt', 0),
           'videos': sorted(vids.values(), key=lambda v: -v['d'])[:400], 'links': links, 'guessed': review, 'why': why, 'teams': {k: t for k, t in vteams.items() if not any(k in ids for ids in links.values())},
           'league': {str(y): sorted(t) for y, t in league.items()}}
    if out != state:
        json.dump(out, open('videos.json', 'w'), separators=(',', ':'))
        print(f'broadcasts: {len(links)} game(s) linked, {len(review)} guessed')


if __name__ == '__main__':
    try:
        run()
    except Exception as e:
        print('broadcasts skipped:', repr(e)[:300])
