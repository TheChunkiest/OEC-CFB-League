const FILES = ['league', 'coaches', 'seasons', 'games', 'news'];
const D = {};
const NAV = [['home', 'Home'], ['standings', 'Standings'], ['schedule', 'Schedule'], ['odds', 'Odds'], ['rankings', 'Rankings'],
  ['coaches', 'Coaches'], ['alltime', 'All-Time'], ['history', 'History'], ['news', 'News']];
const AWARDS = [['mvp', 'MVP'], ['opoy', 'OPOY'], ['dpoy', 'DPOY'], ['bestOff', 'Best Offense'], ['bestDef', 'Best Defense']];
const CHAMP_WEEK = 14;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function load() {
  await Promise.all(FILES.map(async f => {
    const r = await fetch(f + '.json?v=' + Date.now());
    if (!r.ok) throw new Error('Could not load ' + f + '.json');
    D[f] = await r.json();
  }));
}

/* ---------- helpers ---------- */
const coachObj = id => D.coaches.find(c => c.id === id);
const isCoach = id => !!coachObj(id);
const nameOf = id => coachObj(id)?.name || String(id).replace(/^cpu:/i, '');
const season = n => D.seasons.find(s => s.season === n);
const teamOf = (id, s) => isCoach(id) ? (season(s)?.teams?.[id] || '') : '';
const WK = w => w === CHAMP_WEEK ? 'Championship' : 'Week ' + w;
const played = g => !!g.forfeit || (g.homeScore != null && g.awayScore != null && g.homeScore !== g.awayScore);
const winnerOf = g => g.forfeit ? g.forfeit : (played(g) ? (g.homeScore > g.awayScore ? g.home : g.away) : null);
const loserOf = g => { const w = winnerOf(g); return w ? (w === g.home ? g.away : g.home) : null; };
const bySW = (a, b) => a.season - b.season || a.week - b.week;
const userGame = g => isCoach(g.home) && isCoach(g.away);

function chip(id, s) {
  if (!isCoach(id)) return `<span class="chip">${esc(nameOf(id))}</span><span class="cpu">CPU</span>`;
  const t = teamOf(id, s);
  return `<a class="chip" href="#coach/${esc(id)}">${esc(nameOf(id))}</a>${t ? `<span class="team">${esc(t)}</span>` : ''}`;
}

function tally(games) {
  const r = {};
  const get = id => r[id] || (r[id] = { id, w: 0, l: 0, uw: 0, ul: 0, pf: 0, pa: 0, last: [] });
  games.slice().sort(bySW).forEach(g => {
    const w = winnerOf(g); if (!w) return;
    const l = loserOf(g), ug = userGame(g);
    get(w).w++; get(l).l++; get(w).last.push('W'); get(l).last.push('L');
    if (ug) { get(w).uw++; get(l).ul++; }
    if (!g.forfeit) {
      get(g.home).pf += g.homeScore; get(g.home).pa += g.awayScore;
      get(g.away).pf += g.awayScore; get(g.away).pa += g.homeScore;
    }
  });
  return r;
}
const streak = r => { if (!r || !r.last.length) return '–'; const c = r.last.at(-1); let n = 0; for (let i = r.last.length - 1; i >= 0 && r.last[i] === c; i--) n++; return c + n; };
const pct = r => r && (r.w + r.l) ? r.w / (r.w + r.l) : 0;
const pctStr = r => (r && (r.w + r.l) ? pct(r).toFixed(3).replace(/^0/, '') : '–');
const champGame = s => D.games.find(g => g.season === s && g.week === CHAMP_WEEK && winnerOf(g));
const champOf = s => { const g = champGame(s); return g ? { champ: winnerOf(g), runner: loserOf(g), game: g } : null; };
const scoreTxt = g => g.forfeit ? 'Forfeit' : `${Math.max(g.homeScore, g.awayScore)}-${Math.min(g.homeScore, g.awayScore)}`;
const activeIds = s => { const t = season(s)?.teams; return t ? Object.keys(t) : []; };

