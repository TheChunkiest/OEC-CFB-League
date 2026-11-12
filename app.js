/* OEC CFB League Hub — Complete Dynasty Engine, Sportsbook, Voting & Commissioner Suite */
const FILES = ['league', 'coaches', 'seasons', 'games', 'news'];
const D = {};
const CHAMP_WEEK = 14;
const REG_FINAL_WEEK = 13;

const BASE_NAV = [
  ['home', 'Home'],
  ['standings', 'Standings'],
  ['schedule', 'Schedule'],
  ['odds', 'Odds & Wagers'],
  ['rankings', 'Power Rankings'],
  ['coaches', 'Coaches'],
  ['awards', 'Season Awards'],
  ['history', 'History']
];

const AWARDS = [
  ['mvp', 'League MVP'],
  ['opoy', 'Offensive Player of the Year (OPOY)'],
  ['dpoy', 'Defensive Player of the Year (DPOY)'],
  ['bestOff', 'Best Offense (Team)'],
  ['bestDef', 'Best Defense (Team)']
];

/* UI & Session State */
const UI = {
  user: 'chunky', // Default logged-in as Chunky (Commissioner + Coach) so full capabilities are immediately accessible
  standingsMode: 'divisions', // 'divisions' or 'overall'
  standingsSortCol: 'place',
  standingsSortDir: 'asc',
  rankingsSortBy: 'rank', // 'rank', 'move', 'hot'
  oddsMode: 'live', // 'live' or 'preseason'
  chartFilter: 'top6', // 'top6', 'all', 'Catholics', 'Convicts'
  historySortCol: 'pct',
  historySortDir: 'desc',
  commishMode: 'weekly', // 'weekly', 'champweek', 'endseason', 'preseason'
  commishDeskNeed: 'yes',
  betSlip: null // { gameKey, season, week, away, home, market, pick, line, odds, pickLabel, stake }
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showToast(msg) {
  const box = $('#toastContainer');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.remove(); }, 3400);
}

function openModal(html) {
  const m = $('#appModal');
  const b = $('#appModalBody');
  if (!m || !b) return;
  b.innerHTML = html;
  m.classList.add('open');
}

function closeModal() {
  const m = $('#appModal');
  if (m) m.classList.remove('open');
}

/* Storage & Persistence Helpers */
function saveLocalState() {
  try {
    localStorage.setItem('oec_hub_user_v3', UI.user || '');
    localStorage.setItem('oec_hub_db_v3', JSON.stringify({
      league: D.league,
      coaches: D.coaches,
      seasons: D.seasons,
      games: D.games
    }));
  } catch (err) {
    /* ignore storage quota errors in sandboxed iframes */
  }
}

function loadLocalState() {
  try {
    const u = localStorage.getItem('oec_hub_user_v3');
    if (u !== null) UI.user = u;
  } catch (err) {
    /* ignore */
  }
}

/* Core Data Helpers */
const coachObj = id => (D.coaches || []).find(c => c.id === id);
const isCoach = id => !!coachObj(id);
const currentUserObj = () => coachObj(UI.user);
const isCommissioner = () => {
  const u = currentUserObj();
  return !!(u && (u.id === 'chunky' || u.role === 'commissioner' || u.isCommissioner));
};
const nameOf = id => coachObj(id)?.name || String(id).replace(/^cpu:/i, '');
const season = n => (D.seasons || []).find(s => s.season === n);
const teamOf = (id, s) => isCoach(id) ? (season(s)?.teams?.[id] || '') : '';
const overallsOf = (id, s) => {
  const S = season(s);
  const ov = S?.teamOveralls?.[id];
  if (ov) return ov;
  return { team: teamOf(id, s), ovr: 76, off: 76, def: 76 };
};
const WK = w => w === CHAMP_WEEK ? 'MAC Championship' : 'Week ' + w;
const played = g => !!g.forfeit || (g.homeScore != null && g.awayScore != null && g.homeScore !== g.awayScore);
const winnerOf = g => g.forfeit ? g.forfeit : (played(g) ? (g.homeScore > g.awayScore ? g.home : g.away) : null);
const loserOf = g => { const w = winnerOf(g); return w ? (w === g.home ? g.away : g.home) : null; };
const bySW = (a, b) => a.season - b.season || a.week - b.week;
const userGame = g => isCoach(g.home) && isCoach(g.away);

/* Team Primary Color Badge Renderer (Replaces Muted Gray Team Text) */
function teamMeta(teamName) {
  const map = D.league?.teamColors || {};
  return map[teamName] || {
    primary: '#dc2626',
    secondary: '#f59e0b',
    badgeBg: 'rgba(220, 38, 38, 0.16)',
    text: '#fca5a5',
    abbr: (teamName || 'MAC').slice(0, 4).toUpperCase()
  };
}

function teamPill(teamName, showOvr, ovrObj) {
  if (!teamName) return '';
  const m = teamMeta(teamName);
  const ovrTxt = (showOvr && ovrObj) ? ` <span style="opacity:0.85;font-size:10px">(${ovrObj.ovr} OVR)</span>` : '';
  return `<span class="team-badge" style="--tc-border:${esc(m.primary)};--tc-bg:${esc(m.badgeBg)};--tc-text:${esc(m.text)};--tc-dot:${esc(m.primary)}"><span class="team-dot"></span>${esc(teamName)}${ovrTxt}</span>`;
}

function chip(id, s, showOvr = false) {
  if (!isCoach(id)) return `<span class="chip">${esc(nameOf(id))}</span><span class="cpu">CPU</span>`;
  const sn = s || D.league.season;
  const t = teamOf(id, sn);
  const m = teamMeta(t);
  const ov = overallsOf(id, sn);
  return `<span class="coach-team-wrap"><a class="chip" style="--c:${esc(m.primary)}" href="#coach/${esc(id)}">${esc(nameOf(id))}</a>${t ? teamPill(t, showOvr, ov) : ''}</span>`;
}

/* Standings & Record Tally */
function tally(games, maxWeek = 99) {
  const r = {};
  const get = id => r[id] || (r[id] = { id, w: 0, l: 0, uw: 0, ul: 0, pf: 0, pa: 0, last: [], gamesPlayed: 0 });
  games.filter(g => g.week <= maxWeek).slice().sort(bySW).forEach(g => {
    const w = winnerOf(g);
    if (!w) return;
    const l = loserOf(g), ug = userGame(g);
    get(w).w++; get(l).l++;
    get(w).gamesPlayed++; get(l).gamesPlayed++;
    get(w).last.push('W'); get(l).last.push('L');
    if (ug) { get(w).uw++; get(l).ul++; }
    if (!g.forfeit) {
      get(g.home).pf += g.homeScore; get(g.home).pa += g.awayScore;
      get(g.away).pf += g.awayScore; get(g.away).pa += g.homeScore;
    }
  });
  return r;
}

const streak = r => {
  if (!r || !r.last.length) return '–';
  const c = r.last.at(-1);
  let n = 0;
  for (let i = r.last.length - 1; i >= 0 && r.last[i] === c; i--) n++;
  return c + n;
};
const streakVal = r => {
  if (!r || !r.last.length) return 0;
  const c = r.last.at(-1);
  let n = 0;
  for (let i = r.last.length - 1; i >= 0 && r.last[i] === c; i--) n++;
  return c === 'W' ? n : -n;
};
const pct = r => r && (r.w + r.l) ? r.w / (r.w + r.l) : 0;
const pctStr = r => (r && (r.w + r.l) ? pct(r).toFixed(3).replace(/^0/, '') : '.000');
const champGame = s => D.games.find(g => g.season === s && g.week === CHAMP_WEEK && winnerOf(g));
const champOf = s => {
  const g = champGame(s);
  if (!g) return null;
  const winCoach = winnerOf(g);
  const loseCoach = loserOf(g);
  const winScore = g.forfeit ? 'FF' : Math.max(g.homeScore, g.awayScore);
  const loseScore = g.forfeit ? '0' : Math.min(g.homeScore, g.awayScore);
  return {
    champ: winCoach,
    runner: loseCoach,
    winTeam: teamOf(winCoach, s),
    loseTeam: teamOf(loseCoach, s),
    winScore,
    loseScore,
    game: g
  };
};

/* Required Championship Line Format: "Clay over Skippa — Kennesaw State 41, Liberty 27" */
function formatChampLine(s) {
  const c = champOf(s);
  if (!c) return null;
  if (c.game.forfeit) {
    return `${nameOf(c.champ)} over ${nameOf(c.runner)} — ${c.winTeam} wins by Forfeit over ${c.loseTeam}`;
  }
  return `${nameOf(c.champ)} over ${nameOf(c.runner)} — ${c.winTeam} ${c.winScore}, ${c.loseTeam} ${c.loseScore}`;
}

/* ---------- Dynamic Odds, Preseason Model & Weekly Trajectory Engine ---------- */
const MODEL = { k: 0.22, cap: 35, regress: 0.22, hfa: 1.5, sigma: 18.5, vig: 0.045, avgPts: 28.5, prior: 3.5, sims: 2500 };
let _modelCache = null;

function invalidateModel() { _modelCache = null; }

/* Compute ratings through a specific (season, maxWeek). If maxWeek < 0, computes Preseason Baseline! */
function buildModelAt(targetSeason, maxWeek = 99) {
  const R = {};
  const P = {};
  const seasonsList = [...new Set(D.seasons.map(s => s.season))].sort((a, b) => a - b).filter(s => s <= targetSeason);

  seasonsList.forEach((s, si) => {
    const S = season(s);
    if (si > 0) Object.keys(R).forEach(c => { R[c] *= (1 - MODEL.regress); });
    /* Blend in preseason team overall priors (OVR, OFF, DEF) for this season */
    if (S && S.teams) {
      Object.keys(S.teams).forEach(cid => {
        const ov = overallsOf(cid, s);
        const teamBoost = ((ov.ovr - 76) * 0.65) + ((ov.off - 76) * 0.25) + ((ov.def - 76) * 0.2);
        R[cid] = (R[cid] ?? 0) * 0.75 + teamBoost;
        const p = P[cid] ??= { w: 0, pf: 0, pa: 0 };
        p.w += 1.5;
        p.pf += 1.5 * (MODEL.avgPts + (ov.off - 76) * 0.55);
        p.pa += 1.5 * (MODEL.avgPts - (ov.def - 76) * 0.55);
      });
    }
    const wkLimit = (s === targetSeason) ? maxWeek : 99;
    if (wkLimit >= 0) {
      const weeks = [...new Set(D.games.filter(g => g.season === s && g.week <= wkLimit).map(g => g.week))].sort((a, b) => a - b);
      weeks.forEach(w => {
        const upd = {};
        D.games.filter(g => g.season === s && g.week === w && !g.forfeit && g.homeScore != null && g.awayScore != null).forEach(g => {
          R[g.home] ??= 0; R[g.away] ??= 0;
          const exp = R[g.home] - R[g.away] + MODEL.hfa;
          const act = Math.max(-MODEL.cap, Math.min(MODEL.cap, g.homeScore - g.awayScore));
          upd[g.home] = (upd[g.home] || 0) + MODEL.k * (act - exp);
          upd[g.away] = (upd[g.away] || 0) - MODEL.k * (act - exp);

          const wt = (s === targetSeason) ? 1.0 : 0.45;
          [[g.home, g.homeScore, g.awayScore], [g.away, g.awayScore, g.homeScore]].forEach(([id, f, ag]) => {
            const p = P[id] ??= { w: 0, pf: 0, pa: 0 };
            p.w += wt; p.pf += wt * f; p.pa += wt * ag;
          });
        });
        Object.entries(upd).forEach(([c, v]) => { R[c] = (R[c] || 0) + v; });
      });
    }
  });

  const pts = id => {
    const p = P[id] || { w: 0, pf: 0, pa: 0 };
    const d = p.w + MODEL.prior;
    return {
      pf: (p.pf + MODEL.prior * MODEL.avgPts) / d,
      pa: (p.pa + MODEL.prior * MODEL.avgPts) / d
    };
  };
  return { R, pts };
}

function model() {
  if (_modelCache) return _modelCache;
  _modelCache = buildModelAt(D.league.season, 99);
  return _modelCache;
}

const rate = (id, customModel = null) => (customModel || model()).R[id] ?? 0;

const erf = x => {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
};
const phi = x => 0.5 * (1 + erf(x / Math.SQRT2));

function predictWithModel(away, home, M) {
  const m = rate(home, M) - rate(away, M) + MODEL.hfa;
  const ph = M.pts(home), pa = M.pts(away);
  return {
    margin: m, // expected (home - away)
    pHome: phi(m / MODEL.sigma),
    total: Math.max(34.5, Math.min(78.5, ((ph.pf + pa.pa) / 2) + ((pa.pf + ph.pa) / 2)))
  };
}
const predict = (away, home) => predictWithModel(away, home, model());
const half = x => {
  const r = Math.round(x * 2) / 2;
  return Number.isInteger(r) ? r + 0.5 : r; // Half-point lines prevent pushes on standard spreads/totals
};
const fmtSpread = x => {
  const s = half(x);
  return s === 0 ? '+0.5' : (s > 0 ? '+' : '') + s.toFixed(1);
};
function americanML(p) {
  const q = Math.min(0.96, Math.max(0.04, p * (1 + MODEL.vig)));
  let v = q >= 0.5 ? -100 * q / (1 - q) : 100 * (1 - q) / q;
  v = Math.round(v / 5) * 5;
  if (v === 0) v = -105;
  return v > 0 ? '+' + v : String(v);
}
function americanNum(p) {
  return parseInt(americanML(p), 10);
}
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Simulate Season at any week cutoff (maxWeek = -1 for Preseason, or 0..13 for week-by-week chart) */
function simulateAt(sn, maxWeek = 99, simCount = 1500) {
  const S = season(sn);
  if (!S || !S.teams) return null;
  const ids = Object.keys(S.teams);
  const M = buildModelAt(sn, maxWeek);
  const rand = rng(107 + sn * 31 + (maxWeek + 2) * 17);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, 1 - rand()))) * Math.cos(2 * Math.PI * rand());

  const base = {};
  ids.forEach(i => { base[i] = { w: 0, l: 0, pd: 0 }; });
  const remaining = [];

  D.games.filter(g => g.season === sn && g.week < CHAMP_WEEK).forEach(g => {
    if (!base[g.home] || !base[g.away]) return;
    if (g.week <= maxWeek && played(g)) {
      const w = winnerOf(g), l = loserOf(g);
      base[w].w++; base[l].l++;
      if (!g.forfeit) {
        base[g.home].pd += (g.homeScore - g.awayScore);
        base[g.away].pd += (g.awayScore - g.homeScore);
      }
    } else {
      remaining.push({ g, exp: predictWithModel(g.away, g.home, M).margin });
    }
  });

  const groups = S.divisions ? Object.values(S.divisions.groups).map(m => m.filter(x => ids.includes(x))) : null;
  const out = {};
  ids.forEach(i => { out[i] = { div: 0, title: 0, champ: 0, w: 0, l: 0 }; });

  for (let n = 0; n < simCount; n++) {
    const cur = {};
    ids.forEach(i => { cur[i] = { w: base[i].w, l: base[i].l, pd: base[i].pd, j: rand() }; });
    remaining.forEach(({ g, exp }) => {
      const m = exp + MODEL.sigma * normal();
      if (m > 0) { cur[g.home].w++; cur[g.away].l++; }
      else { cur[g.away].w++; cur[g.home].l++; }
      cur[g.home].pd += m; cur[g.away].pd -= m;
    });
    const rank = list => list.slice().sort((x, y) => cur[y].w - cur[x].w || cur[y].pd - cur[x].pd || cur[y].j - cur[x].j);
    ids.forEach(i => { out[i].w += cur[i].w; out[i].l += cur[i].l; });
    let finalists;
    if (groups && groups.length === 2) {
      finalists = groups.map(gr => rank(gr)[0]);
      finalists.forEach(f => { out[f].div++; });
    } else {
      finalists = rank(ids).slice(0, 2);
    }
    finalists.forEach(f => { out[f].title++; });
    const m = predictWithModel(finalists[0], finalists[1], M).margin + MODEL.sigma * normal();
    out[m > 0 ? finalists[1] : finalists[0]].champ++;
  }

  ids.forEach(i => {
    const o = out[i];
    o.div /= simCount; o.title /= simCount; o.champ /= simCount;
    o.w /= simCount; o.l /= simCount;
    o.cw = base[i].w; o.cl = base[i].l;
    o.rating = rate(i, M);
  });
  return { out, groups, remaining: remaining.length };
}

