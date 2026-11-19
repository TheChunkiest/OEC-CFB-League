import {
  $, $$, esc, D, DEMO, PHASES, START_CREDITS, loadAll, put, del, batch, newId, loadBallots, auth, isCommish, myTeam, watchAuth, login, signup, logout, PUSH_PREFS, pushDefaults, pushLocal, pushSupported, pushEnable, pushPrefs, pushDisable,
  resetPassword, refreshProfile, team, teamColor, isUserTeam, leagueTeams, userTeams, played, seasonGames, coachOf, slug, fmtOdds, fmtLine,
  pctStr, weekLabel, chip, lineOf, records, streak, rec, orderGroup, raceSim, divisions, simulate, oddsHistory, currentPower, bankroll, wagerLabel,
  gotwTally, coachStats, onLiveChange, vary, mascotOf, cashOutValue, CASHOUT_SHARE, coachSeasons, coachStops, awardGame, seasonPlaces, ordinal, kickoffOf, kickoffInvite, canSchedule, pendingInvites, invitesFor, fmtKick, KICK_SLOTS, projectedAdvance, fmtAdvance, wkName, gWeek, champOpen, titleSet, DIAG, storylines, seasonStorylines, RELIEF, seasonNum, futuresBoard, futuresOpen, futuresPosted, ensureFutures, friendlyError, refreshLive, juiceOf, nowUpto, gotwGameId, boostFor, winProfit, GOTW_BOOST, MAX_LEGS, parlayOdds, parlayProfit, winsBoard, winsPosted, legsHtml, bettors, isSpectator, titleOut, CCG_BOOST, boostName, divOf, oneConference, GAME_MARKETS, lineVal, AI, aiRecap, loadAI, teamPlayers, teamScouting, playerName, fmtTime, profit, refreshWagers, selKey, rankName, rankOf, ownGame, ownLeg, OWN_BET_MSG, freshGames, ratings, powerRankings, lastPlayedWeek, clinchScenarios, winHistory, legLabel
, playbookOf, pbSeason, pbText
, AWARD_DEFS, awardGames, awardGameLabel, awardCoaches
} from './core.js?v=95';
import { lookupStadium } from './programs.js?v=3';

const DEFAULT_RULES = ["Cloud dynasty with active rosters and cross-play", "All-American difficulty with custom sliders", "10-minute quarters with 17-second accelerated clock", "League advances every 3 days; 24 hours can be added for user games if needed", "League commissioner is Chunky and league admin is Clay", "All communication happens in the league Discord"];
const NAV = [['home', 'Home'], ['standings', 'Standings'], ['schedule', 'Schedule'], ['betting', 'Betting'], ['odds', 'Odds'],
  ['rankings', 'Power Rankings'], ['teams', 'Teams'], ['vote', 'Vote'], ['history', 'History'], ['rules', 'Rules']];