function gameCard(g) {
  const w = winnerOf(g), ok = played(g);
  const row = id => `<div>${chip(id, g.season)} ${w === id ? '<span class="win">●</span>' : ''}</div>`;
  const tags = (g.week === CHAMP_WEEK ? '<span class="tag">Championship</span> ' : '') + (userGame(g) ? '' : '<span class="cpu">vs CPU</span>');
  return `<div class="card game"><div class="teams">${row(g.away)}${row(g.home)}<div>${tags}</div></div>
    <div class="score">${ok ? (g.forfeit ? '<span class="muted">Forfeit</span>' : `<div>${g.awayScore}</div><div>${g.homeScore}</div>`) : '<span class="muted">Upcoming</span>'}</div></div>`;
}

const seasonSelect = (cur, onchange) => `<select onchange="${onchange}">${D.seasons.map(s => `<option value="${s.season}" ${s.season === cur ? 'selected' : ''}>Season ${s.season} (${s.year})</option>`).join('')}</select>`;

/* ---------- pages ---------- */
const PAGES = {
  home() {
    const L = D.league, games = D.games.filter(g => g.season === L.season && g.week === L.week);
    const pr = season(L.season)?.powerRankings || { ranks: [] };
    const lastChamp = [...D.seasons].reverse().map(s => ({ s, c: champOf(s.season) })).find(x => x.c);
    return `${L.announcement ? `<div class="card banner"><h2>📣 Commissioner's Desk</h2><div style="white-space:pre-wrap">${esc(L.announcement)}</div></div>` : ''}
      ${lastChamp ? `<div class="card"><span class="tag">Reigning champion</span><h2 style="margin:8px 0 0" class="champ">🏆 ${chip(lastChamp.c.champ, lastChamp.s.season)}</h2><div class="muted">Season ${lastChamp.s.season} (${lastChamp.s.year}) · beat ${esc(nameOf(lastChamp.c.runner))} ${scoreTxt(lastChamp.c.game)}</div></div>` : ''}
      <h2>${WK(L.week)} Matchups</h2>${games.length ? games.map(gameCard).join('') : '<div class="card empty">No games scheduled this week.</div>'}
      <div class="grid"><div class="card"><h2>Power Rankings</h2>${pr.ranks.length ? `<div class="tablewrap"><table>${rankRows(pr, L.season, 5)}</table></div><p><a href="#rankings">Full rankings →</a></p>` : '<p class="muted">Not posted yet this season.</p>'}</div>
      <div class="card"><h2>Latest News</h2>${D.news.slice(0, 3).map(n => `<div class="news"><span class="tag">${esc(n.tag || 'News')}</span> <span class="muted">${esc(n.date)}</span><h3>${esc(n.title)}</h3></div>`).join('')}<p><a href="#news">All news →</a></p></div></div>`;
  },

  standings(arg) {
    const sn = arg ? +arg : D.league.season, S = season(sn), t = tally(D.games.filter(g => g.season === sn));
    const ids = Object.keys(S.teams);
    const sorter = (a, b) => (t[b]?.w || 0) - (t[a]?.w || 0) || (t[a]?.l || 0) - (t[b]?.l || 0) || ((t[b]?.pf - t[b]?.pa) || 0) - ((t[a]?.pf - t[a]?.pa) || 0);
    const tbl = list => `<div class="tablewrap"><table><tr><th>#</th><th>Coach</th><th class="num">W-L</th><th class="num">Pct</th><th class="num">PF</th><th class="num">PA</th><th class="num">Strk</th></tr>
      ${list.map((id, i) => { const r = t[id] || { w: 0, l: 0, uw: 0, ul: 0, pf: 0, pa: 0, last: [] };
        return `<tr><td>${i + 1}</td><td>${chip(id, sn)}</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctStr(r)}</td><td class="num">${r.pf}</td><td class="num">${r.pa}</td><td class="num">${streak(r)}</td></tr>`; }).join('')}</table></div>`;
    const ch = champOf(sn);
    let body;
    if (S.divisions) {
      body = `<h3>${esc(S.divisions.title || 'Divisions')}</h3>` + Object.entries(S.divisions.groups).map(([name, members]) =>
        `<div class="card"><h3 style="margin-top:0">${esc(name)}</h3>${tbl(members.filter(m => ids.includes(m)).sort(sorter))}</div>`).join('') +
        `<h3>Overall</h3><div class="card">${tbl(ids.slice().sort(sorter))}</div>`;
    } else body = `<div class="card">${tbl(ids.slice().sort(sorter))}</div>`;
    return `<div class="row"><h2 style="margin:0">Standings</h2>${seasonSelect(sn, "location.hash='#standings/'+this.value")}</div>
      ${ch ? `<p class="champ">🏆 Champion: <b>${esc(nameOf(ch.champ))}</b> ${esc(teamOf(ch.champ, sn))}</p>` : ''}<br>${body}
      <p class="muted">Coach-vs-coach games only.</p>`;
  },

  schedule(arg) {
    const [a, b] = (arg || '').split('/');
    const sn = a ? +a : D.league.season;
    const weeks = [...new Set(D.games.filter(g => g.season === sn).map(g => g.week))].sort((x, y) => x - y);
    const wk = b !== undefined && b !== '' ? +b : (sn === D.league.season && weeks.includes(D.league.week) ? D.league.week : weeks[0]);
    const games = D.games.filter(g => g.season === sn && g.week === wk);
    return `<div class="row"><h2 style="margin:0">Schedule &amp; Scores</h2>${seasonSelect(sn, "location.hash='#schedule/'+this.value")}
      <select onchange="location.hash='#schedule/${sn}/'+this.value">${weeks.map(w => `<option value="${w}" ${w === wk ? 'selected' : ''}>${WK(w)}</option>`).join('')}</select></div><br>
      ${games.length ? games.map(gameCard).join('') : '<div class="card empty">No games for this week.</div>'}`;
  },

  rankings(arg) {
    const sn = arg ? +arg : D.league.season, pr = season(sn)?.powerRankings || { ranks: [] };
    return `<div class="row"><h2 style="margin:0">Power Rankings</h2>${seasonSelect(sn, "location.hash='#rankings/'+this.value")}</div>
      <p class="muted">${pr.label ? esc(pr.label) : ''}</p>
      ${pr.ranks.length ? `<div class="card"><div class="tablewrap"><table>${rankRows(pr, sn)}</table></div></div>` : '<div class="card empty">No rankings posted for this season yet.</div>'}`;
  },

  coaches() {
    const t = tally(D.games.filter(g => userGame(g))), cur = D.league.season;
    return `<h2>Coaches</h2><div class="grid">${D.coaches.map(c => {
      const titles = D.seasons.filter(s => champOf(s.season)?.champ === c.id).length, r = t[c.id] || { uw: 0, ul: 0 };
      return `<a class="card" style="color:inherit;text-decoration:none" href="#coach/${esc(c.id)}"><div style="font-weight:700;font-size:16px">${esc(c.name)} ${titles ? `<span class="champ">${'🏆'.repeat(titles)}</span>` : ''}</div>
        <div class="muted">${esc(teamOf(c.id, cur) || 'Not in current season')}</div><div>User record ${r.uw}-${r.ul}</div></a>`; }).join('')}</div>`;
  },

  coach(id) {
    const c = coachObj(id); if (!c) return '<div class="card empty">Coach not found.</div>';
    const all = D.games.filter(g => g.home === id || g.away === id), t = tally(all)[id] || { w: 0, l: 0, uw: 0, ul: 0, pf: 0, pa: 0 };
    const seasonRows = D.seasons.filter(s => s.teams[id]).map(s => {
      const r = tally(D.games.filter(g => g.season === s.season && (g.home === id || g.away === id)))[id] || { w: 0, l: 0 };
      const ch = champOf(s.season), fin = ch ? (ch.champ === id ? '🏆 Champion' : ch.runner === id ? 'Runner-up' : '') : '';
      const aw = AWARDS.filter(([k]) => s.awards?.[k]?.coach === id).map(([, l]) => l).join(', ');
      return `<tr><td>S${s.season} (${s.year})</td><td>${esc(s.teams[id])}</td><td class="num">${r.w}-${r.l}</td><td>${fin}</td><td>${esc(aw)}</td></tr>`;
    }).join('');
    const opp = D.coaches.filter(o => o.id !== id).map(o => {
      const gs = D.games.filter(g => userGame(g) && ((g.home === id && g.away === o.id) || (g.away === id && g.home === o.id)) && winnerOf(g));
      const w = gs.filter(g => winnerOf(g) === id).length, l = gs.length - w;
      return gs.length ? `<tr><td><a href="#coach/${esc(o.id)}">${esc(o.name)}</a></td><td class="num ${w > l ? 'win' : w < l ? 'loss' : ''}">${w}-${l}</td></tr>` : '';
    }).join('');
    const cur = D.games.filter(g => g.season === D.league.season && (g.home === id || g.away === id)).sort(bySW);
    return `<p><a href="#coaches">← All coaches</a></p>
      <div class="card"><h2>${esc(c.name)}</h2><div class="muted">${esc(teamOf(id, D.league.season) || 'Not in current season')}${c.discord ? ' · ' + esc(c.discord) : ''}</div>
        <p>Record vs other coaches: <b>${t.w}-${t.l}</b></p></div>
      <div class="card"><h3 style="margin-top:0">Seasons</h3><div class="tablewrap"><table><tr><th>Season</th><th>Team</th><th class="num">Record</th><th>Finish</th><th>Awards</th></tr>${seasonRows}</table></div></div>
      <div class="card"><h3 style="margin-top:0">Head-to-head vs coaches</h3><div class="tablewrap"><table>${opp || '<tr><td class="muted">No games yet</td></tr>'}</table></div></div>
      <h3>Season ${D.league.season} schedule</h3>${cur.map(gameCard).join('') || '<div class="card empty">No games.</div>'}`;
  },

  alltime() {
    const ug = D.games.filter(userGame), t = tally(ug);
    const titles = {}; D.seasons.forEach(s => { const c = champOf(s.season); if (c) titles[c.champ] = (titles[c.champ] || 0) + 1; });
    const order = D.coaches.map(c => c.id).filter(id => t[id]).sort((a, b) => pct(t[b]) - pct(t[a]) || t[b].w - t[a].w);
    const cnt = (k, id) => D.seasons.filter(s => s.awards?.[k]?.coach === id).length || '';
    const h2h = (a, b) => { const gs = ug.filter(g => winnerOf(g) && ((g.home === a && g.away === b) || (g.home === b && g.away === a))); const w = gs.filter(g => winnerOf(g) === a).length; return gs.length ? [w, gs.length - w] : null; };
    const ids = D.coaches.map(c => c.id).filter(id => t[id]);
    return `<h2>All-Time User vs. User</h2><p class="muted">Coach-vs-coach games only, all seasons, including championship games.</p>
      <div class="card"><div class="tablewrap"><table><tr><th>#</th><th>Coach</th><th class="num">W-L</th><th class="num">Pct</th><th class="num">🏆</th>${AWARDS.map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr>
      ${order.map((id, i) => `<tr><td>${i + 1}</td><td>${chip(id)}</td><td class="num">${t[id].w}-${t[id].l}</td><td class="num">${pctStr(t[id])}</td><td class="num">${titles[id] || ''}</td>${AWARDS.map(([k]) => `<td class="num">${cnt(k, id)}</td>`).join('')}</tr>`).join('')}</table></div></div>
      <h2>Series Matrix</h2><p class="muted">Row coach's record against the column coach.</p>
      <div class="card"><div class="tablewrap"><table class="matrix"><tr><th></th>${ids.map(id => `<th>${esc(nameOf(id).slice(0, 4))}</th>`).join('')}</tr>
      ${ids.map(a => `<tr><td><a href="#coach/${esc(a)}">${esc(nameOf(a))}</a></td>${ids.map(b => { if (a === b) return '<td class="muted">·</td>'; const r = h2h(a, b); return r ? `<td class="${r[0] > r[1] ? 'win' : r[0] < r[1] ? 'loss' : ''}">${r[0]}-${r[1]}</td>` : '<td class="muted">–</td>'; }).join('')}</tr>`).join('')}</table></div></div>`;
  },

  history() {
    return `<h2>League History</h2>` + [...D.seasons].reverse().map(s => {
      const c = champOf(s.season), A = s.awards || {};
      const aw = AWARDS.filter(([k]) => A[k]).map(([k, l]) => `<tr><td>${l}</td><td>${esc(A[k].name)}</td><td>${A[k].coach ? chip(A[k].coach, s.season) : ''}</td></tr>`).join('');
      return `<div class="card"><h2>Season ${s.season} <span class="muted">· ${s.year}</span></h2>
        ${c ? `<p class="champ">🏆 <b>${esc(nameOf(c.champ))}</b> ${esc(teamOf(c.champ, s.season))} over ${esc(nameOf(c.runner))} ${esc(teamOf(c.runner, s.season))}, ${scoreTxt(c.game)}</p>` : '<p class="muted">Champion not decided yet.</p>'}
        ${aw ? `<div class="tablewrap"><table>${aw}</table></div>` : ''}
        ${A.gameOfYear ? `<p>⭐ Game of the Year: <b>${esc(A.gameOfYear)}</b></p>` : ''}
        ${(s.moments || []).length ? `<h3>"Holy Sh*t" Moments</h3><ul class="clean moments">${s.moments.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}</div>`;
    }).join('');
  },

  news() {
    return `<h2>League News</h2>` + D.news.map(n => `<div class="card news"><span class="tag">${esc(n.tag || 'News')}</span> <span class="muted">${esc(n.date)}</span><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p></div>`).join('');
  },

  odds(arg) {
    const sn = D.league.season, S = season(sn);
    const open = [...new Set(D.games.filter(g => g.season === sn && !played(g)).map(g => g.week))].sort((x, y) => x - y);
    const wk = arg !== '' && arg != null ? +arg : (open.includes(D.league.week) ? D.league.week : open[0]);
    const lines = D.games.filter(g => g.season === sn && g.week === wk && !played(g)).map(g => {
      const p = predict(g.away, g.home), side = (sp, pw) => `<div>${fmtSpread(sp)} <b>${americanML(pw)}</b></div>`;
      return `<div class="card game"><div class="teams"><div>${chip(g.away, sn)}</div><div>${chip(g.home, sn)}</div>
        <div class="muted">O/U ${half(p.total)} · Win ${pc(1 - p.pHome)} / ${pc(p.pHome)}</div></div>
        <div class="score">${side(p.margin, 1 - p.pHome)}${side(-p.margin, p.pHome)}</div></div>`;
    }).join('');
    const champ = champOf(sn), sim = champ ? null : simulate(sn);
    const ids = Object.keys(S.teams);
    const tbl = list => `<div class="tablewrap"><table><tr><th>Coach</th><th class="num">Now</th><th class="num">Proj</th>${S.divisions ? '<th class="num">Division</th>' : ''}<th class="num">Title game</th><th class="num">Champion</th></tr>
      ${list.map(id => { const o = sim.out[id]; return `<tr><td>${chip(id, sn)}</td><td class="num">${o.cw}-${o.cl}</td><td class="num">${o.w.toFixed(1)}-${o.l.toFixed(1)}</td>${S.divisions ? barCell(o.div) : ''}${barCell(o.title)}${barCell(o.champ)}</tr>`; }).join('')}</table></div>`;
    let odds = '';
    if (champ) odds = `<div class="card">Season ${sn} is complete. 🏆 Champion: <b>${esc(nameOf(champ.champ))}</b>.</div>`;
    else odds = S.divisions ? Object.entries(S.divisions.groups).map(([name, m]) => `<div class="card"><h3 style="margin-top:0">${esc(name)}</h3>${tbl(m.filter(x => ids.includes(x)).sort((x, y) => sim.out[y].champ - sim.out[x].champ || sim.out[y].div - sim.out[x].div))}</div>`).join('')
      : `<div class="card">${tbl(ids.slice().sort((x, y) => sim.out[y].champ - sim.out[x].champ))}</div>`;
    const ranked = ids.slice().sort((x, y) => rate(y) - rate(x));
    return `<h2>Odds</h2><p class="muted">Generated from every result in the league. For fun only. Updates automatically whenever new scores are posted.</p>
      <div class="row"><h3 style="margin:0">Lines</h3>${open.length ? `<select onchange="location.hash='#odds/'+this.value">${open.map(w => `<option value="${w}" ${w === wk ? 'selected' : ''}>${WK(w)}</option>`).join('')}</select>` : ''}</div><br>
      ${lines || '<div class="card empty">No upcoming games to set lines for.</div>'}
      <h3>Division &amp; Conference Odds</h3>${odds}
      ${sim ? `<p class="muted">Based on ${MODEL.sims.toLocaleString()} simulations of the ${sim.remaining} remaining regular-season games. ${S.divisions ? 'Division winners meet in the championship game.' : 'The top two teams meet in the championship game.'} Ties are broken by point differential.</p>` : ''}
      <h3>Model Ratings</h3><div class="card"><div class="tablewrap"><table><tr><th>#</th><th>Coach</th><th class="num">Rating</th></tr>
      ${ranked.map((id, i) => `<tr><td>${i + 1}</td><td>${chip(id, sn)}</td><td class="num">${rate(id) >= 0 ? '+' : ''}${rate(id).toFixed(1)}</td></tr>`).join('')}</table></div>
      <p class="muted">Rating = points better or worse than an average coach. A positive spread means that team is the underdog.</p></div>`;
  }
};


