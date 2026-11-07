import * as store from '../store.js';
import { esc, fmtDate, byDateAsc, fmtNum } from '../util.js';
import { ic } from '../icons.js';
import { crest, empty, confirmDialog, toast, teamName } from '../ui.js';
import { standings, totals, outcome, predOutcome, isMine } from '../stats.js';
import { matchCard, resPill, statTile, progressBar, tourBadge } from '../components.js';
import { openTournamentForm, openMatchForm } from '../forms.js';
import { withGroups, generateTourFixture, createPlayoffs, bracketRounds, championOf, simulateTournament, groupLetters, pendingStage, playoffSeeds, hasStageFixture, isWithdrawn } from '../playoffs.js';
import { tourMini } from './home.js';
import { shareLink, tournamentPayload } from '../share.js';

export const ToursView = {
  title: 'Torneos',
  fab: { icon: 'plus', label: 'Torneo', run: () => newTour() },
  render() {
    const s = store.get();
    const tours = s.tournaments.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!tours.length) {
      return empty('trophy', 'Creá tu torneo', 'Armá un torneo personalizado: todos contra todos, grupos y playoffs, o liga y playoffs. Seguí la tabla, predecí y simulá cómo termina.', `<button class="btn primary" data-act="new">${ic('plus')} Crear torneo</button>`);
    }
    return `<div class="cards">${tours.map((t) => tourMini(t, s)).join('')}</div>
      <p class="hint center mt">Los partidos de un torneo también aparecen en Partidos. Los que juegues vos suman a tu Carrera.</p>`;
  },
  actions: { new: () => newTour() },
};

function newTour() {
  openTournamentForm({ onSaved: (t) => { location.hash = '#/torneo/' + t.id; } });
}

const TAB = {};
const ROUND = {};
const EXP = {};
const SIM = {};

const maxRoundOf = (ms) => Math.max(0, ...ms.filter((m) => (m.stage || 'league') !== 'playoff').map((m) => +m.round || 0));

// Una tabla por grupo, o una sola si es liga
function tablesFor(t0, all, opts = {}) {
  const t = withGroups(t0, all);
  if (t.format === 'groups') {
    return groupLetters(t).map((g) => ({ label: `Grupo ${g}`, rows: standings(t, all, { ...opts, group: g }) }));
  }
  return [{ label: null, rows: standings(t, all, opts) }];
}

