const FILES = ['league', 'teams', 'games', 'rankings', 'news', 'recruiting', 'awards', 'history'];
const D = {};
const NAV = [['home', 'Home'], ['standings', 'Standings'], ['schedule', 'Schedule'], ['rankings', 'Rankings'],
  ['teams', 'Teams'], ['news', 'News'], ['recruiting', 'Recruiting'], ['history', 'History'], ['rules', 'Rules']];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function load() {
  await Promise.all(FILES.map(async f => {
    const r = await fetch('' + f + '.json?v=' + Date.now());
    if (!r.ok) throw new Error('Could not load ' + f + '.json');
    D[f] = await r.json();
  }));
}

const team = id => D.teams.find(t => t.id === id) || { id, name: id, abbr: id, conference: '', coach: '', color: '#888' };
const isUser = t => !!t.coach && t.coach.trim().toUpperCase() !== 'CPU';
const chip = id => { const t = team(id); return `<a class="chip" style="--c:${esc(t.color || '#888')}" href="#team/${esc(t.id)}">${esc(t.name)}</a>`; };

function standings(season) {
  const rows = {};
  D.teams.forEach(t => rows[t.id] = { t, w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0, last: [] });
  D.games.filter(g => g.season === season && g.homeScore != null && g.awayScore != null)
    .sort((a, b) => a.week - b.week).forEach(g => {
      const h = rows[g.home], a = rows[g.away];
      if (!h || !a) return;
      h.pf += g.homeScore; h.pa += g.awayScore; a.pf += g.awayScore; a.pa += g.homeScore;
      const hw = g.homeScore > g.awayScore, win = hw ? h : a, lose = hw ? a : h;
      win.w++; lose.l++; win.last.push('W'); lose.last.push('L');
      if (h.t.conference === a.t.conference) { win.cw++; lose.cl++; }
    });
  return rows;
}
const streak = r => { if (!r.last.length) return '–'; const c = r.last[r.last.length - 1]; let n = 0; for (let i = r.last.length - 1; i >= 0 && r.last[i] === c; i--) n++; return c + n; };
const rec = r => `${r.w}-${r.l}`;
const pct = r => (r.w + r.l ? r.w / (r.w + r.l) : 0);

function gameCard(g) {
  const h = team(g.home), a = team(g.away), played = g.homeScore != null && g.awayScore != null;
  const hw = played && g.homeScore > g.awayScore, aw = played && g.awayScore > g.homeScore;
  const h2h = isUser(h) && isUser(a) ? '<span class="h2h">COACH vs COACH</span>' : '';
  return `<div class="card game"><div class="teams">
      <div>${chip(a.id)} ${aw ? '<span class="win">●</span>' : ''}</div>
      <div>${chip(h.id)} ${hw ? '<span class="win">●</span>' : ''}${h2h}</div>
      ${g.note ? `<div class="muted">${esc(g.note)}</div>` : ''}</div>
    <div class="score">${played ? `<div>${g.awayScore}</div><div>${g.homeScore}</div>` : '<span class="muted">Upcoming</span>'}</div></div>`;
}

function rankedList(limit) {
  const r = D.rankings, prev = r.previous || [];
  return r.ranks.slice(0, limit || 99).map((id, i) => {
    const t = team(id), pi = prev.indexOf(id), mv = pi < 0 ? 'NEW' : pi - i;
    const mvHtml = mv === 'NEW' ? '<span class="up">NEW</span>' : mv > 0 ? `<span class="up">▲${mv}</span>` : mv < 0 ? `<span class="down">▼${-mv}</span>` : '';
    return `<tr><td class="rank">${i + 1}</td><td>${chip(id)}</td><td>${esc(t.coach || 'CPU')}</td><td class="num">${mvHtml}</td></tr>`;
  }).join('');
}

