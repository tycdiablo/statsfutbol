import * as store from '../store.js';
import { esc, fmtDate, byDateAsc, int0, fmtNum } from '../util.js';
import { ic } from '../icons.js';
import { crest, empty, seg, confirmDialog, toast, stepper } from '../ui.js';
import { standings, simulate, totals, outcome, predOutcome, isMine } from '../stats.js';
import { matchCard, resPill, scoreHTML, statTile, progressBar } from '../components.js';
import { openTournamentForm, openMatchForm, generateFixture } from '../forms.js';
import { tourMini } from './home.js';

export const ToursView = {
  title: 'Torneos',
  fab: { icon: 'plus', label: 'Torneo', run: () => newTour() },
  render() {
    const s = store.get();
    const tours = s.tournaments.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!tours.length) {
      return empty('trophy', 'Creá tu torneo', 'Armá un torneo personalizado: cargá los equipos, generá el fixture, seguí la tabla de posiciones, hacé predicciones y simulá cómo termina.', `<button class="btn primary" data-act="new">${ic('plus')} Crear torneo</button>`);
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

export const TourDetailView = {
  title: 'Torneo',
  back: '#/torneos',
  render(id) {
    const s = store.get();
    const t = store.find('tournaments', id);
    if (!t) return empty('trophy', 'Torneo no encontrado', '', '<a class="btn ghost" href="#/torneos">Volver</a>');
    const tab = TAB[id] || 'table';
    const ms = s.matches.filter((m) => m.tournamentId === id);
    const done = ms.filter((m) => m.status === 'finished').length;
    const tabs = [['table', 'Tabla', 'table'], ['fixture', 'Fixture', 'list'], ['predict', 'Predecir', 'crystal'], ['sim', 'Simular', 'spark'], ['me', 'Mis stats', 'user']];
    return `
      <section class="tour-head">
        <span class="tour-ico big">${ic('trophy')}</span>
        <div><h2>${esc(t.name)}</h2><span class="muted small">${[t.season, t.official === false ? 'No oficial' : 'Oficial', `${(t.teamIds || []).length} equipos`, t.double ? 'Ida y vuelta' : 'Solo ida'].filter(Boolean).map(esc).join(' · ')}</span>
        ${progressBar(ms.length ? done / ms.length : 0, 'thin')}<span class="muted small">${done} de ${ms.length} partidos jugados</span></div>
        <button class="icon-btn" data-act="edit" aria-label="Editar torneo">${ic('edit')}</button>
      </section>
      <nav class="tabs" role="tablist">${tabs.map(([k, l, i]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${ic(i)}<span>${l}</span></button>`).join('')}</nav>
      <div class="tab-body">${renderTab(tab, t, s, ms)}</div>
      ${t.notes ? `<section class="card mt"><h3 class="card-title">${ic('note')} Notas</h3><p class="prewrap">${esc(t.notes)}</p></section>` : ''}
      <div class="detail-actions"><button class="btn ghost danger-txt" data-act="del">${ic('trash')} Borrar torneo</button></div>`;
  },
  actions: {
    tab: (el, ev, id) => { TAB[id] = el.dataset.tab; window.__rerender(); },
    edit: (el, ev, id) => openTournamentForm({ tour: store.find('tournaments', id) }),
    addmatch: (el, ev, id) => {
      const t = store.find('tournaments', id);
      openMatchForm({ defaults: { tournamentId: id, official: t.official !== false, competition: t.name, played: false, myTeam: '' } });
    },
    gen: (el, ev, id) => {
      const t = store.find('tournaments', id);
      if ((t.teamIds || []).length < 2) { toast('Agregá al menos 2 equipos al torneo'); return; }
      const n = generateFixture(t);
      toast(`Fixture generado: ${n} partidos`, { type: 'ok' });
    },
    del: async (el, ev, id) => {
      const n = store.list('matches').filter((m) => m.tournamentId === id).length;
      const choice = await confirmDialog(n ? `Se borra el torneo. Sus ${n} partidos también se borran (los que ya cargaste con stats tuyas se mantienen).` : 'Se borra el torneo.', { ok: 'Borrar', danger: true });
      if (!choice) return;
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
    predscore: (el, ev, id) => {
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
      SIM[id] = { usePred: SIM[id]?.usePred ?? true };
      SIM[id].res = simulate(t, store.list('matches'), { runs: 5000, usePredictions: SIM[id].usePred });
      window.__rerender();
    },
    simpred: (el, ev, id) => {
      SIM[id] = { ...(SIM[id] || {}), usePred: !(SIM[id]?.usePred ?? true), res: null };
      window.__rerender();
    },
  },
};

const SIM = {};

function zoneCls(i, n, t) {
  if (t.promo && i < t.promo) return 'zone-up';
  if (t.releg && i >= n - t.releg) return 'zone-down';
  return '';
}

function table(t, rows, { prev = null } = {}) {
  if (!rows.length) return '<p class="muted pad">Agregá equipos al torneo para ver la tabla.</p>';
  const prevPos = prev ? Object.fromEntries(prev.map((r, i) => [r.teamId, i])) : null;
  return `<div class="table-wrap"><table class="standings">
    <thead><tr><th>#</th><th class="tl">Equipo</th><th>Pts</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th class="hide-xs">GF</th><th class="hide-xs">GC</th><th>DG</th><th class="hide-sm">Forma</th></tr></thead>
    <tbody>${rows.map((r, i) => {
      const tm = store.find('teams', r.teamId);
      const d = prevPos ? prevPos[r.teamId] - i : 0;
      return `<tr class="${r.teamId === t.myTeamId ? 'mine' : ''} ${zoneCls(i, rows.length, t)}">
        <td class="pos"><span>${i + 1}</span>${prevPos && d ? `<i class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</i>` : ''}</td>
        <td class="tl"><div class="team-cell">${crest(tm, 'xs')}<span>${esc(tm?.name || '?')}</span>${r.partial ? '<sup title="Hay partidos donde solo se sabe el ganador">*</sup>' : ''}${r.approx ? '<sup title="Incluye resultados aproximados">~</sup>' : ''}</div></td>
        <td class="pts">${r.pts}</td><td>${r.pj}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
        <td class="hide-xs">${r.gf}</td><td class="hide-xs">${r.ga}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td>
        <td class="hide-sm form-cell">${r.form.slice(-5).map((x) => resPill(x, 'xs')).join('')}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function legend(t, rows) {
  const parts = [];
  if (t.promo) parts.push('<span><i class="lg zone-up"></i>Clasifican</span>');
  if (t.releg) parts.push('<span><i class="lg zone-down"></i>Descienden</span>');
  if (rows.some((r) => r.partial)) parts.push('<span>* sin goles en algún partido</span>');
  if (rows.some((r) => r.approx)) parts.push('<span>~ incluye resultados aproximados</span>');
  if (t.myTeamId) parts.push('<span><i class="lg mine"></i>Mi equipo</span>');
  return parts.length ? `<div class="legend">${parts.join('')}</div>` : '';
}

function renderTab(tab, t, s, ms) {
  if (tab === 'table') {
    const rows = standings(t, s.matches);
    return `${table(t, rows)}${legend(t, rows)}
      <p class="hint">Puntos: victoria ${t.points?.w ?? 3} · empate ${t.points?.d ?? 1} · derrota ${t.points?.l ?? 0}. Desempate por diferencia de gol y goles a favor.</p>`;
  }
  if (tab === 'fixture') {
    if (!ms.length) {
      return empty('list', 'Sin partidos', 'Generá el fixture automático o cargá partidos a mano.', `<div class="row-actions center"><button class="btn primary" data-act="gen">${ic('spark')} Generar fixture</button><button class="btn ghost" data-act="addmatch">${ic('plus')} Partido</button></div>`);
    }
    const rounds = new Map();
    for (const m of ms.slice().sort(byDateAsc)) {
      const k = m.round || '—';
      if (!rounds.has(k)) rounds.set(k, []);
      rounds.get(k).push(m);
    }
    const keys = [...rounds.keys()].sort((a, b) => (parseInt(a, 10) || 999) - (parseInt(b, 10) || 999));
    return `<button class="btn ghost block" data-act="addmatch">${ic('plus')} Agregar partido al torneo</button>
      ${keys.map((k) => `<h3 class="group-title">${k === '—' ? 'Sin fecha asignada' : `Fecha ${esc(k)}`}</h3><div class="cards">${rounds.get(k).map((m) => matchCard(m, { compact: true })).join('')}</div>`).join('')}`;
  }
  if (tab === 'predict') {
    const pend = ms.filter((m) => m.status === 'scheduled').sort(byDateAsc);
    if (!pend.length) return empty('crystal', 'No quedan partidos por jugarse', 'Cuando haya partidos pendientes vas a poder predecir sus resultados.');
    const cur = standings(t, s.matches);
    const proj = standings(t, s.matches, { projected: true });
    const nPred = pend.filter((m) => predOutcome(m.prediction).known).length;
    return `<p class="hint">Elegí quién gana (L / E / V) o tocá los números para un resultado exacto. Abajo ves cómo quedaría la tabla.</p>
      <div class="pred-list">${pend.map((m) => predRow(m)).join('')}</div>
      <div class="sec-head"><h2>Tabla proyectada</h2><span class="muted small">${nPred}/${pend.length} predichos</span></div>
      ${table(t, proj, { prev: cur })}${legend(t, proj)}
      ${nPred ? `<button class="btn ghost sm mt" data-act="clearpred">${ic('x')} Borrar mis predicciones</button>` : ''}`;
  }
  if (tab === 'sim') {
    const st = SIM[t.id] || { usePred: true };
    const res = st.res;
    const pend = ms.filter((m) => m.status === 'scheduled').length;
    let out = `<div class="card sim-card"><p>Simulamos el resto del torneo miles de veces usando el rendimiento de cada equipo (goles a favor, en contra y puntos) para estimar cómo termina.</p>
      <label class="check-row"><input type="checkbox" data-act="simpred" ${st.usePred ? 'checked' : ''}><span>Respetar mis predicciones</span></label>
      <button class="btn primary block mt" data-act="sim" ${pend ? '' : 'disabled'}>${ic('spark')} ${res ? 'Volver a simular' : 'Simular 5.000 veces'}</button>
      ${pend ? '' : '<p class="hint">No quedan partidos por jugarse.</p>'}</div>`;
    if (res) {
      const my = res.rows.find((r) => r.teamId === t.myTeamId);
      if (my) {
        const pos = Math.round(my.avgPos);
        out += `<div class="card my-sim"><h3 class="card-title">${crest(store.find('teams', my.teamId), 'sm')} Mi equipo</h3>
          <div class="tiles tiles-3 flat">${statTile(pct(my.champ), 'Campeón', { accent: true })}${statTile(pos + '°', 'Posición esperada')}${statTile(fmtNum(my.expPts, 1), 'Pts esperados')}</div>
          ${t.promo ? `<p class="muted small">Probabilidad de clasificar: <b>${pct(my.dist.slice(0, t.promo).reduce((a, b) => a + b, 0))}</b></p>` : ''}
          ${t.releg ? `<p class="muted small">Probabilidad de descender: <b>${pct(my.dist.slice(-t.releg).reduce((a, b) => a + b, 0))}</b></p>` : ''}
          <div class="dist">${my.dist.map((p, i) => `<div class="dist-col" title="${i + 1}°: ${pct(p)}"><i style="height:${Math.max(2, p * 100)}%"></i><span>${i + 1}</span></div>`).join('')}</div>
        </div>`;
      }
      out += `<div class="table-wrap"><table class="standings sim">
        <thead><tr><th class="tl">Equipo</th><th>Campeón</th><th>Pos. media</th><th>Pts esp.</th></tr></thead>
        <tbody>${res.rows.map((r) => { const tm = store.find('teams', r.teamId); return `<tr class="${r.teamId === t.myTeamId ? 'mine' : ''}"><td class="tl"><div class="team-cell">${crest(tm, 'xs')}<span>${esc(tm?.name || '?')}</span></div></td><td><div class="pbar"><i style="width:${r.champ * 100}%"></i><span>${pct(r.champ)}</span></div></td><td>${fmtNum(r.avgPos, 1)}</td><td>${fmtNum(r.expPts, 1)}</td></tr>`; }).join('')}</tbody>
      </table></div><p class="hint">${res.runs.toLocaleString('es-AR')} simulaciones sobre ${res.pending} partidos pendientes. Es una estimación, ¡la pelota es redonda!</p>`;
    }
    return out;
  }
  if (tab === 'me') {
    const tt = totals(s.matches, [], { tournamentId: t.id });
    if (!tt.pj) return empty('user', 'Todavía no jugaste en este torneo', 'Cuando cargues partidos finalizados donde jugaste, acá aparecen tus números.');
    const rows = standings(t, s.matches);
    const scorers = s.matches.filter((m) => m.tournamentId === t.id);
    return `<div class="tiles tiles-4">${statTile(tt.pj, 'PJ')}${statTile(tt.goals, 'Goles', { accent: true })}${statTile(tt.assists, 'Asist.')}${statTile(tt.mvps, 'MVP')}</div>
      <div class="tiles tiles-4 mt">${statTile((tt.minutesApprox ? '~' : '') + fmtNum(tt.minutes), 'Minutos')}${statTile(`${tt.w}-${tt.d}-${tt.l}`, 'G-E-P')}${statTile(tt.yellows, 'Amarillas')}${statTile(tt.reds, 'Rojas')}</div>
      <div class="kv card mt">
        <div><span>Promedio de gol</span><b>${fmtNum(tt.gpm, 2)} por partido</b></div>
        ${tt.minPerGoal ? `<div><span>Minutos por gol</span><b>${tt.minPerGoal}'</b></div>` : ''}
        ${tt.avgRating ? `<div><span>Nota promedio</span><b>${fmtNum(tt.avgRating, 1)}</b></div>` : ''}
        ${t.myTeamId ? `<div><span>Posición de mi equipo</span><b>${rows.findIndex((r) => r.teamId === t.myTeamId) + 1}°</b></div>` : ''}
      </div>`;
  }
  return '';
}

const pct = (p) => (p >= 0.995 ? '100%' : p > 0 && p < 0.01 ? '<1%' : Math.round(p * 100) + '%');

function predRow(m) {
  const h = store.find('teams', m.homeId), a = store.find('teams', m.awayId);
  const p = m.prediction || {};
  const isScore = p.mode === 'score';
  const w = p.mode === 'winner' ? p.winner : isScore ? (p.home > p.away ? 'home' : p.home < p.away ? 'away' : 'draw') : '';
  const sc = (side) => `<div class="mini-step"><button type="button" data-act="predscore" data-m="${m.id}" data-side="${side}" data-d="1" aria-label="Más">+</button><b>${isScore ? p[side] : '·'}</b><button type="button" data-act="predscore" data-m="${m.id}" data-side="${side}" data-d="-1" aria-label="Menos">−</button></div>`;
  return `<div class="pred-row">
    <div class="pr-meta">${m.round ? `F${esc(m.round)}` : ''} ${m.date ? fmtDate(m.date) : ''}</div>
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