const UI = { stSort: { key: 'place', dir: 1 }, prSort: { key: 'rank', dir: 1 }, prUsers: false, oddsSort: { key: 'titlePct', dir: -1 }, lbSort: { key: 'place', dir: 1 }, wkSort: { key: 'ts', dir: -1 }, metric: 'titlePct', acct: 'login', slip: null, msg: '', betWeek: null, mode: 'single', legs: [] };

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
  const hd = divOf(h, g.season), ad = divOf(a, g.season);
  if ((g.type || 'reg') === 'reg' && hd && hd === ad && h.conf === conf && a.conf === conf) out.push(`<span class="h2h divtag" title="Both teams are in the ${esc(hd)} division">${esc(hd.toUpperCase())}</span>`);
  return out.join('');
}
// Week order: Game of the Week first, then games still to play (earliest kickoff first), then finals.
function weekOrder(games, gotwId) {
  // Game of the Week first, then unplayed games by kickoff time (unscheduled last) and then closest spread, then finals.
  const rank = g => g.id === gotwId ? 0 : played(g) ? 2 : 1;
  const kick = g => kickoffOf(g) || 9e15, spr = g => { const l = lineOf(g); return l && l.spread != null ? Math.abs(l.spread) : 99; };
  return games.map((g, i) => ({ g, i })).sort((x, y) => rank(x.g) - rank(y.g)
    || (rank(x.g) === 1 ? (kick(x.g) - kick(y.g)) || (spr(x.g) - spr(y.g)) : 0) || x.i - y.i).map(x => x.g);
}
// YouTube broadcasts linked to games (videos.json from the workflow; commissioner overrides on the game win).
let VIDS = null;
async function loadVideos() { try { const r = await fetch('videos.json?t=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' }); if (r.ok) VIDS = await r.json(); } catch (e) { } }
const vidInfo = id => (VIDS?.videos || []).find(v => v.id === id) || { id, t: '', d: 0 };
// Every broadcast for a game, oldest first (several when a stream had to restart). The commissioner's
// choice on the game (a list, or 'none') wins over the automatic match.
const videosOf = g => {
  if (!g || g.video === 'none') return [];
  const raw = g.video || VIDS?.links?.[g.id] || [];
  return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(vidInfo).sort((a, b) => a.d - b.d);
};
const videoOf = g => videosOf(g)[0]?.id || null;
// Key moments the Game moments workflow pulled out of each broadcast with Gemini (moments.json, loaded the first
// time a finished game is opened). The commissioner can hide a wrong one or ask for a redo (saved on the league doc).
let momsLoading = false;
function loadMoments() {
  if (AI.moms || momsLoading) return; momsLoading = true;
  loadAI().then(() => { if (/^#(game\/|team\/|home|$)/.test(location.hash || '#home')) route(); });
}
// What the AI saw in the broadcast, under the recap: the standout players, and the commissioner's controls.
function aiExtras(g, A, H) {
  const r = aiRecap(g), rec = AI.moms?.games?.[g.id], commish = isCommish(), hidden = (D.league.momHide || {})[g.id] || [];
  const redo = (D.league.momRedo || {})[g.id], pending = redo && (!rec || redo > rec.at * 1000);
  const stars = r?.pl?.length ? `<h4 class="aistars-h">Standouts</h4><ul class="aistars">${r.pl.slice(0, 4).map(p => { const t = p.s === 'home' ? H : A;
    return `<li><i class="sw" style="background:${esc(teamColor(t))}"></i><div><a class="plink" href="#team/${esc(t.id)}"><b>${esc(shortName(playerName(t.id, g.season, p.n)))}</b></a> <span class="muted small">${esc(t.abbr || t.name)}${p.pos && p.pos !== '?' ? ' · ' + esc(p.pos) : ''}</span>${p.l ? `<div class="muted small">${esc(p.l)}</div>` : ''}</div></li>`; }).join('')}</ul>` : '';
  const ctl = commish && rec ? `<p class="muted small" style="margin:8px 0 0"><a href="javascript:void 0" data-act="momRedo" data-gid="${esc(g.id)}">${pending ? 'Redo requested' : 'Redo with AI'}</a>${rec.r ? ` · <a href="javascript:void 0" data-momhide="${esc(g.id)}|recap">${hidden.includes('recap') ? 'Show AI recap' : 'Hide AI recap'}</a>` : ''}</p>` : '';
  return stars + ctl;
}
// Game preview: players to watch, from the AI's read of each team's broadcasts. A player gets called out
// harder when his side of the ball lines up with something the other team has struggled with lately.
const UNIT = { QB: 'pass', WR: 'pass', TE: 'pass', RB: 'run', FB: 'run', DL: 'rush', DE: 'rush', DT: 'rush', LB: 'rush', CB: 'cover', S: 'cover', K: 'kick', P: 'kick' };
const WEAK = { pass: /pass|secondary|coverage|deep|air|receiver|corner|safet/i, run: /run|rush|ground|tackl|gap|between the tackles/i,
  rush: /protect|sack|pressure|o-?line|offensive line|blocking|hold/i, cover: /interception|turnover|pick|throw|forc|decision/i, kick: /kick|field goal|special teams|punt/i };
const WEAKTXT = { pass: 'against the pass', run: 'against the run', rush: 'in pass protection', cover: 'with turnovers', kick: 'on special teams' };
function playersToWatch(A, H, s) {
  if (!AI.moms) { loadMoments(); return ''; }
  const one = (t, o) => {
    const p = teamPlayers(t.id, s).filter(x => x.grade && x.grade >= 6.5)[0]; if (!p) return '';
    const weak = teamScouting(o.id, s).map(x => x.bad || '').join(' '), u = UNIT[p.pos], hit = u && WEAK[u]?.test(weak);
    const last = p.lines[0]?.l ? ` (last time out: ${p.lines[0].l.replace(/\.$/, '')})` : '';
    const who = `${p.pos ? p.pos + ' ' : ''}${p.name}`;
    return hit ? `Keep an eye on ${who} of ${t.name}${last}: ${o.name} has struggled ${WEAKTXT[u]} lately, and that's his side of the ball.`
      : `On the other side, ${who} has been the standout for ${t.name}${p.games > 1 ? ` across ${p.games} broadcast games` : ''}${last}.`;
  };
  const out = [one(A, H), one(H, A)].filter(Boolean);
  if (out[0]) out[0] = out[0].replace(/^On the other side, /, '');
  return out.length ? 'Players to watch: ' + out.join(' ') : '';
}
// "Taylor Coleman" -> "T. Coleman"; a last name alone stays as is. (Recaps and previews keep full names.)
const shortName = n => { const w = String(n).trim().split(/\s+/); return w.length < 2 ? w[0] : `${w[0][0].toUpperCase()}. ${w.slice(1).join(' ')}`; };
// Team page: the players the AI has seen this season, and what's been working / where the team struggles.
function scoutCard(t, s = D.league.season) {
  if (!AI.moms) { loadMoments(); return ''; }
  const ps = teamPlayers(t.id, s).slice(0, 6), sc = teamScouting(t.id, s);
  if (!ps.length && !sc.length) return '';
  return `<div class="card"><h3 style="margin-top:0">Players to know</h3>
    ${ps.length ? `<div class="tablewrap"><table><tr><th>Player</th><th class="num">Games</th><th class="num">Grade</th></tr>${ps.map(p => `<tr><td class="wrap"><b>${esc(shortName(p.name))}</b>${isCommish() ? ` <a href="javascript:void 0" class="pedit" data-pname="${esc(t.id)}|${esc(p.name)}" title="Fix this name">✎</a>` : ''}${p.pos ? ` <span class="muted small">${esc(p.pos)}</span>` : ''}${p.lines[0] ? `<div class="muted small">Wk ${p.lines[0].w}: ${esc(p.lines[0].l)}</div>` : ''}</td><td class="num">${p.games}</td><td class="num">${p.grade ? p.grade.toFixed(1) : '–'}</td></tr>`).join('')}</table></div>` : ''}
    ${sc.length ? `<h4 style="margin:14px 0 6px">Scouting report</h4><ul class="clean small">${sc.map(x => `<li><span class="muted">Wk ${x.g.week}:</span> ${x.good ? `<span class="win">+</span> ${esc(x.good)}` : ''}${x.good && x.bad ? ' ' : ''}${x.bad ? `<span class="loss">−</span> ${esc(x.bad)}` : ''}</li>`).join('')}</ul>` : ''}
    <p class="muted small" style="margin:10px 0 0">From the AI's read of this season's broadcasts. Grades are 1-10 per game, averaged.</p></div>`;
}
// Broadcasts the commissioner filed as "User vs CPU" (games against teams outside the league), on the team's page.
// Each one belongs to a team AND a season: the season saved when it was filed, else "S2" / "Season 2" in the title,
// else the season whose league broadcasts are closest in date. A past-season page shows that season's; the current
// page shows every season the current coach has run this team, so a coach's CPU broadcasts stay with the team he
// played them for and start fresh at a new job.
let _vr = null, _vrKey = '';
function seasonVidRanges() {
  const key = (VIDS?.videos || []).length + '|' + D.games.length; if (_vr && key === _vrKey) return _vr;
  _vrKey = key; _vr = {};
  D.games.forEach(g => videosOf(g).forEach(v => { if (!v.d) return; const r = _vr[g.season] || (_vr[g.season] = [v.d, v.d]); r[0] = Math.min(r[0], v.d); r[1] = Math.max(r[1], v.d); }));
  return _vr;
}
function cpuVidSeason(x, v) {
  const m = String(v.t || '').match(/\bS(?:eason)?\s*(\d{1,2})\b/i); if (m) return (D.league.firstSeason || 2026) + +m[1] - 1;
  if (x.s) return +x.s;
  if (!v.d) return null;
  let best = null, bd = Infinity;
  Object.entries(seasonVidRanges()).forEach(([se, r]) => { const dist = v.d < r[0] ? r[0] - v.d : v.d > r[1] ? v.d - r[1] : 0; if (dist < bd) { bd = dist; best = +se; } });
  return best;
}
// Who ran a team in a season (most games coached), by the coach recorded on its games.
function teamCoachIn(tid, s) {
  const c = {}; D.games.filter(g => g.season === s && (g.home === tid || g.away === tid)).forEach(g => { const k = coachOf(g, g.home === tid ? 'home' : 'away'); c[k] = (c[k] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
function cpuBroadcasts(tid, s = D.league.season) {
  const cur = D.league.season, list = Array.isArray(D.league.vidCpu) ? D.league.vidCpu : [];
  const coachNow = s === cur ? (teamCoachIn(tid, cur) || team(tid).coach || '') : '';
  const keep = se => s !== cur ? se === s
    : se == null || se === cur || (coachNow && coachNow !== 'CPU' && teamCoachIn(tid, se).toLowerCase() === coachNow.toLowerCase());
  const vs = list.filter(x => (x.t || []).includes(tid)).map(x => { const v = vidInfo(x.v); return { ...v, se: cpuVidSeason(x, v) }; }).filter(v => keep(v.se)).sort((a, b) => b.d - a.d);
  if (!vs.length) return '';
  const short = t => String(t || 'OEC on YouTube').replace(/^OEC\s+CFB\s+League\s*/i, '').trim();   // the channel name is on every title
  const label = v => { const t = short(v.t); return v.se && s === cur && !/\bS(?:eason)?\s*\d/i.test(t) ? `S${seasonNum(v.se)} · ${t}` : t; };
  return `<div class="card"><h3 style="margin-top:0">Broadcasts vs CPU teams</h3><div class="cpulinks">${vs.slice(0, 20).map(v => `<a href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">▶ ${esc(label(v))}</a>`).join('')}</div></div>`;
}
// YouTube-style red play button (used instead of video thumbnails, which vary too much in look)
const YT_BTN = '<svg class="ytbtn" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="#fff"/></svg>';
// The league title game gets the Game of the Week treatment: gold border and its own label.
const champRibbon = () => `🏆 ${esc(D.league.conference ? D.league.conference + ' ' : '')}Championship`;
function broadcastCard(g) {
  const vs = videosOf(g); if (!vs.length) return '';
  const one = vs.length === 1, v = vs[0];
  const inner = `${YT_BTN}<span><b>Watch the broadcast</b>${one ? '' : `<span class="muted small">${vs.length} parts</span>`}</span>`;
  return one ? `<a class="card vidcard" href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">${inner}</a>`
    : `<a class="card vidcard" href="#" data-vidlist="${esc(g.id)}">${inner}</a>`;
}
function showVideoList(gid) {
  const g = D.games.find(x => x.id === gid), vs = videosOf(g); if (!vs.length) return;
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Watch the broadcast</h2>
    <p class="muted small" style="margin-top:0">${esc(team(g.away).name)} ${g.neutral ? 'vs' : '@'} ${esc(team(g.home).name)} was streamed in ${vs.length} parts.</p>
    ${vs.map((v, i) => `<a class="vidpart" href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">${YT_BTN}<span><b>Part ${i + 1}</b>${v.d ? `<span class="muted small">${new Date(v.d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>` : ''}</span></a>`).join('')}
    <div class="row" style="margin-top:12px"><button class="ghost" data-close="1">Close</button></div></div></div>`;
}
// Home page only: the featured game (Game of the Week or the title game) as a big preview card, like the top of a game page.
function featureCard(g, { ribbon, note = '' } = {}) {
  const L = D.league, s = g.season, A = team(g.away), H = team(g.home), done = played(g), l = lineOf(g);
  const recs = records(s, g.week), rk = t => rankOf(t.id, s, g.week);   // record and rank both as of kickoff
  const coach = side => done ? coachOf(g, side) : isUserTeam(side === 'home' ? H : A) ? (side === 'home' ? H : A).coach : 'CPU';
  const hw = +g.homeScore > +g.awayScore;
  const sideHtml = (t, side, won) => `<div class="gp-team ${done && !won ? 'l' : ''}"><i class="sw big" style="background:${esc(teamColor(t))}"></i><div><div class="gp-name">${rk(t) ? `<span class="rk">#${rk(t)}</span>` : ''}${esc(t.name)}</div>
    <div class="muted small">${rec(recs[t.id])} · ${esc(coach(side))}</div></div>${done ? `<div class="gp-score">${g.forfeit ? (won ? 'FW' : 'FL') : g[side + 'Score']}</div>` : ''}</div>`;
  const ko = kickoffOf(g);
  return `<div class="card gp-head gotw feature" data-game="${esc(g.id)}"><span class="ribbon">${ribbon}</span>
    ${gameTags(g) ? `<div class="feat-tags">${gameTags(g)}</div>` : ''}
    <div class="gp-vs">${sideHtml(A, 'away', !hw)}<div class="gp-at">${g.neutral ? 'vs' : '@'}</div>${sideHtml(H, 'home', hw)}</div>
    ${ko ? `<div class="feat-meta"><span>🕗 <b>${esc(fmtKick(ko))}</b></span></div>` : ''}
    ${l && !g.forfeit ? probBar(g, l, done) : ''}
    ${note ? `<div class="meta" style="text-align:center;margin-top:8px">${note}</div>` : ''}
    <div class="feat-act"><a class="btn ghost" href="#game/${esc(g.id)}">${done ? 'Recap' : 'Preview'} →</a></div></div>`;
}
function gameCard(g, opts = {}) {
  const h = team(g.home), a = team(g.away), done = played(g);
  const hw = done && +g.homeScore > +g.awayScore, aw = done && !hw;
  const tags = [];
  const gt = gameTags(g); if (gt) tags.push(gt);
  // (the title game is marked by its gold ribbon instead of a tag)
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
  const status = `<b class="gstat">${done ? 'Final' : esc(gWeek(g))}</b>${done && videoOf(g) ? ' · <span class="vidtag">▶ Broadcast</span>' : ''}`;
  // Finished games show who actually coached them (saved on the game); upcoming ones show today's coaches.
  const ca = done ? coachOf(g, 'away') : isUserTeam(a) ? a.coach : 'CPU', ch = done ? coachOf(g, 'home') : isUserTeam(h) ? h.coach : 'CPU';
  const who = ca !== 'CPU' || ch !== 'CPU' ? ` · ${esc(ca)} ${g.neutral ? 'vs' : '@'} ${esc(ch)}` : '';
  const champ = g.type === 'ccg';
  return `<div class="card game clickable${opts.gotw || champ ? ' gotw' : ''}" data-game="${esc(g.id)}">${champ ? `<span class="ribbon">${champRibbon()}</span>` : opts.gotw ? '<span class="ribbon">★ Game of the Week</span>' : ''}<span class="go" aria-hidden="true">›</span><div class="teams">
      <div class="matchup"><span class="mt ${done ? (aw ? 'w' : 'l') : ''}">${chip(a.id, { season: g.season, week: g.week, href: '#game/' + g.id })}${sc('away', aw)}</span><span class="at">${g.neutral ? 'vs' : '@'}</span><span class="mt ${done ? (hw ? 'w' : 'l') : ''}">${chip(h.id, { season: g.season, week: g.week, href: '#game/' + g.id })}${sc('home', hw)}</span>${tags.join('')}</div>
      <div class="meta">${status}${who}${!done && kickoffOf(g) ? ` · ${esc(fmtKick(kickoffOf(g), true))}` : ''}</div>
      ${done || g.forfeit ? '' : probBar(g, l, done)}${!done && odds ? `<div class="meta">${odds}</div>` : ''}${opts.extra || ''}</div></div>`;
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
  const prize = r.k === 1 && r.div ? `the ${esc(r.div)} title` : 'a spot in the title game';
  if (r.skip) return `<div class="race"><h4>Race for ${prize}</h4><p class="muted small" style="margin:0">Clinching scenarios show up once the race gets down to the last few weeks.</p></div>`;
  const byId = Object.fromEntries(r.teams.map(t => [t.id, t])), rows = order.map(id => byId[id]).filter(Boolean);
  const nm = id => esc(team(id).name), list = ids => ids.length <= 1 ? ids.join('') : ids.slice(0, -1).join(', ') + ' and ' + ids[ids.length - 1];
  const wk = r.now.length ? `Week ${Math.max(...r.now.map(g => g.week))}` : 'this week';
  const clinched = rows.filter(t => t.status === 'clinched'), out = rows.filter(t => t.status === 'eliminated');
  const control = rows.filter(t => t.status === 'alive' && t.destiny), help = rows.filter(t => t.status === 'alive' && !t.destiny);
  // Summary sentence for the whole race.
  const sum = [];
  if (clinched.length) sum.push(`<b>${list(clinched.map(t => nm(t.id)))}</b> ${clinched.length > 1 ? 'have' : 'has'} clinched.`);
  if (control.length) sum.push(`<b>${list(control.map(t => nm(t.id)))}</b> ${control.length > 1 ? 'control their own destiny' : 'controls its own destiny'}: win out and ${control.length > 1 ? "they're" : "it's"} in.`);
  if (help.length) sum.push(`${list(help.map(t => nm(t.id)))} ${help.length > 1 ? 'need' : 'needs'} help.`);
  if (out.length) sum.push(`${list(out.map(t => nm(t.id)))} ${out.length > 1 ? 'are' : 'is'} out.`);
  // One result, from this team's point of view: "they beat X", "they lose to X" or "X beats Y".
  const res = (x, me) => { const w = x.homeWon ? x.g.home : x.g.away, l = x.homeWon ? x.g.away : x.g.home;
    return w === me ? `they beat ${nm(l)}` : l === me ? `they lose to ${nm(w)}` : `${nm(w)} beats ${nm(l)}`; };
  const scen = (sc, me) => sc.map(x => res(x, me)).join(' <b>and</b> ');
  const block = (label, cls, list2, me) => !list2.length ? '' : list2.length === 1
    ? `<div class="rcase ${cls}"><span class="rlab">${label}</span> ${scen(list2[0], me)}.</div>`
    : `<div class="rcase ${cls}"><span class="rlab">${label} any of these happen:</span><ul>${list2.slice(0, 5).map(sc => `<li>${scen(sc, me)}</li>`).join('')}</ul></div>`;
  const pill = t => t.status === 'clinched' ? '<span class="rs ok">✓ Clinched</span>' : t.status === 'eliminated' ? '<span class="rs out">Out</span>' : t.destiny ? '<span class="rs gold">In control</span>' : '<span class="rs">Needs help</span>';
  const card = t => {
    if (t.status !== 'alive') return '';
    const body = block(`✓ Clinches in ${wk} if`, 'good', t.clinch, t.id) + block(`✕ Eliminated in ${wk} if`, 'bad', t.elim, t.id);
    return `<li><div class="rh">${chip(t.id)}${pill(t)}</div>${body || `<div class="muted small">Nothing can be decided for them in ${wk}.</div>`}</li>`;
  };
  return `<div class="race"><h4>Race for ${prize}</h4><p class="rsum">${sum.join(' ')}</p>
    <div class="muted small" style="margin:10px 0 2px;font-weight:800;letter-spacing:.6px;text-transform:uppercase">What can happen in ${wk}</div>
    <ul class="racelist">${rows.map(card).join('')}</ul></div>`;
}
// ---- Division Race (Standings page): every team's path, plus a what-if picker for the remaining games ----
let racePicks = {}; try { racePicks = JSON.parse(sessionStorage.getItem('oecRace') || '{}'); } catch (e) { }
const saveRacePicks = () => { try { sessionStorage.setItem('oecRace', JSON.stringify(racePicks)); } catch (e) { } };
function raceSection() {
  const s = S(); if (s !== D.league.season || D.league.phase !== PHASES.REG) return '';
  // Keep both division buttons even after one race is settled (it then shows who clinched); hide only when both are done.
  const sims = divisions(s).map(d => raceSim(d, racePicks, s)).filter(r => r);
  if (!sims.some(r => r.left.length)) return '';
  if (sims.length < 2) return `<h2>Title Game Race</h2>` + sims.map(raceCard).join('');
  // Two divisions: one button per division; tapping one drops its race open below (tap again to close).
  const open = sims.find(r => r.div === UI.raceDiv);
  return `<h2>Division Race</h2><div class="racetabs">${sims.map(r => `<button class="racetab${open === r ? ' on' : ''}" data-racediv="${esc(r.div)}">${esc(r.div)} <span>${open === r ? '▴' : '▾'}</span></button>`).join('')}</div>`
    + (open ? `<div class="racedrop">${raceCard(open)}</div>` : '<p class="muted small" style="text-align:center;margin:4px 0 0">Tap a division to see its race.</p>');
}
function raceCard(r) {
  const nm = id => esc(team(id).name), ab = id => esc(team(id).abbr || team(id).name);
  const prize = r.K === 1 && r.div ? `the ${esc(r.div)}` : 'the title game';
  const vsTxt = (g, me) => `${g.home === me ? 'vs' : g.neutral ? 'vs' : 'at'} ${ab(g.home === me ? g.away : g.home)} <span class="muted">(${g.type === 'ccg' ? 'League Title' : 'Wk ' + g.week})</span>`;
  const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const beat = x => `${ab(x.winner)} beats ${ab(x.loser)}`;
  const ordn = n => ordinal(n);
  const nPicked = r.left.length - r.open.length;
  const byId = Object.fromEntries((r.teams || []).map(t => [t.id, t]));
  const pill = t => !t ? '' : t.status === 'clinched' ? '<span class="rs ok">✓ Clinched</span>' : t.status === 'eliminated' ? '<span class="rs out">Out</span>' : t.winsOutIn ? '<span class="rs gold">In control</span>' : '<span class="rs">Needs help</span>';
  // Group results by the team that has to lose: "KENN loses to LT, UK or PUR".
  const results = arr => {
    const by = {}; arr.forEach(x => (by[x.loser] = by[x.loser] || []).push(x.winner));
    return Object.entries(by).map(([lo, ws]) => ws.length === 1 ? `${ab(ws[0])} beats ${ab(lo)}` : `${ab(lo)} loses to ${orList(ws.map(ab))}`);
  };
  const orList = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1];
  const path = (t) => {
    if (!t) return '';
    if (t.status === 'clinched') return `<p>Has clinched ${prize}${r.K === 1 ? ' and a spot in the title game' : ''}.</p>`;
    if (t.status === 'eliminated') return `<p class="muted">Can't win ${prize} anymore.</p>`;
    const mine = r.open.filter(g => g.home === t.id || g.away === t.id), out = [];
    const opp = g => ab(g.home === t.id ? g.away : g.home);
    if (t.winsOutIn) {
      out.push(mine.length ? `<b>Win out and it's in.</b>` : `<b>In as things stand</b> unless other results go against it.`);
      if (t.canLose.length) out.push(`One loss isn't fatal: it can still get in after losing to ${orList(t.canLose.map(opp))}, with help.`);
    } else if (t.winsOutAlive) {
      const lead = mine.length ? '<b>Win out</b> plus' : '<b>Needs</b>';
      if (t.help1.length) { const h = results(t.help1).slice(0, 4); out.push(`${lead} ${h.length > 1 ? 'any one of these: ' : ''}${h.join(' <span class="muted">or</span> ')}.`); }
      else if (t.help2.length) out.push(`${lead} two results, such as ${t.help2.slice(0, 2).map(p => p.map(x => `${ab(x.winner)} beats ${ab(x.loser)}`).join(' <b>and</b> ')).join(' <span class="muted">or</span> ')}.`);
      else out.push(`${mine.length ? '<b>Win out</b>, then' : 'Needs'} a lot to break its way. It may take several results or come down to point differential.`);
      if (t.mustWin.length && t.mustWin.length < mine.length) out.push(`Can't afford to lose to ${orList(t.mustWin.map(opp))}.`);
      else if (t.canLose.length && t.mustWin.length < mine.length) out.push(`A loss to ${orList(t.canLose.map(opp))} doesn't end it, but it needs more help after one.`);
    } else out.push(`Still alive only through tiebreaks that need other results to break its way.`);
    if (t.needs.length) out.push(`<span class="rneed">Needs no matter what:</span> ${results(t.needs).join(', ')}.`);
    if (t.clinch1.length) out.push(`<span class="rgood">Clinches right away if</span> ${results(t.clinch1).slice(0, 3).join(' <span class="muted">or</span> ')}.`);
    const left = mine.length ? `<p class="rleft">Left: ${mine.map(g => `${g.home === t.id || g.neutral ? 'vs' : 'at'} ${opp(g)} <span class="muted">Wk ${g.week}</span>`).join(' · ')}</p>` : '';
    return out.map(x => `<p>${x}</p>`).join('') + left;
  };
  const range = t => !t ? '' : t.best === t.worst ? `Finishes ${ordn(t.best)}` : `Can finish ${ordn(t.best)}–${ordn(t.worst)}`;
  const teamsHtml = r.tooMany ? `<p class="muted small">There are too many games left to map every path. Pick a few results below and the paths will appear.</p>`
    : `<ul class="racelist">${r.projected.map(p => byId[p.id]).map(t => `<li><div class="rh">${chip(t.id)}${pill(t)}<span class="muted small">${range(t)}</span></div><div class="rpath">${path(t)}</div></li>`).join('')}</ul>`;
  const proj = `<div class="rsub">Projected finish <span class="muted">${nPicked ? `your ${nPicked} pick${nPicked > 1 ? 's' : ''}` : ''}${nPicked && r.open.length ? ' + ' : ''}${r.open.length ? 'favorites in the rest' : ''}</span></div>
    <ol class="rproj">${r.projected.map((p, i) => `<li><span class="rpos">${i + 1}</span>${chip(p.id)}<span class="rrec">${p.cw}-${p.cl} conf · ${p.w}-${p.l}</span>${p.over ? `<span class="rwhy">ahead of ${ab(r.projected[i + 1].id)}: ${esc(p.over.t)}</span>` : ''}</li>`).join('')}</ol>`;
  const weeks = [...new Set(r.left.map(g => g.week))];
  const picker = `<div class="rsub">What if… <span class="muted">tap a winner to see how it changes</span>${nPicked ? ` <button class="ghost sm" data-rreset="${esc(r.div)}">Reset</button>` : ''}</div>
    ${weeks.map(wk => `<div class="rwk">Week ${wk}</div>${r.left.filter(g => g.week === wk).map(g => {
      const lnx = lineOf(g), ph = lnx ? Math.round(lnx.pHome * 100) : null, cur = racePicks[g.id] || '';
      const btn = (side, id, pct) => `<button class="rpk ${cur === side ? 'on' : ''}" data-rpick="${esc(g.id)}|${side}"><i class="sw" style="background:${esc(teamColor(team(id)))}"></i>${ab(id)}${pct != null ? `<span>${pct}%</span>` : ''}</button>`;
      return `<div class="rgame">${btn('away', g.away, ph != null ? 100 - ph : null)}<span class="rat">${g.neutral ? 'vs' : '@'}</span>${btn('home', g.home, ph)}</div>`;
    }).join('')}`).join('')}`;
  return `<div class="card race2"><h3 style="margin-top:0">${esc(r.div ? D.league.conference + ' ' + r.div : D.league.conference)} race</h3>${teamsHtml}${proj}${picker}</div>`;
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
  // Hidden page for troubleshooting data loading: #debug
  debug() {
    const L = D.league, s = L.season, c = D.games.find(g => g.season === s && g.type === 'ccg');
    const ver = [...document.scripts].map(x => x.src).filter(x => /app\.js/.test(x)).join(' ');
    const row = (k, v) => `<tr><td class="muted">${esc(k)}</td><td class="wrap">${esc(String(v))}</td></tr>`;
    return `<h2>Debug</h2><div class="card"><table>${row('Script', ver || '?')}${row('Cache', DIAG.cache)}${row('Signed in', auth.profile ? auth.profile.name + ' (' + (auth.profile.role || 'coach') + ')' : 'no')}
      ${row('League', `season ${s} · week ${L.week} · ${L.phase} · finalWeek ${L.finalWeek}`)}${row('Futures open', JSON.stringify(L.futures && { s: L.futures.season, open: L.futures.open }))}
      ${row('season.json', `season ${DIAG.snapSeason} · T ${DIAG.snapT ? new Date(DIAG.snapT).toLocaleString() : '-'} · games ${DIAG.snapCounts.games ?? '-'}`)}
      ${row('Games this season', D.games.filter(g => g.season === s).length)}${row('Title game', c ? `${c.id} · wk ${c.week} · ${c.away} @ ${c.home}` : 'NOT LOADED')}
      ${Object.entries(DIAG.live).map(([k, v]) => row('Live ' + k, `${v.n} changed · ${v.cache ? 'from cache' : 'server'} · ${v.ids.join(', ')}`)).join('')}
      ${row('Errors', DIAG.errors.join(' | ') || 'none')}</table></div>`;
  },
  home() {
    const L = D.league, s = S(), wk = L.week;
    const games = D.games.filter(g => g.season === s && g.week === wk).sort((a, b) => (isUserTeam(team(b.home)) + isUserTeam(team(b.away))) - (isUserTeam(team(a.home)) + isUserTeam(team(a.away))));
    const gt = gotwTally(s, wk);
    // Offseason (season finalized, next one not published): the past season's biggest storylines, no matchups box.
    const offseason = L.phase === PHASES.PRE, recap = offseason && D.history.some(h => h.season === L.season);
    const stories = recap ? seasonStorylines(L.season) : storylines();
    const pr = currentPower().slice(0, 5);
    const leaders = bettors().map(u => ({ u, b: bankroll(u.id) })).sort((a, b) => b.b.net - a.b.net || b.b.balance - a.b.balance).slice(0, 5);
    let html = installTip();
    if (L.desk && L.desk.show && L.desk.text) html += `<div class="card banner"><h2>Commissioner's Desk</h2><div style="white-space:pre-wrap">${esc(L.desk.text)}</div></div>`;
    html += offseasonAwardsCard();
    const ccgNow = games.find(g => g.type === 'ccg');
    if (ccgNow && !gt.game) html += featureCard(ccgNow, { ribbon: champRibbon(), note: played(ccgNow) ? 'League champion crowned' : '' });
    if (gt.game) html += featureCard(gt.game, { ribbon: '★ Game of the Week' });
    else if (L.phase === PHASES.REG && games.length) html += `<div class="card gotw"><span class="ribbon">★ Game of the Week</span><div class="muted">No Game of the Week votes were cast for ${esc(weekLabel())}. <a href="#vote">Vote for next week's game →</a></div></div>`;
    const userWk = games.some(g => isUserTeam(team(g.home)) || isUserTeam(team(g.away)));
    html += `<div class="${offseason ? '' : 'grid2'}"><div><h2>${recap ? `Season ${seasonNum(L.season)} in Review` : "This Week's Storylines"}</h2><div class="card">${stories.length ? stories.map(st => `<${st.href ? `a href="${esc(st.href)}"` : 'div'} class="story${st.href ? ' link' : ''}"><span class="tag">${esc(st.tag)}</span><h3>${esc(st.title)}</h3><p>${esc((() => { const vs = {}; vary(st.title, vs); return vary(st.body, vs); })())}</p>${st.href ? '<span class="go" aria-hidden="true">›</span>' : ''}</${st.href ? 'a' : 'div'}>`).join('') : '<div class="empty">Storylines appear once games are played.</div>'}</div></div>
      ${offseason ? '' : `<div><h2>${esc(weekLabel())} Matchups</h2><div class="card matchbox">${userWk ? weekOrder(games.filter(g => g.id !== gt.game?.id && g.id !== ccgNow?.id)).map(g => gameCard(g)).join('') || `<div class="empty">Only the ${ccgNow && !gt.game ? 'championship game' : 'Game of the Week'} is on the slate.</div>` : '<div class="empty">No user games this week.</div>'}</div></div>`}</div>
      <div class="grid home2"><div class="card"><h2>Power Rankings</h2><table>${pr.map(x => `<tr><td class="rank">${x.rank}</td><td>${chip(x.id)}</td><td class="num">${rec(x.rec)}</td><td class="num">${mvHtml(x.move)}</td></tr>`).join('')}</table><p><a href="#rankings">Full rankings →</a></p></div>
      <div class="card"><h2>Betting Leaders</h2>${leaders.length ? `<table>${leaders.map((x, i) => `<tr><td class="rank">${i + 1}</td><td>${esc(x.u.name)}</td><td class="num">${x.b.w}-${x.b.l}${x.b.p ? '-' + x.b.p : ''}</td><td class="num"><b class="${x.b.net >= 0 ? 'win' : 'loss'}">${x.b.net >= 0 ? '+' : ''}${x.b.net.toLocaleString()}</b></td></tr>`).join('')}</table>` : '<div class="muted">No coaches linked yet.</div>'}<p><a href="#betting">Place wagers →</a></p></div></div>`;
    return html;
  },

  standings() {
    const s = S(), R = records(s), st = UI.stSort, race = clinchScenarios(s);
    // Division record: regular-season games against teams in the same division.
    const dv = {};
    D.games.filter(g => g.season === s && played(g) && (g.type || 'reg') === 'reg').forEach(g => {
      const h = team(g.home), a = team(g.away); if (!divOf(h, s) || divOf(h, s) !== divOf(a, s) || h.conf !== D.league.conference || a.conf !== D.league.conference) return;
      const hw = +g.homeScore > +g.awayScore; [[g.home, hw], [g.away, !hw]].forEach(([id, w]) => { const r = dv[id] || (dv[id] = { w: 0, l: 0 }); w ? r.w++ : r.l++; });
    });
    return `<h2>${s} ${esc(D.league.conference)} Standings</h2>` + divisions(s).map(d => {
      const ids = leagueTeams().filter(t => !d || divOf(t, s) === d).map(t => t.id);
      const ordered = orderGroup(ids, s).map((id, i) => ({ id, place: i + 1, ...R[id], name: team(id).name, coach: team(id).coach || 'CPU', cpct: R[id].cw + R[id].cl ? R[id].cw / (R[id].cw + R[id].cl) : 0, opct: R[id].w + R[id].l ? R[id].w / (R[id].w + R[id].l) : 0, diff: R[id].pf - R[id].pa, stk: streak(R[id]), dw: (dv[id] || {}).w || 0, dl: (dv[id] || {}).l || 0, dpct: dv[id] && dv[id].w + dv[id].l ? dv[id].w / (dv[id].w + dv[id].l) : 0 }));
      const rows = sortRows(ordered, st, { stk: r => (r.stk[0] === 'W' ? 1 : -1) * (+r.stk.slice(1) || 0) });
      return `<div class="card"><h3 style="margin-top:0">${esc(d ? D.league.conference + ' ' + d : D.league.conference)}</h3><div class="tablewrap"><table>
        <tr>${sortTh(st, 'place', '#')}${sortTh(st, 'name', 'Team')}${sortTh(st, 'coach', 'Coach', 'hide-sm')}${sortTh(st, 'cpct', 'Conf', 'num')}${sortTh(st, 'dpct', 'Div', 'num')}${sortTh(st, 'pf', 'PF', 'num hide-sm')}${sortTh(st, 'pa', 'PA', 'num hide-sm')}${sortTh(st, 'diff', 'Diff', 'num')}${sortTh(st, 'stk', 'Strk', 'num hide-xs')}</tr>
        ${rows.map(r => `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td class="rank">${r.place}</td><td>${chip(r.id)}${subSm(isUserTeam(team(r.id)) ? esc(r.coach) : 'CPU')}</td><td class="hide-sm">${isUserTeam(team(r.id)) ? `<a href="#coach/${slug(r.coach)}">${esc(r.coach)}</a>` : '<span class="muted">CPU</span>'}</td><td class="num">${r.cw}-${r.cl}</td><td class="num">${r.dw}-${r.dl}</td><td class="num hide-sm">${r.pf}</td><td class="num hide-sm">${r.pa}</td><td class="num">${r.diff > 0 ? '+' : ''}${r.diff}</td><td class="num hide-xs">${r.stk}</td></tr>`).join('')}
      </table></div></div>`;
    }).join('') + `<div id="race">${raceSection()}</div>`;
  },

  schedule(arg) {
    const s = S(), weeks = [...new Set(seasonGames().map(g => g.week))].sort((a, b) => a - b);
    const wk = arg != null && arg !== '' ? +arg : (weeks.includes(D.league.week) ? D.league.week : weeks[weeks.length - 1]);
    const games = D.games.filter(g => g.season === s && g.week === wk);
    const gt = gotwTally(s, wk).game;
    return `<div class="row spread schedhead"><h2 style="margin:0">Schedule &amp; Scores</h2>
      <select data-nav="schedule" aria-label="Week">${weeks.map(w => `<option value="${w}" ${w === wk ? 'selected' : ''}>${esc(wkName(w, s))}</option>`).join('')}</select></div>
      ${games.length ? weekOrder(games, gt && gt.id).map(g => gameCard(g, { gotw: gt && gt.id === g.id })).join('') : '<div class="card empty">No games for this week.</div>'}`;
  },

  odds(focus) {
    const s = S(), L = D.league, cur = nowUpto();
    const sim = simulate(s, cur), st = UI.oddsSort;
    const pre = !seasonGames().some(played);
    const rows = sortRows(leagueTeams().map(t => ({ id: t.id, name: t.name, coach: t.coach || 'CPU', ...sim[t.id] })), st, { likely: r => parseInt(r.likely) });
    const hist = oddsHistory();
    const divLbl = divisions().length > 1 ? 'Division' : 'Reg. Season Title';
    return `<h2>${pre ? 'Preseason Odds' : 'Season Odds'}</h2>
      <p class="muted small">${pre ? 'Built from team overall, offense and defense ratings and the full schedule, before any Week 0 games.' : 'Re-simulated 1,500 times after every advance using results so far.'}</p>
      <div class="card"><div class="tablewrap"><table>
        <tr>${sortTh(st, 'name', 'Team')}${sortTh(st, 'coach', 'Coach', 'hide-sm')}${sortTh(st, 'likely', 'Likely', 'num')}${sortTh(st, 'expW', 'Proj. W', 'num hide-xs')}${sortTh(st, 'divPct', divLbl.replace('Reg. Season Title', '1st').replace('Division', 'Div'), 'num')}${sortTh(st, 'ccgPct', 'Make Title Game', 'num hide-sm')}${sortTh(st, 'titlePct', 'Title', 'num')}</tr>
        ${rows.map(r => `<tr id="odds-${esc(r.id)}" class="${myTeam()?.id === r.id ? 'me' : ''}${focus === r.id ? ' focus' : ''}"><td>${chip(r.id)}${subSm(isUserTeam(team(r.id)) ? esc(r.coach) : 'CPU')}</td><td class="hide-sm">${isUserTeam(team(r.id)) ? esc(r.coach) : '<span class="muted">CPU</span>'}</td><td class="num">${r.likely}</td><td class="num hide-xs">${r.expW.toFixed(1)}</td><td class="num">${pctStr(r.divPct)}</td><td class="num hide-sm">${pctStr(r.ccgPct)}</td><td class="num"><b>${pctStr(r.titlePct)}</b></td></tr>`).join('')}
      </table></div></div>
      <h2>Coach Odds Trend</h2><div class="card chart"><div class="row spread"><div class="seg">
        ${[['titlePct', 'League Title %', 'Title %'], ['divPct', divLbl + ' %', 'Div %'], ['expW', 'Projected Wins', 'Proj. W']].map(([k, l, sm]) => `<button data-metric="${k}" class="${UI.metric === k ? 'on' : ''}"><span class="hide-sm">${l}</span><span class="show-sm">${sm}</span></button>`).join('')}
      </div></div>${trendChart(hist)}</div>`;
  },

  betting() {
    const L = D.league, s = S(), me = auth.profile;
    const bwks = [...new Set(D.games.filter(g => g.season === s && g.week >= L.week && !played(g) && !g.locked).map(g => g.week))].sort((a, b) => a - b);
    const bw = bwks.includes(UI.betWeek) ? UI.betWeek : bwks[0];
    const games = D.games.filter(g => g.season === s && g.week === bw && !played(g) && !g.locked);
    const open = L.bettingOpen && L.phase !== PHASES.PRE && L.phase !== PHASES.POST;
    const bk = me ? bankroll(me.id) : null;
    let html = `<div class="sbhead"><h2>Sportsbook · ${esc(weekLabel())}</h2>${bk ? `<div class="bkmini"><div><span>Balance</span><b>${bk.balance.toLocaleString()}</b></div><div class="hide-sm"><span>In play</span><b>${bk.open}</b></div><div><span>Record</span><b>${bk.w}-${bk.l}${bk.p ? '-' + bk.p : ''}</b></div><div><span>Net</span><b class="${bk.net >= 0 ? 'win' : 'loss'}">${bk.net >= 0 ? '+' : ''}${bk.net}</b></div></div>` : ''}</div>`;
    if (me) { const nOpen = D.wagers.filter(w => w.uid === me.id && w.season === s && w.status === 'open' && !w.deleted).length;
      UI.mb = `<a class="btn mybetsbtn" href="#mybets">🎟️ My Bets${nOpen ? ` <span class="mbcount">${nOpen} open</span>` : ''}</a>`; } else UI.mb = '';
    const segRow = open && games.length;
    if (UI.mb && !segRow) html += `<div class="mybetsrow">${UI.mb}</div>`;
    if (!me) html += `<div class="notice">Everyone with an account gets <b>${START_CREDITS.toLocaleString()} Crackers</b> per season. <a href="#account">Log in or sign up</a> to place wagers.</div>`;
    else if (!me.teamId) html += `<div class="notice">You're a spectator: you can bet with your ${START_CREDITS.toLocaleString()} Crackers like everyone else. If you join the league, the commissioner will link you to your team.</div>`;
    html += !open ? `<div class="card empty">Betting is ${L.phase === PHASES.PRE ? 'closed until the season is published' : 'locked right now'}.</div>` :
      games.length ? `<div class="row" style="margin-bottom:10px"><div class="seg"><button data-mode="single" class="${UI.mode === 'single' ? 'on' : ''}">Single bets</button><button data-mode="parlay" class="${UI.mode === 'parlay' ? 'on' : ''}">Parlay</button></div>${UI.mb}
        ${UI.mode === 'parlay' ? `<span class="muted small">Tap 2–${MAX_LEGS} picks from any upcoming week, plus League Champion and Win Total picks below. Per game: one side (spread or moneyline) and one points pick (game total or a team total). Tapping another in the same group swaps it in. All must hit; payouts multiply. Once more than half the legs have won, you can cash out early for your stake plus ${Math.round(CASHOUT_SHARE * 100)}% of what the winning legs would pay.</span>` : ''}</div>
        <div class="row" style="margin-bottom:14px"><select data-betweek="1" aria-label="Week to bet on">${bwks.map(w => `<option value="${w}" ${w === bw ? 'selected' : ''}>${esc(wkName(w, s))}${w === L.week ? ' (this week)' : ''}</option>`).join('')}</select>
        <span class="muted small">${bw === L.week ? '' : 'Early lines: they move after every advance, but your bet keeps the line you took.'}</span></div><div class="card"><div class="betgrid"><div class="hdr">Spread</div><div class="hdr">Moneyline</div><div class="hdr">Total</div>
        ${games.slice().sort((x, y) => (y.id === gotwGameId()) - (x.id === gotwGameId())).map(g => betRows(g)).join('')}</div></div>${bw === L.week ? `<div id="popular">${popularCard()}</div>` : ''}<div id="value">${valueCard(games)}</div>` : '<div class="card empty">No open games this week.</div>';
    html += futuresSection();
    html += winsSection();
    const lb = UI.lbSort, ws = UI.wkSort;
    const board0 = bettors().map(u => ({ u, b: bankroll(u.id) })).sort((a, b) => b.b.net - a.b.net || b.b.balance - a.b.balance)   // same order as Betting Leaders on Home
      .map((x, i) => ({ ...x, place: i + 1, name: x.u.name, rec: x.b.w + x.b.l ? x.b.w / (x.b.w + x.b.l) : 0, net: x.b.net, roi: x.b.risked ? x.b.net / x.b.risked : -Infinity, balance: x.b.balance }));
    const board = sortRows(board0, lb, { rec: r => r.rec * 1000 + r.b.w });
    html += `<h2>Season ${seasonNum()} Leaderboard</h2><div class="card"><div class="tablewrap"><table><tr>${sortTh(lb, 'place', '#', '', 'lbSort')}${sortTh(lb, 'name', 'Coach', '', 'lbSort')}${sortTh(lb, 'rec', 'W-L-P', 'num', 'lbSort')}${sortTh(lb, 'net', 'Net', 'num hide-xs', 'lbSort')}${sortTh(lb, 'roi', 'ROI', 'num hide-sm', 'lbSort')}${sortTh(lb, 'balance', 'Balance', 'num', 'lbSort')}</tr>
      ${board.map(x => `<tr class="${me && me.id === x.u.id ? 'me' : ''}"><td class="rank">${x.place}</td><td>${x.u.teamId ? `<a href="#coach/${slug(x.u.name)}">${esc(x.u.name)}</a>` : esc(x.u.name)} <span class="muted small hide-sm">${x.u.teamId ? esc(team(x.u.teamId).name) : 'Spectator'}</span>${subSm(x.u.teamId ? esc(team(x.u.teamId).name) : 'Spectator')}</td><td class="num">${x.b.w}-${x.b.l}-${x.b.p}</td><td class="num hide-xs ${x.b.net >= 0 ? 'win' : 'loss'}">${x.b.net >= 0 ? '+' : ''}${x.b.net}</td><td class="num hide-sm">${x.b.risked ? Math.round(x.b.net / x.b.risked * 100) + '%' : '–'}</td><td class="num"><b>${x.b.balance.toLocaleString()}</b></td></tr>`).join('')}
    </table></div></div>`;
    // Potential payout = stake back + profit (boost included). Pushes and voids just return the stake.
    const payOf = w => w.status === 'push' || w.status === 'void' ? w.stake : w.status === 'cashed' ? w.stake + (w.payout || 0) : w.stake + winProfit(w);
    const payCell = w => { const v = payOf(w).toLocaleString(); return w.status === 'lost' ? `<s class="muted">${v}</s>` : w.status === 'won' || w.status === 'cashed' ? `<b class="win">${v}</b>` : v; };
    const STO = { open: 0, won: 1, cashed: 1.5, push: 2, void: 3, lost: 4 };
    const wk = sortRows(D.wagers.filter(w => w.season === s && w.week === L.week), ws,
      { coach: w => (w.coach || '').toLowerCase(), bet: w => wagerLabel(w).toLowerCase(), ts: w => w.ts || 0, stake: w => w.stake, payout: payOf, status: w => STO[w.status] ?? 9 });
    if (wk.length) html += `<h2>Bets Placed This Week</h2><div class="card"><div class="tablewrap"><table class="bets"><tr>${sortTh(ws, 'coach', 'Coach', '', 'wkSort')}${sortTh(ws, 'bet', 'Bet', '', 'wkSort')}${sortTh(ws, 'ts', 'Placed', 'hide-sm', 'wkSort')}${sortTh(ws, 'stake', 'Stake', 'num', 'wkSort')}${sortTh(ws, 'payout', 'Payout', 'num', 'wkSort')}${sortTh(ws, 'status', 'Status', 'num hide-xs', 'wkSort')}</tr>${wk.map(w => `<tr><td>${coachCell(w)}</td><td class="wrap">${esc(wagerLabel(w))}${legsHtml(w)}${subSm(fmtTime(w.ts))}</td><td class="muted small hide-sm">${fmtTime(w.ts)}</td><td class="num">${w.stake}</td><td class="num">${payCell(w)}</td><td class="num hide-xs">${statusPill(w)}</td></tr>`).join('')}</table></div></div>`;
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
    const s = S(), R = records(s), all = D.teams.filter(t => t.conf === D.league.conference), me = myTeam()?.id;
    const grids = divisions(s).map(d => {
      const ids = orderGroup(all.filter(t => !d || divOf(t, s) === d).map(t => t.id), s);
      return `<h2>${esc(d ? D.league.conference + ' ' + d : D.league.conference)}</h2><div class="tgrid">${ids.map((id, i) => { const t = team(id); return `<a class="tcard${id === me ? ' me' : ''}" style="--tc:${esc(teamColor(t))}" href="#team/${esc(id)}">
        <div class="tc-top"><span class="tc-pl">${i + 1}</span><b class="tc-name">${esc(t.name)}</b></div>
        <div class="tc-rec">${rec(R[id])}${streak(R[id]) !== '–' ? `<span class="muted small"> · ${streak(R[id])}</span>` : ''}</div>
        <div class="muted small tc-sub">${isUserTeam(t) ? esc(t.coach) : 'CPU'} · ${t.ovr || '–'} OVR</div></a>`; }).join('')}</div>`;
    }).join('');
    return grids + statsBoard(s);
  },

  team(id) {
    // "#team/<id>" is this season; "#team/<id>/<season>" is that team as it was in an earlier season.
    const want = +(location.hash.split('/')[2] || 0), cur = D.league.season;
    const t = team(id), s = want && want !== cur ? want : S(), past = s !== cur, r = records(s)[t.id];
    if (!r) return '<div class="card empty">Team not found.</div>';
    const games = D.games.filter(g => g.season === s && (g.home === id || g.away === id)).sort((a, b) => a.week - b.week);
    if (past && !games.length) return `<p><a href="#team/${esc(id)}">← ${esc(t.name)}</a></p><div class="card empty">${esc(t.name)} has no games on record in ${s}.</div>`;
    const pr = past ? null : currentPower().find(x => x.id === id), sim = !past && t.conf === D.league.conference ? simulate(s, nowUpto())[id] : null;
    const sc = !past ? t.coach : (games.filter(played).map(g => coachOf(g, g.home === id ? 'home' : 'away')).find(c => c && c !== 'CPU') || '');
    const pb = isUserTeam(t) || sc ? playbookOf(t, !past ? pbSeason() : s, sc) : null;
    // Seasons this team has games in, for the season switcher.
    const seasonsOf = [...new Set(D.games.filter(g => g.home === id || g.away === id).map(g => g.season))].sort((a, b) => a - b);
    const ccg = D.games.find(g => g.season === s && g.type === 'ccg' && played(g) && (g.home === id || g.away === id));
    const champ = ccg && (+ccg.homeScore > +ccg.awayScore ? ccg.home : ccg.away) === id;
    const place = past && sc ? seasonPlaces(s).places[sc.toLowerCase()] : null;
    const coachLine = past ? (sc ? `Coach <a href="#coach/${slug(sc)}">${esc(sc)}</a>` : 'CPU') : isUserTeam(t) ? `Coach <a href="#coach/${slug(t.coach)}">${esc(t.coach)}</a>` : 'CPU';
    const tAw = (D.history.find(h => h.season === s)?.awards || []).filter(a => a.team === id);
    return `<p><a href="${past ? '#history' : '#teams'}">← ${past ? 'History' : 'All teams'}</a></p>
      ${seasonsOf.length > 1 ? `<div class="bfilters">${seasonsOf.map(x => `<a class="bfilter${x === s ? ' on' : ''}" href="#team/${esc(id)}${x === cur ? '' : '/' + x}">S${seasonNum(x)} <span>${x}</span></a>`).join('')}</div>` : ''}
      <div class="card" style="border-left:6px solid ${esc(teamColor(t))}"><h2>${pr ? '#' + pr.rank + ' ' : ''}${esc(t.name)}${past ? ` <span class="muted" style="font-size:.7em">· Season ${seasonNum(s)}</span>` : ''}</h2>
        <div class="muted">${esc(past ? (seasonMembers(s).has(t.id) ? D.league.conference : t.conf) : t.conf)}${divOf(t, s) && !past ? ' ' + esc(divOf(t, s)) : ''} · ${coachLine}${champ ? ' · <span class="tag gold">🏆 League champion</span>' : ccg ? ' · <span class="tag">Title game</span>' : ''}</div>
        ${tAw.length ? `<div class="small" style="margin-top:6px">${tAw.map(a => `<span class="tag">${/coach of the year/i.test(a.award || '') ? '🏅' : '🏆'} ${esc(a.award)}${/coach of the year/i.test(a.award || '') && coachName(a.winner) ? ` · <a href="#coach/${slug(coachName(a.winner))}">${esc(coachName(a.winner))}</a>` : ''}</span>`).join(' ')}</div>` : ''}
        <div class="stat" style="margin-top:10px"><div><span>Record</span><b>${rec(r)}</b></div><div><span>Conf</span><b>${(() => { const c = confRecOf(t.id, s); return c.w + '-' + c.l; })()}</b></div><div><span>PF / PA</span><b>${r.pf} / ${r.pa}</b></div><div><span>${past ? 'Finished on' : 'Streak'}</span><b>${streak(r)}</b></div>
          ${place ? `<div><span>Finish</span><b>${ordinal(place)}</b></div>` : ''}${past ? '' : `<div><span>OVR / OFF / DEF</span><b>${t.ovr || '–'} / ${t.off || '–'} / ${t.def || '–'}</b></div>`}${pb ? `<div><span>Offense playbook</span><b>${esc(pb.off || '–')}</b></div><div><span>Defense playbook</span><b>${esc(pb.def || '–')}</b></div>` : ''}${sim ? `<div><span>Likely record</span><b>${sim.likely}</b></div><div><span>Title odds</span><b>${pctStr(sim.titlePct)}</b></div>` : ''}</div></div>
      ${teamStatsCard(id, s)}
      ${past ? '' : scoutCard(t, s)}
      ${cpuBroadcasts(id, s)}
      <div class="card"><h3 style="margin-top:0">${s} Schedule</h3><div class="tablewrap"><table><tr><th>Wk</th><th>Opponent</th><th>Line</th><th class="num">Result</th></tr>
      ${games.map(g => {
        const home = g.home === id, opp = home ? g.away : g.home, done = played(g), l = lineOf(g);
        const my = home ? +g.homeScore : +g.awayScore, th = home ? +g.awayScore : +g.homeScore;
        const myLine = l ? (home ? l.spread : -l.spread) : null;
        return `<tr class="clickable" data-game="${esc(g.id)}"><td>${g.type === 'ccg' ? '<b title="League Championship">🏆</b>' : g.type === 'bowl' ? '<span title="Postseason">Bowl</span>' : g.week}</td><td>${g.neutral ? 'vs' : home ? 'vs' : '@'} ${chip(opp, { season: g.season, week: g.week })}</td><td class="muted wrap-sm">${l ? fmtLine(myLine) + `<span class="hide-sm"> · ${fmtOdds(home ? l.mlHome : l.mlAway)}</span>` + (winPct(g, l) && !g.forfeit ? ` · <span title="${done ? 'Pre-game win chance' : 'Win chance'}">${home ? winPct(g, l).h : winPct(g, l).a}%</span>` : '') : ''}</td><td class="num">${done ? `<span class="${my > th ? 'win' : 'loss'}">${my > th ? 'W' : 'L'} ${g.forfeit ? '(forfeit)' : my + '-' + th}</span>` : '<span class="muted">—</span>'}</td></tr>`;
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
        ${stops.length ? `<div class="cpath">${stops.map(p => `<span class="cstop">${chip(p.team, { abbr: true, rank: false, season: p.to })}<em>${seasonNum(p.from) === seasonNum(p.to) ? 'S' + seasonNum(p.from) : `S${seasonNum(p.from)}–${seasonNum(p.to)}`}</em></span>`).join('<span class="carr">→</span>')}</div>` : ''}
        <div class="stat" style="margin-top:12px"><div><span>Career</span><b>${c ? c.w + '-' + c.l : '0-0'}</b></div><div><span>Win %</span><b>${c ? pct(c.w, c.l) : '–'}</b></div>
        <div><span>League titles</span><b>${titles}</b></div><div><span>Title game apps</span><b>${apps}</b></div><div><span>Seasons</span><b>${seasons.length || (c ? c.seasons.size : 0)}</b></div></div></div>`;
    html += coachStatsCard(name);
    html += `<div class="card"><h3 style="margin-top:0">Season by season</h3>${seasons.length ? `<div class="tablewrap"><table class="cseason">
      <tr><th>Season</th><th>Team</th><th class="num">W-L</th><th class="num hide-sm">vs Coaches</th><th class="num hide-sm">PF / G</th><th class="num hide-sm">PA / G</th><th>Finish</th></tr>
      ${seasons.slice().reverse().map(x => `<tr><td><b>S${seasonNum(x.season)}</b><div class="muted small">${x.season}${x.season === cur && D.league.phase !== PHASES.PRE && !x.finish ? ' · in progress' : ''}</div></td>
        <td>${x.teams.map(id => chip(id, { abbr: innerWidth < 640, rank: false, season: x.season })).join(' ')}${(() => { const p = x.teams.map(id => pbText(playbookOf(team(id), x.season, name))).filter(Boolean); return p.length ? `<div class="muted small">${esc(p.join(' · '))}</div>` : ''; })()}</td><td class="num"><b>${x.w}-${x.l}</b></td><td class="num hide-sm">${x.uw}-${x.ul}</td>
        <td class="num hide-sm">${x.gp ? (x.pf / x.gp).toFixed(1) : '–'}</td><td class="num hide-sm">${x.gp ? (x.pa / x.gp).toFixed(1) : '–'}</td>
        <td>${x.ccg ? `<a href="#game/${esc(x.ccg.g.id)}">${finishTag(x.finish)}</a>` : placeTag(x)}</td></tr>`).join('')}
      </table></div>` : '<div class="muted">No games on record yet.</div>'}</div>`;
    if (teamAwards.length) html += `<div class="card"><h3 style="margin-top:0">Team awards</h3><ul class="clean">${teamAwards.map(({ h, a }) => `<li><b>S${seasonNum(h.season)}</b> · ${/coach of the year/i.test(a.award || '') ? '🏅 ' : ''}${esc(a.award)}: ${esc(a.winner)}${String(a.winner || '').toLowerCase() === team(a.team).name.toLowerCase() ? '' : ' ' + chip(a.team, { abbr: true, rank: false, season: h.season })}</li>`).join('')}</ul></div>`;
    // Head-to-head: tap a row to see every game against that coach (newest first), each linking to its game page.
    const h2hGames = o => coachMeetings(name, o).map(g => {
      const side = coachOf(g, 'home').toLowerCase() === String(name).toLowerCase() ? 'home' : 'away', op = side === 'home' ? 'away' : 'home';
      const my = +g[side + 'Score'], th = +g[op + 'Score'], won = my > th, ab = id => esc(team(id).abbr || team(id).name);
      const when = g.type === 'ccg' ? 'Title game' : g.type === 'bowl' ? esc(g.note || 'Bowl') : 'Wk ' + g.week;
      return `<a class="h2hg" href="#game/${esc(g.id)}"><span class="muted">S${seasonNum(g.season)} · ${when}</span><b class="${won ? 'win' : 'loss'}">${g.forfeit ? (won ? 'FW' : 'FL') : won ? 'W' : 'L'}</b><span>${ab(g[side])} ${g.forfeit ? '' : my}<span class="muted"> – </span>${ab(g[op])} ${g.forfeit ? '' : th}</span><span class="go" aria-hidden="true">›</span></a>`;
    }).join('');
    const h2hOpen = UI.h2h || (UI.h2h = {});
    html += `<div class="card"><h3 style="margin-top:0">Head-to-head vs coaches</h3>${vs.length ? `<table class="h2h"><tr><th>Opponent</th><th class="num">W-L</th><th class="num">Win %</th><th aria-hidden="true"></th></tr>${vs.map(([o, r]) => { const k = name + '|' + o, on = !!h2hOpen[k];
      return `<tr class="clickable h2hrow${on ? ' on' : ''}" data-h2h="${esc(k)}" aria-expanded="${on}"><td><a href="#coach/${slug(o)}">${esc(o)}</a></td><td class="num">${r.w}-${r.l}</td><td class="num">${pct(r.w, r.l)}</td><td class="num muted h2hcar">${on ? '▴' : '▾'}</td></tr>${on ? `<tr class="h2hx"><td colspan="4">${h2hGames(o) || '<span class="muted small">No games found.</span>'}</td></tr>` : ''}`; }).join('')}</table>
      <p class="muted small" style="margin:6px 0 0">Tap a row to see every game against that coach.</p>` : '<div class="muted">No coach-vs-coach games yet.</div>'}</div>`;
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

  mybets() {
    const L = D.league, s = S(), me = auth.profile;
    const open = L.bettingOpen && L.phase !== PHASES.PRE && L.phase !== PHASES.POST;
    let html = `<p><a href="#betting">← Sportsbook</a></p>`;
    if (!me) return html + `<div class="card empty"><a href="#account">Log in</a> to see your bets.</div>`;
    const bk = bankroll(me.id);
    html += `<div class="sbhead"><h2>My Bets · Season ${seasonNum()}</h2><div class="bkmini"><div><span>Balance</span><b>${bk.balance.toLocaleString()}</b></div><div><span>In play</span><b>${bk.open}</b></div><div><span>Record</span><b>${bk.w}-${bk.l}${bk.p ? '-' + bk.p : ''}</b></div><div><span>Net</span><b class="${bk.net >= 0 ? 'win' : 'loss'}">${bk.net >= 0 ? '+' : ''}${bk.net}</b></div></div></div>`;
    if (bk.relief) html += `<p class="muted small" style="margin:-4px 0 10px">🪙 Your balance includes ${bk.relief} relief Crackers (${bk.reliefN} advance${bk.reliefN === 1 ? '' : 's'}). Relief isn't winnings, so it's not in your Net.</p>`;
    return html + myWagersHtml(me, s, open);
  },
  vote() {
    const L = D.league, s = S(), me = auth.profile, nw = L.week + 1;
    let html = '';
    if (!me) html += `<div class="notice"><a href="#account">Log in</a> with your coach account to vote.</div>`;
    else if (!me.teamId) html += `<div class="notice">Game of the Week votes are for league coaches. As a spectator you can still bet the winner, boost and all.</div>`;
    const canVote = me && me.teamId;
    // Game of the Week
    const next = D.games.filter(g => g.season === s && g.week === nw && (g.type || 'reg') === 'reg');   // title/bowl games aren't voted on
    const mine = me && D.gotw.find(v => v.season === s && v.week === nw && v.uid === me.id);
    const tally = gotwTally(s, nw);
    html += `<h2>Game of the Week · ${esc(wkName(nw, s))}</h2>`;
    if (L.phase === PHASES.REG && !next.length && L.week >= L.finalWeek) html += `<div class="card empty">That's the last regular-season week, so Game of the Week voting is done for the season.${D.games.some(g => g.season === s && g.type === 'ccg') ? ' Next week is all about the League Title game.' : ''}</div>`;
    else if (L.phase === PHASES.REG && !next.length) html += `<div class="card empty">No league games are scheduled for Week ${nw}, so there's no Game of the Week vote this time.</div>`;
    else if (L.phase !== PHASES.REG) html += `<div class="card empty">Game of the Week voting opens during the regular season for the following week's games.</div>`;
    else html += `<div class="card"><p class="muted small" style="margin-top:0">Vote during ${esc(weekLabel())} for next week's featured game. The winner shows on the Home page once we advance to Week ${nw}.</p>
      ${next.map(g => `<label class="vote-opt ${mine && mine.gameId === g.id ? 'on' : ''}"><input type="radio" name="gotw" value="${esc(g.id)}" ${mine && mine.gameId === g.id ? 'checked' : ''} ${canVote ? '' : 'disabled'}>
        <span style="flex:1">${chip(g.away)} @ ${chip(g.home)} ${gameTags(g)}</span><span class="muted small">${tally.counts[g.id] || 0} vote${tally.counts[g.id] === 1 ? '' : 's'}</span></label>`).join('')}
      ${canVote ? `<button data-act="gotw" style="margin-top:8px">${mine ? 'Change vote' : 'Submit vote'}</button>` : ''}</div>`;
    // Season awards
    const A = L.awards || {};
    html += `<h2>${s} Season Awards</h2>`;
    if (!A.open) html += `<div class="card empty">Awards voting opens during conference championship week and closes after bowl season.${D.history.find(h => h.season === s) ? ' <a href="#history">See this season\'s winners →</a>' : ''}</div>`;
    else {
      const ballot = D.ballots.find(b => b.season === s && b.uid === me?.id) || { picks: {} }, P = ballot.picks || {}, dis = canVote ? '' : 'disabled';
      const confTeams = leagueTeams().slice().sort((x, y) => x.name.localeCompare(y.name));
      const teamSel = (key, v, ph) => `<select data-aw="${key}" data-awf="team" ${dis} aria-label="${esc(ph)}"><option value="">${esc(ph)}</option>${confTeams.map(t => `<option value="${esc(t.id)}" ${v === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
      const games = awardGames(s), coaches = awardCoaches();
      const field = d => {
        const v = P[d.key];
        if (d.type === 'player') return `<div class="awrow"><input data-aw="${d.key}" data-awf="name" value="${esc(v?.name || '')}" placeholder="Player name" autocomplete="off" maxlength="40" ${dis} aria-label="${esc(d.label)} player name">${teamSel(d.key, v?.team || '', 'Team')}</div>`;
        if (d.type === 'team') return teamSel(d.key, v || '', 'Pick a team');
        if (d.type === 'game') return `<select data-aw="${d.key}" ${dis} aria-label="${esc(d.label)}"><option value="">Pick a game</option>${games.map(g => `<option value="${esc(g.id)}" ${v === g.id ? 'selected' : ''}>${esc(awardGameLabel(g))}</option>`).join('')}</select>`;
        return `<select data-aw="${d.key}" ${dis} aria-label="${esc(d.label)}"><option value="">Pick a coach</option>${coaches.map(c => `<option ${v === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
      };
      html += `<div class="card awballot"><p class="muted small" style="margin-top:0">Type in player names and pick their team; pick from the lists for the rest. Skip any you're not sure about. You can change your ballot until voting closes after bowl season.</p>
        ${AWARD_DEFS.map(d => `<div class="awcat"><h3>${d.key === 'coty' ? '🏅 ' : ''}${esc(d.label)}</h3>${field(d)}</div>`).join('')}
        ${canVote ? `<button data-act="ballot" style="margin-top:12px">${ballot.id ? 'Update ballot' : 'Submit ballot'}</button>` : ''} <span id="bmsg" class="muted"></span></div>`;
    }
    return html;
  },



  history() {
    // Coaching Carousel: where every coach was each season, with their record.
    const carousel = C => {
      const seas = [...new Set(D.games.filter(played).map(g => g.season))].sort((a, b) => a - b); if (!seas.length) return '';
      const rows = C.map(c => ({ c, by: Object.fromEntries(coachSeasons(c.name).map(x => [x.season, x])) }));
      return `<h2>Coaching Carousel</h2><div class="card"><div class="tablewrap"><table class="carousel"><tr><th>Coach</th>${seas.map(s => `<th class="num">S${seasonNum(s)}<div class="muted small" style="font-weight:600">${s}</div></th>`).join('')}</tr>
        ${rows.map(({ c, by }) => `<tr><td><a href="#coach/${slug(c.name)}">${esc(c.name)}</a></td>${seas.map(s => { const x = by[s]; return `<td class="num">${x ? `${x.teams.map(id => `<a class="ctm" href="#team/${esc(id)}${s === D.league.season ? '' : '/' + s}"><i class="sw" style="background:${esc(teamColor(team(id)))}"></i>${esc(team(id).abbr || team(id).name)}</a>`).join(' ')}<div class="small"><b>${x.w}-${x.l}</b>${x.finish === 'champ' ? ' 🏆' : (() => { const P = seasonPlaces(s), p = P.places[c.name.toLowerCase()]; return p ? ` <span class="muted">· ${ordinal(p)}</span>` : ''; })()}</div>` : '<span class="muted">–</span>'}</td>`; }).join('')}</tr>`).join('')}
      </table></div><p class="muted small" style="margin-bottom:0">Team, record and finish each season (🏆 = league champion; the current season shows the order so far). Finish after the title game is by regular-season record, then head-to-head, then point differential.</p></div>`;
    };
    const H = D.history.slice().sort((a, b) => b.season - a.season), C = Object.values(coachStats()).sort((a, b) => b.titles - a.titles || (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)));
    const champLine = h => h.champCoach ? `${esc(h.champCoach)} over ${esc(h.runnerCoach || 'CPU')} — ${esc(team(h.champTeam).name)} ${h.champScore ?? ''}, ${esc(team(h.runnerTeam).name)} ${h.runnerScore ?? ''}` : esc(h.summary || '');
    return `<h2>League Champions</h2><div class="card">${H.length ? H.map(h => `<div class="champ"><div class="yr">S${seasonNum(h.season)}<div class="muted small" style="font-family:system-ui">${h.season}</div></div><div>${(() => { const g = D.games.find(x => x.season === h.season && x.type === 'ccg' && played(x)); return g ? `<a class="reclink" href="#game/${esc(g.id)}"><b>${champLine(h)}</b></a>` : `<b>${champLine(h)}</b>`; })()}${h.notes ? `<div class="muted small">${esc(h.notes)}</div>` : ''}</div></div>`).join('') : '<div class="muted">No completed seasons yet.</div>'}</div>
      ${seasonAwardsCard(H)}
      ${coachBoard()}
      ${carousel(C)}`;
  },

  rules() {
    const L = D.league;
    return `<h2>League Rules</h2><div class="card"><ul class="clean">${((L.rules && L.rules.length) ? L.rules : DEFAULT_RULES).map(r => `<li>${esc(r)}</li>`).join('') || '<li class="muted">No rules posted.</li>'}</ul></div>
      <h2>How Betting Works</h2><div class="card"><ul class="clean"><li>Every linked coach starts each season with ${START_CREDITS.toLocaleString()} Crackers. Crackers don't carry over.</li>
      <li>Busted? If you're at 0 Crackers with nothing in play when the league advances, you get ${RELIEF}. It doesn't stack and it doesn't count as winnings.</li>
      <li>Lines are posted for every upcoming game, so you can bet future weeks early. Every bet pays the listed +/− odds. Spread and total payouts move around −110 based on the model's edge on the line, key numbers (3, 7, 10, 14) and each team's recent form.</li>
      <li>Each advance re-rates every team from the results, so lines for all later weeks move. Your bet keeps the line it was placed at.</li>
      <li>A game locks once the commissioner enters its score or locks betting.</li>
      <li><b>No betting on yourself.</b> Coaches can't bet on their own games (spread, moneyline or total, alone or in a parlay), their own team's win total, or their own team's title odds. Bets placed before this rule stand.</li></ul></div>
      ${(L.links || []).length ? `<h2>Links</h2><div class="card"><ul class="clean">${L.links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul></div>` : ''}`;
  },

  account() {
    if (auth.user) {
      const p = auth.profile;
      return `<h2>My Account</h2><div class="card"><p>Signed in as <b>${esc(p?.name || auth.user.email)}</b>${p?.teamId ? ' · ' + chip(p.teamId) : ''}${p?.role === 'commish' ? ' · <span class="tag gold">Commissioner</span>' : ''}</p>
        ${p && !p.teamId ? `<div class="notice">You're a <b>spectator</b>: you can follow everything and bet with ${START_CREDITS.toLocaleString()} Crackers a season. If you join the league, the commissioner will link your account to your team.</div>` : ''}<button class="ghost" data-act="logout">Log out</button></div>${pushCard()}`;
    }
    const m = UI.acct;
    return `<h2>Log In</h2><div class="card" style="max-width:440px">${DEMO ? '<div class="notice">Demo mode: any email works. Password <b>coach</b> logs in as a regular coach; anything else logs in as the commissioner.</div>' : ''}
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
  const own = ownGame(g);
  const b = (market, pick, top, odds) => own ? `<span class="pick off">${top} <b>${fmtOdds(odds)}</b></span>` : `<button class="pick${UI.mode === 'parlay' && UI.legs.some(x => x.gameId === g.id && x.market === market && x.pick === pick) ? ' sel' : ''}" data-bet="${esc(g.id)}|${market}|${pick}">${top} <b>${fmtOdds(odds)}</b></button>`;
  const isG = gotwGameId() === g.id, champ = g.type === 'ccg';
  return `<div class="betgame${isG || champ ? ' gotw' : ''}${own ? ' own' : ''}">${isG ? `<span class="ribbon">★ Game of the Week · +${Math.round((GOTW_BOOST - 1) * 100)}% profit boost</span>` : champ ? `<span class="ribbon">${champRibbon()}${played(g) ? '' : ` · +${Math.round((CCG_BOOST - 1) * 100)}% profit boost`}</span>` : ''}<div class="tm matchup">${chip(a.id, { season: g.season, week: g.week, href: '#game/' + g.id })}<span class="at">${g.neutral ? 'vs' : '@'}</span>${chip(h.id, { season: g.season, week: g.week, href: '#game/' + g.id })}${gameTags(g)}</div>${own ? '<span class="ownnote">Your game · no betting</span>' : ''}${probBar(g, l, false, 'tm')}
    <div style="display:grid;gap:4px">${b('spread', 'away', esc(a.abbr) + ' ' + fmtLine(-l.spread), juiceOf(l, 'spread', 'away'))}${b('spread', 'home', esc(h.abbr) + ' ' + fmtLine(l.spread), juiceOf(l, 'spread', 'home'))}</div>
    <div style="display:grid;gap:4px">${b('ml', 'away', esc(a.abbr), l.mlAway)}${b('ml', 'home', esc(h.abbr), l.mlHome)}</div>
    <div style="display:grid;gap:4px">${b('total', 'over', 'O ' + l.total, juiceOf(l, 'total', 'over'))}${b('total', 'under', 'U ' + l.total, juiceOf(l, 'total', 'under'))}</div>
    ${l.ttHome != null ? `<div class="ttrow">${[['tta', a, l.ttAway], ['tth', h, l.ttHome]].map(([m, t, v]) => `<span class="ttname">${esc(t.abbr)} team total</span>${b(m, 'over', 'O ' + v, juiceOf(l, m, 'over'))}${b(m, 'under', 'U ' + v, juiceOf(l, m, 'under'))}`).join('')}</div>` : ''}</div>`;
}
function myWagersHtml(me, s, open) {
    let myW = '';
    if (me) {
      const all = D.wagers.filter(w => w.uid === me.id && w.season === s && !w.deleted).sort((a, b) => b.week - a.week || (b.ts || 0) - (a.ts || 0));
      // Filter chips: All / Open / Won / Lost / Cashed out / Push (pushes and voids together). Empty groups are hidden.
      const grp = w => w.status === 'void' ? 'push' : w.status;
      const FL = [['all', 'All'], ['open', 'Open'], ['won', 'Won'], ['lost', 'Lost'], ['cashed', 'Cashed out'], ['push', 'Push / void']];
      const cnt = k => k === 'all' ? all.length : all.filter(w => grp(w) === k).length;
      const cur = FL.some(([k]) => k === UI.betFilter) && cnt(UI.betFilter) ? UI.betFilter : 'all';
      const mine = cur === 'all' ? all : all.filter(w => grp(w) === cur);
      myW += all.length ? `<div class="bfilters">${FL.filter(([k]) => cnt(k)).map(([k, l]) => `<button class="bfilter${k === cur ? ' on' : ''}" data-bfilter="${k}">${l} <span>${cnt(k)}</span></button>`).join('')}</div>` : '';
      // One block per wager: the bet gets the full width; stake, time, result and buttons sit underneath.
      const whenOf = (w, g) => w.market === 'future' ? 'Title' : w.market === 'wins' ? 'Win total' : w.market === 'parlay' ? 'Parlay' : g ? gWeek(g) : 'Week ' + w.week;
      const resOf = w => w.status === 'open' ? `Open · to win ${winProfit(w).toLocaleString()}` : w.status === 'cashed' ? `Cashed out +${(w.payout || 0).toLocaleString()}` : (w.status === 'void' ? 'Void · refunded' : w.status === 'won' ? 'Won' : w.status === 'lost' ? 'Lost' : 'Push') + (w.payout ? ' ' + (w.payout > 0 ? '+' : '') + w.payout.toLocaleString() : '');
      myW += `<div class="card">${mine.length ? `<div class="wlist">${mine.map(w => { const g = D.games.find(x => x.id === w.gameId); const canCancel = w.status === 'open' && w.market !== 'parlay' && (w.market === 'future' || w.market === 'wins' ? futuresOpen() && !(w.market === 'future' && titleOut(w.season).has(w.pick)) : open && g && !played(g));
          return `<div class="wager"><div class="wtop"><div class="wlbl">${esc(wagerLabel(w))}${w.boost ? ` <span class="boosttag">⚡ +${Math.round((w.boost - 1) * 100)}%</span>` : ''}</div><span class="pill ${w.status}">${resOf(w)}</span></div>${legsHtml(w)}
            <div class="wbot"><span class="wmeta"><b>${w.stake.toLocaleString()}</b> staked · ${whenOf(w, g)} · ${fmtTime(w.ts)}</span><span class="wact"><button class="sm ghost" data-slip="${esc(w.id)}" title="Bet slip image" aria-label="Bet slip image">🧾</button>${canCancel ? `<button class="sm ghost" data-cancel="${esc(w.id)}">Cancel</button>` : ''}${(() => { const co = cashOutValue(w); return co ? `<button class="sm gold" data-cashout="${esc(w.id)}">Cash out ${co.total.toLocaleString()}</button>` : ''; })()}</span></div></div>`; }).join('')}</div>` : '<div class="muted">No wagers yet this season.</div>'}</div>`;
    }
    return myW;
}
function futuresSection() {
  const L = D.league, n = seasonNum();
  const board = futuresBoard();
  let h = `<h2>Season ${n} League Champion</h2>`;
  if (!board.length) return h + `<div class="card empty">Futures are open during the regular season. ${L.phase === PHASES.PRE ? 'They open when the season is published.' : 'Betting has closed for this season; open bets settle when the championship is decided.'}</div>`;
  // Closed for the title game: either this device already has the game, or the league says futures are shut.
  const open = champOpen() && futuresPosted(), set = titleSet() || (L.futures && L.futures.season === L.season && L.futures.open === false && L.phase === PHASES.REG);
  const live = board.filter(r => r.odds != null), dead = board.filter(r => r.odds == null);
  const deadLine = (list, label) => list.length ? `<div class="offboard"><span>${label}</span>${list.map(r => chip(r.id, { abbr: true, rank: false })).join('')}</div>` : '';
  h += `<div class="card"><p class="muted small" style="margin-top:0">Pick the ${esc(L.conference)} champion${board[0].posted ? '' : ' (odds projected until this week\'s lines post)'}. Your odds lock when you bet, it pays when the title game is final, and a team that's eliminated loses right away.</p>
    <div class="tablewrap"><table class="compact"><tr><th>Team</th><th class="num">Chance</th><th class="num">Odds</th></tr>
    ${live.map(r => { const t = team(r.id); return `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td>${chip(r.id)} <span class="muted small">${isUserTeam(t) ? esc(t.coach) : 'CPU'}</span></td><td class="num">${pctStr(r.p)}</td>
      <td class="num">${open && r.id !== myTeam()?.id ? `<button class="pick${UI.mode === 'parlay' && UI.legs.some(x => x.market === 'future' && x.pick === r.id) ? ' sel' : ''}" data-fut="${esc(r.id)}"><b>${fmtOdds(r.odds)}</b></button>` : `<b>${fmtOdds(r.odds)}</b>`}</td></tr>`; }).join('')}
    </table></div>${deadLine(dead.filter(r => r.out), 'Eliminated')}${deadLine(dead.filter(r => !r.out), 'Off the board')}${open ? '' : set ? `<p class="muted small">🔒 Closed: the title game is set${(() => { const c = D.games.find(g => g.season === L.season && g.type === 'ccg'); return c ? ' (' + esc(team(c.away).abbr || team(c.away).name) + ' vs ' + esc(team(c.home).abbr || team(c.home).name) + ')' : ''; })()}, so bet its moneyline instead. Open bets still pay when it's final.</p>` : futuresOpen() ? '<p class="muted small">Futures odds open once the commissioner posts this week\'s lines.</p>' : '<p class="muted small">Betting is locked right now.</p>'}</div>`;
  return h;
}
function winsSection() {
  const L = D.league, rows = winsBoard();
  let h = `<h2>Season ${seasonNum()} Win Totals</h2>`;
  if (!rows.length) return h + `<div class="card empty">Win totals are open during the regular season.</div>`;
  const open = futuresOpen() && winsPosted();
  const btn = (r, pick) => { const o = r.o; if (!o) return ''; const odds = pick === 'over' ? o.over : o.under;
    return open && r.id !== myTeam()?.id ? `<button class="pick${UI.mode === 'parlay' && UI.legs.some(x => x.market === 'wins' && x.team === r.id && x.pick === pick) ? ' sel' : ''}" data-wins="${esc(r.id)}|${pick}">${pick === 'over' ? 'O' : 'U'} ${o.line} <b>${fmtOdds(odds)}</b></button>` : `${pick === 'over' ? 'O' : 'U'} ${o.line} <b>${fmtOdds(odds)}</b>`; };
  const live = rows.filter(r => r.o), dead = rows.filter(r => !r.o);
  h += `<div class="card">
    <div class="tablewrap"><table class="compact"><tr><th>Team</th><th class="num hide-sm">Record</th><th class="num hide-sm">Proj.</th><th class="num">Over</th><th class="num">Under</th></tr>
    ${live.map(r => `<tr class="${myTeam()?.id === r.id ? 'me' : ''}"><td>${chip(r.id)} <span class="muted small hide-sm">${esc(team(r.id).coach || '')}</span>${subSm(`${esc(team(r.id).coach || '')} · ${r.w}-${regRec(r.id).l} · proj ${r.proj.toFixed(1)}`)}</td><td class="num hide-sm">${r.w}-${(regRec(r.id)).l}</td><td class="num hide-sm">${r.proj.toFixed(1)}</td>
      <td class="num">${btn(r, 'over')}</td><td class="num">${btn(r, 'under')}</td></tr>`).join('')}
    </table></div>${dead.length ? `<div class="offboard"><span>Off the board</span>${dead.map(r => chip(r.id, { abbr: true, rank: false })).join('')}</div>` : ''}${open ? '' : futuresOpen() ? '<p class="muted small">Win totals open once the commissioner posts this week\'s lines.</p>' : '<p class="muted small">Betting is locked right now.</p>'}</div>`;
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
    if (c.leg.market === 'future') return champOpen() && futuresPosted();
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
  const btn = ownLeg(p.cur) ? '<span class="pill">Your game · no betting</span>' : UI.mode === 'parlay' ? `<button class="${inSlip ? 'ghost' : 'gold'}" data-popular="1">${inSlip ? '✓ In your parlay' : '+ Add to parlay'}</button>`
    : mine ? '<span class="pill open">✓ You\'re on this</span>' : '<button class="gold" data-popular="1">Bet it</button>';
  return `<div class="card popular"><span class="ribbon">🔥 Most Popular Bet · ${esc(weekLabel())}</span>
    <div class="vtop"><div style="min-width:0"><div class="pop-title">${esc(row.t)}</div><div class="muted small">${esc(row.s)}</div></div><div class="big vodds">${fmtOdds(p.cur.odds)}</div></div>
    <div class="vfoot"><div class="small" style="margin-right:auto"><b>${p.n}</b> bet${p.n === 1 ? '' : 's'} from <b>${p.coaches.size}</b> coach${p.coaches.size === 1 ? '' : 'es'} this week</div>${btn}</div></div>`;
}
/* ---- Hidden Value: an overlooked bet the scoring averages like better than the line does ----
   The lines come from the ratings model, so the second opinion is a plain scoring-average projection:
   each side's points = (its points per game + opponent's points allowed per game) / 2, plus home field.
   When that projection beats the posted spread/total by 2+ points (or says an underdog wins outright),
   and few coaches are on it this week, it's a candidate. Fewer bets on it ranks higher. */
const VALUE_MIN_EDGE = 2;
function valuePick(games) {
  const L = D.league, s = L.season, counts = {};
  D.wagers.filter(w => w.season === s && w.status !== 'void').forEach(w => (w.market === 'parlay' ? (w.legs || []) : [w]).forEach(l => { const k = selKey(l); counts[k] = (counts[k] || 0) + 1; }));
  const best = [];
  games.filter(g => !played(g) && L.bettingOpen && g.week >= L.week && !ownGame(g)).forEach(g => {
    const l = lineOf(g); if (!l) return;
    const PH = teamProfile(g.home, s), PA = teamProfile(g.away, s); if (PH.gp < 2 || PA.gp < 2) return;
    const ppg = P => P.pf / P.gp, papg = P => P.pa / P.gp;
    const projH = (ppg(PH) + papg(PA)) / 2 + (g.neutral ? 0 : 1.25), projA = (ppg(PA) + papg(PH)) / 2 - (g.neutral ? 0 : 1.25);
    const margin = projH - projA, tot = projH + projA;
    const add = (market, pick, edge, why) => {
      const sel = { gameId: g.id, market, pick }, odds = market === 'ml' ? (pick === 'home' ? l.mlHome : l.mlAway) : juiceOf(l, market, pick);
      if (edge < VALUE_MIN_EDGE || odds < -135) return;
      const n = counts[selKey(sel)] || 0;
      best.push({ g, l, market, pick, odds, edge, n, why, projH, projA, PH, PA, score: edge - 1.5 * n + (odds > 0 ? 0.5 : 0) });
    };
    add('spread', 'home', margin + l.spread, 'spread'); add('spread', 'away', -(margin + l.spread), 'spread');
    add('total', 'over', tot - l.total, 'total'); add('total', 'under', l.total - tot, 'total');
    if (l.ttHome != null) { add('tth', 'over', projH - l.ttHome, 'tt'); add('tth', 'under', l.ttHome - projH, 'tt'); add('tta', 'over', projA - l.ttAway, 'tt'); add('tta', 'under', l.ttAway - projA, 'tt'); }
    // Underdog moneyline when the averages say the dog wins outright.
    if (l.mlAway >= 120 && margin < 0) add('ml', 'away', -margin + 1, 'ml');
    if (l.mlHome >= 120 && margin > 0) add('ml', 'home', margin + 1, 'ml');
  });
  best.sort((x, y) => y.score - x.score);
  return best[0] || null;
}
function valueCard(games) {
  const L = D.league; if (L.phase === PHASES.PRE || L.phase === PHASES.POST) return '';
  const v = valuePick(games);
  const wkl = games.length && games[0].week !== L.week ? wkName(games[0].week) : weekLabel();
  const head = `<span class="ribbon vrib">💎 Hidden Value · ${esc(wkl)}</span>`;
  if (!v) return `<div class="card popular value">${head}<div class="muted">Nothing stands out this week: the lines and the teams' scoring averages agree. Check back after scores come in.</div></div>`;
  const { g, l, market, pick, odds, edge, n, projH, projA, PH, PA } = v, s = L.season;
  const side = pick === 'home' ? g.home : g.away, other = pick === 'home' ? g.away : g.home, T = team(side), O = team(other);
  const nm = t => esc(t.name), f1 = x => x.toFixed(1), P = pick === 'home' ? PH : PA;
  const rec3 = a => `${a[0]}-${a[1]}${a[2] ? '-' + a[2] : ''}`;
  const row = slipRows({ gameId: g.id, market, pick, odds, line: lineVal(l, market), season: s })[0];
  const why = [];
  if (market === 'tth' || market === 'tta') {
    // Team total: that team's projected points vs its line, from its scoring and the opponent's defense.
    const home = market === 'tth', TT = team(home ? g.home : g.away), OO = team(home ? g.away : g.home), PT = home ? PH : PA, PO = home ? PA : PH;
    const line = home ? l.ttHome : l.ttAway, proj = home ? projH : projA, over = pick === 'over';
    why.push(`${nm(TT)} projects to <b>${f1(proj)}</b> points (it scores ${f1(PT.pf / PT.gp)} a game; ${nm(OO)} allows ${f1(PO.pa / PO.gp)}), ${over ? 'above' : 'below'} its team total of ${line} by ${f1(edge)}.`);
    const pts = D.games.filter(x => x.season === s && played(x) && !x.forfeit && (x.home === TT.id || x.away === TT.id)).map(x => x.home === TT.id ? +x.homeScore : +x.awayScore);
    const hit = pts.filter(p => over ? p > line : p < line).length;
    if (pts.length) why.push(`${nm(TT)} has ${over ? 'scored more than' : 'been held under'} ${line} in <b>${hit} of ${pts.length}</b> games this season.`);
  } else if (market === 'total') {
    why.push(`${nm(team(g.away))} and ${nm(team(g.home))} project to <b>${f1(projH + projA)}</b> combined points on season averages, ${pick === 'over' ? 'above' : 'below'} the total of ${l.total} by ${f1(edge)}.`);
    const oh = PH.ou, oa = PA.ou, ov = pick === 'over' ? oh[0] + oa[0] : oh[1] + oa[1], gp = oh[0] + oh[1] + oa[0] + oa[1];
    if (gp) why.push(`Their games have gone <b>${pick} in ${ov} of ${gp}</b> this season.`);
  } else {
    const lineTxt = market === 'spread' ? `${T.abbr || T.name} ${fmtLine(pick === 'home' ? l.spread : -l.spread)}` : `${T.abbr || T.name} to win outright`;
    const m = (pick === 'home' ? projH - projA : projA - projH);
    why.push(`Season scoring averages have ${nm(T)} ${m >= 0 ? `winning by <b>${f1(m)}</b>` : `losing by only <b>${f1(-m)}</b>`}, a ${f1(edge)}-point edge on ${esc(lineTxt)}.`);
    // One supporting stat, picked from whichever actually backs the bet.
    const OP = pick === 'home' ? PA : PH, dogNow = (pick === 'home' ? l.pHome : 1 - l.pHome) < 0.5;
    const back = [];
    if (P.ats[0] > P.ats[1]) back.push(`${nm(T)} ${P.ats[0] - P.ats[1] >= 2 ? 'has been a cover machine at' : 'is'} <b>${rec3(P.ats)} against the spread</b> this season.`);
    if (OP.ats[1] > OP.ats[0]) back.push(`${nm(O)} is just <b>${rec3(OP.ats)} against the spread</b> this season.`);
    if (dogNow && P.dog[0] + P.dog[1] && P.dog[0] >= P.dog[1]) back.push(`${nm(T)} is <b>${P.dog[0]}-${P.dog[1]} straight up as an underdog</b>.`);
    if (dogNow && OP.fav[1] >= 2) back.push(`${nm(O)} has lost <b>${OP.fav[1]} game${OP.fav[1] === 1 ? '' : 's'} as a favorite</b> (${OP.fav[0]}-${OP.fav[1]}).`);
    const papgT = P.pa / P.gp, papgO = OP.pa / OP.gp;
    if (papgT + 3 < papgO) back.push(`${nm(T)}'s defense allows <b>${f1(papgT)}</b> points a game, ${f1(papgO - papgT)} fewer than ${nm(O)}'s.`);
    if (back.length) why.push(back[0]);
  }
  const inSlip = UI.mode === 'parlay' && UI.legs.some(x => selKey(x) === selKey({ gameId: g.id, market, pick }));
  const mine = auth.profile && D.wagers.some(w => w.uid === auth.profile.id && w.status === 'open' && w.market !== 'parlay' && selKey(w) === selKey({ gameId: g.id, market, pick }));
  const btn = UI.mode === 'parlay' ? `<button class="${inSlip ? 'ghost' : 'gold'}" data-value="${esc(g.id)}|${market}|${pick}">${inSlip ? '✓ In your parlay' : '+ Add to parlay'}</button>`
    : mine ? '<span class="pill open">✓ You\'re on this</span>' : `<button class="gold" data-value="${esc(g.id)}|${market}|${pick}">Bet it</button>`;
  return `<div class="card popular value">${head}
    <div class="vtop"><div style="min-width:0"><div class="pop-title">${esc(row.t)}</div><div class="muted small">${esc(row.s)}</div></div><div class="big vodds">${fmtOdds(odds)}</div></div>
    <ul class="vwhy">${why.map(w => `<li>${w}</li>`).join('')}<li>${n === 0 ? 'No one in the league has bet it yet.' : `Only <b>${n}</b> bet${n === 1 ? '' : 's'} on it so far.`}</li></ul>
    <div class="vfoot">${btn}</div></div>`;
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
// Live updates (no polling): refresh the Most Popular Bet card when bets change, and the live pop-up when the league doc changes.
// When league data changes underneath an open page (a score saved, the title game posted, an advance), redraw the
// page so nobody has to reload. Waits a moment so a burst of updates redraws once, and never interrupts typing,
// an open pop-up or a bet slip in progress.
let _redraw = null;
const quietRedraw = () => {
  const a = document.activeElement;
  if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return false;
  if ($('#modal') && $('#modal').innerHTML.trim()) return false;
  if (UI.legs && UI.legs.length) return false;
  const y = scrollY; route(); scrollTo(0, y); return true;
};
onLiveChange(what => {
  if (what === 'wagers') { const el = document.getElementById('popular'); if (el) el.innerHTML = popularCard(); }
  if (what === 'league') checkLive();
  if (['games', 'league', 'teams', 'history', 'gotw'].includes(what)) {
    clearTimeout(_redraw);
    const tryIt = (n) => { _redraw = setTimeout(() => { if (!quietRedraw() && n < 20) tryIt(n + 1); }, n ? 3000 : 800); };
    tryIt(0);
  }
});

/* ---------- Shareable bet slip image ---------- */
async function placeWager(data) {
  const id = newId();
  const legs = data.market === 'parlay' ? (data.legs || []) : (GAME_MARKETS.includes(data.market) ? [data] : []);
  const b = boostFor(legs); if (b) data.boost = b;
  await put('wagers', id, data, false);
  UI.placed = { ...data, id };
}
function slipRows(w) {
  const legs = w.market === 'parlay' ? (w.legs || []) : [w];
  return legs.map(l => {
    const g = D.games.find(x => x.id === l.gameId), side = g ? (l.pick === 'home' ? g.home : g.away) : null;
    const rn = id => rankName(id, g.season, g.week);
    const match = g ? `${rn(g.away)} @ ${rn(g.home)} · ${gWeek(g)}` : '';
    if (l.market === 'ml') return { t: `${rn(side)} Moneyline`, s: match, o: l.odds };
    if (l.market === 'spread') return { t: `${rn(side)} ${fmtLine(l.pick === 'home' ? l.line : -l.line)}`, s: 'Spread · ' + match, o: l.odds };
    if (l.market === 'total') return { t: `${l.pick === 'over' ? 'Over' : 'Under'} ${l.line} points`, s: 'Total · ' + match, o: l.odds };
    if (l.market === 'tth' || l.market === 'tta') return { t: `${rn(l.market === 'tth' ? g.home : g.away)} ${l.pick === 'over' ? 'Over' : 'Under'} ${l.line} points`, s: 'Team total · ' + match, o: l.odds };
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
    const txt = `⚡ ${boostName(w.boost).toUpperCase()} · +${Math.round((w.boost - 1) * 100)}% PROFIT BOOST`;
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
  UI.slipCanvas = c; UI.slipW = w;
  const tailable = w.id && (w.status === 'open' || !w.status);
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card" style="max-width:460px;max-height:92vh;overflow:auto">
    <h2>${w.status === 'open' || !w.status ? 'Bet placed!' : w.status === 'won' ? '🎉 Winner!' : 'Bet slip'}</h2><img src="${url}" alt="Bet slip" style="width:100%;border-radius:10px;display:block">
    ${tailable ? `<div class="taillink"><div class="muted small">Let the league tail it:</div><div class="tailurl">${esc(tailText(w))}</div></div>` : ''}
    <div class="row" style="margin-top:12px"><button class="gold" data-act="saveSlip">${tailable ? '📤 Share slip + link' : '⬇ Save image'}</button>${tailable ? '<button class="ghost" data-act="copyTail">Copy link</button>' : ''}<button class="ghost" data-close="1">Done</button></div>
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
// ---- Tailing: every open bet has a link that loads the same picks into the viewer's slip at today's prices. ----
const tailUrl = w => `${location.origin}${location.pathname}#tail/${w.id}`;
const tailText = w => `I just placed a bet. Check it out and tail it here: ${tailUrl(w)}`;
async function copyTail() {
  const w = UI.slipW; if (!w) return;
  try { await navigator.clipboard.writeText(tailText(w)); alert('Link copied. Paste it with your slip.'); }
  catch (e) { prompt('Copy this link:', tailText(w)); }
}
function tailBet(id) {
  const w = D.wagers.find(x => x.id === id), me = auth.profile; if (!w) return;
  const legs = (w.market === 'parlay' ? w.legs : [w]).map(l => legFor(l.gameId || '', l.market, l.pick, l.team)).filter(Boolean);
  const ok = legs.filter(l => !ownLeg(l, me)), dropped = legs.length - ok.length;
  if (!ok.length) return alert(dropped ? OWN_BET_MSG : 'This bet can\'t be tailed anymore: its games have started or its lines are off the board.');
  location.hash = '#betting';
  setTimeout(() => {
    if (ok.length === 1 && w.market !== 'parlay') {
      const l = ok[0]; UI.mode = 'single'; route();
      if (l.market === 'future') showFutureSlip(l.pick); else if (l.market === 'wins') showWinsSlip(l.team, l.pick); else showSlip(l.gameId, l.market, l.pick);
    } else { UI.mode = 'parlay'; UI.legs = ok.slice(0, MAX_LEGS); route(); }
    const moved = (w.market === 'parlay' ? w.legs : [w]).some(o => { const n = ok.find(x => x.gameId === (o.gameId || '') && x.market === o.market && x.pick === o.pick); return n && (n.odds !== o.odds || (n.line ?? null) !== (o.line ?? null)); });
    if (dropped || moved || ok.length < legs.length) setTimeout(() => alert([dropped ? `${dropped} pick${dropped === 1 ? '' : 's'} on your own team's games ${dropped === 1 ? 'was' : 'were'} left out.` : '', moved ? 'Some lines have moved since it was placed; your slip uses today\'s prices.' : ''].filter(Boolean).join(' ')), 300);
  }, 50);
}
// Status cell for bet lists: someone else's open bet shows a "Tail" pill instead of "open" (same size and spot,
// so the list doesn't get busier). On the narrowest phones the status column is hidden, so the pill also sits under the coach.
const canTail = w => (w.status === 'open' || !w.status) && !w.deleted && auth.profile && w.uid !== auth.profile.id;
const statusPill = w => canTail(w) ? `<button class="pill tailpill" data-tailgo="${esc(w.id)}" title="Load this bet into your slip">Tail ›</button>` : `<span class="pill ${esc(w.status || 'open')}">${esc(w.status || 'open')}</span>`;
const coachCell = w => `${esc(w.coach || '')}${canTail(w) ? `<div class="show-xs"><button class="pill tailpill" data-tailgo="${esc(w.id)}">Tail ›</button></div>` : ''}`;
async function showTailModal(id) {
  const w = D.wagers.find(x => x.id === id);
  if (!w || w.deleted) { $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card" style="max-width:420px"><h2>Bet not found</h2><p class="muted">That bet isn't available anymore.</p><button class="ghost" data-close="1">Close</button></div></div>`; return; }
  const c = await drawSlip(w), open = w.status === 'open' || !w.status, mine = auth.profile && w.uid === auth.profile.id;
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card" style="max-width:460px;max-height:92vh;overflow:auto">
    <h2>${mine ? 'Your bet' : `${esc(w.coach || 'A coach')}'s bet`}</h2><img src="${c.toDataURL('image/png')}" alt="Bet slip" style="width:100%;border-radius:10px;display:block">
    <div class="row" style="margin-top:12px">${open && !mine ? `<button class="gold" data-tailgo="${esc(w.id)}">Tail this bet →</button>` : ''}<button class="ghost" data-close="1">${open && !mine ? 'Not now' : 'Close'}</button></div>
    <p class="muted small" style="margin-bottom:0">${!open ? 'This bet is already settled.' : mine ? 'Share this slip so others can tail it.' : 'Tailing loads the same picks into your slip at today\'s prices. You pick your own stake.'}</p></div></div>`;
}
function showPlacedSlip() { const w = UI.placed; UI.placed = null; if (w) showSlipImage(w); }
async function saveSlip() {
  const c = UI.slipCanvas; if (!c) return;
  const blob = await new Promise(r => c.toBlob(r, 'image/png')), name = 'oec-bet-slip.png';
  try {
    const file = new File([blob], name, { type: 'image/png' });
    const w = UI.slipW, text = w && w.id && (w.status === 'open' || !w.status) ? tailText(w) : '';
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'OEC bet slip', ...(text ? { text } : {}) }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
/* ---------- Broadcast cheat sheet (game preview) ----------
   One tall image a commentator can save and keep open on a second screen: matchup, line, tale of the tape,
   recent form, series history, what's at stake and talking points. */
function lastResults(tid, s, n = 3) {
  return D.games.filter(g => g.season === s && played(g) && (g.home === tid || g.away === tid)).sort((a, b) => b.week - a.week).slice(0, n).map(g => {
    const home = g.home === tid, my = home ? +g.homeScore : +g.awayScore, th = home ? +g.awayScore : +g.homeScore, o = team(home ? g.away : g.home);
    return { w: my > th, t: `${g.forfeit ? (my > th ? 'FW' : 'FL') : `${my > th ? 'W' : 'L'} ${my}-${th}`} ${g.neutral ? 'vs' : home ? 'vs' : 'at'} ${o.abbr || o.name}`, wk: g.week };
  });
}
function betAction(g) {
  const legs = D.wagers.filter(w => w.status !== 'void' && !w.deleted).flatMap(w => (w.market === 'parlay' ? (w.legs || []) : [w]).map(l => ({ ...l, coach: w.coach })))
    .filter(l => l.gameId === g.id && GAME_MARKETS.includes(l.market));
  if (!legs.length) return null;
  const by = {}; legs.forEach(l => { const k = l.market + '|' + l.pick; (by[k] = by[k] || []).push(l); });
  const top = Object.values(by).sort((a, b) => b.length - a.length)[0];
  return { n: legs.length, top: wagerLabel({ ...top[0], odds: undefined }).replace(/\s*\(.*\)$/, ''), topN: top.length };
}
async function drawCheat(C) {
  // One phone screen (1080 x 2340, the shape of an iPhone screenshot).
  const { g, A, H, l, p, fav, done } = C, s = g.season, W = 1080, HT = 2340, P = 52, IW = W - 2 * P;
  const F = '"Arial Black","Segoe UI Black",Impact,system-ui,sans-serif', B = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const BG = '#0b0b0d', CARD = '#17141a', LINE = '#2c262b', TXT = '#f4f1f2', MUT = '#a9a1a6', GOLD = '#f5b82e', RED = '#c8102e', GRN = '#3ecf6e', BAD = '#ff8a8f';
  const c = document.createElement('canvas'); c.width = W; c.height = HT;
  const x = c.getContext('2d');
  x.fillStyle = BG; x.fillRect(0, 0, W, HT);
  const font = (sz, f = B, w = '600') => { x.font = `${w} ${sz}px ${f}`; };
  const text = (t, X, Y, col = TXT, align = 'left') => { x.fillStyle = col; x.textAlign = align; x.fillText(t, X, Y); };
  const fit = (t, sz, maxW, f = F, w = '900') => { let z = sz; font(z, f, w); while (x.measureText(t).width > maxW && z > 16) { z -= 2; font(z, f, w); } return z; };
  const card = (Y, h) => { x.fillStyle = CARD; x.beginPath(); x.roundRect(P - 14, Y, IW + 28, h, 20); x.fill(); };
  const label = (t, Y) => { font(21, B, '800'); x.save(); x.letterSpacing = '3px'; text(t.toUpperCase(), P, Y, GOLD); x.restore(); };
  const pc = v => pctStr(v);
  let y;
  // Header
  x.fillStyle = RED; x.fillRect(0, 0, W, 10);
  const logo = await loadImg('logo.png');
  if (logo) { const h = 76, w = logo.width * h / logo.height; x.drawImage(logo, P, 34, w, h); }
  font(22, B, '800'); x.save(); x.letterSpacing = '4px'; text('BROADCAST CHEAT SHEET', W - P, 64, GOLD, 'right'); x.restore();
  font(24, B, '600'); text(`Season ${seasonNum(s)} · ${g.type === 'ccg' ? 'Championship' : g.type === 'bowl' ? 'Postseason' : 'Week ' + g.week}${C.isGotw ? ' · ★ GOTW' : ''}`, W - P, 98, MUT, 'right');
  y = 168; fit(C.title, 40, IW); text(C.title, P, y);
  // Teams
  const pbA = playbookOf(A, s, C.coachA), pbH = playbookOf(H, s, C.coachH), pbRow = pbA || pbH ? 36 : 0;
  y += 30; const tTop = y, tH = (done ? 300 : 230) + pbRow; card(tTop, tH);
  const colW = (IW - 90) / 2;
  const side = (t, coach, rkN, recLine, X, al, score) => {
    let Y = tTop + 34;
    x.fillStyle = liftColor(teamColor(t)); x.beginPath(); x.roundRect(al === 'left' ? X : X - 120, Y, 120, 12, 6); x.fill();
    Y += 62; fit((rkN ? '#' + rkN + ' ' : '') + t.name, 46, colW); text((rkN ? '#' + rkN + ' ' : '') + t.name, X, Y, TXT, al);
    Y += 38; fit(recLine, 26, colW, B, '700'); text(recLine, X, Y, TXT, al);
    Y += 36; font(25, B, '600'); text((coach && coach !== 'CPU' ? 'Coach ' + coach : 'CPU') + (mascotOf(t) ? ' · ' + mascotOf(t) : ''), X, Y, GOLD, al);
    if (pbRow) { Y += 36; const pt = pbText(t === A ? pbA : pbH, ' / '); if (pt) { fit(pt, 24, colW, B, '600'); text(pt, X, Y, MUT, al); } }
    if (done) { Y += 72; font(76, F, '900'); text(g.forfeit ? '' : String(score), X, Y, TXT, al); }
  };
  // Overall record + division record (the conference record is left off; everyone is in the MAC)
  const divOnly = t => { t = String(t || ''); return t.includes(',') ? t.replace(/^[^,]+,\s*/, '') : /^\d+-\d+\s+\S/.test(t) ? '' : t; };
  const recL = (t, r) => [rec(records(s)[t.id]), divOnly(r)].filter(Boolean).join(' · ');
  side(A, C.coachA, C.rk.a, recL(A, C.rec.a), P + 6, 'left', g.awayScore);
  side(H, C.coachH, C.rk.h, recL(H, C.rec.h), W - P - 6, 'right', g.homeScore);
  font(40, F, '900'); text(g.neutral ? 'VS' : '@', W / 2, tTop + 112, MUT, 'center');
  y = tTop + tH;
  // Venue + kickoff on one line
  const v = venueOf(g), ko = kickoffOf(g);
  const info = [v ? `📍 ${v.name}${v.city ? ', ' + v.city : ''}` : '', !done && ko ? `🕗 ${fmtKick(ko, true)}` : ''].filter(Boolean).join('   ');
  if (info) { y += 50; fit(info, 26, IW, B, '600'); text(info, W / 2, y, TXT, 'center'); }
  // Line + win chance
  if (l && !g.forfeit) {
    y += 26; const top = y; card(top, 168); const cw = IW / 3; y += 42;
    [['SPREAD', l.spread === 0 ? 'PK' : `${fav.abbr || fav.name} ${fmtLine(-Math.abs(l.spread))}`], ['TOTAL', `O/U ${l.total}`], ['MONEYLINE', `${A.abbr} ${fmtOdds(l.mlAway)} / ${H.abbr} ${fmtOdds(l.mlHome)}`]].forEach(([k, val], i) => {
      const cx = P + cw * i + cw / 2; font(19, B, '800'); text(k, cx, y, MUT, 'center'); fit(val, 32, cw - 14, B, '800'); text(val, cx, y + 40, TXT, 'center'); });
    if (p) {
      const by = top + 122, bx = P + 150, bw = IW - 300, pa = p.a / 100;
      font(24, B, '800'); text(`${A.abbr} ${p.a}%`, bx - 14, by + 12, TXT, 'right'); text(`${p.h}% ${H.abbr}`, bx + bw + 14, by + 12, TXT, 'left');
      x.fillStyle = liftColor(teamColor(A)); x.beginPath(); x.roundRect(bx, by - 6, bw * pa, 20, 10); x.fill();
      x.fillStyle = liftColor(teamColor(H)); x.beginPath(); x.roundRect(bx + bw * pa + 4, by - 6, Math.max(0, bw * (1 - pa) - 4), 20, 10); x.fill();
    }
    y = top + 168;
  }
  // Tale of the tape: the eight that matter most (team ratings folded into one row)
  const T = Object.fromEntries(C.tape.map(r => [r.label, r]));
  const pick = ['Record', 'Points / game', 'Allowed / game', 'Against the spread', 'Over-Under', 'Streak', 'Power rank', 'Title odds'].map(k => T[k]).filter(Boolean);
  if (T.Overall) pick.splice(pick.length - (T['Title odds'] ? 1 : 0), 0, { label: 'OVR / OFF / DEF', a: `${T.Overall.a} / ${T.Offense?.a ?? '–'} / ${T.Defense?.a ?? '–'}`, h: `${T.Overall.h} / ${T.Offense?.h ?? '–'} / ${T.Defense?.h ?? '–'}`, edge: T.Overall.edge });
  y += 52; label('Tale of the tape', y);
  const rh = 46, tt = y + 16; card(tt, pick.length * rh + 62); let ty = tt + 46;
  font(28, B, '900'); text(A.abbr || A.name, P + 18, ty); text(H.abbr || H.name, W - P - 18, ty, TXT, 'right');
  pick.forEach(r => {
    ty += rh; x.fillStyle = LINE; x.fillRect(P, ty - 33, IW, 1);
    font(22, B, '600'); text(r.label, W / 2, ty, MUT, 'center');
    font(28, B, '800');
    text((r.edge === 'a' ? '✓ ' : '') + r.a, P + 18, ty, r.edge === 'a' ? GRN : r.edge === 'h' ? BAD : TXT);
    text(r.h + (r.edge === 'h' ? ' ✓' : ''), W - P - 18, ty, r.edge === 'h' ? GRN : r.edge === 'a' ? BAD : TXT, 'right');
  });
  y = tt + pick.length * rh + 62;
  // Last three games each
  const la = lastResults(A.id, s, 3), lh = lastResults(H.id, s, 3);
  if (la.length || lh.length) {
    y += 52; label('Last 3 games', y); const n = Math.max(la.length, lh.length), top = y + 16; card(top, n * 42 + 26); let fy = top + 44;
    for (let i = 0; i < n; i++) { font(27, B, '700'); if (la[i]) text(la[i].t, P + 18, fy, la[i].w ? GRN : BAD); if (lh[i]) text(lh[i].t, W - P - 18, fy, lh[i].w ? GRN : BAD, 'right'); fy += 42; }
    y = top + n * 42 + 26;
  }
  // Players to know: each team's top 3 from the AI's read of this season's broadcasts
  await loadAI();
  const pk = t => teamPlayers(t.id, s).slice(0, 3);
  const pa = pk(A), ph = pk(H);
  if (pa.length || ph.length) {
    y += 52; label('Players to know', y); const n = Math.max(pa.length, ph.length), rH = 82, top = y + 16; card(top, n * rH + 22);
    const half = IW / 2 - 24;
    const cell = (q, X, Y, al) => {
      if (!q) return;
      const head = `${shortName(q.name)}${q.pos ? ' · ' + q.pos : ''}${q.grade ? ' · ' + q.grade.toFixed(1) : ''}`;
      let hd = head; font(Math.max(20, fit(hd, 27, half, B, '800')), B, '800'); while (hd.length > 4 && x.measureText(hd).width > half) hd = hd.slice(0, -2) + '…'; text(hd, X, Y, TXT, al);
      // Stat line: shrink a little, then cut it off with "…" so the two columns never run into each other
      let ln = q.lines[0]?.l ? `Wk ${q.lines[0].w}: ${q.lines[0].l.replace(/\.$/, '')}` : '';
      if (ln) { font(Math.max(18, fit(ln, 21, half, B, '600')), B, '600'); if (x.measureText(ln).width > half) { while (ln.length > 4 && x.measureText(ln + '…').width > half) ln = ln.slice(0, -1); ln = ln.trimEnd() + '…'; } text(ln, X, Y + 30, MUT, al); }
    };
    for (let i = 0; i < n; i++) { const Y = top + 46 + i * rH; if (i) { x.fillStyle = LINE; x.fillRect(P, Y - 40, IW, 1); } cell(pa[i], P + 18, Y, 'left'); cell(ph[i], W - P - 18, Y, 'right'); }
    y = top + n * rH + 22;
  }
  // What's at stake: title odds with a win vs a loss, plus any clinch note
  const lines = [];
  if (C.stake) [[A, C.stake.a], [H, C.stake.h]].forEach(([t, [b0, w, lo]]) => lines.push(b0 || w || lo ? `${t.abbr || t.name} title odds: ${pc(b0)} now → ${pc(w)} with a win, ${pc(lo)} with a loss` : `${t.abbr || t.name} is out of the title race (spoiler role)`));
  if (C.clinch) lines.push(C.clinch.replace(/<[^>]+>/g, ''));
  if (C.series) lines.push(C.series);
  if (lines.length) {
    y += 52; label(done ? 'Context' : "What's at stake", y); y += 14;
    font(26, B, '600'); lines.forEach(t => { wrapText(x, t, IW - 30).slice(0, 2).forEach((ln, i) => { y += 36; if (!i) text('•', P, y, GOLD); text(ln, P + 30, y); }); y += 6; });
  }
  // Talking points (trends), as many as fit
  const ba = betAction(g), tp = C.trends.filter(t => !(C.series && / all-time against /.test(t)));
  if (ba) tp.push(`${ba.n} league bet${ba.n === 1 ? '' : 's'} on this game · most popular: ${ba.top} (${ba.topN})`);
  if (tp.length && y < HT - 230) {
    y += 46; label('Talking points', y); y += 14;
    font(26, B, '600');
    for (const t of tp) { const ln = wrapText(x, t, IW - 30); if (y + ln.length * 36 > HT - 90) break; ln.forEach((s2, i) => { y += 36; if (!i) text('•', P, y, GOLD); text(s2, P + 30, y); }); y += 4; }
  }
  // Footer pinned to the bottom
  x.fillStyle = LINE; x.fillRect(P, HT - 70, IW, 2);
  font(21, B, '600'); text(`OEC CFB League Hub · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, W / 2, HT - 32, MUT, 'center');
  return c;
}
async function showCheat() {
  const C = UI.cheat; if (!C) return;
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Broadcast cheat sheet</h2><p class="muted">Building…</p></div></div>`;
  const c = await drawCheat(C); UI.cheatCanvas = c;
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Broadcast cheat sheet</h2>
    <p class="muted small" style="margin-top:0">Save it to your phone or share it with whoever's on the call.</p>
    <img src="${c.toDataURL('image/png')}" alt="Broadcast cheat sheet" style="width:100%;border-radius:10px;display:block">
    <div class="row" style="margin-top:12px"><button class="gold" data-act="saveCheat">⬇ Save / share</button><button class="ghost" data-close="1">Done</button></div></div></div>`;
}
async function saveCanvas(c, name, title) {
  if (!c) return;
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  try {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function showWinsSlip(tid, pick) {
  const me = auth.profile;
  if (!me) { location.hash = '#account'; return; }
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
  if (ownLeg({ market: 'future', pick: tid })) return;
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
// Same-game parlay rules (how standard sportsbooks handle related outcomes without same-game pricing):
// per game, at most ONE side pick (spread or moneyline, either team) and ONE points pick (game total or either
// team total). Picking another in the same group swaps it in. Different games never conflict.
const legGroup = l => l.market === 'future' ? 'future' : l.market === 'wins' ? 'wins:' + l.team
  : `${l.market === 'ml' || l.market === 'spread' ? 'side' : 'pts'}:${l.gameId}`;
const legWeek = l => { if (l.market === 'future') return 'Title'; if (l.market === 'wins') return 'Wins'; const g = D.games.find(x => x.id === l.gameId); return !g ? 'Wk ?' : g.type === 'ccg' ? 'League Title' : g.type === 'bowl' ? (g.note || 'Bowl') : 'Wk ' + g.week; };
function legFor(gid, market, pick, tid) {
  if (ownLeg({ gameId: gid, market, pick, team: tid })) return null;
  if (market === 'wins') { const r = winsBoard().find(x => x.id === tid); return r && r.o ? { gameId: '', market, pick, team: tid, line: r.o.line, odds: pick === 'over' ? r.o.over : r.o.under } : null; }
  if (market === 'future') { const r = futuresBoard().find(x => x.id === pick); return r && r.odds != null ? { gameId: '', market, pick, line: null, odds: r.odds } : null; }
  const g = D.games.find(x => x.id === gid), l = g && lineOf(g); if (!l) return null;
  if ((market === 'tth' || market === 'tta') && lineVal(l, market) == null) return null;
  return { gameId: gid, market, pick, line: lineVal(l, market), odds: market === 'ml' ? (pick === 'home' ? l.mlHome : l.mlAway) : juiceOf(l, market, pick) };
}
// One spread-or-moneyline pick and one total per game; one League Champion pick per parlay.
function toggleLeg(gid, market, pick, tid) {
  const grp = legGroup({ market, team: tid, gameId: gid });
  const i = UI.legs.findIndex(x => legGroup(x) === grp);
  if (i >= 0 && UI.legs[i].market === market && UI.legs[i].pick === pick) { UI.legs.splice(i, 1); route(); return; }
  const leg = legFor(gid, market, pick, tid); if (!leg) return;
  if (i >= 0) UI.legs[i] = leg;
  else if (UI.legs.length >= MAX_LEGS) return alert(`Parlays max out at ${MAX_LEGS} legs.`);
  else UI.legs.push(leg);
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
  if (UI.legs.some(ownLeg)) { UI.legs = UI.legs.filter(l => !ownLeg(l)); if (UI.legs.length < 2) { route(); return; } }
  UI.legs = UI.legs.map(l => legFor(l.gameId, l.market, l.pick, l.team)).filter(Boolean);
  const odds = parlayOdds(UI.legs), bal = bankroll(me.id).balance, boost = boostFor(UI.legs);
  UI.slip = { parlay: true, odds, boost };
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Parlay Slip</h2><p><b>${UI.legs.length}-leg parlay ${fmtOdds(odds)}</b></p>${boost ? boostNote(boost) : ''}
    <div class="small" style="margin-bottom:8px">${UI.legs.map(l => `• ${legWeek(l)}: ${esc(wagerLabel(l))}`).join('<br>')}</div>
    <label>Stake (balance ${bal.toLocaleString()})</label><div class="row"><input id="stake" type="number" min="1" max="${bal}" step="1" value="${Math.min(25, bal)}" inputmode="numeric" style="width:120px">
    ${[10, 25, 50, 100].map(v => `<button class="sm ghost" data-stake="${v}">${v}</button>`).join('')}</div>
    <p>To win: <b id="towin"></b></p><div class="row"><button data-act="place">Place parlay</button><button class="ghost" data-close="1">Cancel</button><span id="smsg" class="err"></span></div></div></div>`;
  updToWin();
}
const boostNote = b => `<div class="boostpill">⚡ ${boostName(b)} · +${Math.round((b - 1) * 100)}% profit boost applied</div>`;
function showSlip(gid, market, pick) {
  const me = auth.profile;
  if (!me) { location.hash = '#account'; return; }
  const g = D.games.find(x => x.id === gid), l = lineOf(g);
  if (ownGame(g)) return;
  const odds = market === 'ml' ? (pick === 'home' ? l.mlHome : l.mlAway) : juiceOf(l, market, pick);
  const line = lineVal(l, market);
  const boost = boostFor([{ gameId: gid, market }]);
  UI.slip = { g, market, pick, odds, line, boost };
  const bal = bankroll(me.id).balance;
  const label = wagerLabel({ gameId: gid, market, pick, odds, line });
  $('#modal').innerHTML = `<div class="modal" data-close="1"><div class="card"><h2>Bet Slip</h2><p><b>${esc(label)}</b></p><p class="muted small">${esc(team(g.away).name)} @ ${esc(team(g.home).name)} · Week ${g.week}</p>${boost ? boostNote(boost) : ''}
    <label>Stake (balance ${bal.toLocaleString()})</label><div class="row"><input id="stake" type="number" min="1" max="${bal}" step="1" value="${Math.min(100, bal)}" inputmode="numeric" style="width:120px">
    ${[25, 50, 100, 250].map(v => `<button class="sm ghost" data-stake="${v}">${v}</button>`).join('')}</div>
    <p>To win: <b id="towin"></b></p><div class="row"><button data-act="place">Place wager</button><button class="ghost" data-close="1">Cancel</button><span id="smsg" class="err"></span></div></div></div>`;
  updToWin();
}
function updToWin() { const s = Math.floor(+$('#stake').value || 0), o = UI.slip.odds;
  if (UI.slip.parlay) { const p = Math.round(parlayProfit(s, UI.legs) * (UI.slip.boost || 1)); $('#towin').textContent = s > 0 ? p + ' (returns ' + (s + p) + ')' : '–'; return; } $('#towin').textContent = s > 0 ? Math.round(Math.round(o > 0 ? s * o / 100 : s * 100 / -o) * (UI.slip.boost || 1)) + ' (returns ' + (s + Math.round(Math.round(o > 0 ? s * o / 100 : s * 100 / -o) * (UI.slip.boost || 1))) + ')' : '–'; }
// If the database rejects a bet, the usual reason is that the line just moved. Reload and tell the coach.
// Only blame a line move when a line really changed; otherwise say so (usually an outdated copy of the site).
async function lineMoved(e) {
  if (e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) {
    const sl = UI.slip || {};
    const before = (sl.parlay ? UI.legs : [{ gameId: sl.g?.id || '', market: sl.market, pick: sl.pick, team: sl.team, odds: sl.odds, line: sl.line }]).map(l => ({ ...l }));
    await freshGames(before.map(b => b.gameId).filter(Boolean));   // check the database itself, not our copy
    const changed = before.filter(b => { const n = legFor(b.gameId, b.market, b.pick, b.team); return !n || n.odds !== b.odds || (n.line ?? null) !== (b.line ?? null); });
    if (changed.length) {
      if (sl.parlay) UI.legs = UI.legs.map(l => legFor(l.gameId, l.market, l.pick, l.team)).filter(Boolean);
      $('#modal').innerHTML = ''; route();
      alert(`${changed.length === 1 ? 'A line' : changed.length + ' lines'} in this bet changed: ${changed.map(b => wagerLabel(b).replace(/\s*\(.*\)$/, '')).join(', ')}. The board now shows the current prices. Place it again.`);
      return;
    }
    const sm = $('#smsg');
    if (sm) sm.innerHTML = 'The sportsbook turned this bet down, but every line still matches. Tell the commissioner; the database rules may need updating. (' + esc(e.code || 'permission-denied') + ')';
    return;
  }
  $('#smsg').textContent = 'Could not place this bet. ' + friendlyError(e);
}
// Stale-copy guard: if GitHub has a newer version than the one running, reload once to pick it up.
async function checkVersion() {
  try {
    const mine = new URL(import.meta.url).searchParams.get('v');
    const html = await (await fetch('index.html?t=' + Date.now(), { cache: 'no-store' })).text();
    const live = (/app\.js\?v=(\d+)/.exec(html) || [])[1];
    if (live && mine && live !== mine && sessionStorage.getItem('oecReloaded') !== live) { sessionStorage.setItem('oecReloaded', live); location.reload(); }
  } catch (e) { }
}
async function placeBet() {
  const { g, market, pick, odds, line } = UI.slip, me = auth.profile, stake = Math.floor(+$('#stake').value || 0), L = D.league;
  const bal = bankroll(me.id).balance;
  if (stake < 1) return $('#smsg').textContent = 'Enter a stake.';
  if (stake > bal) return $('#smsg').textContent = 'Not enough Crackers.';
  if (UI.slip.parlay) {
    if (!L.bettingOpen) return $('#smsg').textContent = 'Betting is locked.';
    const bad = UI.legs.find(l => { if (l.market === 'future') return !(champOpen() && futuresPosted());
      if (l.market === 'wins') return !(futuresOpen() && winsPosted()); const g = D.games.find(x => x.id === l.gameId); return !g || played(g) || g.locked || g.week < L.week || g.season !== L.season; });
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
    if (!champOpen()) return $('#smsg').textContent = titleSet() ? 'League Champion bets closed once the title game was set. Bet its moneyline instead.' : 'Futures are locked.';
    try {
      await placeWager({ uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: '', market: 'future', pick, line: null, odds, stake, status: 'open', payout: 0, ts: Date.now() });
      await reload(); showPlacedSlip();
    } catch (e) { await lineMoved(e); }
    return;
  }
  if (!L.bettingOpen || played(g) || g.locked || g.week < L.week || g.season !== L.season) return $('#smsg').textContent = 'This game is locked.';
  try {
    await placeWager({ uid: me.id, coach: me.name, season: L.season, week: L.week, gameId: g.id, market, pick, line, odds, stake, status: 'open', payout: 0, ts: Date.now() });
    await reload(); showPlacedSlip();
  } catch (e) { await lineMoved(e); }
}

/* ---------- chart ---------- */
/* ---------- Kickoff scheduling (game preview) ---------- */
const toLocalInput = ts => { const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
// Where a game is played: a game's own venue (neutral sites), else the home team's stadium.
function venueOf(g) {
  if (g.venue) return { name: g.venue, city: g.venueCity || '' };
  if (g.neutral) return { name: 'Neutral site', city: '' };
  const h = team(g.home), s = h.stadium ? [h.stadium, h.city || ''] : lookupStadium(h.name);
  return s ? { name: s[0], city: s[1] } : null;
}
// Kickoff + venue lines for the preview header, plus the scheduling controls for the two coaches.
function kickoffCard(g) {
  const me = auth.profile, mineTeam = me && me.teamId && (me.teamId === g.home || me.teamId === g.away);
  const inv = kickoffInvite(g), pend = pendingInvites(g), commish = isCommish(), done = played(g);
  const can = !done && canSchedule(g), opp = mineTeam ? team(me.teamId === g.home ? g.away : g.home) : null, v = venueOf(g);
  const slots = i => i.times.map(t => esc(fmtKick(t))).join(' · ');
  const lines = [];
  if (inv) lines.push(`<div class="gpm"><span class="gpi">🕗</span><span><b>${esc(fmtKick(inv.time))}</b></span></div>`);
  if (v) lines.push(`<div class="gpm"><span class="gpi">📍</span><span><b>${esc(v.name)}</b>${v.city ? ` <span class="muted">· ${esc(v.city)}</span>` : ''}</span></div>`);
  let ctl = '';
  if (!done && inv) {
    ctl = (mineTeam || commish) && can ? `<div class="kcal"><button class="kresched" data-kcan="${esc(inv.id)}">${commish && !mineTeam ? 'Clear kickoff time' : 'Reschedule kickoff'}</button></div>` : '';
  } else if (!done && mineTeam && !can && isUserTeam(team(g.home)) && isUserTeam(team(g.away))) {
    ctl = `<p class="muted small" style="margin:0">Kickoff invites open once this game is in the current or next week.</p>`;
  } else if (can && (mineTeam || commish)) {
    const incoming = pend.filter(i => me && i.to === me.id), outgoing = pend.filter(i => me && i.from === me.id);
    ctl += incoming.map(i => `<div class="kinv"><div><b>Coach ${esc(i.fromName || '')}</b> wants to play at one of these times. Tap the one that works:</div>
      <div class="kslots">${i.times.map(t => `<button class="gold sm" data-kacc="${esc(i.id)}|${t}">${esc(fmtKick(t))}</button>`).join('')}<button class="sm ghost" data-kdec="${esc(i.id)}">None work</button></div></div>`).join('');
    ctl += outgoing.map(i => `<div class="kinv"><div>Waiting on <b>Coach ${esc(i.toName || '')}</b> to pick: ${slots(i)}</div><button class="sm ghost" data-kcan="${esc(i.id)}" style="margin-top:6px">Cancel invite</button></div>`).join('');
    if (commish && !mineTeam) ctl += pend.map(i => `<div class="kinv muted small">Pending: Coach ${esc(i.fromName || '')} → Coach ${esc(i.toName || '')}: ${slots(i)}</div>`).join('');
    if (mineTeam && !outgoing.length) {
      if (!opp.uid) ctl += `<p class="muted small" style="margin:0">Coach ${esc(opp.coach || '')} hasn't linked an account yet, so they can't get invites.</p>`;
      else ctl += `<details class="kform"${incoming.length ? '' : ''}><summary>${incoming.length ? 'Suggest other times' : 'Set a kickoff time with Coach ' + esc(opp.coach || '')}</summary><div class="muted small" style="margin:6px 0">Propose up to ${KICK_SLOTS} times for Coach ${esc(opp.coach || '')} to choose from. Times show in each coach's own time zone.</div>
          ${Array.from({ length: KICK_SLOTS }, (_, k) => `<input type="datetime-local" class="kt" min="${toLocalInput(Date.now())}" aria-label="Time option ${k + 1}">`).join('')}
          <button data-kinv="${esc(g.id)}" style="margin-top:8px">${incoming.length ? 'Counter with these times' : 'Send invite'}</button></details>`;
    }
  }
  return {
    meta: lines.length ? `<div class="gp-meta">${lines.join('')}</div>` : '',
    ctl: ctl ? `<div class="kcard kctl gp-kctl">${ctl}</div>` : '' };
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
    <div class="wpwrap">${svg}</div><p class="muted small" style="margin:6px 0 0">${done ? "The model's chance for each team from when the matchup opened until kickoff, updated whenever the lines re-priced." : "The model's chance for each team, updated whenever lines re-price (new scores, an advance or rating changes)."} Weeks before tracking started are rebuilt from the model as of each week. Touch or hover to see each point.</p></div>`;
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
  return `<div class="muted small" style="margin-bottom:6px">${esc(when)}</div><ol class="trlist" style="grid-template-rows:repeat(${Math.ceil(rows.length / 2)},auto)">${rows.map(t => `<li data-trend="${esc(t.id)}"><i class="sw" style="background:${t.c}"></i><span class="ab">${esc(t.ab)}</span><b>${trendFmt(t.v[i], D0.isW)}</b>${chg(t, i)}</li>`).join('')}</ol>`;
}
function trHover(e) {
  const card = e.target.closest('.trchart'), svg = card.querySelector('svg'), D0 = JSON.parse(card.dataset.tr), r = svg.getBoundingClientRect();
  const vx = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * D0.W, span = D0.W - D0.P.l - D0.P.r;
  const i = D0.n === 1 ? 0 : Math.max(0, Math.min(D0.n - 1, Math.round((vx - D0.P.l) / span * (D0.n - 1))));
  if (card.dataset.i === String(i)) return; card.dataset.i = i;
  const lo = D0.minY || 0, X = D0.P.l + (D0.n === 1 ? span / 2 : i * span / (D0.n - 1)), Y = v => D0.P.t + (1 - (v - lo) / (D0.maxY - lo)) * (D0.H - D0.P.t - D0.P.b);
  const g = svg.querySelector('.trx'); g.style.display = '';
  g.querySelector('line').setAttribute('x1', X); g.querySelector('line').setAttribute('x2', X);
  g.querySelectorAll('circle').forEach(c => { const t = D0.teams.find(z => z.id === c.dataset.tid), v = t.v[i]; c.style.display = v == null ? 'none' : ''; if (v != null) { c.setAttribute('cx', X); c.setAttribute('cy', Y(v)); } });
  card.querySelector('.trread').innerHTML = D0.kind === 'cb' ? cbReadout(D0, i) : trendReadout(D0, i);
}
function trReset(card) {
  const D0 = JSON.parse(card.dataset.tr); delete card.dataset.i;
  card.querySelector('.trx').style.display = 'none'; card.querySelector('.trread').innerHTML = D0.kind === 'cb' ? cbReadout(D0, D0.n - 1) : trendReadout(D0, D0.n - 1);
}
document.addEventListener('pointermove', e => { if (e.target.closest && e.target.closest('.trchart svg')) trHover(e); });
document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('.cbtrendbox')) UI.cbTrendOpen = e.target.open; }, true);
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
  if (autoLive.live && autoLive.checkedAt && now - autoLive.checkedAt < AUTO_TTL) {
    const st = (autoLive.streams || []).filter(x => x && x.videoId);
    return { key: 'a:' + (st.length ? st.map(x => x.videoId).sort().join(',') : autoLive.videoId), url: autoLive.url || YT_CHANNEL + '/live', title: autoLive.title || 'OEC is live on YouTube', streams: st };
  }
  return null;
}
function showLive() {
  let el = document.getElementById('livePop');
  const info = liveInfo();
  let dismissed = ''; try { dismissed = localStorage.getItem('oecLiveDismissed') || ''; } catch (e) { /* ignore */ }
  if (!info || dismissed === info.key) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'livePop'; el.className = 'livepop'; document.body.appendChild(el); }
  el.innerHTML = `<button class="lp-x" data-livex="${esc(info.key)}" aria-label="Close">✕</button>
    ${info.streams?.length > 1
      ? `<div class="lp-badge"><i></i>${info.streams.length} STREAMS LIVE</div><div class="lp-title">Multiple streams</div>
        ${info.streams.map(x => `<a class="btn lp-go lp-multi" href="${esc(x.url)}" target="_blank" rel="noopener">▶ ${esc(x.title || 'Watch on YouTube')}</a>`).join('')}`
      : `<div class="lp-badge"><i></i>LIVE NOW</div><div class="lp-title">${esc(info.title)}</div>
    <a class="btn lp-go" href="${esc(info.url)}" target="_blank" rel="noopener">▶ Watch on YouTube</a>`}`;
}
setInterval(() => checkLive(), 60000);   // re-checks live.json / expiry; no database reads

/* ---------- Game preview / recap page ---------- */
const pct0 = p => Math.round(p * 100) + '%';
const possN = n => /s$/i.test(n) ? n + "'" : n + "'s";
// Season numbers for one team: ATS, O/U, scoring, underdog record (forfeits skipped).
// Conference record for a past season: teams count as members if a league coach ran them that season
// (or they were in that season's saved alignment), since a team's current "conf" may have changed since.
function seasonMembers(season) {
  if (season === D.league.season) return new Set(leagueTeams().map(t => t.id));
  const m = new Set(), a = (D.league.align || {})[season];
  if (a && !a._one) Object.keys(a).forEach(k => k !== '_one' && m.add(k));
  D.games.filter(g => g.season === season).forEach(g => ['home', 'away'].forEach(sd => { const c = coachOf(g, sd); if (c && c !== 'CPU') m.add(g[sd]); }));
  return m;
}
function confRecOf(tid, season) {
  if (season === D.league.season) { const r = records(season)[tid]; return { w: r ? r.cw : 0, l: r ? r.cl : 0 }; }
  const M = seasonMembers(season); let w = 0, l = 0;
  D.games.filter(g => g.season === season && played(g) && (g.type || 'reg') === 'reg' && (g.home === tid || g.away === tid) && M.has(g.home) && M.has(g.away))
    .forEach(g => ((g.home === tid) === (+g.homeScore > +g.awayScore) ? w++ : l++));
  return { w, l };
}
// Over/under record as "13 O, 8 U" (plus pushes).
const fmtOU = a => `${a[0]} O, ${a[1]} U${a[2] ? `, ${a[2]} P` : ''}`;
// History: one Season Awards card with a centered season picker (newest first).
function awardWinnerHtml(h, a) {
  const g = awardGame(h, a);
  if (g) return `<a class="reclink" href="#game/${esc(g.id)}"><b>${esc(a.winner)}</b><div class="small goty">${esc(team(g.away).abbr || team(g.away).name)} ${g.awayScore} @ ${esc(team(g.home).abbr || team(g.home).name)} ${g.homeScore} · ${g.type === 'ccg' ? 'Title game' : g.type === 'bowl' ? esc(g.note || 'Bowl') : 'Week ' + g.week}</div></a>`;
  // Coach of the Year links to the coach, with the team they won it with.
  if (/coach of the year/i.test(a.award || '')) { const c = coachName(a.winner); return `${c ? `<a href="#coach/${slug(c)}">${esc(c)}</a>` : `<b>${esc(a.winner)}</b>`}${a.team ? `<div class="small">${chip(a.team, { season: h.season, rank: false })}</div>` : ''}`; }
  // Team awards (winner is the team itself): just the team chip, no repeated name.
  if (a.team && String(a.winner || '').trim().toLowerCase() === String(team(a.team).name || '').toLowerCase()) return `<b>${chip(a.team, { season: h.season, rank: false })}</b>`;
  return `<b>${esc(a.winner)}</b>${a.team ? `<div class="small">${chip(a.team, { season: h.season, rank: false })}</div>` : ''}`;
}
const awardsTable = h => `<div class="tablewrap"><table>${h.awards.map(a => `<tr><td class="wrap">${/coach of the year/i.test(a.award || '') ? '🏅 ' : ''}${esc(a.award)}</td><td class="wrap">${awardWinnerHtml(h, a)}</td></tr>`).join('')}</table></div>`;
function seasonAwardsCard(H) {
  const hs = H.filter(h => (h.awards || []).length); if (!hs.length) return '';
  const h = hs.find(x => x.season === +UI.awSeason) || hs[0];
  return `<h2>Season Awards</h2><div class="card"><div class="row" style="justify-content:center;margin-bottom:6px"><select data-awseason aria-label="Season">${hs.map(x => `<option value="${x.season}" ${x === h ? 'selected' : ''}>Season ${seasonNum(x.season)} · ${x.season}</option>`).join('')}</select></div>
    ${awardsTable(h)}</div>`;
}
// Home page in the offseason: the season just finished, its champion and award winners, until the next season is published.
function offseasonAwardsCard() {
  const L = D.league; if (L.phase !== PHASES.PRE) return '';
  const h = D.history.find(x => x.season === L.season); if (!h || !(h.awards || []).length) return '';
  const champ = h.champTeam ? `<div class="awchamp">🏆 <b>League Champion:</b> ${chip(h.champTeam, { season: h.season, rank: false })}${h.champCoach && h.champCoach !== 'CPU' ? ` · <a href="#coach/${slug(h.champCoach)}">${esc(h.champCoach)}</a>` : ''}</div>` : '';
  return `<div class="card gotw awhome"><span class="ribbon">🏆 Season ${seasonNum(h.season)} Awards · ${h.season}</span>${champ}${awardsTable(h)}<p class="small" style="margin:8px 0 0;text-align:center"><a href="#history">Every season's winners →</a></p></div>`;
}
// Match a typed name to a league coach (case-insensitive).
const coachName = n => { const k = String(n || '').trim().toLowerCase(); return Object.values(coachStats()).map(c => c.name).find(c => c.toLowerCase() === k) || ''; };
function teamProfile(tid, s, upto = Infinity) {
  const out = { gp: 0, pf: 0, pa: 0, ats: [0, 0, 0], ou: [0, 0, 0], dog: [0, 0], fav: [0, 0] };
  D.games.filter(g => g.season === s && g.week < upto && played(g) && !g.forfeit && (g.home === tid || g.away === tid)).forEach(g => {
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
// Team page: season stats with each one's rank among the league's teams.
function teamStatLine(tid, s) {
  const r = records(s)[tid], P = teamProfile(tid, s), t = team(tid);
  const R = ratings(s, 999);
  const sim = s === D.league.season && t.conf === D.league.conference && D.league.phase === PHASES.REG ? simulate(s, nowUpto())[tid] : null;
  const ha = { hw: 0, hl: 0, aw: 0, al: 0, opp: [], close: [0, 0] };
  D.games.filter(g => g.season === s && played(g) && (g.home === tid || g.away === tid)).forEach(g => {
    const home = g.home === tid, my = home ? +g.homeScore : +g.awayScore, th = home ? +g.awayScore : +g.homeScore, won = my > th, o = R[home ? g.away : g.home];
    if (g.neutral) { /* neutral games count toward neither */ } else if (home) won ? ha.hw++ : ha.hl++; else won ? ha.aw++ : ha.al++;
    if (o) ha.opp.push(o.o + o.d);
    if (!g.forfeit && Math.abs(my - th) <= 8) won ? ha.close[0]++ : ha.close[1]++;
  });
  const pct = (w, l) => w + l ? w / (w + l) : null, avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  // Past seasons: final power rank = end-of-season model rating among that season's league members.
  const pr = s === D.league.season ? currentPower(s)?.find(x => x.id === tid) : (() => { const M = [...seasonMembers(s)].filter(id => R[id]); if (!R[tid] || !M.includes(tid)) return null;
    const v = id => R[id].o + R[id].d; return { rank: M.filter(id => v(id) > v(tid) + 1e-9).length + 1 }; })();
  return {
    rec: { v: pct(r.w, r.l), f: `${r.w}-${r.l}` }, conf: (() => { const c = confRecOf(tid, s); return { v: pct(c.w, c.l), f: `${c.w}-${c.l}` }; })(),
    ppg: { v: P.gp ? P.pf / P.gp : null, f: P.gp ? (P.pf / P.gp).toFixed(1) : '–' }, papg: { v: P.gp ? P.pa / P.gp : null, f: P.gp ? (P.pa / P.gp).toFixed(1) : '–' },
    diff: { v: P.gp ? (P.pf - P.pa) / P.gp : null, f: P.gp ? ((P.pf - P.pa) / P.gp > 0 ? '+' : '') + ((P.pf - P.pa) / P.gp).toFixed(1) : '–' },
    home: { v: pct(ha.hw, ha.hl), f: `${ha.hw}-${ha.hl}` }, away: { v: pct(ha.aw, ha.al), f: `${ha.aw}-${ha.al}` },
    close: { v: pct(ha.close[0], ha.close[1]), f: `${ha.close[0]}-${ha.close[1]}` },
    ats: { v: pct(P.ats[0], P.ats[1]), f: `${P.ats[0]}-${P.ats[1]}${P.ats[2] ? '-' + P.ats[2] : ''}` },
    ou: { v: null, f: fmtOU(P.ou) },
    fav: { v: pct(P.fav[0], P.fav[1]), f: `${P.fav[0]}-${P.fav[1]}` }, dog: { v: pct(P.dog[0], P.dog[1]), f: `${P.dog[0]}-${P.dog[1]}` },
    sos: { v: avg(ha.opp), f: ha.opp.length ? (avg(ha.opp) > 0 ? '+' : '') + avg(ha.opp).toFixed(1) : '–' },
    ovr: { v: t.ovr || null, f: t.ovr || '–' }, off: { v: t.off || null, f: t.off || '–' }, def: { v: t.def || null, f: t.def || '–' },
    power: { v: pr ? pr.rank : null, f: pr ? '#' + pr.rank : '–', isRank: true },
    expW: { v: sim ? sim.expW : null, f: sim ? sim.expW.toFixed(1) : '–' }, title: { v: sim ? sim.titlePct : null, f: sim ? pctStr(sim.titlePct) : '–' },
  };
}
const TEAM_STATS = [
  ['Results', [['rec', 'Record', 1], ['conf', 'Conference', 1], ['home', 'Home', 1], ['away', 'Away', 1], ['close', 'One-score games', 1]]],
  ['Scoring', [['ppg', 'Points / game', 1], ['papg', 'Allowed / game', -1], ['diff', 'Point diff / game', 1], ['sos', 'Schedule strength', 1, 'Avg. model rating of opponents faced; 1st = toughest']]],
  ['Betting', [['ats', 'Against the spread', 1], ['ou', 'Over / under', 0], ['fav', 'As favorite', 1], ['dog', 'As underdog', 1]]],
  ['Team', [['ovr', 'Overall', 1], ['off', 'Offense', 1], ['def', 'Defense', 1], ['power', 'Power ranking', 0], ['expW', 'Projected wins', 1], ['title', 'Title odds', 1]]],
];
// Teams page: league-wide stat leaderboard. Pick a stat, tap the header to flip the order.
function statsBoard(s) {
  const lt = leagueTeams(); if (!lt.length) return '';
  const opts = TEAM_STATS.map(([g, rows]) => [g, rows.filter(r => r[0] !== 'ou')]);
  const flat = opts.flatMap(([, rows]) => rows), key = flat.some(r => r[0] === UI.tsKey) ? UI.tsKey : 'ppg';
  const [, label, dir0, tip] = flat.find(r => r[0] === key), dir = (key === 'power' ? -1 : dir0 || 1) * (UI.tsFlip ? -1 : 1);
  const lines = lt.map(t => ({ t, x: teamStatLine(t.id, s)[key] }));
  const has = lines.filter(l => l.x.v != null).sort((p, q) => (q.x.v - p.x.v) * dir || p.t.name.localeCompare(q.t.name)), none = lines.filter(l => l.x.v == null);
  // Rank by the stat's "better" direction (ties share a rank), regardless of display order.
  const better = key === 'power' ? -1 : dir0 || 1, rankOf2 = v => has.filter(l => (l.x.v - v) * better > 1e-9).length + 1;
  const me = myTeam()?.id, top = has.length ? Math.max(...has.map(l => Math.abs(l.x.v))) : 1;
  const rows = [...has, ...none].map(l => { const r = l.x.v == null ? null : rankOf2(l.x.v), tie = r && has.filter(o => Math.abs(o.x.v - l.x.v) <= 1e-9).length > 1;
    const w = l.x.v == null || key === 'power' ? 0 : Math.max(4, Math.abs(l.x.v) / (top || 1) * 100);
    return `<tr class="clickable${l.t.id === me ? ' me' : ''}" data-team="${esc(l.t.id)}"><td class="rank">${r ? (tie ? 'T-' : '') + r : '–'}</td><td>${chip(l.t.id)}${subSm(rec(records(s)[l.t.id]))}</td>
      <td class="hide-sm muted small">${rec(records(s)[l.t.id])}</td><td class="num tsv"><b>${l.x.f}</b>${w ? `<i style="width:${w.toFixed(0)}%;background:${esc(liftColor(teamColor(l.t)))}"></i>` : ''}</td></tr>`; }).join('');
  return `<h2>${s} Season Stats</h2><div class="card"><div class="row" style="gap:6px;flex-direction:column;align-items:center;text-align:center"><select data-tstat aria-label="Stat">${opts.map(([g, rows]) => `<optgroup label="${g}">${rows.map(([k, l]) => `<option value="${k}" ${k === key ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>`).join('')}</select>
    ${tip ? `<span class="muted small">${esc(tip)}</span>` : ''}</div>
    <div class="tablewrap" style="margin-top:8px"><table class="tsboard"><tr><th>#</th><th>Team</th><th class="hide-sm">Record</th><th class="num sortable" data-tsflip="1">${esc(label)} ${UI.tsFlip ? '▲' : '▼'}</th></tr>${rows}</table></div></div>`;
}
function teamStatsCard(tid, s) {
  // Past seasons rank against that season's league members (teams a league coach ran that year).
  const past = s !== D.league.season;
  const lt = past ? [...seasonMembers(s)].map(id => team(id)) : leagueTeams(), inL = lt.some(t => t.id === tid), all = Object.fromEntries((inL ? lt : [...lt, team(tid)]).map(t => [t.id, teamStatLine(t.id, s)]));
  const me = all[tid], n = lt.length, r0 = records(s)[tid];
  if (!inL && !(r0 && r0.w + r0.l)) return '';
  const rankOfStat = (k, dir) => {
    const v = me[k].v; if (!inL || !dir || v == null) return null;
    const vals = lt.map(t => all[t.id][k].v).filter(x => x != null);
    const better = vals.filter(x => (x - v) * dir > 1e-9).length, ties = vals.filter(x => Math.abs(x - v) <= 1e-9).length;
    return { r: better + 1, tie: ties > 1, of: vals.length };
  };
  const pill = (k, dir) => {
    if (k === 'power' && me.power.v) { const r = me.power.v; return `<span class="srk ${r <= Math.ceil(n / 4) ? 'top' : r > n - Math.ceil(n / 4) ? 'bot' : ''}">${ordinal(r)}</span>`; }
    const x = rankOfStat(k, dir); if (!x) return '<span class="muted small">–</span>';
    const q = Math.ceil(x.of / 4);
    return `<span class="srk ${k === 'sos' ? '' : x.r <= q ? 'top' : x.r > x.of - q ? 'bot' : ''}">${x.tie ? 'T-' : ''}${ordinal(x.r)}</span>`;
  };
  return `<div class="card"><div class="row spread"><h3 style="margin:0">${s} Season Stats</h3>${inL ? `<span class="muted small">Rank among ${n} ${esc(D.league.conference)} teams${past ? ` that season` : ''}</span>` : ''}</div>
    <div class="tstats">${TEAM_STATS.map(([grp, rows]) => [grp, past ? rows.filter(([k]) => !['ovr', 'off', 'def', 'expW', 'title'].includes(k)) : rows]).filter(([, rows]) => rows.length).map(([grp, rows]) => `<div class="tsg"><div class="tsh">${past && grp === 'Team' ? 'Final' : grp}</div><table>${rows.map(([k, label, dir, tip]) => `<tr${tip ? ` title="${esc(tip)}"` : ''}><td>${label}${tip ? ' <span class="muted small">ⓘ</span>' : ''}</td><td class="num"><b>${me[k].f}</b></td><td class="num">${pill(k, dir)}</td></tr>`).join('')}</table></div>`).join('')}</div>
    <p class="muted small" style="margin:8px 0 0"><span class="srk top">Green</span> = top quarter of the league, <span class="srk bot">red</span> = bottom quarter. One-score games are decided by 8 or fewer. Schedule strength is the average model rating of opponents played (1st = toughest).</p></div>`;
}
// Coach page: career stats across every team a coach has run (each game counts for whoever coached that side).
function coachCareerLine(name, season = null, upto = null) {
  const o = { w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, cl: [0, 0], gp: 0, pf: 0, pa: 0, ats: [0, 0, 0], ou: [0, 0, 0], fav: [0, 0], dog: [0, 0], cw: 0, cll: 0, big: 0, sho: 0, tg: [0, 0] };
  // Records (overall and vs league coaches) count every game, forfeits included, the same way the standings do.
  // Every other stat skips forfeits. Names match case-insensitively.
  const key = String(name || '').trim().toLowerCase(), isMe = side => String(coachOf(g0, side) || '').trim().toLowerCase() === key; let g0;
  D.games.filter(g => played(g) && (season == null || g.season === season) && (!upto || g.season < upto.s || (g.season === upto.s && g.week <= upto.w))).forEach(g => ['home', 'away'].forEach(side => {
    g0 = g; if (!isMe(side)) return;
    const home = side === 'home', my = home ? +g.homeScore : +g.awayScore, th = home ? +g.awayScore : +g.homeScore, won = my > th, other = coachOf(g, home ? 'away' : 'home'), l = lineOf(g);
    won ? o.w++ : o.l++;
    if (other && other.toUpperCase() !== 'CPU') won ? o.cw++ : o.cll++;
    if (g.type === 'ccg') won ? o.tg[0]++ : o.tg[1]++;
    if (g.forfeit) return;
    o.gp++; o.pf += my; o.pa += th;
    if (!g.neutral) { if (home) won ? o.hw++ : o.hl++; else won ? o.aw++ : o.al++; }
    if (Math.abs(my - th) <= 8) won ? o.cl[0]++ : o.cl[1]++;
    if (won && my - th >= 21) o.big++;
    if (won && th === 0) o.sho++;
    if (!l) return;
    const myLine = home ? l.spread : -l.spread, cov = my - th + myLine, tot = my + th - l.total, pw = home ? l.pHome : 1 - l.pHome;
    o.ats[cov > 0 ? 0 : cov < 0 ? 1 : 2]++; o.ou[tot > 0 ? 0 : tot < 0 ? 1 : 2]++;
    if (pw < 0.5) o.dog[won ? 0 : 1]++; else o.fav[won ? 0 : 1]++;
  }));
  const pct = (w, l) => w + l ? w / (w + l) : null, r2 = (w, l, p) => `${w}-${l}${p ? '-' + p : ''}`;
  return {
    gp: o.gp,
    rec: { v: pct(o.w, o.l), f: r2(o.w, o.l) }, vsc: { v: pct(o.cw, o.cll), f: r2(o.cw, o.cll) },
    home: { v: pct(o.hw, o.hl), f: r2(o.hw, o.hl) }, away: { v: pct(o.aw, o.al), f: r2(o.aw, o.al) }, close: { v: pct(o.cl[0], o.cl[1]), f: r2(o.cl[0], o.cl[1]) },
    tg: { v: o.tg[0] + o.tg[1] ? pct(o.tg[0], o.tg[1]) : null, f: o.tg[0] + o.tg[1] ? r2(o.tg[0], o.tg[1]) : '–' },
    ppg: { v: o.gp ? o.pf / o.gp : null, f: o.gp ? (o.pf / o.gp).toFixed(1) : '–' }, papg: { v: o.gp ? o.pa / o.gp : null, f: o.gp ? (o.pa / o.gp).toFixed(1) : '–' },
    diff: { v: o.gp ? (o.pf - o.pa) / o.gp : null, f: o.gp ? ((o.pf - o.pa) / o.gp > 0 ? '+' : '') + ((o.pf - o.pa) / o.gp).toFixed(1) : '–' },
    big: { v: o.big, f: String(o.big) }, sho: { v: o.sho, f: String(o.sho) },
    ats: { v: pct(o.ats[0], o.ats[1]), f: r2(...o.ats) }, ou: { v: null, f: fmtOU(o.ou) },
    fav: { v: pct(o.fav[0], o.fav[1]), f: r2(o.fav[0], o.fav[1]) }, dog: { v: pct(o.dog[0], o.dog[1]), f: r2(o.dog[0], o.dog[1]) },
  };
}
const COACH_STATS = [
  ['Results', [['rec', 'Overall record', 1], ['vsc', 'Vs league coaches', 1], ['home', 'Home', 1], ['away', 'Away', 1], ['close', 'One-score games', 1], ['tg', 'Title games', 1]]],
  ['Scoring', [['ppg', 'Points / game', 1], ['papg', 'Allowed / game', -1], ['diff', 'Point diff / game', 1], ['big', 'Wins by 21+', 1], ['sho', 'Shutouts', 1]]],
  ['Betting', [['ats', 'Against the spread', 1], ['ou', 'Over / under', 0], ['fav', 'As favorite', 1], ['dog', 'As underdog', 1]]],
];
function coachStatsCard(name) {
  const names = [...new Set(D.games.filter(played).flatMap(g => [coachOf(g, 'home'), coachOf(g, 'away')]))].filter(c => c && c !== 'CPU');
  const all = Object.fromEntries(names.map(n => [n, coachCareerLine(n)])), me = all[name];
  if (!me || !me.gp) return '';
  const n = names.length;
  const pill = (k, dir) => {
    const v = me[k].v; if (!dir || v == null) return '<span class="muted small">–</span>';
    const vals = names.map(x => all[x][k].v).filter(x => x != null), better = vals.filter(x => (x - v) * dir > 1e-9).length, ties = vals.filter(x => Math.abs(x - v) <= 1e-9).length, q = Math.ceil(vals.length / 4), r = better + 1;
    return `<span class="srk ${r <= q ? 'top' : r > vals.length - q ? 'bot' : ''}">${ties > 1 ? 'T-' : ''}${ordinal(r)}</span>`;
  };
  return `<div class="card"><div class="row spread"><h3 style="margin:0">Career stats</h3><span class="muted small">Every team, every season · rank among ${n} coaches</span></div>
    <div class="tstats">${COACH_STATS.map(([grp, rows]) => `<div class="tsg"><div class="tsh">${grp}</div><table>${rows.map(([k, label, dir]) => `<tr><td>${label}</td><td class="num"><b>${me[k].f}</b></td><td class="num">${pill(k, dir)}</td></tr>`).join('')}</table></div>`).join('')}</div>
    <p class="muted small" style="margin:8px 0 0"><span class="srk top">Green</span> = top quarter of league coaches, <span class="srk bot">red</span> = bottom quarter. Records count every game, forfeits included (same as the standings); the other stats skip forfeits.</p></div>`;
}
// History page: coach leaderboard. Span buttons (All-time / each season), a stat dropdown, tap the header to flip.
function coachBoard() {
  const seas = [...new Set(D.games.filter(played).map(g => g.season))].sort((a, b) => b - a); if (!seas.length) return '';
  const se = seas.includes(+UI.cbSpan) ? +UI.cbSpan : null;
  const names = [...new Set(D.games.filter(g => played(g) && !g.forfeit && (se == null || g.season === se)).flatMap(g => [coachOf(g, 'home'), coachOf(g, 'away')]))].filter(c => c && c !== 'CPU');
  const opts = COACH_STATS.map(([g, rows]) => [g, rows.filter(r => r[0] !== 'ou')]);
  const flat = opts.flatMap(([, rows]) => rows), key = flat.some(r => r[0] === UI.cbKey) ? UI.cbKey : 'rec';
  const [, label, dir0] = flat.find(r => r[0] === key), dir = (dir0 || 1) * (UI.cbFlip ? -1 : 1);
  const lines = names.map(n => ({ n, x: coachCareerLine(n, se)[key], cs: coachSeasons(n).filter(c => se == null || c.season === se) })).filter(l => l.cs.length);
  const has = lines.filter(l => l.x.v != null).sort((p, q) => (q.x.v - p.x.v) * dir || p.n.localeCompare(q.n)), none = lines.filter(l => l.x.v == null).sort((p, q) => p.n.localeCompare(q.n));
  const rankOf2 = v => has.filter(l => (l.x.v - v) * (dir0 || 1) > 1e-9).length + 1, top = has.length ? Math.max(...has.map(l => Math.abs(l.x.v))) : 1;
  const me = (myTeam()?.coach || '').toLowerCase();
  const rows = [...has, ...none].map(l => {
    const r = l.x.v == null ? null : rankOf2(l.x.v), tie = r && has.filter(o => Math.abs(o.x.v - l.x.v) <= 1e-9).length > 1;
    const latest = l.cs[l.cs.length - 1], col = latest.teams[0] ? teamColor(team(latest.teams[0])) : "#888";
    const seen = new Set(), chips = l.cs.slice().reverse().flatMap(c => c.teams.map(id => [id, c.season])).filter(([id]) => !seen.has(id) && seen.add(id));
    const w = l.x.v == null ? 0 : Math.max(4, Math.abs(l.x.v) / (top || 1) * 100);
    return `<tr class="${l.n.toLowerCase() === me ? 'me' : ''}"><td class="rank">${r ? (tie ? 'T-' : '') + r : '–'}</td><td><a href="#coach/${slug(l.n)}"><b>${esc(l.n)}</b></a>${(() => { const t = D.history.filter(h => (se == null || h.season === se) && String(h.champCoach || '').toLowerCase() === l.n.toLowerCase()).length; return t ? ` <span title="League titles">${'🏆'.repeat(Math.min(t, 5))}</span>` : ''; })()}<div class="small cbteams">${chips.map(([id, ss]) => chip(id, { abbr: true, rank: false, season: ss })).join(' ')}</div></td>
      <td class="num tsv"><b>${l.x.f}</b>${w ? `<i style="width:${w.toFixed(0)}%;background:${esc(liftColor(col))}"></i>` : ''}</td></tr>`; }).join('');
  return `<h2>Coach Stats</h2><div class="card"><div class="row" style="gap:8px;flex-direction:column;align-items:center;text-align:center">
      <div class="seg segscroll" role="group" aria-label="Stats span"><button data-cbspan="all" class="${se == null ? 'on' : ''}">All-time</button>${seas.map(x => `<button data-cbspan="${x}" class="${se === x ? 'on' : ''}" aria-label="Season ${seasonNum(x)}, ${x}">S${seasonNum(x)}</button>`).join('')}</div>
      <select data-cbstat aria-label="Stat">${opts.map(([g, rows]) => `<optgroup label="${g}">${rows.map(([k, l]) => `<option value="${k}" ${k === key ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>`).join('')}</select>
      <span class="muted small">${se == null ? 'Every season' : `Season ${seasonNum(se)} · ${se}`}${key === 'vsc' ? ' · only games against league coaches' : key === 'rec' ? ' · every game, same as the standings' : ''}</span></div>
    <div class="tablewrap" style="margin-top:8px"><table class="tsboard"><tr><th>#</th><th>Coach</th><th class="num sortable" data-cbflip="1">${esc(label)} ${UI.cbFlip ? '▲' : '▼'}</th></tr>${rows}</table></div>
    <p class="muted small" style="margin:8px 0 0">Tap a coach for their profile, or the stat header to flip the order. 🏆 = league titles. Records include forfeits like the standings; other stats skip them.</p>
    ${coachTrend(se, key, label, dir0 || 1, lines.map(l => ({ n: l.n, col: (() => { const c = l.cs[l.cs.length - 1]; return c.teams[0] ? teamColor(team(c.teams[0])) : '#888'; })() })))}</div>`;
}
// Coach Stats chart: the picked stat after every advance (each week with games), for the span picked above.
// Same look and touch behaviour as the Coach Odds Trend chart on the Odds page.
const CB_PCT = new Set(['rec', 'vsc', 'home', 'away', 'close', 'tg', 'ats', 'fav', 'dog']);
let _cbt = { k: '', v: null };
function coachTrend(se, key, label, better, coaches) {
  if (!coaches.length) return '';
  const pts = [...new Map(D.games.filter(g => played(g) && (se == null || g.season === se)).sort((a, b) => a.season - b.season || a.week - b.week)
    .map(g => [g.season + '|' + g.week, { s: g.season, w: g.week, ccg: g.type === 'ccg', bowl: g.type === 'bowl' }])).values()];
  if (pts.length < 2) return '';
  const ck = [se, key, D.games.filter(played).length, coaches.map(c => c.n).join(',')].join('|');
  if (_cbt.k !== ck) _cbt = { k: ck, v: coaches.map(c => { const v = [], f = []; pts.forEach(p => { const r = coachCareerLine(c.n, se, p), x = r[key], none = r.rec.f === '0-0'; v.push(none ? null : x.v); f.push(none ? '–' : x.f); }); return { v, f }; }) };
  const pct = CB_PCT.has(key), all = _cbt.v.flatMap(x => x.v).filter(v => v != null);
  let minY = pct ? 0 : Math.min(0, ...all), maxY = pct ? 1 : Math.max(1, ...all);
  if (!pct) { const span = maxY - minY, stepN = span <= 5 ? 1 : span <= 12 ? 2 : span <= 30 ? 5 : span <= 60 ? 10 : 20; maxY = Math.ceil(maxY / stepN) * stepN; minY = Math.floor(minY / stepN) * stepN; }
  const label0 = p => p.ccg ? `S${seasonNum(p.s)} Title` : p.bowl ? `S${seasonNum(p.s)} Bowls` : `S${seasonNum(p.s)} Wk${p.w}`;
  const series = coaches.map((c, i) => ({ id: c.n, ab: c.n, c: liftColor(c.col), v: _cbt.v[i].v, f: _cbt.v[i].f }));
  const sel = series.some(t => t.id === UI.cbTrend) ? UI.cbTrend : 'all', one = sel !== 'all';
  const narrow = innerWidth < 640, W = narrow ? 360 : 860, H = narrow ? 220 : 280, P = { l: narrow ? 34 : 42, r: narrow ? 58 : 70, t: 12, b: 26 }, n = pts.length;
  const x = i => P.l + i * (W - P.l - P.r) / (n - 1), y = v => P.t + (1 - (v - minY) / (maxY - minY)) * (H - P.t - P.b);
  const tickStep = pct ? .25 : (maxY - minY) / 4, ticks = [...Array(5).keys()].map(i => minY + i * tickStep);
  const tf = v => pct ? Math.round(v * 100) + '%' : (Math.round(v * 10) / 10).toString();
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} after every advance" class="trsvg">`;
  ticks.forEach(v => svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#2b2024"/><text x="${P.l - 6}" y="${y(v) + 4}" fill="#a69a9c" font-size="11" text-anchor="end">${tf(v)}</text>`);
  // x labels: the start of each season (All-time) or a few weeks (one season).
  const marks = se == null ? pts.map((p, i) => i === 0 || p.s !== pts[i - 1].s ? i : -1).filter(i => i >= 0) : pts.map((_, i) => i).filter(i => i % Math.max(1, Math.ceil(n / (narrow ? 5 : 9))) === 0);
  marks.forEach(i => { if (se == null && i > 0) svg += `<line x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${H - P.b}" stroke="#3a2c30" stroke-dasharray="3 4"/>`; svg += `<text x="${x(i)}" y="${H - 7}" fill="#a69a9c" font-size="11" text-anchor="${i === 0 ? 'start' : 'middle'}">${esc(se == null ? 'S' + seasonNum(pts[i].s) : 'Wk' + pts[i].w)}</text>`; });
  const path = t => { let d = '', pen = false; t.v.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); pen = true; }); return d; };
  const order = one ? [...series.filter(t => t.id !== sel), series.find(t => t.id === sel)] : series;
  order.forEach(t => { const me = t.id === sel; svg += `<path fill="none" d="${path(t)}" stroke-linejoin="round" ${one && !me ? 'stroke="#6f6266" stroke-width="1.2" opacity=".35"' : `stroke="${t.c}" stroke-width="${me ? 3 : 1.8}"`}/>`; });
  const lastV = t => t.v[n - 1];
  const ends = (one ? series.filter(t => t.id === sel) : [...series].filter(t => lastV(t) != null).sort((a, b) => (lastV(b) - lastV(a)) * better).slice(0, 3)).filter(t => lastV(t) != null).map(t => ({ t, yy: y(lastV(t)) })).sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 12) ends[i].yy = ends[i - 1].yy + 12;
  ends.forEach(e => svg += `<text x="${x(n - 1) + 7}" y="${e.yy + 4}" fill="#f3eeee" font-size="${one ? 12 : 10.5}" font-weight="800">${esc(e.t.ab.slice(0, 8))}</text>`);
  svg += `<g class="trx" style="display:none"><line y1="${P.t}" y2="${H - P.b}" stroke="#a69a9c" stroke-width="1"/>${(one ? series.filter(t => t.id === sel) : series).map(t => `<circle r="${one ? 5 : 3.5}" fill="${t.c}" stroke="#1a1416" stroke-width="1.5" data-tid="${esc(t.id)}"/>`).join('')}</g>`;
  svg += `<rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent"/></svg>`;
  const data = { kind: 'cb', W, H, P, n, minY, maxY, one, sel, better, stat: label, labels: pts.map(label0), teams: series };
  const picker = `<div class="trpick"><button data-cbtrend="all" class="${one ? '' : 'on'}">League</button>${series.map(t => `<button data-cbtrend="${esc(t.id)}" class="${sel === t.id ? 'on' : ''}"><i class="sw" style="background:${t.c}"></i>${esc(t.ab)}</button>`).join('')}</div>`;
  return `<details class="cbtrendbox" ${UI.cbTrendOpen === false ? '' : 'open'}><summary><b>📈 ${esc(label)} over time</b> <span class="muted small">${se == null ? 'every season' : 'Season ' + seasonNum(se)}</span></summary>
    ${picker}<div class="trchart" data-tr="${esc(JSON.stringify(data))}"><div class="trread">${cbReadout(data, n - 1)}</div><div class="trwrap">${svg}</div></div>
    <p class="muted small" style="margin:6px 0 0">Updates after every advance. Touch or hover to see any week; tap a coach above to follow just them.</p></details>`;
}
function cbReadout(D0, i) {
  const when = 'After ' + D0.labels[i].replace(/^S(\d+) Wk(\d+)$/, 'Season $1, Week $2').replace(/^S(\d+) (Title|Bowls)$/, (m, a, b) => `Season ${a}, ${b === 'Title' ? 'the title game' : 'bowl season'}`);
  const live = D0.teams.filter(t => t.v[i] != null).sort((a, b) => (b.v[i] - a.v[i]) * D0.better);
  if (D0.one) {
    const t = D0.teams.find(x => x.id === D0.sel), r = t.v[i] == null ? null : live.findIndex(x => x.id === t.id) + 1;
    return `<div class="trone"><div><span class="muted small">${esc(when)}</span><div class="trbig"><i class="sw" style="background:${t.c}"></i>${esc(t.ab)} <b>${esc(t.f[i])}</b></div></div>
      <div class="trstats"><span>${r ? `<b>#${r}</b> <em>of ${live.length} coaches</em>` : '<em>Not in the league yet</em>'}</span><span><em>${esc(D0.stat)}</em></span></div></div>`;
  }
  return `<div class="muted small" style="margin-bottom:6px">${esc(when)} · ${esc(D0.stat)}</div><ol class="trlist" style="grid-template-rows:repeat(${Math.ceil(live.length / 2)},auto)">${live.map(t => `<li data-cbtrend="${esc(t.id)}"><i class="sw" style="background:${t.c}"></i><span class="ab">${esc(t.ab)}</span><b>${esc(t.f[i])}</b></li>`).join('')}</ol>`;
}
function coachMeetings(c1, c2, exceptId) {
  if (!c1 || !c2 || c1 === 'CPU' || c2 === 'CPU') return [];
  const key = [c1, c2].sort().join('|');
  return D.games.filter(g => played(g) && g.id !== exceptId && [coachOf(g, 'home'), coachOf(g, 'away')].sort().join('|') === key)
    .sort((a, b) => b.season - a.season || b.week - a.week);
}
function meetingWinner(g) { const hw = +g.homeScore > +g.awayScore; return { coach: coachOf(g, hw ? 'home' : 'away'), team: hw ? g.home : g.away, ws: Math.max(+g.homeScore, +g.awayScore), ls: Math.min(+g.homeScore, +g.awayScore), lteam: hw ? g.away : g.home, lcoach: coachOf(g, hw ? 'away' : 'home') }; }

// ---- Phone notifications (Account page) ----
function pushCard() {
  const head = '<h2>Phone Notifications</h2>';
  if (!pushSupported()) {
    if (isIOS() && !isStandalone()) return head + `<div class="card"><p style="margin-top:0">On iPhone, notifications work once the OEC Hub is on your Home Screen (iOS 16.4 or newer). Add it, open it from the Home Screen icon, log in, then come back here.</p><a class="btn sm" href="#install">📱 How to add it</a></div>`;
    return head + '<div class="card muted">This browser can\'t receive notifications. Try Safari on iPhone (from the Home Screen) or Chrome on Android.</div>';
  }
  if (!D.league.pushKey) return head + `<div class="card muted">Notifications aren't switched on for the league yet.${isCommish() ? ' Set them up in Commissioner Tools → Settings.' : ''}</div>`;
  if (Notification.permission === 'denied') return head + `<div class="card"><p style="margin:0">Notifications are blocked for this site. Turn them back on in your phone's Settings → Notifications → OEC Hub${isIOS() ? '' : ' (or the browser\'s site settings)'}, then come back here.</p></div>`;
  const cur = Notification.permission === 'granted' ? pushLocal() : null;
  if (!cur) return head + `<div class="card"><p style="margin-top:0">Get a notification when the league advances, before your game kicks off, and when a coach sends you kickoff times.</p><button data-act="pushOn">🔔 Turn on notifications</button></div>`;
  const pf = { ...pushDefaults(), ...(cur.prefs || {}) };
  return head + `<div class="card"><p style="margin-top:0">🔔 On for this device. Pick what you want:</p>
    <div class="pushprefs">${PUSH_PREFS.map(([k, l]) => `<label class="chk"><input type="checkbox" data-pushpref="${k}" ${pf[k] ? 'checked' : ''}> ${esc(l)}</label>${k === 'finals' && pf.finals ? finalTeamsPicker(pf.finalTeams || []) : ''}`).join('')}</div>
    <button class="ghost sm" data-act="pushOff" style="margin-top:10px">Turn off on this device</button></div>`;
}
// Final-score alerts: follow every game, or only games with the teams picked here.
function finalTeamsPicker(sel) {
  const ts = leagueTeams().slice().sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="finteams"><span class="muted small">Final scores for:</span>
    <button type="button" class="chipbtn${sel.length ? '' : ' on'}" data-finteam="">All games</button>
    ${ts.map(t => `<button type="button" class="chipbtn${sel.includes(t.id) ? ' on' : ''}" data-finteam="${esc(t.id)}"><i class="sw" style="background:${esc(teamColor(t))}"></i>${esc(t.abbr || t.name)}</button>`).join('')}</div>`;
}
// Tapping a notification while the site is already open: the service worker sends the page to show.
// Pick up a new version of the notification worker right away (iPhones otherwise keep the old one for a while).
if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => { });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
  const h = e.data && e.data.type === 'oec-open' && e.data.hash;
  if (h && /^#[\w/-]+$/.test(h)) { if (location.hash === h) route(); else location.hash = h; scrollTo(0, 0); }
});
// ---- Add to Home Screen ----
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isPhone = () => isIOS() || /Android/.test(navigator.userAgent);
function installTip() {
  let dismissed = false; try { dismissed = localStorage.getItem('oecA2HS') === '1'; } catch (e) { }
  if (!isPhone() || isStandalone() || dismissed) return '';
  return `<div class="card a2hs"><span>📱 Add the OEC Hub to your Home Screen.</span><span class="a2hs-act"><a href="#install">Show me how</a><button class="x" data-a2hsx aria-label="Dismiss">✕</button></span></div>`;
}
PAGES.install = function () {
  const ios = isIOS(), and = /Android/.test(navigator.userAgent);
  const iphone = `<div class="card"><h3 style="margin-top:0">iPhone / iPad</h3><ol class="steps">
    <li>Open the site in <b>Safari</b>. Other apps' built-in browsers can't add it; Chrome works too on newer iOS.</li>
    <li>Tap the <b>Share</b> button (the square with the up arrow). In Safari it's at the bottom of the screen, or behind the <b>⋯</b> button.</li>
    <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
    <li>Keep the name "OEC Hub" and tap <b>Add</b>.</li></ol></div>`;
  const android = `<div class="card"><h3 style="margin-top:0">Android</h3><ol class="steps">
    <li>Open the site in <b>Chrome</b>.</li>
    <li>Tap the <b>⋮</b> menu in the top right.</li>
    <li>Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Install</b> or <b>Add</b>.</li></ol></div>`;
  return `<h2>Add to Home Screen</h2>
    ${isStandalone() ? '<div class="notice">✅ You\'re already using the Home Screen app.</div>' : ''}
    <div class="card"><p style="margin:0">The OEC Hub works like an app once it's on your Home Screen: it gets its own icon, opens full screen without the browser bars, and stays logged in.</p></div>
    ${and && !ios ? android + iphone : iphone + android}`;
};
// Every bet that touches this game (singles and parlay legs), so nobody has to dig through the sportsbook for them.
function gameBets(g) {
  const ws = D.wagers.filter(w => !w.deleted && (w.gameId === g.id || (w.market === 'parlay' && (w.legs || []).some(l => l.gameId === g.id))));
  if (!ws.length) return played(g) || g.forfeit ? '' : `<div class="card"><h3 style="margin-top:0">Bets on this game</h3><p class="muted small" style="margin:0">No bets yet.</p></div>`;
  const STO = { open: 0, won: 1, cashed: 1.5, push: 2, void: 3, lost: 4 };
  const payOf = w => w.status === 'push' || w.status === 'void' ? w.stake : w.status === 'cashed' ? w.stake + (w.payout || 0) : w.stake + winProfit(w);
  const pay = w => { const v = payOf(w).toLocaleString(); return w.status === 'lost' ? `<s class="muted">${v}</s>` : w.status === 'won' || w.status === 'cashed' ? `<b class="win">${v}</b>` : v; };
  const mark = r => r === 'won' ? ' <span class="win">✓</span>' : r === 'lost' ? ' <span class="loss">✗</span>' : r === 'push' || r === 'void' ? ' <span class="muted">(push)</span>' : '';
  const bet = w => {
    if (w.market !== 'parlay') return esc(wagerLabel(w).replace(/ — .*$/, '')) + (w.boost ? ` <span class="boosttag">⚡ +${Math.round((w.boost - 1) * 100)}%</span>` : '');
    const here = w.legs.filter(l => l.gameId === g.id), rest = w.legs.length - here.length;
    return `${w.legs.length}-leg parlay (${fmtOdds(w.odds)})${w.boost ? ` <span class="boosttag">⚡ +${Math.round((w.boost - 1) * 100)}%</span>` : ''}<div class="muted small">${here.map(l => esc(wagerLabel(l).replace(/ — .*$/, '')) + mark(l.result)).join('<br>')}${rest ? `<br>+ ${rest} leg${rest === 1 ? '' : 's'} on other games` : ''}</div>`;
  };
  ws.sort((a, b) => (STO[a.status] ?? 9) - (STO[b.status] ?? 9) || b.stake - a.stake || (b.ts || 0) - (a.ts || 0));
  const total = ws.reduce((t, w) => t + (+w.stake || 0), 0);
  return `<div class="card"><h3 style="margin-top:0">Bets on this game</h3><p class="muted small" style="margin-top:0">${ws.length} bet${ws.length === 1 ? '' : 's'} · ${total.toLocaleString()} Crackers wagered</p>
    <div class="tablewrap"><table class="bets"><tr><th>Coach</th><th>Bet</th><th class="num">Stake</th><th class="num">Payout</th><th class="num hide-xs">Status</th></tr>
    ${ws.map(w => `<tr><td>${coachCell(w)}</td><td class="wrap">${bet(w)}</td><td class="num">${w.stake}</td><td class="num">${pay(w)}</td><td class="num hide-xs">${statusPill(w)}</td></tr>`).join('')}</table></div></div>`;
}
PAGES.game = function (id) {
  const g = D.games.find(x => x.id === id); if (!g) return '<div class="card empty">Game not found.</div>';
  const L = D.league, s = g.season, A = team(g.away), H = team(g.home), done = played(g), l = lineOf(g), p = winPct(g, l);
  const rk = t => rankOf(t.id, s, g.week), rn = t => (rk(t) ? '#' + rk(t) + ' ' : '') + t.name;
  const recs = records(s, g.week), ra = recs[A.id], rh = recs[H.id];   // record and rank both as of kickoff
  const ca = isUserTeam(A) ? A.coach : (g.awayCoach || 'CPU'), ch = isUserTeam(H) ? H.coach : (g.homeCoach || 'CPU');
  const coachA = done ? coachOf(g, 'away') : ca, coachH = done ? coachOf(g, 'home') : ch;
  const pbA = playbookOf(A, s, coachA), pbH = playbookOf(H, s, coachH);
  // A finished game shows both teams as they were going in (stats from earlier weeks only).
  const upto = done ? g.week : Infinity, recs0 = done ? records(s, upto) : recs;
  const PA = teamProfile(A.id, s, upto), PH = teamProfile(H.id, s, upto);
  const R = ratings(s, done ? g.week : nowUpto()), formOf = t => { const r = R[t.id]; if (!r || !r.perf.length) return null; const x = r.perf.slice(-3); return x.reduce((a, b) => a + b.v, 0) / x.length; };
  const fav = l ? (l.spread <= 0 ? H : A) : null, dog = fav ? (fav === H ? A : H) : null;
  // A finished game is written as of the day it went final: only meetings played before it count.
  const meets = coachMeetings(coachA, coachH, g.id).filter(x => !done || x.season < s || (x.season === s && x.week < g.week));
  const mw = meets.reduce((o, m) => { const w = meetingWinner(m).coach; o[w] = (o[w] || 0) + 1; return o; }, {});
  const isGotw = gotwTally(s, g.week).game?.id === g.id;
  const dA = divOf(A, s), dH = divOf(H, s);
  const same = A.conf === L.conference && H.conf === L.conference && dA && dA === dH && divisions(s).length > 1;
  const divOrder = same ? orderGroup(leagueTeams().filter(t => divOf(t, s) === dA).map(t => t.id), s) : [];
  const where = g.neutral ? 'at a neutral site' : `at ${H.name}`;

  // ----- headline + story -----
  // Each game gets its own mix: a pool of true facts is built from the data, every fact has a few phrasings,
  // and a random generator seeded by the game id picks which facts and wordings appear. The same game always
  // reads the same way (no reshuffling on reload), but no two games read alike.
  const rng = (() => { let h = 2166136261; for (const c of String(g.id) + (done ? 'r' : 'p')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const coachOfT = t => t === H ? coachH : coachA, hasCoach = t => coachOfT(t) && coachOfT(t) !== 'CPU';
  const who = t => hasCoach(t) ? `${possN(coachOfT(t))} ${t.name}` : t.name;          // "Kahuna's FIU"
  const nick = t => { const m = mascotOf(t); return m ? `the ${m}` : t.name; };       // "the Panthers"
  const Cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const lt = leagueTeams(), ppgRank = {}, papgRank = {};
  (() => { const pr = lt.map(t => ({ id: t.id, P: teamProfile(t.id, s, upto) })).filter(x => x.P.gp);
    pr.slice().sort((a, b) => b.P.pf / b.P.gp - a.P.pf / a.P.gp).forEach((x, i) => ppgRank[x.id] = i + 1);
    pr.slice().sort((a, b) => a.P.pa / a.P.gp - b.P.pa / b.P.gp).forEach((x, i) => papgRank[x.id] = i + 1); })();
  const nT = Object.keys(ppgRank).length;
  const seasonGames = t => D.games.filter(x => x.season === s && played(x) && !x.forfeit && (x.home === t.id || x.away === t.id)).sort((a, b) => a.week - b.week);
  const scoreOf = (x, t) => x.home === t.id ? +x.homeScore : +x.awayScore, oppScore = (x, t) => x.home === t.id ? +x.awayScore : +x.homeScore;
  const lastGame = t => seasonGames(t).filter(x => x.week < g.week).pop();
  const careerWins = (coach, beforeThis) => coach && coach !== 'CPU' ? D.games.filter(x => played(x) && !x.forfeit && (!beforeThis || x.season < s || (x.season === s && x.week < g.week)) && (coachOf(x, 'home') === coach || coachOf(x, 'away') === coach))
    .filter(x => { const hw = +x.homeScore > +x.awayScore; return coachOf(x, hw ? 'home' : 'away') === coach; }).length : 0;

  let title;
  const paras = []; let stake = null;
  const divRec = t => { let w = 0, l = 0; D.games.filter(x => x.season === s && played(x) && (x.type || 'reg') === 'reg' && (x.home === t.id || x.away === t.id)).forEach(x => {
    const o = team(x.home === t.id ? x.away : x.home); if (!divOf(t, s) || divOf(o, s) !== divOf(t, s) || o.conf !== t.conf) return; const won = (x.home === t.id) === (+x.homeScore > +x.awayScore); won ? w++ : l++; }); return `${w}-${l}`; };
  const recTxt = t => { const r = recs[t.id]; if (t.conf !== L.conference) return `${r.w}-${r.l}`; return `${r.cw}-${r.cl} ${L.conference}${divOf(t, s) ? `, ${divRec(t)} ${divOf(t, s)}` : ''}`; };
  const cTxt = c => c && c !== 'CPU' ? `${possN(c)} ` : '';

  if (done && g.forfeit) {
    const w = +g.homeScore > +g.awayScore ? H : A, lo = w === H ? A : H;
    title = `${w.name} Takes a Forfeit Win Over ${lo.name}`;
    paras.push(`${who(w)} was awarded a forfeit win over ${lo.name} in Week ${g.week}. All bets on this game were refunded.`);
  } else if (done) {
    const w = +g.homeScore > +g.awayScore ? H : A, lo = w === H ? A : H, ws = Math.max(+g.homeScore, +g.awayScore), ls = Math.min(+g.homeScore, +g.awayScore);
    const mar = ws - ls, tot = ws + ls, pw = p ? (w === H ? p.h : p.a) : 50, upset = pw < 42;
    const cw = coachOfT(w), cl = coachOfT(lo);
    // Headline: the most striking angle, worded one of several ways.
    const T = [];
    if (g.type === 'ccg') T.push([100, [`${w.name} Wins the League Championship`, `${rn(w)} Are Your Champions`, `Crowned: ${w.name} Takes the Title, ${ws}-${ls}`]]);
    if (ls === 0) T.push([90, [`${w.name} Pitches a Shutout`, `Zero: ${w.name} Blanks ${lo.name}`, `${w.name} Doesn't Allow a Point`]]);
    if (upset) T.push([88, [`Shock in Week ${g.week}: ${rn(w)} Stuns ${rn(lo)}`, `Nobody Saw It Coming: ${w.name} Topples ${lo.name}`, `Upset! ${w.name} Takes Down ${rn(lo)}`]]);
    if (mar <= 3) T.push([80, [`${w.name} Survives ${lo.name} in a Thriller`, `Down to the Wire: ${w.name} Edges ${lo.name}`, `By a Hair: ${w.name} ${ws}, ${lo.name} ${ls}`]]);
    if (mar >= 28) T.push([70, [`${w.name} Rolls Past ${lo.name}`, `${w.name} Runs ${lo.name} Off the Field`, `No Contest: ${w.name} ${ws}, ${lo.name} ${ls}`]]);
    if (tot >= 80) T.push([65, [`Shootout: ${w.name} Outlasts ${lo.name}, ${ws}-${ls}`, `Points Galore as ${w.name} Beats ${lo.name}`]]);
    if (cw !== 'CPU' && cl !== 'CPU' && meets.length && meetingWinner(meets[0]).coach === cl) T.push([60, [`Payback: ${cw} Gets Even With ${cl}`, `${cw} Settles the Score With ${cl}`]]);
    T.push([0, [`${w.name} Handles ${lo.name}`, `${w.name} Takes Care of Business Against ${lo.name}`, `${w.name} Beats ${lo.name}, ${ws}-${ls}`]]);
    title = pick(T.sort((x, y) => y[0] - x[0])[0][1]);
    // Lead paragraph.
    const lead = [];
    if (ls === 0) lead.push(`${Cap(who(w))} didn't give up a single point. ${pick([`The final read ${ws}-0`, `${ws}-0, and it was never in doubt`, `${lo.name} left Week ${g.week} without a point on the board`])}.`);
    else if (mar <= 3) lead.push(pick([`This one came down to the last possession. ${Cap(who(w))} held on to beat ${who(lo)} ${ws}-${ls} in Week ${g.week}.`, `${Cap(who(w))} and ${who(lo)} traded punches all night, and when it was over ${w.name} had it, ${ws}-${ls}.`, `Three points or fewer decided it: ${who(w)} ${ws}, ${who(lo)} ${ls}.`]));
    else if (mar >= 28) lead.push(pick([`It got out of hand quickly. ${Cap(who(w))} beat ${who(lo)} ${ws}-${ls}.`, `${Cap(who(w))} put up ${ws} and won by ${mar}, leaving ${who(lo)} with nothing to show for Week ${g.week}.`, `${ws}-${ls}. ${Cap(who(w))} made a statement against ${who(lo)}.`]));
    else lead.push(pick([`${Cap(who(w))} beat ${who(lo)} ${ws}-${ls} in Week ${g.week}.`, `Week ${g.week} went to ${who(w)}, ${ws}-${ls} over ${who(lo)}.`, `${Cap(who(w))} took care of ${who(lo)}, ${ws}-${ls}.`]));
    if (g.type === 'ccg') lead.push(`That makes ${w.name} the Season ${seasonNum(s)} league champion${cw !== 'CPU' ? ` and puts ${cw} in the record books` : ''}.`);
    if (upset) lead.push(pick([`The model gave ${w.name} just a ${pw}% chance before kickoff.`, `Going in, ${w.name} had a ${pw}% shot according to the model. So much for that.`, `Only ${pw}% of simulations had ${w.name} winning this one.`]));
    paras.push(lead.join(' '));
    // Everything else true about this game, scored by how interesting it is; a random handful makes the cut.
    const F = [];
    if (l) {
      const m = +g.homeScore - +g.awayScore + l.spread, cov = m === 0 ? null : (m > 0 ? H : A), favWon = fav && fav === w;
      const ats = m === 0 ? `The spread pushed right on ${fmtLine(-Math.abs(l.spread))}.` : !fav ? `It closed as a pick'em, so ${w.name} cashed for anyone holding it.` : favWon && cov === fav ? pick([`${fav.name} covered the ${Math.abs(l.spread)} points comfortably.`, `Anyone laying ${Math.abs(l.spread)} with ${fav.name} got paid.`]) : favWon ? pick([`${fav.name} won but didn't cover the ${Math.abs(l.spread)}, a frustrating finish for anyone laying the points.`, `The ${dog.name} backers got the last laugh: ${fav.name} won, but not by ${Math.abs(l.spread)}.`]) : `${dog.name} didn't just cover as a ${Math.abs(l.spread)}-point underdog, it won outright.`;
      const ou = tot === l.total ? `The total landed exactly on ${l.total}.` : tot > l.total ? pick([`The ${tot} combined points flew over the ${l.total} total.`, `Over bettors had an easy night: ${tot} points against a total of ${l.total}.`]) : pick([`The under (${l.total}) never felt in danger with only ${tot} points scored.`, `Just ${tot} points went up, well under the ${l.total} total.`]);
      F.push([40 + rng() * 30, ats + ' ' + ou]);
    }
    const sw = streak(records(s, g.week + 1)[w.id]), sl0 = streak(records(s, g.week)[lo.id]), sw0 = streak(records(s, g.week)[w.id]), sl = streak(records(s, g.week + 1)[lo.id]);
    if (/^W\d+$/.test(sw) && +sw.slice(1) >= 3) F.push([60, pick([`That's ${sw.slice(1)} straight wins for ${w.name}.`, `${Cap(nick(w))} have now won ${sw.slice(1)} in a row.`, `The streak is up to ${sw.slice(1)} for ${w.name}.`])]);
    if (/^W\d+$/.test(sl0) && +sl0.slice(1) >= 3) F.push([70, `It also ended a ${sl0.slice(1)}-game winning streak for ${lo.name}.`]);
    if (/^L\d+$/.test(sw0) && +sw0.slice(1) >= 2) F.push([65, `For ${w.name}, it snapped a ${sw0.slice(1)}-game losing skid.`]);
    if (/^L\d+$/.test(sl) && +sl.slice(1) >= 3) F.push([55, pick([`${lo.name} has now dropped ${sl.slice(1)} straight.`, `The skid reaches ${sl.slice(1)} games for ${nick(lo)}.`])]);
    const prevW = seasonGames(w).filter(x => x.id !== g.id && x.week <= g.week);
    if (prevW.length >= 2 && ws > Math.max(...prevW.map(x => scoreOf(x, w)))) F.push([58, `The ${ws} points are a season high for ${w.name}.`]);
    const PWp = teamProfile(w.id, s, g.week); if (PWp.gp >= 2 && ws - PWp.pf / PWp.gp >= 10) F.push([45, `${w.name} came in averaging ${(PWp.pf / PWp.gp).toFixed(1)} points and blew right past it.`]);
    const PLp = teamProfile(lo.id, s, g.week); if (PLp.gp >= 2 && ws - PLp.pa / PLp.gp >= 12) F.push([42, `${lo.name} had been allowing ${(PLp.pa / PLp.gp).toFixed(1)} a game before this. Not this week.`]);
    const sTot = D.games.filter(x => x.season === s && played(x) && !x.forfeit && x.id !== g.id && x.week <= g.week).map(x => +x.homeScore + +x.awayScore);
    if (sTot.length >= 5 && tot > Math.max(...sTot)) F.push([62, `The ${tot} combined points make it the highest-scoring game of the season.`]);
    if (rk(lo) && !rk(w)) F.push([60, `${w.name} took down a ranked opponent in #${rk(lo)} ${lo.name}.`]);
    if (cw !== 'CPU') { const n = careerWins(cw, true) + 1; if (n && (n % 5 === 0 || n === 1)) F.push([50, `It's career win No. ${n} for ${cw} in the league.`]); }
    if (same && lastPlayedWeek(s) === g.week) { const ord2 = orderGroup(leagueTeams().filter(t => divOf(t, s) === dA).map(t => t.id), s); const pos = ord2.indexOf(w.id) + 1; if (pos) F.push([48, pos === 1 ? `${w.name} sits atop the ${dA} after this one.` : `${w.name} is ${ord(pos)} in the ${dA} now.`]); }
    // Always-true background facts so every recap has some depth.
    const rAfter = records(s, g.week + 1), rw = rAfter[w.id], rl = rAfter[lo.id];
    const recLine = (t, r) => t.conf === L.conference && (r.cw !== r.w || r.cl !== r.l) ? `${r.w}-${r.l} (${r.cw}-${r.cl} ${L.conference})` : `${r.w}-${r.l}`;
    F.push([30 + rng() * 25, pick([`${w.name} moves to ${recLine(w, rw)}, while ${lo.name} falls to ${recLine(lo, rl)}.`, `The win puts ${w.name} at ${recLine(w, rw)}. ${lo.name} drops to ${recLine(lo, rl)}.`])]);
    if (p && !upset) F.push([25 + rng() * 25, pick([`${w.name} went in with ${pw >= 80 ? 'a commanding' : 'a'} ${pw}% chance to win, and played like it.`, `The model liked ${w.name} at ${pw}% before kickoff.`, `${pw >= 70 ? 'No surprise here' : 'Close to the script'}: the model had ${w.name} winning ${pw}% of the time.`])]);
    if (PWp.gp) F.push([22 + rng() * 25, ws >= PWp.pf / PWp.gp ? `${w.name} scored ${ws}, ${(ws - PWp.pf / PWp.gp).toFixed(1)} more than its season average going in.` : `${w.name} won without its best offensive day, scoring ${ws} against a season average of ${(PWp.pf / PWp.gp).toFixed(1)}.`]);
    if (PLp.gp) F.push([22 + rng() * 25, ls <= PLp.pf / PLp.gp ? pick([`${lo.name} was held to ${ls}, ${(PLp.pf / PLp.gp - ls).toFixed(1)} below its average.`, `The ${w.name} defense kept ${lo.name} to ${ls} points, well under its ${(PLp.pf / PLp.gp).toFixed(1)} average.`]) : `${lo.name} put up ${ls}, actually above its ${(PLp.pf / PLp.gp).toFixed(1)}-point average. It just wasn't enough.`]);
    const nextOf = t => D.games.filter(x => x.season === s && x.week > g.week && (x.home === t.id || x.away === t.id)).sort((a, b) => a.week - b.week)[0];
    const nw = nextOf(w), nl = nextOf(lo), vsT = (x, t) => `${x.home === t.id ? 'hosts' : 'visits'} ${team(x.home === t.id ? x.away : x.home).name}`;
    if (nw || nl) F.push([18 + rng() * 20, `Up next: ${[nw ? `${w.name} ${vsT(nw, w)}${nw.type === 'ccg' ? ' in the title game' : ` in Week ${nw.week}`}` : '', nl ? `${lo.name} ${vsT(nl, lo)}${nl.type === 'ccg' ? ' in the title game' : ` in Week ${nl.week}`}` : ''].filter(Boolean).join('; ')}.`]);
    const picked = shuffle(F.map(f => [f[0] + rng() * 25, f[1]])).sort((x, y) => y[0] - x[0]).slice(0, 5 + Math.floor(rng() * 2)).map(f => f[1]);
    const half = Math.ceil(picked.length / 2);
    if (picked.length) { paras.push(picked.slice(0, half).join(' ')); if (picked.length > half) paras.push(picked.slice(half).join(' ')); }
  } else {
    // ----- preview -----
    const T = [];
    if (g.type === 'ccg') T.push([100, [`For All the Marbles: ${rn(A)} vs. ${rn(H)}`, `Title on the Line: ${A.name} vs. ${H.name}`, `One Game for the Crown`]]);
    if (rk(A) && rk(H)) T.push([90, [`Top-25 Clash: ${rn(A)} at ${rn(H)}`, `Ranked vs. Ranked in Week ${g.week}`]]);
    if (same && divOrder.indexOf(A.id) < 2 && divOrder.indexOf(H.id) < 2) T.push([86, [`Showdown for the ${dA} Crown`, `The ${dA} Runs Through This Game`, `${A.name}, ${H.name} and the ${dA} Title`]]);
    const lead0 = Object.entries(mw).sort((x, y) => y[1] - x[1])[0];
    if (lead0 && meets.length >= 3 && lead0[1] === meets.length) { const loser = lead0[0] === coachA ? coachH : coachA; T.push([80, [`Can ${loser} Finally Solve ${lead0[0]}?`, `${lead0[0]} Is ${meets.length}-0 Against ${loser}. Again?`]]); }
    if (meets.length) { const lm = meetingWinner(meets[0]), fresh = meets[0].season >= s - 1 && lm.ws - lm.ls >= 14; T.push([(fresh ? 62 : 40) + rng() * 15, [`Revenge Game: ${lm.lcoach} Gets Another Shot at ${lm.coach}`, `${lm.lcoach} Hasn't Forgotten Last Time`, `Round ${meets.length + 1}: ${coachA} vs. ${coachH}`, `${lm.lcoach} Wants This One Back`, `The Rematch: ${coachA} and ${coachH} Meet Again`]]); }
    if (l && Math.abs(l.spread) <= 2.5) T.push([60 + rng() * 15, [`Coin Flip: ${A.name} and ${H.name} Are Dead Even`, `Pick Your Side: Nothing Separates ${A.name} and ${H.name}`, `Too Close to Call in Week ${g.week}`]]);
    if (l && Math.abs(l.spread) >= 17) T.push([58, [`Upset Alert? ${dog.name} Tries to Shock ${rn(fav)}`, `${Math.abs(l.spread)} Points: Can ${dog.name} Hang With ${fav.name}?`]]);
    const sa = streak(ra), sh = streak(rh);
    [[A, sa], [H, sh]].forEach(([t, st]) => { if (/^W\d+$/.test(st) && +st.slice(1) >= 3) T.push([55 + rng() * 10, [`Can Anyone Stop ${t.name}?`, `${t.name} Goes for ${+st.slice(1) + 1} Straight`, `Red-Hot ${t.name} Rolls Into Week ${g.week}`]]); if (/^L\d+$/.test(st) && +st.slice(1) >= 3) T.push([50, [`Desperation Time for ${t.name}`, `${t.name} Needs to Stop the Bleeding`]]); });
    T.push([0, [`${A.name} at ${H.name}: What to Watch`, `Week ${g.week}: ${A.name} at ${H.name}`, `${A.name} Heads to ${H.name}`]]);
    title = pick(T.sort((x, y) => y[0] - x[0])[0][1]);
    // Lead.
    const ko = kickoffOf(g), v = venueOf(g);
    const opener = pick([
      `${Cap(who(A))} (${recTxt(A)}) ${g.neutral ? 'meets' : 'travels to face'} ${who(H)} (${recTxt(H)}) ${g.type === 'ccg' ? ' in the league title game' : ` in Week ${g.week}`}${v && !g.neutral ? ` at ${v.name}` : g.neutral ? ' at a neutral site' : ''}.`,
      `${g.type === 'ccg' ? 'The league title game' : `Week ${g.week}`} brings ${who(A)} (${recTxt(A)}) ${g.neutral ? 'and' : 'to'} ${who(H)} (${recTxt(H)})${v && !g.neutral ? ` at ${v.name}` : ''}.`,
      `${Cap(who(H))} (${recTxt(H)}) ${g.neutral ? 'meets' : 'welcomes'} ${who(A)} (${recTxt(A)})${g.type === 'ccg' ? ' in the league title game' : ` in Week ${g.week}`}.`]);
    let line = '';
    const an = n => (/^(8|11|18)/.test(String(n)) ? 'an' : 'a');
    if (l && p) line = !fav || l.spread === 0 ? `The books can't separate them: it's a pick'em with a total of ${l.total}.` : pick([`${fav.name} is laying ${Math.abs(l.spread)} with ${an(Math.max(p.a, p.h))} ${Math.max(p.a, p.h)}% chance to win, and the total sits at ${l.total}.`, `The line has ${fav.name} by ${Math.abs(l.spread)} (${Math.max(p.a, p.h)}% to win), total ${l.total}.`, `${dog.name} is getting ${Math.abs(l.spread)} points. The model gives it ${an(Math.min(p.a, p.h))} ${Math.min(p.a, p.h)}% shot at the outright win, and the total is ${l.total}.`]);
    const tag = g.type === 'ccg' ? ` It's the league championship, and bets on it get a +${Math.round((CCG_BOOST - 1) * 100)}% profit boost.` : isGotw ? pick([` The league voted it Game of the Week, so bets on it get a +${Math.round((GOTW_BOOST - 1) * 100)}% profit boost.`, ` It's the Game of the Week, which means a +${Math.round((GOTW_BOOST - 1) * 100)}% profit boost on bets.`]) : '';
    paras.push(`${opener} ${line}${tag}${ko ? ` Kickoff is set for ${fmtKick(ko)}.` : ''}`.trim());
    // Stakes (title odds swing), only when it matters for someone.
    if (L.phase === PHASES.REG && s === L.season && (g.type || 'reg') === 'reg' && A.conf === L.conference && H.conf === L.conference) {
      const u = nowUpto(), base = simulate(s, u), hW = simulate(s, u, 1500, { [g.id]: true }), aW = simulate(s, u, 1500, { [g.id]: false });
      stake = { a: [base[A.id].titlePct, aW[A.id].titlePct, hW[A.id].titlePct], h: [base[H.id].titlePct, hW[H.id].titlePct, aW[H.id].titlePct] };
      const outA = !base[A.id].titlePct && !aW[A.id].titlePct, outH = !base[H.id].titlePct && !hW[H.id].titlePct, cn = clinchNote(g);
      const swing = t => { const b = base[t.id].titlePct, w = (t === H ? hW : aW)[t.id].titlePct, lo = (t === H ? aW : hW)[t.id].titlePct; return { b, w, lo, d: w - lo }; };
      if (!(outA && outH)) {
        const big = [A, H].filter(t => !(t === A ? outA : outH)).map(t => ({ t, ...swing(t) })).sort((x, y) => y.d - x.d)[0];
        const other = (big.t === A ? H : A), otherOut = big.t === A ? outH : outA;
        paras.push(`${pick([`The stakes are real for ${big.t.name}.`, `This one matters most to ${big.t.name}.`, `Here's what's riding on it for ${big.t.name}:`])} ${pick([`Win, and the title odds climb to ${pctStr(big.w)}. Lose, and they ${big.lo < big.b - 0.005 ? 'fall to' : 'stay at'} ${pctStr(big.lo)}.`, `The model has the title chances at ${pctStr(big.b)} today: ${pctStr(big.w)} with a win, ${pctStr(big.lo)} with a loss.`])}${otherOut ? ` ${other.name} is out of the title race, which makes it the most dangerous kind of opponent: one with nothing to lose.` : ''}${cn ? ' ' + cn : ''}`);
      } else if (rng() < 0.5) paras.push(pick([`Neither team can reach the title game anymore, so this is about pride, bragging rights and wrecking someone's betting slip.`, `The title race has moved on without both of these teams. What's left is pride, and pride can make for a strange football game.`]));
    }
    // Pool of preview facts.
    const F = [];
    [[A, PA], [H, PH]].forEach(([t, P]) => {
      const o = t === A ? H : A;
      if (P.gp && ppgRank[t.id] && papgRank[o.id] && ppgRank[t.id] <= 3 && papgRank[o.id] >= nT - 2) F.push([75, `Mismatch alert: ${t.name} scores ${(P.pf / P.gp).toFixed(1)} a game (${ord(ppgRank[t.id])} in the league), and ${o.name} gives up ${((t === A ? PH : PA).pa / (t === A ? PH : PA).gp).toFixed(1)} (${ord(papgRank[o.id])}).`]);
      if (P.gp && ppgRank[t.id] && papgRank[o.id] && ppgRank[t.id] <= 3 && papgRank[o.id] <= 3) F.push([78, `Strength on strength: ${possN(t.name)} offense (${ord(ppgRank[t.id])} in scoring) against ${possN(o.name)} defense (${ord(papgRank[o.id])} in points allowed).`]);
      const f = formOf(t); if (f != null && Math.abs(f) >= 5) F.push([50, f > 0 ? pick([`${Cap(nick(t))} have been playing ${f.toFixed(1)} points a game better than expected over their last three.`, `Nobody's been hotter than ${t.name} lately: ${f.toFixed(1)} points a game better than the model expected over three weeks.`]) : `${t.name} has been ${Math.abs(f).toFixed(1)} points a game worse than expected over its last three.`]);
      if (P.ats[0] + P.ats[1] >= 4 && Math.abs(P.ats[0] - P.ats[1]) >= 2) F.push([40, P.ats[0] > P.ats[1] ? `${t.name} has been a bettor's friend at ${P.ats[0]}-${P.ats[1]} against the spread.` : `${t.name} is ${P.ats[0]}-${P.ats[1]} against the spread, which bettors have noticed.`]);
      if (P.ou[0] + P.ou[1] >= 4 && Math.abs(P.ou[0] - P.ou[1]) >= 3) F.push([38, `${possN(t.name)} games have gone ${fmtOU(P.ou)} against the total.`]);
      if (dog === t && P.dog[0] + P.dog[1] >= 2) F.push([45, `As an underdog, ${t.name} is ${P.dog[0]}-${P.dog[1]} straight up this season.`]);
      if (hasCoach(t)) { const n = careerWins(coachOfT(t), true); if (n >= 5) F.push([28, `${coachOfT(t)} has ${n} career wins in the league${(n + 1) % 5 === 0 ? `, so a win here would be No. ${n + 1}` : ''}.`]); }
    });
    // Both teams' last results in one sentence.
    const lastTxt = t => { const lg = lastGame(t); if (!lg) return null; const my = scoreOf(lg, t), th = oppScore(lg, t), op = team(lg.home === t.id ? lg.away : lg.home); return { won: my > th, txt: my > th ? `${my}-${th} win over ${op.name}` : `${th}-${my} loss to ${op.name}` }; };
    const la = lastTxt(A), lh = lastTxt(H);
    if (la && lh) F.push([35 + rng() * 30, la.won === lh.won ? pick([`Both teams are coming off ${la.won ? 'wins' : 'losses'}: ${A.name} a ${la.txt}, ${H.name} a ${lh.txt}.`, `${A.name} enters off a ${la.txt}; ${H.name} off a ${lh.txt}.`]) : pick([`They arrive in opposite moods. ${A.name} is coming off a ${la.txt}, ${H.name} a ${lh.txt}.`, `${A.name} (fresh off a ${la.txt}) meets a ${H.name} team coming off a ${lh.txt}.`])]);
    if (rk(A) || rk(H)) { const r = rk(A) ? A : H; if (!(rk(A) && rk(H))) F.push([40, `${r.name} comes in ranked #${rk(r)}, which puts a target on its back.`]); }
    // Always-true background facts so every preview has some depth.
    [[A, PA], [H, PH]].forEach(([t, P]) => { if (P.gp && ppgRank[t.id]) F.push([24 + rng() * 25, pick([`${t.name} averages ${(P.pf / P.gp).toFixed(1)} points (${ord(ppgRank[t.id])} in the league) and allows ${(P.pa / P.gp).toFixed(1)} (${ord(papgRank[t.id])}).`, `On the season, ${t.name} is scoring ${(P.pf / P.gp).toFixed(1)} a game and giving up ${(P.pa / P.gp).toFixed(1)}.`])]); });
    if (l && l.pHome != null && l.total) { const hs = Math.round((l.total - l.spread) / 2), as = Math.round((l.total + l.spread) / 2); F.push([30 + rng() * 25, pick([`Put the spread and total together and the books see something like ${H.name} ${hs}, ${A.name} ${as}.`, `The numbers point to a final around ${Math.max(hs, as)}-${Math.min(hs, as)}${hs === as ? '' : `, ${hs > as ? H.name : A.name}`}.`])]); }
    if (same) { const pa = divOrder.indexOf(A.id) + 1, ph = divOrder.indexOf(H.id) + 1; if (pa && ph) F.push([26 + rng() * 25, `In the ${dA} standings, ${A.name} sits ${ord(pa)} and ${H.name} ${ord(ph)}.`]); }
    const after = t => D.games.filter(x => x.season === s && x.week > g.week && (x.type || 'reg') === 'reg' && (x.home === t.id || x.away === t.id)).length;
    [A, H].forEach(t => { const n = after(t); if (n <= 1) F.push([20 + rng() * 20, n === 0 ? `It's the regular-season finale for ${t.name}.` : `${t.name} has just one game left after this one.`]); });
    const picked = shuffle(F.map(f => [f[0] + rng() * 30, f[1]])).sort((x, y) => y[0] - x[0]).slice(0, 5 + Math.floor(rng() * 2)).map(f => f[1]);
    const half = Math.ceil(picked.length / 2);
    if (picked.length) { paras.push(picked.slice(0, half).join(' ')); if (picked.length > half) paras.push(picked.slice(half).join(' ')); }
    const pw = playersToWatch(A, H, s); if (pw) paras.push(pw);
  }
  // Series history between the two coaches, worded a few ways.
  if (coachA !== 'CPU' && coachH !== 'CPU') {
    if (!meets.length) paras.push(pick([`Believe it or not, ${coachA} and ${coachH} ${done ? 'had' : 'have'} never played each other before ${done ? 'this' : 'now'}.`, `This ${done ? 'was' : 'is'} the first-ever meeting between ${coachA} and ${coachH}${done ? '' : ', so there are no bragging rights to defend yet'}.`, `First time ${coachA} and ${coachH} ${done ? 'met' : 'meet'}. ${done ? `${coachOfT(+g.homeScore > +g.awayScore ? H : A)} draws first blood.` : 'Somebody draws first blood.'}`]));
    else {
      const lm = meetingWinner(meets[0]), wa = mw[coachA] || 0, wh = mw[coachH] || 0;
      const lead = wa === wh ? pick([`The series is tied ${wa}-${wh}`, `${wa}-${wh}, dead even`]) : `${wa > wh ? coachA : coachH} ${pick(['leads the all-time series', 'owns the series', 'has the edge in the series'])} ${Math.max(wa, wh)}-${Math.min(wa, wh)}`;
      const tg = meets.filter(m => m.type === 'ccg').map(m => { const w = meetingWinner(m); return `the Season ${seasonNum(m.season)} title game, won by ${w.coach} ${w.ws}-${w.ls}`; });
      const last = `Season ${seasonNum(meets[0].season)}${meets[0].type === 'ccg' ? ' title game' : `, Week ${meets[0].week}`}`;
      paras.push(pick([
        `${lead}${done ? ' going into this one' : ''}${tg.length ? `, including ${tg.join(' and ')}` : ''}. Last time (${last}), ${possN(lm.coach)} ${team(lm.team).name} won ${lm.ws}-${lm.ls}.`,
        `${coachA} vs. ${coachH}, meeting No. ${meets.length + 1}. ${lead}${tg.length ? `, and they've already met in ${tg.join(' and ')}` : ''}. ${lm.coach} won the last one, ${lm.ws}-${lm.ls} (${last}).`,
        `History: ${lead}. The most recent meeting went to ${lm.coach}, ${lm.ws}-${lm.ls}, in ${last}${tg.length ? `; they've also met in ${tg.join(' and ')}` : ''}.`]));
    }
  }

  // ----- trends to watch -----
  const trends = [];
  const is = done ? 'was' : 'is', has = done ? 'had' : 'has';
  [[A, PA], [H, PH]].forEach(([t, P]) => {
    if (P.ats[0] + P.ats[1] >= 3) trends.push(`${t.name} ${is} <b>${P.ats[0]}-${P.ats[1]}${P.ats[2] ? '-' + P.ats[2] : ''}</b> against the spread this season${done ? ' going in' : ''}.`);
    if (P.ou[0] + P.ou[1] >= 3 && Math.abs(P.ou[0] - P.ou[1]) >= 2) trends.push(`${t.name} games ${done ? 'had gone' : 'have gone'} <b>${fmtOU(P.ou)}</b> against the total.`);
    if (P.dog[0] + P.dog[1] >= 2) trends.push(`${t.name} ${is} <b>${P.dog[0]}-${P.dog[1]}</b> straight up as an underdog.`);
    const st = streak(recs0[t.id]); if (/^[WL]\d+$/.test(st) && +st.slice(1) >= 3) trends.push(`${t.name} ${has} ${st[0] === 'W' ? 'won' : 'lost'} <b>${st.slice(1)} straight</b>.`);
  });
  if (meets.length >= 2) { const wa = mw[coachA] || 0, wh = mw[coachH] || 0; trends.push(`${coachA} ${is} <b>${wa}-${wh}</b> all-time against ${coachH}${done ? ' going in' : ''}.`); }

  // ----- render -----
  const pr = done ? powerRankings(s, g.week) : currentPower(s), prOf = t => pr.find(x => x.id === t.id)?.rank;
  const sim = L.phase === PHASES.REG && s === L.season ? simulate(s, nowUpto()) : null;
  // dir: +1 higher is better, -1 lower is better, 0 no comparison. Green = edge, red = behind.
  const tape = [];
  const row = (label, fa, fh, va, vh, dir = 0) => {
    let ca = '', ch = '';
    if (dir && va != null && vh != null && isFinite(va) && isFinite(vh) && va !== vh) { const aBetter = (va - vh) * dir > 0; ca = aBetter ? 'tb' : 'tw'; ch = aBetter ? 'tw' : 'tb'; }
    tape.push({ label, a: String(fa), h: String(fh), edge: ca === 'tb' ? 'a' : ch === 'tb' ? 'h' : '' });
    const ck = '<span class="ck" aria-label="edge">✓</span>';
    return `<tr><td class="num ${ca}">${ca === 'tb' ? ck : ''}${fa}</td><th style="text-align:center">${label}</th><td class="${ch}">${fh}${ch === 'tb' ? ck : ''}</td></tr>`;
  };
  const wpct = r => r && r.w + r.l ? r.w / (r.w + r.l) : null, ap = a => a[0] + a[1] ? a[0] / (a[0] + a[1]) : null;
  const stv = r => { const x = streak(r); return /^[WL]\d+$/.test(x) ? (x[0] === 'W' ? 1 : -1) * +x.slice(1) : null; };
  const num = (P, k) => P.gp ? P[k] / P.gp : null, rkv = v => v || 999, nz = v => +v || null;
  const ppg = P => P.gp ? (P.pf / P.gp).toFixed(1) : '–', papg = P => P.gp ? (P.pa / P.gp).toFixed(1) : '–', rec3 = a => a[0] + a[1] + a[2] ? `${a[0]}-${a[1]}${a[2] ? '-' + a[2] : ''}` : '–';
  const side = (t, coach, scr, won) => `<div class="gp-team ${done && !won ? 'l' : ''}"><i class="sw big" style="background:${esc(teamColor(t))}"></i><div><div class="gp-name">${rk(t) ? `<span class="rk">#${rk(t)}</span>` : ''}<a href="#team/${esc(t.id)}${s === L.season ? '' : '/' + s}">${esc(t.name)}</a></div>
    <div class="muted small">${rec(recs[t.id])}${coach && coach !== 'CPU' ? ` · <a href="#coach/${slug(coach)}">${esc(coach)}</a>` : ' · CPU'}</div></div>${done ? `<div class="gp-score">${g.forfeit ? (won ? 'FW' : 'FL') : scr}</div>` : ''}</div>`;
  const hw = +g.homeScore > +g.awayScore;
  const ko = kickoffCard(g);
  const canBet = !done && s === L.season && g.week >= L.week && L.bettingOpen && L.phase !== PHASES.POST && !ownGame(g);
  // Everything the broadcast cheat sheet needs, gathered from what this page already worked out.
  UI.cheat = { g, A, H, coachA, coachH, done, l, p, fav, isGotw, title, tape, stake, clinch: !done ? clinchNote(g) : '', rk: { a: rk(A), h: rk(H) },
    rec: { a: recTxt(A), h: recTxt(H) }, paras: (() => { const vs = {}; return paras.map(t => vary(t, vs)); })(),
    trends: trends.slice(0, 6).map(t => t.replace(/<[^>]+>/g, '')),
    series: coachA !== 'CPU' && coachH !== 'CPU' && meets.length ? `${coachA} vs. ${coachH}: ${mw[coachA] || 0}-${mw[coachH] || 0} all-time` + (() => { const w = meetingWinner(meets[0]); return `. Last: S${seasonNum(meets[0].season)} ${meets[0].type === 'ccg' ? 'title game' : 'Wk ' + meets[0].week}, ${w.coach} won ${w.ws}-${w.ls}.`; })() : (coachA !== 'CPU' && coachH !== 'CPU' ? `First-ever meeting between ${coachA} and ${coachH}.` : '') };
  return `<p><a href="#schedule/${g.week}">← ${esc(gWeek(g))} schedule</a></p>
    <div class="card gp-head${isGotw || g.type === 'ccg' ? ' gotw' : ''}">${g.type === 'ccg' ? `<span class="ribbon">${champRibbon()}</span>` : isGotw ? '<span class="ribbon">★ Game of the Week</span>' : ''}
      <div class="muted small" style="text-transform:uppercase;letter-spacing:.8px;font-weight:800">Season ${seasonNum(s)} · ${g.type === 'ccg' ? 'League Championship' : g.type === 'bowl' ? 'Postseason' : 'Week ' + g.week}${done ? ' · Final' : ''}${gameTags(g) ? ' · ' + gameTags(g) : ''}</div>
      <div class="gp-vs">${side(A, coachA, g.awayScore, !hw)}<div class="gp-at">${g.neutral ? 'vs' : '@'}</div>${side(H, coachH, g.homeScore, hw)}</div>
      ${ko.meta}
      ${l && !g.forfeit ? (done ? probBar(g, l, done) + finalLines(g, l, A, H) : `<div class="gp-odds"><div><span>Spread</span><b>${l.spread === 0 ? 'PK' : esc(fav.abbr || fav.name) + ' ' + fmtLine(-Math.abs(l.spread))}</b></div><div><span>Total</span><b>O/U ${l.total}</b></div>
        <div><span>Moneyline</span><b>${esc(A.abbr)} ${fmtOdds(l.mlAway)}</b><b>${esc(H.abbr)} ${fmtOdds(l.mlHome)}</b></div></div>${l.ttHome != null ? `<p class="muted small" style="margin:6px 0 0;text-align:center">Team totals: <b>${esc(A.abbr)} ${l.ttAway}</b> · <b>${esc(H.abbr)} ${l.ttHome}</b></p>` : ''}`) + (done ? '' : probBar(g, l, done)) : ''}
      ${canBet ? `<button class="gold" data-betgame="${g.week}" style="margin-top:12px">Bet this game${g.type === 'ccg' ? ` · +${Math.round((CCG_BOOST - 1) * 100)}% boost` : isGotw ? ` · +${Math.round((GOTW_BOOST - 1) * 100)}% boost` : ''} →</button>` : ''}${ko.ctl}</div>
    ${done ? broadcastCard(g) : ''}
    ${l && !g.forfeit ? winChart(g, A, H) : ''}
    ${(() => { const air = done ? aiRecap(g) : null; if (done && !AI.moms && videosOf(g).length) loadMoments();
      const showCtl = !air && isCommish() && AI.moms?.games?.[g.id]?.r;   // recap hidden: keep the Show link reachable
      if (showCtl) return `<div class="card gp-story"><h2 class="gp-title">${esc(title)}</h2>${(() => { const vs = {}; return paras.map(t => `<p>${esc(vary(t, vs))}</p>`).join(''); })()}${aiExtras(g, A, H)}</div>`;
      return air ? `<div class="card gp-story"><h2 class="gp-title">${esc(air.h)}</h2>${air.p.map(t => `<p>${esc(t)}</p>`).join('')}${aiExtras(g, A, H)}<p class="aifoot">Recap written by AI from the broadcast.</p></div>`
        : `<div class="card gp-story"><h2 class="gp-title">${esc(title)}</h2>${(() => { const vs = {}; return paras.map(t => `<p>${esc(vary(t, vs))}</p>`).join(''); })()}</div>`; })()}

    ${trends.length ? `<div class="card"><h3 style="margin-top:0">${done ? 'Trends going in' : 'Trends to watch'}</h3><ul class="clean gp-trends">${trends.slice(0, 6).map(t => `<li>${t}</li>`).join('')}</ul></div>` : ''}
    <div class="card"><h3 style="margin-top:0">Tale of the tape</h3><p class="muted small" style="margin-top:0">${done ? 'How the teams stacked up going in. ' : ''}<span class="tb">✓ Green</span> = the edge in that category, <span class="tw">red</span> = behind.</p><div class="tablewrap"><table class="gp-tape">
      <tr><td class="num"><b>${esc(A.abbr || A.name)}</b></td><th></th><td><b>${esc(H.abbr || H.name)}</b></td></tr>
      ${row('Record', rec(recs0[A.id]), rec(recs0[H.id]), wpct(recs0[A.id]), wpct(recs0[H.id]), 1)}${row('Points / game', ppg(PA), ppg(PH), num(PA, 'pf'), num(PH, 'pf'), 1)}${row('Allowed / game', papg(PA), papg(PH), num(PA, 'pa'), num(PH, 'pa'), -1)}
      ${row('Against the spread', rec3(PA.ats), rec3(PH.ats), ap(PA.ats), ap(PH.ats), 1)}${row('Over-Under', fmtOU(PA.ou), fmtOU(PH.ou))}${row('Streak', streak(recs0[A.id]), streak(recs0[H.id]), stv(recs0[A.id]), stv(recs0[H.id]), 1)}
      ${row('Top 25', rk(A) ? '#' + rk(A) : '–', rk(H) ? '#' + rk(H) : '–', rk(A) || rk(H) ? rkv(rk(A)) : null, rkv(rk(H)), -1)}${row('Power rank', prOf(A) ? '#' + prOf(A) : '–', prOf(H) ? '#' + prOf(H) : '–', prOf(A), prOf(H), -1)}
      ${row('Overall', A.ovr || '–', H.ovr || '–', nz(A.ovr), nz(H.ovr), 1)}${row('Offense', A.off || '–', H.off || '–', nz(A.off), nz(H.off), 1)}${row('Defense', A.def || '–', H.def || '–', nz(A.def), nz(H.def), 1)}${pbA || pbH ? row('Offense playbook', esc(pbA?.off || '–'), esc(pbH?.off || '–')) + row('Defense playbook', esc(pbA?.def || '–'), esc(pbH?.def || '–')) : ''}
      ${!done && sim && sim[A.id] && sim[H.id] ? row('Title odds', pctStr(sim[A.id].titlePct), pctStr(sim[H.id].titlePct), sim[A.id].titlePct, sim[H.id].titlePct, 1) : ''}
    </table></div></div>
    ${coachA !== 'CPU' && coachH !== 'CPU' ? `<div class="card"><h3 style="margin-top:0">Past meetings: ${esc(coachA)} vs. ${esc(coachH)}</h3>${meets.length ? `<p class="muted small" style="margin-top:0">${mw[coachA] || 0}-${mw[coachH] || 0} all-time${done ? ' before this game' : ''}. Coaches' records follow them from team to team.</p><div class="tablewrap"><table>
      <tr><th>When</th><th>Result</th></tr>${meets.map(m => { const w = meetingWinner(m); return `<tr class="clickable" data-game="${esc(m.id)}"><td class="muted">S${seasonNum(m.season)} · ${m.type === 'ccg' ? '<b class="win">Title game</b>' : 'Wk ' + m.week}</td><td class="wrap"><b>${esc(w.coach)}</b> (${esc(team(w.team).name)}) ${m.forfeit ? 'by forfeit over' : `${w.ws}-${w.ls} over`} ${esc(w.lcoach)} (${esc(team(w.lteam).name)})</td></tr>`; }).join('')}</table></div>` : `<p class="muted">${done ? 'This was the first meeting between these two coaches.' : 'First meeting ever between these two coaches.'}</p>`}</div>` : ''}
    ${gameBets(g)}
    ${done ? '' : `<p class="cheatlink"><a href="javascript:void 0" data-act="cheat">📺 Broadcast cheat sheet ›</a></p>`}`;
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
  $('#acct').innerHTML = auth.user ? acctHtml(p) : '<a class="btn" href="#account">Log In</a>';
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
// Screen readers need a name for every input and menu. Fields without a <label> get one from the nearest
// visible caption (a preceding label/heading/span), falling back to their placeholder or first option.
function nameFields(root) {
  if (!root) return;
  root.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(el => {
    if (el.labels?.length || el.getAttribute('aria-label')) return;
    let cap = '', p = el.previousElementSibling;
    while (p && !cap) { if (!p.matches('input,select,button')) cap = p.textContent.trim(); p = p.previousElementSibling; }
    cap = cap || el.getAttribute('placeholder') || el.getAttribute('title') || (el.tagName === 'SELECT' ? el.options[0]?.textContent : '') || el.dataset.k || el.name || '';
    if (cap) el.setAttribute('aria-label', cap.slice(0, 60));
  });
}
window.nameFields = nameFields;
function route() {
  // A shared tail link (#tail/<betId>) opens the sportsbook with that bet's slip in a pop-up, not a separate page.
  if (location.hash.startsWith('#tail/')) {
    const id = decodeURIComponent(location.hash.slice(6));
    history.replaceState(null, '', location.pathname + location.search + '#betting');
    route(); showTailModal(id); return;
  }
  const [page, arg] = (location.hash.slice(1) || 'home').split('/');
  const active = page === 'mybets' ? 'betting' : page === 'team' ? 'teams' : page === 'coach' ? 'history' : page === 'game' ? 'schedule' : page;
  $('#nav').innerHTML = NAV.map(([k, label]) => `<a href="#${k}" class="${k === active ? 'on' : ''}">${label}</a>`).join('');
  // Keep the selected tab in view when the tab bar scrolls sideways (phones).
  requestAnimationFrame(() => { const on = $('#nav a.on'), n = $('#nav'); if (on && n.scrollWidth > n.clientWidth) n.scrollLeft = Math.max(0, on.offsetLeft - (n.clientWidth - on.offsetWidth) / 2); });
  header();
  try { $('#view').innerHTML = (PAGES[page] || PAGES.home)(decodeURIComponent(arg || '')); parlayBar(); nameFields($('#view')); }
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
  const vl = e.target.closest('[data-vidlist]'); if (vl) { e.preventDefault(); showVideoList(vl.dataset.vidlist); return; }
  const tg = e.target.closest('[data-tailgo]'); if (tg) { $('#modal').innerHTML = ''; if (!auth.profile) { location.hash = '#account'; return; } tailBet(tg.dataset.tailgo); return; }
  const bfl = e.target.closest('[data-bfilter]'); if (bfl) { UI.betFilter = bfl.dataset.bfilter; route(); return; }
  const rdv = e.target.closest('[data-racediv]');
  if (rdv) { UI.raceDiv = UI.raceDiv === rdv.dataset.racediv ? null : rdv.dataset.racediv; const box = $('#race'); if (box) box.innerHTML = raceSection(); return; }
  const rp = e.target.closest('[data-rpick]'), rr = e.target.closest('[data-rreset]');
  if (rp || rr) {
    if (rp) { const [gid, side] = rp.dataset.rpick.split('|'); if (racePicks[gid] === side) delete racePicks[gid]; else racePicks[gid] = side; }
    else { const div = rr.dataset.rreset; D.games.forEach(g => { if (divOf(team(g.home)) === div || divOf(team(g.away)) === div) delete racePicks[g.id]; }); }
    saveRacePicks();
    const box = $('#race'), y = scrollY; if (box) { box.innerHTML = raceSection(); scrollTo(0, y); }
    return;
  }
  if (e.target.closest('[data-a2hsx]')) { try { localStorage.setItem('oecA2HS', '1'); } catch (x) { } e.target.closest('.a2hs')?.remove(); return; }
  const bg = e.target.closest('[data-betgame]');
  if (bg) { UI.betWeek = +bg.dataset.betgame; location.hash = '#betting'; return; }
  const gc = e.target.closest('[data-game]');
  if (gc && !e.target.closest('a,button,input,select,label')) { location.hash = '#game/' + gc.dataset.game; window.scrollTo(0, 0); return; }
  const lx = e.target.closest('[data-livex]');
  if (lx) { try { localStorage.setItem('oecLiveDismissed', lx.dataset.livex); } catch (err) { /* ignore */ } showLive(); return; }
  const tf = e.target.closest('[data-tsflip]'); if (tf) { UI.tsFlip = !UI.tsFlip; route(); return; }
  const hh = e.target.closest('[data-h2h]'); if (hh && !e.target.closest('a')) { const k = hh.dataset.h2h; UI.h2h = { ...(UI.h2h || {}), [k]: !(UI.h2h || {})[k] }; const y = scrollY; route(); scrollTo(0, y); return; }
  const ct = e.target.closest('[data-cbtrend]'); if (ct) { const v = ct.dataset.cbtrend; UI.cbTrend = UI.cbTrend === v && v !== 'all' ? 'all' : v; const y = scrollY; route(); scrollTo(0, y); return; }
  const cf = e.target.closest('[data-cbflip]'); if (cf) { UI.cbFlip = !UI.cbFlip; route(); return; }
  const cb = e.target.closest('[data-cbspan]'); if (cb) { UI.cbSpan = cb.dataset.cbspan; route(); return; }
  const tr = e.target.closest('tr[data-team]'); if (tr && !e.target.closest('a')) { location.hash = '#team/' + tr.dataset.team; return; }
  const t = e.target.closest('[data-finteam],[data-pname],[data-momhide],[data-sort],[data-metric],[data-trend],[data-pr],[data-prsort],[data-bet],[data-fut],[data-wins],[data-mode],[data-slip],[data-popular],[data-res],[data-act],[data-close],[data-stake],[data-acct],[data-cancel],[data-cashout],[data-value],[data-kinv],[data-kacc],[data-kdec],[data-kcan]');
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
  else if (t.dataset.value) { const [gid, market, pick] = t.dataset.value.split('|'); if (UI.mode === 'parlay') toggleLeg(gid, market, pick); else showSlip(gid, market, pick); }
  else if (t.dataset.kinv || t.dataset.kacc || t.dataset.kdec || t.dataset.kcan) kickAction(t);
  else if (t.dataset.act === 'place') placeBet();
  else if (t.dataset.act === 'saveSlip') saveSlip();
  else if (t.dataset.act === 'copyTail') copyTail();
  else if (t.dataset.act === 'hardReload') { sessionStorage.removeItem('oecReloaded'); location.reload(); }
  else if (t.dataset.act === 'cheat') showCheat();
  else if (t.dataset.pname) {
    const [tid, cur] = t.dataset.pname.split('|');
    const nv = prompt(`Correct name for ${cur} (${team(tid).name}). Leave it blank to undo a fix.`, cur);
    if (nv == null) return;
    const F = { ...((D.league.pnames || {})[tid] || {}) }, orig = Object.keys(F).find(k => F[k] === cur) || cur.toLowerCase();
    F[orig] = nv.trim() === cur && !F[orig] ? '' : nv.trim();   // '' = no fix (saved merges can't remove a key)
    await put('meta', 'league', { pnames: { ...(D.league.pnames || {}), [tid]: F } }); route();
  }
  else if (t.dataset.finteam != null && t.matches('.chipbtn')) {
    const prefs = { ...pushDefaults(), ...(pushLocal()?.prefs || {}) }, id = t.dataset.finteam, cur = prefs.finalTeams || [];
    prefs.finalTeams = !id ? [] : cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    try { await pushPrefs(prefs); } catch (err) { alert(err.message || String(err)); }
    route();
  }
  else if (t.dataset.act === 'momRedo') { if (confirm('Run this game through the AI again? It will be redone within about an hour.')) { await put('meta', 'league', { momRedo: { [t.dataset.gid]: Date.now() } }); route(); } }
  else if (t.dataset.momhide) {
    const [gid, k] = t.dataset.momhide.split('|'), cur = (D.league.momHide || {})[gid] || [];
    await put('meta', 'league', { momHide: { [gid]: cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k] } }); route();
  }
  else if (t.dataset.act === 'saveCheat') { const C = UI.cheat; saveCanvas(UI.cheatCanvas, `oec-${slug((C?.A.abbr || 'away') + '-at-' + (C?.H.abbr || 'home'))}-cheat-sheet.png`, 'OEC broadcast cheat sheet'); }
  else if (t.dataset.slip) showSlipImage(D.wagers.find(x => x.id === t.dataset.slip));
  else if (t.dataset.act === 'clearLegs') { UI.legs = []; route(); }
  else if (t.dataset.act === 'reviewParlay') showParlaySlip();
  else if (t.dataset.act === 'logout') logout();
  else if (t.dataset.act === 'pushOn' || t.dataset.act === 'pushOff') {
    t.disabled = true;
    try { if (t.dataset.act === 'pushOn') await pushEnable(); else await pushDisable(); } catch (err) { alert(err.message || String(err)); }
    route();
  }
  else if (t.dataset.act === 'gotw') {
    const v = $('input[name=gotw]:checked'); if (!v) return alert('Pick a game first.');
    const s = S(), w = D.league.week + 1, uid = auth.profile.id;
    try { await put('gotw', `${s}_${w}_${uid}`, { season: s, week: w, uid, gameId: v.value }, false); await reload(); } catch (err) { alert('Vote failed: ' + err.message); }
  } else if (t.dataset.act === 'ballot') {
    const picks = {};
    for (const d of AWARD_DEFS) {
      if (d.type === 'player') { const n = $(`[data-aw="${d.key}"][data-awf="name"]`).value.trim().replace(/\s+/g, ' '), tm = $(`[data-aw="${d.key}"][data-awf="team"]`).value;
        if (n && !tm) return alert(`Pick ${n}'s team for ${d.label}.`); if (n) picks[d.key] = { name: n, team: tm }; }
      else { const v = $(`[data-aw="${d.key}"]`).value; if (v) picks[d.key] = v; }
    }
    if (!Object.keys(picks).length) return alert('Fill in at least one award.');
    const s = S(), uid = auth.profile.id;
    try { await put('ballots', `${s}_${uid}`, { season: s, uid, coach: auth.profile.name, picks, ts: Date.now() }, false); await reload(); $('#bmsg').textContent = 'Ballot saved ✓'; }
    catch (err) { alert('Could not save ballot: ' + err.message); }
  }
});
document.addEventListener('input', e => { if (e.target.id === 'stake') updToWin(); });
document.addEventListener('change', e => {
  if (e.target.matches('[data-pushpref]')) {
    const prefs = { ...pushDefaults(), ...(pushLocal()?.prefs || {}) };
    $$('[data-pushpref]').forEach(c => { prefs[c.dataset.pushpref] = c.checked; });
    pushPrefs(prefs).then(() => { if (e.target.dataset.pushpref === 'finals') route(); }).catch(err => alert(err.message || String(err)));
    return;
  }
  if (e.target.dataset.betweek) { UI.betWeek = +e.target.value; route(); }
  if (e.target.dataset.nav) location.hash = '#' + e.target.dataset.nav + '/' + e.target.value;
  if (e.target.matches('[data-awseason]')) { UI.awSeason = e.target.value; route(); }
  if (e.target.matches('[data-cbstat]')) { UI.cbKey = e.target.value; UI.cbFlip = false; route(); }
  if (e.target.matches('[data-tstat]')) { UI.tsKey = e.target.value; UI.tsFlip = false; route(); }
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
    checkVersion(); document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
    loadVideos().then(() => { if (VIDS && /^#(game|schedule|home|team)/.test(location.hash || '#home')) route(); });
    loadMoments();
    checkLive();
    await watchAuth(async () => { if (D.league.awards?.open && auth.user) await loadBallots(false); try { await ensureFutures(); } catch (e) { console.warn('futures post failed', e); } route(); showResultsPopup(); });
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="card"><b>Couldn't load league data.</b><p class="muted">${esc(e.message)}. If you opened index.html straight from your computer, publish it with GitHub Pages (or run a local server).</p></div>`;
  }
})();

// Final game: show which side of each line hit. l.spread is the home line (negative = home favored).
function finalLines(g, l, A, H) {
  // How every line finished, as a compact list: market · the line · result.
  const hs = +g.homeScore, as = +g.awayScore, ab = t => esc(t.abbr || t.name), win = hs > as ? H : A;
  const row = (k, v, res, cls = 'hit') => `<div class="lf-row"><span class="lf-k">${k}</span><span class="lf-v">${v}</span><span class="lf-r ${cls}">${res}</span></div>`;
  const m = hs - as + l.spread, fav = l.spread < 0 ? H : A;
  const spLine = l.spread === 0 ? 'PK' : `${ab(fav)} ${fmtLine(-Math.abs(l.spread))}`;
  const sp = m === 0 ? row('Spread', spLine, 'Push', 'push') : row('Spread', spLine, `✓ ${ab(m > 0 ? H : A)} covered`);
  const ml = row('Moneyline', `${ab(A)} ${fmtOdds(l.mlAway)} · ${ab(H)} ${fmtOdds(l.mlHome)}`, `✓ ${ab(win)} won`);
  const ou = (k, line, pts) => line == null ? '' : pts === line ? row(k, `${line}`, `Push · ${pts}`, 'push') : row(k, `O/U ${line}`, `✓ ${pts > line ? 'Over' : 'Under'} · ${pts}`);
  return `<div class="linesfinal"><div class="lf-head"><span>Line</span><span></span><span>Result</span></div>${sp}${ml}${ou('Total', l.total, hs + as)}${ou(ab(A) + ' total', l.ttAway, as)}${ou(ab(H) + ' total', l.ttHome, hs)}</div>`;
}
