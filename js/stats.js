import { isNum, byDateAsc, byDateDesc, todayISO } from './util.js';

export const STATUS = {
  scheduled: { label: 'Por jugarse', cls: 'st-sched' },
  finished: { label: 'Finalizado', cls: 'st-fin' },
  suspended: { label: 'Suspendido', cls: 'st-susp' },
};

export const POSITIONS = [
  'Arquero', 'Defensor central', 'Lateral derecho', 'Lateral izquierdo', 'Carrilero',
  'Mediocampista defensivo', 'Mediocampista central', 'Mediocampista ofensivo', 'Enganche',
  'Extremo derecho', 'Extremo izquierdo', 'Segundo delantero', 'Delantero centro',
];

export const EVENT_TYPES = {
  yellow: { label: 'Tarjeta amarilla', icon: '🟨' },
  red: { label: 'Tarjeta roja', icon: '🟥' },
  injury: { label: 'Lesión', icon: '🩹' },
  owngoal: { label: 'Gol en contra', icon: '🔄' },
  penscored: { label: 'Penal convertido', icon: '🎯' },
  penmissed: { label: 'Penal errado', icon: '❌' },
  pensaved: { label: 'Penal atajado', icon: '🧤' },
  freekick: { label: 'Gol de tiro libre', icon: '🌀' },
  header: { label: 'Gol de cabeza', icon: '🙆' },
  golazo: { label: 'Golazo', icon: '🚀' },
  post: { label: 'Tiro al palo', icon: '🥅' },
  cleansheet: { label: 'Valla invicta', icon: '🧱' },
  captain: { label: 'Fui capitán', icon: '©️' },
  subin: { label: 'Entré desde el banco', icon: '🔼' },
  subout: { label: 'Me reemplazaron', icon: '🔽' },
  other: { label: 'Otro', icon: '📝' },
};

export const STAT_LABELS = {
  goals: 'Goles', assists: 'Asistencias', ga: 'Goles + asist.', pj: 'Partidos jugados',
  mvps: 'MVP', minutes: 'Minutos', w: 'Victorias', starts: 'Titularidades',
};

export const isMine = (m) => m.played !== false;
export const myTeamId = (m) => (m.myTeam === 'home' ? m.homeId : m.myTeam === 'away' ? m.awayId : null);
export const rivalId = (m) => (m.myTeam === 'home' ? m.awayId : m.myTeam === 'away' ? m.homeId : null);

function fromScore(h, a, approx) {
  return { known: true, scoreKnown: true, hg: h, ag: a, winner: h > a ? 'home' : h < a ? 'away' : 'draw', approx };
}

export function outcome(m) {
  if (!m || m.status !== 'finished') return { known: false };
  const r = m.result || {};
  if ((r.mode === 'exact' || r.mode === 'approx') && isNum(r.home) && isNum(r.away)) return fromScore(r.home, r.away, r.mode === 'approx');
  if (r.mode === 'winner' && r.winner) return { known: true, scoreKnown: false, winner: r.winner };
  return { known: false };
}

export function predOutcome(p) {
  if (!p) return { known: false };
  if (p.mode === 'score' && isNum(p.home) && isNum(p.away)) return fromScore(p.home, p.away, false);
  if (p.mode === 'winner' && p.winner) return { known: true, scoreKnown: false, winner: p.winner };
  return { known: false };
}

export function myResult(m) {
  const o = outcome(m);
  if (!o.known || !m.myTeam || !isMine(m)) return null;
  if (o.winner === 'draw') return 'D';
  return o.winner === m.myTeam ? 'W' : 'L';
}

export const RES_LABEL = { W: 'G', D: 'E', L: 'P' };
export const RES_TEXT = { W: 'Victoria', D: 'Empate', L: 'Derrota' };

export function playedMatches(matches, f = {}) {
  return matches.filter((m) =>
    m.status === 'finished' && isMine(m) &&
    (!f.official || (f.official === 'official' ? m.official !== false : m.official === false)) &&
    (!f.year || (m.date || '').startsWith(f.year)) &&
    (!f.tournamentId || m.tournamentId === f.tournamentId) &&
    (!f.teamId || myTeamId(m) === f.teamId));
}