const PAGES = {
  home() {
    const L = D.league, wk = L.week, season = L.season;
    const games = D.games.filter(g => g.season === season && g.week === wk);
    const news = D.news.slice(0, 3);
    return `${L.announcement ? `<div class="card banner"><h2>📣 Commissioner's Desk</h2><div style="white-space:pre-wrap">${esc(L.announcement)}</div></div>` : ''}
      <h2>Week ${wk} Matchups</h2>${games.length ? games.map(gameCard).join('') : '<div class="card empty">No games scheduled this week.</div>'}
      <div class="grid"><div class="card"><h2>Top 10</h2><div class="tablewrap"><table>${rankedList(10)}</table></div><p><a href="#rankings">Full rankings →</a></p></div>
      <div class="card"><h2>Latest News</h2>${news.map(n => `<div class="news"><span class="tag">${esc(n.tag || 'News')}</span> <span class="muted">${esc(n.date)}</span><h3>${esc(n.title)}</h3></div>`).join('')}<p><a href="#news">All news →</a></p></div></div>`;
  },

  standings() {
    const season = D.league.season, rows = standings(season);
    const confs = [...new Set(D.teams.map(t => t.conference))];
    return `<h2>${season} Standings</h2>` + confs.map(c => {
      const list = Object.values(rows).filter(r => r.t.conference === c)
        .sort((a, b) => b.cw - a.cw || a.cl - b.cl || pct(b) - pct(a) || (b.pf - b.pa) - (a.pf - a.pa));
      return `<div class="card"><h3 style="margin-top:0">${esc(c)}</h3><div class="tablewrap"><table>
        <tr><th>Team</th><th>Coach</th><th class="num">Conf</th><th class="num">Overall</th><th class="num">PF</th><th class="num">PA</th><th class="num">Strk</th></tr>
        ${list.map(r => `<tr><td>${chip(r.t.id)}</td><td>${esc(r.t.coach || 'CPU')}</td><td class="num">${r.cw}-${r.cl}</td><td class="num">${rec(r)}</td><td class="num">${r.pf}</td><td class="num">${r.pa}</td><td class="num">${streak(r)}</td></tr>`).join('')}
      </table></div></div>`;
    }).join('');
  },

  schedule(arg) {
    const season = D.league.season, wk = arg != null && arg !== '' ? +arg : D.league.week;
    const weeks = [...new Set(D.games.filter(g => g.season === season).map(g => g.week))].sort((a, b) => a - b);
    const games = D.games.filter(g => g.season === season && g.week === wk);
    return `<div class="row"><h2 style="margin:0">Schedule &amp; Scores</h2>
      <select onchange="location.hash='#schedule/'+this.value">${weeks.map(w => `<option value="${w}" ${w === wk ? 'selected' : ''}>Week ${w}</option>`).join('')}</select></div><br>
      ${games.length ? games.map(gameCard).join('') : '<div class="card empty">No games for this week.</div>'}`;
  },

  rankings() {
    return `<h2>Power Rankings</h2><p class="muted">Season ${D.rankings.season} · Week ${D.rankings.week}</p>
      <div class="card"><div class="tablewrap"><table>${rankedList()}</table></div></div>`;
  },

  teams() {
    const rows = standings(D.league.season);
    const confs = [...new Set(D.teams.map(t => t.conference))];
    return confs.map(c => `<h2>${esc(c)}</h2><div class="grid">${D.teams.filter(t => t.conference === c).map(t =>
      `<a class="card" style="border-left:5px solid ${esc(t.color || '#888')};color:inherit;text-decoration:none" href="#team/${esc(t.id)}">
        <div style="font-weight:700;font-size:16px">${esc(t.name)}</div>
        <div class="muted">Coach: ${esc(t.coach || 'CPU')}</div><div>${rec(rows[t.id])}</div></a>`).join('')}</div>`).join('');
  },

  team(id) {
    const t = team(id), season = D.league.season, rows = standings(season), r = rows[t.id];
    if (!r) return '<div class="card empty">Team not found.</div>';
    const games = D.games.filter(g => g.season === season && (g.home === id || g.away === id)).sort((a, b) => a.week - b.week);
    const rank = D.rankings.ranks.indexOf(id);
    return `<p><a href="#teams">← All teams</a></p>
      <div class="card" style="border-left:5px solid ${esc(t.color || '#888')}"><h2>${rank >= 0 ? '#' + (rank + 1) + ' ' : ''}${esc(t.name)}</h2>
        <div class="muted">${esc(t.conference)} · Coach: ${esc(t.coach || 'CPU')}${t.discord ? ' · ' + esc(t.discord) : ''}</div>
        <p>Record <b>${rec(r)}</b> (Conf ${r.cw}-${r.cl}) · PF ${r.pf} · PA ${r.pa} · Streak ${streak(r)}</p></div>
      <div class="card"><h3 style="margin-top:0">${season} Schedule</h3><div class="tablewrap"><table><tr><th>Wk</th><th>Opponent</th><th class="num">Result</th></tr>
      ${games.map(g => {
        const home = g.home === id, opp = home ? g.away : g.home, played = g.homeScore != null && g.awayScore != null;
        const my = home ? g.homeScore : g.awayScore, th = home ? g.awayScore : g.homeScore;
        const res = played ? `<span class="${my > th ? 'win' : 'loss'}">${my > th ? 'W' : 'L'} ${my}-${th}</span>` : '<span class="muted">—</span>';
        return `<tr><td>${g.week}</td><td>${home ? 'vs' : '@'} ${chip(opp)}</td><td class="num">${res}</td></tr>`;
      }).join('')}</table></div></div>`;
  },

  news() {
    return `<h2>League News</h2>` + D.news.map(n => `<div class="card news"><span class="tag">${esc(n.tag || 'News')}</span> <span class="muted">${esc(n.date)}</span>
      <h3>${esc(n.title)}</h3><p>${esc(n.body)}</p></div>`).join('');
  },

  recruiting() {
    const R = D.recruiting;
    return `<h2>${esc(R.class)} Recruiting Class Rankings</h2><div class="card"><div class="tablewrap"><table>
      <tr><th>#</th><th>Team</th><th>Coach</th><th class="num">Commits</th><th class="num">5★</th><th class="num">4★</th><th class="num">3★</th><th class="num">Pts</th></tr>
      ${R.rows.slice().sort((a, b) => b.points - a.points).map((r, i) => `<tr><td>${i + 1}</td><td>${chip(r.team)}</td><td>${esc(team(r.team).coach || 'CPU')}</td>
        <td class="num">${r.commits}</td><td class="num">${r.five}</td><td class="num">${r.four}</td><td class="num">${r.three}</td><td class="num">${r.points}</td></tr>`).join('')}
    </table></div></div>`;
  },

  history() {
    return `<h2>Champions &amp; History</h2><div class="card"><div class="tablewrap"><table>
      <tr><th>Season</th><th>Champion</th><th>Runner-up</th><th>Heisman</th></tr>
      ${D.history.map(h => `<tr><td>${esc(h.season)}</td><td>${h.champion ? chip(h.champion) : '–'}</td><td>${h.runnerUp ? chip(h.runnerUp) : '–'}</td><td>${esc(h.heisman || '–')}</td></tr>`).join('')}
    </table></div></div>
    <h2>Awards</h2><div class="card"><div class="tablewrap"><table><tr><th>Season</th><th>Award</th><th>Winner</th><th>Team</th></tr>
      ${D.awards.map(a => `<tr><td>${esc(a.season)}</td><td>${esc(a.award)}</td><td>${esc(a.winner)}</td><td>${a.team ? chip(a.team) : ''}</td></tr>`).join('')}
    </table></div></div>`;
  },

  rules() {
    const L = D.league;
    return `<h2>League Rules</h2><div class="card"><ul class="clean">${(L.rules || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
      ${(L.links || []).length ? `<h2>Links</h2><div class="card"><ul class="clean">${L.links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul></div>` : ''}`;
  }
};

function route() {
  const [page, arg] = (location.hash.slice(1) || 'home').split('/');
  const active = page === 'team' ? 'teams' : page;
  $('#nav').innerHTML = NAV.map(([k, label]) => `<a href="#${k}" class="${k === active ? 'on' : ''}">${label}</a>`).join('');
  const fn = PAGES[page] || PAGES.home;
  $('#view').innerHTML = fn(arg);
  window.scrollTo(0, 0);
}

(async function init() {
  try {
    await load();
    const L = D.league;
    document.title = L.name + ' · Dynasty Hub';
    $('#leagueName').textContent = L.name;
    $('#leagueTag').textContent = L.tagline || '';
    $('#statusPill').textContent = `${L.season} · Week ${L.week} · ${L.phase}`;
    window.addEventListener('hashchange', route);
    route();
  } catch (e) {
    $('#view').innerHTML = `<div class="card"><b>Couldn't load league data.</b><p class="muted">${esc(e.message)}. If you opened index.html straight from your computer, publish it with GitHub Pages (or run a local server) so the data files can load.</p></div>`;
  }
})();
