import {
  $, $$, esc, D, DEMO, PHASES, loadAll, batch, put, newId, loadBallots, auth, isCommish, watchAuth, refreshProfile,
  team, teamColor, isUserTeam, leagueTeams, played, seasonGames, slug, fmtOdds, fmtLine, weekLabel, lineOf, freshLine,
  orderGroup, divisions, settleOps, grade, profit, wagerLabel, defaultLeague, futuresSnapshot, settleFuturesOps, ensureFutures, boardOps, parlayOps, legsHtml, fmtTime, pollFor, gotwTally
} from './core.js?v=28';
import { lookupColor } from './teamcolors.js';

const TABS = [['advance', 'Weekly Advance'], ['games', 'Games'], ['top25', 'Top 25'], ['ratings', 'Ratings'], ['betting', 'Betting'], ['coaches', 'Coaches & Accounts'], ['awards', 'Awards'], ['preseason', 'Preseason'], ['settings', 'Settings & History']];
const ST = { tab: 'advance', desk: 'no', gamesWeek: null, msg: '', step: 1, draft: null, done: null };
const DEFAULT_AWARDS = ['MVP', 'Offensive Player of the Year', 'Defensive Player of the Year', 'Best Offense', 'Best Defense', 'Game of the Year'];

const DEFAULT_RULES = ["Cloud dynasty with active rosters and cross-play", "All-American difficulty with custom sliders", "10-minute quarters with 17-second accelerated clock", "League advances every 3 days; 24 hours can be added for user games if needed", "League commissioner is Chunky and league admin is Clay", "All communication happens in the league Discord"];
const L = () => D.league;
const teamOpts = (sel, blank, filter = () => true) => (blank ? `<option value="">${blank === true ? '—' : esc(blank)}</option>` : '') +
  D.teams.filter(filter).slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
const flash = m => { ST.msg = m; ST.clear = true; render(); window.scrollTo(0, 0); };
const findTeam = s => { const q = String(s || '').trim().toLowerCase(); return D.teams.find(t => t.id === q || t.name.toLowerCase() === q || (t.abbr || '').toLowerCase() === q); };

/* ---------- Top 25 editor ---------- */
function pollTeams() {
  const s = L().season, ids = new Set(leagueTeams().map(t => t.id));
  D.games.filter(g => g.season === s).forEach(g => { ids.add(g.home); ids.add(g.away); });
  return [...ids].map(team);
}
function pollEditor(week, override) {
  const cur = override ? Object.fromEntries(override.map(x => [x.id, x.r])) : pollFor(L().season, week);
  const ts = pollTeams().sort((a, b) => (cur[a.id] || 99) - (cur[b.id] || 99) || a.name.localeCompare(b.name));
  return `<div class="poll">${ts.map(t => `<label class="pollrow"><span><i class="sw" style="background:${esc(teamColor(t))}"></i> ${esc(t.name)} <span class="muted small">${esc(isUserTeam(t) ? t.coach : '')}</span></span>
    <span class="row" style="flex-wrap:nowrap"><b class="muted">#</b><input type="number" inputmode="numeric" min="1" max="25" data-poll="${esc(t.id)}" value="${cur[t.id] || ''}" placeholder="—" style="width:70px"></span></label>`).join('')}</div>
    <p class="muted small">Leave blank for unranked. Teams not in your schedule can be ignored; only teams you rank get a number.</p>`;
}
function readPoll() {
  const arr = [], seen = {};
  for (const el of $$('[data-poll]')) {
    if (el.value === '') continue;
    const r = Math.round(+el.value);
    if (!(r >= 1 && r <= 25)) throw new Error(`${team(el.dataset.poll).name}: rank must be 1–25.`);
    if (seen[r]) throw new Error(`Two teams are ranked #${r} (${team(seen[r]).name} and ${team(el.dataset.poll).name}).`);
    seen[r] = el.dataset.poll; arr.push({ id: el.dataset.poll, r });
  }
  return arr.sort((x, y) => x.r - y.r);
}
const pollKey = (week, season = L().season) => `${season}_${week}`;
const pollChanged = (arr, week) => { const cur = pollFor(L().season, week); return arr.length !== Object.keys(cur).length || arr.some(x => cur[x.id] !== x.r); };

/* ---------- shared pieces ---------- */
function deskBlock() {
  return `<div class="card"><h3 style="margin-top:0">Post a Commissioner's Desk note with this advance?</h3>
    <div class="seg"><button data-desk="yes" class="${ST.desk === 'yes' ? 'on' : ''}">Yes</button><button data-desk="no" class="${ST.desk === 'no' ? 'on' : ''}">No</button></div>
    <div ${ST.desk === 'yes' ? '' : 'hidden'}><label>Note to the league (shows at the top of the Home page)</label><textarea id="deskText" rows="4" placeholder="Advance times, reminders, trash talk…">${esc(ST.draft?.desk?.text || '')}</textarea></div>
    <p class="muted small">Choosing No clears last week's note from the Home page.</p></div>`;
}
const deskValue = () => ST.desk === 'yes' && $('#deskText')?.value.trim() ? { show: true, text: $('#deskText').value.trim() } : { show: false, text: '' };
function scoreRows(games, dr) {
  return games.map(g => {
    const l = lineOf(g), d = dr && dr.scores[g.id];
    const av = d ? d.a : (g.awayScore ?? ''), hv = d ? d.h : (g.homeScore ?? ''), ff = d ? d.ff : (g.forfeit ? (+g.awayScore > +g.homeScore ? 'away' : 'home') : '');
    const row = (side, v) => { const t = team(g[side]); return `<div class="sr"><span class="tn"><i class="sw" style="background:${esc(teamColor(t))}"></i><b>${esc(t.name)}</b> <span class="muted small">${isUserTeam(t) ? esc(t.coach) + ' · ' : ''}${side === 'home' ? (g.neutral ? 'neutral' : 'home') : 'away'}</span></span>
      <input class="score" type="number" inputmode="numeric" min="0" data-sc="${esc(g.id)}" data-side="${side}" value="${esc(v)}" placeholder="–"></div>`; };
    return `<div class="card scorecard">${row('away', av)}${row('home', hv)}
      <div class="row spread" style="margin-top:6px"><span class="meta" style="margin:0">${g.week !== L().week ? `<b class="gstat">Week ${g.week}</b> · ` : ''}${l ? `${g.lines ? 'Line' : 'Projected'}: ${esc(team(g.home).abbr)} ${fmtLine(l.spread)} · O/U ${l.total}` : ''} ${g.type && g.type !== 'reg' ? '· <span class="tag gold">' + esc(g.type.toUpperCase()) + '</span>' : ''}</span>
      <select data-ff="${esc(g.id)}" style="font-size:13px;padding:4px 8px"><option value="">Played</option><option value="away" ${ff === 'away' ? 'selected' : ''}>Away forfeit win</option><option value="home" ${ff === 'home' ? 'selected' : ''}>Home forfeit win</option></select></div></div>`;
  }).join('');
}
function readScores(games) {
  const ops = [], missing = [];
  games.forEach(g => {
    const ff = $(`[data-ff="${g.id}"]`)?.value;
    if (ff) { ops.push({ op: 'set', col: 'games', id: g.id, data: { forfeit: true, awayScore: ff === 'away' ? 1 : 0, homeScore: ff === 'home' ? 1 : 0, homeCoach: team(g.home).coach || 'CPU', awayCoach: team(g.away).coach || 'CPU' } }); return; }
    const a = $(`[data-sc="${g.id}"][data-side=away]`)?.value, h = $(`[data-sc="${g.id}"][data-side=home]`)?.value;
    if (a === '' || h === '' || a == null || h == null) { missing.push(g); return; }
    if (+a === +h) throw new Error(`${team(g.away).name} @ ${team(g.home).name} is tied — college games can't end tied.`);
    ops.push({ op: 'set', col: 'games', id: g.id, data: { forfeit: false, awayScore: +a, homeScore: +h, homeCoach: team(g.home).coach || 'CPU', awayCoach: team(g.away).coach || 'CPU' } });
  });
  return { ops, missing };
}
const lineOps = (week, season = L().season) => boardOps(week, season);
async function saveScoresAndSettle(games) {
  const { ops, missing } = readScores(games);
  await batch(ops);
  await batch(settleOps(ops.map(o => o.id)));
  return { saved: ops.length, missing };
}