/* Compute Week-to-Week Odds History Series for the Line Chart (Resets automatically when season ends) */
function computeWeeklyOddsSeries(sn) {
  const S = season(sn);
  if (!S || !S.teams) return { labels: [], series: {} };
  const ids = Object.keys(S.teams);
  const c = champOf(sn);
  if (c) {
    /* Season is over: per requirement, reset the graph once the season is over for the next season */
    return { labels: [], series: {}, resetForNextSeason: true, champion: c };
  }
  const curWk = Math.min(REG_FINAL_WEEK, D.league.season === sn ? D.league.week : REG_FINAL_WEEK);
  const allPlayedWeeks = [...new Set(D.games.filter(g => g.season === sn && played(g) && g.week <= REG_FINAL_WEEK).map(g => g.week))].sort((a, b) => a - b);
  const maxCompletedWeek = allPlayedWeeks.length ? Math.max(...allPlayedWeeks, Math.min(curWk, REG_FINAL_WEEK)) : 0;

  const checkpoints = [{ label: 'Preseason', wk: -1 }];
  for (let w = 1; w <= maxCompletedWeek; w++) {
    checkpoints.push({ label: 'Wk ' + w, wk: w });
  }

  const series = {};
  ids.forEach(id => { series[id] = []; });

  checkpoints.forEach(cp => {
    const sim = simulateAt(sn, cp.wk, 600);
    ids.forEach(id => {
      series[id].push(Math.round((sim.out[id]?.champ || 0) * 1000) / 10);
    });
  });

  return { labels: checkpoints.map(c => c.label), series, resetForNextSeason: false };
}

/* ---------- Automated Hot/Cold Power Rankings (Overperforming vs. Underperforming) ---------- */
function computeAutomatedPowerRankings(sn, upToWeek = 99) {
  const S = season(sn);
  if (!S || !S.teams) return [];
  const ids = Object.keys(S.teams);
  const preModel = buildModelAt(sn, -1); // Preseason expectation baseline
  const curTally = tally(D.games.filter(g => g.season === sn && g.week <= upToWeek));

  const metrics = ids.map(id => {
    const r = curTally[id] || { w: 0, l: 0, pf: 0, pa: 0, last: [] };
    const gamesPlayed = D.games.filter(g => g.season === sn && g.week <= upToWeek && played(g) && (g.home === id || g.away === id)).sort(bySW);
    let totalPerfDiff = 0;
    let recentPerfDiff = 0;
    let recentCount = 0;

    gamesPlayed.forEach((g, idx) => {
      const isHome = g.home === id;
      const opp = isHome ? g.away : g.home;
      const pred = predictWithModel(g.away, g.home, preModel);
      const expMargin = isHome ? pred.margin : -pred.margin;
      let actMargin = 0;
      if (g.forfeit) {
        actMargin = (g.forfeit === id) ? 17 : -17;
      } else {
        actMargin = isHome ? (g.homeScore - g.awayScore) : (g.awayScore - g.homeScore);
      }
      const diff = Math.max(-28, Math.min(28, actMargin - expMargin));
      totalPerfDiff += diff;
      if (idx >= Math.max(0, gamesPlayed.length - 3)) {
        recentPerfDiff += diff;
        recentCount++;
      }
    });

    const gp = Math.max(1, gamesPlayed.length);
    const avgOverperf = gamesPlayed.length ? (totalPerfDiff / gp) : 0;
    const recentHotIndex = recentCount ? (recentPerfDiff / recentCount) : 0;
    const winPct = (r.w + r.l) ? (r.w / (r.w + r.l)) : 0.5;
    const ov = overallsOf(id, sn);

    /* Power Score heavily weights Overperforming vs. Expectation + Recent Hot/Cold Form + Win Resume */
    const powerScore = (winPct * 42) + (avgOverperf * 1.45) + (recentHotIndex * 1.15) + ((r.pf - r.pa) / gp) * 0.45 + (ov.ovr - 75) * 0.35;

    let status = 'steady';
    let statusLabel = '⚡ On Pace';
    if (avgOverperf >= 4.0 || (recentHotIndex >= 6.5 && r.last.at(-1) === 'W')) {
      status = 'hot';
      statusLabel = `🔥 Hot (${avgOverperf >= 0 ? '+' : ''}${avgOverperf.toFixed(1)} vs Exp)`;
    } else if (avgOverperf <= -4.0 || (recentHotIndex <= -6.5 && r.last.at(-1) === 'L')) {
      status = 'cold';
      statusLabel = `❄️ Cold (${avgOverperf >= 0 ? '+' : ''}${avgOverperf.toFixed(1)} vs Exp)`;
    } else {
      statusLabel = `⚡ Steady (${avgOverperf >= 0 ? '+' : ''}${avgOverperf.toFixed(1)} vs Exp)`;
    }

    return {
      id,
      w: r.w,
      l: r.l,
      pf: r.pf,
      pa: r.pa,
      streak: streak(r),
      ovr: ov.ovr,
      off: ov.off,
      def: ov.def,
      avgOverperf,
      recentHotIndex,
      powerScore,
      status,
      statusLabel
    };
  });

  metrics.sort((a, b) => b.powerScore - a.powerScore);
  metrics.forEach((m, i) => { m.rank = i + 1; });

  /* Calculate prior week rankings to determine +/- movement */
  const playedWeeks = [...new Set(D.games.filter(g => g.season === sn && g.week <= upToWeek && played(g)).map(g => g.week))].sort((a, b) => a - b);
  if (playedWeeks.length >= 2) {
    const prevWeekCutoff = playedWeeks[playedWeeks.length - 2];
    const prevList = computeAutomatedPowerRankingsRaw(sn, prevWeekCutoff);
    metrics.forEach(m => {
      const prevRank = prevList.findIndex(x => x.id === m.id) + 1;
      m.prevRank = prevRank || m.rank;
      m.move = prevRank ? (prevRank - m.rank) : 0;
    });
  } else {
    metrics.forEach(m => { m.prevRank = m.rank; m.move = 0; });
  }

  return metrics;
}

function computeAutomatedPowerRankingsRaw(sn, upToWeek) {
  const S = season(sn);
  const ids = Object.keys(S.teams);
  const preModel = buildModelAt(sn, -1);
  const curTally = tally(D.games.filter(g => g.season === sn && g.week <= upToWeek));
  const list = ids.map(id => {
    const r = curTally[id] || { w: 0, l: 0, pf: 0, pa: 0, last: [] };
    const gamesPlayed = D.games.filter(g => g.season === sn && g.week <= upToWeek && played(g) && (g.home === id || g.away === id)).sort(bySW);
    let totalPerfDiff = 0, recentPerfDiff = 0, recentCount = 0;
    gamesPlayed.forEach((g, idx) => {
      const isHome = g.home === id;
      const pred = predictWithModel(g.away, g.home, preModel);
      const expMargin = isHome ? pred.margin : -pred.margin;
      const actMargin = g.forfeit ? ((g.forfeit === id) ? 17 : -17) : (isHome ? (g.homeScore - g.awayScore) : (g.awayScore - g.homeScore));
      const diff = Math.max(-28, Math.min(28, actMargin - expMargin));
      totalPerfDiff += diff;
      if (idx >= Math.max(0, gamesPlayed.length - 3)) { recentPerfDiff += diff; recentCount++; }
    });
    const gp = Math.max(1, gamesPlayed.length);
    const avgOverperf = gamesPlayed.length ? (totalPerfDiff / gp) : 0;
    const recentHotIndex = recentCount ? (recentPerfDiff / recentCount) : 0;
    const winPct = (r.w + r.l) ? (r.w / (r.w + r.l)) : 0.5;
    const ov = overallsOf(id, sn);
    const powerScore = (winPct * 42) + (avgOverperf * 1.45) + (recentHotIndex * 1.15) + ((r.pf - r.pa) / gp) * 0.45 + (ov.ovr - 75) * 0.35;
    return { id, powerScore };
  });
  return list.sort((a, b) => b.powerScore - a.powerScore);
}

/* ---------- Automated Weekly Storylines Generator (3–5 Dynamic Storylines) ---------- */
function generateWeeklyStorylines(sn, curWeek) {
  const storylines = [];
  const playedWeeks = [...new Set(D.games.filter(g => g.season === sn && played(g)).map(g => g.week))].sort((a, b) => a - b);
  const targetWeek = playedWeeks.includes(curWeek) ? curWeek : (playedWeeks.at(-1) ?? curWeek);
  const recentGames = D.games.filter(g => g.season === sn && g.week === targetWeek && played(g));
  const scoredGames = recentGames.filter(g => !g.forfeit && g.homeScore != null && g.awayScore != null);

  /* 1. Biggest Statement / Blowout Win */
  if (scoredGames.length) {
    const biggest = scoredGames.slice().sort((a, b) => Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore))[0];
    const w = winnerOf(biggest), l = loserOf(biggest);
    const hi = Math.max(biggest.homeScore, biggest.awayScore), lo = Math.min(biggest.homeScore, biggest.awayScore);
    storylines.push({
      tag: `Week ${targetWeek} Statement`,
      title: `${nameOf(w)} (${teamOf(w, sn)}) Dominates ${nameOf(l)} (${teamOf(l, sn)}), ${hi}–${lo}`,
      body: `${nameOf(w)}'s ${teamOf(w, sn)} squad delivered the loudest statement of Week ${targetWeek}, rolling past ${nameOf(l)} by ${hi - lo} points to send shockwaves through the MAC standings.`
    });
  }

  /* 2. Thriller / Close Game or Upset Alert */
  if (scoredGames.length > 1) {
    const closest = scoredGames.slice().sort((a, b) => Math.abs(a.homeScore - a.awayScore) - Math.abs(b.homeScore - b.awayScore))[0];
    const margin = Math.abs(closest.homeScore - closest.awayScore);
    const w = winnerOf(closest), l = loserOf(closest);
    const hi = Math.max(closest.homeScore, closest.awayScore), lo = Math.min(closest.homeScore, closest.awayScore);
    if (margin <= 14) {
      storylines.push({
        tag: `Instant Classic`,
        title: `${nameOf(w)} Holds Off ${nameOf(l)} in ${hi}–${lo} Battle`,
        body: `In a high-leverage MAC showdown, ${nameOf(w)} (${teamOf(w, sn)}) executed late in the fourth quarter to edge ${nameOf(l)} (${teamOf(l, sn)}) by ${margin} points.`
      });
    } else {
      storylines.push({
        tag: `Offensive Surge`,
        title: `${nameOf(w)} Pours On ${hi} Points Against ${teamOf(l, sn)}`,
        body: `${nameOf(w)} kept the foot on the gas all four quarters in Week ${targetWeek}, outscoring ${nameOf(l)} ${hi}–${lo} to climb the offensive efficiency charts.`
      });
    }
  }

  /* 3. Who's Hot / Power Rankings Riser & Streak Watch */
  const pr = computeAutomatedPowerRankings(sn, targetWeek);
  if (pr.length) {
    const hottest = pr.slice().sort((a, b) => b.avgOverperf - a.avgOverperf)[0];
    const topRanked = pr[0];
    storylines.push({
      tag: `Power Index Watch`,
      title: `${nameOf(topRanked.id)} (${teamOf(topRanked.id, sn)}) Holds #1 Power Spot; ${nameOf(hottest.id)} Overperforming by +${Math.max(0, hottest.avgOverperf).toFixed(1)} Pts`,
      body: `${nameOf(topRanked.id)} (${topRanked.w}–${topRanked.l}, ${topRanked.streak}) paces the automated Power Rankings, while ${nameOf(hottest.id)} (${teamOf(hottest.id, sn)}) is the league's hottest overperformer relative to preseason ratings.`
    });
  }

  /* 4. Division Race Check (Catholics vs. Convicts) */
  const S = season(sn);
  const t = tally(D.games.filter(g => g.season === sn));
  if (S && S.divisions && S.divisions.groups) {
    const divSummaries = Object.entries(S.divisions.groups).map(([dName, members]) => {
      const sorted = members.slice().sort((a, b) => (t[b]?.w || 0) - (t[a]?.w || 0) || (t[a]?.l || 0) - (t[b]?.l || 0));
      const leader = sorted[0], chaser = sorted[1];
      const lr = t[leader] || { w: 0, l: 0 }, cr = t[chaser] || { w: 0, l: 0 };
      return `${dName}: ${nameOf(leader)} (${lr.w}–${lr.l}) leads ${nameOf(chaser)} (${cr.w}–${cr.l})`;
    });
    storylines.push({
      tag: `MAC Division Races`,
      title: `Catholics & Convicts Races Tighten Entering ${WK(curWeek)}`,
      body: `Current division standings check-in — ${divSummaries.join(' · ')}. Every remaining user-vs-user clash carries massive tiebreaker weight.`
    });
  }

  /* 5. Marquee Upcoming Matchup to Watch */
  const upcoming = D.games.filter(g => g.season === sn && !played(g) && g.week >= curWeek).sort(bySW);
  if (upcoming.length) {
    const nextWk = upcoming[0].week;
    const wkGames = upcoming.filter(g => g.week === nextWk);
    const marquee = wkGames.slice().sort((a, b) => (rate(b.home) + rate(b.away)) - (rate(a.home) + rate(a.away)))[0];
    if (marquee) {
      const p = predict(marquee.away, marquee.home);
      const fav = p.margin >= 0 ? marquee.home : marquee.away;
      const spreadVal = (-Math.abs(half(p.margin))).toFixed(1);
      storylines.push({
        tag: `What to Watch (${WK(nextWk)})`,
        title: `Spotlight Clash: ${nameOf(marquee.away)} (${teamOf(marquee.away, sn)}) at ${nameOf(marquee.home)} (${teamOf(marquee.home, sn)})`,
        body: `Oddsmakers have ${nameOf(fav)} (${teamOf(fav, sn)}) installed as a ${spreadVal} favorite with an Over/Under of ${half(p.total).toFixed(1)}. Expect fireworks with MAC title odds on the line.`
      });
    }
  }

  return storylines.slice(0, 5);
}

/* ---------- Sportsbook & Wagering System (1,000 Credits / Season) ---------- */
function ensureWagers() {
  if (!D.league.wagers || D.league.wagers.season !== D.league.season) {
    D.league.wagers = { season: D.league.season, startingCredits: 1000, slips: [] };
  }
  return D.league.wagers;
}

function coachWagerSummary(cid, sn = D.league.season) {
  const W = ensureWagers();
  const start = W.startingCredits || 1000;
  const slips = (W.slips || []).filter(s => s.season === sn && s.coach === cid);
  let w = 0, l = 0, p = 0, openStake = 0, realizedNet = 0;
  slips.forEach(s => {
    if (s.status === 'WON') { w++; realizedNet += s.net; }
    else if (s.status === 'LOST') { l++; realizedNet -= s.stake; }
    else if (s.status === 'PUSH') { p++; }
    else if (s.status === 'OPEN') { openStake += s.stake; }
  });
  const balance = start + realizedNet - openStake;
  const totalRisked = slips.filter(s => s.status !== 'OPEN').reduce((acc, s) => acc + s.stake, 0);
  const roi = totalRisked > 0 ? ((realizedNet / totalRisked) * 100) : 0;
  return { id: cid, start, balance, openStake, realizedNet, w, l, p, roi, slips };
}

function calcPayoutFromAmerican(stake, odds) {
  const st = Number(stake) || 0;
  const od = Number(odds) || -110;
  if (st <= 0) return { payout: 0, net: 0 };
  const net = od > 0 ? Math.round(st * (od / 100)) : Math.round(st * (100 / Math.abs(od)));
  return { payout: st + net, net };
}

