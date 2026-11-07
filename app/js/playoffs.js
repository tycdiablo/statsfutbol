// Formatos de torneo: liga, grupos y playoffs.
// Los playoffs son eliminación directa. Si la cantidad de clasificados no es
// potencia de 2, los mejores pasan directo a la siguiente ronda (byes).
// Las rondas siguientes apuntan a los partidos anteriores (homeRef/awayRef)
// y se completan solas cuando se carga el resultado.
import * as store from './store.js';
import { uid } from './util.js';
import { roundRobin, standings, outcome, predOutcome } from './stats.js';

const LETTERS = 'ABCDEFGH';

export const roundLabel = (remaining) =>
  remaining === 2 ? 'Final'
    : remaining === 4 ? 'Semifinales'
      : remaining === 8 ? 'Cuartos de final'
        : remaining === 16 ? 'Octavos de final'
          : `Ronda de ${remaining}`;

export const isPow2 = (n) => n >= 2 && (n & (n - 1)) === 0;
export const nextPow2 = (n) => { let p = 2; while (p < n) p *= 2; return p; };

export function groupLetters(tour) {
  return [...new Set(Object.values(tour.groupOf || {}))].sort();
}

export const isWithdrawn = (tour, id) => !!tour.withdrawn?.[id];
export const activeTeams = (tour) => (tour.teamIds || []).filter((id) => !isWithdrawn(tour, id));

// ── Calendario ───────────────────────────────────────────
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
// Fecha de la fecha número `round` según el calendario del torneo
export function dateFor(tour, round) {
  if (!tour.startDate || !round) return '';
  return addDays(tour.startDate, (round - 1) * (tour.everyDays || 7));
}

// ── Fixture de la fase de liga / grupos ───────────────────
function fixtureMatch(tour, h, a, round, extra = {}) {
  const mine = tour.myTeamId && (h === tour.myTeamId || a === tour.myTeamId);
  return {
    status: 'scheduled', stage: 'league', tournamentId: tour.id, competition: tour.name, round,
    homeId: h, awayId: a, official: true, played: !!mine,
    myTeam: mine ? (h === tour.myTeamId ? 'home' : 'away') : '',
    date: dateFor(tour, +round), time: tour.defaultTime || '',
    result: { mode: 'exact', home: 0, away: 0, winner: '' },
    goals: 0, assists: 0, mvp: 'unknown', events: [], prediction: { mode: 'none' },
    ...extra,
  };
}

// Reparte los equipos en grupos en "serpentina" (1A 1B 1C 1D 1D 1C 1B 1A…)
export function assignGroups(teamIds, n) {
  const groupOf = {};
  teamIds.forEach((id, i) => {
    const row = Math.floor(i / n);
    const col = i % n;
    groupOf[id] = LETTERS[row % 2 === 0 ? col : n - 1 - col];
  });
  return groupOf;
}

export function generateTourFixture(tour) {
  const out = [];
  const ids = activeTeams(tour);
  if (tour.format === 'groups') {
    const groupOf = assignGroups(ids, tour.groups || 2);
    for (const g of [...new Set(Object.values(groupOf))].sort()) {
      const gids = ids.filter((id) => groupOf[id] === g);
      roundRobin(gids, tour.double).forEach((pairs, i) =>
        pairs.forEach(([h, a]) => out.push(fixtureMatch(tour, h, a, String(i + 1), { group: g }))));
    }
    store.upsert('tournaments', { id: tour.id, groupOf });
  } else {
    roundRobin(ids, tour.double).forEach((pairs, i) =>
      pairs.forEach(([h, a]) => out.push(fixtureMatch(tour, h, a, String(i + 1)))));
  }
  store.upsertMany('matches', out);
  return out.length;
}

export function hasStageFixture(tourId) {
  return store.list('matches').some((m) => m.tournamentId === tourId && (m.stage || 'league') !== 'playoff');
}