/* ---------- Weekly advance wizard: ① Results → ② Next week → ③ Review & confirm ---------- */
function draft() {
  const lg = L();
  if (!ST.draft || ST.draft.week !== lg.week || ST.draft.season !== lg.season) ST.draft = { season: lg.season, week: lg.week, scores: {}, poll: null, desk: { on: false, text: '' } };
  return ST.draft;
}
// This week's games plus any earlier regular-season games still missing a result.
const wizGames = () => { const s = L().season, W = L().week; return D.games.filter(g => g.season === s && (g.week === W || (g.week < W && !played(g) && (g.type || 'reg') === 'reg'))).sort((a, b) => a.week - b.week); };
function collectScores() {
  const dr = draft();
  wizGames().forEach(g => {
    const a = $(`[data-sc="${g.id}"][data-side=away]`), h = $(`[data-sc="${g.id}"][data-side=home]`), f = $(`[data-ff="${g.id}"]`);
    if (!a) return;
    const v = { a: a.value, h: h.value, ff: f ? f.value : '' };
    if (!v.ff && v.a !== '' && v.h !== '' && +v.a === +v.h) throw new Error(`${team(g.away).name} @ ${team(g.home).name} is tied — college games can't end tied.`);
    dr.scores[g.id] = v;
  });
}
function draftScoreOps() {
  const ops = [];
  Object.entries(draft().scores).forEach(([id, v]) => {
    const g = D.games.find(x => x.id === id); if (!g) return;
    const base = { homeCoach: team(g.home).coach || 'CPU', awayCoach: team(g.away).coach || 'CPU' };
    if (v.ff) ops.push({ op: 'set', col: 'games', id, data: { ...base, forfeit: true, awayScore: v.ff === 'away' ? 1 : 0, homeScore: v.ff === 'home' ? 1 : 0 } });
    else if (v.a !== '' && v.h !== '') ops.push({ op: 'set', col: 'games', id, data: { ...base, forfeit: false, awayScore: +v.a, homeScore: +v.h } });
  });
  return ops;
}
function stepper(n) {
  const steps = ['Results', 'Next week', 'Review & confirm'];
  return `<div class="stepper">${steps.map((t, i) => `<div class="st ${i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''}"><b>${i + 1 < n ? '✓' : i + 1}</b><span>${t}</span></div>`).join('<i></i>')}</div>`;
}
function wizard() {
  const lg = L(), s = lg.season, W = lg.week, last = W >= lg.finalWeek, dr = draft(), nextLbl = last ? 'championship week' : `Week ${W + 1}`;
  if (ST.done) return ST.done;
  if (ST.step === 1) {
    const g = wizGames(), cur = g.filter(x => x.week === W), late = g.filter(x => x.week < W);
    return `${stepper(1)}<div class="card"><h2>Week ${W} results</h2><p class="muted small" style="margin:0">Enter every score (or mark a forfeit). Use <b>Save scores now</b> to lock finished user games mid-week. Betting is <b>${lg.bettingOpen ? 'OPEN' : 'LOCKED'}</b> <button class="sm ghost" data-act="toggleBet">${lg.bettingOpen ? 'Lock betting' : 'Unlock'}</button></p></div>
      ${late.length ? `<div class="notice">⚠️ ${late.length} earlier game${late.length === 1 ? ' is' : 's are'} still missing a result. Enter ${late.length === 1 ? 'it' : 'them'} here too.</div>${scoreRows(late, dr)}` : ''}
      ${cur.length ? scoreRows(cur, dr) : '<div class="card empty">No games scheduled this week. Add them on the Games tab, or continue.</div>'}
      <div class="card row spread"><button class="ghost" data-act="wizSave">Save scores now</button><button data-act="wizNext">Next: set up ${nextLbl} →</button></div>`;
  }
  if (ST.step === 2) {
    const nxt = D.games.filter(g => g.season === s && g.week === W + 1);
    return `${stepper(2)}<div class="card"><h2>Set up ${nextLbl}</h2>
        <h3>Top 25 entering ${nextLbl}</h3><p class="muted small" style="margin-top:0">Copy the new in-game poll. Leave everything as-is to keep this week's rankings.</p>${pollEditor(W, dr.poll)}</div>
      ${deskBlock()}
      ${last ? `<div class="card"><h3 style="margin-top:0">Up next: championship setup</h3><p class="muted small" style="margin:0">After you confirm, you'll set the championship matchup and the awards ballot.</p></div>` :
      `<div class="card"><h3 style="margin-top:0">Week ${W + 1} schedule (${nxt.length} game${nxt.length === 1 ? '' : 's'})</h3>${nxt.length ? `<div class="tablewrap"><table>${nxt.map(g => `<tr><td class="wrap">${esc(team(g.away).name)} ${g.neutral ? 'vs' : '@'} ${esc(team(g.home).name)}${isUserTeam(team(g.home)) && isUserTeam(team(g.away)) ? ' <span class="h2h">USER GAME</span>' : ''}</td><td class="num"><button class="sm danger" data-delgame="${esc(g.id)}">✕</button></td></tr>`).join('')}</table></div>` : '<p class="muted">No games scheduled yet.</p>'}
        <div class="row" style="margin-top:8px"><select id="wA">${teamOpts('', 'Away')}</select> @ <select id="wH">${teamOpts('', 'Home')}</select><button class="ghost sm" data-act="wizAddGame">+ Add game</button></div></div>`}
      <div class="card row spread"><button class="ghost" data-act="wizBack">← Back</button><button data-act="wizNext">Next: review →</button></div>`;
  }
  // Step 3: review
  const games = wizGames(), sc = dr.scores, ids = new Set();
  const lines = games.map(g => {
    const v = sc[g.id] || { a: g.awayScore ?? '', h: g.homeScore ?? '', ff: '' }, a = team(g.away).abbr || team(g.away).name, h = team(g.home).abbr || team(g.home).name;
    if (v.ff) { ids.add(g.id); return `<li>✅ ${esc(a)} @ ${esc(h)} — <b>${esc(v.ff === 'away' ? a : h)} wins by forfeit</b> <span class="muted small">(bets on this game are refunded)</span></li>`; }
    if (v.a === '' || v.h === '') return `<li class="err">⚠️ Wk ${g.week}: ${esc(a)} @ ${esc(h)} — no score (bets stay open)</li>`;
    ids.add(g.id); return `<li>✅ ${g.week < W ? `<span class="muted small">Wk ${g.week}</span> ` : ''}${esc(a)} <b>${esc(v.a)}</b> @ ${esc(h)} <b>${esc(v.h)}</b></li>`;
  });
  const missing = lines.filter(x => x.includes('class="err"')).length;
  const singles = D.wagers.filter(w => w.status === 'open' && ids.has(w.gameId)).length, parl = D.wagers.filter(w => w.status === 'open' && w.market === 'parlay' && (w.legs || []).some(l => ids.has(l.gameId))).length;
  const cur = pollFor(s, W), np = dr.poll || Object.entries(cur).map(([id, r]) => ({ id, r }));
  const npm = Object.fromEntries(np.map(x => [x.id, x.r])), allIds = [...new Set([...Object.keys(cur), ...Object.keys(npm)])];
  const moves = allIds.map(id => ({ id, a: cur[id], b: npm[id] })).filter(x => x.a !== x.b).sort((x, y) => (x.b || 99) - (y.b || 99));
  const gv = gotwTally(s, W + 1, { includeOpen: true });
  const nxt = D.games.filter(g => g.season === s && g.week === W + 1);
  return `${stepper(3)}<div class="card"><h2>Review Week ${W}</h2>
      <h3>Results (${ids.size} of ${games.length})</h3><ul class="clean review">${lines.join('') || '<li class="muted">No games.</li>'}</ul>
      <h3>Sportsbook</h3><p style="margin:4px 0">${singles + parl ? `${singles} single bet${singles === 1 ? '' : 's'}${parl ? ` and ${parl} parlay${parl === 1 ? '' : 's'}` : ''} will be graded and paid out.` : 'No open bets on these games.'}${last ? ' Win-total bets settle and League Champion futures close.' : ` Lines post for every upcoming game, and betting opens for Week ${W + 1}.`}</p>
      <h3>Top 25 entering ${nextLbl}</h3>${moves.length ? `<ul class="clean review">${moves.map(m => `<li>${esc(team(m.id).name)}: ${m.a ? '#' + m.a : 'unranked'} → <b>${m.b ? '#' + m.b : 'unranked'}</b></li>`).join('')}</ul>` : `<p style="margin:4px 0" class="muted">No changes (${Object.keys(cur).length} ranked teams carry over).</p>`}
      <h3>Commissioner's Desk</h3>${dr.desk.on && dr.desk.text ? `<div class="notice" style="white-space:pre-wrap;margin:4px 0">${esc(dr.desk.text)}</div>` : '<p style="margin:4px 0" class="muted">No note. Last week\'s note will be cleared.</p>'}
      ${last ? '' : `<h3>Week ${W + 1}</h3><p style="margin:4px 0">${nxt.length} game${nxt.length === 1 ? '' : 's'} scheduled.${gv.total ? ` Game of the Week voting closes: <b>${esc(team(gv.game?.away).name)} @ ${esc(team(gv.game?.home).name)}</b> leads with ${gv.counts[gv.game?.id]} of ${gv.total} votes.` : ' No Game of the Week votes were cast.'}</p>`}
      ${missing ? `<div class="notice" style="margin-top:12px">⚠️ ${missing} game${missing === 1 ? ' has' : 's have'} no result. You can still advance and enter ${missing === 1 ? 'it' : 'them'} later from the Games tab.</div>` : ''}</div>
    <div class="card row spread"><button class="ghost" data-act="wizBack">← Back</button><button class="gold" data-act="wizConfirm">✅ Confirm & ${last ? 'end the regular season' : `advance to Week ${W + 1}`}</button></div>`;
}

/* ---------- views ---------- */
const views = {
  advance() {
    const lg = L(), s = lg.season;
    if (!D.teams.length) return `<div class="card"><h2>Welcome, Commissioner</h2><p>The database is empty. Load the league history and the current season (Seasons 1–3 through Week 9) from <code>league-data.json</code>. This adds all teams, coaches, divisions, results, champions, awards and "Holy Shit" moments, then posts Week 10 lines.</p><button class="gold" data-act="importSeed">Load league data</button></div>`;
    if (lg.phase === PHASES.PRE) return `<div class="card"><h2>Offseason</h2><p>The ${s} season is wrapped up${D.history.find(h => h.season === s) ? ' and in the history books' : ''}. Fill out the <b>Preseason</b> form to set up next season: coaches, team ratings and the schedule. Publishing it opens Week 0 betting and posts preseason odds.</p><button data-tab="preseason">Open Preseason form →</button></div>`;
    if (lg.phase === PHASES.REG || ST.done) return wizard();
    if (lg.phase === PHASES.CCG) {
      const ccg = D.games.find(g => g.season === s && g.type === 'ccg');
      if (!ccg) {
        const divs = divisions(), finals = divs.length > 1 ? divs.map(d => orderGroup(leagueTeams().filter(t => t.div === d).map(t => t.id), s)[0]) : orderGroup(leagueTeams().map(t => t.id), s).slice(0, 2);
        const cats = (lg.awards?.season === s && lg.awards.categories?.length) ? lg.awards.categories : DEFAULT_AWARDS.map(l => ({ key: slug(l), label: l, options: [{ name: '', team: '' }, { name: '', team: '' }, { name: '', team: '' }] }));
        return `<div class="card"><h2>End of Regular Season</h2><p class="muted">Set the ${esc(lg.conference)} Championship Game and the awards ballot. Submitting opens championship-week betting and awards voting. Voting closes automatically when you submit the championship result.</p>
          <h3>League Championship Game</h3><div class="row"><select id="ccgA">${teamOpts(finals[1] || '', true, t => t.conf === lg.conference)}</select> vs <select id="ccgH">${teamOpts(finals[0] || '', true, t => t.conf === lg.conference)}</select>
          <label class="row" style="margin:0"><input type="checkbox" id="ccgN" checked style="width:auto"> Neutral site</label></div>
          <p class="muted small">Pre-filled with the ${divs.length > 1 ? 'division winners' : 'top two teams'} from the standings. Second team listed is the "home" team.</p>
          <div class="row"><label style="margin:0">Week number</label><input id="ccgW" type="number" value="${lg.week}" style="width:80px"></div></div>
          <div class="card"><h3 style="margin-top:0">Season Awards Ballot</h3><p class="muted small">Three finalists per category: a player name (with team) or just a team.</p><div id="cats">${catEditor(cats)}</div>
          <button class="ghost sm" data-act="addCat">+ Add category</button></div>
          ${deskBlock()}<div class="card"><button data-act="openCcg">Open championship week & awards voting</button></div>`;
      }
      const wkGames = D.games.filter(g => g.season === s && g.week === ccg.week);
      return `<div class="card"><h2>${esc(lg.conference)} Championship Results</h2><p class="muted">Enter the championship score (and any other games this week). Submitting settles wagers, <b>closes awards voting</b> and tallies the winners. Betting is <b>${lg.bettingOpen ? 'OPEN' : 'LOCKED'}</b> <button class="sm ghost" data-act="toggleBet">${lg.bettingOpen ? 'Lock betting' : 'Unlock betting'}</button></p>
        <p class="muted small">Ballots submitted: ${D.ballots.filter(b => b.season === s).length} of ${D.users.filter(u => u.teamId).length} coaches.</p></div>
        ${scoreRows(wkGames)}${deskBlock()}<div class="card"><button data-act="finishCcg">Submit championship & close voting</button></div>`;
    }
    // Postseason
    const post = D.games.filter(g => g.season === s && g.type === 'bowl');
    const res = lg.awards?.results || [];
    return `<div class="card"><h2>End of Season</h2><p class="muted">Add any bowl / playoff results you want on record (optional), then finalize. Finalizing writes the champion, award winners and "Holy Shit" moments to History and moves the league to the offseason.</p>
      <h3>Awards results</h3>${res.length ? `<table>${res.map(r => `<tr><td>${esc(r.award)}</td><td><b>${esc(r.winner)}</b></td><td class="num muted">${r.votes} votes</td></tr>`).join('')}</table>` : '<p class="muted">No ballots were cast.</p>'}</div>
      <div class="card"><h3 style="margin-top:0">Postseason games</h3>${post.length ? scoreRows(post) : '<p class="muted">None added.</p>'}
        <div class="row"><input id="pW" type="number" value="${lg.week + 1}" style="width:70px" title="Week"><select id="pA">${teamOpts('', 'Away/Team 1')}</select> vs <select id="pH">${teamOpts('', 'Home/Team 2')}</select><input id="pNote" placeholder="Bowl name (optional)"><button class="ghost" data-act="addBowl">Add</button></div>
        <p class="muted small">Opponent missing? Add it as a Non-Conf team on the Preseason tab first.</p></div>
      <div class="card"><label>Season notes for History (optional, e.g. national champion, records)</label><textarea id="sNotes" rows="2"></textarea></div>
      ${deskBlock()}<div class="card"><button data-act="finalize">Finalize ${s} season & update History</button></div>`;
  },

  preseason() {
    const lg = L(), done = !!D.history.find(h => h.season === lg.season), next = lg.phase === PHASES.PRE && done ? lg.season + 1 : lg.season;
    const ts = D.teams.slice().sort((a, b) => (b.conf === lg.conference) - (a.conf === lg.conference) || (a.div || '').localeCompare(b.div || '') || a.name.localeCompare(b.name));
    const sg = D.games.filter(g => g.season === next).sort((a, b) => a.week - b.week);
    return `${lg.phase !== PHASES.PRE ? `<div class="notice">The ${lg.season} season is in progress (${esc(weekLabel())}). Team rating edits apply right away; only publish a new season once this one is finalized.</div>` : ''}
      <div class="card"><h2>Preseason Setup</h2><div class="row"><div><label>Season</label><input id="psSeason" type="number" value="${next}" style="width:100px"></div>
        <div><label>Final regular-season week</label><input id="psFinal" type="number" value="${lg.finalWeek || 14}" style="width:100px"></div>
        <div><label>League conference</label><input id="psConf" value="${esc(lg.conference)}" style="width:120px"></div></div></div>
      <div class="card"><h3 style="margin-top:0">Teams, coaches & ratings</h3><p class="muted small">Every user team belongs in the league conference (${esc(lg.conference)}). Add any non-conference opponents as "Non-Conf" so they can be scheduled. OVR/OFF/DEF drive the odds. Division is optional (e.g. East/West).</p>
        <div class="tablewrap"><table id="teamTbl" class="stack-sm"><tr><th>Team</th><th>Abbr</th><th>Conf</th><th>Div</th><th>Coach</th><th>Account</th><th>Color</th><th>OVR</th><th>OFF</th><th>DEF</th><th></th></tr>
        ${ts.map(t => teamRow(t)).join('')}</table></div>
        <div class="row" style="margin-top:10px"><button class="ghost sm" data-act="addTeam">+ Add team</button><button data-act="saveTeams">Save teams</button><button class="ghost sm" data-act="seedRatings">Apply ratings from league-data.json</button></div></div>
      <div class="card"><h3 style="margin-top:0">${next} schedule (${sg.length} games)</h3><p class="muted small">Add user-vs-user games and each user team's games vs CPU teams.</p>
        <div class="row"><input id="sgW" type="number" value="0" style="width:70px" title="Week"><select id="sgA">${teamOpts('', 'Away')}</select> @ <select id="sgH">${teamOpts('', 'Home')}</select><label class="row" style="margin:0"><input type="checkbox" id="sgN" style="width:auto"> Neutral</label><button class="ghost" data-act="addSched">Add game</button></div>
        <label>Bulk add — one game per line: <code>week, away team, home team</code> (add <code>, neutral</code> if needed). Team name or abbreviation.</label><textarea id="bulk" rows="4" placeholder="0, Liberty, Kennesaw State&#10;1, KENN, Ohio"></textarea><button class="ghost sm" data-act="bulkSched" style="margin-top:6px">Add these games</button> <span id="bulkMsg" class="muted"></span>
        <div class="tablewrap" style="margin-top:10px"><table>${sg.map(g => `<tr><td>Wk ${g.week}</td><td class="wrap">${esc(team(g.away).name)} ${g.neutral ? 'vs' : '@'} ${esc(team(g.home).name)}${isUserTeam(team(g.home)) && isUserTeam(team(g.away)) ? ' <span class="h2h">USER GAME</span>' : ''}</td><td class="num">${played(g) ? g.awayScore + '-' + g.homeScore : ''}</td><td class="num"><button class="sm danger" data-delgame="${esc(g.id)}">✕</button></td></tr>`).join('')}</table></div></div>
      ${deskBlock()}
      <div class="card"><button class="gold" data-act="publish">Publish ${next} season → open Week ${sg.length ? Math.min(...sg.map(g => g.week)) : 0}</button>
        <p class="muted small">Publishing sets the current season and week, posts preseason odds and Week ${sg.length ? Math.min(...sg.map(g => g.week)) : 0} lines, opens betting (every coach starts with 1,000 credits) and starts a fresh odds chart. Save teams first.</p></div>`;
  },

  games() {
    const s = L().season, weeks = [...new Set(seasonGames().map(g => g.week))].sort((a, b) => a - b);
    const wk = ST.gamesWeek ?? L().week, games = D.games.filter(g => g.season === s && g.week === wk);
    return `<div class="card"><div class="row"><b>Week</b><select id="gwSel">${[...new Set([...weeks, wk])].sort((a, b) => a - b).map(w => `<option ${w === wk ? 'selected' : ''}>${w}</option>`).join('')}</select><input id="gwNew" type="number" placeholder="Other week" style="width:110px"><span class="muted small">Season ${s}. Use this to fix past scores; affected wagers are re-graded automatically.</span></div></div>
      ${scoreRows(games)}${games.length ? `<div class="card row"><button data-act="saveGames">Save scores</button> ${games.map(g => `<button class="sm danger" data-delgame="${esc(g.id)}">✕ ${esc(team(g.away).abbr)} @ ${esc(team(g.home).abbr)}</button>`).join('')}</div>` : ''}
      <div class="card"><h3 style="margin-top:0">Add a game to week ${wk}</h3><div class="row"><select id="gA">${teamOpts('', 'Away')}</select> @ <select id="gH">${teamOpts('', 'Home')}</select>
        <select id="gT"><option value="reg">Regular season</option><option value="ccg">League Championship</option><option value="bowl">Postseason</option></select><label class="row" style="margin:0"><input type="checkbox" id="gN" style="width:auto"> Neutral</label><button data-act="addGame">Add</button></div></div>`;
  },

  ratings() {
    const ts = leagueTeams().slice().sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="card"><h2>Team Ratings</h2><p class="muted small">Update OVR / OFF / DEF whenever rosters change. Saving re-posts this week's lines and updates odds and power rankings right away. Wagers already placed keep their line.</p>
      ${ts.map(t => `<div class="row" data-rate="${esc(t.id)}" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div style="flex:1 1 100%"><i class="sw" style="background:${esc(teamColor(t))};margin-right:6px"></i><b>${esc(t.name)}</b> <span class="muted small">${esc(t.coach || 'CPU')}</span></div>
        ${['ovr', 'off', 'def'].map(k => `<label style="margin:0;font-size:11px;text-align:center">${k.toUpperCase()}<br><input class="score" type="number" inputmode="numeric" min="40" max="99" data-k="${k}" value="${t[k] ?? ''}" style="width:64px"></label>`).join('')}</div>`).join('')}
      <div class="row" style="margin-top:12px"><button data-act="saveRatings">Save ratings</button></div></div>`;
  },

  top25() {
    const lg = L(), wk = lg.week;
    return `<div class="card"><h2>Top 25 · entering ${esc(weekLabel())}</h2><p class="muted small">The ranking shows as <b style="color:var(--gold)">#4</b> before the team name everywhere on the site: schedules, the betting board, odds, standings and bet slips. Each week's poll is saved, so past games keep that week's rankings. You can also update it from the Advance form each week.</p>
      ${pollEditor(wk)}<div class="row" style="margin-top:12px"><button data-act="savePoll">Save Top 25</button><button class="ghost" data-act="clearPoll">Clear all</button></div></div>`;
  },

  coaches() {
    const us = D.users.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return `<div class="card"><h2>Coach Accounts</h2><p class="muted small">Coaches create their own login on the hub (Coach Login → Create account). Link each account to a team here so they can bet and vote. Commissioners can use these tools; you can be a coach and the commissioner at the same time.</p>
      ${us.length ? `<div class="tablewrap"><table class="stack-sm"><tr><th>Coach name</th><th>Team</th><th>Role</th></tr>${us.map(u => `<tr data-user="${esc(u.id)}"><td data-l="Coach"><input data-k="name" value="${esc(u.name)}"></td>
        <td data-l="Team"><select data-k="teamId">${teamOpts(u.teamId, 'Not linked', t => t.conf === L().conference)}</select></td><td data-l="Role"><select data-k="role"><option value="coach" ${u.role !== 'commish' ? 'selected' : ''}>Coach</option><option value="commish" ${u.role === 'commish' ? 'selected' : ''}>Commissioner</option></select></td></tr>`).join('')}</table></div>
        <div style="margin-top:10px"><button data-act="saveUsers">Save accounts</button></div>` : '<p class="muted">No one has signed up yet.</p>'}</div>`;
  },

  betting() {
    const lg = L(), s = lg.season, wk = D.wagers.filter(w => w.season === s).sort((a, b) => b.week - a.week || (b.ts || 0) - (a.ts || 0));
    return `<div class="card"><h2>Sportsbook Controls</h2><p>Betting is <b>${lg.bettingOpen ? 'OPEN' : 'LOCKED'}</b> for ${esc(weekLabel())}.</p><div class="row"><button data-act="toggleBet">${lg.bettingOpen ? 'Lock betting' : 'Unlock betting'}</button>
      <button class="ghost" data-act="repost">Re-post lines for ${esc(weekLabel())}</button></div><p class="muted small">Re-posting recalculates lines for this week's unplayed games (use after adding games mid-week or fixing ratings). Existing wagers keep the line they were placed at.</p></div>
      <div class="card"><h3 style="margin-top:0">${s} wagers (${wk.length})</h3>${wk.length ? `<div class="tablewrap"><table><tr><th>Wk</th><th>Coach</th><th>Bet</th><th>Placed</th><th class="num">Stake</th><th class="num">Status</th><th></th></tr>
        ${wk.map(w => `<tr><td>${w.week}</td><td>${esc(w.coach)}</td><td style="white-space:normal">${esc(wagerLabel(w))}${legsHtml(w)}</td><td class="muted small">${fmtTime(w.ts)}</td><td class="num">${w.stake}</td><td class="num"><span class="pill ${w.status}">${w.status}${w.payout ? ' ' + (w.payout > 0 ? '+' : '') + w.payout : ''}</span></td><td>${w.status !== 'void' ? `<button class="sm danger" data-void="${esc(w.id)}">Void</button>` : ''}</td></tr>`).join('')}</table></div>` : '<p class="muted">No wagers yet.</p>'}</div>`;
  },

  awards() {
    const lg = L(), A = lg.awards || {}, s = lg.season, ballots = D.ballots.filter(b => b.season === s);
    const cats = A.categories?.length ? A.categories : DEFAULT_AWARDS.map(l => ({ key: slug(l), label: l, options: [{ name: '', team: '' }, { name: '', team: '' }, { name: '', team: '' }] }));
    const t = tally();
    return `<div class="card"><h2>Season Awards Voting</h2><p>Voting is <b>${A.open ? 'OPEN' : 'CLOSED'}</b>. ${ballots.length} ballot${ballots.length === 1 ? '' : 's'} in for ${s}.</p>
      <p class="muted small">Normally this opens with the End of Regular Season form and closes with the championship result. These buttons are manual overrides.</p>
      <div class="row"><button class="ghost" data-act="awardsToggle">${A.open ? 'Close voting now' : 'Open voting now'}</button></div></div>
      ${ballots.length ? `<div class="card"><h3 style="margin-top:0">Live tally (only you can see this)</h3><table>${t.results.map(r => `<tr><td>${esc(r.award)}</td><td><b>${esc(r.winner)}</b></td><td class="num">${r.votes}</td></tr>`).join('')}</table>
        <h3>Holy Shit moments</h3>${t.moments.map(m => `<p>“${esc(m.text)}” <span class="muted">— ${esc(m.coach)}</span></p>`).join('') || '<p class="muted">None yet.</p>'}</div>` : ''}
      <div class="card"><h3 style="margin-top:0">Ballot</h3><div id="cats">${catEditor(cats)}</div><div class="row"><button class="ghost sm" data-act="addCat">+ Add category</button><button data-act="saveCats">Save ballot</button></div></div>`;
  },



  settings() {
    const lg = L(), H = D.history.slice().sort((a, b) => b.season - a.season);
    return `<div class="card"><h2>League Settings</h2><label>League name</label><input id="stName" value="${esc(lg.name)}" style="width:100%">
      <label>Rules (one per line)</label><textarea id="stRules" rows="6">${esc((lg.rules && lg.rules.length ? lg.rules : DEFAULT_RULES).join('\n'))}</textarea>
      <label>Extra links on the Rules page (one per line: <code>Label | https://…</code>)</label><textarea id="stLinks" rows="3">${esc((lg.links || []).map(l => l.label + ' | ' + l.url).join('\n'))}</textarea>
      <div class="row" style="margin-top:10px"><button data-act="saveSettings">Save settings</button></div></div>
      <div class="card"><h2>YouTube Live Pop-up</h2>
        <p class="muted small">The site checks the OEC channel automatically about every 5 minutes and shows a "Live now" pop-up while you're streaming. Automatic status: <b id="autoLive">checking…</b></p>
        <p>Manual pop-up is <b>${lg.live?.on && lg.live?.since && Date.now() - lg.live.since < 6 * 3600e3 ? 'ON' : 'OFF'}</b>${lg.live?.on && lg.live?.since && Date.now() - lg.live.since < 6 * 3600e3 ? ` <span class="muted small">(turns itself off at ${new Date(lg.live.since + 6 * 3600e3).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})</span>` : ''}. Use this to show it instantly, or if the automatic check misses a stream. It turns itself off after 6 hours.</p>
        <label>Stream link (optional — defaults to the channel's live page)</label><input id="liveUrl" value="${esc(lg.live?.url || '')}" placeholder="https://youtube.com/live/…" style="width:100%">
        <label>Pop-up text (optional)</label><input id="liveTitle" value="${esc(lg.live?.title || '')}" placeholder="OEC is live on YouTube" style="width:100%">
        <div class="row" style="margin-top:10px"><button data-act="liveOn">${lg.live?.on ? 'Update pop-up' : 'Turn pop-up ON'}</button>${lg.live?.on ? '<button class="ghost" data-act="liveOff">Turn pop-up OFF</button>' : ''}</div></div>
      <div class="card"><h2>League History</h2><p class="muted small">Seasons are added automatically when you finalize a season. Use this to back-fill past seasons or fix one. Champion line shows as "Coach over Coach — Team 41, Team 27".</p>
        <div class="row"><input id="hSeason" type="number" placeholder="Season" style="width:90px"><select id="hCT">${teamOpts('', 'Champion team')}</select><input id="hCC" placeholder="Champ coach" style="width:120px"><input id="hCS" type="number" placeholder="Pts" style="width:70px"></div>
        <div class="row" style="margin-top:6px"><span style="width:90px"></span><select id="hRT">${teamOpts('', 'Runner-up team')}</select><input id="hRC" placeholder="Runner-up coach" style="width:120px"><input id="hRS" type="number" placeholder="Pts" style="width:70px"><button class="ghost" data-act="addHist">Add / replace season</button></div>
        ${H.map(h => `<details style="margin-top:10px"><summary><b>${h.season}</b> — ${esc(h.champCoach || '')} over ${esc(h.runnerCoach || '')}</summary><textarea data-hist="${esc(h.id)}" rows="10">${esc(JSON.stringify((({ id, ...r }) => r)(h), null, 2))}</textarea><div class="row"><button class="sm" data-savehist="${esc(h.id)}">Save</button><button class="sm danger" data-delhist="${esc(h.id)}">Delete season</button></div></details>`).join('')}
        <div style="margin-top:12px" class="row"><button class="ghost sm" data-act="importSeed">Load league-data.json (league history + current season)</button><button class="ghost sm" data-act="importLegacy">Import old history.json / awards.json</button></div></div>`;
  }
};