export function totals(matches, injuries = [], f = {}) {
  const ms = playedMatches(matches, f);
  const t = {
    pj: ms.length, minutes: 0, minutesApprox: false, goals: 0, assists: 0, owngoals: 0, yellows: 0, reds: 0,
    mvps: 0, injuries: 0, w: 0, d: 0, l: 0, starts: 0, subs: 0, ratingSum: 0, ratingN: 0, hattricks: 0,
    braces: 0, penScored: 0, penMissed: 0, penSaved: 0, cleanSheets: 0, withGoal: 0, captain: 0, noCards: 0,
    golazos: 0, headers: 0, freekicks: 0,
  };
  for (const m of ms) {
    const mins = +m.minutes || 0;
    t.minutes += mins;
    if (mins && !m.minutesExact) t.minutesApprox = true;
    const g = +m.goals || 0;
    t.goals += g;
    t.assists += +m.assists || 0;
    if (g >= 3) t.hattricks++;
    else if (g === 2) t.braces++;
    if (g > 0) t.withGoal++;
    if (m.mvp === 'yes') t.mvps++;
    if (m.starter === 'starter') t.starts++;
    if (m.starter === 'sub') t.subs++;
    if (+m.rating > 0) { t.ratingSum += +m.rating; t.ratingN++; }
    let cards = 0;
    for (const e of m.events || []) {
      switch (e.type) {
        case 'yellow': t.yellows++; cards++; break;
        case 'red': t.reds++; cards++; break;
        case 'owngoal': t.owngoals++; break;
        case 'injury': t.injuries++; break;
        case 'penscored': t.penScored++; break;
        case 'penmissed': t.penMissed++; break;
        case 'pensaved': t.penSaved++; break;
        case 'cleansheet': t.cleanSheets++; break;
        case 'captain': t.captain++; break;
        case 'golazo': t.golazos++; break;
        case 'header': t.headers++; break;
        case 'freekick': t.freekicks++; break;
      }
    }
    if (!cards) t.noCards++;
    const r = myResult(m);
    if (r === 'W') t.w++; else if (r === 'D') t.d++; else if (r === 'L') t.l++;
  }
  if (!f.tournamentId && !f.official && !f.teamId) {
    t.injuries += injuries.filter((i) => !f.year || (i.date || '').startsWith(f.year)).length;
  }
  t.ga = t.goals + t.assists;
  t.avgRating = t.ratingN ? t.ratingSum / t.ratingN : null;
  t.gpm = t.pj ? t.goals / t.pj : 0;
  t.apm = t.pj ? t.assists / t.pj : 0;
  t.minPerGoal = t.goals && t.minutes ? Math.round(t.minutes / t.goals) : null;
  t.minPerGA = t.ga && t.minutes ? Math.round(t.minutes / t.ga) : null;
  const dec = t.w + t.d + t.l;
  t.winRate = dec ? t.w / dec : null;
  return t;
}

export function years(matches) {
  const ys = new Set(matches.map((m) => (m.date || '').slice(0, 4)).filter(Boolean));
  ys.add(todayISO().slice(0, 4));
  return [...ys].sort().reverse();
}

export function byYear(matches, injuries, f = {}) {
  return years(playedMatches(matches, f))
    .map((y) => ({ year: y, t: totals(matches, injuries, { ...f, year: y }) }))
    .filter((r) => r.t.pj);
}

export function byTeam(matches, f = {}) {
  const ids = [...new Set(playedMatches(matches, f).map(myTeamId).filter(Boolean))];
  return ids.map((id) => ({ teamId: id, t: totals(matches, [], { ...f, teamId: id }) })).sort((a, b) => b.t.pj - a.t.pj);
}

export function monthly(matches, f = {}, months = 12) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, goals: 0, assists: 0, pj: 0 });
  }
  const idx = Object.fromEntries(out.map((o, i) => [o.key, i]));
  for (const m of playedMatches(matches, f)) {
    const k = (m.date || '').slice(0, 7);
    if (k in idx) { const o = out[idx[k]]; o.goals += +m.goals || 0; o.assists += +m.assists || 0; o.pj++; }
  }
  return out;
}

export function form(matches, n = 5) {
  return playedMatches(matches).filter((m) => myResult(m)).sort(byDateDesc).slice(0, n).reverse().map((m) => ({ r: myResult(m), m }));
}

export function streaks(matches) {
  const ms = playedMatches(matches).sort(byDateDesc);
  let unbeaten = 0, scoring = 0;
  for (const m of ms) { const r = myResult(m); if (r === null) continue; if (r === 'L') break; unbeaten++; }
  for (const m of ms) { if ((+m.goals || 0) > 0) scoring++; else break; }
  return { unbeaten, scoring };
}