// ── Clasificados ──────────────────────────────────────────
export function stageMatches(tour, all) {
  return all.filter((m) => m.tournamentId === tour.id && (m.stage || 'league') !== 'playoff');
}

export function pendingStage(tour, all) {
  return stageMatches(tour, all).filter((m) => m.status === 'scheduled').length;
}

// Equipos que pasan a playoffs, por orden de cruce (1º de cada grupo primero)
export function playoffSeeds(tour0, all) {
  const tour = withGroups(tour0, all);
  if (tour.format === 'groups') {
    const letters = groupLetters(tour);
    const tables = Object.fromEntries(letters.map((g) => [g, standings(tour, all, { group: g }).filter((r) => !isWithdrawn(tour, r.teamId))]));
    const seeds = [];
    for (let p = 0; p < (tour.advance || 1); p++) {
      for (const g of letters) if (tables[g][p]) seeds.push(tables[g][p].teamId);
    }
    return seeds;
  }
  return standings(tour, all).filter((r) => !isWithdrawn(tour, r.teamId))
    .slice(0, tour.playoffSize || 4).map((r) => r.teamId);
}

// Cuadro de playoffs. seeds[0] juega contra el último, seeds[1] contra el penúltimo…
// Si hay menos equipos que el tamaño del cuadro, los primeros pasan directo.
// Devuelve rondas con partidos reales (los byes no generan partido).
export function bracketSkeleton(seeds, newId = () => uid()) {
  const n = seeds.length;
  const P = nextPow2(n);
  const slots = [...seeds, ...Array(P - n).fill(null)];
  const rounds = [];
  const r0 = [];
  let entries = [];
  for (let k = 0; k < P / 2; k++) {
    const a = slots[k], b = slots[P - 1 - k];
    if (a && b) {
      const m = { id: newId(), r: 0, k: r0.length, label: roundLabel(P), homeId: a, awayId: b, homeRef: '', awayRef: '' };
      r0.push(m);
      entries.push({ match: m.id });
    } else {
      entries.push({ team: a || b });
    }
  }
  rounds.push(r0);
  for (let r = 1; entries.length >= 2; r++) {
    const cur = [];
    const nxt = [];
    for (let k = 0; k < entries.length / 2; k++) {
      const x = entries[2 * k], y = entries[2 * k + 1];
      const m = {
        id: newId(), r, k: cur.length, label: roundLabel(P / 2 ** r),
        homeId: x.team || '', awayId: y.team || '', homeRef: x.match || '', awayRef: y.match || '',
      };
      cur.push(m);
      nxt.push({ match: m.id });
    }
    rounds.push(cur);
    entries = nxt;
  }
  return rounds;
}

export function createPlayoffs(tour) {
  const all = store.list('matches');
  if (all.some((m) => m.tournamentId === tour.id && m.stage === 'playoff')) return { error: 'Los playoffs ya están generados.' };
  if (pendingStage(tour, all)) return { error: 'Todavía hay partidos de la fase regular por jugarse.' };
  const seeds = playoffSeeds(tour, all);
  if (seeds.length < 2) return { error: 'Necesitás al menos 2 clasificados.' };
  const stageMax = Math.max(0, ...stageMatches(tour, all).map((m) => +m.round || 0));
  const rounds = bracketSkeleton(seeds);
  const ms = rounds.flat().map((x) => ({
    id: x.id, status: 'scheduled', stage: 'playoff', playoffRound: x.r, playoffIdx: x.k, playoffLabel: x.label,
    tournamentId: tour.id, competition: `${tour.name} · ${x.label}`, round: x.label,
    homeId: x.homeId, awayId: x.awayId, homeRef: x.homeRef, awayRef: x.awayRef,
    official: true, played: false, myTeam: '', date: dateFor(tour, stageMax + 1 + x.r), time: tour.defaultTime || '',
    result: { mode: 'exact', home: 0, away: 0, winner: '' }, goals: 0, assists: 0,
    mvp: 'unknown', events: [], prediction: { mode: 'none' },
  }));
  store.upsertMany('matches', ms);
  materialize(tour.id);
  return { count: ms.length, byes: nextPow2(seeds.length) - seeds.length };
}

