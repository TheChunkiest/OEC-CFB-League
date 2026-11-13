import {
  $, $$, esc, D, DEMO, PHASES, START_CREDITS, loadAll, put, del, newId, loadBallots, auth, isCommish, myTeam, watchAuth, login, signup, logout,
  resetPassword, refreshProfile, team, teamColor, isUserTeam, leagueTeams, userTeams, played, seasonGames, coachOf, slug, fmtOdds, fmtLine,
  pctStr, weekLabel, chip, lineOf, records, streak, rec, orderGroup, divisions, simulate, oddsHistory, currentPower, bankroll, wagerLabel,
  gotwTally, coachStats, storylines, seasonNum, futuresBoard, futuresOpen, futuresPosted, ensureFutures, friendlyError, refreshLive, juiceOf, MAX_LEGS, parlayOdds, parlayProfit, winsBoard, winsPosted, legsHtml
} from './core.js?v=17';

const DEFAULT_RULES = ["Cloud dynasty with active rosters and cross-play", "All-American difficulty with custom sliders", "10-minute quarters with 17-second accelerated clock", "League advances every 3 days; 24 hours can be added for user games if needed", "League commissioner is Chunky and league admin is Clay", "All communication happens in the league Discord"];
const NAV = [['home', 'Home'], ['standings', 'Standings'], ['schedule', 'Schedule'], ['odds', 'Odds'], ['betting', 'Betting'],
  ['rankings', 'Power Rankings'], ['teams', 'Teams'], ['vote', 'Vote'], ['history', 'History'], ['rules', 'Rules']];
const UI = { stSort: { key: 'place', dir: 1 }, prSort: { key: 'rank', dir: 1 }, prUsers: false, oddsSort: { key: 'titlePct', dir: -1 }, metric: 'titlePct', acct: 'login', slip: null, msg: '', betWeek: null, mode: 'single', legs: [] };