export function predictionAccuracy(matches) {
  let total = 0, exact = 0, result = 0;
  for (const m of matches) {
    const o = outcome(m);
    const p = predOutcome(m.prediction);
    if (!o.known || !p.known) continue;
    total++;
    if (p.winner === o.winner) result++;
    if (p.scoreKnown && o.scoreKnown && p.hg === o.hg && p.ag === o.ag && !o.approx) exact++;
  }
  return { total, exact, result, pct: total ? result / total : null };
}

export function upcoming(matches, mineOnly = true) {
  const today = todayISO();
  return matches.filter((m) => m.status === 'scheduled' && (!mineOnly || isMine(m)) && (!m.date || m.date >= today)).sort(byDateAsc);
}

// ── Achievements ───────────────────────────────────────────
const ACH = [
  ['debut', 'Debut', 'Jugaste tu primer partido', '👟', 'pj', 1],
  ['pj10', 'Habitual', '10 partidos jugados', '📋', 'pj', 10],
  ['pj50', 'Experimentado', '50 partidos jugados', '🎖️', 'pj', 50],
  ['pj100', 'Centenario', '100 partidos jugados', '💯', 'pj', 100],
  ['g1', 'Primer gol', 'Convertiste tu primer gol', '⚽', 'goals', 1],
  ['g10', 'Goleador', '10 goles', '🔥', 'goals', 10],
  ['g25', 'Artillero', '25 goles', '💣', 'goals', 25],
  ['g50', 'Killer del área', '50 goles', '🦈', 'goals', 50],
  ['g100', 'Leyenda', '100 goles', '👑', 'goals', 100],
  ['a1', 'Asistidor', 'Primera asistencia', '🤝', 'assists', 1],
  ['a10', 'Socio ideal', '10 asistencias', '🎩', 'assists', 10],
  ['a25', 'Cerebro', '25 asistencias', '🧠', 'assists', 25],
  ['brace', 'Doblete', 'Dos goles en un partido', '✌️', (t) => t.braces + t.hattricks, 1],
  ['hat', 'Hat-trick', 'Tres goles en un partido', '🎩', 'hattricks', 1],
  ['mvp1', 'Figura', 'Primer MVP', '⭐', 'mvps', 1],
  ['mvp5', 'Crack', '5 veces MVP', '🌟', 'mvps', 5],
  ['mvp10', 'Distinto', '10 veces MVP', '💫', 'mvps', 10],
  ['ga50', 'Desequilibrante', '50 goles + asistencias', '⚡', 'ga', 50],
  ['w10', 'Ganador', '10 victorias', '🏆', 'w', 10],
  ['min1000', 'Hombre de hierro', '1.000 minutos jugados', '🦾', 'minutes', 1000],
  ['cap', 'Capitán', 'Usaste la cinta', '©️', 'captain', 1],
  ['fair', 'Fair play', '10 partidos sin tarjetas', '🕊️', 'noCards', 10],
  ['golazo', 'De otro planeta', 'Hiciste un golazo', '🚀', 'golazos', 1],
  ['wall', 'Muralla', '5 vallas invictas', '🧱', 'cleanSheets', 5],
];

export function achievements(t) {
  return ACH.map(([id, title, desc, icon, stat, target]) => {
    const v = typeof stat === 'function' ? stat(t) : t[stat] || 0;
    return { id, title, desc, icon, value: v, target, unlocked: v >= target, progress: Math.min(1, v / target) };
  });
}

// ── Tournaments ────────────────────────────────────────────
function row(id) { return { teamId: id, pj: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, sm: 0, form: [], partial: false, approx: false }; }

export function standings(tour, all, { projected = false } = {}) {
  const P = tour.points || { w: 3, d: 1, l: 0 };
  const rows = new Map();
  const ensure = (id) => { if (!id) return null; if (!rows.has(id)) rows.set(id, row(id)); return rows.get(id); };
  (tour.teamIds || []).forEach(ensure);
  const ms = all.filter((m) => m.tournamentId === tour.id).sort(byDateAsc);
  for (const m of ms) {
    let o = outcome(m);
    let pred = false;
    if (!o.known && projected && m.status === 'scheduled') { o = predOutcome(m.prediction); pred = o.known; }
    if (!o.known) continue;
    const h = ensure(m.homeId), a = ensure(m.awayId);
    if (!h || !a) continue;
    apply(h, o.winner === 'home' ? 'W' : o.winner === 'draw' ? 'D' : 'L', o, true, P, pred);
    apply(a, o.winner === 'away' ? 'W' : o.winner === 'draw' ? 'D' : 'L', o, false, P, pred);
  }
  return sortRows([...rows.values()]);
}