// Ganador de un partido (por marcador o por “sé quién ganó”)
function winnerId(m) {
  const o = outcome(m);
  if (!o.known) return '';
  return o.winner === 'home' ? m.homeId : o.winner === 'away' ? m.awayId : '';
}

// Completa los equipos de las rondas siguientes y marca "mis" partidos
export function materialize(tourId) {
  const tour = store.find('tournaments', tourId);
  const po = store.list('matches').filter((m) => m.tournamentId === tourId && m.stage === 'playoff')
    .sort((a, b) => a.playoffRound - b.playoffRound);
  for (const m of po) {
    const patch = {};
    if (m.homeRef) { const src = store.find('matches', m.homeRef); const w = src && winnerId(src); if (w && w !== m.homeId) patch.homeId = w; }
    if (m.awayRef) { const src = store.find('matches', m.awayRef); const w = src && winnerId(src); if (w && w !== m.awayId) patch.awayId = w; }
    if (Object.keys(patch).length) store.upsert('matches', { id: m.id, ...patch });
  }
  for (const m0 of store.list('matches').filter((m) => m.tournamentId === tourId && m.stage === 'playoff')) {
    if (!m0.homeId || !m0.awayId) continue;
    const mine = tour?.myTeamId && (m0.homeId === tour.myTeamId || m0.awayId === tour.myTeamId);
    const want = mine ? { played: true, myTeam: m0.homeId === tour.myTeamId ? 'home' : 'away' } : { played: false, myTeam: '' };
    if (m0.played !== want.played || m0.myTeam !== want.myTeam) store.upsert('matches', { id: m0.id, ...want });
  }
}

// ── Simulación (Monte Carlo) ──────────────────────────────
function poisson(l) {
  const L = Math.exp(-l);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L && k < 15);
  return k - 1;
}