/* ---------- odds model ---------- */
const MODEL = { k: 0.2, cap: 35, regress: 0.2, hfa: 0, sigma: 22, vig: 0.045, avgPts: 28, prior: 4, sims: 5000 };
let _model = null;
function model() {
  if (_model) return _model;
  const R = {}, seasonsList = [...new Set(D.games.map(g => g.season))].sort((a, b) => a - b);
  seasonsList.forEach((s, si) => {
    if (si > 0) Object.keys(R).forEach(c => R[c] *= (1 - MODEL.regress));
    const weeks = [...new Set(D.games.filter(g => g.season === s).map(g => g.week))].sort((a, b) => a - b);
    weeks.forEach(w => {
      const upd = {};
      D.games.filter(g => g.season === s && g.week === w && !g.forfeit && g.homeScore != null && g.awayScore != null).forEach(g => {
        R[g.home] ??= 0; R[g.away] ??= 0;
        const exp = R[g.home] - R[g.away] + MODEL.hfa, act = Math.max(-MODEL.cap, Math.min(MODEL.cap, g.homeScore - g.awayScore));
        upd[g.home] = (upd[g.home] || 0) + MODEL.k * (act - exp);
        upd[g.away] = (upd[g.away] || 0) - MODEL.k * (act - exp);
      });
      Object.entries(upd).forEach(([c, v]) => R[c] += v);
    });
  });
  const cur = D.league.season, P = {};
  D.games.filter(g => !g.forfeit && g.homeScore != null && g.awayScore != null).forEach(g => {
    const wt = g.season === cur ? 1 : 0.5;
    [[g.home, g.homeScore, g.awayScore], [g.away, g.awayScore, g.homeScore]].forEach(([id, f, ag]) => {
      const p = P[id] ??= { w: 0, pf: 0, pa: 0 }; p.w += wt; p.pf += wt * f; p.pa += wt * ag;
    });
  });
  const pts = id => { const p = P[id] || { w: 0, pf: 0, pa: 0 }, d = p.w + MODEL.prior;
    return { pf: (p.pf + MODEL.prior * MODEL.avgPts) / d, pa: (p.pa + MODEL.prior * MODEL.avgPts) / d }; };
  return _model = { R, pts };
}
const rate = id => model().R[id] ?? 0;
const erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
const phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
function predict(away, home) {
  const m = rate(home) - rate(away) + MODEL.hfa, M = model(), ph = M.pts(home), pa = M.pts(away);
  return { margin: m, pHome: phi(m / MODEL.sigma), total: ((ph.pf + pa.pa) / 2) + ((pa.pf + ph.pa) / 2) };
}
const half = x => Math.round(x * 2) / 2;
const fmtSpread = x => { const s = half(x); return s === 0 ? 'PK' : (s > 0 ? '+' : '') + s; };
function americanML(p) {
  const q = Math.min(0.97, Math.max(0.03, p * (1 + MODEL.vig)));
  let v = q >= 0.5 ? -100 * q / (1 - q) : 100 * (1 - q) / q;
  v = Math.round(v / 5) * 5; return v > 0 ? '+' + v : String(v);
}
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function simulate(sn) {
  const S = season(sn), ids = Object.keys(S.teams), rand = rng(27 + sn);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const base = {}; ids.forEach(i => base[i] = { w: 0, l: 0, pd: 0 });
  const remaining = [];
  D.games.filter(g => g.season === sn && g.week < CHAMP_WEEK).forEach(g => {
    if (!base[g.home] || !base[g.away]) return;
    if (played(g)) { const w = winnerOf(g), l = loserOf(g); base[w].w++; base[l].l++; if (!g.forfeit) { base[g.home].pd += g.homeScore - g.awayScore; base[g.away].pd += g.awayScore - g.homeScore; } }
    else remaining.push({ g, exp: predict(g.away, g.home).margin });
  });
  const groups = S.divisions ? Object.values(S.divisions.groups).map(m => m.filter(x => ids.includes(x))) : null;
  const out = {}; ids.forEach(i => out[i] = { div: 0, title: 0, champ: 0, w: 0, l: 0 });
  const N = MODEL.sims;
  for (let n = 0; n < N; n++) {
    const cur = {}; ids.forEach(i => cur[i] = { ...base[i], j: rand() });
    remaining.forEach(({ g, exp }) => {
      const m = exp + MODEL.sigma * normal();
      if (m > 0) { cur[g.home].w++; cur[g.away].l++; } else { cur[g.away].w++; cur[g.home].l++; }
      cur[g.home].pd += m; cur[g.away].pd -= m;
    });
    const rank = list => list.slice().sort((x, y) => cur[y].w - cur[x].w || cur[y].pd - cur[x].pd || cur[y].j - cur[x].j);
    ids.forEach(i => { out[i].w += cur[i].w; out[i].l += cur[i].l; });
    let finalists;
    if (groups && groups.length === 2) { finalists = groups.map(gr => rank(gr)[0]); finalists.forEach(f => out[f].div++); }
    else finalists = rank(ids).slice(0, 2);
    finalists.forEach(f => out[f].title++);
    const m = predict(finalists[0], finalists[1]).margin + MODEL.sigma * normal();
    out[m > 0 ? finalists[1] : finalists[0]].champ++;
  }
  ids.forEach(i => { const o = out[i]; o.div /= N; o.title /= N; o.champ /= N; o.w /= N; o.l /= N; o.cw = base[i].w; o.cl = base[i].l; });
  return { out, groups, remaining: remaining.length };
}
const pc = x => x >= 0.995 ? '>99%' : x < 0.005 ? '<1%' : Math.round(x * 100) + '%';
const barCell = x => `<td class="num"><div class="bar"><span style="width:${Math.round(x * 100)}%"></span></div>${pc(x)}</td>`;