function apply(r, res, o, home, P, pred) {
  r.pj++;
  if (res === 'W') { r.w++; r.pts += P.w; } else if (res === 'D') { r.d++; r.pts += P.d; } else { r.l++; r.pts += P.l; }
  if (o.scoreKnown) { r.sm++; r.gf += home ? o.hg : o.ag; r.ga += home ? o.ag : o.hg; if (o.approx) r.approx = true; }
  else r.partial = true;
  r.form.push(pred ? res.toLowerCase() : res);
}

export function sortRows(rows) {
  return rows.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || b.w - a.w || String(a.teamId).localeCompare(String(b.teamId)));
}

function poisson(l) {
  const L = Math.exp(-l);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L && k < 15);
  return k - 1;
}

export function simulate(tour, all, { runs = 4000, usePredictions = true } = {}) {
  const P = tour.points || { w: 3, d: 1, l: 0 };
  const base = standings(tour, all);
  const ids = base.map((r) => r.teamId);
  const n = ids.length;
  if (n < 2) return null;
  const avg = 1.3;
  const str = {};
  for (const r of base) {
    const att = (r.gf + avg * 2) / (r.sm + 2);
    const def = (r.ga + avg * 2) / (r.sm + 2);
    const ppg = (r.pts + 1.35 * 2) / (r.pj + 2);
    str[r.teamId] = { att, def, ppg };
  }
  const pending = all.filter((m) => m.tournamentId === tour.id && m.status === 'scheduled' && ids.includes(m.homeId) && ids.includes(m.awayId));
  const posCount = Object.fromEntries(ids.map((id) => [id, new Array(n).fill(0)]));
  const ptsSum = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let k = 0; k < runs; k++) {
    const tab = Object.fromEntries(base.map((r) => [r.teamId, { teamId: r.teamId, pts: r.pts, gf: r.gf, ga: r.ga, w: r.w, rnd: Math.random() }]));
    for (const m of pending) {
      let hg, ag, winner;
      const p = usePredictions ? predOutcome(m.prediction) : { known: false };
      if (p.known && p.scoreKnown) { hg = p.hg; ag = p.ag; }
      else if (p.known) { winner = p.winner; }
      else {
        const H = str[m.homeId], A = str[m.awayId];
        const f = Math.sqrt(H.ppg / A.ppg);
        hg = poisson(Math.max(0.15, ((H.att + A.def) / 2) * 1.08 * f));
        ag = poisson(Math.max(0.15, ((A.att + H.def) / 2) * 0.95 / f));
      }
      if (!winner) winner = hg > ag ? 'home' : hg < ag ? 'away' : 'draw';
      const h = tab[m.homeId], a = tab[m.awayId];
      if (hg !== undefined) { h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg; }
      if (winner === 'home') { h.pts += P.w; a.pts += P.l; h.w++; }
      else if (winner === 'away') { a.pts += P.w; h.pts += P.l; a.w++; }
      else { h.pts += P.d; a.pts += P.d; }
    }
    const sorted = Object.values(tab).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || b.w - a.w || a.rnd - b.rnd);
    sorted.forEach((r, i) => { posCount[r.teamId][i]++; ptsSum[r.teamId] += r.pts; });
  }
  return {
    runs, pending: pending.length,
    rows: ids.map((id) => {
      const dist = posCount[id].map((c) => c / runs);
      return { teamId: id, champ: dist[0], dist, avgPos: dist.reduce((s, p, i) => s + p * (i + 1), 0), expPts: ptsSum[id] / runs };
    }).sort((a, b) => a.avgPos - b.avgPos),
  };
}

export function roundRobin(ids, double) {
  const t = [...ids];
  if (t.length % 2) t.push(null);
  const n = t.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a && b) pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    t.splice(1, 0, t.pop());
  }
  if (double) rounds.push(...rounds.map((p) => p.map(([a, b]) => [b, a])));
  return rounds;
}