export const TourDetailView = {
  title: 'Torneo',
  back: '#/torneos',
  render(id) {
    const s = store.get();
    const t = store.find('tournaments', id);
    if (!t) return empty('trophy', 'Torneo no encontrado', '', '<a class="btn ghost" href="#/torneos">Volver</a>');
    const tab = TAB[id] || 'table';
    const ms = s.matches.filter((m) => m.tournamentId === id);
    const stageMs = ms.filter((m) => (m.stage || 'league') !== 'playoff');
    const done = stageMs.filter((m) => m.status === 'finished').length;
    const tabs = [['table', 'Tabla', 'table'], ['fixture', 'Fixture', 'list']];
    if (t.playoff) tabs.push(['po', 'Playoffs', 'trophy']);
    tabs.push(['predict', 'Predecir', 'crystal'], ['sim', 'Simular', 'spark'], ['me', 'Mis stats', 'user']);
    const fmt = t.format === 'groups' ? `${(groupLetters(t) || []).length || t.groups} grupos` : 'Todos contra todos';
    const champ = t.playoff ? championOf(t.id, s.matches) : '';
    return `
      <section class="tour-head">
        ${tourBadge(t, 'big')}
        <div><h2>${esc(t.name)}</h2><span class="muted small">${[t.season, t.official === false ? 'No oficial' : 'Oficial', `${(t.teamIds || []).length} equipos`, fmt, t.double ? 'Ida y vuelta' : 'Solo ida', t.playoff ? 'Con playoffs' : ''].filter(Boolean).map(esc).join(' · ')}</span>
        ${progressBar(stageMs.length ? done / stageMs.length : 0, 'thin')}<span class="muted small">${done} de ${stageMs.length} partidos de la fase regular</span>
        ${champ ? `<span class="champ-tag">🏆 Campeón: ${esc(teamName(champ))}</span>` : ''}</div>
        <button class="icon-btn" data-act="edit" aria-label="Editar torneo">${ic('edit')}</button>
      </section>
      <nav class="tabs" role="tablist">${tabs.map(([k, l, i]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${ic(i)}<span>${l}</span></button>`).join('')}</nav>
      <div class="tab-body">${renderTab(tab, t, s, ms)}</div>
      ${t.notes ? `<section class="card mt"><h3 class="card-title">${ic('note')} Notas</h3><p class="prewrap">${esc(t.notes)}</p></section>` : ''}
      <div class="detail-actions"><button class="btn ghost" data-act="sharelink">${ic('cloud')} Compartir torneo</button><button class="btn ghost danger-txt" data-act="del">${ic('trash')} Borrar torneo</button></div>`;
  },
  actions: {
    tab: (el, ev, id) => { TAB[id] = el.dataset.tab; window.__rerender(); },
    round: (el, ev, id) => { ROUND[id] = el.dataset.r === 'last' ? null : +el.dataset.r; window.__rerender(); },
    expand: (el, ev, id) => {
      const set = (EXP[id] = EXP[id] || new Set());
      const tid = el.dataset.id;
      set.has(tid) ? set.delete(tid) : set.add(tid);
      window.__rerender();
    },
    edit: (el, ev, id) => openTournamentForm({ tour: store.find('tournaments', id) }),
    sharelink: (el, ev, id) => shareLink(tournamentPayload(store.find('tournaments', id))),
    addmatch: (el, ev, id) => {
      const t = store.find('tournaments', id);
      openMatchForm({ defaults: { tournamentId: id, official: t.official !== false, competition: t.name, played: false, myTeam: '' } });
    },
    gen: (el, ev, id) => {
      const t = store.find('tournaments', id);
      if (hasStageFixture(id)) { toast('Ya hay fixture generado. Para rehacerlo, borrá los partidos de la fase regular.', { ms: 3800 }); return; }
      if ((t.teamIds || []).filter((x) => !t.withdrawn?.[x]).length < 2) { toast('Agregá al menos 2 equipos activos al torneo'); return; }
      const n = generateTourFixture(t);
      toast(`Fixture generado: ${n} partidos`, { type: 'ok' });
    },
    genpo: (el, ev, id) => {
      const r = createPlayoffs(store.find('tournaments', id));
      if (r.error) { toast(r.error, { type: 'error', ms: 4000 }); return; }
      toast('Cuadro de playoffs generado', { type: 'ok' });
      TAB[id] = 'po';
      window.__rerender();
    },
    del: async (el, ev, id) => {
      const n = store.list('matches').filter((m) => m.tournamentId === id).length;
      const ok = await confirmDialog(n ? `Se borra el torneo. Sus ${n} partidos también se borran (los que ya cargaste con stats tuyas se mantienen).` : 'Se borra el torneo.', { ok: 'Borrar', danger: true });
      if (!ok) return;
      store.removeWhere('matches', (m) => m.tournamentId === id && !(isMine(m) && m.status === 'finished'));
      for (const m of store.list('matches').filter((x) => x.tournamentId === id)) store.upsert('matches', { id: m.id, tournamentId: '' });
      store.remove('tournaments', id);
      toast('Torneo borrado');
      location.replace('#/torneos');
    },
    pred: (el, ev, id) => {
      const m = store.find('matches', el.dataset.m);
      if (!m) return;
      const w = el.dataset.w;
      const cur = m.prediction || {};
      const next = cur.mode === 'winner' && cur.winner === w ? { mode: 'none' } : { mode: 'winner', winner: w };
      store.upsert('matches', { id: m.id, prediction: next });
    },
    predscore: (el) => {
      const m = store.find('matches', el.dataset.m);
      const p = m.prediction || {};
      const home = p.mode === 'score' ? p.home : 0, away = p.mode === 'score' ? p.away : 0;
      const side = el.dataset.side, d = +el.dataset.d;
      const nv = { home, away };
      nv[side] = Math.max(0, (nv[side] || 0) + d);
      store.upsert('matches', { id: m.id, prediction: { mode: 'score', ...nv } });
    },
    clearpred: (el, ev, id) => {
      for (const m of store.list('matches').filter((x) => x.tournamentId === id && x.status === 'scheduled' && x.prediction?.mode && x.prediction.mode !== 'none')) {
        store.upsert('matches', { id: m.id, prediction: { mode: 'none' } });
      }
      toast('Predicciones borradas');
    },
    sim: (el, ev, id) => {
      const t = store.find('tournaments', id);
      const usePred = SIM[id]?.usePred ?? true;
      SIM[id] = { usePred, res: simulateTournament(t, store.list('matches'), { runs: 4000, usePredictions: usePred }) };
      window.__rerender();
    },
    simpred: (el, ev, id) => {
      SIM[id] = { ...(SIM[id] || {}), usePred: !(SIM[id]?.usePred ?? true), res: null };
      window.__rerender();
    },
  },
};

function zoneCls(i, n, t) {
  if (t.promo && i < t.promo) return 'zone-up';
  if (t.releg && i >= n - t.releg) return 'zone-down';
  return '';
}

function breakdown(t, r) {
  const P = t.points || { w: 3, d: 1, l: 0 };
  const parts = [
    `${r.w} victoria${r.w === 1 ? '' : 's'} × ${P.w} = ${r.w * P.w}`,
    `${r.d} empate${r.d === 1 ? '' : 's'} × ${P.d} = ${r.d * P.d}`,
    `${r.l} derrota${r.l === 1 ? '' : 's'} × ${P.l} = ${r.l * P.l}`,
  ];
  if (r.adj) parts.push(`ajuste ${r.adj > 0 ? '+' : ''}${r.adj}`);
  return `${parts.join(' · ')} → <b>${r.pts} pts</b>`;
}

function table(t, rows, { prevRows = null, expanded = new Set() } = {}) {
  if (!rows.length) return '<p class="muted pad">Agregá equipos al torneo para ver la tabla.</p>';
  const prevPos = prevRows ? Object.fromEntries(prevRows.map((r, i) => [r.teamId, i])) : null;
  const showTrend = !!(t.showTrend && prevPos);
  return `<div class="table-wrap"><table class="standings">
    <thead><tr><th>#</th><th class="tl">Equipo</th><th>Pts</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th class="hide-xs">GF</th><th class="hide-xs">GC</th><th>DG</th><th class="hide-sm">Forma</th></tr></thead>
    <tbody>${rows.map((r, i) => {
      const tm = store.find('teams', r.teamId);
      const d = showTrend && r.teamId in prevPos ? prevPos[r.teamId] - i : 0;
      const open = expanded.has(r.teamId);
      return `<tr class="row-click ${r.teamId === t.myTeamId ? 'mine' : ''} ${zoneCls(i, rows.length, t)}" data-act="expand" data-id="${r.teamId}">
        <td class="pos"><span>${i + 1}</span>${d ? `<i class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</i>` : ''}</td>
        <td class="tl"><div class="team-cell">${crest(tm, 'xs')}<span>${esc(tm?.name || '?')}</span>${r.partial ? '<sup title="Hay partidos donde solo se sabe el ganador">*</sup>' : ''}${r.approx ? '<sup title="Incluye resultados aproximados">~</sup>' : ''}${r.adj ? `<sup class="adj-sup" title="Ajuste de puntos">${r.adj > 0 ? '+' : ''}${r.adj}</sup>` : ''}</div></td>
        <td class="pts">${r.pts}</td><td>${r.pj}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
        <td class="hide-xs">${r.gf}</td><td class="hide-xs">${r.ga}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td>
        <td class="hide-sm form-cell">${r.form.slice(-5).map((x) => resPill(x, 'xs')).join('')}</td>
      </tr>${open ? `<tr class="bd"><td colspan="11">${breakdown(t, r)}</td></tr>` : ''}`;
    }).join('')}</tbody></table></div>`;
}

function legend(t, rows) {
  const parts = [];
  if (t.promo && !t.playoff) parts.push('<span><i class="lg zone-up"></i>Clasifican</span>');
  if (t.releg) parts.push('<span><i class="lg zone-down"></i>Descienden</span>');
  if (rows.some((r) => r.partial)) parts.push('<span>* sin goles en algún partido</span>');
  if (rows.some((r) => r.approx)) parts.push('<span>~ incluye resultados aproximados</span>');
  if (t.myTeamId) parts.push('<span><i class="lg mine"></i>Mi equipo</span>');
  parts.push('<span>Tocá un equipo para ver cómo sumó los puntos</span>');
  return `<div class="legend">${parts.join('')}</div>`;
}

function renderTab(tab, t, s, ms) {
  const id = t.id;
  const all = s.matches;

  if (tab === 'table') {
    const maxR = maxRoundOf(ms);
    const sel = ROUND[id] ?? null;
    const eff = sel ?? maxR;
    const expanded = EXP[id] || new Set();
    const tables = tablesFor(t, all, { upTo: eff || null });
    const prevTables = eff > 1 ? tablesFor(t, all, { upTo: eff - 1 }) : null;
    const chips = maxR > 1 ? `<div class="filters round-chips">
      <button class="fchip ${sel == null ? 'on' : ''}" data-act="round" data-r="last">Última</button>
      ${Array.from({ length: maxR }, (_, i) => i + 1).map((r) => `<button class="fchip ${sel === r ? 'on' : ''}" data-act="round" data-r="${r}">Fecha ${r}</button>`).join('')}
    </div>` : '';
    const body = tables.map((tb, i) => `${tb.label ? `<h3 class="group-title">${tb.label}</h3>` : ''}
      ${table(t, tb.rows, { prevRows: prevTables ? prevTables[i].rows : null, expanded })}`).join('');
    const rowsAll = tables.flatMap((tb) => tb.rows);
    return `${chips}${body}${legend(t, rowsAll)}
      <p class="hint">${sel ? `Tabla tal como estaba después de la fecha ${sel}.` : 'Tabla actual.'} ${t.showTrend ? 'Las flechas muestran cómo cambió la posición respecto de la fecha anterior.' : 'Las flechas de cambio de posición se pueden activar en Editar torneo.'}
      Puntos: victoria ${t.points?.w ?? 3} · empate ${t.points?.d ?? 1} · derrota ${t.points?.l ?? 0}. Desempate por diferencia de gol y goles a favor.</p>`;
  }

  if (tab === 'fixture') {
    const fm = ms.filter((m) => (m.stage || 'league') !== 'playoff');
    if (!fm.length) {
      return empty('list', 'Sin partidos', 'Generá el fixture automático o cargá partidos a mano.', `<div class="row-actions center"><button class="btn primary" data-act="gen">${ic('spark')} Generar fixture</button><button class="btn ghost" data-act="addmatch">${ic('plus')} Partido</button></div>`);
    }
    const groups = new Map();
    for (const m of fm.slice().sort(byDateAsc)) {
      const k = `${m.group ? `Grupo ${m.group} · ` : ''}${m.round ? `Fecha ${m.round}` : 'Sin fecha asignada'}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    return `<button class="btn ghost block" data-act="addmatch">${ic('plus')} Agregar partido al torneo</button>
      ${[...groups.entries()].map(([k, list]) => `<h3 class="group-title">${esc(k)}</h3><div class="cards">${list.map((m) => matchCard(m, { compact: true })).join('')}</div>`).join('')}`;
  }

  if (tab === 'po') return playoffsTab(t, s);

  if (tab === 'predict') {
    const pend = ms.filter((m) => m.status === 'scheduled' && (m.stage || 'league') !== 'playoff').sort(byDateAsc);
    if (!pend.length) return empty('crystal', 'No quedan partidos por jugarse', 'Cuando haya partidos pendientes vas a poder predecir sus resultados.');
    const cur = tablesFor(t, all);
    const proj = tablesFor(t, all, { projected: true });
    const nPred = pend.filter((m) => predOutcome(m.prediction).known).length;
    return `<p class="hint">Elegí quién gana (L / E / V) o tocá los números para un resultado exacto. Abajo ves cómo quedaría la tabla.</p>
      <div class="pred-list">${pend.map((m) => predRow(m)).join('')}</div>
      <div class="sec-head"><h2>Tabla proyectada</h2><span class="muted small">${nPred}/${pend.length} predichos</span></div>
      ${proj.map((tb, i) => `${tb.label ? `<h3 class="group-title">${tb.label}</h3>` : ''}${table(t, tb.rows, { prevRows: cur[i].rows })}`).join('')}
      ${legend(t, proj.flatMap((tb) => tb.rows))}
      ${nPred ? `<button class="btn ghost sm mt" data-act="clearpred">${ic('x')} Borrar mis predicciones</button>` : ''}`;
  }

  if (tab === 'sim') {
    const st = SIM[id] || { usePred: true };
    const res = st.res;
    const pend = pendingStage(t, all);
    let out = `<div class="card sim-card"><p>Simulamos el resto del torneo${t.playoff ? ' y los playoffs' : ''} miles de veces, usando el rendimiento de cada equipo, para estimar cómo termina.</p>
      <label class="check-row"><input type="checkbox" data-act="simpred" ${st.usePred ? 'checked' : ''}><span>Respetar mis predicciones</span></label>
      <button class="btn primary block mt" data-act="sim">${ic('spark')} ${res ? 'Volver a simular' : 'Simular 4.000 veces'}</button>
      ${pend ? `<p class="hint">Faltan ${pend} partidos de la fase regular.</p>` : '<p class="hint">Ya no quedan partidos de la fase regular por jugarse.</p>'}</div>`;
    if (res) {
      const my = res.rows.find((r) => r.teamId === t.myTeamId);
      const reachHead = res.hasPO ? res.rounds : [];
      if (my) {
        out += `<div class="card my-sim"><h3 class="card-title">${crest(store.find('teams', my.teamId), 'sm')} Mi equipo</h3>
          <div class="tiles tiles-3 flat">${statTile(pct(my.champ), 'Campeón', { accent: true })}${statTile(pct(my.qualify), res.hasPO ? 'Clasifica' : 'Clasif. / asc.')}${statTile(res.groups ? '' + fmtNum(my.avgPos, 1) : Math.round(my.avgPos) + '°', res.groups ? 'Pos. en grupo' : 'Posición media')}</div>
          ${reachHead.length ? `<p class="muted small">${reachHead.map((lbl, i) => `${esc(lbl)}: <b>${pct(my.reach[i] || 0)}</b>`).join(' · ')}</p>` : ''}
          ${!res.hasPO && t.promo ? `<p class="muted small">Probabilidad de descender: <b>${pct(my.dist.slice(-(t.releg || 0) || my.dist.length).reduce((a, b) => a + b, 0))}</b></p>` : ''}
          <div class="dist">${my.dist.map((p, i) => `<div class="dist-col" title="${i + 1}°: ${pct(p)}"><i style="height:${Math.max(2, p * 100)}%"></i><span>${i + 1}</span></div>`).join('')}</div>
        </div>`;
      }
      out += `<div class="table-wrap"><table class="standings sim">
        <thead><tr><th class="tl">Equipo</th><th>Campeón</th><th>Clasif.</th>${reachHead.map((l) => `<th class="hide-xs">${esc(l.replace(' de final', '').replace('Cuartos', '¼').replace('Semifinales', 'Semis'))}</th>`).join('')}<th>${res.groups ? 'Pos. grupo' : 'Pos. media'}</th></tr></thead>
        <tbody>${res.rows.map((r) => {
          const tm = store.find('teams', r.teamId);
          return `<tr class="${r.teamId === t.myTeamId ? 'mine' : ''}"><td class="tl"><div class="team-cell">${crest(tm, 'xs')}<span>${esc(tm?.name || '?')}</span></div></td>
            <td><div class="pbar"><i style="width:${r.champ * 100}%"></i><span>${pct(r.champ)}</span></div></td>
            <td>${pct(r.qualify)}</td>${reachHead.map((_, i) => `<td class="hide-xs">${pct(r.reach[i] || 0)}</td>`).join('')}<td>${fmtNum(r.avgPos, 1)}</td></tr>`;
        }).join('')}</tbody>
      </table></div><p class="hint">${res.runs.toLocaleString('es-AR')} simulaciones. Es una estimación: ¡la pelota es redonda!</p>`;
    }
    return out;
  }

  if (tab === 'me') {
    const tt = totals(all, [], { tournamentId: id });
    if (!tt.pj) return empty('user', 'Todavía no jugaste en este torneo', 'Cuando cargues partidos finalizados donde jugaste, acá aparecen tus números.');
    const rows = tablesFor(t, all)[0].rows;
    return `<div class="tiles tiles-4">${statTile(tt.pj, 'PJ')}${statTile(tt.goals, 'Goles', { accent: true })}${statTile(tt.assists, 'Asist.')}${statTile(tt.mvps, 'MVP')}</div>
      <div class="tiles tiles-4 mt">${statTile((tt.minutesApprox ? '~' : '') + fmtNum(tt.minutes), 'Minutos')}${statTile(`${tt.w}-${tt.d}-${tt.l}`, 'G-E-P')}${statTile(tt.yellows, 'Amarillas')}${statTile(tt.reds, 'Rojas')}</div>
      <div class="kv card mt">
        <div><span>Promedio de gol</span><b>${fmtNum(tt.gpm, 2)} por partido</b></div>
        ${tt.minPerGoal ? `<div><span>Minutos por gol</span><b>${tt.minPerGoal}'</b></div>` : ''}
        ${tt.avgRating ? `<div><span>Nota promedio</span><b>${fmtNum(tt.avgRating, 1)}</b></div>` : ''}
        ${t.myTeamId ? `<div><span>Posición de mi equipo</span><b>${rows.findIndex((r) => r.teamId === t.myTeamId) + 1 || '–'}°</b></div>` : ''}
      </div>`;
  }
  return '';
}

function playoffsTab(t, s) {
  const rounds = bracketRounds(t.id, s.matches);
  if (!rounds.length) {
    const pend = pendingStage(t, s.matches);
    const seeds = playoffSeeds(t, s.matches);
    return `<div class="card cta-card"><h3 class="card-title">${ic('trophy')} Playoffs</h3>
      <p>${pend
        ? `Faltan ${pend} partido${pend > 1 ? 's' : ''} de la fase regular. Cuando terminen, generá el cuadro.`
        : `Listo: ${seeds.length} clasificado${seeds.length === 1 ? '' : 's'} ${t.format === 'groups' ? 'de los grupos' : 'de la tabla'}. Generá el cuadro.`}</p>
      <button class="btn primary sm" data-act="genpo" ${pend ? 'disabled' : ''}>${ic('spark')} Generar cuadro de playoffs</button></div>`;
  }
  return `<div class="bracket-scroll"><div class="bracket">${rounds.map((rd) => `
    <div class="br-col"><h4>${esc(rd.label)}</h4>${rd.matches.map(bracketCard).join('')}</div>`).join('')}</div></div>
    <p class="hint">Deslizá para ver todo el cuadro. Tocá un partido para cargar su resultado: el ganador pasa solo a la siguiente ronda.</p>`;
}

function bracketCard(m) {
  const h = store.find('teams', m.homeId), a = store.find('teams', m.awayId);
  const o = outcome(m);
  const row = (team, side, label) => {
    const won = o.known && o.winner === side;
    const score = o.known && o.scoreKnown ? (side === 'home' ? o.hg : o.ag) : won ? '✓' : '';
    return `<div class="bc-row ${won ? 'won' : ''} ${team ? '' : 'tbd'}">${team ? crest(team, 'xs') : ''}<span>${team ? esc(team.name) : esc(label)}</span><b>${score}</b></div>`;
  };
  return `<a class="bc-card" href="#/partido/${m.id}">
    ${row(h, 'home', 'Por definir')}
    ${row(a, 'away', 'Por definir')}
    <span class="bc-meta">${m.date ? fmtDate(m.date) : 'Sin fecha'}${m.status === 'finished' ? '' : ''}</span>
  </a>`;
}

const pct = (p) => (p >= 0.995 ? '100%' : p > 0 && p < 0.01 ? '<1%' : Math.round(p * 100) + '%');

function predRow(m) {
  const h = store.find('teams', m.homeId), a = store.find('teams', m.awayId);
  const p = m.prediction || {};
  const isScore = p.mode === 'score';
  const w = p.mode === 'winner' ? p.winner : isScore ? (p.home > p.away ? 'home' : p.home < p.away ? 'away' : 'draw') : '';
  const sc = (side) => `<div class="mini-step"><button type="button" data-act="predscore" data-m="${m.id}" data-side="${side}" data-d="1" aria-label="Más">+</button><b>${isScore ? p[side] : '·'}</b><button type="button" data-act="predscore" data-m="${m.id}" data-side="${side}" data-d="-1" aria-label="Menos">−</button></div>`;
  return `<div class="pred-row">
    <div class="pr-meta">${m.group ? `Grupo ${esc(m.group)} · ` : ''}${m.round ? `F${esc(m.round)}` : ''} ${m.date ? fmtDate(m.date) : ''}</div>
    <div class="pr-main">
      <div class="pr-team">${crest(h, 'sm')}<span>${esc(h?.name || '?')}</span></div>
      ${sc('home')}<span class="dash">–</span>${sc('away')}
      <div class="pr-team r"><span>${esc(a?.name || '?')}</span>${crest(a, 'sm')}</div>
    </div>
    <div class="pr-win">
      <button type="button" class="${w === 'home' ? 'on' : ''}" data-act="pred" data-m="${m.id}" data-w="home">L</button>
      <button type="button" class="${w === 'draw' ? 'on' : ''}" data-act="pred" data-m="${m.id}" data-w="draw">E</button>
      <button type="button" class="${w === 'away' ? 'on' : ''}" data-act="pred" data-m="${m.id}" data-w="away">V</button>
    </div>
  </div>`;
}