function rankRows(pr, sn, limit) {
  const prev = pr.previous || [];
  return pr.ranks.slice(0, limit || 99).map((id, i) => {
    const pi = prev.indexOf(id), mv = !prev.length ? null : pi < 0 ? 'NEW' : pi - i;
    const m = mv === null ? '' : mv === 'NEW' ? '<span class="up">NEW</span>' : mv > 0 ? `<span class="up">▲${mv}</span>` : mv < 0 ? `<span class="down">▼${-mv}</span>` : '';
    return `<tr><td class="rank">${i + 1}</td><td>${chip(id, sn)}</td><td class="num">${m}</td></tr>`;
  }).join('');
}

function route() {
  const [page, ...rest] = (location.hash.slice(1) || 'home').split('/');
  const active = page === 'coach' ? 'coaches' : page;
  $('#nav').innerHTML = NAV.map(([k, label]) => `<a href="#${k}" class="${k === active ? 'on' : ''}">${label}</a>`).join('');
  $('#view').innerHTML = (PAGES[page] || PAGES.home)(rest.join('/'));
  window.scrollTo(0, 0);
}

(async function init() {
  try {
    await load();
    const L = D.league;
    document.title = L.name;
    $('#leagueName').textContent = L.name;
    $('#leagueTag').textContent = L.tagline || '';
    const dl = (L.links || [])[0]; if (dl && dl.url) $('#discord').innerHTML = ` · <a href="${esc(dl.url)}" target="_blank" rel="noopener">${esc(dl.label || 'Discord')}</a>`;
    $('#statusPill').textContent = `Season ${L.season} · ${WK(L.week)} · ${L.phase}`;
    window.addEventListener('hashchange', route);
    route();
  } catch (e) {
    $('#view').innerHTML = `<div class="card"><b>Couldn't load league data.</b><p class="muted">${esc(e.message)}. If you opened index.html straight from your computer, publish it with GitHub Pages so the data files can load.</p></div>`;
  }
})();
