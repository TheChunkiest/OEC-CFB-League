import {
  $, $$, esc, D, DEMO, PHASES, START_CREDITS, loadAll, put, del, batch, newId, loadBallots, auth, isCommish, myTeam, watchAuth, login, signup, logout,
  resetPassword, refreshProfile, team, teamColor, isUserTeam, leagueTeams, userTeams, played, seasonGames, coachOf, slug, fmtOdds, fmtLine,
  pctStr, weekLabel, chip, lineOf, records, streak, rec, orderGroup, divisions, simulate, oddsHistory, currentPower, bankroll, wagerLabel,
  gotwTally, coachStats, cashOutValue, CASHOUT_SHARE, coachSeasons, coachStops, awardGame, seasonPlaces, ordinal, kickoffOf, kickoffInvite, canSchedule, pendingInvites, invitesFor, fmtKick, KICK_SLOTS, projectedAdvance, fmtAdvance, storylines, seasonNum, futuresBoard, futuresOpen, futuresPosted, ensureFutures, friendlyError, refreshLive, juiceOf, nowUpto, gotwGameId, boostFor, winProfit, GOTW_BOOST, MAX_LEGS, parlayOdds, parlayProfit, winsBoard, winsPosted, legsHtml, fmtTime, profit, refreshWagers, selKey, rankName, rankOf, ratings, powerRankings, lastPlayedWeek, clinchScenarios, winHistory
} from './core.js?v=44';

const DEFAULT_RULES = ["Cloud dynasty with active rosters and cross-play", "All-American difficulty with custom sliders", "10-minute quarters with 17-second accelerated clock", "League advances every 3 days; 24 hours can be added for user games if needed", "League commissioner is Chunky and league admin is Clay", "All communication happens in the league Discord"];
const NAV = [['home', 'Home'], ['standings', 'Standings'], ['schedule', 'Schedule'], ['betting', 'Betting'], ['odds', 'Odds'],
  ['rankings', 'Power Rankings'], ['teams', 'Teams'], ['vote', 'Vote'], ['history', 'History'], ['rules', 'Rules']];
const UI = { stSort: { key: 'place', dir: 1 }, prSort: { key: 'rank', dir: 1 }, prUsers: false, oddsSort: { key: 'titlePct', dir: -1 }, lbSort: { key: 'balance', dir: -1 }, wkSort: { key: 'ts', dir: -1 }, metric: 'titlePct', acct: 'login', slip: null, msg: '', betWeek: null, mode: 'single', legs: [] };