export function simulateTournament(tour0, all, { runs = 4000, usePredictions = true } = {}) {
  const tour = withGroups(tour0, all);
  const P = tour.points || { w: 3, d: 1, l: 0 };
  const base = standings(tour, all);
  const ids = tour.teamIds || [];
  const N = ids.length;
  if (N < 2) return null;
  const str = {};
  for (const r of base) {
    str[r.teamId] = {
      att: (r.gf + 2.6) / (r.sm + 2),
      def: (r.ga + 2.6) / (r.sm + 2),
      ppg: (r.base + 2.7) / (r.pj + 2),
    };
  }
  const S = (id) => str[id] || { att: 1.3, def: 1.3, ppg: 1.35 };
  const sample = (H, A) => {
    const f = Math.sqrt(H.ppg / A.ppg);
    return {
      hg: poisson(Math.max(0.15, ((H.att + A.def) / 2) * 1.08 * f)),
      ag: poisson(Math.max(0.15, ((A.att + H.def) / 2) * 0.95 / f)),
    };
  };

  const stage = stageMatches(tour, all);
  const pending = stage.filter((m) => m.status === 'scheduled' && m.homeId && m.awayId);
  const letters = tour.format === 'groups' ? groupLetters(tour) : null;
  const adv = tour.advance || 1;
  const hasPO = !!tour.playoff;
  const existingPO = all.filter((m) => m.tournamentId === tour.id && m.stage === 'playoff');
  const playoffN = letters ? letters.length * adv : (tour.playoffSize || 4);
  const roundsLabels = hasPO && playoffN >= 2 ? bracketSkeleton(Array(playoffN).fill('x')).map((r) => r[0].label) : [];
  const R = roundsLabels.length;

  const pos = Object.fromEntries(ids.map((id) => [id, new Array(N).fill(0)]));
  const ptsSum = Object.fromEntries(ids.map((id) => [id, 0]));
  const qual = Object.fromEntries(ids.map((id) => [id, 0]));
  const champ = Object.fromEntries(ids.map((id) => [id, 0]));
  const reach = Object.fromEntries(ids.map((id) => [id, new Array(R).fill(0)]));
  const cmp = (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || b.w - a.w || a.rnd - b.rnd;
  const active = (id) => !isWithdrawn(tour, id);

  for (let k = 0; k < runs; k++) {
    const tab = new Map(base.map((r) => [r.teamId, { teamId: r.teamId, pts: r.base, gf: r.gf, ga: r.ga, w: r.w, rnd: Math.random() }]));
    for (const m of pending) {
      const h = tab.get(m.homeId), a = tab.get(m.awayId);
      if (!h || !a) continue;
      const p = usePredictions ? predOutcome(m.prediction) : { known: false };
      let hg, ag, winner;
      const scored = !(p.known && !p.scoreKnown);
      if (p.known && p.scoreKnown) { hg = p.hg; ag = p.ag; }
      else if (p.known) winner = p.winner;
      else { const s = sample(S(m.homeId), S(m.awayId)); hg = s.hg; ag = s.ag; }
      if (scored) { h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg; winner = hg > ag ? 'home' : hg < ag ? 'away' : 'draw'; }
      if (winner === 'home') { h.pts += P.w; a.pts += P.l; h.w++; }
      else if (winner === 'away') { a.pts += P.w; h.pts += P.l; a.w++; }
      else { h.pts += P.d; a.pts += P.d; }
    }
    for (const h of tab.values()) h.pts += tour.adjust?.[h.teamId] || 0;

    let seeds = [];
    if (letters) {
      const tables = {};
      for (const g of letters) {
        const rows = [...tab.values()].filter((r) => tour.groupOf?.[r.teamId] === g).sort(cmp);
        tables[g] = rows;
        rows.forEach((r, i) => { pos[r.teamId][i]++; ptsSum[r.teamId] += r.pts; });
        if (hasPO) rows.filter((r) => active(r.teamId)).slice(0, adv).forEach((r) => { qual[r.teamId]++; });
      }
      for (let p = 0; p < adv; p++) for (const g of letters) {
        const cand = tables[g].filter((r) => active(r.teamId));
        if (cand[p]) seeds.push(cand[p].teamId);
      }
    } else {
      const rows = [...tab.values()].sort(cmp);
      rows.forEach((r, i) => { pos[r.teamId][i]++; ptsSum[r.teamId] += r.pts; });
      seeds = rows.filter((r) => active(r.teamId)).map((r) => r.teamId);
      const q = hasPO ? (tour.playoffSize || 4) : (tour.promo || 0);
      seeds.slice(0, q).forEach((id) => { qual[id]++; });
      if (hasPO) seeds = seeds.slice(0, tour.playoffSize || 4);
    }

    if (hasPO && R && seeds.length >= 2) {
      const rounds = existingPO.length
        ? groupByRound(existingPO)
        : bracketSkeleton(seeds).map((rd) => rd.map((x) => ({ id: x.id, r: x.r, homeId: x.homeId, awayId: x.awayId, homeRef: x.homeRef, awayRef: x.awayRef, status: 'scheduled', prediction: { mode: 'none' } })));
      const win = new Map();
      for (let r = 0; r < rounds.length; r++) {
        for (const m of rounds[r]) {
          const home = m.homeId || win.get(m.homeRef);
          const away = m.awayId || win.get(m.awayRef);
          if (!home || !away) continue;
          if (reach[home] && r < R) reach[home][r]++;
          if (reach[away] && r < R) reach[away][r]++;
          let w = null;
          if (m.status === 'finished') { const o = outcome(m); w = o.winner === 'home' ? home : o.winner === 'away' ? away : null; }
          if (!w && usePredictions) { const p = predOutcome(m.prediction); if (p.known) w = p.winner === 'home' ? home : p.winner === 'away' ? away : null; }
          if (!w) { const s = sample(S(home), S(away)); w = s.hg > s.ag ? home : s.hg < s.ag ? away : Math.random() < 0.5 ? home : away; }
          win.set(m.id, w);
        }
      }
      const final = rounds[rounds.length - 1]?.[0];
      const champId = final && win.get(final.id);
      if (champId) champ[champId]++;
    } else if (!hasPO && !letters) {
      if (seeds[0]) champ[seeds[0]]++;
    }
  }

  const rows = ids.map((id) => {
    const dist = pos[id].map((c) => c / runs);
    return {
      teamId: id,
      champ: champ[id] / runs,
      qualify: qual[id] / runs,
      reach: reach[id].map((c) => c / runs),
      dist,
      avgPos: dist.reduce((s, p, i) => s + p * (i + 1), 0),
      expPts: ptsSum[id] / runs,
    };
  }).sort((a, b) => b.champ - a.champ || b.qualify - a.qualify || a.avgPos - b.avgPos);

  return { runs, pending: pending.length, hasPO, groups: !!letters, rounds: roundsLabels, rows };
}

// Agrupa partidos de playoffs (reales) en rondas, con la misma forma que el cuadro simulado
function groupByRound(ms) {
  const max = Math.max(...ms.map((m) => m.playoffRound));
  const out = [];
  for (let r = 0; r <= max; r++) {
    out.push(ms.filter((m) => m.playoffRound === r).sort((a, b) => a.playoffIdx - b.playoffIdx)
      .map((m) => ({ id: m.id, r, homeId: m.homeId, awayId: m.awayId, homeRef: m.homeRef, awayRef: m.awayRef, status: m.status, prediction: m.prediction })));
  }
  return out;
}

// ── Vista de cuadro ──────────────────────────────────────
export function bracketRounds(tourId, all) {
  const po = all.filter((m) => m.tournamentId === tourId && m.stage === 'playoff');
  if (!po.length) return [];
  const max = Math.max(...po.map((m) => m.playoffRound));
  const out = [];
  for (let r = 0; r <= max; r++) {
    const ms = po.filter((m) => m.playoffRound === r).sort((a, b) => a.playoffIdx - b.playoffIdx);
    if (ms.length) out.push({ label: ms[0].playoffLabel, matches: ms });
  }
  return out;
}

export function championOf(tourId, all) {
  const rounds = bracketRounds(tourId, all);
  const final = rounds[rounds.length - 1]?.matches[0];
  if (!final || final.status !== 'finished') return '';
  return winnerId(final);
}

// Asignación de grupos: la guardada, o la que sale de los partidos (para torneos viejos)
export function withGroups(tour, all) {
  if (tour.format !== 'groups') return tour;
  if (Object.keys(tour.groupOf || {}).length) return tour;
  const own = all.filter((m) => m.tournamentId === tour.id && (m.stage || 'league') !== 'playoff');
  const groupOf = {};
  for (const m of own) if (m.group) { groupOf[m.homeId] = m.group; groupOf[m.awayId] = m.group; }
  if (!Object.keys(groupOf).length && own.length) {
    // sin letra: cada grupo es un conjunto de equipos que juegan entre sí
    const parent = {};
    const find = (x) => { if (parent[x] === undefined) parent[x] = x; return parent[x] === x ? x : (parent[x] = find(parent[x])); };
    for (const m of own) { const a = find(m.homeId), b = find(m.awayId); if (a !== b) parent[a] = b; }
    const roots = [];
    for (const id of tour.teamIds || []) {
      const r = find(id);
      if (!roots.includes(r)) roots.push(r);
    }
    for (const id of tour.teamIds || []) groupOf[id] = LETTERS[roots.indexOf(find(id))] || 'A';
  }
  return { ...tour, groupOf };
}