function settleWeekWagers(sn, wk) {
  const W = ensureWagers();
  let settledCount = 0;
  (W.slips || []).filter(s => s.season === sn && s.week === wk && s.status === 'OPEN').forEach(slip => {
    const g = D.games.find(x => x.season === sn && x.week === wk && x.away === slip.away && x.home === slip.home);
    if (!g || !played(g)) return;
    settledCount++;
    if (g.forfeit) {
      if (slip.market === 'ML') {
        if (g.forfeit === slip.pick) { slip.status = 'WON'; }
        else { slip.status = 'LOST'; slip.payout = 0; slip.net = -slip.stake; }
      } else {
        slip.status = 'PUSH'; slip.payout = slip.stake; slip.net = 0;
      }
      return;
    }
    const awaySc = g.awayScore, homeSc = g.homeScore;
    if (slip.market === 'ML') {
      const winId = homeSc > awaySc ? g.home : g.away;
      if (winId === slip.pick) {
        const res = calcPayoutFromAmerican(slip.stake, slip.odds);
        slip.status = 'WON'; slip.payout = res.payout; slip.net = res.net;
      } else {
        slip.status = 'LOST'; slip.payout = 0; slip.net = -slip.stake;
      }
    } else if (slip.market === 'SPREAD') {
      const pickedScore = slip.pick === g.home ? homeSc : awaySc;
      const oppScore = slip.pick === g.home ? awaySc : homeSc;
      const adj = pickedScore + Number(slip.line);
      if (adj > oppScore) {
        const res = calcPayoutFromAmerican(slip.stake, slip.odds);
        slip.status = 'WON'; slip.payout = res.payout; slip.net = res.net;
      } else if (adj < oppScore) {
        slip.status = 'LOST'; slip.payout = 0; slip.net = -slip.stake;
      } else {
        slip.status = 'PUSH'; slip.payout = slip.stake; slip.net = 0;
      }
    } else if (slip.market === 'OU') {
      const tot = awaySc + homeSc;
      if ((slip.pick === 'OVER' && tot > slip.line) || (slip.pick === 'UNDER' && tot < slip.line)) {
        const res = calcPayoutFromAmerican(slip.stake, slip.odds);
        slip.status = 'WON'; slip.payout = res.payout; slip.net = res.net;
      } else if (tot === slip.line) {
        slip.status = 'PUSH'; slip.payout = slip.stake; slip.net = 0;
      } else {
        slip.status = 'LOST'; slip.payout = 0; slip.net = -slip.stake;
      }
    }
  });
  return settledCount;
}

/* ---------- Game of the Week (GOTW) Engine ---------- */
function ensureGotwStore() {
  D.league.gotwByWeek ??= {};
  return D.league.gotwByWeek;
}

function getGotwForWeek(sn, wk) {
  const store = ensureGotwStore();
  const key = `${sn}-${wk}`;
  const wkGames = D.games.filter(g => g.season === sn && g.week === wk && userGame(g));
  if (!wkGames.length) return null;

  let entry = store[key];
  if (!entry) {
    entry = { away: null, home: null, votes: {} };
    store[key] = entry;
  }

  /* Tally votes if any exist */
  const counts = {};
  Object.values(entry.votes || {}).forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  let bestGame = null;
  if (entry.away && entry.home) {
    bestGame = wkGames.find(g => g.away === entry.away && g.home === entry.home);
  }
  if (!bestGame && Object.keys(counts).length) {
    const topPair = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const [aw, hm] = topPair.split('@');
    bestGame = wkGames.find(g => g.away === aw && g.home === hm);
  }
  if (!bestGame) {
    /* Fallback to highest combined rating matchup */
    bestGame = wkGames.slice().sort((a, b) => (rate(b.home) + rate(b.away)) - (rate(a.home) + rate(a.away)))[0];
  }
  return { game: bestGame, votes: entry.votes || {}, counts, candidates: wkGames };
}

function castGotwVote(sn, targetWk, matchupKey) {
  if (!UI.user) {
    showToast('Please log in with your Coach account to vote.');
    return;
  }
  const store = ensureGotwStore();
  const key = `${sn}-${targetWk}`;
  store[key] ??= { away: null, home: null, votes: {} };
  store[key].votes[UI.user] = matchupKey;

  /* Update leading game */
  const counts = {};
  Object.values(store[key].votes).forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  const topPair = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const [aw, hm] = topPair.split('@');
  store[key].away = aw;
  store[key].home = hm;

  saveLocalState();
  showToast(`Vote recorded for ${WK(targetWk)} Game of the Week!`);
  route();
}

/* ---------- Game Card Renderer ---------- */
function gameCard(g, isGotwHero = false) {
  const w = winnerOf(g), ok = played(g);
  const p = predict(g.away, g.home);
  const row = id => `<div>${chip(id, g.season, true)} ${w === id ? '<span class="win">● WIN</span>' : ''}</div>`;
  const tags = (isGotwHero ? '<span class="tag gold">⭐ Official Game of the Week</span> ' : '') +
    (g.week === CHAMP_WEEK ? '<span class="tag">MAC Championship</span> ' : '') +
    (userGame(g) ? '' : '<span class="cpu">vs CPU</span>');
  const awayML = americanML(1 - p.pHome), homeML = americanML(p.pHome);
  const spreadTxt = `${nameOf(p.margin >= 0 ? g.home : g.away)} ${(-Math.abs(half(p.margin))).toFixed(1)}`;
  const oddsPreview = !ok ? `<div class="muted" style="margin-top:4px;font-size:12px">Line: <b style="color:var(--gold-bright)">${esc(spreadTxt)}</b> · ML ${esc(awayML)} / ${esc(homeML)} · O/U ${half(p.total).toFixed(1)}</div>` : '';

  return `<div class="card game ${isGotwHero ? 'red-accent' : ''}">
    <div class="teams">${row(g.away)}${row(g.home)}<div>${tags}${oddsPreview}</div></div>
    <div class="score">${ok ? (g.forfeit ? `<span class="muted">Forfeit (${esc(nameOf(g.forfeit))} W)</span>` : `<div class="${w === g.away ? 'win' : ''}">${g.awayScore}</div><div class="${w === g.home ? 'win' : ''}">${g.homeScore}</div>`) : `<a class="tag gold" href="#odds/${g.week}" style="text-decoration:none">Bet Line →</a>`}</div>
  </div>`;
}

const seasonSelect = (cur, onchange) => `<select onchange="${onchange}">${D.seasons.map(s => `<option value="${s.season}" ${s.season === cur ? 'selected' : ''}>Season ${s.season} (${s.year})</option>`).join('')}</select>`;