function teamRow(t) {
  const lg = L();
  return `<tr data-team="${esc(t.id)}"><td data-l="Team"><input data-k="name" value="${esc(t.name)}" style="width:150px"></td><td data-l="Abbr"><input data-k="abbr" value="${esc(t.abbr || '')}" style="width:70px"></td>
    <td data-l="Conf"><select data-k="conf"><option ${t.conf === lg.conference ? 'selected' : ''}>${esc(lg.conference)}</option><option value="Non-Conf" ${t.conf !== lg.conference ? 'selected' : ''}>Non-Conf</option></select></td>
    <td data-l="Div"><input data-k="div" value="${esc(t.div || '')}" style="width:70px"></td><td data-l="Coach"><input data-k="coach" value="${esc(t.coach || '')}" placeholder="CPU" style="width:110px"></td>
    <td data-l="Account"><select data-k="uid"><option value="">—</option>${D.users.map(u => `<option value="${esc(u.id)}" ${u.id === t.uid ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></td>
    <td data-l="Color"><input data-k="color" type="color" value="${esc(teamColor(t))}" style="width:46px;padding:2px"></td>
    ${['ovr', 'off', 'def'].map(k => `<td data-l="${k.toUpperCase()}"><input data-k="${k}" type="number" inputmode="numeric" min="40" max="99" value="${t[k] ?? ''}" style="width:62px"></td>`).join('')}
    <td data-l=""><button class="sm danger" data-delteam="${esc(t.id)}">✕ Remove</button></td></tr>`;
}
function catEditor(cats) {
  return cats.map((c, ci) => `<div class="card" data-cat="${ci}" style="background:#120e0f"><div class="row"><input data-ck="label" value="${esc(c.label)}" style="flex:1;font-weight:700"><button class="sm danger" data-delcat="${ci}">✕</button></div>
    ${c.options.map((o, i) => `<div class="row" style="margin-top:6px"><span class="muted">${i + 1}.</span><input data-on="${i}" value="${esc(o.name)}" placeholder="Player or team name" style="flex:1"><select data-ot="${i}">${teamOpts(o.team, 'Team (optional)')}</select></div>`).join('')}</div>`).join('');
}
function readCats() {
  return $$('[data-cat]').map(el => {
    const label = el.querySelector('[data-ck=label]').value.trim();
    return { key: slug(label), label, options: [0, 1, 2].map(i => ({ name: el.querySelector(`[data-on="${i}"]`).value.trim() || (el.querySelector(`[data-ot="${i}"]`).value ? team(el.querySelector(`[data-ot="${i}"]`).value).name : ''), team: el.querySelector(`[data-ot="${i}"]`).value })) };
  }).filter(c => c.label);
}
function tally() {
  const lg = L(), s = lg.season, cats = lg.awards?.categories || [], ballots = D.ballots.filter(b => b.season === s);
  const results = cats.map(c => {
    const n = c.options.map((_, i) => ballots.filter(b => b.picks && b.picks[c.key] === i).length), max = Math.max(0, ...n);
    const win = c.options.filter((_, i) => n[i] === max && max > 0);
    return { award: c.label, winner: win.length ? win.map(o => o.name).join(' / ') + (win.length > 1 ? ' (tie)' : '') : '—', team: win.length === 1 ? win[0].team : '', votes: max };
  });
  return { results, moments: ballots.filter(b => b.moment).map(b => ({ coach: b.coach, text: b.moment })) };
}

/* ---------- actions ---------- */
const ACT = {
  async toggleBet() { await put('meta', 'league', { bettingOpen: !L().bettingOpen }); flash('Betting ' + (L().bettingOpen ? 'opened' : 'locked') + '.'); },
  async saveScores() {
    const games = D.games.filter(g => g.season === L().season && g.week === L().week);
    const r = await saveScoresAndSettle(games); flash(`Saved ${r.saved} score${r.saved === 1 ? '' : 's'}; those games are locked and their wagers graded.`);
  },
  async savePoll() { const arr = readPoll(); await put('meta', 'league', { polls: { [pollKey(L().week)]: arr } }); flash(`Top 25 saved (${arr.length} ranked teams).`); },
  async clearPoll() { if (!confirm('Clear every ranking for this week?')) return; await put('meta', 'league', { polls: { [pollKey(L().week)]: [] } }); flash('Top 25 cleared for this week.'); },
  async wizSave() {
    collectScores(); const ops = draftScoreOps(); await batch(ops); await batch(settleOps(ops.map(o => o.id)));
    flash(`Saved ${ops.length} score${ops.length === 1 ? '' : 's'}. Those games are locked and their bets graded.`);
  },
  wizNext() {
    const dr = draft();
    if (ST.step === 1) { collectScores(); ST.desk = dr.desk.on ? 'yes' : ST.desk; }
    else if (ST.step === 2) { dr.poll = readPoll(); dr.desk = { on: ST.desk === 'yes', text: ($('#deskText')?.value || '').trim() }; }
    ST.step = Math.min(3, ST.step + 1); render(); window.scrollTo(0, 0);
  },
  wizBack() {
    const dr = draft();
    if (ST.step === 2) { try { dr.poll = readPoll(); } catch (e) { /* keep old */ } dr.desk = { on: ST.desk === 'yes', text: ($('#deskText')?.value || '').trim() }; }
    ST.step = Math.max(1, ST.step - 1); render(); window.scrollTo(0, 0);
  },
  async wizAddGame() {
    const dr = draft(); try { dr.poll = readPoll(); } catch (e) { /* ignore */ } dr.desk = { on: ST.desk === 'yes', text: ($('#deskText')?.value || '').trim() };
    const h = $('#wH').value, a = $('#wA').value; if (!h || !a || h === a) return alert('Pick two different teams.');
    const g = { season: L().season, week: L().week + 1, type: 'reg', home: h, away: a, neutral: false, homeScore: null, awayScore: null };
    await put('games', newId(), g, false); render();
  },
  async wizConfirm() {
    const lg = L(), W = lg.week, last = W >= lg.finalWeek, dr = draft();
    const ops = draftScoreOps(); await batch(ops); await batch(settleOps(ops.map(o => o.id)));
    const desk = dr.desk.on && dr.desk.text ? { show: true, text: dr.desk.text } : { show: false, text: '' };
    if (dr.poll && pollChanged(dr.poll, W)) await put('meta', 'league', { polls: { [pollKey(W + 1)]: dr.poll } });
    if (last) {
      await put('meta', 'league', { week: W + 1, phase: PHASES.CCG, bettingOpen: false, desk, futures: { ...(lg.futures || {}), open: false }, winTotals: { season: 0, odds: {} }, awards: { open: false, season: lg.season, categories: lg.awards?.season === lg.season ? (lg.awards.categories || []) : [] } });
      await batch(settleOps([]));
    } else {
      await put('meta', 'league', { week: W + 1, bettingOpen: true, desk });
      await batch(lineOps(W + 1));
    }
    const settled = D.wagers.filter(w => w.settledAt && Date.now() - w.settledAt < 60000).length;
    ST.draft = null; ST.step = 1; ST.desk = 'no';
    ST.done = `<div class="card banner"><h2>✅ ${last ? 'Regular season complete' : `Week ${W + 1} is live`}</h2><ul class="clean">
      <li>${ops.length} result${ops.length === 1 ? '' : 's'} saved; ${settled} bet${settled === 1 ? '' : 's'} graded and paid.</li>
      ${last ? '<li>Win totals settled and League Champion futures closed.</li>' : `<li>Lines posted for every upcoming game; betting is open for Week ${W + 1}.</li><li>Standings, odds, power rankings and storylines are updated.</li>`}
      ${dr.poll && pollChanged(dr.poll, W) ? `<li>Top 25 updated (${dr.poll.length} ranked teams).</li>` : '<li>Top 25 carried over.</li>'}
      <li>${desk.show ? "Commissioner's Desk note posted." : "Commissioner's Desk cleared."}</li></ul>
      <div class="row" style="margin-top:10px"><a class="btn" style="padding:8px 14px;border-radius:8px" href="index.html" target="_blank">View the site</a><button class="gold" data-act="wizDone">${last ? 'Set up the championship →' : `Start Week ${W + 1} →`}</button></div></div>`;
    render(); window.scrollTo(0, 0);
  },
  wizDone() { ST.done = null; ST.step = 1; render(); },
  async advanceWeek() {
    const lg = L(), W = lg.week, games = D.games.filter(g => g.season === lg.season && g.week === W);
    const poll = $$('[data-poll]').length ? readPoll() : null;
    const { missing } = readScores(games);
    if (missing.length && !confirm(`${missing.length} game(s) have no score. Advance anyway? Wagers on them stay open.`)) return;
    await saveScoresAndSettle(games);
    const desk = deskValue();
    if (W >= lg.finalWeek) {
      if (poll && pollChanged(poll, W)) await put('meta', 'league', { polls: { [pollKey(W + 1)]: poll } });
      await put('meta', 'league', { week: W + 1, phase: PHASES.CCG, bettingOpen: false, desk, futures: { ...(lg.futures || {}), open: false }, winTotals: { season: 0, odds: {} }, awards: { open: false, season: lg.season, categories: lg.awards?.season === lg.season ? (lg.awards.categories || []) : [] } });
      await batch(settleOps([]));
      ST.desk = 'no'; flash('Regular season complete. Win-total bets are settled. Set up the championship game and awards ballot below.');
    } else {
      if (poll && pollChanged(poll, W)) await put('meta', 'league', { polls: { [pollKey(W + 1)]: poll } });
      await put('meta', 'league', { week: W + 1, bettingOpen: true, desk });
      await batch(lineOps(W + 1));
      ST.desk = 'no'; flash(`Advanced to Week ${W + 1}. Lines posted, betting open, odds and power rankings updated.`);
    }
  },
  async openCcg() {
    const lg = L(), h = $('#ccgH').value, a = $('#ccgA').value, wk = +$('#ccgW').value;
    if (!h || !a || h === a) return alert('Pick two different teams for the championship game.');
    const cats = readCats(); if (cats.some(c => c.options.some(o => !o.name))) return alert('Every award needs three finalists.');
    const id = `g${lg.season}_ccg`;
    await put('games', id, { season: lg.season, week: wk, type: 'ccg', home: h, away: a, neutral: $('#ccgN').checked, homeScore: null, awayScore: null }, false);
    await batch(lineOps(wk));
    await put('meta', 'league', { week: wk, bettingOpen: true, desk: deskValue(), awards: { open: true, season: lg.season, categories: cats, results: [] } });
    ST.desk = 'no'; flash('Championship week is live: game posted with lines, betting open, awards voting open.');
  },
  async finishCcg() {
    const lg = L(), ccg = D.games.find(g => g.season === lg.season && g.type === 'ccg');
    const games = D.games.filter(g => g.season === lg.season && g.week === ccg.week);
    const { missing } = readScores(games);
    if (missing.find(g => g.id === ccg.id)) return alert('Enter the championship score first.');
    await saveScoresAndSettle(games);
    const fin = D.games.find(g => g.id === ccg.id);
    await batch(settleFuturesOps(lg.season, +fin.homeScore > +fin.awayScore ? fin.home : fin.away));
    await loadBallots(true);
    const t = tally();
    await put('meta', 'league', { phase: PHASES.POST, bettingOpen: false, desk: deskValue(), awards: { ...lg.awards, open: false, results: t.results, moments: t.moments } });
    ST.desk = 'no'; flash('Champion crowned and awards voting closed. Finalize the season when you\'re ready.');
  },
  async addBowl() {
    const h = $('#pH').value, a = $('#pA').value; if (!h || !a || h === a) return alert('Pick two teams.');
    await put('games', newId(), { season: L().season, week: +$('#pW').value, type: 'bowl', home: h, away: a, neutral: true, note: $('#pNote').value, homeScore: null, awayScore: null }, false);
    render();
  },
  async finalize() {
    const lg = L(), s = lg.season;
    const post = D.games.filter(g => g.season === s && g.type === 'bowl');
    await saveScoresAndSettle(post);
    const ccg = D.games.find(g => g.season === s && g.type === 'ccg' && played(g));
    const H = { season: s, notes: $('#sNotes').value.trim(), awards: (lg.awards?.results || []).filter(r => r.votes > 0), moments: lg.awards?.moments || [] };
    if (ccg) {
      const hw = +ccg.homeScore > +ccg.awayScore, w = hw ? 'home' : 'away', l = hw ? 'away' : 'home';
      Object.assign(H, { champTeam: ccg[w], champCoach: ccg[w + 'Coach'] || team(ccg[w]).coach || 'CPU', champScore: +ccg[w + 'Score'], runnerTeam: ccg[l], runnerCoach: ccg[l + 'Coach'] || team(ccg[l]).coach || 'CPU', runnerScore: +ccg[l + 'Score'] });
    }
    if (!confirm(`Finalize ${s}? This writes ${s} to History and moves the league to the offseason.`)) return;
    await put('history', String(s), H, false);
    await batch(settleFuturesOps(s, ccg ? H.champTeam : null));
    await batch(parlayOps());
    await put('meta', 'league', { phase: PHASES.PRE, bettingOpen: false, desk: deskValue() });
    ST.desk = 'no'; ST.tab = 'preseason'; flash(`${s} is in the books. Set up next season below.`);
  },
  addTeam() {
    const name = prompt('Team name (e.g. Kennesaw State)'); if (!name) return;
    let id = slug(name); if (D.teams.find(t => t.id === id)) return alert('That team already exists.');
    D.teams.push({ id, name, abbr: name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase(), conf: L().conference, div: '', coach: '', uid: '', color: lookupColor(name) || '#777777', ovr: 75, off: 75, def: 75, _new: true });
    render();
  },

  async saveTeams() {
    const ops = [], userOps = {}, conf = $('#psConf').value.trim() || L().conference;
    for (const tr of $$('[data-team]')) {
      const id = tr.dataset.team, v = k => tr.querySelector(`[data-k="${k}"]`).value;
      const uid = v('uid'), u = D.users.find(x => x.id === uid);
      const data = { name: v('name').trim(), abbr: v('abbr').trim().toUpperCase(), conf: v('conf') === 'Non-Conf' ? 'Non-Conf' : conf, div: v('div').trim(), coach: v('coach').trim() || (u ? u.name : ''), uid, color: v('color'), ovr: +v('ovr') || null, off: +v('off') || null, def: +v('def') || null };
      if (!data.name) return alert('Every team needs a name.');
      ops.push({ op: 'set', col: 'teams', id, data, merge: false });
      if (uid) userOps[uid] = id;
    }
    D.users.forEach(u => { const want = userOps[u.id] || ''; if ((u.teamId || '') !== want) ops.push({ op: 'set', col: 'users', id: u.id, data: { teamId: want } }); });
    await batch(ops);
    if (conf !== L().conference) await put('meta', 'league', { conference: conf });
    D.teams.forEach(t => delete t._new); await loadAll(); refreshProfile(); flash('Teams saved.');
  },
  async addSched() {
    const s = +$('#psSeason').value, a = $('#sgA').value, h = $('#sgH').value;
    if (!a || !h || a === h) return alert('Pick two different teams.');
    await put('games', newId(), { season: s, week: +$('#sgW').value, type: 'reg', home: h, away: a, neutral: $('#sgN').checked, homeScore: null, awayScore: null }, false);
    render();
  },
  async bulkSched() {
    const s = +$('#psSeason').value, ops = [], bad = [];
    $('#bulk').value.split('\n').map(x => x.trim()).filter(Boolean).forEach(line => {
      const p = line.split(',').map(x => x.trim()), a = findTeam(p[1]), h = findTeam(p[2]);
      if (p.length < 3 || isNaN(+p[0]) || !a || !h || a === h) { bad.push(line); return; }
      ops.push({ op: 'set', col: 'games', id: newId() + ops.length, data: { season: s, week: +p[0], type: 'reg', home: h.id, away: a.id, neutral: /neutral/i.test(p[3] || ''), homeScore: null, awayScore: null }, merge: false });
    });
    await batch(ops);
    ST.msg = `Added ${ops.length} game(s).` + (bad.length ? ` Couldn't read: ${bad.join(' | ')} (save new teams first, and check spelling).` : ''); render();
  },
  async publish() {
    const s = +$('#psSeason').value, fw = +$('#psFinal').value, sg = D.games.filter(g => g.season === s);
    if (!sg.length) return alert(`Add the ${s} schedule first.`);
    if (L().phase !== PHASES.PRE && s !== L().season && !confirm(`The ${L().season} season hasn't been finalized. Publish ${s} anyway?`)) return;
    if (!confirm(`Publish the ${s} season? This posts preseason odds and opens betting.`)) return;
    const first = Math.min(...sg.map(g => g.week));
    await put('meta', 'league', { season: s, finalWeek: fw, week: first, phase: PHASES.REG, bettingOpen: true, desk: deskValue(), awards: { open: false, season: s, categories: [], results: [] } });
    await batch(lineOps(first, s));
    ST.desk = 'no'; ST.tab = 'advance'; flash(`${s} season published. Week ${first} lines are posted and preseason odds are live.`);
  },
  async saveGames() {
    const wk = ST.gamesWeek ?? L().week, games = D.games.filter(g => g.season === L().season && g.week === wk);
    const { ops } = readScores(games); await batch(ops);
    const ids = new Set(ops.map(o => o.id)), reg = [];
    D.wagers.filter(w => ids.has(w.gameId) && w.status !== 'void' && w.market !== 'parlay').forEach(w => {
      const g = D.games.find(x => x.id === w.gameId), st = g.forfeit ? 'void' : grade(w, g);
      reg.push({ op: 'set', col: 'wagers', id: w.id, data: { status: st, payout: st === 'won' ? profit(w.stake, w.odds) : st === 'lost' ? -w.stake : 0, ...(st !== w.status ? { settledAt: Date.now() } : {}) } });
    });
    reg.push(...parlayOps(true));
    await batch(reg); flash(`Saved ${ops.length} score(s); ${reg.length} wager(s) graded.`);
  },
  async addGame() {
    const wk = ST.gamesWeek ?? L().week, h = $('#gH').value, a = $('#gA').value;
    if (!h || !a || h === a) return alert('Pick two different teams.');
    const g = { season: L().season, week: wk, type: $('#gT').value, home: h, away: a, neutral: $('#gN').checked, homeScore: null, awayScore: null }, id = newId();
    await put('games', id, g, false);
    if (wk === L().week) await put('games', id, { lines: freshLine({ ...g, id }) });
    render();
  },
  async saveUsers() {
    const ops = [];
    $$('[data-user]').forEach(tr => {
      const id = tr.dataset.user, v = k => tr.querySelector(`[data-k="${k}"]`).value, u = D.users.find(x => x.id === id);
      const data = { name: v('name').trim(), teamId: v('teamId'), role: v('role') };
      if (id === auth.user.uid && data.role !== 'commish' && !confirm('Remove your own commissioner access?')) data.role = 'commish';
      ops.push({ op: 'set', col: 'users', id, data });
      if (u.teamId && u.teamId !== data.teamId && team(u.teamId).uid === id) ops.push({ op: 'set', col: 'teams', id: u.teamId, data: { uid: '' } });
      if (data.teamId) ops.push({ op: 'set', col: 'teams', id: data.teamId, data: { uid: id, coach: data.name } });
    });
    await batch(ops); refreshProfile(); flash('Accounts saved.');
  },
  async repost() { await batch(lineOps(L().week)); flash('Lines re-posted.'); },
  async awardsToggle() { const A = L().awards || {}; await put('meta', 'league', { awards: { ...A, open: !A.open, season: L().season } }); flash('Voting ' + (L().awards.open ? 'opened' : 'closed') + '.'); },
  addCat() { const cats = readCats(); cats.push({ key: 'new', label: 'New Award', options: [{ name: '', team: '' }, { name: '', team: '' }, { name: '', team: '' }] }); $('#cats').innerHTML = catEditor(cats); },
  async saveCats() { const cats = readCats(); await put('meta', 'league', { awards: { ...(L().awards || {}), season: L().season, categories: cats } }); flash('Ballot saved.'); },

  async liveOn() { try { localStorage.removeItem('oecLiveDismissed'); } catch (e) { /* ignore */ } await put('meta', 'league', { live: { on: true, url: $('#liveUrl').value.trim(), title: $('#liveTitle').value.trim(), since: Date.now() } }); flash('Live pop-up is ON for everyone on the site.'); },
  async liveOff() { await put('meta', 'league', { live: { on: false, url: '', title: '', since: 0 } }); flash('Live pop-up is OFF. (It still appears automatically if the channel is detected live.)'); },
  async saveSettings() {
    await put('meta', 'league', {
      name: $('#stName').value.trim(), rules: $('#stRules').value.split('\n').map(s => s.trim()).filter(Boolean),
      links: $('#stLinks').value.split('\n').map(s => s.split('|').map(x => x.trim())).filter(p => p[0] && p[1]).map(([label, url]) => ({ label, url }))
    }); flash('Settings saved.');
  },
  async addHist() {
    const s = +$('#hSeason').value; if (!s) return alert('Enter a season.');
    const old = D.history.find(h => h.id === String(s)) || {};
    await put('history', String(s), { ...old, season: s, champTeam: $('#hCT').value, champCoach: $('#hCC').value.trim(), champScore: +$('#hCS').value, runnerTeam: $('#hRT').value, runnerCoach: $('#hRC').value.trim(), runnerScore: +$('#hRS').value, awards: old.awards || [], moments: old.moments || [] }, false);
    flash(`Saved ${s}.`);
  },
  async saveRatings() {
    const ops = $$('[data-rate]').map(r => { const v = k => +r.querySelector(`[data-k="${k}"]`).value || null; return { op: 'set', col: 'teams', id: r.dataset.rate, data: { ovr: v('ovr'), off: v('off'), def: v('def') } }; });
    if (ops.some(o => [o.data.ovr, o.data.off, o.data.def].some(x => x != null && (x < 40 || x > 99)))) return alert('Ratings should be between 40 and 99.');
    await batch(ops);
    if (L().phase !== PHASES.PRE) await batch(lineOps(L().week));
    flash(`Saved ratings for ${ops.length} teams.${L().phase !== PHASES.PRE ? ' This week\'s lines were re-posted.' : ''}`);
  },
  async seedRatings() {
    const r = await fetch('league-data.json?v=' + Date.now()); if (!r.ok) return alert('league-data.json not found on the site.');
    const d = await r.json(), ops = d.teams.filter(t => t.ovr && D.teams.find(x => x.id === t.id)).map(t => ({ op: 'set', col: 'teams', id: t.id, data: { ovr: t.ovr, off: t.off, def: t.def } }));
    await batch(ops); ST.clear = true; await loadAll(); await batch(lineOps(L().week)); flash(`Updated OVR/OFF/DEF for ${ops.length} teams. Week ${L().week} lines were re-posted from the new ratings.`);
  },
  async importSeed() {
    if (D.games.length && !confirm('This overwrites teams, games, history and league settings with league-data.json. Wagers, votes and accounts are kept. Continue?')) return;
    const r = await fetch('league-data.json?v=' + Date.now()); if (!r.ok) return alert('league-data.json not found on the site. Upload it to GitHub first.');
    const d = await r.json();
    const ops = [...d.teams.map(t => ({ op: 'set', col: 'teams', id: t.id, data: t, merge: false })), ...d.games.map(g => ({ op: 'set', col: 'games', id: g.id, data: g, merge: false })), ...d.history.map(h => ({ op: 'set', col: 'history', id: h.id, data: h, merge: false }))];
    await batch(ops);
    await put('meta', 'league', d.league);
    await batch(lineOps(d.league.week, d.league.season));
    flash(`Loaded ${d.teams.length} teams, ${d.games.length} games and ${d.history.length} past seasons. Week ${d.league.week} lines are posted. Next: link coach accounts and set team ratings on the Preseason tab.`);
  },
  async importLegacy() {
    const get = async f => { try { const r = await fetch(f + '?v=' + Date.now()); return r.ok ? await r.json() : []; } catch (e) { return []; } };
    const [hist, aw] = await Promise.all([get('history.json'), get('awards.json')]);
    if (!hist.length && !aw.length) return alert('No history.json or awards.json found on the site.');
    const by = {};
    hist.forEach(h => by[h.season] = { season: +h.season, champTeam: h.champion || '', champCoach: team(h.champion).coach || '', runnerTeam: h.runnerUp || '', runnerCoach: team(h.runnerUp).coach || '', awards: h.heisman ? [{ award: 'Heisman', winner: h.heisman, team: '' }] : [], moments: [] });
    aw.forEach(a => { const h = by[a.season] || (by[a.season] = { season: +a.season, awards: [], moments: [] }); if (!h.awards.find(x => x.award === a.award)) h.awards.push({ award: a.award, winner: a.winner, team: a.team || '' }); });
    await batch(Object.values(by).map(h => ({ op: 'set', col: 'history', id: String(h.season), data: h }))); flash(`Imported ${Object.keys(by).length} season(s). Check scores and coach names below.`);
  }
};