/* ---------- small renderers ---------- */
const S = () => D.league.season;
const lineText = (g, l = lineOf(g)) => {
  if (!l) return '';
  const fav = l.spread <= 0 ? g.home : g.away;
  const fj = juiceOf(l, 'spread', fav === g.home ? 'home' : 'away');
  return `${l.spread === 0 ? 'PK' : esc(team(fav).abbr || team(fav).name) + ' ' + fmtLine(-Math.abs(l.spread))}${fj !== -110 ? ` (${fmtOdds(fj)})` : ''} · O/U ${l.total} · ${esc(team(g.away).abbr)} ${fmtOdds(l.mlAway)} / ${esc(team(g.home).abbr)} ${fmtOdds(l.mlHome)}`;
};
// Badges for a matchup: CPU GAME (a coach vs a CPU team) and the division when both teams share one.
function gameTags(g) {
  const h = team(g.home), a = team(g.away), out = [];
  const cpu = side => { const c = coachOf(g, side); return !c || String(c).toUpperCase() === 'CPU'; };
  if (cpu('home') || cpu('away')) out.push('<span class="h2h cputag">CPU GAME</span>');
  const conf = D.league.conference;
  if ((g.type || 'reg') === 'reg' && h.div && h.div === a.div && h.conf === conf && a.conf === conf) out.push(`<span class="h2h divtag" title="Both teams are in the ${esc(h.div)} division">${esc(h.div.toUpperCase())}</span>`);
  return out.join('');
}
function gameCard(g, opts = {}) {
  const h = team(g.home), a = team(g.away), done = played(g);
  const hw = done && +g.homeScore > +g.awayScore, aw = done && !hw;
  const tags = [];
  const gt = gameTags(g); if (gt) tags.push(gt);
  if (g.type === 'ccg') tags.push('<span class="tag gold">League Championship</span>');
  if (g.type === 'bowl') tags.push('<span class="tag">Postseason</span>');
  const l = lineOf(g);
  let odds = '';
  if (done && g.forfeit) odds = 'Forfeit win';
  else if (l && !done) odds = (g.lines ? '' : 'Proj. ') + lineText(g, l);
  else if (l && done) {
    const m = +g.homeScore - +g.awayScore + l.spread, fav = l.spread <= 0 ? g.home : g.away, tot = +g.homeScore + +g.awayScore;
    const cov = m === 0 ? 'Push' : (m > 0 ? team(g.home).abbr : team(g.away).abbr) + ' covered';
    odds = `${l.spread === 0 ? 'PK' : esc(team(fav).abbr) + ' ' + fmtLine(-Math.abs(l.spread))} · ${esc(cov)} · ${tot > l.total ? 'Over' : tot < l.total ? 'Under' : 'Push'} ${l.total}`;
  }
  const sc = (side, won) => done ? `<b class="msc ${won ? 'w' : 'l'}">${g.forfeit ? (won ? 'FW' : 'FL') : g[side + 'Score']}</b>` : '';
  const status = `<b class="gstat">${done ? 'Final' : 'Week ' + g.week}</b>`;
  const who = [a, h].filter(isUserTeam).length ? ` · ${isUserTeam(a) ? esc(a.coach) : 'CPU'} ${g.neutral ? 'vs' : '@'} ${isUserTeam(h) ? esc(h.coach) : 'CPU'}` : '';
  return `<div class="card game clickable${opts.gotw ? ' gotw' : ''}" data-game="${esc(g.id)}">${opts.gotw ? '<span class="ribbon">★ Game of the Week</span>' : ''}<span class="go" aria-hidden="true">›</span><div class="teams">
      <div class="matchup"><span class="mt ${done ? (aw ? 'w' : 'l') : ''}">${chip(a.id, { season: g.season, week: g.week, href: '#game/' + g.id })}${sc('away', aw)}</span><span class="at">${g.neutral ? 'vs' : '@'}</span><span class="mt ${done ? (hw ? 'w' : 'l') : ''}">${chip(h.id, { season: g.season, week: g.week, href: '#game/' + g.id })}${sc('home', hw)}</span>${tags.join('')}</div>
      <div class="meta">${status}${who}${!done && kickoffOf(g) ? ` · <span class="kick">🕗 ${esc(fmtKick(kickoffOf(g), true))}</span>` : ''}</div>
      ${!done && odds ? `<div class="meta">${odds}</div>` : ''}${done || g.forfeit ? '' : probBar(g, l, done)}${opts.extra || ''}</div></div>`;
}
const sortTh = (st, key, label, cls = '', tbl = '') => `<th data-sort="${key}"${tbl ? ` data-st="${tbl}"` : ''} class="${cls}${st.key === key ? ' sorted' : ''}">${label}${st.key === key ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
function sortRows(rows, st, getters) {
  const f = getters[st.key] || (r => r[st.key]);
  return rows.slice().sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.dir; });
}
// Model win chance for each side (no vig), rounded so the pair adds to 100.
const winPct = (g, l = lineOf(g)) => { if (!l || l.pHome == null) return null; const h = Math.max(1, Math.min(99, Math.round(l.pHome * 100))); return { h, a: 100 - h }; };
const winLine = (g, l, pre, cls = '') => { const p = winPct(g, l); if (!p) return ''; return `<div class="meta winp ${cls}">${pre ? 'Pre-game win chance' : 'Win chance'}: ${esc(team(g.away).abbr || team(g.away).name)} <b>${p.a}%</b> · ${esc(team(g.home).abbr || team(g.home).name)} <b>${p.h}%</b></div>`; };
// Thin two-color win-chance bar (ESPN-style matchup predictor).
function probBar(g, l, pre, cls = '') {
  const p = winPct(g, l); if (!p) return '';
  const A = team(g.away), H = team(g.home);
  return `<div class="pbar ${pre ? 'pre' : ''} ${cls}" title="${pre ? 'Pre-game win chance' : 'Win chance'}"><span>${esc(A.abbr || A.name)} <b>${p.a}%</b></span>
    <div class="pb"><i style="width:${p.a}%;background:${esc(teamColor(A))}"></i><i style="width:${p.h}%;background:${esc(teamColor(H))}"></i></div><span><b>${p.h}%</b> ${esc(H.abbr || H.name)}</span>${pre ? '<em>pre-game</em>' : ''}</div>`;
}
/* ---- Clinching scenarios ---- */
const abT = id => esc(team(id).abbr || team(id).name);
const litText = x => { const w = x.homeWon ? x.g.home : x.g.away, lo = x.homeWon ? x.g.away : x.g.home; return `<b>${abT(w)}</b> beats ${abT(lo)}`; };
const scenText = list => list.slice(0, 4).map(sc => sc.map(litText).join(' + ')).join(' <span class="muted">or</span> ') + (list.length > 4 ? ` <span class="muted">(+${list.length - 4} more)</span>` : '');
const berthOf = r => r.k === 1 && r.div ? `the ${esc(r.div)}` : 'a title game spot';
function raceHtml(r, order) {
  if (!r || r.skip === 'done') return '';
  if (r.skip) return `<div class="race"><h4>Clinching scenarios</h4><p class="muted small">These show up once the race gets down to the last few weeks.</p></div>`;
  const byId = Object.fromEntries(r.teams.map(t => [t.id, t])), rows = order.map(id => byId[id]).filter(Boolean);
  const live = rows.filter(t => t.status !== 'eliminated'), out = rows.filter(t => t.status === 'eliminated');
  const wk = r.now.length ? `Week ${Math.max(...r.now.map(g => g.week))}` : 'this week';
  const line = t => {
    if (t.status === 'clinched') return `<li><div class="rh">${chip(t.id)}<span class="rs ok">✓ Clinched</span></div></li>`;
    const tag = t.destiny ? '<span class="rs gold">Controls own destiny</span>' : '<span class="rs">Needs help</span>';
    const parts = [];
    if (t.clinch.length) parts.push(`<div><span class="rl">Clinches in ${wk} if</span> ${scenText(t.clinch)}</div>`);
    if (t.elim.length) parts.push(`<div><span class="rl bad">Eliminated in ${wk} if</span> ${scenText(t.elim)}</div>`);
    return `<li><div class="rh">${chip(t.id)}${tag}</div>${parts.join('')}</li>`;
  };
  return `<div class="race"><h4>Clinching scenarios · ${wk}</h4><p class="muted small">The race for ${berthOf(r)}. Ties that reach point differential can't be predicted, so those count as still open.</p>
    <ul class="racelist">${live.map(line).join('')}</ul>${(() => { const q = live.filter(t => t.status === 'alive' && !t.clinch.length && !t.elim.length); return q.length ? `<p class="small muted" style="margin:0 0 4px">${q.length === live.length ? 'Nobody' : q.map(t => abT(t.id)).join(', ')} can't clinch or be eliminated in ${wk}.</p>` : ''; })()}${out.length ? `<p class="small muted" style="margin-bottom:0">Eliminated: ${out.map(t => abT(t.id)).join(', ')}</p>` : ''}</div>`;
}
// One sentence for a game preview: does this result clinch or eliminate anyone?
function clinchNote(g) {
  if ((g.type || 'reg') !== 'reg' || played(g)) return '';
  const notes = [];
  clinchScenarios(g.season).forEach(r => {
    if (!r.teams || !r.now.some(x => x.id === g.id)) return;
    [g.away, g.home].forEach(id => {
      const t = r.teams.find(x => x.id === id); if (!t || t.status !== 'alive') return;
      const nm = esc(team(id).name), win = x => x.g.id === g.id && x.homeWon === (g.home === id);
      const loss = x => x.g.id === g.id && x.homeWon !== (g.home === id);
      const c1 = t.clinch.find(sc => sc.length === 1 && win(sc[0])), cW = t.clinch.find(sc => sc.some(win));
      const e1 = t.elim.find(sc => sc.length === 1 && loss(sc[0])), eL = t.elim.find(sc => sc.some(loss));
      const others = sc => sc.filter(x => x.g.id !== g.id).map(x => { const w = x.homeWon ? x.g.home : x.g.away, lo = x.homeWon ? x.g.away : x.g.home; return `${esc(team(w).name)} beating ${esc(team(lo).name)}`; }).join(' and ');
      let t1 = c1 ? `A win clinches ${berthOf(r)} for ${nm}` : cW ? `${nm} clinches ${berthOf(r)} with a win plus ${others(cW)}` : '';
      const t2 = e1 ? 'a loss eliminates them' : eL ? `a loss plus ${others(eL)} eliminates them` : '';
      if (t1 && t2) t1 += `, while ${t2}`; else if (!t1 && t2) t1 = `For ${nm}, ${t2}`;
      if (t1) notes.push(t1 + '.');
      else if (t.destiny) notes.push(`${nm} controls its own destiny: win out and it takes ${berthOf(r)}.`);
    });
  });
  return notes.join(' ');
}
const subSm = txt => txt ? `<div class="show-sm muted small">${txt}</div>` : '';
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
    html += `<div class="grid2"><div><h2>This Week's Storylines</h2><div class="card">${stories.length ? stories.map(st => `<${st.href ? `a href="${esc(st.href)}"` : 'div'} class="story${st.href ? ' link' : ''}"><span class="tag">${esc(st.tag)}</span><h3>${esc(st.title)}</h3><p>${esc(st.body)}</p>${st.href ? '<span class="go" aria-hidden="true">›</span>' : ''}</${st.href ? 'a' : 'div'}>`).join('') : '<div class="empty">Storylines appear once games are played.</div>'}</div></div>
      <div><h2>${esc(weekLabel())} Matchups</h2>${games.length ? games.filter(g => g.id !== gt.game?.id).map(g => gameCard(g)).join('') || '<div class="card empty">Only the Game of the Week is on the slate.</div>' : '<div class="card empty">No games scheduled this week.</div>'}</div></div>
      <div class="grid"><div class="card"><h2>Power Rankings</h2><table>${pr.map(x => `<tr><td class="rank">${x.rank}</td><td>${chip(x.id)}</td><td class="num">${rec(x.rec)}</td><td class="num">${mvHtml(x.move)}</td></tr>`).join('')}</table><p><a href="#rankings">Full rankings →</a></p></div>
      <div class="card"><h2>Betting Leaders</h2>${leaders.length ? `<table>${leaders.map((x, i) => `<tr><td class="rank">${i + 1}</td><td>${esc(x.u.name)}</td><td class="num">${x.b.w}-${x.b.l}${x.b.p ? '-' + x.b.p : ''}</td><td class="num"><b>${x.b.balance.toLocaleString()}</b></td></tr>`).join('')}</table>` : '<div class="muted">No coaches linked yet.</div>'}<p><a href="#betting">Place wagers →</a></p></div></div>`;
    return html;
  },

  standings() {
    const s = S(), R = records(s), st = UI.stSort, race = clinchScenarios(s);
    return `<h2>${s} ${esc(D.league.conference)} Standings</h2><p class="muted small">Tap a column header to sort. "Place" is the official order (conference record, head-to-head, overall, point differential).</p>` + divisions().map(d => {
      const ids = leagueTeams().filter(t => !d || t.div === d).map(t => t.id);
      const ordered = orderGroup(ids, s).map((id, i) => ({ id, place: i + 1, ...R[id], name: team(id).name, coach: team(id).coach || 'CPU', cpct: R[id].cw + R[id].cl ? R[id].cw / (R[id].cw + R[id].cl) : 0, opct: R[id].w + R[id].l ? R[id].w / (R[id].w + R[id].l) : 0, diff: R[id].pf - R[id].pa, stk: streak(R[id]) }));
      const rows = sortRows(ordered, st, { stk: r => (r.stk[0] === 'W' ? 1 : -1) * (+r.stk.slice(1) || 0) });
      return `<div class="card"><h3 style="margin-top:0">${esc(d ? D.league.conference + ' ' + d : D.league.conference)}</h3><div class="tablewrap"><table>
        <tr>${sortTh(st, 'place', '#')}${sortTh(st, 'name', 'Team')}${sortTh(st, 'coach', 'Coach', 'hide-sm')}${sortTh(st, 'cpct', 'Conf', 'num')}${sortTh(st, 'opct', 'Ovr', 'num')}${sortTh(st, 'pf', 'PF', 'num hide-sm')}${sortTh(st, 'pa', 'PA', 'num hide-sm')}${sortTh(st, 'diff', 'Diff', 'num')}${sortTh(st, 'stk', 'Strk', 'num hide-xs')}</tr>
        ${rows.map(r => `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td class="rank">${r.place}</td><td>${chip(r.id)}${subSm(isUserTeam(team(r.id)) ? esc(r.coach) : 'CPU')}</td><td class="hide-sm">${isUserTeam(team(r.id)) ? `<a href="#coach/${slug(r.coach)}">${esc(r.coach)}</a>` : '<span class="muted">CPU</span>'}</td><td class="num">${r.cw}-${r.cl}</td><td class="num">${r.w}-${r.l}</td><td class="num hide-sm">${r.pf}</td><td class="num hide-sm">${r.pa}</td><td class="num">${r.diff > 0 ? '+' : ''}${r.diff}</td><td class="num hide-xs">${r.stk}</td></tr>`).join('')}
      </table></div>${raceHtml(race.find(r => r.div === d), ordered.map(r => r.id))}</div>`;
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

  odds(focus) {
    const s = S(), L = D.league, cur = nowUpto();
    const sim = simulate(s, cur), st = UI.oddsSort;
    const pre = !seasonGames().some(played);
    const rows = sortRows(leagueTeams().map(t => ({ id: t.id, name: t.name, coach: t.coach || 'CPU', ...sim[t.id] })), st, { likely: r => parseInt(r.likely) });
    const hist = oddsHistory();
    const divLbl = divisions().length > 1 ? 'Division' : 'Reg. Season Title';
    return `<h2>${pre ? 'Preseason Odds' : 'Season Odds'}</h2>
      <p class="muted small">${pre ? 'Built from team overall, offense and defense ratings and the full schedule, before any Week 0 games.' : 'Re-simulated 1,500 times after every advance using results so far.'} "League Title" means winning the ${esc(L.conference)} Championship Game.</p>
      <div class="card"><div class="tablewrap"><table>
        <tr>${sortTh(st, 'name', 'Team')}${sortTh(st, 'coach', 'Coach', 'hide-sm')}${sortTh(st, 'likely', 'Likely', 'num')}${sortTh(st, 'expW', 'Proj. W', 'num hide-xs')}${sortTh(st, 'divPct', divLbl.replace('Reg. Season Title', 'Div'), 'num')}${sortTh(st, 'ccgPct', 'Make Title Game', 'num hide-sm')}${sortTh(st, 'titlePct', 'Title', 'num')}</tr>
        ${rows.map(r => `<tr id="odds-${esc(r.id)}" class="${myTeam()?.id === r.id ? 'me' : ''}${focus === r.id ? ' focus' : ''}"><td>${chip(r.id)}${subSm(isUserTeam(team(r.id)) ? esc(r.coach) + ' · ' + r.expW.toFixed(1) + ' proj. W' : 'CPU')}</td><td class="hide-sm">${isUserTeam(team(r.id)) ? esc(r.coach) : '<span class="muted">CPU</span>'}</td><td class="num">${r.likely}</td><td class="num hide-xs">${r.expW.toFixed(1)}</td><td class="num">${pctStr(r.divPct)}</td><td class="num hide-sm">${pctStr(r.ccgPct)}</td><td class="num"><b>${pctStr(r.titlePct)}</b></td></tr>`).join('')}
      </table></div></div>
      <h2>Coach Odds Trend</h2><div class="card chart"><div class="row spread"><div class="seg">
        ${[['titlePct', 'League Title %', 'Title %'], ['divPct', divLbl + ' %', 'Div %'], ['expW', 'Projected Wins', 'Proj. W']].map(([k, l, sm]) => `<button data-metric="${k}" class="${UI.metric === k ? 'on' : ''}"><span class="hide-sm">${l}</span><span class="show-sm">${sm}</span></button>`).join('')}
      </div><span class="muted small">Odds entering each week · ${s} season · resets each new season</span></div>${trendChart(hist)}</div>`;
  },

  betting() {
    const L = D.league, s = S(), me = auth.profile;
    const bwks = [...new Set(D.games.filter(g => g.season === s && g.week >= L.week && !played(g)).map(g => g.week))].sort((a, b) => a - b);
    const bw = bwks.includes(UI.betWeek) ? UI.betWeek : bwks[0];
    const games = D.games.filter(g => g.season === s && g.week === bw && !played(g));
    const open = L.bettingOpen && L.phase !== PHASES.PRE && L.phase !== PHASES.POST;
    let html = `<h2>Sportsbook · ${esc(weekLabel())}</h2>`;
    if (!me) html += `<div class="notice">Every coach gets <b>${START_CREDITS.toLocaleString()} Crackers</b> per season. <a href="#account">Log in</a> to place wagers.</div>`;
    else if (!me.teamId) html += `<div class="notice">Your account isn't linked to a team yet. Ask the commissioner to link it.</div>`;
    if (me && me.teamId) {
      const b = bankroll(me.id);
      html += `<div class="card"><div class="stat"><div><span>Balance</span><b>${b.balance.toLocaleString()}</b></div><div><span>In play</span><b>${b.open}</b></div><div><span>Record</span><b>${b.w}-${b.l}${b.p ? '-' + b.p : ''}</b></div><div><span>Net</span><b class="${b.net >= 0 ? 'win' : 'loss'}">${b.net >= 0 ? '+' : ''}${b.net}</b></div></div></div>`;
    }
    html += !open ? `<div class="card empty">Betting is ${L.phase === PHASES.PRE ? 'closed until the season is published' : 'locked right now'}.</div>` :
      games.length ? `<div class="row" style="margin-bottom:10px"><div class="seg"><button data-mode="single" class="${UI.mode === 'single' ? 'on' : ''}">Single bets</button><button data-mode="parlay" class="${UI.mode === 'parlay' ? 'on' : ''}">Parlay</button></div>
        ${UI.mode === 'parlay' ? `<span class="muted small">Tap 2–${MAX_LEGS} picks from any upcoming week, plus League Champion and Win Total picks below. Per game: one spread, one moneyline and one O/U, but not the spread and moneyline on the same team. All must hit; payouts multiply. Once more than half the legs have won, you can cash out early for your stake plus ${Math.round(CASHOUT_SHARE * 100)}% of what the winning legs would pay.</span>` : ''}</div>
        <div class="row" style="margin-bottom:10px"><b>Bet on</b><select data-betweek="1">${bwks.map(w => `<option value="${w}" ${w === bw ? 'selected' : ''}>Week ${w}${w === L.week ? ' (this week)' : ''}</option>`).join('')}</select>
        <span class="muted small">${bw === L.week ? 'This week\'s games.' : 'Early lines: they move after every advance, but your bet keeps the line you took.'}</span></div><div id="popular">${popularCard()}</div><div class="card"><div class="betgrid"><div class="hdr">Spread</div><div class="hdr">Moneyline</div><div class="hdr">Total</div>
        ${games.slice().sort((x, y) => (y.id === gotwGameId()) - (x.id === gotwGameId())).map(g => betRows(g)).join('')}</div></div>` : '<div class="card empty">No open games this week.</div>';
    html += futuresSection();
    html += winsSection();
    if (me && me.teamId) {
      const mine = D.wagers.filter(w => w.uid === me.id && w.season === s).sort((a, b) => b.week - a.week || (b.ts || 0) - (a.ts || 0));
      // One block per wager: the bet gets the full width; stake, time, result and buttons sit underneath.
      const whenOf = (w, g) => w.market === 'future' ? 'Title' : w.market === 'wins' ? 'Win total' : w.market === 'parlay' ? 'Parlay' : 'Week ' + (g ? g.week : w.week);
      const resOf = w => w.status === 'open' ? `Open · to win ${winProfit(w).toLocaleString()}` : w.status === 'cashed' ? `Cashed out +${(w.payout || 0).toLocaleString()}` : (w.status === 'void' ? 'Void · refunded' : w.status === 'won' ? 'Won' : w.status === 'lost' ? 'Lost' : 'Push') + (w.payout ? ' ' + (w.payout > 0 ? '+' : '') + w.payout.toLocaleString() : '');
      html += `<h2>My Wagers</h2><div class="card">${mine.length ? `<div class="wlist">${mine.map(w => { const g = D.games.find(x => x.id === w.gameId); const canCancel = w.status === 'open' && w.market !== 'parlay' && (w.market === 'future' || w.market === 'wins' ? futuresOpen() : open && g && !played(g));
          return `<div class="wager"><div class="wtop"><div class="wlbl">${esc(wagerLabel(w))}${w.boost ? ' <span class="boosttag">⚡ +10%</span>' : ''}</div><span class="pill ${w.status}">${resOf(w)}</span></div>${legsHtml(w)}
            <div class="wbot"><span class="wmeta"><b>${w.stake.toLocaleString()}</b> staked · ${whenOf(w, g)} · ${fmtTime(w.ts)}</span><span class="wact"><button class="sm ghost" data-slip="${esc(w.id)}" title="Bet slip image" aria-label="Bet slip image">🧾</button>${canCancel ? `<button class="sm ghost" data-cancel="${esc(w.id)}">Cancel</button>` : ''}${(() => { const co = cashOutValue(w); return co ? `<button class="sm gold" data-cashout="${esc(w.id)}">Cash out ${co.total.toLocaleString()}</button>` : ''; })()}</span></div></div>`; }).join('')}</div>` : '<div class="muted">No wagers yet this season.</div>'}</div>`;
    }
    const lb = UI.lbSort, ws = UI.wkSort;
    const board0 = D.users.filter(u => u.teamId).map(u => ({ u, b: bankroll(u.id) })).sort((a, b) => b.b.balance - a.b.balance)
      .map((x, i) => ({ ...x, place: i + 1, name: x.u.name, rec: x.b.w + x.b.l ? x.b.w / (x.b.w + x.b.l) : 0, net: x.b.net, roi: x.b.risked ? x.b.net / x.b.risked : -Infinity, balance: x.b.balance }));
    const board = sortRows(board0, lb, { rec: r => r.rec * 1000 + r.b.w });
    html += `<h2>Season ${seasonNum()} Leaderboard</h2><p class="muted small" style="margin-top:-6px">Tap a column header to sort.</p><div class="card"><div class="tablewrap"><table><tr>${sortTh(lb, 'place', '#', '', 'lbSort')}${sortTh(lb, 'name', 'Coach', '', 'lbSort')}${sortTh(lb, 'rec', 'W-L-P', 'num', 'lbSort')}${sortTh(lb, 'net', 'Net', 'num hide-xs', 'lbSort')}${sortTh(lb, 'roi', 'ROI', 'num hide-sm', 'lbSort')}${sortTh(lb, 'balance', 'Balance', 'num', 'lbSort')}</tr>
      ${board.map(x => `<tr class="${me && me.id === x.u.id ? 'me' : ''}"><td class="rank">${x.place}</td><td><a href="#coach/${slug(x.u.name)}">${esc(x.u.name)}</a> <span class="muted small hide-sm">${esc(team(x.u.teamId).name)}</span>${subSm(esc(team(x.u.teamId).name))}</td><td class="num">${x.b.w}-${x.b.l}-${x.b.p}</td><td class="num hide-xs ${x.b.net >= 0 ? 'win' : 'loss'}">${x.b.net >= 0 ? '+' : ''}${x.b.net}</td><td class="num hide-sm">${x.b.risked ? Math.round(x.b.net / x.b.risked * 100) + '%' : '–'}</td><td class="num"><b>${x.b.balance.toLocaleString()}</b></td></tr>`).join('')}
    </table></div></div>`;
    // Potential payout = stake back + profit (boost included). Pushes and voids just return the stake.
    const payOf = w => w.status === 'push' || w.status === 'void' ? w.stake : w.status === 'cashed' ? w.stake + (w.payout || 0) : w.stake + winProfit(w);
    const payCell = w => { const v = payOf(w).toLocaleString(); return w.status === 'lost' ? `<s class="muted">${v}</s>` : w.status === 'won' || w.status === 'cashed' ? `<b class="win">${v}</b>` : v; };
    const STO = { open: 0, won: 1, cashed: 1.5, push: 2, void: 3, lost: 4 };
    const wk = sortRows(D.wagers.filter(w => w.season === s && w.week === L.week), ws,
      { coach: w => (w.coach || '').toLowerCase(), bet: w => wagerLabel(w).toLowerCase(), ts: w => w.ts || 0, stake: w => w.stake, payout: payOf, status: w => STO[w.status] ?? 9 });
    if (wk.length) html += `<h2>Bets Placed This Week</h2><p class="muted small" style="margin-top:-6px">Payout is the stake plus winnings if the bet hits. Tap a column header to sort.</p><div class="card"><div class="tablewrap"><table class="bets"><tr>${sortTh(ws, 'coach', 'Coach', '', 'wkSort')}${sortTh(ws, 'bet', 'Bet', '', 'wkSort')}${sortTh(ws, 'ts', 'Placed', 'hide-sm', 'wkSort')}${sortTh(ws, 'stake', 'Stake', 'num', 'wkSort')}${sortTh(ws, 'payout', 'Payout', 'num', 'wkSort')}${sortTh(ws, 'status', 'Status', 'num hide-xs', 'wkSort')}</tr>${wk.map(w => `<tr><td>${esc(w.coach || '')}</td><td class="wrap">${esc(wagerLabel(w))}${legsHtml(w)}${subSm(fmtTime(w.ts))}</td><td class="muted small hide-sm">${fmtTime(w.ts)}</td><td class="num">${w.stake}</td><td class="num">${payCell(w)}</td><td class="num hide-xs"><span class="pill ${w.status}">${w.status}</span></td></tr>`).join('')}</table></div></div>`;
    return html;
  },

  rankings() {
    const st = UI.prSort;
    let rows = currentPower().map(x => ({ ...x, name: team(x.id).name, coach: team(x.id).coach || 'CPU', wp: x.rec.w + x.rec.l ? x.rec.w / (x.rec.w + x.rec.l) : 0 }));
    rows = sortRows(rows, st, {});
    const lw = (() => { const w = seasonGames().filter(played).map(g => g.week); return w.length ? Math.max(...w) : null; })();
    return `<h2>Power Rankings</h2><p class="muted small">${lw == null ? 'Preseason order from team ratings.' : `Through Week ${lw}.`} Generated from team strength (adjusted every game by how each team performed versus expectations), recent form (last 3 games versus the spread) and record — not record alone. "Move" is the change since the previous week.</p>
      <div class="row" style="margin-bottom:10px"><div class="seg"><button data-prsort="rank" class="${st.key === 'rank' ? 'on' : ''}">Sort by rank</button><button data-prsort="move" class="${st.key === 'move' ? 'on' : ''}">Sort by movement</button></div></div>
      <div class="card"><div class="tablewrap"><table><tr>${sortTh(st, 'rank', '#')}${sortTh(st, 'name', 'Team')}${sortTh(st, 'coach', 'Coach', 'hide-sm')}${sortTh(st, 'wp', 'Rec', 'num')}${sortTh(st, 'hot', 'Form', 'num')}${sortTh(st, 'move', '+/−', 'num')}</tr>
      ${rows.map(r => `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td class="rank">${r.rank}</td><td>${chip(r.id)}${subSm(isUserTeam(team(r.id)) ? esc(r.coach) : 'CPU')}</td><td class="hide-sm">${isUserTeam(team(r.id)) ? esc(r.coach) : '<span class="muted">CPU</span>'}</td><td class="num">${rec(r.rec)}</td>
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
    const pr = currentPower().find(x => x.id === id), sim = t.conf === D.league.conference ? simulate(s, nowUpto())[id] : null;
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
        return `<tr class="clickable" data-game="${esc(g.id)}"><td>${g.week}</td><td>${g.neutral ? 'vs' : home ? 'vs' : '@'} ${chip(opp, { season: g.season, week: g.week })}</td><td class="muted wrap-sm">${l ? fmtLine(myLine) + `<span class="hide-sm"> · ${fmtOdds(home ? l.mlHome : l.mlAway)}</span>` + (winPct(g, l) && !g.forfeit ? ` · <span title="${done ? 'Pre-game win chance' : 'Win chance'}">${home ? winPct(g, l).h : winPct(g, l).a}%</span>` : '') : ''}</td><td class="num">${done ? `<span class="${my > th ? 'win' : 'loss'}">${my > th ? 'W' : 'L'} ${g.forfeit ? '(forfeit)' : my + '-' + th}</span>` : '<span class="muted">—</span>'}</td></tr>`;
      }).join('')}</table></div></div>`;
  },

  coach(arg) {
    const C = coachStats(), c = Object.values(C).find(x => slug(x.name) === arg);
    const t = D.teams.find(x => slug(x.coach) === arg);
    if (!c && !t) return '<div class="card empty">Coach not found.</div>';
    const name = c ? c.name : t.coach, u = D.users.find(x => slug(x.name) === arg);
    const seasons = coachSeasons(name), stops = coachStops(seasons), cur = D.league.season;
    const vs = c ? Object.entries(c.vs).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l)) : [];
    const pct = (w, l) => w + l ? (w / (w + l) * 100).toFixed(1) + '%' : '–';
    const titles = c ? c.titles : 0, apps = seasons.filter(x => x.finish).length;
    // Awards won by the team they coached that season (player and team awards).
    const teamAwards = D.history.flatMap(h => { const se = seasons.find(x => x.season === h.season); return se ? (h.awards || []).filter(a => a.team && se.teams.includes(a.team)).map(a => ({ h, a })) : []; }).sort((x, y) => y.h.season - x.h.season);
    const finishTag = f => f === 'champ' ? '<span class="tag gold">🏆 Champion</span>' : f === 'runner' ? '<span class="tag">Runner-up</span>' : '';
    const placeTag = x => { if (x.finish) return finishTag(x.finish); const P = seasonPlaces(x.season), p = P.places[String(name).toLowerCase()]; return p ? `<span class="place">${ordinal(p)}</span> <span class="muted small">of ${P.n}${P.final ? '' : ' · so far'}</span>` : '<span class="muted">–</span>'; };
    let html = `<p><a href="#history">← History</a></p>
      <div class="card" ${t ? `style="border-left:6px solid ${esc(teamColor(t))}"` : ''}><h2 style="margin-top:0">Coach ${esc(name)}</h2>
        <div class="muted">${t ? 'Current team: ' + chip(t.id) : 'Not currently coaching in the league'}</div>
        ${stops.length ? `<div class="cpath">${stops.map(p => `<span class="cstop">${chip(p.team, { abbr: true, rank: false })}<em>${seasonNum(p.from) === seasonNum(p.to) ? 'S' + seasonNum(p.from) : `S${seasonNum(p.from)}–${seasonNum(p.to)}`}</em></span>`).join('<span class="carr">→</span>')}</div>` : ''}
        <div class="stat" style="margin-top:12px"><div><span>Career</span><b>${c ? c.w + '-' + c.l : '0-0'}</b></div><div><span>Win %</span><b>${c ? pct(c.w, c.l) : '–'}</b></div>
        <div><span>League titles</span><b>${titles}</b></div><div><span>Title game apps</span><b>${apps}</b></div><div><span>Seasons</span><b>${seasons.length || (c ? c.seasons.size : 0)}</b></div></div></div>`;
    html += `<div class="card"><h3 style="margin-top:0">Season by season</h3>${seasons.length ? `<div class="tablewrap"><table class="cseason">
      <tr><th>Season</th><th>Team</th><th class="num">W-L</th><th class="num hide-sm">vs Coaches</th><th class="num hide-sm">PF / G</th><th class="num hide-sm">PA / G</th><th>Finish</th></tr>
      ${seasons.slice().reverse().map(x => `<tr><td><b>S${seasonNum(x.season)}</b><div class="muted small">${x.season}${x.season === cur && D.league.phase !== PHASES.PRE && !x.finish ? ' · in progress' : ''}</div></td>
        <td>${x.teams.map(id => chip(id, { abbr: innerWidth < 640, rank: false })).join(' ')}</td><td class="num"><b>${x.w}-${x.l}</b></td><td class="num hide-sm">${x.uw}-${x.ul}</td>
        <td class="num hide-sm">${x.gp ? (x.pf / x.gp).toFixed(1) : '–'}</td><td class="num hide-sm">${x.gp ? (x.pa / x.gp).toFixed(1) : '–'}</td>
        <td>${x.ccg ? `<a href="#game/${esc(x.ccg.g.id)}">${finishTag(x.finish)}</a>` : placeTag(x)}</td></tr>`).join('')}
      </table></div>` : '<div class="muted">No games on record yet.</div>'}</div>`;
    if (teamAwards.length) html += `<div class="card"><h3 style="margin-top:0">Team awards</h3><ul class="clean">${teamAwards.map(({ h, a }) => `<li><b>S${seasonNum(h.season)}</b> · ${esc(a.award)}: ${esc(a.winner)}${String(a.winner || '').toLowerCase() === team(a.team).name.toLowerCase() ? '' : ' ' + chip(a.team, { abbr: true, rank: false })}</li>`).join('')}</ul></div>`;
    html += `<div class="card"><h3 style="margin-top:0">Head-to-head vs coaches</h3>${vs.length ? `<table><tr><th>Opponent</th><th class="num">W-L</th><th class="num">Win %</th></tr>${vs.map(([o, r]) => `<tr><td><a href="#coach/${slug(o)}">${esc(o)}</a></td><td class="num">${r.w}-${r.l}</td><td class="num">${pct(r.w, r.l)}</td></tr>`).join('')}</table>` : '<div class="muted">No coach-vs-coach games yet.</div>'}</div>`;
    // Sportsbook: its own section, by season.
    if (u) {
      const bs = [...new Set(D.wagers.filter(w => w.uid === u.id).map(w => w.season))].sort((a, b) => b - a).map(se => {
        const b = bankroll(u.id, se), mine = D.wagers.filter(w => w.uid === u.id && w.season === se);
        const best = mine.filter(w => (w.status === 'won' || w.status === 'cashed') && w.payout > 0).sort((a, b) => b.payout - a.payout)[0];
        return { se, b, best, n: mine.length };
      });
      html += `<h2>Sportsbook</h2><div class="card">${bs.length ? `<div class="tablewrap"><table><tr><th>Season</th><th class="num">Bets</th><th class="num">W-L-P</th><th class="num">Net</th><th class="num hide-xs">ROI</th><th class="num">${bs[0].se === cur ? 'Balance' : 'Final'}</th></tr>
        ${bs.map(({ se, b, n }) => `<tr><td><b>S${seasonNum(se)}</b></td><td class="num">${n}</td><td class="num">${b.w}-${b.l}-${b.p}</td><td class="num ${b.net >= 0 ? 'win' : 'loss'}">${b.net >= 0 ? '+' : ''}${b.net.toLocaleString()}</td><td class="num hide-xs">${b.risked ? Math.round(b.net / b.risked * 100) + '%' : '–'}</td><td class="num"><b>${b.balance.toLocaleString()}</b></td></tr>`).join('')}</table></div>
        ${bs.filter(x => x.best).sort((p, q) => q.best.payout - p.best.payout).slice(0, 1).map(x => `<p class="small" style="margin-bottom:0"><span class="muted">Biggest hit (S${seasonNum(x.se)}):</span> <b>${esc(wagerLabel(x.best))}</b> · +${x.best.payout.toLocaleString()} Crackers <button class="sm ghost" data-slip="${esc(x.best.id)}">🧾</button></p>`).join('')}`
        : '<div class="muted">No bets yet.</div>'}</div>`;
    }
    return html;
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
        <span style="flex:1">${chip(g.away)} @ ${chip(g.home)} ${gameTags(g)}</span><span class="muted small">${tally.counts[g.id] || 0} vote${tally.counts[g.id] === 1 ? '' : 's'}</span></label>`).join('')}
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
    // Coaching Carousel: where every coach was each season, with their record.
    const carousel = C => {
      const seas = [...new Set(D.games.filter(played).map(g => g.season))].sort((a, b) => a - b); if (!seas.length) return '';
      const rows = C.map(c => ({ c, by: Object.fromEntries(coachSeasons(c.name).map(x => [x.season, x])) }));
      return `<h2>Coaching Carousel</h2><div class="card"><div class="tablewrap"><table class="carousel"><tr><th>Coach</th>${seas.map(s => `<th class="num">S${seasonNum(s)}<div class="muted small" style="font-weight:600">${s}</div></th>`).join('')}</tr>
        ${rows.map(({ c, by }) => `<tr><td><a href="#coach/${slug(c.name)}">${esc(c.name)}</a></td>${seas.map(s => { const x = by[s]; return `<td class="num">${x ? `${x.teams.map(id => `<span class="ctm"><i class="sw" style="background:${esc(teamColor(team(id)))}"></i>${esc(team(id).abbr || team(id).name)}</span>`).join(' ')}<div class="small"><b>${x.w}-${x.l}</b>${x.finish === 'champ' ? ' 🏆' : (() => { const P = seasonPlaces(s), p = P.places[c.name.toLowerCase()]; return p ? ` <span class="muted">· ${ordinal(p)}</span>` : ''; })()}</div>` : '<span class="muted">–</span>'}</td>`; }).join('')}</tr>`).join('')}
      </table></div><p class="muted small" style="margin-bottom:0">Team, record and finish each season (🏆 = league champion; the current season shows the order so far). Finish after the title game is by regular-season record, then head-to-head, then point differential.</p></div>`;
    };
    const H = D.history.slice().sort((a, b) => b.season - a.season), C = Object.values(coachStats()).sort((a, b) => b.titles - a.titles || (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)));
    const champLine = h => h.champCoach ? `${esc(h.champCoach)} over ${esc(h.runnerCoach || 'CPU')} — ${esc(team(h.champTeam).name)} ${h.champScore ?? ''}, ${esc(team(h.runnerTeam).name)} ${h.runnerScore ?? ''}` : esc(h.summary || '');
    return `<h2>League Champions</h2><div class="card">${H.length ? H.map(h => `<div class="champ"><div class="yr">S${seasonNum(h.season)}<div class="muted small" style="font-family:system-ui">${h.season}</div></div><div><b>${champLine(h)}</b>${(() => { const g = D.games.find(x => x.season === h.season && x.type === 'ccg' && played(x)); return g ? ` <a class="small" href="#game/${esc(g.id)}">Recap ›</a>` : ''; })()}${h.notes ? `<div class="muted small">${esc(h.notes)}</div>` : ''}</div></div>`).join('') : '<div class="muted">No completed seasons yet.</div>'}</div>
      <h2>All-Time Coaches</h2><div class="card"><div class="tablewrap"><table><tr><th>Coach</th><th class="num hide-sm">Seasons</th><th class="num">W-L</th><th class="num">Win %</th><th class="num">Titles</th></tr>
        ${C.map(c => `<tr><td><a href="#coach/${slug(c.name)}">${esc(c.name)}</a></td><td class="num hide-sm">${c.seasons.size}</td><td class="num">${c.w}-${c.l}</td><td class="num">${c.w + c.l ? (c.w / (c.w + c.l) * 100).toFixed(1) + '%' : '–'}</td><td class="num">${c.titles ? '🏆'.repeat(Math.min(c.titles, 5)) : '–'}</td></tr>`).join('')}
      </table></div><p class="muted small">Tap a coach for their profile: season-by-season records, every team they've coached, head-to-head and betting.</p></div>
      ${carousel(C)}
      <h2>Season Awards</h2>${H.filter(h => (h.awards || []).length).map(h => `<div class="card"><h3 style="margin-top:0">${h.season}</h3><div class="tablewrap"><table>${h.awards.map(a => `<tr><td class="wrap">${esc(a.award)}</td><td class="wrap">${(() => { const g = awardGame(h, a); return g ? `<a href="#game/${esc(g.id)}"><b>${esc(a.winner)}</b></a><div class="small goty">${esc(team(g.away).abbr || team(g.away).name)} ${g.awayScore} @ ${esc(team(g.home).abbr || team(g.home).name)} ${g.homeScore} · ${g.type === 'ccg' ? 'Title game' : 'Week ' + g.week} · <a href="#game/${esc(g.id)}">Recap ›</a></div>` : `<b>${esc(a.winner)}</b>`; })()}${subSm(a.team ? esc(team(a.team).name) : '')}</td><td class="hide-sm">${a.team ? chip(a.team) : ''}</td><td class="num muted small hide-sm">${a.votes != null ? a.votes + (a.votes === 1 ? ' vote' : ' votes') : ''}</td></tr>`).join('')}</table></div></div>`).join('') || '<div class="card muted">No awards yet.</div>'}
      <h2>"Holy Shit" Moments</h2>${H.filter(h => (h.moments || []).length).map(h => `<div class="card"><h3 style="margin-top:0">${h.season}</h3>${h.moments.map(m => `<div class="story"><p>${esc(m.text)}</p>${m.coach ? `<div class="muted small">— ${esc(m.coach)}</div>` : ''}</div>`).join('')}</div>`).join('') || '<div class="card muted">None yet.</div>'}`;
  },

  rules() {
    const L = D.league;
    return `<h2>League Rules</h2><div class="card"><ul class="clean">${((L.rules && L.rules.length) ? L.rules : DEFAULT_RULES).map(r => `<li>${esc(r)}</li>`).join('') || '<li class="muted">No rules posted.</li>'}</ul></div>
      <h2>How Betting Works</h2><div class="card"><ul class="clean"><li>Every linked coach starts each season with ${START_CREDITS.toLocaleString()} Crackers. Crackers don't carry over.</li>
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
  const isG = gotwGameId() === g.id;
  return `<div class="betgame${isG ? ' gotw' : ''}">${isG ? `<span class="ribbon">★ Game of the Week · +${Math.round((GOTW_BOOST - 1) * 100)}% profit boost</span>` : ''}<div class="tm matchup">${chip(a.id, { season: g.season, week: g.week, href: '#game/' + g.id })}<span class="at">${g.neutral ? 'vs' : '@'}</span>${chip(h.id, { season: g.season, week: g.week, href: '#game/' + g.id })}${gameTags(g)}</div>${probBar(g, l, false, 'tm')}
    <div style="display:grid;gap:4px">${b('spread', 'away', esc(a.abbr) + ' ' + fmtLine(-l.spread), juiceOf(l, 'spread', 'away'))}${b('spread', 'home', esc(h.abbr) + ' ' + fmtLine(l.spread), juiceOf(l, 'spread', 'home'))}</div>
    <div style="display:grid;gap:4px">${b('ml', 'away', esc(a.abbr), l.mlAway)}${b('ml', 'home', esc(h.abbr), l.mlHome)}</div>
    <div style="display:grid;gap:4px">${b('total', 'over', 'O ' + l.total, juiceOf(l, 'total', 'over'))}${b('total', 'under', 'U ' + l.total, juiceOf(l, 'total', 'under'))}</div></div>`;
}
function futuresSection() {
  const L = D.league, n = seasonNum();
  const board = futuresBoard();
  let h = `<h2>Season ${n} League Champion</h2>`;
  if (!board.length) return h + `<div class="card empty">Futures are open during the regular season. ${L.phase === PHASES.PRE ? 'They open when the season is published.' : 'Betting has closed for this season; open bets settle when the championship is decided.'}</div>`;
  const open = futuresOpen() && futuresPosted();
  h += `<div class="card"><p class="muted small" style="margin-top:0">Pick who wins the ${esc(L.conference)} Championship Game. Odds update after every advance${board[0].posted ? '' : ' (projected until the commissioner posts this week\'s lines)'}. A bet keeps the odds it was placed at, and it pays out when the title game is final. Closes at the end of the regular season.</p>
    <div class="tablewrap"><table><tr><th>Team</th><th class="hide-sm">Coach</th><th class="num">Chance</th><th class="num">Odds</th></tr>
    ${board.map(r => { const t = team(r.id); return `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td>${chip(r.id)}${subSm(isUserTeam(t) ? esc(t.coach) : 'CPU')}</td><td class="hide-sm">${isUserTeam(t) ? esc(t.coach) : '<span class="muted">CPU</span>'}</td><td class="num">${pctStr(r.p)}</td>
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
    <div class="tablewrap"><table><tr><th>Team</th><th class="num hide-sm">Record</th><th class="num hide-sm">Proj.</th><th class="num">Over</th><th class="num">Under</th></tr>
    ${rows.map(r => `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td>${chip(r.id)} <span class="muted small hide-sm">${esc(team(r.id).coach || '')}</span>${subSm(`${esc(team(r.id).coach || '')} · ${r.w}-${regRec(r.id).l} · proj ${r.proj.toFixed(1)}`)}</td><td class="num hide-sm">${r.w}-${(regRec(r.id)).l}</td><td class="num hide-sm">${r.proj.toFixed(1)}</td>
      ${r.o ? `<td class="num">${btn(r, 'over')}</td><td class="num">${btn(r, 'under')}</td>` : '<td class="num muted small" colspan="2">Off the board</td>'}</tr>`).join('')}
    </table></div>${open ? '' : futuresOpen() ? '<p class="muted small">Win totals open once the commissioner posts this week\'s lines.</p>' : '<p class="muted small">Betting is locked right now.</p>'}</div>`;
  return h;
}
function regRec(tid) {
  let w = 0, l = 0;
  D.games.filter(g => g.season === D.league.season && (g.type || 'reg') === 'reg' && played(g) && (g.home === tid || g.away === tid)).forEach(g => ((+g.homeScore > +g.awayScore ? g.home : g.away) === tid ? w++ : l++));
  return { w, l };
}
/* ---------- Most Popular Bet of the Week ---------- */
function popularPick() {
  const L = D.league, counts = {};
  D.wagers.filter(w => w.season === L.season && w.week === L.week && w.status !== 'void').forEach(w => {
    (w.market === 'parlay' ? (w.legs || []) : [w]).forEach(l => {
      const k = selKey(l), c = counts[k] || (counts[k] = { k, leg: l, n: 0, coaches: new Set(), stake: 0 });
      c.n++; c.coaches.add(w.uid); c.stake += w.stake;
    });
  });
  const live = Object.values(counts).map(c => ({ ...c, cur: legFor(c.leg.gameId, c.leg.market, c.leg.pick, c.leg.team) })).filter(c => {
    if (!c.cur) return false;
    if (c.leg.market === 'future') return futuresOpen() && futuresPosted();
    if (c.leg.market === 'wins') return futuresOpen() && winsPosted();
    const g = D.games.find(x => x.id === c.leg.gameId); return g && !played(g) && g.week >= L.week && L.bettingOpen;
  });
  live.sort((a, b) => b.n - a.n || b.coaches.size - a.coaches.size || b.stake - a.stake);
  return live[0] || null;
}
function popularCard() {
  const L = D.league;
  if (L.phase === PHASES.PRE || L.phase === PHASES.POST) return '';
  const p = popularPick();
  if (!p) return `<div class="card popular"><span class="ribbon">🔥 Most Popular Bet · ${esc(weekLabel())}</span><div class="muted">No bets placed yet this week. The most popular pick will show up here.</div></div>`;
  const row = slipRows({ ...p.cur, season: L.season })[0], inSlip = UI.mode === 'parlay' && UI.legs.some(x => selKey(x) === p.k);
  const mine = auth.profile && D.wagers.some(w => w.uid === auth.profile.id && w.status === 'open' && w.market !== 'parlay' && selKey(w) === p.k);
  return `<div class="card popular"><span class="ribbon">🔥 Most Popular Bet · ${esc(weekLabel())}</span>
    <div class="row spread" style="align-items:flex-end"><div style="min-width:0"><div class="pop-title">${esc(row.t)}</div><div class="muted small">${esc(row.s)}</div>
      <div class="small" style="margin-top:6px"><b>${p.n}</b> bet${p.n === 1 ? '' : 's'} from <b>${p.coaches.size}</b> coach${p.coaches.size === 1 ? '' : 'es'} this week</div></div>
    <div style="text-align:right"><div class="big" style="color:var(--gold)">${fmtOdds(p.cur.odds)}</div>
      ${UI.mode === 'parlay' ? `<button class="${inSlip ? 'ghost' : 'gold'}" data-popular="1">${inSlip ? '✓ In your parlay' : '+ Add to parlay'}</button>`
        : mine ? '<span class="pill open">✓ You\'re on this</span>' : '<button class="gold" data-popular="1">Bet it</button>'}</div></div></div>`;
}
function betPopular() {
  const p = popularPick(); if (!p) return;
  const l = p.leg;
  if (UI.mode === 'parlay') return toggleLeg(l.gameId, l.market, l.pick, l.team);
  if (l.market === 'future') return showFutureSlip(l.pick);
  if (l.market === 'wins') return showWinsSlip(l.team, l.pick);
  showSlip(l.gameId, l.market, l.pick);
}
// No doubling up: one open single bet per selection per coach.
function alreadyHolding(sel) {
  const me = auth.profile;
  return me && D.wagers.some(w => w.uid === me.id && w.status === 'open' && w.market !== 'parlay' && selKey(w) === selKey(sel));
}
setInterval(async () => {
  const page = (location.hash.slice(1) || 'home').split('/')[0];
  if (page !== 'betting' || document.hidden || $('#modal').innerHTML) return;
  await refreshWagers();
  const el = document.getElementById('popular'); if (el) el.innerHTML = popularCard();
}, 30000);

/* ---------- Shareable bet slip image ---------- */
async function placeWager(data) {
  const id = newId();
  const legs = data.market === 'parlay' ? (data.legs || []) : (['ml', 'spread', 'total'].includes(data.market) ? [data] : []);
  const b = boostFor(legs); if (b) data.boost = b;
  await put('wagers', id, data, false);
  UI.placed = { ...data, id };
}
function slipRows(w) {
  const legs = w.market === 'parlay' ? (w.legs || []) : [w];
  return legs.map(l => {
    const g = D.games.find(x => x.id === l.gameId), side = g ? (l.pick === 'home' ? g.home : g.away) : null;
    const rn = id => rankName(id, g.season, g.week);
    const match = g ? `${rn(g.away)} @ ${rn(g.home)} · Week ${g.week}` : '';
    if (l.market === 'ml') return { t: `${rn(side)} Moneyline`, s: match, o: l.odds };
    if (l.market === 'spread') return { t: `${rn(side)} ${fmtLine(l.pick === 'home' ? l.line : -l.line)}`, s: 'Spread · ' + match, o: l.odds };
    if (l.market === 'total') return { t: `${l.pick === 'over' ? 'Over' : 'Under'} ${l.line} points`, s: 'Total · ' + match, o: l.odds };
    if (l.market === 'future') return { t: `${rankName(l.pick)} to win the title`, s: `League Champion · Season ${seasonNum(w.season)}`, o: l.odds };
    if (l.market === 'wins') return { t: `${rankName(l.team)} ${l.pick === 'over' ? 'Over' : 'Under'} ${l.line} wins`, s: `Regular-season win total · Season ${seasonNum(w.season)}`, o: l.odds };
    return { t: wagerLabel(l), s: '', o: l.odds };
  });
}
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function wrapText(ctx, text, maxW) {
  const words = String(text).split(' '), lines = []; let cur = '';
  words.forEach(wd => { const t = cur ? cur + ' ' + wd : wd; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; });
  if (cur) lines.push(cur); return lines;
}
async function drawSlip(w) {
  const rows = slipRows(w), W = 1080, P = 64, F = '"Arial Black","Segoe UI Black",Impact,system-ui,sans-serif', B = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const st = w.status || 'open', settled = st !== 'open';
  const toWin = winProfit(w);
  const legRes = w.market === 'parlay' ? (w.legs || []).map(l => l.result || 'open') : [st];
  const icons = settled || legRes.some(r => r !== 'open');
  const band = { won: ['#1f9d55', `WINNER · +${(w.payout || 0).toLocaleString()} CRACKERS`], lost: ['#a3141c', 'LOST'], push: ['#4a4245', 'PUSH · STAKE REFUNDED'], void: ['#4a4245', 'VOID · STAKE REFUNDED'], cashed: ['#17708f', `CASHED OUT · +${(w.payout || 0).toLocaleString()} CRACKERS`] }[st];
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const tx = P + (icons ? 92 : 36);
  ctx.font = `700 40px ${B}`;
  const rowH = rows.map(r => 40 + wrapText(ctx, r.t, W - tx - P - 190).length * 50 + (r.s ? 44 : 0));
  const H = 330 + (band ? 130 : 0) + 150 + (w.boost ? 70 : 0) + rowH.reduce((a, b) => a + b, 0) + 300 + (w.settledAt ? 210 : 170);
  c.width = W; c.height = H;
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1d0809'); bg.addColorStop(0.35, '#121011'); bg.addColorStop(1, '#09090a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d3121c'; ctx.fillRect(0, 300, W, 8); ctx.fillStyle = '#f5b82e'; ctx.fillRect(0, 314, W, 5);
  const logo = await loadImg('logo.png');
  if (logo) { const lh = 220, lw = lh * logo.width / logo.height; ctx.drawImage(logo, P - 10, 40, lw, lh); }
  ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = `900 54px ${F}`; ctx.fillText('OEC SPORTSBOOK', W - P, 130);
  ctx.fillStyle = '#f5b82e'; ctx.font = `700 34px ${B}`; ctx.fillText(`Season ${seasonNum(w.season)} · Placed in Week ${w.week}`, W - P, 185);
  ctx.fillStyle = '#a69a9c'; ctx.font = `600 30px ${B}`; ctx.fillText(`Coach ${w.coach || ''}`, W - P, 235);
  let y = 319;
  if (band) {
    ctx.fillStyle = band[0]; ctx.fillRect(0, y, W, 130);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; for (let k = -W; k < W * 2; k += 60) { ctx.beginPath(); ctx.moveTo(k, y); ctx.lineTo(k + 30, y); ctx.lineTo(k - 100, y + 130); ctx.lineTo(k - 130, y + 130); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `900 ${st === 'won' ? 58 : 52}px ${F}`; ctx.fillText(band[1], W / 2, y + 86); ctx.textAlign = 'left';
    y += 130;
  }
  y += 81; ctx.textAlign = 'left';
  const status = { open: ['#43c97e', '✓ BET PLACED'], won: ['#43c97e', '✓ SETTLED · WON'], lost: ['#ff5a5f', '✕ SETTLED · LOST'], push: ['#a69a9c', 'SETTLED · PUSH'], void: ['#a69a9c', 'SETTLED · VOID'] }[st] || ['#43c97e', ''];
  ctx.fillStyle = status[0]; ctx.font = `800 30px ${B}`; ctx.fillText(status[1], P, y);
  y += 70; ctx.fillStyle = '#fff'; ctx.font = `900 50px ${F}`;
  ctx.fillText(w.market === 'parlay' ? `${rows.length}-LEG PARLAY` : 'SINGLE BET', P, y);
  ctx.textAlign = 'right'; ctx.fillStyle = '#f5b82e'; ctx.fillText(fmtOdds(w.odds), W - P, y); ctx.textAlign = 'left';
  y += 40;
  if (w.boost) {
    const txt = `⚡ GAME OF THE WEEK · +${Math.round((w.boost - 1) * 100)}% PROFIT BOOST`;
    ctx.font = `900 28px ${B}`; const tw = ctx.measureText(txt).width + 40;
    ctx.fillStyle = '#f5b82e'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(P, y - 4, tw, 50, 25) : ctx.rect(P, y - 4, tw, 50); ctx.fill();
    ctx.fillStyle = '#140b00'; ctx.fillText(txt, P + 20, y + 31); y += 70;
  }
  const drawIcon = (r, cx, cy) => {
    if (r === 'open') { ctx.strokeStyle = '#6b6264'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.stroke(); return; }
    ctx.fillStyle = r === 'won' ? '#1f9d55' : r === 'lost' ? '#c4161c' : '#5a5254'; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
    if (r === 'won') { ctx.moveTo(cx - 10, cy + 1); ctx.lineTo(cx - 3, cy + 9); ctx.lineTo(cx + 11, cy - 9); }
    else if (r === 'lost') { ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy + 8); ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx - 8, cy + 8); }
    else { ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy); }
    ctx.stroke(); ctx.lineCap = 'butt';
  };
  rows.forEach((r, i) => {
    const top = y, h = rowH[i], res = legRes[i] || 'open';
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(P, top, W - P * 2, h - 16);
    ctx.fillStyle = res === 'won' ? '#1f9d55' : res === 'lost' ? '#c4161c' : '#d3121c'; ctx.fillRect(P, top, 8, h - 16);
    if (icons) drawIcon(res, P + 52, top + 48);
    ctx.font = `700 40px ${B}`; ctx.fillStyle = res === 'lost' ? '#bdb3b5' : '#fff';
    const lines = wrapText(ctx, r.t, W - tx - P - 190); let ly = top + 62;
    lines.forEach(t => { ctx.fillText(t, tx, ly); ly += 50; });
    if (r.s) { ctx.font = `500 28px ${B}`; ctx.fillStyle = '#a69a9c'; wrapText(ctx, r.s, W - tx - P - 40).slice(0, 1).forEach(t => ctx.fillText(t, tx, ly - 4)); }
    ctx.textAlign = 'right'; ctx.font = `900 40px ${F}`; ctx.fillStyle = '#f5b82e'; ctx.fillText(fmtOdds(r.o), W - P - 30, top + 62); ctx.textAlign = 'left';
    y += h;
  });
  y += 30; const bw = (W - P * 2 - 40) / 3;
  const boxes = st === 'won' ? [['WAGER', w.stake], ['WON', w.payout || 0], ['TOTAL PAID', w.stake + (w.payout || 0)]]
    : st === 'cashed' ? [['WAGER', w.stake], ['CASHED OUT', w.payout || 0], ['TOTAL PAID', w.stake + (w.payout || 0)]]
    : st === 'lost' ? [['WAGER', w.stake], ['WOULD HAVE WON', toWin], ['PAID', 0]]
    : st === 'push' || st === 'void' ? [['WAGER', w.stake], ['RESULT', st.toUpperCase()], ['REFUNDED', w.stake]]
    : [['WAGER', w.stake], ['TO WIN', toWin], ['TOTAL PAYOUT', w.stake + toWin]];
  const hiCol = st === 'won' || st === 'cashed' ? '#43c97e' : st === 'lost' ? '#3a2326' : '#f5b82e', hiText = st === 'lost' ? '#ffadb0' : '#140b00';
  boxes.forEach(([k, v], i) => {
    const x = P + i * (bw + 20), hi = i === 2;
    ctx.fillStyle = hi ? hiCol : 'rgba(255,255,255,0.07)'; ctx.fillRect(x, y, bw, 190);
    ctx.fillStyle = hi ? hiText : '#a69a9c'; ctx.font = `800 ${k.length > 12 ? 21 : 26}px ${B}`; ctx.textAlign = 'center'; ctx.fillText(k, x + bw / 2, y + 62);
    ctx.fillStyle = hi ? hiText : '#fff'; ctx.font = `900 ${typeof v === 'string' ? 44 : 58}px ${F}`; ctx.fillText(typeof v === 'string' ? v : Number(v).toLocaleString(), x + bw / 2, y + 140);
    if (typeof v !== 'string') { ctx.font = `600 22px ${B}`; ctx.fillText('Crackers', x + bw / 2, y + 172); }
  });
  ctx.textAlign = 'left'; y += 250;
  ctx.strokeStyle = '#33242a'; ctx.lineWidth = 2; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.moveTo(P, y - 30); ctx.lineTo(W - P, y - 30); ctx.stroke(); ctx.setLineDash([]);
  const when = ts => new Date(ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  ctx.fillStyle = '#d9d0d1'; ctx.font = `600 30px ${B}`; ctx.fillText('Placed ' + when(w.ts || Date.now()), P, y + 20);
  if (w.settledAt) { ctx.fillText('Settled ' + when(w.settledAt), P, y + 62); y += 42; }
  ctx.fillStyle = '#a69a9c'; ctx.font = `500 26px ${B}`; ctx.fillText('Bet ID ' + String(w.id || '').toUpperCase(), P, y + 70);
  ctx.textAlign = 'right'; ctx.fillText('OEC CFB League Hub', W - P, y + 70); ctx.textAlign = 'left';
  return c;
}
async function showSlipImage(w) {
  if (!w) return;
  const c = await drawSlip(w), url = c.toDataURL('image/png');
  UI.slipCanvas = c;
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card" style="max-width:460px;max-height:92vh;overflow:auto">
    <h2>${w.status === 'open' || !w.status ? 'Bet placed!' : w.status === 'won' ? '🎉 Winner!' : 'Bet slip'}</h2><img src="${url}" alt="Bet slip" style="width:100%;border-radius:10px;display:block">
    <div class="row" style="margin-top:12px"><button class="gold" data-act="saveSlip">⬇ Save image</button><button class="ghost" data-close="1">Done</button></div>
    <p class="muted small">On iPhone, you can also press and hold the image → <b>Save to Photos</b>.</p></div></div>`;
}
/* ---------- "You won!" results pop-up after an advance ---------- */
function unseenResults() {
  const me = auth.profile; if (!me) return { list: [], key: '' };
  const key = 'oecSeenResults_' + me.id;
  let last = 0; try { last = +localStorage.getItem(key) || 0; } catch (e) { /* ignore */ }
  if (!last) last = Date.now() - 7 * 864e5; // first visit on this device: last 7 days
  return { key, list: D.wagers.filter(w => w.uid === me.id && w.status !== 'open' && w.settledAt && w.settledAt > last).sort((a, b) => (b.payout || 0) - (a.payout || 0)) };
}
async function showResultsPopup() {
  if ($('#modal').innerHTML) return;
  const { key, list } = unseenResults();
  try { localStorage.setItem(key, String(Date.now())); } catch (e) { /* ignore */ }
  const wins = list.filter(w => w.status === 'won');
  if (!wins.length) return;
  UI.results = { wins, i: 0, others: list.filter(w => w.status !== 'won') };
  await renderResult();
}
async function renderResult() {
  const R = UI.results, w = R.wins[R.i], total = R.wins.reduce((a, x) => a + (x.payout || 0), 0);
  const c = await drawSlip(w); UI.slipCanvas = c;
  const lost = R.others.filter(x => x.status === 'lost').length, ref = R.others.filter(x => x.status === 'push' || x.status === 'void').length;
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card" style="max-width:460px;max-height:92vh;overflow:auto">
    <h2>🎉 ${R.wins.length === 1 ? 'Your bet cashed!' : `${R.wins.length} bets cashed!`}</h2>
    <p style="margin-top:0">You won <b class="win">+${total.toLocaleString()} Crackers</b> since your last visit.${lost || ref ? ` <span class="muted small">Also settled: ${[lost ? lost + ' lost' : '', ref ? ref + ' refunded' : ''].filter(Boolean).join(', ')}.</span>` : ''}</p>
    <img src="${c.toDataURL('image/png')}" alt="Winning bet slip" style="width:100%;border-radius:10px;display:block">
    ${R.wins.length > 1 ? `<div class="row spread" style="margin-top:10px"><button class="sm ghost" data-res="-1" ${R.i === 0 ? 'disabled' : ''}>‹ Prev</button><span class="muted small">${R.i + 1} of ${R.wins.length}</span><button class="sm ghost" data-res="1" ${R.i === R.wins.length - 1 ? 'disabled' : ''}>Next ›</button></div>` : ''}
    <div class="row" style="margin-top:12px"><button class="gold" data-act="saveSlip">⬇ Save image</button><a class="btn ghost" style="padding:8px 14px;border-radius:8px" href="#betting" data-close="1">My bets</a><button class="ghost" data-close="1">Close</button></div></div></div>`;
}
function showPlacedSlip() { const w = UI.placed; UI.placed = null; if (w) showSlipImage(w); }
async function saveSlip() {
  const c = UI.slipCanvas; if (!c) return;
  const blob = await new Promise(r => c.toBlob(r, 'image/png')), name = 'oec-bet-slip.png';
  try {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'OEC bet slip' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
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
// One pick per market per game (spread, moneyline, O/U); one title pick; one win-total pick per team.
const legGroup = l => l.market === 'future' ? 'future' : l.market === 'wins' ? 'wins:' + l.team : `${l.market}:${l.gameId}`;
const legWeek = l => l.market === 'future' ? 'Title' : l.market === 'wins' ? 'Wins' : 'Wk ' + (D.games.find(x => x.id === l.gameId)?.week ?? '?');
function legFor(gid, market, pick, tid) {
  if (market === 'wins') { const r = winsBoard().find(x => x.id === tid); return r && r.o ? { gameId: '', market, pick, team: tid, line: r.o.line, odds: pick === 'over' ? r.o.over : r.o.under } : null; }
  if (market === 'future') { const r = futuresBoard().find(x => x.id === pick); return r && r.odds != null ? { gameId: '', market, pick, line: null, odds: r.odds } : null; }
  const g = D.games.find(x => x.id === gid), l = g && lineOf(g); if (!l) return null;
  return { gameId: gid, market, pick, line: market === 'spread' ? l.spread : market === 'total' ? l.total : null, odds: market === 'ml' ? (pick === 'home' ? l.mlHome : l.mlAway) : juiceOf(l, market, pick) };
}
// One spread-or-moneyline pick and one total per game; one League Champion pick per parlay.
function toggleLeg(gid, market, pick, tid) {
  const grp = legGroup({ market, team: tid, gameId: gid });
  const i = UI.legs.findIndex(x => legGroup(x) === grp);
  if (i >= 0 && UI.legs[i].market === market && UI.legs[i].pick === pick) { UI.legs.splice(i, 1); route(); return; }
  const leg = legFor(gid, market, pick, tid); if (!leg) return;
  // Spread and moneyline on the SAME team can't be combined: the new pick replaces the old one.
  const clash = (market === 'ml' || market === 'spread') ? UI.legs.findIndex(x => x.gameId === gid && x.market === (market === 'ml' ? 'spread' : 'ml') && x.pick === pick) : -1;
  if (i >= 0) UI.legs[i] = leg;
  else if (clash >= 0) UI.legs[clash] = leg;
  else if (UI.legs.length >= MAX_LEGS) return alert(`Parlays max out at ${MAX_LEGS} legs.`);
  else UI.legs.push(leg);
  if (i >= 0 && clash >= 0) UI.legs.splice(clash, 1);
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
  const odds = parlayOdds(UI.legs), bal = bankroll(me.id).balance, boost = boostFor(UI.legs);
  UI.slip = { parlay: true, odds, boost };
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Parlay Slip</h2><p><b>${UI.legs.length}-leg parlay ${fmtOdds(odds)}</b></p>${boost ? boostNote() : ''}
    <div class="small" style="margin-bottom:8px">${UI.legs.map(l => `• ${legWeek(l)}: ${esc(wagerLabel(l))}`).join('<br>')}</div>
    <label>Stake (balance ${bal.toLocaleString()})</label><div class="row"><input id="stake" type="number" min="1" max="${bal}" step="1" value="${Math.min(25, bal)}" inputmode="numeric" style="width:120px">
    ${[10, 25, 50, 100].map(v => `<button class="sm ghost" data-stake="${v}">${v}</button>`).join('')}</div>
    <p>To win: <b id="towin"></b></p><div class="row"><button data-act="place">Place parlay</button><button class="ghost" data-close="1">Cancel</button><span id="smsg" class="err"></span></div></div></div>`;
  updToWin();
}
const boostNote = () => `<div class="boostpill">⚡ Game of the Week · +${Math.round((GOTW_BOOST - 1) * 100)}% profit boost applied</div>`;
function showSlip(gid, market, pick) {
  const me = auth.profile;
  if (!me) { location.hash = '#account'; return; }
  if (!me.teamId) return alert('Your account is not linked to a team yet.');
  const g = D.games.find(x => x.id === gid), l = lineOf(g);
  const odds = market === 'ml' ? (pick === 'home' ? l.mlHome : l.mlAway) : juiceOf(l, market, pick);
  const line = market === 'spread' ? l.spread : market === 'total' ? l.total : null;
  const boost = boostFor([{ gameId: gid, market }]);
  UI.slip = { g, market, pick, odds, line, boost };
  const bal = bankroll(me.id).balance;
  const label = wagerLabel({ gameId: gid, market, pick, odds, line });
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Bet Slip</h2><p><b>${esc(label)}</b></p><p class="muted small">${esc(team(g.away).name)} @ ${esc(team(g.home).name)} · Week ${g.week}</p>${boost ? boostNote() : ''}
    <label>Stake (balance ${bal.toLocaleString()})</label><div class="row"><input id="stake" type="number" min="1" max="${bal}" step="1" value="${Math.min(100, bal)}" inputmode="numeric" style="width:120px">
    ${[25, 50, 100, 250].map(v => `<button class="sm ghost" data-stake="${v}">${v}</button>`).join('')}</div>
    <p>To win: <b id="towin"></b></p><div class="row"><button data-act="place">Place wager</button><button class="ghost" data-close="1">Cancel</button><span id="smsg" class="err"></span></div></div></div>`;
  updToWin();
}
function updToWin() { const s = Math.floor(+$('#stake').value || 0), o = UI.slip.odds;
  if (UI.slip.parlay) { const p = Math.round(parlayProfit(s, UI.legs) * (UI.slip.boost || 1)); $('#towin').textContent = s > 0 ? p + ' (returns ' + (s + p) + ')' : '–'; return; } $('#towin').textContent = s > 0 ? Math.round(Math.round(o > 0 ? s * o / 100 : s * 100 / -o) * (UI.slip.boost || 1)) + ' (returns ' + (s + Math.round(Math.round(o > 0 ? s * o / 100 : s * 100 / -o) * (UI.slip.boost || 1))) + ')' : '–'; }
// If the database rejects a bet, the usual reason is that the line just moved. Reload and tell the coach.
async function lineMoved(e) {
  if (e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) {
    await reload(); $('#modal').innerHTML = '';
    alert('The line just moved after new results came in. Check the new price and place your bet again.');
    return;
  }
  $('#smsg').textContent = 'Could not place this bet. ' + friendlyError(e);
}
async function placeBet() {
  const { g, market, pick, odds, line } = UI.slip, me = auth.profile, stake = Math.floor(+$('#stake').value || 0), L = D.league;
  const bal = bankroll(me.id).balance;
  if (stake < 1) return $('#smsg').textContent = 'Enter a stake.';
  if (stake > bal) return $('#smsg').textContent = 'Not enough Crackers.';
  if (UI.slip.parlay) {
    if (!L.bettingOpen) return $('#smsg').textContent = 'Betting is locked.';
    const bad = UI.legs.find(l => { if (l.market === 'future') return !(futuresOpen() && futuresPosted());
      if (l.market === 'wins') return !(futuresOpen() && winsPosted()); const g = D.games.find(x => x.id === l.gameId); return !g || played(g) || g.week < L.week || g.season !== L.season; });
    if (bad || UI.legs.length < 2) return $('#smsg').textContent = 'One of these games is locked. Remove it and try again.';
    try {
      const legs = UI.legs.map(l => ({ gameId: l.gameId, market: l.market, pick: l.pick, line: l.line, odds: l.odds, ...(l.team ? { team: l.team } : {}) }));
      await placeWager({ uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: '', market: 'parlay', pick: '', line: null, odds: parlayOdds(legs), legs, stake, status: 'open', payout: 0, ts: Date.now() });
      UI.legs = []; await reload(); showPlacedSlip();
    } catch (e) { await lineMoved(e); }
    return;
  }
  if (!UI.slip.parlay && alreadyHolding(UI.slip.wins ? UI.slip : UI.slip.future ? { market: 'future', pick } : { market, gameId: g.id, pick }))
    return $('#smsg').textContent = 'You already have this exact bet open. Add to it in a parlay instead, or cancel the first one.';
  if (UI.slip.wins) {
    if (!(futuresOpen() && winsPosted())) return $('#smsg').textContent = 'Win totals are locked.';
    try {
      await placeWager({ uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: '', market: 'wins', team: UI.slip.team, pick, line: UI.slip.line, odds, stake, status: 'open', payout: 0, ts: Date.now() });
      await reload(); showPlacedSlip();
    } catch (e) { await lineMoved(e); }
    return;
  }
  if (UI.slip.future) {
    if (!futuresOpen()) return $('#smsg').textContent = 'Futures are locked.';
    try {
      await placeWager({ uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: '', market: 'future', pick, line: null, odds, stake, status: 'open', payout: 0, ts: Date.now() });
      await reload(); showPlacedSlip();
    } catch (e) { await lineMoved(e); }
    return;
  }
  if (!L.bettingOpen || played(g) || g.week < L.week || g.season !== L.season) return $('#smsg').textContent = 'This game is locked.';
  try {
    await placeWager({ uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: g.id, market, pick, line, odds, stake, status: 'open', payout: 0, ts: Date.now() });
    await reload(); showPlacedSlip();
  } catch (e) { await lineMoved(e); }
}

/* ---------- chart ---------- */
/* ---------- Kickoff scheduling (game preview) ---------- */
const toLocalInput = ts => { const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
function kickoffCard(g) {
  const me = auth.profile, mineTeam = me && me.teamId && (me.teamId === g.home || me.teamId === g.away);
  const inv = kickoffInvite(g), pend = pendingInvites(g), commish = isCommish();
  if (played(g)) return '';
  const can = canSchedule(g), opp = mineTeam ? team(me.teamId === g.home ? g.away : g.home) : null;
  const slots = i => i.times.map(t => esc(fmtKick(t))).join(' · ');
  let body = '';
  if (inv) {
    body = `<div class="kset"><b>${esc(fmtKick(inv.time))}</b><span class="muted small">Agreed by both coaches</span></div>
      <div class="kcal"><a class="btn sm ghost" href="${icsHref(g, inv.time)}" download="OEC-${esc(team(g.away).abbr || 'away')}-at-${esc(team(g.home).abbr || 'home')}.ics">Apple / iPhone Calendar</a><a class="btn sm ghost" href="${gcalHref(g, inv.time)}" target="_blank" rel="noopener">Google Calendar</a>
      ${(mineTeam || commish) && can ? `<button class="sm ghost" data-kcan="${esc(inv.id)}">${commish && !mineTeam ? 'Clear kickoff' : 'Reschedule'}</button>` : ''}</div>`;
  } else if (!can || (!mineTeam && !commish)) {
    body = `<p class="muted" style="margin:0">Coaches haven't set a time for this matchup.</p>${mineTeam && !can && isUserTeam(team(g.home)) && isUserTeam(team(g.away)) ? `<p class="muted small" style="margin:6px 0 0">Invites open once this game is in the current or next week.</p>` : ''}`;
  } else {
    body += `<p class="muted" style="margin:0 0 4px">Coaches haven't set a time for this matchup.</p>`;
    const incoming = pend.filter(i => me && i.to === me.id), outgoing = pend.filter(i => me && i.from === me.id);
    body += incoming.map(i => `<div class="kinv"><div><b>Coach ${esc(i.fromName || '')}</b> wants to play at one of these times. Tap the one that works:</div>
      <div class="kslots">${i.times.map(t => `<button class="gold sm" data-kacc="${esc(i.id)}|${t}">${esc(fmtKick(t))}</button>`).join('')}<button class="sm ghost" data-kdec="${esc(i.id)}">None work</button></div></div>`).join('');
    body += outgoing.map(i => `<div class="kinv"><div>Waiting on <b>Coach ${esc(i.toName || '')}</b> to pick: ${slots(i)}</div><button class="sm ghost" data-kcan="${esc(i.id)}" style="margin-top:6px">Cancel invite</button></div>`).join('');
    if (commish && !mineTeam) body += pend.map(i => `<div class="kinv muted small">Pending: Coach ${esc(i.fromName || '')} → Coach ${esc(i.toName || '')}: ${slots(i)}</div>`).join('');
    if (mineTeam && !outgoing.length) {
      if (!opp.uid) body += `<p class="muted small" style="margin:0">Coach ${esc(opp.coach || '')} hasn't linked an account yet, so they can't get invites.</p>`;
      else {
        body += `<div class="kform"><div class="muted small" style="margin-bottom:6px">Propose up to ${KICK_SLOTS} times for Coach ${esc(opp.coach || '')} to choose from. Times show in each coach's own time zone.</div>
          ${Array.from({ length: KICK_SLOTS }, (_, k) => `<input type="datetime-local" class="kt" min="${toLocalInput(Date.now())}" aria-label="Time option ${k + 1}">`).join('')}
          <button data-kinv="${esc(g.id)}" style="margin-top:8px">${incoming.length ? 'Counter with these times' : 'Send invite'}</button></div>`;
      }
    }
  }
  return `<div class="card kcard"><h3 style="margin-top:0">🕗 Kickoff time</h3>${body}</div>`;
}
// Calendar links for an agreed kickoff (90-minute block).
const calTimes = ts => { const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); return [f(ts), f(ts + 90 * 60000)]; };
const calTitle = g => `OEC: ${team(g.away).name} @ ${team(g.home).name}`;
const calDesc = g => `${seasonNum(g.season) ? 'Season ' + seasonNum(g.season) + ' · ' : ''}Week ${g.week} · Coach ${coachOf(g, 'away')} @ Coach ${coachOf(g, 'home')}\n${location.origin + location.pathname}#game/${g.id}`;
function icsHref(g, ts) {
  const [s, e] = calTimes(ts), esc2 = x => String(x).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OEC CFB League Hub//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${g.id}-${ts}@oec-cfb`, `DTSTAMP:${calTimes(Date.now())[0]}`, `DTSTART:${s}`, `DTEND:${e}`, `SUMMARY:${esc2(calTitle(g))}`, `DESCRIPTION:${esc2(calDesc(g))}`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${esc2(calTitle(g))}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
}
function gcalHref(g, ts) {
  const [s, e] = calTimes(ts);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(calTitle(g)) + '&dates=' + s + '/' + e + '&details=' + encodeURIComponent(calDesc(g));
}
async function kickAction(t) {
  const me = auth.profile, now = Date.now();
  try {
    if (t.dataset.kinv) {
      const g = D.games.find(x => x.id === t.dataset.kinv), opp = team(me.teamId === g.home ? g.away : g.home);
      const times = [...new Set($$('.kcard .kt').map(i => i.value).filter(Boolean).map(v => new Date(v).getTime()))].filter(x => x > now).sort((x, y) => x - y);
      if (!times.length) return alert('Pick at least one time in the future.');
      const ops = [{ op: 'set', col: 'invites', id: newId(), merge: false, data: { gameId: g.id, season: g.season, week: g.week, from: me.id, to: opp.uid, fromName: me.name || '', toName: opp.coach || '', times, status: 'pending', ts: now } }];
      // A counter-offer closes the invite they sent you.
      pendingInvites(g).filter(i => i.to === me.id).forEach(i => ops.push({ op: 'set', col: 'invites', id: i.id, data: { status: 'declined', respondedAt: now } }));
      await batch(ops);
    } else if (t.dataset.kacc) {
      const [id, ts] = t.dataset.kacc.split('|'), inv = D.invites.find(i => i.id === id);
      if (!confirm(`Lock in kickoff for ${fmtKick(+ts)}?`)) return;
      const g = D.games.find(x => x.id === inv.gameId), ops = [{ op: 'set', col: 'invites', id, data: { status: 'accepted', time: +ts, respondedAt: now } }];
      pendingInvites(g).filter(i => i.id !== id && (i.to === me.id || i.from === me.id)).forEach(i => ops.push({ op: 'set', col: 'invites', id: i.id, data: { status: i.to === me.id ? 'declined' : 'cancelled', respondedAt: now } }));
      await batch(ops);
    } else if (t.dataset.kdec) {
      await put('invites', t.dataset.kdec, { status: 'declined', respondedAt: now });
    } else if (t.dataset.kcan) {
      const inv = D.invites.find(i => i.id === t.dataset.kcan);
      if (inv.status === 'accepted' && !confirm('Clear this kickoff time? You can then send new times.')) return;
      await put('invites', t.dataset.kcan, { status: 'cancelled', respondedAt: now });
    }
    await reload();
  } catch (err) { alert(friendlyError(err)); }
}

/* ---------- Win-chance chart (game preview) ---------- */
// Team colors can be very dark on our dark cards; lift them until the line reads.
function liftColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#9a9a9a';
  let [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  const lum = () => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  for (let i = 0; i < 12 && lum() < 0.42; i++) { r += (255 - r) * 0.18; g += (255 - g) * 0.18; b += (255 - b) * 0.18; }
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function colorGap(a, b) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
function winChart(g, A, H) {
  const pts = winHistory(g); if (!pts.length) return '';
  const done = played(g), n = pts.length;
  const ca = liftColor(teamColor(A)); let ch = liftColor(teamColor(H));
  const same = colorGap(ca, ch) < 70; if (same) ch = '#e8e2e3';
  const narrow = innerWidth < 640, W = narrow ? 360 : 860, Ht = narrow ? 200 : 260, P = { l: 34, r: narrow ? 74 : 84, t: 12, b: 26 };
  const x = i => P.l + (n === 1 ? (W - P.l - P.r) / 2 : i * (W - P.l - P.r) / (n - 1)), y = v => P.t + (1 - v) * (Ht - P.t - P.b);
  const path = f => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join('');
  const fa = p => 1 - p.p, fh = p => p.p;
  let svg = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Win chance from matchup open to ${done ? 'kickoff' : 'now'}" class="wpsvg">`;
  [0, .25, .5, .75, 1].forEach(v => svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === .5 ? '#4a3a40' : '#2b2024'}" ${v === .5 ? 'stroke-dasharray="4 4"' : ''}/><text x="${P.l - 6}" y="${y(v) + 4}" fill="#a69a9c" font-size="11" text-anchor="end">${v * 100}%</text>`);
  const step = Math.max(1, Math.ceil(n / (narrow ? 4 : 6)));
  pts.forEach((p, i) => { if (i % step === 0 || i === n - 1) { if (i !== n - 1 && n - 1 - i < step * 0.6) return; svg += `<text x="${x(i)}" y="${Ht - 7}" fill="#a69a9c" font-size="11" text-anchor="${i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}">${esc(p.label)}</text>`; } });
  svg += `<path d="${path(fa)}" fill="none" stroke="${ca}" stroke-width="2.5" stroke-linejoin="round"/><path d="${path(fh)}" fill="none" stroke="${ch}" stroke-width="2.5" stroke-linejoin="round"${same ? ' stroke-dasharray="6 4"' : ''}/>`;
  // Direct labels at the right end, nudged apart.
  const ends = [{ v: fa(pts[n - 1]), t: A, c: ca }, { v: fh(pts[n - 1]), t: H, c: ch }].map(e => ({ ...e, yy: y(e.v) })).sort((a, b) => a.yy - b.yy);
  if (ends[1].yy - ends[0].yy < 16) { const mid = (ends[0].yy + ends[1].yy) / 2; ends[0].yy = mid - 8; ends[1].yy = mid + 8; }
  ends.forEach(e => svg += `<circle cx="${x(n - 1)}" cy="${y(e.v)}" r="4" fill="${e.c}" stroke="#1a1416" stroke-width="2"/><text x="${x(n - 1) + 9}" y="${e.yy + 4}" fill="#f3eeee" font-size="12" font-weight="800">${esc(e.t.abbr || e.t.name)} ${Math.round(e.v * 100)}%</text>`);
  svg += `<g class="wpx" style="display:none"><line y1="${P.t}" y2="${Ht - P.b}" stroke="#a69a9c" stroke-width="1"/><circle r="4.5" fill="${ca}" stroke="#1a1416" stroke-width="2" class="wpa"/><circle r="4.5" fill="${ch}" stroke="#1a1416" stroke-width="2" class="wph"/></g>`;
  svg += `<rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${Ht}" fill="transparent" class="wphit"/></svg>`;
  const first = pts[0], last = pts[n - 1], mv = v => { const d = Math.round(v * 100); return d === 0 ? '<span class="muted">no change</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`; };
  const head = (t, c, now, open) => `<div class="wph-team"><i class="sw" style="background:${c}"></i><span class="wph-ab">${esc(t.abbr || t.name)}</span><b class="wph-v">${Math.round(now * 100)}%</b><span class="wph-mv">${mv(now - open)}</span></div>`;
  const data = esc(JSON.stringify({ pts: pts.map(p => ({ l: p.label, s: p.sub, p: p.p })), W, Ht, P, n, A: A.abbr || A.name, H: H.abbr || H.name, open: first.p }));
  const when = `${done ? 'Matchup open to kickoff' : 'Since the matchup opened'} · ${n} point${n === 1 ? '' : 's'}`;
  return `<div class="card wpchart" data-wp="${data}" data-when="${esc(when)}"><div class="row spread" style="align-items:flex-end;gap:6px 14px"><div><h3 style="margin:0">Win chance</h3><div class="muted small wph-when">${esc(when)}</div></div>
    <div class="wph">${head(A, ca, fa(last), fa(first))}${head(H, ch, fh(last), fh(first))}</div></div>
    <div class="wpwrap">${svg}</div><p class="muted small" style="margin:6px 0 0">The model's chance for each team, updated whenever lines re-price (new scores, an advance or rating changes). Weeks before tracking started are rebuilt from the model as of each week. Touch or hover to see each point.</p></div>`;
}
// Crosshair + header readout for the win-chance chart.
function wpHover(e) {
  const card = e.target.closest && e.target.closest('.wpchart'); if (!card) return;
  const svg = card.querySelector('svg'), D0 = JSON.parse(card.dataset.wp), r = svg.getBoundingClientRect();
  const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, vx = px / r.width * D0.W;
  const span = D0.W - D0.P.l - D0.P.r, i = D0.n === 1 ? 0 : Math.max(0, Math.min(D0.n - 1, Math.round((vx - D0.P.l) / span * (D0.n - 1))));
  const p = D0.pts[i], X = D0.P.l + (D0.n === 1 ? span / 2 : i * span / (D0.n - 1)), Y = v => D0.P.t + (1 - v) * (D0.Ht - D0.P.t - D0.P.b);
  const g = svg.querySelector('.wpx'); g.style.display = '';
  g.querySelector('line').setAttribute('x1', X); g.querySelector('line').setAttribute('x2', X);
  g.querySelector('.wpa').setAttribute('cx', X); g.querySelector('.wpa').setAttribute('cy', Y(1 - p.p));
  g.querySelector('.wph').setAttribute('cx', X); g.querySelector('.wph').setAttribute('cy', Y(p.p));
  const v = card.querySelectorAll('.wph-v'), m = card.querySelectorAll('.wph-mv');
  const mv = d => { d = Math.round(d * 100); return d === 0 ? '<span class="muted">no change</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`; };
  v[0].textContent = Math.round((1 - p.p) * 100) + '%'; v[1].textContent = Math.round(p.p * 100) + '%';
  m[0].innerHTML = mv((1 - p.p) - (1 - D0.open)); m[1].innerHTML = mv(p.p - D0.open);
  card.querySelector('.wph-when').textContent = p.s;
}
function wpReset(card) {
  if (!card || !card.dataset.wp) return;
  const D0 = JSON.parse(card.dataset.wp), p = D0.pts[D0.n - 1];
  card.querySelector('.wpx').style.display = 'none';
  const v = card.querySelectorAll('.wph-v'), m = card.querySelectorAll('.wph-mv');
  const mv = d => { d = Math.round(d * 100); return d === 0 ? '<span class="muted">no change</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`; };
  v[0].textContent = Math.round((1 - p.p) * 100) + '%'; v[1].textContent = Math.round(p.p * 100) + '%';
  m[0].innerHTML = mv((1 - p.p) - (1 - D0.open)); m[1].innerHTML = mv(p.p - D0.open);
  card.querySelector('.wph-when').textContent = card.dataset.when;
}
document.addEventListener('pointermove', e => { if (e.target.closest && e.target.closest('.wpchart svg')) wpHover(e); });
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.wpchart svg')) wpHover(e); });
document.addEventListener('pointerout', e => { const c = e.target.closest && e.target.closest('.wpchart svg'); if (c && !c.contains(e.relatedTarget)) wpReset(c.closest('.wpchart')); });
// Coach odds trend: "League" shows every coach week over week; picking a team isolates it (others fade).
const trendFmt = (v, isW) => v == null ? '–' : isW ? v.toFixed(1) : (v > 0 && v < 0.005 ? '<1%' : Math.round(v * 100) + '%');
function trendChart(hist) {
  if (!hist.length) return '<div class="empty">The chart starts once the season schedule is published.</div>';
  const teams = userTeams(); if (!teams.length) return '<div class="empty">No coaches assigned yet.</div>';
  const k = UI.metric, isW = k === 'expW', sel = teams.some(t => t.id === UI.trendTeam) ? UI.trendTeam : 'all', one = sel !== 'all';
  const narrow = innerWidth < 640, W = narrow ? 360 : 860, H = narrow ? 230 : 300, P = { l: narrow ? 32 : 40, r: narrow ? 62 : 72, t: 12, b: 26 };
  const n = hist.length, top = Math.max(0, ...teams.flatMap(t => hist.map(p => p.sim[t.id] ? p.sim[t.id][k] : 0)));
  // Percent charts zoom to the highest value (in 25% steps) so small odds are readable.
  const maxY = isW ? Math.max(1, ...teams.map(t => hist[0].sim[t.id]?.gp || 0)) : Math.min(1, Math.max(.25, Math.ceil(top * 1.08 * 4) / 4));
  const x = i => P.l + (n === 1 ? (W - P.l - P.r) / 2 : i * (W - P.l - P.r) / (n - 1)), y = v => P.t + (1 - v / maxY) * (H - P.t - P.b);
  const val = (t, i) => hist[i].sim[t.id] ? hist[i].sim[t.id][k] : 0;
  const col = Object.fromEntries(teams.map(t => [t.id, liftColor(teamColor(t))]));
  const ticks = isW ? [...Array(maxY + 1).keys()].filter(v => v % Math.ceil(maxY / 5) === 0) : maxY <= .5 ? [0, .1, .2, .3, .4, .5].filter(v => v <= maxY + 1e-9) : [0, .25, .5, .75, 1].filter(v => v <= maxY + 1e-9);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Coach odds week over week" class="trsvg">`;
  ticks.forEach(v => svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#2b2024"/><text x="${P.l - 6}" y="${y(v) + 4}" fill="#a69a9c" font-size="11" text-anchor="end">${isW ? v : Math.round(v * 100) + '%'}</text>`);
  const step = Math.max(1, Math.ceil(n / (narrow ? 5 : 10)));
  hist.forEach((p, i) => { if ((i % step === 0 && n - 1 - i >= step * 0.6) || i === n - 1) svg += `<text x="${x(i)}" y="${H - 7}" fill="#a69a9c" font-size="11" text-anchor="${i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}">${esc(p.label)}</text>`; });
  const line = (t, attrs) => `<polyline fill="none" points="${hist.map((_, i) => x(i).toFixed(1) + ',' + y(val(t, i)).toFixed(1)).join(' ')}" stroke-linejoin="round" ${attrs}/>`;
  const order = one ? [...teams.filter(t => t.id !== sel), teams.find(t => t.id === sel)] : teams;
  order.forEach(t => {
    const me = t.id === sel;
    svg += one && !me ? line(t, `stroke="#6f6266" stroke-width="1.2" opacity=".35"`) : line(t, `stroke="${col[t.id]}" stroke-width="${me ? 3 : 2}"`);
    if (me) hist.forEach((_, i) => svg += `<circle cx="${x(i)}" cy="${y(val(t, i))}" r="3.5" fill="${col[t.id]}" stroke="#1a1416" stroke-width="1.5"/>`);
  });
  // Direct labels at the right end (all coaches in League view, just the pick otherwise), nudged apart.
  const ends = (one ? teams.filter(t => t.id === sel) : [...teams].sort((p, q) => val(q, n - 1) - val(p, n - 1)).slice(0, 3)).map(t => ({ t, yy: y(val(t, n - 1)), v: val(t, n - 1) })).sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 12) ends[i].yy = ends[i - 1].yy + 12;
  for (let i = ends.length - 1; i >= 0; i--) { const lim = i === ends.length - 1 ? H - P.b : ends[i + 1].yy - 12; if (ends[i].yy > lim) ends[i].yy = lim; }
  ends.forEach(e => svg += `<text x="${x(n - 1) + 7}" y="${e.yy + 4}" fill="#f3eeee" font-size="${one ? 12 : 10.5}" font-weight="800">${esc(e.t.abbr || e.t.name)}${one ? ' ' + trendFmt(e.v, isW) : ''}</text>`);
  svg += `<g class="trx" style="display:none"><line y1="${P.t}" y2="${H - P.b}" stroke="#a69a9c" stroke-width="1"/>${(one ? teams.filter(t => t.id === sel) : teams).map(t => `<circle r="${one ? 5 : 3.5}" fill="${col[t.id]}" stroke="#1a1416" stroke-width="1.5" data-tid="${esc(t.id)}"/>`).join('')}</g>`;
  svg += `<rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent"/></svg>`;
  // Data for the hover layer.
  const data = { W, H, P, n, maxY, isW, one, sel, labels: hist.map(p => p.label), teams: teams.map(t => ({ id: t.id, ab: t.abbr || t.name, coach: t.coach, c: col[t.id], v: hist.map((_, i) => val(t, i)) })) };
  const picker = `<div class="trpick"><button data-trend="all" class="${one ? '' : 'on'}">League</button>${teams.map(t => `<button data-trend="${esc(t.id)}" class="${sel === t.id ? 'on' : ''}"><i class="sw" style="background:${col[t.id]}"></i>${esc(t.abbr || t.name)}</button>`).join('')}</div>`;
  return `${picker}<div class="trchart" data-tr="${esc(JSON.stringify(data))}"><div class="trread">${trendReadout(data, n - 1)}</div><div class="trwrap">${svg}</div></div>
    <p class="muted small" style="margin:6px 0 0">Touch or hover the chart to see any week. ${one ? 'Faded lines are the rest of the league.' : 'Tap a coach above to follow just their team.'}</p>`;
}
function trendReadout(D0, i) {
  const wk = D0.labels[i], when = wk === 'Pre' ? 'Preseason' : wk === 'Final' ? 'Final' : `Entering ${wk.replace('Wk', 'Week')}`;
  const chg = (t, j) => { if (j < 1) return ''; const d = D0.isW ? t.v[j] - t.v[j - 1] : Math.round(t.v[j] * 100) - Math.round(t.v[j - 1] * 100); const r = D0.isW ? Math.round(d * 10) / 10 : d; return r === 0 ? '' : `<span class="${r > 0 ? 'up' : 'down'}">${r > 0 ? '▲' : '▼'}${Math.abs(r)}</span>`; };
  if (D0.one) {
    const t = D0.teams.find(x => x.id === D0.sel), d0 = D0.isW ? t.v[i] - t.v[0] : Math.round(t.v[i] * 100) - Math.round(t.v[0] * 100), r0 = D0.isW ? Math.round(d0 * 10) / 10 : d0;
    const rank = [...D0.teams].sort((a, b) => b.v[i] - a.v[i]).findIndex(x => x.id === t.id) + 1;
    return `<div class="trone"><div><span class="muted small">${esc(when)}</span><div class="trbig"><i class="sw" style="background:${t.c}"></i>${esc(t.ab)} <b>${trendFmt(t.v[i], D0.isW)}</b></div></div>
      <div class="trstats"><span>${chg(t, i) || '<span class="muted">–</span>'} <em>vs prior week</em></span><span>${r0 === 0 ? '<span class="muted">–</span>' : `<span class="${r0 > 0 ? 'up' : 'down'}">${r0 > 0 ? '▲' : '▼'}${Math.abs(r0)}</span>`} <em>since preseason</em></span><span><b>#${rank}</b> <em>of ${D0.teams.length} coaches</em></span></div></div>`;
  }
  const rows = [...D0.teams].sort((a, b) => b.v[i] - a.v[i]);
  return `<div class="muted small" style="margin-bottom:6px">${esc(when)}</div><ol class="trlist">${rows.map(t => `<li data-trend="${esc(t.id)}"><i class="sw" style="background:${t.c}"></i><span class="ab">${esc(t.ab)}</span><b>${trendFmt(t.v[i], D0.isW)}</b>${chg(t, i)}</li>`).join('')}</ol>`;
}
function trHover(e) {
  const card = e.target.closest('.trchart'), svg = card.querySelector('svg'), D0 = JSON.parse(card.dataset.tr), r = svg.getBoundingClientRect();
  const vx = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * D0.W, span = D0.W - D0.P.l - D0.P.r;
  const i = D0.n === 1 ? 0 : Math.max(0, Math.min(D0.n - 1, Math.round((vx - D0.P.l) / span * (D0.n - 1))));
  if (card.dataset.i === String(i)) return; card.dataset.i = i;
  const X = D0.P.l + (D0.n === 1 ? span / 2 : i * span / (D0.n - 1)), Y = v => D0.P.t + (1 - v / D0.maxY) * (D0.H - D0.P.t - D0.P.b);
  const g = svg.querySelector('.trx'); g.style.display = '';
  g.querySelector('line').setAttribute('x1', X); g.querySelector('line').setAttribute('x2', X);
  g.querySelectorAll('circle').forEach(c => { const t = D0.teams.find(z => z.id === c.dataset.tid); c.setAttribute('cx', X); c.setAttribute('cy', Y(t.v[i])); });
  card.querySelector('.trread').innerHTML = trendReadout(D0, i);
}
function trReset(card) {
  const D0 = JSON.parse(card.dataset.tr); delete card.dataset.i;
  card.querySelector('.trx').style.display = 'none'; card.querySelector('.trread').innerHTML = trendReadout(D0, D0.n - 1);
}
document.addEventListener('pointermove', e => { if (e.target.closest && e.target.closest('.trchart svg')) trHover(e); });
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.trchart svg')) trHover(e); });
document.addEventListener('pointerout', e => { const c = e.target.closest && e.target.closest('.trchart svg'); if (c && !c.contains(e.relatedTarget)) trReset(c.closest('.trchart')); });

/* ---------- YouTube live pop-up ---------- */
const YT_CHANNEL = 'https://youtube.com/@originalentertainingcrackers';
let autoLive = { live: false };
async function checkLive() {
  try { const r = await fetch('live.json?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) autoLive = await r.json(); } catch (e) { /* ignore */ }
  showLive();
}
// Manual switch expires after 6 hours; the automatic status only counts if the checker confirmed it in the last 25 minutes.
const MANUAL_TTL = 6 * 3600e3, AUTO_TTL = 25 * 60e3;
function liveInfo() {
  const m = D.league.live, now = Date.now();
  if (m && m.on && m.since && now - m.since < MANUAL_TTL) return { key: 'm:' + m.since, url: m.url || YT_CHANNEL + '/live', title: m.title || 'OEC is live on YouTube' };
  if (autoLive.live && autoLive.checkedAt && now - autoLive.checkedAt < AUTO_TTL) return { key: 'a:' + autoLive.videoId, url: autoLive.url || YT_CHANNEL + '/live', title: autoLive.title || 'OEC is live on YouTube' };
  return null;
}
function showLive() {
  let el = document.getElementById('livePop');
  const info = liveInfo();
  let dismissed = ''; try { dismissed = localStorage.getItem('oecLiveDismissed') || ''; } catch (e) { /* ignore */ }
  if (!info || dismissed === info.key) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'livePop'; el.className = 'livepop'; document.body.appendChild(el); }
  el.innerHTML = `<button class="lp-x" data-livex="${esc(info.key)}" aria-label="Close">✕</button>
    <div class="lp-badge"><i></i>LIVE NOW</div><div class="lp-title">${esc(info.title)}</div>
    <a class="btn lp-go" href="${esc(info.url)}" target="_blank" rel="noopener">▶ Watch on YouTube</a>`;
}
setInterval(async () => { await refreshLive(); checkLive(); }, 60000);

/* ---------- Game preview / recap page ---------- */
const pct0 = p => Math.round(p * 100) + '%';
const possN = n => /s$/i.test(n) ? n + "'" : n + "'s";
// Season numbers for one team: ATS, O/U, scoring, underdog record (forfeits skipped).
function teamProfile(tid, s) {
  const out = { gp: 0, pf: 0, pa: 0, ats: [0, 0, 0], ou: [0, 0, 0], dog: [0, 0], fav: [0, 0] };
  D.games.filter(g => g.season === s && played(g) && !g.forfeit && (g.home === tid || g.away === tid)).forEach(g => {
    const home = g.home === tid, my = home ? +g.homeScore : +g.awayScore, th = home ? +g.awayScore : +g.homeScore, l = lineOf(g);
    out.gp++; out.pf += my; out.pa += th;
    if (!l) return;
    const myLine = home ? l.spread : -l.spread, cov = my - th + myLine, tot = my + th - l.total;
    out.ats[cov > 0 ? 0 : cov < 0 ? 1 : 2]++; out.ou[tot > 0 ? 0 : tot < 0 ? 1 : 2]++;
    const pw = home ? l.pHome : 1 - l.pHome, won = my > th;
    if (pw < 0.5) out.dog[won ? 0 : 1]++; else out.fav[won ? 0 : 1]++;
  });
  return out;
}
function coachMeetings(c1, c2, exceptId) {
  if (!c1 || !c2 || c1 === 'CPU' || c2 === 'CPU') return [];
  const key = [c1, c2].sort().join('|');
  return D.games.filter(g => played(g) && g.id !== exceptId && [coachOf(g, 'home'), coachOf(g, 'away')].sort().join('|') === key)
    .sort((a, b) => b.season - a.season || b.week - a.week);
}
function meetingWinner(g) { const hw = +g.homeScore > +g.awayScore; return { coach: coachOf(g, hw ? 'home' : 'away'), team: hw ? g.home : g.away, ws: Math.max(+g.homeScore, +g.awayScore), ls: Math.min(+g.homeScore, +g.awayScore), lteam: hw ? g.away : g.home, lcoach: coachOf(g, hw ? 'away' : 'home') }; }

PAGES.game = function (id) {
  const g = D.games.find(x => x.id === id); if (!g) return '<div class="card empty">Game not found.</div>';
  const L = D.league, s = g.season, A = team(g.away), H = team(g.home), done = played(g), l = lineOf(g), p = winPct(g, l);
  const rk = t => rankOf(t.id, s, g.week), rn = t => (rk(t) ? '#' + rk(t) + ' ' : '') + t.name;
  const recs = records(s), ra = recs[A.id], rh = recs[H.id];
  const ca = isUserTeam(A) ? A.coach : (g.awayCoach || 'CPU'), ch = isUserTeam(H) ? H.coach : (g.homeCoach || 'CPU');
  const coachA = done ? coachOf(g, 'away') : ca, coachH = done ? coachOf(g, 'home') : ch;
  const PA = teamProfile(A.id, s), PH = teamProfile(H.id, s);
  const R = ratings(s, nowUpto()), formOf = t => { const r = R[t.id]; if (!r || !r.perf.length) return null; const x = r.perf.slice(-3); return x.reduce((a, b) => a + b.v, 0) / x.length; };
  const fav = l ? (l.spread <= 0 ? H : A) : null, dog = fav ? (fav === H ? A : H) : null;
  const meets = coachMeetings(coachA, coachH, g.id);
  const mw = meets.reduce((o, m) => { const w = meetingWinner(m).coach; o[w] = (o[w] || 0) + 1; return o; }, {});
  const isGotw = gotwTally(s, g.week).game?.id === g.id;
  const same = A.conf === L.conference && H.conf === L.conference && A.div && A.div === H.div && divisions().length > 1;
  const divOrder = same ? orderGroup(leagueTeams().filter(t => t.div === A.div).map(t => t.id), s) : [];
  const where = g.neutral ? 'at a neutral site' : `at ${H.name}`;

  // ----- headline -----
  let title;
  if (done) {
    const w = +g.homeScore > +g.awayScore ? H : A, lo = w === H ? A : H, mar = Math.abs(g.homeScore - g.awayScore), pw = p ? (w === H ? p.h : p.a) : 50;
    title = g.forfeit ? `${w.name} Takes a Forfeit Win Over ${lo.name}` : pw < 40 ? `Shock in Week ${g.week}: ${rn(w)} Stuns ${rn(lo)}` : mar >= 28 ? `${w.name} Rolls Past ${lo.name}` : mar <= 3 ? `${w.name} Survives ${lo.name} in a Thriller` : `${w.name} Handles ${lo.name}`;
    if (g.type === 'ccg') title = `${w.name} Wins the League Championship`;
  } else {
    const cand = [];
    if (g.type === 'ccg') cand.push([100, `For All the Marbles: ${rn(A)} vs. ${rn(H)}`]);
    if (rk(A) && rk(H)) cand.push([90, `Top-25 Clash: ${rn(A)} at ${rn(H)}`]);
    if (same && divOrder.indexOf(A.id) < 2 && divOrder.indexOf(H.id) < 2) cand.push([86, `Showdown for the ${A.div} Crown`]);
    const lead = Object.entries(mw).sort((x, y) => y[1] - x[1])[0];
    if (lead && meets.length >= 3 && lead[1] === meets.length) { const loser = lead[0] === coachA ? coachH : coachA; cand.push([80, `Can ${loser} Finally Solve ${lead[0]}?`]); }
    if (meets.length) { const lm = meetingWinner(meets[0]); cand.push([70, `Revenge Game: ${lm.lcoach} Gets Another Shot at ${lm.coach}`]); }
    if (l && Math.abs(l.spread) <= 2.5) cand.push([66, `Coin Flip: ${A.name} and ${H.name} Are Dead Even`]);
    if (l && Math.abs(l.spread) >= 17) cand.push([60, `Upset Alert? ${dog.name} Tries to Shock ${rn(fav)}`]);
    const sa = streak(ra), sh = streak(rh);
    [[A, sa], [H, sh]].forEach(([t, st]) => { if (/^W\d+$/.test(st) && +st.slice(1) >= 3) cand.push([55, `Can Anyone Stop ${t.name}?`]); if (/^L\d+$/.test(st) && +st.slice(1) >= 3) cand.push([50, `Desperation Time for ${t.name}`]); });
    cand.push([0, `${A.name} at ${H.name}: What to Watch`]);
    title = cand.sort((x, y) => y[0] - x[0])[0][1];
  }

  // ----- story paragraphs -----
  const paras = [];
  const recTxt = t => { const r = recs[t.id]; return `${r.w}-${r.l}${t.conf === L.conference && (r.cw + r.cl) ? `, ${r.cw}-${r.cl} ${t.div || L.conference}` : ''}`; };
  const cTxt = c => c && c !== 'CPU' ? `${possN(c)} ` : '';
  if (done) {
    const w = +g.homeScore > +g.awayScore ? H : A, lo = w === H ? A : H, ws = Math.max(+g.homeScore, +g.awayScore), ls = Math.min(+g.homeScore, +g.awayScore);
    if (g.forfeit) paras.push(`${cTxt(w === H ? coachH : coachA)}${w.name} was awarded a forfeit win over ${lo.name} in Week ${g.week}. All bets on this game were refunded.`);
    else {
      let t = `${cTxt(w === H ? coachH : coachA)}${rn(w)} beat ${cTxt(lo === H ? coachH : coachA)}${rn(lo)} ${ws}-${ls} in Week ${g.week}${g.type === 'ccg' ? ' to win the league championship' : ''}.`;
      if (l) { const m = +g.homeScore - +g.awayScore + l.spread, tot = ws + ls; t += ` ${fav ? `${fav.name} closed as a ${Math.abs(l.spread)}-point favorite` : 'It closed as a pick\'em'}; ${m === 0 ? 'the spread pushed' : `${(m > 0 ? H : A).name} covered`}, and the ${tot} combined points went ${tot > l.total ? 'over' : tot < l.total ? 'under' : 'right on'} the ${l.total} total.`; }
      if (p) { const pw = w === H ? p.h : p.a; t += pw < 40 ? ` The model gave ${w.name} only a ${pw}% chance before kickoff.` : ` ${w.name} went in with a ${pw}% chance to win.`; }
      paras.push(t);
    }
  } else {
    let t = `${cTxt(coachA)}${rn(A)} (${recTxt(A)}) ${g.neutral ? 'meets' : 'visits'} ${cTxt(coachH)}${rn(H)} (${recTxt(H)}) in Week ${g.week}${g.neutral ? ' at a neutral site' : ''}.`;
    if (l && p) t += ` ${fav ? `${fav.name} is a ${Math.abs(l.spread)}-point favorite with a ${Math.max(p.a, p.h)}% chance to win` : 'The line is a pick\'em'}, and the total sits at ${l.total}.`;
    if (same) t += ` Both teams play in the ${A.div}, where ${team(divOrder[0]).name} currently leads the division${divOrder.indexOf(A.id) < 2 && divOrder.indexOf(H.id) < 2 ? ', so the division race runs straight through this game' : ''}.`;
    if (isGotw) t += ` The league voted it Game of the Week, and bets on it get a +10% profit boost.`;
    paras.push(t);
    if (L.phase === PHASES.REG && s === L.season && (g.type || 'reg') === 'reg' && A.conf === L.conference && H.conf === L.conference) {
      const u = nowUpto(), base = simulate(s, u), hW = simulate(s, u, 1500, { [g.id]: true }), aW = simulate(s, u, 1500, { [g.id]: false });
      const move = (t, win, lose) => { const b = base[t.id].titlePct, w = win[t.id].titlePct, lo = lose[t.id].titlePct;
        if (!b && !w && !lo) return 'it is out of the title race, so this one is about pride and spoiling someone else\'s season';
        return `a win would move its title odds to ${pctStr(w)} (from ${pctStr(b)}), while a loss would ${lo < b - 0.005 ? 'drop them to' : 'leave them at'} ${pctStr(lo)}`; };
      const cn = clinchNote(g);
      const mh = move(H, hW, aW), ma = move(A, aW, hW), outH = mh.startsWith('it is out'), outA = ma.startsWith('it is out');
      paras.push(outH && outA ? `What's at stake: neither team can reach the title game anymore, so this one is about pride and playing spoiler.`
        : `What's at stake: for ${H.name}, ${outH ? 'the title race is already over, but it can still play spoiler' : mh}. For ${A.name}, ${outA ? 'the title race is already over, but it can still play spoiler' : ma}.${cn ? ' ' + cn : ''}`);
    }
    const form = t => { const f = formOf(t), P = t === A ? PA : PH; if (!P.gp) return ''; const atsT = `${P.ats[0]}-${P.ats[1]}${P.ats[2] ? '-' + P.ats[2] : ''} against the spread`;
      return `${t.name} ${f == null ? 'comes in' : f >= 4 ? 'comes in hot' : f <= -4 ? 'comes in cold' : 'comes in steady'}${f == null ? '' : `, playing ${Math.abs(f).toFixed(1)} points per game ${f >= 0 ? 'better' : 'worse'} than expected over its last three`}. It's averaging ${(P.pf / P.gp).toFixed(1)} points while allowing ${(P.pa / P.gp).toFixed(1)}, and it's ${atsT} this season.`; };
    const fa = form(A), fh = form(H); if (fa || fh) paras.push([fa, fh].filter(Boolean).join(' '));
  }
  if (coachA !== 'CPU' && coachH !== 'CPU') {
    if (!meets.length) paras.push(`This ${done ? 'was' : 'is'} the first meeting ever between ${coachA} and ${coachH}.`);
    else {
      const lm = meetingWinner(meets[0]), wa = mw[coachA] || 0, wh = mw[coachH] || 0;
      const lead = wa === wh ? `The series is tied ${wa}-${wh}` : `${wa > wh ? coachA : coachH} leads the all-time series ${Math.max(wa, wh)}-${Math.min(wa, wh)}`;
      const tg = meets.filter(m => m.type === 'ccg').map(m => { const w = meetingWinner(m); return `the Season ${seasonNum(m.season)} title game, won by ${w.coach} ${w.ws}-${w.ls}`; });
      paras.push(`${coachA} and ${coachH} have met ${meets.length} time${meets.length === 1 ? '' : 's'}${done ? ' before this one' : ''}. ${lead}${tg.length ? `. Their meetings include ${tg.join(' and ')}` : ''}. Last time: Season ${seasonNum(meets[0].season)}${meets[0].type === 'ccg' ? ' title game' : `, Week ${meets[0].week}`}, ${possN(lm.coach)} ${team(lm.team).name} won ${lm.ws}-${lm.ls}.`);
    }
  }

  // ----- trends to watch -----
  const trends = [];
  [[A, PA], [H, PH]].forEach(([t, P]) => {
    if (P.ats[0] + P.ats[1] >= 3) trends.push(`${t.name} is <b>${P.ats[0]}-${P.ats[1]}${P.ats[2] ? '-' + P.ats[2] : ''}</b> against the spread this season.`);
    if (P.ou[0] + P.ou[1] >= 3 && Math.abs(P.ou[0] - P.ou[1]) >= 2) trends.push(`The ${P.ou[0] > P.ou[1] ? 'Over' : 'Under'} is <b>${Math.max(P.ou[0], P.ou[1])}-${Math.min(P.ou[0], P.ou[1])}</b> in ${t.name} games.`);
    if (P.dog[0] + P.dog[1] >= 2) trends.push(`${t.name} is <b>${P.dog[0]}-${P.dog[1]}</b> straight up as an underdog.`);
    const st = streak(recs[t.id]); if (/^[WL]\d+$/.test(st) && +st.slice(1) >= 3) trends.push(`${t.name} has ${st[0] === 'W' ? 'won' : 'lost'} <b>${st.slice(1)} straight</b>.`);
  });
  if (meets.length >= 2) { const wa = mw[coachA] || 0, wh = mw[coachH] || 0; trends.push(`${coachA} is <b>${wa}-${wh}</b> all-time against ${coachH}.`); }

  // ----- render -----
  const pr = currentPower(s), prOf = t => pr.find(x => x.id === t.id)?.rank;
  const sim = L.phase === PHASES.REG && s === L.season ? simulate(s, nowUpto()) : null;
  // dir: +1 higher is better, -1 lower is better, 0 no comparison. Green = edge, red = behind.
  const row = (label, fa, fh, va, vh, dir = 0) => {
    let ca = '', ch = '';
    if (dir && va != null && vh != null && isFinite(va) && isFinite(vh) && va !== vh) { const aBetter = (va - vh) * dir > 0; ca = aBetter ? 'tb' : 'tw'; ch = aBetter ? 'tw' : 'tb'; }
    const ck = '<span class="ck" aria-label="edge">✓</span>';
    return `<tr><td class="num ${ca}">${ca === 'tb' ? ck : ''}${fa}</td><th style="text-align:center">${label}</th><td class="${ch}">${fh}${ch === 'tb' ? ck : ''}</td></tr>`;
  };
  const wpct = r => r && r.w + r.l ? r.w / (r.w + r.l) : null, ap = a => a[0] + a[1] ? a[0] / (a[0] + a[1]) : null;
  const stv = r => { const x = streak(r); return /^[WL]\d+$/.test(x) ? (x[0] === 'W' ? 1 : -1) * +x.slice(1) : null; };
  const num = (P, k) => P.gp ? P[k] / P.gp : null, rkv = v => v || 999, nz = v => +v || null;
  const ppg = P => P.gp ? (P.pf / P.gp).toFixed(1) : '–', papg = P => P.gp ? (P.pa / P.gp).toFixed(1) : '–', rec3 = a => a[0] + a[1] + a[2] ? `${a[0]}-${a[1]}${a[2] ? '-' + a[2] : ''}` : '–';
  const side = (t, coach, scr, won) => `<div class="gp-team ${done && !won ? 'l' : ''}"><i class="sw big" style="background:${esc(teamColor(t))}"></i><div><div class="gp-name">${rk(t) ? `<span class="rk">#${rk(t)}</span>` : ''}<a href="#team/${esc(t.id)}">${esc(t.name)}</a></div>
    <div class="muted small">${rec(recs[t.id])}${coach && coach !== 'CPU' ? ` · <a href="#coach/${slug(coach)}">${esc(coach)}</a>` : ' · CPU'}</div></div>${done ? `<div class="gp-score">${g.forfeit ? (won ? 'FW' : 'FL') : scr}</div>` : ''}</div>`;
  const hw = +g.homeScore > +g.awayScore;
  const canBet = !done && s === L.season && g.week >= L.week && L.bettingOpen && L.phase !== PHASES.POST;
  return `<p><a href="#schedule/${g.week}">← Week ${g.week} schedule</a></p>
    <div class="card gp-head${isGotw ? ' gotw' : ''}">${isGotw ? '<span class="ribbon">★ Game of the Week</span>' : ''}
      <div class="muted small" style="text-transform:uppercase;letter-spacing:.8px;font-weight:800">Season ${seasonNum(s)} · ${g.type === 'ccg' ? 'League Championship' : g.type === 'bowl' ? 'Postseason' : 'Week ' + g.week}${done ? ' · Final' : ''}${gameTags(g) ? ' · ' + gameTags(g) : ''}</div>
      ${side(A, coachA, g.awayScore, !hw)}<div class="gp-at">${g.neutral ? 'vs' : '@'}</div>${side(H, coachH, g.homeScore, hw)}
      ${l && !g.forfeit ? `<div class="gp-odds"><div><span>Spread</span><b>${l.spread === 0 ? 'PK' : esc(fav.abbr || fav.name) + ' ' + fmtLine(-Math.abs(l.spread))}</b></div><div><span>Total</span><b>O/U ${l.total}</b></div>
        <div><span>Moneyline</span><b>${esc(A.abbr)} ${fmtOdds(l.mlAway)}</b><b>${esc(H.abbr)} ${fmtOdds(l.mlHome)}</b></div></div>${probBar(g, l, done)}` : ''}
      ${canBet ? `<button class="gold" data-betgame="${g.week}" style="margin-top:12px">Bet this game${isGotw ? ' · +10% boost' : ''} →</button>` : ''}</div>
    ${kickoffCard(g)}
    ${l && !g.forfeit ? winChart(g, A, H) : ''}
    <div class="card gp-story"><h2 style="text-transform:none;font-size:22px">${esc(title)}</h2>${paras.map(t => `<p>${esc(t)}</p>`).join('')}</div>
    ${trends.length ? `<div class="card"><h3 style="margin-top:0">Trends to watch</h3><ul class="clean gp-trends">${trends.slice(0, 6).map(t => `<li>${t}</li>`).join('')}</ul></div>` : ''}
    <div class="card"><h3 style="margin-top:0">Tale of the tape</h3><p class="muted small" style="margin-top:0"><span class="tb">✓ Green</span> = the edge in that category, <span class="tw">red</span> = behind.</p><div class="tablewrap"><table class="gp-tape">
      <tr><td class="num"><b>${esc(A.abbr || A.name)}</b></td><th></th><td><b>${esc(H.abbr || H.name)}</b></td></tr>
      ${row('Record', rec(recs[A.id]), rec(recs[H.id]), wpct(recs[A.id]), wpct(recs[H.id]), 1)}${row('Points / game', ppg(PA), ppg(PH), num(PA, 'pf'), num(PH, 'pf'), 1)}${row('Allowed / game', papg(PA), papg(PH), num(PA, 'pa'), num(PH, 'pa'), -1)}
      ${row('Against the spread', rec3(PA.ats), rec3(PH.ats), ap(PA.ats), ap(PH.ats), 1)}${row('Over-Under', rec3(PA.ou), rec3(PH.ou))}${row('Streak', streak(recs[A.id]), streak(recs[H.id]), stv(recs[A.id]), stv(recs[H.id]), 1)}
      ${row('Top 25', rk(A) ? '#' + rk(A) : '–', rk(H) ? '#' + rk(H) : '–', rk(A) || rk(H) ? rkv(rk(A)) : null, rkv(rk(H)), -1)}${row('Power rank', prOf(A) ? '#' + prOf(A) : '–', prOf(H) ? '#' + prOf(H) : '–', prOf(A), prOf(H), -1)}
      ${row('Overall', A.ovr || '–', H.ovr || '–', nz(A.ovr), nz(H.ovr), 1)}${row('Offense', A.off || '–', H.off || '–', nz(A.off), nz(H.off), 1)}${row('Defense', A.def || '–', H.def || '–', nz(A.def), nz(H.def), 1)}
      ${sim && sim[A.id] && sim[H.id] ? row('Title odds', pctStr(sim[A.id].titlePct), pctStr(sim[H.id].titlePct), sim[A.id].titlePct, sim[H.id].titlePct, 1) : ''}
    </table></div></div>
    ${coachA !== 'CPU' && coachH !== 'CPU' ? `<div class="card"><h3 style="margin-top:0">Past meetings: ${esc(coachA)} vs. ${esc(coachH)}</h3>${meets.length ? `<p class="muted small" style="margin-top:0">${mw[coachA] || 0}-${mw[coachH] || 0} all-time${done ? ' before this game' : ''}. Coaches' records follow them from team to team.</p><div class="tablewrap"><table>
      <tr><th>When</th><th>Result</th></tr>${meets.map(m => { const w = meetingWinner(m); return `<tr class="clickable" data-game="${esc(m.id)}"><td class="muted">S${seasonNum(m.season)} · ${m.type === 'ccg' ? '<b class="win">Title game</b>' : 'Wk ' + m.week}</td><td class="wrap"><b>${esc(w.coach)}</b> (${esc(team(w.team).name)}) ${m.forfeit ? 'by forfeit over' : `${w.ws}-${w.ls} over`} ${esc(w.lcoach)} (${esc(team(w.lteam).name)})</td></tr>`; }).join('')}</table></div>` : `<p class="muted">First meeting ever between these two coaches.</p>`}</div>` : ''}`;
};

/* ---------- shell ---------- */
function header() {
  const L = D.league;
  $('#bSeason').textContent = seasonNum();
  $('#bSeasonLbl').textContent = 'Season · ' + L.season;
  const wl = weekLabel();
  $('#bWeek').textContent = L.phase === PHASES.REG ? L.week : wl;
  $('#bWeekLbl').textContent = L.phase === PHASES.REG ? 'Current Week' : 'Phase';
  const adv = projectedAdvance();
  $('#bAdv').hidden = !adv;
  if (adv) { $('#bAdvT').textContent = new Date(adv).setHours(23, 59, 59, 999) < Date.now() ? 'Any day now' : fmtAdvance(adv); $('#bAdv').title = `Projected: about 3 days after the last advance${L.advExt ? ` (+${L.advExt}h extension this week)` : ''}. Can change if a coach needs more time.`; }
  $('#sub').textContent = `College Football 27 Online Dynasty · ${L.conference} · ${L.phase}${DEMO ? ' · DEMO DATA' : ''}`;
  const p = auth.profile;
  $('#acct').innerHTML = auth.user ? acctHtml(p) : '<a class="btn" href="#account">Coach Login</a>';
  $('#footAdmin').innerHTML = isCommish() ? ' · <a href="admin.html">Commissioner Tools</a>' : '';
}
// Header greeting: time of day on the viewer's device, their balance and next game.
function greeting() { const h = new Date().getHours(); return h >= 4 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening'; }
function nextGameOf(tid) {
  const L = D.league;
  return D.games.filter(g => g.season === L.season && !played(g) && (g.home === tid || g.away === tid) && g.week >= L.week).sort((a, b) => a.week - b.week)[0] || null;
}
function acctHtml(p) {
  const T = p?.teamId ? team(p.teamId) : null, name = (T && T.coach) || p?.name || '';
  const hello = `${greeting()}${name ? `, <b>Coach ${esc(name)}</b>` : ''}`;
  const bits = [];
  if (T) bits.push(`<span class="bal"><b>${bankroll(p.id).balance.toLocaleString()}</b> Crackers</span>`);
  const g = T && nextGameOf(T.id);
  if (g) {
    const home = g.home === T.id, opp = team(home ? g.away : g.home);
    const wk = g.type === 'ccg' ? 'Title game' : g.type === 'bowl' ? 'Bowl' : `Week ${g.week}`;
    const ko = kickoffOf(g);
    bits.push(`<a class="nextg" href="#game/${esc(g.id)}">Next: ${wk} ${g.neutral ? 'vs' : home ? 'vs' : '@'} ${esc(opp.abbr || opp.name)}${ko ? ` · 🕗 ${esc(fmtKick(ko, true))}` : ''} ›</a>`);
  }
  const inv = p ? invitesFor(p.id) : [];
  if (inv.length) bits.unshift(`<a class="nextg kinvpill" href="#game/${esc(inv[0].gameId)}">📅 ${inv.length === 1 ? 'Kickoff invite' : inv.length + ' kickoff invites'} ›</a>`);
  return `<div class="greet"><div class="hello">${hello}</div>${bits.length ? `<div class="gsub">${bits.join('')}</div>` : ''}</div>
    <div class="acctbtns">${isCommish() ? '<a class="btn gold" href="admin.html">Commissioner</a>' : ''}<a class="btn ghost" href="#account">Account</a></div>`;
}
function route() {
  const [page, arg] = (location.hash.slice(1) || 'home').split('/');
  const active = page === 'team' ? 'teams' : page === 'coach' ? 'history' : page === 'game' ? 'schedule' : page;
  $('#nav').innerHTML = NAV.map(([k, label]) => `<a href="#${k}" class="${k === active ? 'on' : ''}">${label}</a>`).join('');
  header();
  try { $('#view').innerHTML = (PAGES[page] || PAGES.home)(decodeURIComponent(arg || '')); parlayBar(); }
  catch (e) { console.error(e); $('#view').innerHTML = `<div class="card err">Something went wrong rendering this page: ${esc(e.message)}</div>`; }
  // New page: start at the top, or at the row a storyline pointed to.
  if (route.last !== location.hash) {
    const first = route.last == null; route.last = location.hash;
    const f = page === 'odds' && arg && document.getElementById('odds-' + arg);
    if (f) requestAnimationFrame(() => f.scrollIntoView({ block: 'center' }));
    else if (!first) window.scrollTo(0, 0);
  }
}
async function reload() { await loadAll(); refreshProfile(); if (D.league.awards?.open && auth.user) await loadBallots(false); route(); }

document.addEventListener('click', async e => {
  const bg = e.target.closest('[data-betgame]');
  if (bg) { UI.betWeek = +bg.dataset.betgame; location.hash = '#betting'; return; }
  const gc = e.target.closest('[data-game]');
  if (gc && !e.target.closest('a,button,input,select,label')) { location.hash = '#game/' + gc.dataset.game; window.scrollTo(0, 0); return; }
  const lx = e.target.closest('[data-livex]');
  if (lx) { try { localStorage.setItem('oecLiveDismissed', lx.dataset.livex); } catch (err) { /* ignore */ } showLive(); return; }
  const t = e.target.closest('[data-sort],[data-metric],[data-trend],[data-pr],[data-prsort],[data-bet],[data-fut],[data-wins],[data-mode],[data-slip],[data-popular],[data-res],[data-act],[data-close],[data-stake],[data-acct],[data-cancel],[data-cashout],[data-kinv],[data-kacc],[data-kdec],[data-kcan]');
  if (!t) return;
  const page = (location.hash.slice(1) || 'home').split('/')[0];
  if (t.dataset.sort) {
    const st = t.dataset.st && UI[t.dataset.st] ? UI[t.dataset.st] : page === 'rankings' ? UI.prSort : page === 'odds' ? UI.oddsSort : UI.stSort;
    if (st.key === t.dataset.sort) st.dir *= -1; else { st.key = t.dataset.sort; st.dir = ['place', 'rank', 'name', 'coach', 'bet', 'status'].includes(st.key) ? 1 : -1; }
    route();
  } else if (t.dataset.metric) { UI.metric = t.dataset.metric; route(); }
  else if (t.dataset.trend) { UI.trendTeam = t.dataset.trend; route(); }
  else if (t.dataset.pr) { UI.prUsers = t.dataset.pr === 'users'; route(); }
  else if (t.dataset.prsort) { UI.prSort = { key: t.dataset.prsort, dir: t.dataset.prsort === 'rank' ? 1 : -1 }; route(); }
  else if (t.dataset.acct) { UI.acct = t.dataset.acct; UI.msg = ''; route(); }
  else if (t.dataset.fut) { if (UI.mode === 'parlay') toggleLeg('', 'future', t.dataset.fut); else showFutureSlip(t.dataset.fut); }
  else if (t.dataset.bet) { const [g, m, p] = t.dataset.bet.split('|'); if (UI.mode === 'parlay') toggleLeg(g, m, p); else showSlip(g, m, p); }
  else if (t.dataset.wins) { const [tid, pk] = t.dataset.wins.split('|'); if (UI.mode === 'parlay') toggleLeg('', 'wins', pk, tid); else showWinsSlip(tid, pk); }
  else if (t.dataset.popular) betPopular();
  else if (t.dataset.res) { UI.results.i = Math.max(0, Math.min(UI.results.wins.length - 1, UI.results.i + +t.dataset.res)); renderResult(); }
  else if (t.dataset.mode) { UI.mode = t.dataset.mode; route(); }
  else if (t.dataset.stake) { $('#stake').value = t.dataset.stake; updToWin(); }
  else if (t.dataset.close && e.target === t) $('#modal').innerHTML = '';
  else if (t.dataset.cashout) {
    const w = D.wagers.find(x => x.id === t.dataset.cashout), co = cashOutValue(w);
    if (!co) { alert('This parlay can no longer be cashed out.'); return; }
    if (!confirm(`Cash out now for ${co.total.toLocaleString()} Crackers (+${co.profit.toLocaleString()})?\n\nIf every leg hits, it would pay ${(w.stake + winProfit(w)).toLocaleString()}. Cashing out can't be undone.`)) return;
    try { const now = Date.now(); await put('wagers', w.id, { status: 'cashed', payout: co.profit, cashedAt: now, settledAt: now }); await reload(); showSlipImage(D.wagers.find(x => x.id === w.id)); }
    catch (err) { alert(friendlyError(err)); }
  }
  else if (t.dataset.cancel) { if (confirm('Cancel this wager and refund the stake?')) { try { await del('wagers', t.dataset.cancel); await reload(); } catch (err) { alert(err.message); } } }
  else if (t.dataset.kinv || t.dataset.kacc || t.dataset.kdec || t.dataset.kcan) kickAction(t);
  else if (t.dataset.act === 'place') placeBet();
  else if (t.dataset.act === 'saveSlip') saveSlip();
  else if (t.dataset.slip) showSlipImage(D.wagers.find(x => x.id === t.dataset.slip));
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
    await watchAuth(async () => { if (D.league.awards?.open && auth.user) await loadBallots(false); try { await ensureFutures(); } catch (e) { console.warn('futures post failed', e); } route(); showResultsPopup(); });
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="card"><b>Couldn't load league data.</b><p class="muted">${esc(e.message)}. If you opened index.html straight from your computer, publish it with GitHub Pages (or run a local server).</p></div>`;
  }
})();