/* ---------- Page Views ---------- */
const PAGES = {
  home() {
    const L = D.league;
    const games = D.games.filter(g => g.season === L.season && g.week === L.week);
    const pr = computeAutomatedPowerRankings(L.season, L.week);
    const storylines = generateWeeklyStorylines(L.season, L.week);
    const curGotw = getGotwForWeek(L.season, L.week);
    const nextVoteWeek = L.week < REG_FINAL_WEEK ? (L.week + 1) : null;
    const nextGotw = nextVoteWeek ? getGotwForWeek(L.season, nextVoteWeek) : null;
    const awardsOpen = !!(L.awardsVotingOpen || L.week === CHAMP_WEEK);

    /* GOTW Voting Block for Next Week (Vote for Week N+1 during Week N) */
    let gotwVoteHtml = '';
    if (nextGotw && nextGotw.candidates.length) {
      const totalVotes = Object.keys(nextGotw.votes).length;
      const myVote = UI.user ? nextGotw.votes[UI.user] : null;
      gotwVoteHtml = `<div class="card gold-accent">
        <div class="row-between">
          <div>
            <span class="tag gold">Prior-Week Coach Poll</span>
            <h2 style="margin:6px 0 2px">Vote for ${WK(nextVoteWeek)} Game of the Week</h2>
            <p class="muted">We are currently in ${WK(L.week)} — cast your coach vote for ${WK(nextVoteWeek)}'s marquee matchup before advancement (${totalVotes} coach vote${totalVotes === 1 ? '' : 's'} cast).</p>
          </div>
          ${isCommissioner() ? `<button class="ghost" data-action="open-commish-advance">⚡ Commissioner Advance Prompt</button>` : ''}
        </div>
        <div class="grid" style="margin-top:12px">
          ${nextGotw.candidates.map(g => {
            const mKey = `${g.away}@${g.home}`;
            const vCnt = nextGotw.counts[mKey] || 0;
            const pctVote = totalVotes ? Math.round((vCnt / totalVotes) * 100) : 0;
            const isPicked = myVote === mKey;
            const p = predict(g.away, g.home);
            return `<div class="card" style="margin:0;border-color:${isPicked ? 'var(--gold-bright)' : 'var(--line)'}">
              <div style="margin-bottom:6px">${chip(g.away, L.season)}</div>
              <div style="margin-bottom:8px"><span class="muted">@</span> ${chip(g.home, L.season)}</div>
              <div class="muted" style="font-size:11.5px;margin-bottom:8px">Proj Line: ${nameOf(p.margin >= 0 ? g.home : g.away)} ${(-Math.abs(half(p.margin))).toFixed(1)} · O/U ${half(p.total).toFixed(1)}</div>
              <div class="bar"><span style="width:${pctVote}%"></span></div>
              <div class="row-between" style="margin-top:8px">
                <span class="muted" style="font-size:12px"><b>${vCnt}</b> vote${vCnt === 1 ? '' : 's'} (${pctVote}%)</span>
                <button class="${isPicked ? 'gold-btn' : 'ghost'}" data-gotw-vote="${esc(mKey)}" data-gotw-wk="${nextVoteWeek}">${isPicked ? '✓ Voted' : 'Vote GOTW'}</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    return `
      ${L.announcement ? `<div class="card banner"><div class="row-between"><h2 style="margin:0">📣 Commissioner's Desk</h2>${isCommissioner() ? `<button class="ghost" data-action="open-commish-advance" style="font-size:12px;padding:5px 10px">Edit / Advance Week</button>` : ''}</div><div style="white-space:pre-wrap;margin-top:8px">${esc(L.announcement)}</div></div>` : ''}
      ${awardsOpen ? `<div class="card gold-accent"><div class="row-between"><div><span class="tag gold">🏆 End of Regular Season Ballot Open</span><h2 style="margin:6px 0 2px">Season ${L.season} Coach Awards &amp; "Holy Sh*t" Moments Voting Is Live!</h2><p class="muted">Voting opened at the end of the regular season and closes immediately after the MAC Championship Game.</p></div><a href="#awards"><button class="gold-btn">Open Awards Ballot →</button></a></div></div>` : ''}
      ${curGotw && curGotw.game ? `<h3>⭐ ${WK(L.week)} Featured Game of the Week</h3>${gameCard(curGotw.game, true)}` : ''}
      ${gotwVoteHtml}
      <div class="row-between" style="margin:18px 0 10px"><h2 style="margin:0">${WK(L.week)} MAC Matchups</h2><a href="#odds/${L.week}">Place Week ${L.week} Wagers (1,000 CR Season Bankroll) →</a></div>
      ${games.length ? games.map(g => gameCard(g, false)).join('') : '<div class="card empty">No games scheduled this week.</div>'}
      <div class="grid-2" style="margin-top:16px">
        <div class="card">
          <div class="row-between"><h2 style="margin:0">🔥 Key Weekly Storylines</h2><span class="tag">Auto-Generated</span></div>
          <p class="muted" style="margin-bottom:10px">Automatically synthesized from the latest scores, streaks, and upcoming MAC matchups.</p>
          ${storylines.map(st => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="tag">${esc(st.tag)}</span><h3 style="margin:6px 0 4px;color:var(--text);text-transform:none;font-size:15px">${esc(st.title)}</h3><p class="muted" style="margin:0;color:#d1d5db">${esc(st.body)}</p></div>`).join('')}
        </div>
        <div class="card">
          <div class="row-between"><h2 style="margin:0">⚡ Power Rankings (Top 6)</h2><a href="#rankings">Full Rankings →</a></div>
          <p class="muted" style="margin-bottom:10px">Generated from Overperforming vs. Underperforming &amp; Hot/Cold streaks.</p>
          <div class="tablewrap">
            <table>
              <tr><th>#</th><th>+/-</th><th>Coach / Team</th><th>Form</th></tr>
              ${pr.slice(0, 6).map(m => {
                const mvHtml = m.move > 0 ? `<span class="up">+${m.move}</span>` : m.move < 0 ? `<span class="down">${m.move}</span>` : '<span class="even-mv">0</span>';
                const badgeCls = m.status === 'hot' ? 'hot-badge' : m.status === 'cold' ? 'cold-badge' : 'steady-badge';
                return `<tr><td class="rank">${m.rank}</td><td>${mvHtml}</td><td>${chip(m.id, L.season)}</td><td><span class="${badgeCls}">${esc(m.statusLabel)}</span></td></tr>`;
              }).join('')}
            </table>
          </div>
        </div>
      </div>`;
  },

  standings(arg) {
    const sn = arg ? +arg : D.league.season;
    const S = season(sn);
    const t = tally(D.games.filter(g => g.season === sn));
    const ids = Object.keys(S.teams);

    /* Base overall place ranking */
    const defaultSorter = (a, b) => (t[b]?.w || 0) - (t[a]?.w || 0) || (t[a]?.l || 0) - (t[b]?.l || 0) || ((t[b]?.pf - t[b]?.pa) || 0) - ((t[a]?.pf - t[a]?.pa) || 0);
    const overallOrder = ids.slice().sort(defaultSorter);
    const overallPlaceOf = id => overallOrder.indexOf(id) + 1;

    /* Interactive Column Sorter */
    const customSorter = (a, b) => {
      const ra = t[a] || { w: 0, l: 0, pf: 0, pa: 0, last: [] };
      const rb = t[b] || { w: 0, l: 0, pf: 0, pa: 0, last: [] };
      const dir = UI.standingsSortDir === 'asc' ? 1 : -1;
      switch (UI.standingsSortCol) {
        case 'place': return (overallPlaceOf(a) - overallPlaceOf(b)) * dir;
        case 'coach': return nameOf(a).localeCompare(nameOf(b)) * dir;
        case 'w': return (ra.w - rb.w || (rb.l - ra.l)) * dir;
        case 'l': return (ra.l - rb.l || (rb.w - ra.w)) * dir;
        case 'pct': return (pct(ra) - pct(rb) || (ra.w - rb.w)) * dir;
        case 'pf': return (ra.pf - rb.pf) * dir;
        case 'pa': return (ra.pa - rb.pa) * dir;
        case 'diff': return ((ra.pf - ra.pa) - (rb.pf - rb.pa)) * dir;
        case 'strk': return (streakVal(ra) - streakVal(rb)) * dir;
        default: return defaultSorter(a, b);
      }
    };

    const sortArrow = col => UI.standingsSortCol === col ? (UI.standingsSortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const thSort = (col, label, num = false) => `<th class="sortable ${num ? 'num' : ''} ${UI.standingsSortCol === col ? 'active-sort' : ''}" data-sort-standings="${col}">${label}${sortArrow(col)}</th>`;

    const tbl = list => {
      const sorted = list.slice().sort(customSorter);
      return `<div class="tablewrap"><table>
        <tr>
          ${thSort('place', 'Ovr #')}
          ${thSort('coach', 'Coach & MAC Team')}
          ${thSort('w', 'W', true)}
          ${thSort('l', 'L', true)}
          ${thSort('pct', 'Pct', true)}
          ${thSort('pf', 'PF', true)}
          ${thSort('pa', 'PA', true)}
          ${thSort('diff', '+/-', true)}
          ${thSort('strk', 'Strk', true)}
        </tr>
        ${sorted.map(id => {
          const r = t[id] || { w: 0, l: 0, pf: 0, pa: 0, last: [] };
          const diff = r.pf - r.pa;
          return `<tr>
            <td><b>#${overallPlaceOf(id)}</b></td>
            <td>${chip(id, sn, true)}</td>
            <td class="num">${r.w}</td>
            <td class="num">${r.l}</td>
            <td class="num">${pctStr(r)}</td>
            <td class="num">${r.pf}</td>
            <td class="num">${r.pa}</td>
            <td class="num ${diff > 0 ? 'win' : diff < 0 ? 'loss' : ''}">${diff > 0 ? '+' + diff : diff}</td>
            <td class="num">${streak(r)}</td>
          </tr>`;
        }).join('')}
      </table></div>`;
    };

    const chLine = formatChampLine(sn);
    let body = '';
    if (S.divisions && UI.standingsMode === 'divisions') {
      body = `<h3>${esc(S.divisions.title || 'MAC Divisions')}</h3>` +
        Object.entries(S.divisions.groups).map(([name, members]) =>
          `<div class="card"><h2 style="margin-top:0">🏈 ${esc(name)} Division</h2>${tbl(members.filter(m => ids.includes(m)))}</div>`
        ).join('') +
        `<h3>Overall MAC Conference Standings</h3><div class="card">${tbl(ids)}</div>`;
    } else {
      body = `<div class="card"><h2 style="margin-top:0">Overall MAC League Standings (Organized by Place &amp; Data)</h2>${tbl(ids)}</div>`;
    }

    return `<div class="row-between">
        <div class="row">
          <h2 style="margin:0">MAC Standings</h2>
          ${seasonSelect(sn, "location.hash='#standings/'+this.value")}
        </div>
        <div class="row">
          <button class="ghost ${UI.standingsMode === 'divisions' ? 'active-pill' : ''}" data-standings-mode="divisions">Divisions + Overall</button>
          <button class="ghost ${UI.standingsMode === 'overall' ? 'active-pill' : ''}" data-standings-mode="overall">Overall Place Only</button>
        </div>
      </div>
      <p class="muted" style="margin-top:6px">Click any column header (<b>Ovr #</b>, <b>W</b>, <b>L</b>, <b>Pct</b>, <b>PF</b>, <b>PA</b>, <b>+/-</b>, <b>Strk</b>) to sort the standings table.</p>
      ${chLine ? `<div class="card gold-accent" style="margin-top:10px">🏆 <b>Season ${sn} Result:</b> <span class="champ">${esc(chLine)}</span></div>` : ''}
      ${body}`;
  },

  schedule(arg) {
    const [a, b] = (arg || '').split('/');
    const sn = a ? +a : D.league.season;
    const weeks = [...new Set(D.games.filter(g => g.season === sn).map(g => g.week))].sort((x, y) => x - y);
    const wk = b !== undefined && b !== '' ? +b : (sn === D.league.season && weeks.includes(D.league.week) ? D.league.week : weeks[0]);
    const games = D.games.filter(g => g.season === sn && g.week === wk);
    const gotwInfo = getGotwForWeek(sn, wk);

    return `<div class="row-between">
        <div class="row">
          <h2 style="margin:0">Schedule &amp; Scores</h2>
          ${seasonSelect(sn, "location.hash='#schedule/'+this.value")}
          <select onchange="location.hash='#schedule/${sn}/'+this.value">${weeks.map(w => `<option value="${w}" ${w === wk ? 'selected' : ''}>${WK(w)}</option>`).join('')}</select>
        </div>
        ${sn === D.league.season && wk === D.league.week + 1 ? '<span class="tag gold">Voting Open for This Week\'s GOTW</span>' : ''}
      </div><br>
      ${games.length ? games.map(g => {
        const isGotw = gotwInfo && gotwInfo.game && gotwInfo.game.away === g.away && gotwInfo.game.home === g.home;
        return gameCard(g, isGotw);
      }).join('') : '<div class="card empty">No games scheduled for this week.</div>'}`;
  },

  odds(arg) {
    const sn = D.league.season, S = season(sn);
    const openWeeks = [...new Set(D.games.filter(g => g.season === sn && !played(g)).map(g => g.week))].sort((x, y) => x - y);
    const wk = arg !== '' && arg != null ? +arg : (openWeeks.includes(D.league.week) ? D.league.week : (openWeeks[0] ?? D.league.week));
    const myCoach = currentUserObj();
    const mySummary = myCoach ? coachWagerSummary(myCoach.id, sn) : null;

    /* Upcoming Bettable Lines for Selected Week */
    const wkGames = D.games.filter(g => g.season === sn && g.week === wk && !played(g));
    const linesHtml = wkGames.map(g => {
      const p = predict(g.away, g.home);
      const awaySp = half(p.margin), homeSp = half(-p.margin);
      const awayML = americanNum(1 - p.pHome), homeML = americanNum(p.pHome);
      const ouLine = half(p.total);
      const gKey = `${sn}-${wk}-${g.away}-${g.home}`;

      const fmtOd = n => n > 0 ? '+' + n : String(n);
      const awaySpStr = fmtSpread(p.margin), homeSpStr = fmtSpread(-p.margin);

      return `<div class="card">
        <div class="row-between" style="margin-bottom:10px">
          <div>
            <div style="margin-bottom:4px">${chip(g.away, sn, true)} <span class="muted">(Away)</span></div>
            <div>${chip(g.home, sn, true)} <span class="muted">(Home)</span></div>
          </div>
          <div class="muted" style="text-align:right;font-size:12px">
            Win Prob: <b>${Math.round((1 - p.pHome) * 100)}%</b> / <b>${Math.round(p.pHome * 100)}%</b><br>
            Proj Total: <b>${ouLine.toFixed(1)} pts</b>
          </div>
        </div>
        <div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px">
          <div class="row">
            <span class="muted" style="font-size:11px;width:54px">SPREAD</span>
            <button class="bet-btn" data-bet-game="${esc(gKey)}" data-bet-away="${esc(g.away)}" data-bet-home="${esc(g.home)}" data-bet-wk="${wk}" data-bet-mkt="SPREAD" data-bet-pick="${esc(g.away)}" data-bet-line="${awaySp}" data-bet-odds="-110" data-bet-label="${esc(nameOf(g.away) + ' (' + teamOf(g.away, sn) + ') ' + awaySpStr + ' (-110)')}">
              <span>${esc(nameOf(g.away))} ${awaySpStr}</span><span class="odds-val">-110</span>
            </button>
            <button class="bet-btn" data-bet-game="${esc(gKey)}" data-bet-away="${esc(g.away)}" data-bet-home="${esc(g.home)}" data-bet-wk="${wk}" data-bet-mkt="SPREAD" data-bet-pick="${esc(g.home)}" data-bet-line="${homeSp}" data-bet-odds="-110" data-bet-label="${esc(nameOf(g.home) + ' (' + teamOf(g.home, sn) + ') ' + homeSpStr + ' (-110)')}">
              <span>${esc(nameOf(g.home))} ${homeSpStr}</span><span class="odds-val">-110</span>
            </button>
          </div>
          <div class="row">
            <span class="muted" style="font-size:11px;width:36px">ML</span>
            <button class="bet-btn" data-bet-game="${esc(gKey)}" data-bet-away="${esc(g.away)}" data-bet-home="${esc(g.home)}" data-bet-wk="${wk}" data-bet-mkt="ML" data-bet-pick="${esc(g.away)}" data-bet-line="0" data-bet-odds="${awayML}" data-bet-label="${esc(nameOf(g.away) + ' (' + teamOf(g.away, sn) + ') ML ' + fmtOd(awayML))}">
              <span>${esc(nameOf(g.away))} ML</span><span class="odds-val">${fmtOd(awayML)}</span>
            </button>
            <button class="bet-btn" data-bet-game="${esc(gKey)}" data-bet-away="${esc(g.away)}" data-bet-home="${esc(g.home)}" data-bet-wk="${wk}" data-bet-mkt="ML" data-bet-pick="${esc(g.home)}" data-bet-line="0" data-bet-odds="${homeML}" data-bet-label="${esc(nameOf(g.home) + ' (' + teamOf(g.home, sn) + ') ML ' + fmtOd(homeML))}">
              <span>${esc(nameOf(g.home))} ML</span><span class="odds-val">${fmtOd(homeML)}</span>
            </button>
          </div>
          <div class="row">
            <span class="muted" style="font-size:11px;width:42px">TOTAL</span>
            <button class="bet-btn" data-bet-game="${esc(gKey)}" data-bet-away="${esc(g.away)}" data-bet-home="${esc(g.home)}" data-bet-wk="${wk}" data-bet-mkt="OU" data-bet-pick="OVER" data-bet-line="${ouLine}" data-bet-odds="-110" data-bet-label="${esc('Over ' + ouLine.toFixed(1) + ' (-110) — ' + nameOf(g.away) + ' @ ' + nameOf(g.home))}">
              <span>Over ${ouLine.toFixed(1)}</span><span class="odds-val">-110</span>
            </button>
            <button class="bet-btn" data-bet-game="${esc(gKey)}" data-bet-away="${esc(g.away)}" data-bet-home="${esc(g.home)}" data-bet-wk="${wk}" data-bet-mkt="OU" data-bet-pick="UNDER" data-bet-line="${ouLine}" data-bet-odds="-110" data-bet-label="${esc('Under ' + ouLine.toFixed(1) + ' (-110) — ' + nameOf(g.away) + ' @ ' + nameOf(g.home))}">
              <span>Under ${ouLine.toFixed(1)}</span><span class="odds-val">-110</span>
            </button>
          </div>
        </div>
      </div>`;
    }).join('');

    /* Interactive Bet Slip Builder */
    let slipHtml = '';
    if (UI.betSlip) {
      const bs = UI.betSlip;
      const calc = calcPayoutFromAmerican(bs.stake, bs.odds);
      slipHtml = `<div class="card gold-accent">
        <div class="row-between">
          <div>
            <span class="tag gold">Active Wager Slip (${WK(bs.week)})</span>
            <h3 style="margin:6px 0 2px;color:var(--text);text-transform:none;font-size:16px">${esc(bs.pickLabel)}</h3>
            <p class="muted">Wagering as <b>${esc(myCoach ? myCoach.name : 'Guest')}</b> · Available Balance: <b>${mySummary ? mySummary.balance : 0} CR</b></p>
          </div>
          <button class="ghost" data-action="clear-betslip">✕ Cancel</button>
        </div>
        <div class="row" style="margin-top:10px">
          <div>
            <label style="margin-top:0">Stake (Credits)</label>
            <input type="number" id="betStakeInput" value="${bs.stake}" min="10" max="${mySummary ? mySummary.balance : 1000}" step="10" style="width:120px;font-weight:800">
          </div>
          <div class="row" style="margin-top:18px">
            <button class="ghost" data-quick-stake="50">50 CR</button>
            <button class="ghost" data-quick-stake="100">100 CR</button>
            <button class="ghost" data-quick-stake="250">250 CR</button>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div class="muted">To Win Profit: <b class="win">+${calc.net} CR</b></div>
            <div>Total Payout: <b style="color:var(--gold-bright)">${calc.payout} CR</b></div>
          </div>
          <button class="gold-btn" data-action="submit-wager" style="padding:10px 18px">Place Wager ✓</button>
        </div>
      </div>`;
    }

    /* Season Wager Leaderboard */
    const ids = Object.keys(S.teams);
    const wagerBoard = ids.map(id => coachWagerSummary(id, sn)).sort((a, b) => (b.balance + b.openStake) - (a.balance + a.openStake) || b.w - a.w);
    const recentSlips = (ensureWagers().slips || []).filter(s => s.season === sn).slice().reverse();

    /* Division & Conference Championship Odds (Live vs. Preseason Baseline Toggle) */
    const champ = champOf(sn);
    const isPreseasonMode = UI.oddsMode === 'preseason';
    const sim = champ && !isPreseasonMode ? null : simulateAt(sn, isPreseasonMode ? -1 : 99, 1800);

    const oddsTable = list => `<div class="tablewrap"><table>
      <tr>
        <th>Coach &amp; Team</th>
        <th class="num">Team OVR (O/D)</th>
        <th class="num">${isPreseasonMode ? 'Preseason Rec' : 'Current Rec'}</th>
        <th class="num">Likely Record (Proj)</th>
        ${S.divisions ? '<th class="num">Win Division</th>' : ''}
        <th class="num">Make Title Game</th>
        <th class="num">Win MAC Title</th>
      </tr>
      ${list.map(id => {
        const o = sim.out[id];
        const ov = overallsOf(id, sn);
        return `<tr>
          <td>${chip(id, sn)}</td>
          <td class="num"><span class="muted">${ov.ovr} (${ov.off}/${ov.def})</span></td>
          <td class="num">${o.cw}-${o.cl}</td>
          <td class="num"><b>${o.w.toFixed(1)}-${o.l.toFixed(1)}</b></td>
          ${S.divisions ? barCell(o.div) : ''}
          ${barCell(o.title)}
          ${barCell(o.champ)}
        </tr>`;
      }).join('')}
    </table></div>`;

    let futuresHtml = '';
    if (champ && !isPreseasonMode) {
      futuresHtml = `<div class="card gold-accent">Season ${sn} is complete! 🏆 <b>${esc(formatChampLine(sn))}</b>. Weekly odds chart has been reset for next season.</div>`;
    } else if (sim) {
      futuresHtml = S.divisions
        ? Object.entries(S.divisions.groups).map(([name, m]) =>
            `<div class="card"><h3 style="margin-top:0">${esc(name)} Division (${isPreseasonMode ? 'Preseason Baseline Odds' : 'Live Updated Odds'})</h3>${oddsTable(m.filter(x => ids.includes(x)).sort((x, y) => sim.out[y].champ - sim.out[x].champ || sim.out[y].div - sim.out[x].div))}</div>`
          ).join('')
        : `<div class="card">${oddsTable(ids.slice().sort((x, y) => sim.out[y].champ - sim.out[x].champ))}</div>`;
    }

    return `<div class="row-between">
        <div>
          <h2 style="margin:0">Vegas Odds, Futures &amp; Coach Sportsbook</h2>
          <p class="muted">Spreads, Moneylines (+/-), and Over/Unders dynamically recalculate across all future weeks after every advancement.</p>
        </div>
        ${mySummary ? `<div class="user-pill"><span>💰 <b>${esc(myCoach.name)}</b> Bankroll: <b style="color:var(--gold-bright)">${mySummary.balance} CR</b></span> · <span>Record: <b>${mySummary.w}-${mySummary.l}-${mySummary.p}</b> (${mySummary.realizedNet >= 0 ? '+' : ''}${mySummary.realizedNet} CR)</span></div>` : ''}
      </div>

      <div class="row-between" style="margin-top:16px">
        <div class="row">
          <h3 style="margin:0">Bettable Game Lines (${WK(wk)})</h3>
          ${openWeeks.length ? `<select onchange="location.hash='#odds/'+this.value">${openWeeks.map(w => `<option value="${w}" ${w === wk ? 'selected' : ''}>${WK(w)} ${w === D.league.week ? '(Current Week)' : '(Future Lookahead)'}</option>`).join('')}</select>` : ''}
        </div>
        <span class="muted">Click any Spread, Moneyline, or O/U button below to open your Wager Slip (1,000 Credits/Season).</span>
      </div>
      <div style="margin-top:10px">${slipHtml}${linesHtml || '<div class="card empty">No unplayed games remaining for this week.</div>'}</div>

      <div class="card" style="margin-top:18px">
        <div class="row-between">
          <div>
            <h2 style="margin:0">📈 Week-to-Week MAC Championship Odds Trajectory</h2>
            <p class="muted">Tracks each coach's title probability from Preseason/Week 0 through the final week of the regular season (resets once the season ends).</p>
          </div>
          <div class="row">
            <button class="ghost ${UI.chartFilter === 'top6' ? 'active-pill' : ''}" data-chart-filter="top6">Top 6 Contenders</button>
            <button class="ghost ${UI.chartFilter === 'Catholics' ? 'active-pill' : ''}" data-chart-filter="Catholics">Catholics Div</button>
            <button class="ghost ${UI.chartFilter === 'Convicts' ? 'active-pill' : ''}" data-chart-filter="Convicts">Convicts Div</button>
            <button class="ghost ${UI.chartFilter === 'all' ? 'active-pill' : ''}" data-chart-filter="all">All 12 Coaches</button>
          </div>
        </div>
        <div class="chart-box" style="margin-top:12px">
          <canvas id="oddsHistoryCanvas" style="width:100%;height:100%"></canvas>
        </div>
        <div id="oddsChartLegend" class="row" style="margin-top:10px;gap:12px"></div>
      </div>

      <div class="row-between" style="margin-top:20px">
        <h2 style="margin:0">Division, Title Game &amp; Projected Record Odds</h2>
        <div class="row">
          <button class="ghost ${UI.oddsMode === 'live' ? 'active-pill' : ''}" data-odds-mode="live">Live Current Week Odds</button>
          <button class="ghost ${UI.oddsMode === 'preseason' ? 'active-pill' : ''}" data-odds-mode="preseason">Preseason Baseline Odds (Pre-Week 0)</button>
        </div>
      </div>
      <p class="muted" style="margin-bottom:10px">${isPreseasonMode ? 'Preseason projections calculated from Team Overalls (OVR/OFF/DEF), historical coach ratings, and Season 3 schedule prior to Week 0.' : 'Live simulations combining all completed game results, updated team efficiency ratings, and remaining schedule.'}</p>
      ${futuresHtml}

      <div class="grid-2" style="margin-top:18px">
        <div class="card">
          <h2 style="margin-top:0">🏦 Season ${sn} Coach Wager Leaderboard</h2>
          <p class="muted">Each coach starts the season with 1,000 Credits. Settled automatically upon weekly advancement.</p>
          <div class="tablewrap">
            <table>
              <tr><th>#</th><th>Coach</th><th class="num">Avail CR</th><th class="num">Open Stake</th><th class="num">W-L-P</th><th class="num">Net P/L</th><th class="num">ROI</th></tr>
              ${wagerBoard.map((wb, idx) => `<tr>
                <td>${idx + 1}</td>
                <td>${chip(wb.id, sn)}</td>
                <td class="num"><b style="color:var(--gold-bright)">${wb.balance}</b></td>
                <td class="num">${wb.openStake}</td>
                <td class="num">${wb.w}-${wb.l}-${wb.p}</td>
                <td class="num ${wb.realizedNet > 0 ? 'win' : wb.realizedNet < 0 ? 'loss' : ''}">${wb.realizedNet > 0 ? '+' + wb.realizedNet : wb.realizedNet}</td>
                <td class="num">${wb.roi.toFixed(1)}%</td>
              </tr>`).join('')}
            </table>
          </div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">🧾 Recent &amp; Active League Wagers</h2>
          <p class="muted">Live ticket feed across ML, Spread, and Over/Under markets.</p>
          <div class="tablewrap">
            <table>
              <tr><th>Wk</th><th>Coach</th><th>Pick</th><th class="num">Stake</th><th class="num">Status</th></tr>
              ${recentSlips.slice(0, 10).map(s => {
                const stCls = s.status === 'WON' ? 'win' : s.status === 'LOST' ? 'loss' : '';
                const stTxt = s.status === 'WON' ? `WON (+${s.net})` : s.status === 'LOST' ? `LOST (-${s.stake})` : s.status;
                return `<tr>
                  <td>W${s.week}</td>
                  <td><b>${esc(nameOf(s.coach))}</b></td>
                  <td>${esc(s.pickLabel)}</td>
                  <td class="num">${s.stake} CR</td>
                  <td class="num ${stCls}"><b>${esc(stTxt)}</b></td>
                </tr>`;
              }).join('')}
            </table>
          </div>
        </div>
      </div>`;
  },

  rankings(arg) {
    const sn = arg ? +arg : D.league.season;
    const list = computeAutomatedPowerRankings(sn, sn === D.league.season ? D.league.week : 99);
    const sorted = list.slice().sort((a, b) => {
      if (UI.rankingsSortBy === 'move') return Math.abs(b.move) - Math.abs(a.move) || b.move - a.move || a.rank - b.rank;
      if (UI.rankingsSortBy === 'risers') return b.move - a.move || a.rank - b.rank;
      if (UI.rankingsSortBy === 'hot') return b.avgOverperf - a.avgOverperf;
      return a.rank - b.rank;
    });

    return `<div class="row-between">
        <div class="row">
          <h2 style="margin:0">Automated Power Rankings</h2>
          ${seasonSelect(sn, "location.hash='#rankings/'+this.value")}
        </div>
        <div class="row">
          <button class="ghost ${UI.rankingsSortBy === 'rank' ? 'active-pill' : ''}" data-rank-sort="rank">Sort by Power Rank (#)</button>
          <button class="ghost ${UI.rankingsSortBy === 'move' ? 'active-pill' : ''}" data-rank-sort="move">Sort by Movement (+/-)</button>
          <button class="ghost ${UI.rankingsSortBy === 'hot' ? 'active-pill' : ''}" data-rank-sort="hot">Sort by Overperforming (Hot/Cold)</button>
        </div>
      </div>
      <p class="muted" style="margin:6px 0 12px">Automatically generated each week based on <b>Who's Hot &amp; Who's Not</b> (actual game margin vs. expected spread from Team Overalls &amp; opponent strength), recent 3-game form, and resume.</p>
      <div class="card">
        <div class="tablewrap">
          <table>
            <tr>
              <th>Rank</th>
              <th class="num">Wk +/-</th>
              <th>Coach &amp; MAC Team</th>
              <th class="num">Record</th>
              <th class="num">Strk</th>
              <th class="num">Team OVR (O/D)</th>
              <th>Hot / Cold (vs. Expected)</th>
              <th class="num">Power Index</th>
            </tr>
            ${sorted.map(m => {
              const mvHtml = m.move > 0 ? `<span class="up">▲ +${m.move}</span>` : m.move < 0 ? `<span class="down">▼ ${m.move}</span>` : '<span class="even-mv">— 0</span>';
              const badgeCls = m.status === 'hot' ? 'hot-badge' : m.status === 'cold' ? 'cold-badge' : 'steady-badge';
              return `<tr>
                <td class="rank">#${m.rank}</td>
                <td class="num">${mvHtml}</td>
                <td>${chip(m.id, sn)}</td>
                <td class="num"><b>${m.w}-${m.l}</b></td>
                <td class="num">${m.streak}</td>
                <td class="num"><span class="muted">${m.ovr} (${m.off}/${m.def})</span></td>
                <td><span class="${badgeCls}">${esc(m.statusLabel)}</span></td>
                <td class="num"><b>${m.powerScore.toFixed(1)}</b></td>
              </tr>`;
            }).join('')}
          </table>
        </div>
      </div>`;
  },

  coaches() {
    const t = tally(D.games.filter(g => userGame(g))), cur = D.league.season;
    return `<h2>MAC Dynasty Coaches</h2>
      <p class="muted" style="margin-bottom:12px">Click any coach to view their career profile, season-by-season finishes, and individual head-to-head records.</p>
      <div class="grid">${D.coaches.map(c => {
        const titles = D.seasons.filter(s => champOf(s.season)?.champ === c.id).length;
        const r = t[c.id] || { uw: 0, ul: 0 };
        const tName = teamOf(c.id, cur);
        const ov = overallsOf(c.id, cur);
        const wb = coachWagerSummary(c.id, cur);
        return `<a class="card" style="color:inherit;text-decoration:none" href="#coach/${esc(c.id)}">
          <div class="row-between">
            <div style="font-weight:800;font-size:17px">${esc(c.name)} ${c.id === 'chunky' ? '<span class="role-tag">Commish &amp; Coach</span>' : ''}</div>
            ${titles ? `<span class="champ">${'🏆'.repeat(titles)}</span>` : ''}
          </div>
          <div style="margin:8px 0">${tName ? teamPill(tName, true, ov) : '<span class="muted">Inactive</span>'}</div>
          <div class="row-between muted" style="font-size:12.5px;border-top:1px solid var(--line);padding-top:8px;margin-top:8px">
            <span>All-Time User: <b style="color:var(--text)">${r.uw}-${r.ul}</b></span>
            <span>Bankroll: <b style="color:var(--gold-bright)">${wb.balance} CR</b></span>
          </div>
        </a>`;
      }).join('')}</div>`;
  },

  coach(id) {
    const c = coachObj(id);
    if (!c) return '<div class="card empty">Coach not found.</div>';
    const all = D.games.filter(g => g.home === id || g.away === id), t = tally(all)[id] || { w: 0, l: 0, uw: 0, ul: 0, pf: 0, pa: 0 };
    const seasonRows = D.seasons.filter(s => s.teams[id]).map(s => {
      const r = tally(D.games.filter(g => g.season === s.season && (g.home === id || g.away === id)))[id] || { w: 0, l: 0 };
      const ch = champOf(s.season), fin = ch ? (ch.champ === id ? '🏆 MAC Champion' : ch.runner === id ? 'Runner-up' : '') : '';
      const aw = AWARDS.filter(([k]) => s.awards?.[k]?.coach === id).map(([, l]) => l).join(', ');
      return `<tr><td>S${s.season} (${s.year})</td><td>${teamPill(s.teams[id], true, overallsOf(id, s.season))}</td><td class="num">${r.w}-${r.l}</td><td>${fin}</td><td>${esc(aw)}</td></tr>`;
    }).join('');
    const opp = D.coaches.filter(o => o.id !== id).map(o => {
      const gs = D.games.filter(g => userGame(g) && ((g.home === id && g.away === o.id) || (g.away === id && g.home === o.id)) && winnerOf(g));
      const w = gs.filter(g => winnerOf(g) === id).length, l = gs.length - w;
      return gs.length ? `<tr><td>${chip(o.id, D.league.season)}</td><td class="num ${w > l ? 'win' : w < l ? 'loss' : ''}"><b>${w}-${l}</b></td></tr>` : '';
    }).join('');
    const cur = D.games.filter(g => g.season === D.league.season && (g.home === id || g.away === id)).sort(bySW);
    return `<p><a href="#coaches">← All coaches</a></p>
      <div class="card red-accent">
        <div class="row-between">
          <div>
            <h2 style="margin:0">${esc(c.name)} ${c.id === 'chunky' ? '<span class="role-tag">Commissioner &amp; Coach</span>' : ''}</h2>
            <div style="margin-top:6px">${teamPill(teamOf(id, D.league.season), true, overallsOf(id, D.league.season))}</div>
          </div>
          <div style="text-align:right">
            <div class="muted">Career User Record</div>
            <div style="font-size:22px;font-weight:900;color:var(--gold-bright)">${t.w}-${t.l}</div>
          </div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card"><h3 style="margin-top:0">Season-by-Season Resume</h3><div class="tablewrap"><table><tr><th>Season</th><th>Team</th><th class="num">Record</th><th>Finish</th><th>Awards</th></tr>${seasonRows}</table></div></div>
        <div class="card"><h3 style="margin-top:0">Head-to-Head vs. League Coaches</h3><div class="tablewrap"><table><tr><th>Opponent</th><th class="num">Series Record</th></tr>${opp || '<tr><td class="muted" colspan="2">No completed games yet</td></tr>'}</table></div></div>
      </div>
      <h3>Season ${D.league.season} Schedule &amp; Results</h3>${cur.map(g => gameCard(g, false)).join('') || '<div class="card empty">No games.</div>'}`;
  },

  awards() {
    const sn = D.league.season;
    const S = season(sn);
    const champ = champOf(sn);
    const votingOpen = !!(D.league.awardsVotingOpen || (D.league.week === CHAMP_WEEK && !champ));
    const nominees = S.awardNominees || {};
    const votes = S.awardVotes || {};
    const myVote = (UI.user && votes[UI.user]) ? votes[UI.user] : {};

    const categories = [
      ['mvp', 'League MVP (3 Finalists)'],
      ['opoy', 'Offensive Player of the Year — OPOY (3 Finalists)'],
      ['dpoy', 'Defensive Player of the Year — DPOY (3 Finalists)'],
      ['bestOff', 'Best Offense — Team (3 Finalists)'],
      ['bestDef', 'Best Defense — Team (3 Finalists)'],
      ['gameOfYear', 'Game of the Year (3 Finalists)']
    ];

    return `<div class="row-between">
        <div>
          <h2 style="margin:0">🏆 Season ${sn} Awards &amp; "Holy Sh*t" Moments Ballot</h2>
          <p class="muted">Coaches vote from 3 finalist options per category and submit their "Holy Sh*t" moments. Automatically opens at the end of the regular season and closes after the MAC Championship Game.</p>
        </div>
        <div class="row">
          <span class="tag ${votingOpen ? 'gold' : ''}">${votingOpen ? '🟢 Ballot Open' : '🔒 Ballot Locked (Regular Season In Progress)'}</span>
          ${isCommissioner() ? `<button class="ghost" data-action="toggle-awards-open">${votingOpen ? 'Lock Ballot' : '🔓 Open Ballot Now (Commissioner Override)'}</button>` : ''}
        </div>
      </div>

      ${!votingOpen ? `<div class="card red-accent" style="margin-top:12px"><b>Voting Window Notice:</b> Official coach voting opens automatically when the league advances from Week 13 to Conference Championship Week (Week 14) and closes once the MAC Championship Game score is finalized. ${isCommissioner() ? 'As Commissioner, you can click <b>Open Ballot Now</b> above to test or open voting early, or edit the 3 nominees per category in the <b>Commissioner</b> tab.' : ''}</div>` : ''}

      <div class="grid-2" style="margin-top:14px">
        ${categories.map(([key, title]) => {
          const opts = nominees[key] || [];
          const tallyCounts = [0, 0, 0];
          Object.values(votes).forEach(v => { if (v && typeof v[key] === 'number' && tallyCounts[v[key]] !== undefined) tallyCounts[v[key]]++; });
          const totalV = tallyCounts.reduce((a, b) => a + b, 0);

          return `<div class="card">
            <h3 style="margin-top:0">${esc(title)}</h3>
            ${opts.map((opt, idx) => {
              const picked = myVote[key] === idx;
              const cnt = tallyCounts[idx] || 0;
              const pctV = totalV ? Math.round((cnt / totalV) * 100) : 0;
              return `<div class="card" style="margin-bottom:8px;padding:10px;border-color:${picked ? 'var(--gold-bright)' : 'var(--line)'}">
                <div class="row-between">
                  <div>
                    <div style="font-weight:700">${esc(opt.name)}</div>
                    <div style="margin-top:4px">${opt.coach ? chip(opt.coach, sn) : ''}</div>
                  </div>
                  <button class="${picked ? 'gold-btn' : 'ghost'}" data-award-cat="${esc(key)}" data-award-idx="${idx}" ${!votingOpen ? 'disabled' : ''}>${picked ? '✓ Selected' : 'Vote'}</button>
                </div>
                <div class="bar" style="margin-top:8px"><span style="width:${pctV}%"></span></div>
                <div class="muted" style="font-size:11.5px">${cnt} coach vote${cnt === 1 ? '' : 's'} (${pctV}%)</div>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>

      <div class="card gold-accent" style="margin-top:14px">
        <h2 style="margin-top:0">💥 Submit Your Season ${sn} "Holy Sh*t" Moment</h2>
        <p class="muted">Type in the wildest play, comeback, or unforgettable moment from Season ${sn} using your coach login (${esc(nameOf(UI.user || 'Guest'))}).</p>
        <textarea id="holyMomentInput" rows="3" placeholder="e.g., Walk-off pick-six in overtime, 28-point 4th quarter comeback..." ${!votingOpen ? 'disabled' : ''}>${esc(myVote.moment || '')}</textarea>
        <div class="row-between" style="margin-top:10px">
          <span class="muted">${Object.values(votes).filter(v => v && v.moment).length} coach moment(s) submitted so far</span>
          <button class="gold-btn" data-action="save-holy-moment" ${!votingOpen ? 'disabled' : ''}>Save My "Holy Sh*t" Moment ✓</button>
        </div>
        <h3 style="margin-top:16px">Submitted Season ${sn} "Holy Sh*t" Moments</h3>
        <ul class="clean moments">
          ${Object.entries(votes).filter(([, v]) => v && v.moment).map(([cid, v]) => `<li><b>${esc(nameOf(cid))}:</b> "${esc(v.moment)}"</li>`).join('') || '<li class="muted">No moments submitted yet.</li>'}
        </ul>
      </div>`;
  },

  /* Combined History & All-Time Tab (User vs. User Matrix Removed per Requirement 16) */
  history() {
    const ug = D.games.filter(userGame), t = tally(ug);
    const titles = {};
    D.seasons.forEach(s => { const c = champOf(s.season); if (c) titles[c.champ] = (titles[c.champ] || 0) + 1; });
    const cnt = (k, id) => D.seasons.filter(s => s.awards?.[k]?.coach === id).length || 0;

    const order = D.coaches.map(c => c.id).filter(id => t[id]).sort((a, b) => {
      const dir = UI.historySortDir === 'asc' ? 1 : -1;
      switch (UI.historySortCol) {
        case 'w': return (t[a].w - t[b].w || pct(t[a]) - pct(t[b])) * dir;
        case 'titles': return ((titles[a] || 0) - (titles[b] || 0) || pct(t[a]) - pct(t[b])) * dir;
        default: return (pct(t[a]) - pct(t[b]) || t[a].w - t[b].w) * dir;
      }
    });

    const seasonCards = [...D.seasons].reverse().map(s => {
      const champLine = formatChampLine(s.season);
      const A = s.awards || {};
      const aw = AWARDS.filter(([k]) => A[k]).map(([k, l]) =>
        `<tr><td><b>${esc(l)}</b></td><td>${esc(A[k].name)}</td><td>${A[k].coach ? chip(A[k].coach, s.season) : ''}</td></tr>`
      ).join('');
      return `<div class="card">
        <div class="row-between">
          <h2 style="margin:0">Season ${s.season} <span class="muted">· ${s.year} MAC Dynasty</span></h2>
          ${champLine ? '<span class="tag gold">Completed Season</span>' : '<span class="tag">In Progress</span>'}
        </div>
        ${champLine
          ? `<div class="card gold-accent" style="margin:12px 0;padding:12px"><span class="tag gold">🏆 MAC Championship Result</span><div style="font-size:17px;font-weight:800;margin-top:6px" class="champ">${esc(champLine)}</div></div>`
          : '<p class="muted" style="margin:10px 0">Champion not decided yet (Season in progress).</p>'}
        ${aw ? `<h3>Season ${s.season} Award Winners</h3><div class="tablewrap"><table><tr><th>Award</th><th>Winner</th><th>Coach / Team</th></tr>${aw}</table></div>` : ''}
        ${A.gameOfYear ? `<p style="margin-top:12px">⭐ <b>Game of the Year:</b> ${esc(A.gameOfYear)}</p>` : ''}
        ${(s.moments || []).length ? `<h3>"Holy Sh*t" Moments</h3><ul class="clean moments">${s.moments.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      </div>`;
    }).join('');

    return `<h2>League History &amp; All-Time Coaching Records</h2>
      <p class="muted" style="margin-bottom:14px">Combined All-Time Coaching Leaderboard and Season-by-Season Championship Archives (individual head-to-head records are located on each coach's profile page).</p>

      <div class="card red-accent">
        <div class="row-between">
          <h2 style="margin:0">🏅 All-Time Coach Leaderboard (User vs. User)</h2>
          <div class="row">
            <button class="ghost ${UI.historySortCol === 'pct' ? 'active-pill' : ''}" data-hist-sort="pct">Sort by Win %</button>
            <button class="ghost ${UI.historySortCol === 'w' ? 'active-pill' : ''}" data-hist-sort="w">Sort by Wins</button>
            <button class="ghost ${UI.historySortCol === 'titles' ? 'active-pill' : ''}" data-hist-sort="titles">Sort by Titles 🏆</button>
          </div>
        </div>
        <div class="tablewrap" style="margin-top:10px">
          <table>
            <tr>
              <th>#</th>
              <th>Coach (Current Team)</th>
              <th class="num">W-L</th>
              <th class="num">Win %</th>
              <th class="num">Titles 🏆</th>
              ${AWARDS.map(([, l]) => `<th class="num">${esc(l.split(' (')[0])}</th>`).join('')}
            </tr>
            ${order.map((id, i) => `<tr>
              <td><b>${i + 1}</b></td>
              <td>${chip(id, D.league.season)}</td>
              <td class="num"><b>${t[id].w}-${t[id].l}</b></td>
              <td class="num">${pctStr(t[id])}</td>
              <td class="num"><b class="champ">${titles[id] ? '🏆'.repeat(titles[id]) + ' (' + titles[id] + ')' : '–'}</b></td>
              ${AWARDS.map(([k]) => `<td class="num">${cnt(k, id) || '–'}</td>`).join('')}
            </tr>`).join('')}
          </table>
        </div>
      </div>

      <h2 style="margin-top:22px">📜 Season-by-Season League Archive</h2>
      ${seasonCards}`;
  },

  /* Private Commissioner-Only Suite (Strictly Isolated to Chunky) */
  commissioner() {
    if (!isCommissioner()) {
      return `<div class="card red-accent">
        <h2>🔒 Commissioner Access Restricted</h2>
        <p class="muted">This area is isolated to the League Commissioner (<b>Chunky</b>). Coaches can place wagers, vote on Game of the Week, and vote on Season Awards using their coach login.</p>
      </div>`;
    }

    const L = D.league;
    const S = season(L.season);
    const curGames = D.games.map((g, idx) => ({ g, idx })).filter(x => x.g.season === L.season && x.g.week === L.week);

    let modeBody = '';
    if (UI.commishMode === 'weekly') {
      modeBody = `<div class="card red-accent">
        <span class="tag gold">Private Commissioner Prompt · Weekly Advancement (Week 0 → Week 13)</span>
        <h2 style="margin:8px 0 4px">Enter ${WK(L.week)} Results &amp; Advance League</h2>
        <p class="muted">Enter scores below. Advancing automatically settles Week ${L.week} coach wagers, locks in ${WK(L.week + 1)} Game of the Week from coach votes, recalculates all future weeks' Spreads/MLs/O/Us, updates the Weekly Odds Line Chart, and generates 3–5 fresh Weekly Storylines.</p>

        <div style="margin-top:14px">
          ${curGames.length ? curGames.map(({ g, idx }) => `<div class="card game" style="margin-bottom:10px">
            <div class="teams">
              <div>${chip(g.away, L.season, true)} <span class="muted">(Away)</span></div>
              <div>${chip(g.home, L.season, true)} <span class="muted">(Home)</span></div>
              <div style="margin-top:4px">
                <select data-commish-ff="${idx}">
                  <option value="">No Forfeit (Standard Final Score)</option>
                  <option value="${esc(g.away)}" ${g.forfeit === g.away ? 'selected' : ''}>${esc(nameOf(g.away))} wins by Forfeit</option>
                  <option value="${esc(g.home)}" ${g.forfeit === g.home ? 'selected' : ''}>${esc(nameOf(g.home))} wins by Forfeit</option>
                </select>
              </div>
            </div>
            <div class="row">
              <div>
                <label style="margin:0 0 2px">Away Score</label>
                <input class="score" type="number" data-commish-score="${idx}" data-side="awayScore" value="${g.awayScore ?? ''}" placeholder="Away">
              </div>
              <div>
                <label style="margin:0 0 2px">Home Score</label>
                <input class="score" type="number" data-commish-score="${idx}" data-side="homeScore" value="${g.homeScore ?? ''}" placeholder="Home">
              </div>
              <button class="danger" data-commish-delgame="${idx}" title="Remove matchup">✕</button>
            </div>
          </div>`).join('') : '<div class="card empty">No games scheduled for this week yet. Add one below!</div>'}
        </div>

        <div class="card" style="background:#0f1119">
          <h3 style="margin-top:0">➕ Add Matchup to ${WK(L.week)}</h3>
          <div class="row">
            <div><label style="margin-top:0">Away Coach</label><select id="addGameAway">${Object.keys(S.teams).map(id => `<option value="${esc(id)}">${esc(nameOf(id))} (${esc(teamOf(id, L.season))})</option>`).join('')}</select></div>
            <div><label style="margin-top:0">Home Coach</label><select id="addGameHome">${Object.keys(S.teams).map((id, i) => `<option value="${esc(id)}" ${i === 1 ? 'selected' : ''}>${esc(nameOf(id))} (${esc(teamOf(id, L.season))})</option>`).join('')}</select></div>
            <button class="ghost" data-action="commish-add-game" style="margin-top:18px">+ Add Matchup</button>
          </div>
        </div>

        <div class="card gold-accent" style="margin-top:14px">
          <h3 style="margin-top:0">📣 Commissioner's Desk Update Prompt</h3>
          <p class="muted" style="margin-bottom:8px">Do you need a Commissioner's Desk note on the Home page for this advancement?</p>
          <div class="row" style="margin-bottom:10px">
            <button class="ghost ${UI.commishDeskNeed === 'yes' ? 'active-pill' : ''}" data-desk-need="yes">Yes — Write / Update Note</button>
            <button class="ghost ${UI.commishDeskNeed === 'no' ? 'active-pill' : ''}" data-desk-need="no">No — Skip / Clear Note</button>
          </div>
          ${UI.commishDeskNeed === 'yes' ? `<textarea id="commishDeskText" rows="3" placeholder="Type your weekly note to the league here...">${esc(L.announcement || '')}</textarea>` : '<p class="muted">Commissioner\'s Desk banner will be hidden/skipped for this week.</p>'}
        </div>

        <div class="row-between" style="margin-top:14px">
          <button class="ghost" data-action="commish-save-scores">💾 Save Scores Without Advancing</button>
          <button class="gold-btn" data-action="commish-advance-week" style="padding:11px 22px;font-size:15px">⚡ Save Results &amp; Advance to ${WK(Math.min(CHAMP_WEEK, L.week + 1))} →</button>
        </div>
      </div>`;
    } else if (UI.commishMode === 'champweek') {
      /* End of Regular Season / Conference Championship Week Setup */
      const t = tally(D.games.filter(g => g.season === L.season && g.week <= REG_FINAL_WEEK));
      const divSort = (a, b) => (t[b]?.w || 0) - (t[a]?.w || 0) || (t[a]?.l || 0) - (t[b]?.l || 0) || ((t[b]?.pf - t[b]?.pa) || 0) - ((t[a]?.pf - t[a]?.pa) || 0);
      const cathWinner = S.divisions?.groups?.Catholics?.slice().sort(divSort)[0] || 'chunky';
      const convWinner = S.divisions?.groups?.Convicts?.slice().sort(divSort)[0] || 'beech';
      const nom = S.awardNominees || {};

      modeBody = `<div class="card gold-accent">
        <span class="tag gold">Private Commissioner Prompt · End of Regular Season (Conference Champ Week)</span>
        <h2 style="margin:8px 0 4px">Advance to MAC Championship Week &amp; Open Awards Ballot</h2>
        <p class="muted">Sets up the MAC Championship Game matchup, configures the 3 finalist options per Season Award category, and opens End-of-Season Voting for all coaches.</p>

        <div class="card" style="margin-top:12px">
          <h3 style="margin-top:0">🏆 MAC Championship Matchup (Week 14)</h3>
          <div class="row">
            <div>
              <label style="margin-top:0">Catholics Division Representative (Away)</label>
              <select id="champAwaySel">${Object.keys(S.teams).map(id => `<option value="${esc(id)}" ${id === cathWinner ? 'selected' : ''}>${esc(nameOf(id))} (${esc(teamOf(id, L.season))})</option>`).join('')}</select>
            </div>
            <div>
              <label style="margin-top:0">Convicts Division Representative (Home)</label>
              <select id="champHomeSel">${Object.keys(S.teams).map(id => `<option value="${esc(id)}" ${id === convWinner ? 'selected' : ''}>${esc(nameOf(id))} (${esc(teamOf(id, L.season))})</option>`).join('')}</select>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">🗳️ Configure 3 Finalist Options for Coach Season Awards Voting</h3>
          <div class="grid-2">
            ${[['mvp', 'MVP'], ['opoy', 'OPOY'], ['dpoy', 'DPOY'], ['bestOff', 'Best Offense'], ['bestDef', 'Best Defense'], ['gameOfYear', 'Game of the Year']].map(([k, label]) => {
              const arr = nom[k] || [{ name: '', coach: 'chunky' }, { name: '', coach: 'clay' }, { name: '', coach: 'skippa' }];
              return `<div style="border:1px solid var(--line);border-radius:10px;padding:10px">
                <b>${esc(label)} — 3 Options</b>
                ${[0, 1, 2].map(i => `<div class="row" style="margin-top:6px">
                  <input type="text" data-nom-cat="${k}" data-nom-idx="${i}" data-nom-field="name" value="${esc(arr[i]?.name || '')}" placeholder="Option ${i + 1} (Player or Team)" style="flex:1">
                  <select data-nom-cat="${k}" data-nom-idx="${i}" data-nom-field="coach">${Object.keys(S.teams).map(cid => `<option value="${esc(cid)}" ${arr[i]?.coach === cid ? 'selected' : ''}>${esc(nameOf(cid))}</option>`).join('')}</select>
                </div>`).join('')}
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="row-between" style="margin-top:14px">
          <button class="ghost" data-action="save-nominees-only">💾 Save Award Finalists</button>
          <button class="gold-btn" data-action="advance-to-champ-week" style="padding:11px 22px">⚡ Advance to MAC Championship Week &amp; Open Voting →</button>
        </div>
      </div>`;
    } else if (UI.commishMode === 'endseason') {
      /* End of Season (Post-Championship) Prompt */
      let cg = D.games.find(g => g.season === L.season && g.week === CHAMP_WEEK);
      if (!cg) {
        cg = { season: L.season, week: CHAMP_WEEK, away: 'chunky', home: 'clay', awayScore: null, homeScore: null, forfeit: null };
      }
      modeBody = `<div class="card red-accent">
        <span class="tag gold">Private Commissioner Prompt · End of Season Finalization</span>
        <h2 style="margin:8px 0 4px">Finalize MAC Championship Game, Close Voting &amp; Archive Season ${L.season}</h2>
        <p class="muted">Enters the MAC Championship score, closes Coach Awards voting, tallies the winning Season Awards &amp; "Holy Sh*t" Moments, records the champion in League History as <b>"Winner over Loser — WinningTeam Score, LosingTeam Score"</b>, and resets the Weekly Odds Chart for next season.</p>

        <div class="card" style="margin-top:12px">
          <h3 style="margin-top:0">🏆 MAC Championship Game Final Score (Week 14)</h3>
          <div class="row">
            <div>
              <label style="margin-top:0">Away Finalist</label>
              <select id="eosAway">${Object.keys(S.teams).map(id => `<option value="${esc(id)}" ${id === cg.away ? 'selected' : ''}>${esc(nameOf(id))} (${esc(teamOf(id, L.season))})</option>`).join('')}</select>
            </div>
            <div>
              <label style="margin-top:0">Away Score</label>
              <input type="number" class="score" id="eosAwayScore" value="${cg.awayScore ?? 38}">
            </div>
            <div>
              <label style="margin-top:0">Home Finalist</label>
              <select id="eosHome">${Object.keys(S.teams).map(id => `<option value="${esc(id)}" ${id === cg.home ? 'selected' : ''}>${esc(nameOf(id))} (${esc(teamOf(id, L.season))})</option>`).join('')}</select>
            </div>
            <div>
              <label style="margin-top:0">Home Score</label>
              <input type="number" class="score" id="eosHomeScore" value="${cg.homeScore ?? 31}">
            </div>
          </div>
        </div>

        <div class="row-between" style="margin-top:14px">
          <span class="muted">This will lock Season ${L.season} Awards Voting and publish the official Season ${L.season} History entry.</span>
          <button class="gold-btn" data-action="finalize-end-of-season" style="padding:11px 22px">🏆 Finalize Season ${L.season} &amp; Update League History →</button>
        </div>
      </div>`;
    } else if (UI.commishMode === 'preseason') {
      /* Preseason Form: Coaches, Team Overalls (OVR, OFF, DEF), Divisions & User-vs-User Schedule */
      const ids = Object.keys(S.teams);
      modeBody = `<div class="card gold-accent">
        <span class="tag gold">Private Commissioner Prompt · Preseason Setup &amp; Overalls Form</span>
        <h2 style="margin:8px 0 4px">Preseason Coach, Team Overalls (OVR / OFF / DEF) &amp; Schedule Form</h2>
        <p class="muted">Update league coaches, MAC user teams, divisions (Catholics &amp; Convicts), and Team Overalls (OVR, OFF, DEF), or launch a brand-new season with 1,000 fresh wager credits per coach.</p>

        <div class="card" style="margin-top:12px">
          <div class="row-between">
            <h3 style="margin:0">🏈 Season ${L.season} Coaches, MAC Teams, Divisions &amp; Overalls</h3>
            <button class="gold-btn" data-action="save-preseason-overalls">💾 Save Teams, Divisions &amp; Overalls</button>
          </div>
          <div class="tablewrap" style="margin-top:10px">
            <table>
              <tr><th>Coach</th><th>MAC Team Name</th><th>Division</th><th class="num">OVR</th><th class="num">OFF</th><th class="num">DEF</th><th>Login PIN</th></tr>
              ${ids.map(id => {
                const cObj = coachObj(id) || { id, name: id, pin: '1234' };
                const tName = teamOf(id, L.season);
                const ov = overallsOf(id, L.season);
                const curDiv = S.divisions?.groups?.Catholics?.includes(id) ? 'Catholics' : 'Convicts';
                return `<tr>
                  <td><b>${esc(cObj.name)}</b></td>
                  <td><input type="text" data-pre-team="${esc(id)}" value="${esc(tName)}" style="width:155px"></td>
                  <td>
                    <select data-pre-div="${esc(id)}">
                      <option value="Catholics" ${curDiv === 'Catholics' ? 'selected' : ''}>Catholics</option>
                      <option value="Convicts" ${curDiv === 'Convicts' ? 'selected' : ''}>Convicts</option>
                    </select>
                  </td>
                  <td class="num"><input type="number" class="score" data-pre-ovr="${esc(id)}" value="${ov.ovr}" style="width:64px"></td>
                  <td class="num"><input type="number" class="score" data-pre-off="${esc(id)}" value="${ov.off}" style="width:64px"></td>
                  <td class="num"><input type="number" class="score" data-pre-def="${esc(id)}" value="${ov.def}" style="width:64px"></td>
                  <td><input type="text" data-pre-pin="${esc(id)}" value="${esc(cObj.pin || '1234')}" style="width:74px"></td>
                </tr>`;
              }).join('')}
            </table>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <h3 style="margin-top:0">➕ Add New Coach to League</h3>
            <div class="row">
              <input type="text" id="newCoachName" placeholder="Coach Name (e.g. Doug)" style="flex:1">
              <input type="text" id="newCoachTeam" placeholder="MAC Team (e.g. Toledo)" style="flex:1">
              <select id="newCoachDiv"><option value="Catholics">Catholics</option><option value="Convicts">Convicts</option></select>
              <button class="ghost" data-action="add-new-coach">+ Add Coach</button>
            </div>
          </div>
          <div class="card">
            <h3 style="margin-top:0">🚀 Start Next Season (Season ${D.seasons.at(-1).season + 1} Preseason)</h3>
            <p class="muted">Creates Season ${D.seasons.at(-1).season + 1} at Week 0 (Preseason), resets the Odds Line Chart, and gives every coach a fresh 1,000 Credits wager bankroll.</p>
            <button class="gold-btn" data-action="start-new-season">Start Season ${D.seasons.at(-1).season + 1} (Week 0 Preseason) →</button>
          </div>
        </div>
      </div>`;
    }

    return `<div class="row-between">
        <div>
          <h2 style="margin:0">🔒 Commissioner Control Center (Chunky Only)</h2>
          <p class="muted">Isolated to your Commissioner account. Manage weekly advancements, conference championship week, end-of-season awards, and preseason overalls.</p>
        </div>
        <div class="row">
          <button class="ghost ${UI.commishMode === 'weekly' ? 'active-pill' : ''}" data-commish-mode="weekly">1. Weekly Advance (Wk 0–13)</button>
          <button class="ghost ${UI.commishMode === 'champweek' ? 'active-pill' : ''}" data-commish-mode="champweek">2. Conf Champ Week</button>
          <button class="ghost ${UI.commishMode === 'endseason' ? 'active-pill' : ''}" data-commish-mode="endseason">3. End of Season</button>
          <button class="ghost ${UI.commishMode === 'preseason' ? 'active-pill' : ''}" data-commish-mode="preseason">4. Preseason &amp; Overalls</button>
        </div>
      </div>
      <div style="margin-top:14px">${modeBody}</div>
      <div class="card" style="margin-top:16px">
        <div class="row-between">
          <div>
            <h3 style="margin:0">📦 Export Updated JSON Data Files for GitHub Pages</h3>
            <p class="muted">Download any modified JSON file to commit to your GitHub repository.</p>
          </div>
          <div class="row">
            <button class="ghost" data-dl-json="league">⬇ league.json</button>
            <button class="ghost" data-dl-json="coaches">⬇ coaches.json</button>
            <button class="ghost" data-dl-json="seasons">⬇ seasons.json</button>
            <button class="ghost" data-dl-json="games">⬇ games.json</button>
          </div>
        </div>
      </div>`;
  }
};

const pc = x => x >= 0.995 ? '>99%' : x < 0.005 ? '<1%' : Math.round(x * 100) + '%';
const barCell = x => `<td class="num"><div class="bar"><span style="width:${Math.round(x * 100)}%"></span></div>${pc(x)}</td>`;

/* ---------- Interactive HTML5 Canvas Line Chart for Week-to-Week Odds ---------- */
function drawOddsHistoryChart() {
  const canvas = $('#oddsHistoryCanvas');
  const legendBox = $('#oddsChartLegend');
  if (!canvas || !legendBox) return;

  const sn = D.league.season;
  const S = season(sn);
  const data = computeWeeklyOddsSeries(sn);
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(320, rect.width - 24);
  const H = Math.max(240, rect.height - 24);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (data.resetForNextSeason || !data.labels.length) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Season complete — Week-to-Week Odds Line Chart has been reset for the next season.', W / 2, H / 2);
    legendBox.innerHTML = '';
    return;
  }

  let activeIds = Object.keys(S.teams);
  if (UI.chartFilter === 'Catholics' && S.divisions?.groups?.Catholics) {
    activeIds = S.divisions.groups.Catholics;
  } else if (UI.chartFilter === 'Convicts' && S.divisions?.groups?.Convicts) {
    activeIds = S.divisions.groups.Convicts;
  } else if (UI.chartFilter === 'top6') {
    activeIds = activeIds.slice().sort((a, b) => (data.series[b]?.at(-1) || 0) - (data.series[a]?.at(-1) || 0)).slice(0, 6);
  }

  const padL = 44, padR = 24, padT = 18, padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let maxVal = 35;
  activeIds.forEach(id => {
    (data.series[id] || []).forEach(v => { if (v > maxVal) maxVal = v; });
  });
  maxVal = Math.min(100, Math.ceil(maxVal / 10) * 10 + 5);

  /* Gridlines */
  ctx.strokeStyle = '#242838';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#9ca3af';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const val = Math.round((maxVal / steps) * i);
    const y = padT + plotH - (val / maxVal) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(val + '%', padL - 8, y + 4);
  }

  /* X-axis week labels */
  const nPts = data.labels.length;
  ctx.textAlign = 'center';
  data.labels.forEach((lb, i) => {
    const x = padL + (nPts === 1 ? plotW / 2 : (i / (nPts - 1)) * plotW);
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(lb, x, H - 10);
  });

  /* Distinct Coach Colors based on Team Primary Colors */
  const paletteFallback = ['#ef4444', '#fbbf24', '#38bdf8', '#4ade80', '#c084fc', '#f472b6', '#fb923c', '#2dd4bf', '#a3e635', '#60a5fa', '#e879f9', '#f87171'];
  const legendItems = [];

  activeIds.forEach((id, idx) => {
    const pts = data.series[id] || [];
    const tName = teamOf(id, sn);
    const color = teamMeta(tName).primary || paletteFallback[idx % paletteFallback.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = padL + (nPts === 1 ? plotW / 2 : (i / (nPts - 1)) * plotW);
      const y = padT + plotH - (v / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    pts.forEach((v, i) => {
      const x = padL + (nPts === 1 ? plotW / 2 : (i / (nPts - 1)) * plotW);
      const y = padT + plotH - (v / maxVal) * plotH;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    const latest = pts.at(-1) ?? 0;
    const prev = pts.length >= 2 ? pts[pts.length - 2] : latest;
    const delta = +(latest - prev).toFixed(1);
    legendItems.push(`<span class="team-badge" style="--tc-border:${esc(color)};--tc-bg:rgba(255,255,255,0.04);--tc-text:#f8fafc;--tc-dot:${esc(color)}"><span class="team-dot"></span><b>${esc(nameOf(id))}</b> (${esc(tName)}): <b>${latest.toFixed(1)}%</b> <span class="${delta > 0 ? 'up' : delta < 0 ? 'down' : 'muted'}">(${delta > 0 ? '+' : ''}${delta}%)</span></span>`);
  });

  legendBox.innerHTML = legendItems.join(' ');
}

/* ---------- Header & Auth Modal Rendering ---------- */
function renderHeaderAndNav() {
  const L = D.league;
  document.title = L.name || 'OEC CFB League Hub';
  $('#leagueName').textContent = L.name || 'OEC CFB League Hub';
  $('#leagueTag').textContent = L.tagline || 'Mid-American Conference (MAC) User Dynasty';
  $('#hdrSeasonVal').textContent = 'SEASON ' + L.season;
  $('#hdrWeekVal').textContent = WK(L.week).toUpperCase();
  $('#hdrPhaseVal').textContent = (L.phase || 'MAC Regular Season').toUpperCase();

  /* Render Auth Pill */
  const u = currentUserObj();
  const commish = isCommissioner();
  const authEl = $('#authArea');
  if (authEl) {
    if (u) {
      const wb = coachWagerSummary(u.id, L.season);
      authEl.innerHTML = `
        <div class="user-pill">
          <span class="role-tag ${commish ? '' : 'coach'}">${commish ? '👑 Commissioner &amp; Coach' : '🏈 Coach Account'}</span>
          <b>${esc(u.name)}</b>
          <span class="muted">(${esc(teamOf(u.id, L.season))})</span>
          <span style="color:var(--gold-bright);font-weight:800">· ${wb.balance} CR</span>
        </div>
        ${commish ? `<button class="gold-btn" data-action="open-commish-advance" style="padding:6px 11px;font-size:12px">⚡ Advance / Scores</button>` : ''}
        <button class="ghost" data-action="open-login-modal" style="padding:6px 11px;font-size:12px">Switch Coach / Login</button>
      `;
    } else {
      authEl.innerHTML = `
        <span class="muted" style="font-size:12px">Viewing as Guest</span>
        <button class="gold-btn" data-action="open-login-modal" style="padding:6px 12px;font-size:12px">🔑 Coach / Commissioner Login</button>
      `;
    }
  }
}

function openLoginModal() {
  const cur = currentUserObj();
  const html = `
    <div class="row-between">
      <h2 style="margin:0">🔑 Coach &amp; Commissioner Account Login</h2>
      <button class="ghost" data-action="close-modal">✕</button>
    </div>
    <p class="muted" style="margin-top:6px">Log in with your coach account to place weekly wagers (1,000 Credits/Season), vote on Game of the Week, and vote on Season Awards. Commissioner controls are strictly isolated to <b>Chunky</b>.</p>

    <div class="card red-accent" style="margin-top:12px">
      <label style="margin-top:0">Select Coach Account</label>
      <select id="loginCoachSel" style="width:100%">
        ${D.coaches.map(c => `<option value="${esc(c.id)}" ${UI.user === c.id ? 'selected' : ''}>${esc(c.name)} — ${esc(teamOf(c.id, D.league.season) || 'Coach')} ${c.id === 'chunky' ? '(Commissioner + Coach)' : '(Coach Only)'}</option>`).join('')}
      </select>
      <label>Coach PIN (Default PIN pre-filled for instant preview)</label>
      <input type="password" id="loginPinInput" value="${esc((cur || D.coaches[0]).pin || '0000')}" style="width:100%">
      <div class="row-between" style="margin-top:12px">
        <button class="ghost" data-action="logout-user">Log Out (Guest View)</button>
        <button class="gold-btn" data-action="confirm-login">Sign In to Account →</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:0">
      <h3 style="margin-top:0">⚡ 1-Click Account Switcher (Test Role Isolation)</h3>
      <p class="muted" style="margin-bottom:8px">Click any coach below to immediately test how the hub isolates Commissioner tools exclusively to <b>Chunky</b> while giving every coach their own 1,000-credit sportsbook &amp; voting account:</p>
      <div class="row">
        ${D.coaches.map(c => `<button class="${UI.user === c.id ? 'gold-btn' : 'ghost'}" data-quick-login="${esc(c.id)}" style="font-size:12px;padding:6px 10px">${c.id === 'chunky' ? '👑 ' : ''}${esc(c.name)} (${esc(teamOf(c.id, D.league.season))})</button>`).join('')}
      </div>
    </div>
  `;
  openModal(html);
}

/* ---------- Main Router ---------- */
function route() {
  renderHeaderAndNav();
  const [page, ...rest] = (location.hash.slice(1) || 'home').split('/');
  const active = page === 'coach' ? 'coaches' : page;

  const navItems = [...BASE_NAV];
  if (isCommissioner()) {
    navItems.push(['commissioner', '🔒 Commissioner']);
  }

  $('#nav').innerHTML = `<div class="nav-inner">${navItems.map(([k, label]) =>
    `<a href="#${k}" class="${k === active ? 'on' : ''} ${k === 'commissioner' ? 'commish-tab' : ''}">${label}</a>`
  ).join('')}</div>`;

  const viewFn = PAGES[page] || PAGES.home;
  $('#view').innerHTML = viewFn(rest.join('/'));

  if (page === 'odds') {
    setTimeout(drawOddsHistoryChart, 20);
  }
}

/* ---------- Download JSON Helper for GitHub Repo ---------- */
function downloadJsonFile(name) {
  const payload = D[name];
  if (!payload) return;
  const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast(`Downloaded ${name}.json — ready to upload to GitHub!`);
}

/* ---------- Global Event Delegation ---------- */
document.addEventListener('click', e => {
  const btn = e.target.closest('button, th.sortable, [data-action]');
  if (!btn) return;

  /* Modal & Auth Actions */
  if (btn.dataset.action === 'open-login-modal') { openLoginModal(); return; }
  if (btn.dataset.action === 'close-modal') { closeModal(); return; }
  if (btn.dataset.action === 'logout-user') {
    UI.user = '';
    saveLocalState();
    closeModal();
    showToast('Logged out — viewing in public read-only mode.');
    route();
    return;
  }
  if (btn.dataset.action === 'confirm-login') {
    const cid = $('#loginCoachSel')?.value;
    const pin = $('#loginPinInput')?.value;
    const c = coachObj(cid);
    if (c && (!c.pin || pin === c.pin || pin === '0000')) {
      UI.user = cid;
      saveLocalState();
      closeModal();
      showToast(`Logged in as ${c.name}${c.id === 'chunky' ? ' (Commissioner & Coach)' : ' (Coach)'}!`);
      route();
    } else {
      showToast('Invalid PIN — use the quick switcher below or default PIN.');
    }
    return;
  }
  if (btn.dataset.quickLogin) {
    UI.user = btn.dataset.quickLogin;
    saveLocalState();
    closeModal();
    const c = coachObj(UI.user);
    showToast(`Switched account to ${c ? c.name : UI.user}${UI.user === 'chunky' ? ' (Commissioner & Coach)' : ' (Coach — Commissioner tools isolated)'}!`);
    if (UI.user !== 'chunky' && location.hash.startsWith('#commissioner')) {
      location.hash = '#home';
    } else {
      route();
    }
    return;
  }
  if (btn.dataset.action === 'open-commish-advance') {
    if (!isCommissioner()) { showToast('Commissioner access only.'); return; }
    UI.commishMode = 'weekly';
    location.hash = '#commissioner';
    route();
    return;
  }

  /* GOTW Voting */
  if (btn.dataset.gotwVote) {
    castGotwVote(D.league.season, +btn.dataset.gotwWk, btn.dataset.gotwVote);
    return;
  }

  /* Standings Sorting & Mode */
  if (btn.dataset.standingsMode) {
    UI.standingsMode = btn.dataset.standingsMode;
    route();
    return;
  }
  if (btn.dataset.sortStandings) {
    const col = btn.dataset.sortStandings;
    if (UI.standingsSortCol === col) {
      UI.standingsSortDir = UI.standingsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      UI.standingsSortCol = col;
      UI.standingsSortDir = (col === 'place' || col === 'coach' || col === 'l' || col === 'pa') ? 'asc' : 'desc';
    }
    route();
    return;
  }

  /* Power Rankings Sorting */
  if (btn.dataset.rankSort) {
    UI.rankingsSortBy = btn.dataset.rankSort;
    route();
    return;
  }

  /* History Sorting */
  if (btn.dataset.histSort) {
    const col = btn.dataset.histSort;
    if (UI.historySortCol === col) {
      UI.historySortDir = UI.historySortDir === 'desc' ? 'asc' : 'desc';
    } else {
      UI.historySortCol = col;
      UI.historySortDir = 'desc';
    }
    route();
    return;
  }

  /* Odds & Chart Controls */
  if (btn.dataset.oddsMode) {
    UI.oddsMode = btn.dataset.oddsMode;
    route();
    return;
  }
  if (btn.dataset.chartFilter) {
    UI.chartFilter = btn.dataset.chartFilter;
    route();
    return;
  }

  /* Sportsbook Bet Slip Selection */
  if (btn.dataset.betGame) {
    if (!UI.user) {
      showToast('Please log in with your Coach account to place a wager.');
      openLoginModal();
      return;
    }
    UI.betSlip = {
      gameKey: btn.dataset.betGame,
      season: D.league.season,
      week: +btn.dataset.betWk,
      away: btn.dataset.betAway,
      home: btn.dataset.betHome,
      market: btn.dataset.betMkt,
      pick: btn.dataset.betPick,
      line: +btn.dataset.betLine,
      odds: +btn.dataset.betOdds,
      pickLabel: btn.dataset.betLabel,
      stake: 100
    };
    route();
    return;
  }
  if (btn.dataset.action === 'clear-betslip') {
    UI.betSlip = null;
    route();
    return;
  }
  if (btn.dataset.quickStake && UI.betSlip) {
    UI.betSlip.stake = +btn.dataset.quickStake;
    route();
    return;
  }
  if (btn.dataset.action === 'submit-wager' && UI.betSlip) {
    const bs = UI.betSlip;
    const summary = coachWagerSummary(UI.user, bs.season);
    const stakeVal = Math.round(Number($('#betStakeInput')?.value || bs.stake));
    if (stakeVal <= 0) { showToast('Enter a valid wager amount greater than 0 CR.'); return; }
    if (stakeVal > summary.balance) { showToast(`Insufficient credits! You have ${summary.balance} CR available.`); return; }
    const calc = calcPayoutFromAmerican(stakeVal, bs.odds);
    const W = ensureWagers();
    W.slips.push({
      id: 'w_' + Date.now(),
      season: bs.season,
      week: bs.week,
      coach: UI.user,
      gameKey: bs.gameKey,
      away: bs.away,
      home: bs.home,
      market: bs.market,
      pick: bs.pick,
      line: bs.line,
      pickLabel: bs.pickLabel,
      odds: bs.odds,
      stake: stakeVal,
      status: 'OPEN',
      payout: calc.payout,
      net: 0
    });
    UI.betSlip = null;
    saveLocalState();
    showToast(`Wager placed: ${stakeVal} CR on ${bs.pickLabel}!`);
    route();
    return;
  }

  /* Season Awards Voting & Holy Sh*t Moments */
  if (btn.dataset.action === 'toggle-awards-open') {
    if (!isCommissioner()) return;
    D.league.awardsVotingOpen = !D.league.awardsVotingOpen;
    saveLocalState();
    showToast(D.league.awardsVotingOpen ? 'Season Awards Ballot is now OPEN for all coaches!' : 'Season Awards Ballot locked.');
    route();
    return;
  }
  if (btn.dataset.awardCat !== undefined && btn.dataset.awardIdx !== undefined) {
    if (!UI.user) { showToast('Log in as a coach to vote on Season Awards.'); openLoginModal(); return; }
    const S = season(D.league.season);
    S.awardVotes ??= {};
    S.awardVotes[UI.user] ??= {};
    S.awardVotes[UI.user][btn.dataset.awardCat] = +btn.dataset.awardIdx;
    saveLocalState();
    showToast(`Recorded your vote for ${btn.dataset.awardCat.toUpperCase()}!`);
    route();
    return;
  }
  if (btn.dataset.action === 'save-holy-moment') {
    if (!UI.user) { showToast('Log in as a coach to submit a moment.'); openLoginModal(); return; }
    const txt = ($('#holyMomentInput')?.value || '').trim();
    if (!txt) { showToast('Type in your moment before saving.'); return; }
    const S = season(D.league.season);
    S.awardVotes ??= {};
    S.awardVotes[UI.user] ??= {};
    S.awardVotes[UI.user].moment = txt;
    if (!S.moments.includes(txt)) S.moments.push(`${nameOf(UI.user)}: ${txt}`);
    saveLocalState();
    showToast('Saved your "Holy Sh*t" Moment to the Season Ballot!');
    route();
    return;
  }

  /* Commissioner Suite Actions */
  if (btn.dataset.commishMode) {
    UI.commishMode = btn.dataset.commishMode;
    route();
    return;
  }
  if (btn.dataset.deskNeed) {
    UI.commishDeskNeed = btn.dataset.deskNeed;
    route();
    return;
  }
  if (btn.dataset.commishDelgame !== undefined) {
    const idx = +btn.dataset.commishDelgame;
    D.games.splice(idx, 1);
    invalidateModel();
    saveLocalState();
    showToast('Removed game from schedule.');
    route();
    return;
  }
  if (btn.dataset.action === 'commish-add-game') {
    const away = $('#addGameAway')?.value;
    const home = $('#addGameHome')?.value;
    if (!away || !home || away === home) { showToast('Pick two distinct coaches.'); return; }
    D.games.push({ season: D.league.season, week: D.league.week, away, home, awayScore: null, homeScore: null, forfeit: null });
    invalidateModel();
    saveLocalState();
    showToast(`Added ${nameOf(away)} @ ${nameOf(home)} to ${WK(D.league.week)}!`);
    route();
    return;
  }
  if (btn.dataset.action === 'commish-save-scores') {
    invalidateModel();
    saveLocalState();
    showToast('Scores saved! Odds and standings updated.');
    route();
    return;
  }
  if (btn.dataset.action === 'commish-advance-week') {
    const L = D.league;
    if (UI.commishDeskNeed === 'yes') {
      const note = ($('#commishDeskText')?.value || '').trim();
      L.announcement = note;
    } else {
      L.announcement = '';
    }
    const settled = settleWeekWagers(L.season, L.week);
    if (L.week < CHAMP_WEEK) {
      L.week += 1;
      if (L.week === CHAMP_WEEK) {
        L.phase = 'Conference Championship Week';
        L.awardsVotingOpen = true;
      } else {
        L.phase = 'Regular Season';
      }
    }
    invalidateModel();
    saveLocalState();
    showToast(`Advanced to ${WK(L.week)}! Settled ${settled} wager(s), updated future odds & storylines.`);
    location.hash = '#home';
    route();
    return;
  }
  if (btn.dataset.action === 'save-nominees-only' || btn.dataset.action === 'advance-to-champ-week') {
    const L = D.league;
    const S = season(L.season);
    S.awardNominees ??= {};
    document.querySelectorAll('[data-nom-cat]').forEach(el => {
      const cat = el.dataset.nomCat;
      const idx = +el.dataset.nomIdx;
      const fld = el.dataset.nomField;
      S.awardNominees[cat] ??= [{ name: '', coach: 'chunky' }, { name: '', coach: 'clay' }, { name: '', coach: 'skippa' }];
      S.awardNominees[cat][idx][fld] = el.value;
    });
    if (btn.dataset.action === 'advance-to-champ-week') {
      const away = $('#champAwaySel')?.value || 'chunky';
      const home = $('#champHomeSel')?.value || 'beech';
      let cg = D.games.find(g => g.season === L.season && g.week === CHAMP_WEEK);
      if (!cg) {
        D.games.push({ season: L.season, week: CHAMP_WEEK, away, home, awayScore: null, homeScore: null, forfeit: null });
      } else {
        cg.away = away; cg.home = home;
      }
      L.week = CHAMP_WEEK;
      L.phase = 'MAC Championship Week';
      L.awardsVotingOpen = true;
      invalidateModel();
      saveLocalState();
      showToast('Advanced to MAC Championship Week & opened Season Awards Voting!');
      location.hash = '#awards';
      route();
    } else {
      saveLocalState();
      showToast('Saved 3 Award Finalist options per category!');
    }
    return;
  }
  if (btn.dataset.action === 'finalize-end-of-season') {
    const L = D.league;
    const S = season(L.season);
    const away = $('#eosAway')?.value;
    const home = $('#eosHome')?.value;
    const awaySc = Number($('#eosAwayScore')?.value ?? 38);
    const homeSc = Number($('#eosHomeScore')?.value ?? 31);
    if (awaySc === homeSc) { showToast('Championship game cannot end in a tie.'); return; }
    let cg = D.games.find(g => g.season === L.season && g.week === CHAMP_WEEK);
    if (!cg) {
      cg = { season: L.season, week: CHAMP_WEEK, away, home, awayScore: awaySc, homeScore: homeSc, forfeit: null };
      D.games.push(cg);
    } else {
      cg.away = away; cg.home = home; cg.awayScore = awaySc; cg.homeScore = homeSc; cg.forfeit = null;
    }

    /* Tally Coach Award Votes to populate S.awards */
    const votes = S.awardVotes || {};
    const nom = S.awardNominees || {};
    ['mvp', 'opoy', 'dpoy', 'bestOff', 'bestDef', 'gameOfYear'].forEach(cat => {
      const opts = nom[cat] || [];
      if (!opts.length) return;
      const counts = [0, 0, 0];
      Object.values(votes).forEach(v => { if (v && typeof v[cat] === 'number') counts[v[cat]] = (counts[v[cat]] || 0) + 1; });
      const winIdx = counts.indexOf(Math.max(...counts));
      const winner = opts[winIdx] || opts[0];
      if (cat === 'gameOfYear') S.awards.gameOfYear = winner.name;
      else S.awards[cat] = { name: winner.name, coach: winner.coach };
    });

    L.awardsVotingOpen = false;
    L.phase = 'Offseason / Season Complete';
    invalidateModel();
    saveLocalState();
    showToast(`Season ${L.season} finalized! ${formatChampLine(L.season)} added to History.`);
    location.hash = '#history';
    route();
    return;
  }
  if (btn.dataset.action === 'save-preseason-overalls') {
    const L = D.league;
    const S = season(L.season);
    S.teamOveralls ??= {};
    const cath = [], conv = [];
    document.querySelectorAll('[data-pre-team]').forEach(el => {
      const id = el.dataset.preTeam;
      const tName = el.value.trim();
      if (tName) S.teams[id] = tName;
    });
    document.querySelectorAll('[data-pre-div]').forEach(el => {
      const id = el.dataset.preDiv;
      if (el.value === 'Catholics') cath.push(id);
      else conv.push(id);
    });
    if (S.divisions && S.divisions.groups) {
      S.divisions.groups.Catholics = cath;
      S.divisions.groups.Convicts = conv;
    }
    Object.keys(S.teams).forEach(id => {
      const ovr = Number(document.querySelector(`[data-pre-ovr="${id}"]`)?.value || 76);
      const off = Number(document.querySelector(`[data-pre-off="${id}"]`)?.value || 76);
      const df = Number(document.querySelector(`[data-pre-def="${id}"]`)?.value || 76);
      const pin = document.querySelector(`[data-pre-pin="${id}"]`)?.value || '1234';
      S.teamOveralls[id] = { team: S.teams[id], ovr, off, def: df };
      const cObj = coachObj(id);
      if (cObj) cObj.pin = pin;
    });
    invalidateModel();
    saveLocalState();
    showToast('Saved Preseason Teams, Divisions, Overalls (OVR/OFF/DEF) & PINs!');
    route();
    return;
  }
  if (btn.dataset.action === 'add-new-coach') {
    const nm = ($('#newCoachName')?.value || '').trim();
    const tm = ($('#newCoachTeam')?.value || '').trim();
    const dv = $('#newCoachDiv')?.value || 'Catholics';
    if (!nm || !tm) { showToast('Enter both coach name and MAC team name.'); return; }
    const cid = nm.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!coachObj(cid)) {
      D.coaches.push({ id: cid, name: nm, discord: '', role: 'coach', isCommissioner: false, pin: '1234' });
    }
    const S = season(D.league.season);
    S.teams[cid] = tm;
    S.teamOveralls ??= {};
    S.teamOveralls[cid] = { team: tm, ovr: 75, off: 75, def: 75 };
    if (S.divisions?.groups?.[dv] && !S.divisions.groups[dv].includes(cid)) {
      S.divisions.groups[dv].push(cid);
    }
    invalidateModel();
    saveLocalState();
    showToast(`Added Coach ${nm} (${tm}) to ${dv} Division!`);
    route();
    return;
  }
  if (btn.dataset.action === 'start-new-season') {
    const last = D.seasons.at(-1);
    const nextSn = last.season + 1;
    const nextYr = last.year + 1;
    D.seasons.push({
      season: nextSn,
      year: nextYr,
      teams: JSON.parse(JSON.stringify(last.teams)),
      teamOveralls: JSON.parse(JSON.stringify(last.teamOveralls || {})),
      divisions: last.divisions ? JSON.parse(JSON.stringify(last.divisions)) : null,
      awards: { mvp: null, opoy: null, dpoy: null, bestOff: null, bestDef: null, gameOfYear: '' },
      awardNominees: JSON.parse(JSON.stringify(last.awardNominees || {})),
      awardVotes: {},
      moments: [],
      powerRankings: { label: 'Preseason', ranks: [], previous: [] }
    });
    D.league.season = nextSn;
    D.league.week = 0;
    D.league.phase = 'Preseason / Week 0';
    D.league.awardsVotingOpen = false;
    D.league.wagers = { season: nextSn, startingCredits: 1000, slips: [] };
    invalidateModel();
    saveLocalState();
    showToast(`Launched Season ${nextSn} (${nextYr}) at Week 0! All coaches reset to 1,000 Credits & Odds Chart reset.`);
    route();
    return;
  }
  if (btn.dataset.dlJson) {
    downloadJsonFile(btn.dataset.dlJson);
    return;
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'betStakeInput' && UI.betSlip) {
    UI.betSlip.stake = Math.max(1, Number(t.value) || 0);
  }
  if (t.dataset.commishScore !== undefined) {
    const idx = +t.dataset.commishScore;
    const side = t.dataset.side;
    D.games[idx][side] = t.value === '' ? null : +t.value;
    invalidateModel();
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.commishFf !== undefined) {
    const idx = +t.dataset.commishFf;
    D.games[idx].forfeit = t.value || null;
    invalidateModel();
  }
  if (t.id === 'loginCoachSel') {
    const c = coachObj(t.value);
    const pinInput = $('#loginPinInput');
    if (c && pinInput) pinInput.value = c.pin || '1234';
  }
});

window.addEventListener('resize', () => {
  if ((location.hash || '').startsWith('#odds')) {
    drawOddsHistoryChart();
  }
});

/* ---------- Initialization ---------- */
async function loadData() {
  if (window.EMBEDDED_DB) {
    Object.assign(D, JSON.parse(JSON.stringify(window.EMBEDDED_DB)));
    return;
  }
  await Promise.all(FILES.map(async f => {
    const r = await fetch(f + '.json?v=' + Date.now());
    if (!r.ok) throw new Error('Could not load ' + f + '.json');
    D[f] = await r.json();
  }));
}

(async function init() {
  try {
    await loadData();
    loadLocalState();
    window.addEventListener('hashchange', route);
    route();
  } catch (e) {
    $('#view').innerHTML = `<div class="card red-accent"><b>Couldn't load league data.</b><p class="muted">${esc(e.message)}. Publish with GitHub Pages or use the self-contained preview.</p></div>`;
  }
})();