/* ---------- shell ---------- */
// Keep unsaved form edits when the panel re-renders.
function syncTeams() {
  $$('[data-team]').forEach(tr => {
    const t = D.teams.find(x => x.id === tr.dataset.team); if (!t) return;
    const v = k => tr.querySelector(`[data-k="${k}"]`).value;
    Object.assign(t, { name: v('name'), abbr: v('abbr'), conf: v('conf') === 'Non-Conf' ? 'Non-Conf' : L().conference, div: v('div'), coach: v('coach'), uid: v('uid'), color: v('color'), ovr: +v('ovr') || null, off: +v('off') || null, def: +v('def') || null });
  });
}
const KEEP = ['deskText', 'psSeason', 'psFinal', 'psConf', 'sNotes'];
function render() {
  syncTeams();
  const kept = {}; KEEP.forEach(id => { const el = document.getElementById(id); if (el) kept[id] = el.value; });
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<a href="#" data-tab="${k}" class="${k === ST.tab ? 'on' : ''}">${l}</a>`).join('');
  $('#sub').textContent = `${L().season} · ${weekLabel()} · ${L().phase}${DEMO ? ' · DEMO (changes are not saved)' : ''}`;
  $('#panel').innerHTML = (ST.msg ? `<div class="notice">${esc(ST.msg)}</div>` : '') + views[ST.tab]();
  if (!ST.clear) KEEP.forEach(id => { const el = document.getElementById(id); if (el && kept[id] != null) el.value = kept[id]; });
  ST.msg = ''; ST.clear = false;
  if ($('#autoLive')) fetch('live.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : { live: false }).then(j => { const el = $('#autoLive'); if (!el) return; const fresh = j.live && j.checkedAt && Date.now() - j.checkedAt < 25 * 60e3; el.textContent = fresh ? 'LIVE — ' + (j.title || '') + ' (checked ' + Math.round((Date.now() - j.checkedAt) / 60e3) + ' min ago)' : j.live ? 'stale "live" status ignored — the checker hasn\'t confirmed it recently' : 'not live'; }).catch(() => { const el = $('#autoLive'); if (el) el.textContent = 'not set up yet'; });
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab],[data-act],[data-desk],[data-delgame],[data-delteam],[data-void],[data-delcat],[data-savehist],[data-delhist]');
  if (!t) return;
  e.preventDefault();
  try {
    if (t.dataset.tab) { ST.tab = t.dataset.tab; ST.msg = ''; render(); if (t.dataset.tab === 'awards') { try { await loadBallots(true); } catch (err) { console.error(err); ST.msg = 'Could not load ballots from Firebase (' + err.message + '). Make sure the latest Firestore rules are published.'; } render(); } }
    else if (t.dataset.desk) { ST.desk = t.dataset.desk; const keep = $('#deskText')?.value; $$('[data-desk]').forEach(b => b.classList.toggle('on', b.dataset.desk === ST.desk)); $('#deskText').parentElement.hidden = ST.desk !== 'yes'; if (keep) $('#deskText').value = keep; }
    else if (t.dataset.act) { t.disabled = true; await ACT[t.dataset.act](); }
    else if (t.dataset.delgame) { if (confirm('Delete this game? Open wagers on it will be voided.')) { await batch([{ op: 'del', col: 'games', id: t.dataset.delgame }, ...D.wagers.filter(w => w.gameId === t.dataset.delgame && w.status === 'open').map(w => ({ op: 'set', col: 'wagers', id: w.id, data: { status: 'void', payout: 0, settledAt: Date.now() } }))]); await batch(parlayOps()); render(); } }
    else if (t.dataset.delteam) { const id = t.dataset.delteam; if (D.games.some(g => g.home === id || g.away === id)) return alert('This team has games scheduled. Delete those first.'); if (confirm('Delete ' + team(id).name + '?')) { if (D.teams.find(x => x.id === id)?._new) D.teams = D.teams.filter(x => x.id !== id); else await batch([{ op: 'del', col: 'teams', id }]); render(); } }
    else if (t.dataset.void) { if (confirm('Void this wager and refund the stake?')) { await put('wagers', t.dataset.void, { status: 'void', payout: 0, settledAt: Date.now() }); render(); } }
    else if (t.dataset.delcat) { const c = readCats(); c.splice(+t.dataset.delcat, 1); $('#cats').innerHTML = catEditor(c); }
    else if (t.dataset.savehist) { const v = JSON.parse($(`[data-hist="${t.dataset.savehist}"]`).value); await put('history', t.dataset.savehist, v, false); flash('History saved.'); }
    else if (t.dataset.delhist) { if (confirm('Delete this season from History?')) { await batch([{ op: 'del', col: 'history', id: t.dataset.delhist }]); render(); } }
  } catch (err) { console.error(err); alert('Error: ' + err.message); render(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'gwSel') { ST.gamesWeek = +e.target.value; render(); }
  if (e.target.id === 'gwNew' && e.target.value !== '') { ST.gamesWeek = +e.target.value; render(); }
  if (e.target.dataset.k === 'name' && e.target.closest('[data-team]')) { const c = lookupColor(e.target.value), ci = e.target.closest('tr').querySelector('[data-k=color]'); if (c && (ci.value === '#777777' || ci.value === '#6b6b6b')) ci.value = c; }
});

(async function init() {
  try {
    await loadAll();
    await watchAuth(async () => {
      if (!auth.user) { $('#panel').innerHTML = `<div class="card"><h2>Commissioner Login</h2><p>Log in on the hub with your commissioner account first.</p><a class="btn" style="padding:8px 14px;border-radius:8px" href="index.html#account">Go to login</a></div>`; $('#tabs').innerHTML = ''; return; }
      if (!isCommish()) { $('#panel').innerHTML = `<div class="card"><h2>Commissioner only</h2><p class="muted">Your account doesn't have commissioner access.</p></div>`; $('#tabs').innerHTML = ''; return; }
      if (L().awards?.open) await loadBallots(true);
      try { if (await ensureFutures()) ST.msg = 'Posted lines for upcoming games and League Champion futures odds.'; } catch (e) { ST.msg = 'Could not post futures odds: ' + e.message + ' — check the Firestore rules are the latest version.'; }
      render();
    });
  } catch (e) {
    console.error(e);
    $('#panel').innerHTML = `<div class="card"><b>Couldn't load data.</b><p class="muted">${esc(e.message)}</p></div>`;
  }
})();