/* ---------- small renderers ---------- */
const S = () => D.league.season;
const lineText = (g, l = lineOf(g)) => {
  if (!l) return '';
  const fav = l.spread <= 0 ? g.home : g.away;
  const fj = juiceOf(l, 'spread', fav === g.home ? 'home' : 'away');
  return `${l.spread === 0 ? 'PK' : esc(team(fav).abbr || team(fav).name) + ' ' + fmtLine(-Math.abs(l.spread))}${fj !== -110 ? ` (${fmtOdds(fj)})` : ''} · O/U ${l.total} · ML ${esc(team(g.away).abbr)} ${fmtOdds(l.mlAway)} / ${esc(team(g.home).abbr)} ${fmtOdds(l.mlHome)}`;
};
function gameCard(g, opts = {}) {
  const h = team(g.home), a = team(g.away), done = played(g);
  const hw = done && +g.homeScore > +g.awayScore, aw = done && !hw;
  const tags = [];
  if (isUserTeam(h) && isUserTeam(a)) tags.push('<span class="h2h">USER GAME</span>');
  if (g.type === 'ccg') tags.push('<span class="tag gold">League Championship</span>');
  if (g.type === 'bowl') tags.push('<span class="tag">Postseason</span>');
  if (opts.gotw) tags.push('<span class="tag gold">Game of the Week</span>');
  const coach = t => isUserTeam(t) ? ` <span class="muted small">${esc(t.coach)}</span>` : '';
  const l = lineOf(g);
  let meta = '';
  if (done && g.forfeit) meta = 'Forfeit win';
  else if (l && !done) meta = (g.lines ? '' : 'Projected: ') + lineText(g, l);
  else if (l && done) {
    const m = +g.homeScore - +g.awayScore + l.spread, fav = l.spread <= 0 ? g.home : g.away;
    const cov = m === 0 ? 'Push' : (m > 0 ? team(g.home).abbr : team(g.away).abbr) + ' covered';
    meta = `Line: ${l.spread === 0 ? 'PK' : esc(team(fav).abbr) + ' ' + fmtLine(-Math.abs(l.spread))} · ${esc(cov)} · Total ${+g.homeScore + +g.awayScore} (${+g.homeScore + +g.awayScore > l.total ? 'Over' : +g.homeScore + +g.awayScore < l.total ? 'Under' : 'Push'} ${l.total})`;
  }
  return `<div class="card game${opts.gotw ? ' gotw' : ''}">${opts.gotw ? '<span class="ribbon">★ Game of the Week</span>' : ''}<div class="teams">
      <div class="${done ? (aw ? 'w' : 'l') : ''}">${chip(a.id)}${coach(a)}</div>
      <div class="${done ? (hw ? 'w' : 'l') : ''}">${g.neutral ? 'vs' : '@'} ${chip(h.id)}${coach(h)} ${tags.join(' ')}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ''}${opts.extra || ''}</div>
    <div class="score">${done ? `<div class="${aw ? 'w' : 'l'}">${g.forfeit ? (aw ? 'FW' : 'FL') : g.awayScore}</div><div class="${hw ? 'w' : 'l'}">${g.forfeit ? (hw ? 'FW' : 'FL') : g.homeScore}</div>` : '<span class="muted small">Wk ' + g.week + '</span>'}</div></div>`;
}
const sortTh = (st, key, label, cls = '') => `<th data-sort="${key}" class="${cls}${st.key === key ? ' sorted' : ''}">${label}${st.key === key ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
function sortRows(rows, st, getters) {
  const f = getters[st.key] || (r => r[st.key]);
  return rows.slice().sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.dir; });
}
const mvHtml = m => m > 0 ? `<span class="up">+${m}</span>` : m < 0 ? `<span class="down">${m}</span>` : '<span class="muted">–</span>';

/* ---------- pages ---------- */
const PAGES = {
  home() {
    const L = D.league, s = S(), wk = L.week;
    const games = D.games.filter(g => g.season === s && g.week === wk).sort((a, b) => (isUserTeam(team(b.home)) + isUserTeam(team(b.away))) - (isUserTeam(team(a.home)) + isUserTeam(team(a.away))));
    const gt = gotwTally(s, wk);
    const stories = storylines();
    const pr = currentPower().slice(0, 5);
    const leaders = D.users.filter(u => u.teamId).map(u => ({ u, b: bankroll(u.id) })).sort((a, b) => b.b.balance - a.b.balance).slice(0, 5);
    let html = '';
    if (L.desk && L.desk.show && L.desk.text) html += `<div class="card banner"><h2>Commissioner's Desk</h2><div style="white-space:pre-wrap">${esc(L.desk.text)}</div></div>`;
    if (gt.game) html += gameCard(gt.game, { gotw: true, extra: `<div class="meta">${gt.counts[gt.game.id]} of ${gt.total} coach vote${gt.total === 1 ? '' : 's'}</div>` });
    else if (L.phase === PHASES.REG) html += `<div class="card gotw"><span class="ribbon">★ Game of the Week</span><div class="muted">No Game of the Week votes were cast for ${esc(weekLabel())}. <a href="#vote">Vote for next week's game →</a></div></div>`;
    html += `<div class="grid2"><div><h2>This Week's Storylines</h2><div class="card">${stories.length ? stories.map(st => `<div class="story"><span class="tag">${esc(st.tag)}</span><h3>${esc(st.title)}</h3><p>${esc(st.body)}</p></div>`).join('') : '<div class="empty">Storylines appear once games are played.</div>'}</div></div>
      <div><h2>${esc(weekLabel())} Matchups</h2>${games.length ? games.filter(g => g.id !== gt.game?.id).map(g => gameCard(g)).join('') || '<div class="card empty">Only the Game of the Week is on the slate.</div>' : '<div class="card empty">No games scheduled this week.</div>'}</div></div>
      <div class="grid"><div class="card"><h2>Power Rankings</h2><table>${pr.map(x => `<tr><td class="rank">${x.rank}</td><td>${chip(x.id)}</td><td class="num">${rec(x.rec)}</td><td class="num">${mvHtml(x.move)}</td></tr>`).join('')}</table><p><a href="#rankings">Full rankings →</a></p></div>
      <div class="card"><h2>Betting Leaders</h2>${leaders.length ? `<table>${leaders.map((x, i) => `<tr><td class="rank">${i + 1}</td><td>${esc(x.u.name)}</td><td class="num">${x.b.w}-${x.b.l}${x.b.p ? '-' + x.b.p : ''}</td><td class="num"><b>${x.b.balance.toLocaleString()}</b></td></tr>`).join('')}</table>` : '<div class="muted">No coaches linked yet.</div>'}<p><a href="#betting">Place wagers →</a></p></div></div>`;
    return html;
  },

  standings() {
    const s = S(), R = records(s), st = UI.stSort;
    return `<h2>${s} ${esc(D.league.conference)} Standings</h2><p class="muted small">Tap a column header to sort. "Place" is the official order (conference record, head-to-head, overall, point differential).</p>` + divisions().map(d => {
      const ids = leagueTeams().filter(t => !d || t.div === d).map(t => t.id);
      const ordered = orderGroup(ids, s).map((id, i) => ({ id, place: i + 1, ...R[id], name: team(id).name, coach: team(id).coach || 'CPU', cpct: R[id].cw + R[id].cl ? R[id].cw / (R[id].cw + R[id].cl) : 0, opct: R[id].w + R[id].l ? R[id].w / (R[id].w + R[id].l) : 0, diff: R[id].pf - R[id].pa, stk: streak(R[id]) }));
      const rows = sortRows(ordered, st, { stk: r => (r.stk[0] === 'W' ? 1 : -1) * (+r.stk.slice(1) || 0) });
      return `<div class="card"><h3 style="margin-top:0">${esc(d ? D.league.conference + ' ' + d : D.league.conference)}</h3><div class="tablewrap"><table>
        <tr>${sortTh(st, 'place', '#')}${sortTh(st, 'name', 'Team')}${sortTh(st, 'coach', 'Coach')}${sortTh(st, 'cpct', 'Conf', 'num')}${sortTh(st, 'opct', 'Overall', 'num')}${sortTh(st, 'pf', 'PF', 'num')}${sortTh(st, 'pa', 'PA', 'num')}${sortTh(st, 'diff', 'Diff', 'num')}${sortTh(st, 'stk', 'Strk', 'num')}</tr>
        ${rows.map(r => `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td class="rank">${r.place}</td><td>${chip(r.id)}</td><td>${isUserTeam(team(r.id)) ? `<a href="#coach/${slug(r.coach)}">${esc(r.coach)}</a>` : '<span class="muted">CPU</span>'}</td><td class="num">${r.cw}-${r.cl}</td><td class="num">${r.w}-${r.l}</td><td class="num">${r.pf}</td><td class="num">${r.pa}</td><td class="num">${r.diff > 0 ? '+' : ''}${r.diff}</td><td class="num">${r.stk}</td></tr>`).join('')}
      </table></div></div>`;
    }).join('');
  },

  schedule(arg) {
    const s = S(), weeks = [...new Set(seasonGames().map(g => g.week))].sort((a, b) => a - b);
    const wk = arg != null && arg !== '' ? +arg : (weeks.includes(D.league.week) ? D.league.week : weeks[weeks.length - 1]);
    const games = D.games.filter(g => g.season === s && g.week === wk);
    const gt = gotwTally(s, wk).game;
    return `<div class="row spread"><h2 style="margin:0">Schedule &amp; Scores</h2>
      <select data-nav="schedule">${weeks.map(w => `<option value="${w}" ${w === wk ? 'selected' : ''}>Week ${w}</option>`).join('')}</select></div>
      <p class="muted small">Lines for upcoming weeks update after every advance. You can bet any upcoming week on the Betting page, and a bet keeps the line you took.</p>
      ${games.length ? games.map(g => gameCard(g, { gotw: gt && gt.id === g.id })).join('') : '<div class="card empty">No games for this week.</div>'}`;
  },

  odds() {
    const s = S(), L = D.league, cur = L.phase === PHASES.REG ? L.week : 999;
    const sim = simulate(s, cur), st = UI.oddsSort;
    const pre = !seasonGames().some(played);
    const rows = sortRows(leagueTeams().map(t => ({ id: t.id, name: t.name, coach: t.coach || 'CPU', ...sim[t.id] })), st, { likely: r => parseInt(r.likely) });
    const hist = oddsHistory();
    const divLbl = divisions().length > 1 ? 'Division' : 'Reg. Season Title';
    return `<h2>${pre ? 'Preseason Odds' : 'Season Odds'}</h2>
      <p class="muted small">${pre ? 'Built from team overall, offense and defense ratings and the full schedule, before any Week 0 games.' : 'Re-simulated 1,500 times after every advance using results so far.'} "League Title" means winning the ${esc(L.conference)} Championship Game.</p>
      <div class="card"><div class="tablewrap"><table>
        <tr>${sortTh(st, 'name', 'Team')}${sortTh(st, 'coach', 'Coach')}${sortTh(st, 'likely', 'Likely Record', 'num')}${sortTh(st, 'expW', 'Proj. Wins', 'num')}${sortTh(st, 'divPct', divLbl, 'num')}${sortTh(st, 'ccgPct', 'Make Title Game', 'num')}${sortTh(st, 'titlePct', 'League Title', 'num')}</tr>
        ${rows.map(r => `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td>${chip(r.id)}</td><td>${isUserTeam(team(r.id)) ? esc(r.coach) : '<span class="muted">CPU</span>'}</td><td class="num">${r.likely}</td><td class="num">${r.expW.toFixed(1)}</td><td class="num">${pctStr(r.divPct)}</td><td class="num">${pctStr(r.ccgPct)}</td><td class="num"><b>${pctStr(r.titlePct)}</b></td></tr>`).join('')}
      </table></div></div>
      <h2>Coach Odds Trend</h2><div class="card chart"><div class="row spread"><div class="seg">
        ${[['titlePct', 'League Title %'], ['divPct', divLbl + ' %'], ['expW', 'Projected Wins']].map(([k, l]) => `<button data-metric="${k}" class="${UI.metric === k ? 'on' : ''}">${l}</button>`).join('')}
      </div><span class="muted small">Odds entering each week · ${s} season · resets each new season</span></div>${trendChart(hist)}</div>`;
  },

  betting() {
    const L = D.league, s = S(), me = auth.profile;
    const bwks = [...new Set(D.games.filter(g => g.season === s && g.week >= L.week && !played(g)).map(g => g.week))].sort((a, b) => a - b);
    const bw = bwks.includes(UI.betWeek) ? UI.betWeek : bwks[0];
    const games = D.games.filter(g => g.season === s && g.week === bw && !played(g));
    const open = L.bettingOpen && L.phase !== PHASES.PRE && L.phase !== PHASES.POST;
    let html = `<h2>Sportsbook · ${esc(weekLabel())}</h2>`;
    if (!me) html += `<div class="notice">Every coach gets <b>${START_CREDITS.toLocaleString()} credits</b> per season. <a href="#account">Log in</a> to place wagers.</div>`;
    else if (!me.teamId) html += `<div class="notice">Your account isn't linked to a team yet. Ask the commissioner to link it.</div>`;
    if (me && me.teamId) {
      const b = bankroll(me.id);
      html += `<div class="card"><div class="stat"><div><span>Balance</span><b>${b.balance.toLocaleString()}</b></div><div><span>In play</span><b>${b.open}</b></div><div><span>Record</span><b>${b.w}-${b.l}${b.p ? '-' + b.p : ''}</b></div><div><span>Net</span><b class="${b.net >= 0 ? 'win' : 'loss'}">${b.net >= 0 ? '+' : ''}${b.net}</b></div></div></div>`;
    }
    html += !open ? `<div class="card empty">Betting is ${L.phase === PHASES.PRE ? 'closed until the season is published' : 'locked right now'}.</div>` :
      games.length ? `<div class="row" style="margin-bottom:10px"><div class="seg"><button data-mode="single" class="${UI.mode === 'single' ? 'on' : ''}">Single bets</button><button data-mode="parlay" class="${UI.mode === 'parlay' ? 'on' : ''}">Parlay</button></div>
        ${UI.mode === 'parlay' ? `<span class="muted small">Tap 2–${MAX_LEGS} picks from any upcoming week, plus League Champion and Win Total picks below. Per game: a spread <i>or</i> moneyline, plus the O/U. All must hit; payouts multiply.</span>` : ''}</div>
        <div class="row" style="margin-bottom:10px"><b>Bet on</b><select data-betweek="1">${bwks.map(w => `<option value="${w}" ${w === bw ? 'selected' : ''}>Week ${w}${w === L.week ? ' (this week)' : ''}</option>`).join('')}</select>
        <span class="muted small">${bw === L.week ? 'This week\'s games.' : 'Early lines: they move after every advance, but your bet keeps the line you took.'}</span></div><div class="card"><div class="betgrid"><div class="hdr tm">Matchup</div><div class="hdr">Spread</div><div class="hdr">Moneyline</div><div class="hdr">Total</div>
        ${games.map(g => betRows(g)).join('')}</div></div>` : '<div class="card empty">No open games this week.</div>';
    html += futuresSection();
    html += winsSection();
    if (me && me.teamId) {
      const mine = D.wagers.filter(w => w.uid === me.id && w.season === s).sort((a, b) => b.week - a.week || (b.ts || 0) - (a.ts || 0));
      html += `<h2>My Wagers</h2><div class="card">${mine.length ? `<div class="tablewrap"><table><tr><th>Wk</th><th>Bet</th><th class="num">Stake</th><th class="num">Result</th><th></th></tr>
        ${mine.map(w => { const g = D.games.find(x => x.id === w.gameId); const canCancel = w.status === 'open' && w.market !== 'parlay' && (w.market === 'future' || w.market === 'wins' ? futuresOpen() : open && g && !played(g));
          return `<tr><td>${w.market === 'future' ? 'Fut' : w.market === 'wins' ? 'Wins' : w.market === 'parlay' ? 'Par' : (g ? g.week : w.week)}</td><td>${esc(wagerLabel(w))}${legsHtml(w)}</td><td class="num">${w.stake}</td><td class="num"><span class="pill ${w.status}">${w.status === 'open' ? 'Open · to win ' + (w.market === 'parlay' ? parlayProfit(w.stake, w.legs || []) : Math.round(w.odds > 0 ? w.stake * w.odds / 100 : w.stake * 100 / -w.odds)) : w.status.toUpperCase() + (w.payout ? ' ' + (w.payout > 0 ? '+' : '') + w.payout : '')}</span></td><td>${canCancel ? `<button class="sm ghost" data-cancel="${esc(w.id)}">Cancel</button>` : ''}</td></tr>`; }).join('')}
      </table></div>` : '<div class="muted">No wagers yet this season.</div>'}</div>`;
    }
    const board = D.users.filter(u => u.teamId).map(u => ({ u, b: bankroll(u.id) })).sort((a, b) => b.b.balance - a.b.balance);
    html += `<h2>Season ${seasonNum()} Leaderboard</h2><div class="card"><div class="tablewrap"><table><tr><th>#</th><th>Coach</th><th class="num">W-L-P</th><th class="num">Net</th><th class="num">ROI</th><th class="num">Balance</th></tr>
      ${board.map((x, i) => `<tr class="${me && me.id === x.u.id ? 'me' : ''}"><td class="rank">${i + 1}</td><td><a href="#coach/${slug(x.u.name)}">${esc(x.u.name)}</a> <span class="muted small">${esc(team(x.u.teamId).name)}</span></td><td class="num">${x.b.w}-${x.b.l}-${x.b.p}</td><td class="num ${x.b.net >= 0 ? 'win' : 'loss'}">${x.b.net >= 0 ? '+' : ''}${x.b.net}</td><td class="num">${x.b.risked ? Math.round(x.b.net / x.b.risked * 100) + '%' : '–'}</td><td class="num"><b>${x.b.balance.toLocaleString()}</b></td></tr>`).join('')}
    </table></div></div>`;
    const wk = D.wagers.filter(w => w.season === s && w.week === L.week);
    if (wk.length) html += `<h2>Bets Placed This Week</h2><div class="card"><div class="tablewrap"><table>${wk.map(w => `<tr><td>${esc(w.coach || '')}</td><td style="white-space:normal">${esc(wagerLabel(w))}${legsHtml(w)}</td><td class="num">${w.stake}</td><td class="num"><span class="pill ${w.status}">${w.status}</span></td></tr>`).join('')}</table></div></div>`;
    return html;
  },

  rankings() {
    const st = UI.prSort;
    let rows = currentPower().map(x => ({ ...x, name: team(x.id).name, coach: team(x.id).coach || 'CPU', wp: x.rec.w + x.rec.l ? x.rec.w / (x.rec.w + x.rec.l) : 0 }));
    rows = sortRows(rows, st, {});
    const lw = (() => { const w = seasonGames().filter(played).map(g => g.week); return w.length ? Math.max(...w) : null; })();
    return `<h2>Power Rankings</h2><p class="muted small">${lw == null ? 'Preseason order from team ratings.' : `Through Week ${lw}.`} Generated from team strength (adjusted every game by how each team performed versus expectations), recent form (last 3 games versus the spread) and record — not record alone. "Move" is the change since the previous week.</p>
      <div class="row" style="margin-bottom:10px"><div class="seg"><button data-prsort="rank" class="${st.key === 'rank' ? 'on' : ''}">Sort by rank</button><button data-prsort="move" class="${st.key === 'move' ? 'on' : ''}">Sort by movement</button></div></div>
      <div class="card"><div class="tablewrap"><table><tr>${sortTh(st, 'rank', '#')}${sortTh(st, 'name', 'Team')}${sortTh(st, 'coach', 'Coach')}${sortTh(st, 'wp', 'Record', 'num')}${sortTh(st, 'hot', 'Form', 'num')}${sortTh(st, 'move', '+/−', 'num')}</tr>
      ${rows.map(r => `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td class="rank">${r.rank}</td><td>${chip(r.id)}</td><td>${isUserTeam(team(r.id)) ? esc(r.coach) : '<span class="muted">CPU</span>'}</td><td class="num">${rec(r.rec)}</td>
        <td class="num">${r.hot >= 4 ? '🔥 ' : r.hot <= -4 ? '🧊 ' : ''}<span class="${r.hot > 0 ? 'up' : r.hot < 0 ? 'down' : 'muted'}">${r.hot > 0 ? '+' : ''}${r.hot.toFixed(1)}</span></td><td class="num">${mvHtml(r.move)}</td></tr>`).join('')}
      </table></div><p class="muted small">Form = average points per game better (+) or worse (−) than expected over the last 3 games.</p></div>`;
  },

  teams() {
    const R = records(S()), all = D.teams.filter(t => t.conf === D.league.conference);
    return divisions().map(d => `<h2>${esc(d ? D.league.conference + ' ' + d : D.league.conference)}</h2><div class="grid">${all.filter(t => !d || t.div === d).map(t =>
      `<a class="card" style="border-left:6px solid ${esc(teamColor(t))};color:inherit;text-decoration:none;display:block" href="#team/${esc(t.id)}">
        <div class="row spread"><b style="font-size:16px">${esc(t.name)}</b><span class="pill">${rec(R[t.id])}</span></div>
        <div class="muted small">${isUserTeam(t) ? 'Coach ' + esc(t.coach) : 'CPU'} · OVR ${t.ovr || '–'} · OFF ${t.off || '–'} · DEF ${t.def || '–'}</div></a>`).join('')}</div>`).join('');
  },

  team(id) {
    const t = team(id), s = S(), r = records(s)[t.id];
    if (!r) return '<div class="card empty">Team not found.</div>';
    const games = D.games.filter(g => g.season === s && (g.home === id || g.away === id)).sort((a, b) => a.week - b.week);
    const pr = currentPower().find(x => x.id === id), sim = t.conf === D.league.conference ? simulate(s, D.league.phase === PHASES.REG ? D.league.week : 999)[id] : null;
    return `<p><a href="#teams">← All teams</a></p>
      <div class="card" style="border-left:6px solid ${esc(teamColor(t))}"><h2>${pr ? '#' + pr.rank + ' ' : ''}${esc(t.name)}</h2>
        <div class="muted">${esc(t.conf)}${t.div ? ' ' + esc(t.div) : ''} · ${isUserTeam(t) ? `Coach <a href="#coach/${slug(t.coach)}">${esc(t.coach)}</a>` : 'CPU'}</div>
        <div class="stat" style="margin-top:10px"><div><span>Record</span><b>${rec(r)}</b></div><div><span>Conf</span><b>${r.cw}-${r.cl}</b></div><div><span>PF / PA</span><b>${r.pf} / ${r.pa}</b></div><div><span>Streak</span><b>${streak(r)}</b></div>
          <div><span>OVR / OFF / DEF</span><b>${t.ovr || '–'} / ${t.off || '–'} / ${t.def || '–'}</b></div>${sim ? `<div><span>Likely record</span><b>${sim.likely}</b></div><div><span>Title odds</span><b>${pctStr(sim.titlePct)}</b></div>` : ''}</div></div>
      <div class="card"><h3 style="margin-top:0">${s} Schedule</h3><div class="tablewrap"><table><tr><th>Wk</th><th>Opponent</th><th>Line</th><th class="num">Result</th></tr>
      ${games.map(g => {
        const home = g.home === id, opp = home ? g.away : g.home, done = played(g), l = lineOf(g);
        const my = home ? +g.homeScore : +g.awayScore, th = home ? +g.awayScore : +g.homeScore;
        const myLine = l ? (home ? l.spread : -l.spread) : null;
        return `<tr><td>${g.week}</td><td>${g.neutral ? 'vs' : home ? 'vs' : '@'} ${chip(opp)}</td><td class="muted">${l ? fmtLine(myLine) + ' · ' + fmtOdds(home ? l.mlHome : l.mlAway) : ''}</td><td class="num">${done ? `<span class="${my > th ? 'win' : 'loss'}">${my > th ? 'W' : 'L'} ${g.forfeit ? '(forfeit)' : my + '-' + th}</span>` : '<span class="muted">—</span>'}</td></tr>`;
      }).join('')}</table></div></div>`;
  },

  coach(arg) {
    const C = coachStats(), c = Object.values(C).find(x => slug(x.name) === arg);
    const t = D.teams.find(x => slug(x.coach) === arg);
    if (!c && !t) return '<div class="card empty">Coach not found.</div>';
    const name = c ? c.name : t.coach, u = D.users.find(x => slug(x.name) === arg);
    const b = u ? bankroll(u.id) : null;
    const vs = c ? Object.entries(c.vs).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l)) : [];
    return `<p><a href="#history">← History</a></p><div class="card" ${t ? `style="border-left:6px solid ${esc(teamColor(t))}"` : ''}><h2>Coach ${esc(name)}</h2>
      <div class="muted">${t ? 'Current team: ' + chip(t.id) : ''}</div>
      <div class="stat" style="margin-top:10px"><div><span>Career</span><b>${c ? c.w + '-' + c.l : '0-0'}</b></div><div><span>Win %</span><b>${c && c.w + c.l ? (c.w / (c.w + c.l) * 100).toFixed(1) + '%' : '–'}</b></div>
      <div><span>League titles</span><b>${c ? c.titles : 0}</b></div><div><span>Seasons</span><b>${c ? c.seasons.size : 0}</b></div>${b ? `<div><span>${S()} betting</span><b>${b.w}-${b.l}-${b.p} · ${b.balance.toLocaleString()} cr</b></div>` : ''}</div></div>
      <div class="card"><h3 style="margin-top:0">Head-to-head vs coaches</h3>${vs.length ? `<table><tr><th>Opponent</th><th class="num">W-L</th></tr>${vs.map(([o, r]) => `<tr><td><a href="#coach/${slug(o)}">${esc(o)}</a></td><td class="num">${r.w}-${r.l}</td></tr>`).join('')}</table>` : '<div class="muted">No coach-vs-coach games yet.</div>'}</div>`;
  },

  vote() {
    const L = D.league, s = S(), me = auth.profile, nw = L.week + 1;
    let html = '';
    if (!me) html += `<div class="notice"><a href="#account">Log in</a> with your coach account to vote.</div>`;
    else if (!me.teamId) html += `<div class="notice">Your account isn't linked to a team yet. Ask the commissioner.</div>`;
    const canVote = me && me.teamId;
    // Game of the Week
    const next = D.games.filter(g => g.season === s && g.week === nw);
    const mine = me && D.gotw.find(v => v.season === s && v.week === nw && v.uid === me.id);
    const tally = gotwTally(s, nw);
    html += `<h2>Game of the Week · Week ${nw}</h2>`;
    if (L.phase !== PHASES.REG || !next.length) html += `<div class="card empty">Game of the Week voting opens during the regular season for the following week's games.</div>`;
    else html += `<div class="card"><p class="muted small" style="margin-top:0">Vote during ${esc(weekLabel())} for next week's featured game. The winner shows on the Home page once we advance to Week ${nw}.</p>
      ${next.map(g => `<label class="vote-opt ${mine && mine.gameId === g.id ? 'on' : ''}"><input type="radio" name="gotw" value="${esc(g.id)}" ${mine && mine.gameId === g.id ? 'checked' : ''} ${canVote ? '' : 'disabled'}>
        <span style="flex:1">${chip(g.away)} @ ${chip(g.home)} ${isUserTeam(team(g.home)) && isUserTeam(team(g.away)) ? '<span class="h2h">USER GAME</span>' : ''}</span><span class="muted small">${tally.counts[g.id] || 0} vote${tally.counts[g.id] === 1 ? '' : 's'}</span></label>`).join('')}
      ${canVote ? `<button data-act="gotw" style="margin-top:8px">${mine ? 'Change vote' : 'Submit vote'}</button>` : ''}</div>`;
    // Season awards
    const A = L.awards || {};
    html += `<h2>${s} Season Awards</h2>`;
    if (!A.open) html += `<div class="card empty">Awards voting opens at the end of the regular season and closes after the league championship game.${D.history.find(h => h.season === s) ? ' <a href="#history">See this season\'s winners →</a>' : ''}</div>`;
    else {
      const ballot = D.ballots.find(b => b.season === s && b.uid === me?.id) || { picks: {}, moment: '' };
      html += `<div class="card"><p class="muted small" style="margin-top:0">Pick one of the three finalists in each category. You can change your ballot until voting closes after the league championship game.</p>
        ${(A.categories || []).map(c => `<h3>${esc(c.label)}</h3>${c.options.map((o, i) => `<label class="vote-opt ${ballot.picks[c.key] === i ? 'on' : ''}"><input type="radio" name="aw_${esc(c.key)}" value="${i}" ${ballot.picks[c.key] === i ? 'checked' : ''} ${canVote ? '' : 'disabled'}>
          <span>${esc(o.name)}${o.team ? ' · ' + chip(o.team) : ''}</span></label>`).join('')}`).join('')}
        <h3>Your "Holy Shit" moment of the season</h3><textarea id="hsm" rows="3" maxlength="600" ${canVote ? '' : 'disabled'} placeholder="The play, the comeback, the meltdown…">${esc(ballot.moment || '')}</textarea>
        ${canVote ? `<button data-act="ballot" style="margin-top:10px">${ballot.id ? 'Update ballot' : 'Submit ballot'}</button>` : ''} <span id="bmsg" class="muted"></span></div>`;
    }
    return html;
  },



  history() {
    const H = D.history.slice().sort((a, b) => b.season - a.season), C = Object.values(coachStats()).sort((a, b) => b.titles - a.titles || (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)));
    const champLine = h => h.champCoach ? `${esc(h.champCoach)} over ${esc(h.runnerCoach || 'CPU')} — ${esc(team(h.champTeam).name)} ${h.champScore ?? ''}, ${esc(team(h.runnerTeam).name)} ${h.runnerScore ?? ''}` : esc(h.summary || '');
    return `<h2>League Champions</h2><div class="card">${H.length ? H.map(h => `<div class="champ"><div class="yr">S${seasonNum(h.season)}<div class="muted small" style="font-family:system-ui">${h.season}</div></div><div><b>${champLine(h)}</b>${h.notes ? `<div class="muted small">${esc(h.notes)}</div>` : ''}</div></div>`).join('') : '<div class="muted">No completed seasons yet.</div>'}</div>
      <h2>All-Time Coaches</h2><div class="card"><div class="tablewrap"><table><tr><th>Coach</th><th class="num">Seasons</th><th class="num">W-L</th><th class="num">Win %</th><th class="num">Titles</th></tr>
        ${C.map(c => `<tr><td><a href="#coach/${slug(c.name)}">${esc(c.name)}</a></td><td class="num">${c.seasons.size}</td><td class="num">${c.w}-${c.l}</td><td class="num">${c.w + c.l ? (c.w / (c.w + c.l) * 100).toFixed(1) + '%' : '–'}</td><td class="num">${c.titles ? '🏆'.repeat(Math.min(c.titles, 5)) : '–'}</td></tr>`).join('')}
      </table></div><p class="muted small">Tap a coach for their profile and head-to-head records.</p></div>
      <h2>Season Awards</h2>${H.filter(h => (h.awards || []).length).map(h => `<div class="card"><h3 style="margin-top:0">${h.season}</h3><div class="tablewrap"><table>${h.awards.map(a => `<tr><td>${esc(a.award)}</td><td><b>${esc(a.winner)}</b></td><td>${a.team ? chip(a.team) : ''}</td><td class="num muted small">${a.votes != null ? a.votes + (a.votes === 1 ? ' vote' : ' votes') : ''}</td></tr>`).join('')}</table></div></div>`).join('') || '<div class="card muted">No awards yet.</div>'}
      <h2>"Holy Shit" Moments</h2>${H.filter(h => (h.moments || []).length).map(h => `<div class="card"><h3 style="margin-top:0">${h.season}</h3>${h.moments.map(m => `<div class="story"><p>${esc(m.text)}</p>${m.coach ? `<div class="muted small">— ${esc(m.coach)}</div>` : ''}</div>`).join('')}</div>`).join('') || '<div class="card muted">None yet.</div>'}`;
  },

  rules() {
    const L = D.league;
    return `<h2>League Rules</h2><div class="card"><ul class="clean">${((L.rules && L.rules.length) ? L.rules : DEFAULT_RULES).map(r => `<li>${esc(r)}</li>`).join('') || '<li class="muted">No rules posted.</li>'}</ul></div>
      <h2>How Betting Works</h2><div class="card"><ul class="clean"><li>Every linked coach starts each season with ${START_CREDITS.toLocaleString()} credits. Credits don't carry over.</li>
      <li>Lines are posted for every upcoming game, so you can bet future weeks early. Every bet pays the listed +/− odds. Spread and total payouts move around −110 based on the model's edge on the line, key numbers (3, 7, 10, 14) and each team's recent form.</li>
      <li>Each advance re-rates every team from the results, so lines for all later weeks move. Your bet keeps the line it was placed at.</li>
      <li>A game locks once the commissioner enters its score or locks betting.</li></ul></div>
      ${(L.links || []).length ? `<h2>Links</h2><div class="card"><ul class="clean">${L.links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul></div>` : ''}`;
  },

  account() {
    if (auth.user) {
      const p = auth.profile;
      return `<h2>My Account</h2><div class="card"><p>Signed in as <b>${esc(p?.name || auth.user.email)}</b>${p?.teamId ? ' · ' + chip(p.teamId) : ''}${p?.role === 'commish' ? ' · <span class="tag gold">Commissioner</span>' : ''}</p>
        ${p && !p.teamId ? '<div class="notice">Your account is waiting for the commissioner to link it to your team.</div>' : ''}<button class="ghost" data-act="logout">Log out</button></div>`;
    }
    const m = UI.acct;
    return `<h2>Coach Login</h2><div class="card" style="max-width:440px">${DEMO ? '<div class="notice">Demo mode: any email works. Password <b>coach</b> logs in as a regular coach; anything else logs in as the commissioner.</div>' : ''}
      <div class="seg" style="margin-bottom:8px"><button data-acct="login" class="${m === 'login' ? 'on' : ''}">Log in</button><button data-acct="signup" class="${m === 'signup' ? 'on' : ''}">Create account</button><button data-acct="reset" class="${m === 'reset' ? 'on' : ''}">Forgot password</button></div>
      <form id="acctForm">${m === 'signup' ? '<label>Coach name (how you appear in the league)</label><input name="name" required style="width:100%">' : ''}
        <label>Email</label><input name="email" type="email" required style="width:100%" autocomplete="email">
        ${m !== 'reset' ? `<label>Password</label><input name="pw" type="password" required minlength="6" style="width:100%" autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}">` : ''}
        <div style="margin-top:12px"><button type="submit">${m === 'login' ? 'Log in' : m === 'signup' ? 'Create account' : 'Send reset email'}</button> <span class="muted" id="amsg">${esc(UI.msg)}</span></div></form>
      ${m === 'signup' ? '<p class="muted small">After you sign up, the commissioner links your account to your team. Then you can bet and vote.</p>' : ''}</div>`;
  }
};

/* ---------- betting rows + slip ---------- */
function betRows(g) {
  const l = lineOf(g); if (!l) return '';
  const a = team(g.away), h = team(g.home);
  const b = (market, pick, top, odds) => `<button class="pick${UI.mode === 'parlay' && UI.legs.some(x => x.gameId === g.id && x.market === market && x.pick === pick) ? ' sel' : ''}" data-bet="${esc(g.id)}|${market}|${pick}">${top} <b>${fmtOdds(odds)}</b></button>`;
  return `<div class="tm" style="padding-top:8px">${chip(a.id)}<br>${g.neutral ? 'vs' : '@'} ${chip(h.id)}${isUserTeam(a) && isUserTeam(h) ? ' <span class="h2h">USER GAME</span>' : ''}</div>
    <div style="display:grid;gap:4px">${b('spread', 'away', esc(a.abbr) + ' ' + fmtLine(-l.spread), juiceOf(l, 'spread', 'away'))}${b('spread', 'home', esc(h.abbr) + ' ' + fmtLine(l.spread), juiceOf(l, 'spread', 'home'))}</div>
    <div style="display:grid;gap:4px">${b('ml', 'away', esc(a.abbr), l.mlAway)}${b('ml', 'home', esc(h.abbr), l.mlHome)}</div>
    <div style="display:grid;gap:4px">${b('total', 'over', 'O ' + l.total, juiceOf(l, 'total', 'over'))}${b('total', 'under', 'U ' + l.total, juiceOf(l, 'total', 'under'))}</div>`;
}
function futuresSection() {
  const L = D.league, n = seasonNum();
  const board = futuresBoard();
  let h = `<h2>Season ${n} League Champion</h2>`;
  if (!board.length) return h + `<div class="card empty">Futures are open during the regular season. ${L.phase === PHASES.PRE ? 'They open when the season is published.' : 'Betting has closed for this season; open bets settle when the championship is decided.'}</div>`;
  const open = futuresOpen() && futuresPosted();
  h += `<div class="card"><p class="muted small" style="margin-top:0">Pick who wins the ${esc(L.conference)} Championship Game. Odds update after every advance${board[0].posted ? '' : ' (projected until the commissioner posts this week\'s lines)'}. A bet keeps the odds it was placed at, and it pays out when the title game is final. Closes at the end of the regular season.</p>
    <div class="tablewrap"><table><tr><th>Team</th><th>Coach</th><th class="num">Title chance</th><th class="num">Odds</th></tr>
    ${board.map(r => { const t = team(r.id); return `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td>${chip(r.id)}</td><td>${isUserTeam(t) ? esc(t.coach) : '<span class="muted">CPU</span>'}</td><td class="num">${pctStr(r.p)}</td>
      <td class="num">${r.odds == null ? '<span class="muted small">Off the board</span>' : open ? `<button class="pick${UI.mode === 'parlay' && UI.legs.some(x => x.market === 'future' && x.pick === r.id) ? ' sel' : ''}" data-fut="${esc(r.id)}"><b>${fmtOdds(r.odds)}</b></button>` : `<b>${fmtOdds(r.odds)}</b>`}</td></tr>`; }).join('')}
    </table></div>${open ? '' : futuresOpen() ? '<p class="muted small">Futures odds open once the commissioner posts this week\'s lines.</p>' : '<p class="muted small">Betting is locked right now.</p>'}</div>`;
  return h;
}
function winsSection() {
  const L = D.league, rows = winsBoard();
  let h = `<h2>Season ${seasonNum()} Win Totals</h2>`;
  if (!rows.length) return h + `<div class="card empty">Win totals are open during the regular season.</div>`;
  const open = futuresOpen() && winsPosted();
  const btn = (r, pick) => { const o = r.o; if (!o) return ''; const odds = pick === 'over' ? o.over : o.under;
    return open ? `<button class="pick${UI.mode === 'parlay' && UI.legs.some(x => x.market === 'wins' && x.team === r.id && x.pick === pick) ? ' sel' : ''}" data-wins="${esc(r.id)}|${pick}">${pick === 'over' ? 'O' : 'U'} ${o.line} <b>${fmtOdds(odds)}</b></button>` : `${pick === 'over' ? 'O' : 'U'} ${o.line} <b>${fmtOdds(odds)}</b>`; };
  h += `<div class="card"><p class="muted small" style="margin-top:0">Regular-season wins (user games only), over/under the line. Lines are set from the projected wins on the Odds page and move after every advance; your bet keeps the line you took. Settles as soon as it's decided, or at the end of the regular season.</p>
    <div class="tablewrap"><table><tr><th>Team</th><th class="num">Record</th><th class="num">Proj.</th><th class="num">Over</th><th class="num">Under</th></tr>
    ${rows.map(r => `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td>${chip(r.id)} <span class="muted small">${esc(team(r.id).coach || '')}</span></td><td class="num">${r.w}-${(regRec(r.id)).l}</td><td class="num">${r.proj.toFixed(1)}</td>
      ${r.o ? `<td class="num">${btn(r, 'over')}</td><td class="num">${btn(r, 'under')}</td>` : '<td class="num muted small" colspan="2">Off the board</td>'}</tr>`).join('')}
    </table></div>${open ? '' : futuresOpen() ? '<p class="muted small">Win totals open once the commissioner posts this week\'s lines.</p>' : '<p class="muted small">Betting is locked right now.</p>'}</div>`;
  return h;
}
function regRec(tid) {
  let w = 0, l = 0;
  D.games.filter(g => g.season === D.league.season && (g.type || 'reg') === 'reg' && played(g) && (g.home === tid || g.away === tid)).forEach(g => ((+g.homeScore > +g.awayScore ? g.home : g.away) === tid ? w++ : l++));
  return { w, l };
}
function showWinsSlip(tid, pick) {
  const me = auth.profile;
  if (!me) { location.hash = '#account'; return; }
  if (!me.teamId) return alert('Your account is not linked to a team yet.');
  const leg = legFor('', 'wins', pick, tid); if (!leg) return;
  UI.slip = { wins: true, ...leg };
  const bal = bankroll(me.id).balance;
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Bet Slip</h2><p><b>${esc(wagerLabel(leg))}</b></p><p class="muted small">Season ${seasonNum()} regular-season wins · projected ${winsBoard().find(r => r.id === tid).proj.toFixed(1)}</p>
    <label>Stake (balance ${bal.toLocaleString()})</label><div class="row"><input id="stake" type="number" min="1" max="${bal}" step="1" value="${Math.min(50, bal)}" inputmode="numeric" style="width:120px">
    ${[25, 50, 100, 250].map(v => `<button class="sm ghost" data-stake="${v}">${v}</button>`).join('')}</div>
    <p>To win: <b id="towin"></b></p><div class="row"><button data-act="place">Place wager</button><button class="ghost" data-close="1">Cancel</button><span id="smsg" class="err"></span></div></div></div>`;
  updToWin();
}
function showFutureSlip(tid) {
  const me = auth.profile;
  if (!me) { location.hash = '#account'; return; }
  if (!me.teamId) return alert('Your account is not linked to a team yet.');
  const r = futuresBoard().find(x => x.id === tid); if (!r || r.odds == null) return;
  UI.slip = { future: true, pick: tid, odds: r.odds, line: null, market: 'future' };
  const bal = bankroll(me.id).balance;
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Bet Slip</h2><p><b>${esc(team(tid).name)} to win the Season ${seasonNum()} title</b></p><p class="muted small">Futures · ${fmtOdds(r.odds)} · model title chance ${pctStr(r.p)}</p>
    <label>Stake (balance ${bal.toLocaleString()})</label><div class="row"><input id="stake" type="number" min="1" max="${bal}" step="1" value="${Math.min(50, bal)}" inputmode="numeric" style="width:120px">
    ${[25, 50, 100, 250].map(v => `<button class="sm ghost" data-stake="${v}">${v}</button>`).join('')}</div>
    <p>To win: <b id="towin"></b></p><div class="row"><button data-act="place">Place wager</button><button class="ghost" data-close="1">Cancel</button><span id="smsg" class="err"></span></div></div></div>`;
  updToWin();
}
const legGroup = l => l.market === 'future' ? 'future' : l.market === 'wins' ? 'wins:' + l.team : l.market === 'total' ? 'total' : 'side';
const legWeek = l => l.market === 'future' ? 'Title' : l.market === 'wins' ? 'Wins' : 'Wk ' + (D.games.find(x => x.id === l.gameId)?.week ?? '?');
function legFor(gid, market, pick, tid) {
  if (market === 'wins') { const r = winsBoard().find(x => x.id === tid); return r && r.o ? { gameId: '', market, pick, team: tid, line: r.o.line, odds: pick === 'over' ? r.o.over : r.o.under } : null; }
  if (market === 'future') { const r = futuresBoard().find(x => x.id === pick); return r && r.odds != null ? { gameId: '', market, pick, line: null, odds: r.odds } : null; }
  const g = D.games.find(x => x.id === gid), l = g && lineOf(g); if (!l) return null;
  return { gameId: gid, market, pick, line: market === 'spread' ? l.spread : market === 'total' ? l.total : null, odds: market === 'ml' ? (pick === 'home' ? l.mlHome : l.mlAway) : juiceOf(l, market, pick) };
}
// One spread-or-moneyline pick and one total per game; one League Champion pick per parlay.
function toggleLeg(gid, market, pick, tid) {
  const grp = legGroup({ market, team: tid });
  const i = UI.legs.findIndex(x => legGroup(x) === grp && (grp === 'future' || grp.startsWith('wins:') || x.gameId === gid));
  if (i >= 0 && UI.legs[i].market === market && UI.legs[i].pick === pick) UI.legs.splice(i, 1);
  else {
    const leg = legFor(gid, market, pick, tid); if (!leg) return;
    if (i >= 0) UI.legs[i] = leg;
    else if (UI.legs.length >= MAX_LEGS) return alert(`Parlays max out at ${MAX_LEGS} legs.`);
    else UI.legs.push(leg);
  }
  route();
}
function parlayBar() {
  let el = document.getElementById('parlayBar');
  const page = (location.hash.slice(1) || 'home').split('/')[0];
  if (UI.mode !== 'parlay' || page !== 'betting' || !UI.legs.length) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'parlayBar'; el.className = 'parlaybar'; document.body.appendChild(el); }
  const n = UI.legs.length;
  el.innerHTML = `<div><b>PARLAY · ${n} leg${n === 1 ? '' : 's'}</b> <span class="gold">${n >= 2 ? fmtOdds(parlayOdds(UI.legs)) : 'add 1 more'}</span></div>
    <div class="row"><button class="sm ghost" data-act="clearLegs">Clear</button><button class="sm gold" data-act="reviewParlay" ${n < 2 ? 'disabled' : ''}>Review</button></div>`;
}
function showParlaySlip() {
  const me = auth.profile;
  if (!me) { location.hash = '#account'; return; }
  if (!me.teamId) return alert('Your account is not linked to a team yet.');
  UI.legs = UI.legs.map(l => legFor(l.gameId, l.market, l.pick, l.team)).filter(Boolean);
  const odds = parlayOdds(UI.legs), bal = bankroll(me.id).balance;
  UI.slip = { parlay: true, odds };
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Parlay Slip</h2><p><b>${UI.legs.length}-leg parlay ${fmtOdds(odds)}</b></p>
    <div class="small" style="margin-bottom:8px">${UI.legs.map(l => `• ${legWeek(l)}: ${esc(wagerLabel(l))}`).join('<br>')}</div>
    <label>Stake (balance ${bal.toLocaleString()})</label><div class="row"><input id="stake" type="number" min="1" max="${bal}" step="1" value="${Math.min(25, bal)}" inputmode="numeric" style="width:120px">
    ${[10, 25, 50, 100].map(v => `<button class="sm ghost" data-stake="${v}">${v}</button>`).join('')}</div>
    <p>To win: <b id="towin"></b></p><div class="row"><button data-act="place">Place parlay</button><button class="ghost" data-close="1">Cancel</button><span id="smsg" class="err"></span></div></div></div>`;
  updToWin();
}
function showSlip(gid, market, pick) {
  const me = auth.profile;
  if (!me) { location.hash = '#account'; return; }
  if (!me.teamId) return alert('Your account is not linked to a team yet.');
  const g = D.games.find(x => x.id === gid), l = lineOf(g);
  const odds = market === 'ml' ? (pick === 'home' ? l.mlHome : l.mlAway) : juiceOf(l, market, pick);
  const line = market === 'spread' ? l.spread : market === 'total' ? l.total : null;
  UI.slip = { g, market, pick, odds, line };
  const bal = bankroll(me.id).balance;
  const label = wagerLabel({ gameId: gid, market, pick, odds, line });
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Bet Slip</h2><p><b>${esc(label)}</b></p><p class="muted small">${esc(team(g.away).name)} @ ${esc(team(g.home).name)} · Week ${g.week}</p>
    <label>Stake (balance ${bal.toLocaleString()})</label><div class="row"><input id="stake" type="number" min="1" max="${bal}" step="1" value="${Math.min(100, bal)}" inputmode="numeric" style="width:120px">
    ${[25, 50, 100, 250].map(v => `<button class="sm ghost" data-stake="${v}">${v}</button>`).join('')}</div>
    <p>To win: <b id="towin"></b></p><div class="row"><button data-act="place">Place wager</button><button class="ghost" data-close="1">Cancel</button><span id="smsg" class="err"></span></div></div></div>`;
  updToWin();
}
function updToWin() { const s = Math.floor(+$('#stake').value || 0), o = UI.slip.odds;
  if (UI.slip.parlay) { const p = parlayProfit(s, UI.legs); $('#towin').textContent = s > 0 ? p + ' (returns ' + (s + p) + ')' : '–'; return; } $('#towin').textContent = s > 0 ? Math.round(o > 0 ? s * o / 100 : s * 100 / -o) + ' (returns ' + (s + Math.round(o > 0 ? s * o / 100 : s * 100 / -o)) + ')' : '–'; }
async function placeBet() {
  const { g, market, pick, odds, line } = UI.slip, me = auth.profile, stake = Math.floor(+$('#stake').value || 0), L = D.league;
  const bal = bankroll(me.id).balance;
  if (stake < 1) return $('#smsg').textContent = 'Enter a stake.';
  if (stake > bal) return $('#smsg').textContent = 'Not enough credits.';
  if (UI.slip.parlay) {
    if (!L.bettingOpen) return $('#smsg').textContent = 'Betting is locked.';
    const bad = UI.legs.find(l => { if (l.market === 'future') return !(futuresOpen() && futuresPosted());
      if (l.market === 'wins') return !(futuresOpen() && winsPosted()); const g = D.games.find(x => x.id === l.gameId); return !g || played(g) || g.week < L.week || g.season !== L.season; });
    if (bad || UI.legs.length < 2) return $('#smsg').textContent = 'One of these games is locked. Remove it and try again.';
    try {
      const legs = UI.legs.map(l => ({ gameId: l.gameId, market: l.market, pick: l.pick, line: l.line, odds: l.odds, ...(l.team ? { team: l.team } : {}) }));
      await put('wagers', newId(), { uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: '', market: 'parlay', pick: '', line: null, odds: parlayOdds(legs), legs, stake, status: 'open', payout: 0, ts: Date.now() }, false);
      UI.legs = []; $('#modal').innerHTML = ''; await reload();
    } catch (e) { $('#smsg').textContent = 'Could not place parlay. ' + friendlyError(e); }
    return;
  }
  if (UI.slip.wins) {
    if (!(futuresOpen() && winsPosted())) return $('#smsg').textContent = 'Win totals are locked.';
    try {
      await put('wagers', newId(), { uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: '', market: 'wins', team: UI.slip.team, pick, line: UI.slip.line, odds, stake, status: 'open', payout: 0, ts: Date.now() }, false);
      $('#modal').innerHTML = ''; await reload();
    } catch (e) { $('#smsg').textContent = 'Could not place wager. ' + friendlyError(e); }
    return;
  }
  if (UI.slip.future) {
    if (!futuresOpen()) return $('#smsg').textContent = 'Futures are locked.';
    try {
      await put('wagers', newId(), { uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: '', market: 'future', pick, line: null, odds, stake, status: 'open', payout: 0, ts: Date.now() }, false);
      $('#modal').innerHTML = ''; await reload();
    } catch (e) { $('#smsg').textContent = 'Could not place wager. ' + friendlyError(e); }
    return;
  }
  if (!L.bettingOpen || played(g) || g.week < L.week || g.season !== L.season) return $('#smsg').textContent = 'This game is locked.';
  try {
    await put('wagers', newId(), { uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: g.id, market, pick, line, odds, stake, status: 'open', payout: 0, ts: Date.now() }, false);
    $('#modal').innerHTML = ''; await reload();
  } catch (e) { $('#smsg').textContent = 'Could not place wager. ' + friendlyError(e); }
}

/* ---------- chart ---------- */
function trendChart(hist) {
  if (!hist.length) return '<div class="empty">The chart starts once the season schedule is published.</div>';
  const teams = userTeams(); if (!teams.length) return '<div class="empty">No coaches assigned yet.</div>';
  const k = UI.metric, isW = k === 'expW';
  const W = 760, H = 320, P = { l: 44, r: 64, t: 14, b: 30 };
  const maxY = isW ? Math.max(1, ...teams.map(t => hist[0].sim[t.id]?.gp || 0)) : 1;
  const x = i => P.l + (hist.length === 1 ? (W - P.l - P.r) / 2 : i * (W - P.l - P.r) / (hist.length - 1));
  const y = v => P.t + (1 - v / maxY) * (H - P.t - P.b);
  const fmt = v => isW ? v.toFixed(1) : Math.round(v * 100) + '%';
  const ticks = isW ? [...Array(maxY + 1).keys()].filter(v => v % Math.ceil(maxY / 6) === 0) : [0, .25, .5, .75, 1];
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly odds by coach">`;
  ticks.forEach(v => svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#33242a"/><text x="${P.l - 6}" y="${y(v) + 4}" fill="#a69a9c" font-size="11" text-anchor="end">${isW ? v : Math.round(v * 100) + '%'}</text>`);
  const step = Math.ceil(hist.length / 12);
  hist.forEach((p, i) => { if (i % step === 0 || i === hist.length - 1) svg += `<text x="${x(i)}" y="${H - 8}" fill="#a69a9c" font-size="11" text-anchor="middle">${p.label}</text>`; });
  const ends = [];
  teams.forEach(t => {
    const c = teamColor(t), pts = hist.map((p, i) => [x(i), y(p.sim[t.id] ? p.sim[t.id][k] : 0), p]);
    svg += `<polyline fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
    pts.forEach(([px, py, p]) => svg += `<circle cx="${px}" cy="${py}" r="3.5" fill="${c}" stroke="#09090a" stroke-width="1"><title>${esc(t.coach)} · ${esc(t.name)} · ${p.label}: ${fmt(p.sim[t.id][k])}</title></circle>`);
    ends.push({ y: pts[pts.length - 1][1], t, c });
  });
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  for (let i = ends.length - 1; i >= 0; i--) { const lim = i === ends.length - 1 ? H - P.b : ends[i + 1].y - 12; if (ends[i].y > lim) ends[i].y = lim; }
  ends.forEach(e => svg += `<text x="${W - P.r + 6}" y="${e.y + 4}" fill="${e.c}" font-size="11" font-weight="700">${esc(e.t.abbr || e.t.name)}</text>`);
  svg += '</svg>';
  return svg + `<div class="legend">${teams.map(t => `<span><i class="sw" style="background:${esc(teamColor(t))}"></i>${esc(t.coach)} (${esc(t.abbr || t.name)})</span>`).join('')}</div>`;
}

/* ---------- YouTube live pop-up ---------- */
const YT_CHANNEL = 'https://youtube.com/@originalentertainingcrackers';
let autoLive = { live: false };
async function checkLive() {
  try { const r = await fetch('live.json?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) autoLive = await r.json(); } catch (e) { /* ignore */ }
  showLive();
}
function liveInfo() {
  const m = D.league.live;
  if (m && m.on) return { key: 'm:' + (m.url || '') + (m.since || ''), url: m.url || YT_CHANNEL + '/live', title: m.title || 'OEC is live on YouTube' };
  if (autoLive.live) return { key: 'a:' + autoLive.videoId, url: autoLive.url || YT_CHANNEL + '/live', title: autoLive.title || 'OEC is live on YouTube' };
  return null;
}
function showLive() {
  let el = document.getElementById('livePop');
  const info = liveInfo();
  let dismissed = ''; try { dismissed = sessionStorage.getItem('oecLiveDismissed') || ''; } catch (e) { /* ignore */ }
  if (!info || dismissed === info.key) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'livePop'; el.className = 'livepop'; document.body.appendChild(el); }
  el.innerHTML = `<button class="lp-x" data-livex="${esc(info.key)}" aria-label="Close">✕</button>
    <div class="lp-badge"><i></i>LIVE NOW</div><div class="lp-title">${esc(info.title)}</div>
    <a class="btn lp-go" href="${esc(info.url)}" target="_blank" rel="noopener">▶ Watch on YouTube</a>`;
}
setInterval(async () => { await refreshLive(); checkLive(); }, 60000);

/* ---------- shell ---------- */
function header() {
  const L = D.league;
  $('#bSeason').textContent = seasonNum();
  $('#bSeasonLbl').textContent = 'Season · ' + L.season;
  const wl = weekLabel();
  $('#bWeek').textContent = L.phase === PHASES.REG ? L.week : wl;
  $('#bWeekLbl').textContent = L.phase === PHASES.REG ? 'Current Week' : 'Phase';
  $('#sub').textContent = `College Football 27 Online Dynasty · ${L.conference} · ${L.phase}${DEMO ? ' · DEMO DATA' : ''}`;
  const p = auth.profile;
  $('#acct').innerHTML = auth.user
    ? `<span>${esc(p?.name || auth.user.email)}${p?.teamId ? ` · ${esc(team(p.teamId).name)} · <b>${bankroll(p.id).balance.toLocaleString()} cr</b>` : ''}</span>${isCommish() ? '<a class="btn gold" style="padding:5px 10px;border-radius:8px" href="admin.html">Commissioner</a>' : ''}<a class="btn ghost" style="padding:5px 10px;border-radius:8px" href="#account">Account</a>`
    : '<a class="btn" style="padding:6px 14px;border-radius:8px" href="#account">Coach Login</a>';
  $('#footAdmin').innerHTML = isCommish() ? ' · <a href="admin.html">Commissioner Tools</a>' : '';
}
function route() {
  const [page, arg] = (location.hash.slice(1) || 'home').split('/');
  const active = page === 'team' ? 'teams' : page === 'coach' ? 'history' : page;
  $('#nav').innerHTML = NAV.map(([k, label]) => `<a href="#${k}" class="${k === active ? 'on' : ''}">${label}</a>`).join('');
  header();
  try { $('#view').innerHTML = (PAGES[page] || PAGES.home)(decodeURIComponent(arg || '')); parlayBar(); }
  catch (e) { console.error(e); $('#view').innerHTML = `<div class="card err">Something went wrong rendering this page: ${esc(e.message)}</div>`; }
}
async function reload() { await loadAll(); refreshProfile(); if (D.league.awards?.open && auth.user) await loadBallots(false); route(); }

document.addEventListener('click', async e => {
  const lx = e.target.closest('[data-livex]');
  if (lx) { try { sessionStorage.setItem('oecLiveDismissed', lx.dataset.livex); } catch (err) { /* ignore */ } showLive(); return; }
  const t = e.target.closest('[data-sort],[data-metric],[data-pr],[data-prsort],[data-bet],[data-fut],[data-wins],[data-mode],[data-act],[data-close],[data-stake],[data-acct],[data-cancel]');
  if (!t) return;
  const page = (location.hash.slice(1) || 'home').split('/')[0];
  if (t.dataset.sort) {
    const st = page === 'rankings' ? UI.prSort : page === 'odds' ? UI.oddsSort : UI.stSort;
    if (st.key === t.dataset.sort) st.dir *= -1; else { st.key = t.dataset.sort; st.dir = ['place', 'rank', 'name', 'coach'].includes(st.key) ? 1 : -1; }
    route();
  } else if (t.dataset.metric) { UI.metric = t.dataset.metric; route(); }
  else if (t.dataset.pr) { UI.prUsers = t.dataset.pr === 'users'; route(); }
  else if (t.dataset.prsort) { UI.prSort = { key: t.dataset.prsort, dir: t.dataset.prsort === 'rank' ? 1 : -1 }; route(); }
  else if (t.dataset.acct) { UI.acct = t.dataset.acct; UI.msg = ''; route(); }
  else if (t.dataset.fut) { if (UI.mode === 'parlay') toggleLeg('', 'future', t.dataset.fut); else showFutureSlip(t.dataset.fut); }
  else if (t.dataset.bet) { const [g, m, p] = t.dataset.bet.split('|'); if (UI.mode === 'parlay') toggleLeg(g, m, p); else showSlip(g, m, p); }
  else if (t.dataset.wins) { const [tid, pk] = t.dataset.wins.split('|'); if (UI.mode === 'parlay') toggleLeg('', 'wins', pk, tid); else showWinsSlip(tid, pk); }
  else if (t.dataset.mode) { UI.mode = t.dataset.mode; route(); }
  else if (t.dataset.stake) { $('#stake').value = t.dataset.stake; updToWin(); }
  else if (t.dataset.close && e.target === t) $('#modal').innerHTML = '';
  else if (t.dataset.cancel) { if (confirm('Cancel this wager and refund the stake?')) { try { await del('wagers', t.dataset.cancel); await reload(); } catch (err) { alert(err.message); } } }
  else if (t.dataset.act === 'place') placeBet();
  else if (t.dataset.act === 'clearLegs') { UI.legs = []; route(); }
  else if (t.dataset.act === 'reviewParlay') showParlaySlip();
  else if (t.dataset.act === 'logout') logout();
  else if (t.dataset.act === 'gotw') {
    const v = $('input[name=gotw]:checked'); if (!v) return alert('Pick a game first.');
    const s = S(), w = D.league.week + 1, uid = auth.profile.id;
    try { await put('gotw', `${s}_${w}_${uid}`, { season: s, week: w, uid, gameId: v.value }, false); await reload(); } catch (err) { alert('Vote failed: ' + err.message); }
  } else if (t.dataset.act === 'ballot') {
    const picks = {}, cats = D.league.awards.categories || [];
    for (const c of cats) { const v = $(`input[name="aw_${c.key}"]:checked`); if (!v) return alert('Pick a finalist for ' + c.label + '.'); picks[c.key] = +v.value; }
    const s = S(), uid = auth.profile.id;
    try { await put('ballots', `${s}_${uid}`, { season: s, uid, coach: auth.profile.name, picks, moment: $('#hsm').value.trim(), ts: Date.now() }, false); await reload(); $('#bmsg').textContent = 'Ballot saved ✓'; }
    catch (err) { alert('Could not save ballot: ' + err.message); }
  }
});
document.addEventListener('input', e => { if (e.target.id === 'stake') updToWin(); });
document.addEventListener('change', e => {
  if (e.target.dataset.betweek) { UI.betWeek = +e.target.value; route(); }
  if (e.target.dataset.nav) location.hash = '#' + e.target.dataset.nav + '/' + e.target.value;
  if (e.target.type === 'radio') { const grp = $$(`input[name="${e.target.name}"]`); grp.forEach(r => r.closest('.vote-opt')?.classList.toggle('on', r.checked)); }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'acctForm') return;
  e.preventDefault();
  const f = new FormData(e.target), m = UI.acct, msg = $('#amsg');
  msg.textContent = 'Working…';
  try {
    if (m === 'login') await login(f.get('email'), f.get('pw'));
    else if (m === 'signup') await signup(f.get('name'), f.get('email'), f.get('pw'));
    else { await resetPassword(f.get('email')); UI.msg = 'Reset email sent.'; }
    if (m !== 'reset') location.hash = '#home'; else route();
  } catch (err) { msg.textContent = (err.code || err.message || 'Error').replace('auth/', '').replace(/-/g, ' '); }
});

(async function init() {
  try {
    await loadAll();
    window.addEventListener('hashchange', route);
    route();
    checkLive();
    await watchAuth(async () => { if (D.league.awards?.open && auth.user) await loadBallots(false); try { await ensureFutures(); } catch (e) { console.warn('futures post failed', e); } route(); });
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="card"><b>Couldn't load league data.</b><p class="muted">${esc(e.message)}. If you opened index.html straight from your computer, publish it with GitHub Pages (or run a local server).</p></div>`;
  }
})();
