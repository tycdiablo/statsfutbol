import { esc, fmtDate, fmtNum } from '../util.js';
import { ic } from '../icons.js';
import { crest, toast } from '../ui.js';
import * as cloud from '../cloud.js';
import * as store from '../store.js';
import { importShared } from '../share.js';
import { outcome, standings, isMine, myResult, RES_TEXT, EVENT_TYPES, venueDetail, SURFACES } from '../stats.js';
import { pitchSVG, kitById } from '../lineup.js';
import { STATUS } from '../stats.js';

// Vista de solo lectura del link: usa los datos que vinieron en el link, no los del celular
export default {
  title: 'Compartido',
  back: '#/inicio',
  render() {
    return '<div class="shared-box"><p class="muted center pad">Cargando…</p></div>';
  },
  async mount(root, id) {
    const box = root.querySelector('.shared-box');
    if (!cloud.isConfigured()) { box.innerHTML = '<p class="center pad">Esta web todavía no tiene la nube configurada.</p>'; return; }
    try {
      await cloud.init();
      const data = await cloud.getShare(id);
      if (!data) { box.innerHTML = '<p class="center pad">Ese link no existe o ya no está disponible.</p>'; return; }
      const T = Object.fromEntries((data.teams || []).map((t) => [t.id, t]));
      box.innerHTML = sharedHTML(data);
      const save = box.querySelector('[data-save-shared]');
      save?.addEventListener('click', async () => {
        save.disabled = true;
        const r = await importShared(data);
        toast(r.kind === 'match' ? 'Partido guardado en tu app' : `Torneo guardado con ${r.count} partidos`, { type: 'ok' });
        location.hash = r.kind === 'match' ? `#/partido/${r.id}` : `#/torneo/${r.id}`;
      });
      box.querySelector('[data-exit]')?.addEventListener('click', () => { location.hash = '#/inicio'; });
    } catch (e) {
      console.warn(e);
      box.innerHTML = '<p class="center pad">No pudimos abrir el link. Revisá la conexión.</p>';
    }
  },
};

// Arma la vista de un link a partir de sus datos (también usable en pruebas)
export function sharedHTML(data) {
  const T = Object.fromEntries((data.teams || []).map((t) => [t.id, t]));
  return data.kind === 'match' ? matchView(data, T) : tournamentView(data, T);
}

const teamOf = (T, id) => T[id] || null;
const kitOf = (team, kitId) => (team?.kits || []).find((k) => k.id === kitId) || (team?.kits || [])[0] || null;

function actions() {
  return `<div class="shared-actions">
    <button class="btn primary block" data-save-shared>${ic('download')} Guardar en mi app</button>
    <button class="btn ghost block" data-exit>Salir</button>
  </div>
  <p class="hint center">Guardar lo copia a tu app: escudos, camisetas, fotos y resultados. Lo que hagas después no cambia lo de quien te lo compartió.</p>`;
}

function matchView(data, T) {
  const m = data.match;
  const h = teamOf(T, m.homeId), a = teamOf(T, m.awayId);
  const o = outcome(m);
  const r = m.myTeam && m.played !== false ? myResult(m) : null;
  const mine = isMine(m);
  const st = STATUS[m.status] || STATUS.scheduled;
  const photos = data.photos || [];
  const evs = (m.events || []).slice().sort((x, y) => (+x.minute || 999) - (+y.minute || 999));
  let score = '<span class="score-vs">vs</span>';
  if (m.status === 'suspended') score = '<span class="score-susp">SUSP</span>';
  else if (m.status === 'finished' && o.known && o.scoreKnown) score = `<span class="score big ${o.approx ? 'approx' : ''}">${o.approx ? '<i class="tilde">~</i>' : ''}${o.hg}<i>–</i>${o.ag}</span>`;
  else if (m.status === 'finished' && o.known) score = `<span class="score-win">${o.winner === 'draw' ? 'Empate' : 'Ganó ' + (o.winner === 'home' ? (h?.name || 'local') : (a?.name || 'visitante'))}${o.margin ? ' por ' + o.margin : ''}</span>`;
  const resTxt = r ? RES_TEXT[r] : '';
  const venue = m.venue ? `${esc(m.venue)}${data.venue ? ` <small class="muted">· ${esc([SURFACES[data.venue.surface], data.venue.size ? `cancha de ${data.venue.size}` : ''].filter(Boolean).join(' · '))}</small>` : ''}` : '';
  const lineup = m.lineup ? `<section class="card"><h3 class="card-title">${ic('user')} Alineación</h3>
    <div class="pitch-wrap">${pitchSVG({ formation: m.lineup.formation, players: m.lineup.mine || [], kit: kitOf(h && m.myTeam !== 'away' ? h : a, m.lineup.kitMine), uidp: 'sm' })}
    ${m.lineup.showRival ? pitchSVG({ formation: m.lineup.formation, players: m.lineup.rival || [], kit: kitOf(m.myTeam === 'away' ? h : a, m.lineup.kitRival), mirror: true, uidp: 'sr' }) : ''}</div></section>` : '';
  const myStats = mine && m.status === 'finished' ? `<section class="card"><h3 class="card-title">Mi partido</h3>
    <div class="tiles tiles-4 flat">
      <div class="tile accent"><b>${m.goals || 0}</b><span>Goles</span></div>
      <div class="tile"><b>${m.assists || 0}</b><span>Asist.</span></div>
      <div class="tile"><b>${m.minutes !== '' && m.minutes != null ? `${m.minutesExact ? '' : '~'}${m.minutes}'` : '–'}</b><span>Minutos</span></div>
      <div class="tile"><b>${+m.rating ? m.rating : '–'}</b><span>Nota</span></div>
    </div>
    <div class="kv">
      <div><span>MVP</span><b>${m.mvp === 'yes' ? '⭐ Sí' : m.mvp === 'no' ? 'No' + (m.motm ? ` (fue ${esc(m.motm)})` : '') : 'No lo sé'}</b></div>
      ${m.position ? `<div><span>Posición</span><b>${esc(m.position)}</b></div>` : ''}
      ${m.starter ? `<div><span>Arranqué</span><b>${m.starter === 'starter' ? 'Titular' : 'Suplente'}</b></div>` : ''}
    </div></section>` : '';
  const events = evs.length ? `<section class="card"><h3 class="card-title">Eventos</h3><ul class="timeline">${evs.map((e) => {
    const t = EVENT_TYPES[e.type] || EVENT_TYPES.other;
    return `<li><span class="tl-min">${e.minute !== '' && e.minute != null ? e.minute + "'" : ''}</span><span class="tl-ico">${t.icon}</span><div><b>${t.label}</b>${e.note ? `<span class="muted small">${esc(e.note)}</span>` : ''}</div></li>`;
  }).join('')}</ul></section>` : '';
  const gallery = photos.length ? `<section class="card"><h3 class="card-title">${ic('camera')} Fotos</h3><div class="photo-grid">${photos.map((p) => `<div class="ph"><img src="${p.url}" alt="Foto del partido"></div>`).join('')}</div></section>` : '';
  return `
    <section class="scoreboard ${m.status}">
      <div class="sb-meta">${`<span class="chip ${st.cls}">${st.label}</span>`} ${m.official === false ? '<span class="chip">No oficial</span>' : '<span class="chip chip-off">Oficial</span>'}</div>
      <div class="sb-main">
        <div class="sb-team">${crest(h, 'xl')}<b>${esc(h?.name || '—')}</b></div>
        <div class="sb-score">${score}${resTxt ? `<span class="sb-res res-txt-${r}">${resTxt}</span>` : ''}</div>
        <div class="sb-team">${crest(a, 'xl')}<b>${esc(a?.name || '—')}</b></div>
      </div>
      <div class="sb-info">
        ${m.date ? `<span>${ic('cal', 'inline')} ${fmtDate(m.date, true)}</span>` : ''}
        ${m.time ? `<span>${ic('clock', 'inline')} ${esc(m.time)}</span>` : ''}
        ${venue ? `<span>${ic('pin', 'inline')} ${venue}</span>` : ''}
        ${m.competition ? `<span>${ic('trophy', 'inline')} ${esc(m.competition)}${m.round ? ` · Fecha ${esc(m.round)}` : ''}</span>` : ''}
      </div>
    </section>
    ${m.status === 'suspended' && m.suspendReason ? `<section class="card susp-card"><p>${esc(m.suspendReason)}</p></section>` : ''}
    ${myStats}
    ${lineup}
    ${events}
    ${gallery}
    ${m.notes ? `<section class="card"><h3 class="card-title">${ic('note')} Notas</h3><p class="prewrap">${esc(m.notes)}</p></section>` : ''}
    ${actions()}`;
}

function tournamentView(data, T) {
  const t = data.tournament;
  const ms = data.matches || [];
  const rows = standings(t, ms);
  const photos = data.photos || [];
  const table = rows.length ? `<div class="table-wrap"><table class="standings">
    <thead><tr><th>#</th><th class="tl">Equipo</th><th>Pts</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr class="${r.teamId === t.myTeamId ? 'mine' : ''}"><td class="pos">${i + 1}</td>
      <td class="tl"><div class="team-cell">${crest(teamOf(T, r.teamId), 'xs')}<span>${esc(teamOf(T, r.teamId)?.name || '?')}</span></div></td>
      <td class="pts">${r.pts}</td><td>${r.pj}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td></tr>`).join('')}</tbody></table></div>` : '';
  const byRound = new Map();
  for (const m of ms.filter((x) => (x.stage || 'league') !== 'playoff').sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
    const k = m.round ? `Fecha ${m.round}` : 'Sin fecha';
    if (!byRound.has(k)) byRound.set(k, []);
    byRound.get(k).push(m);
  }
  const matchLine = (m) => {
    const h = teamOf(T, m.homeId), a = teamOf(T, m.awayId);
    const o = outcome(m);
    const sc = m.status === 'finished' && o.known && o.scoreKnown ? `${o.hg} – ${o.ag}` : m.status === 'finished' && o.known ? (o.winner === 'draw' ? 'Empate' : 'Ganó ' + (o.winner === 'home' ? h?.name : a?.name)) : m.status === 'suspended' ? 'Suspendido' : 'vs';
    return `<div class="sh-match">${crest(h, 'xs')}<span>${esc(h?.name || '?')}</span><b>${esc(sc)}</b><span class="r">${esc(a?.name || '?')}</span>${crest(a, 'xs')}</div>`;
  };
  const playoffs = ms.filter((m) => m.stage === 'playoff').sort((a, b) => (a.playoffRound - b.playoffRound) || (a.playoffIdx - b.playoffIdx));
  const po = playoffs.length ? `<h3 class="group-title">Playoffs</h3>${playoffs.map((m) => `<div class="card sh-po">${matchLine(m)}</div>`).join('')}` : '';
  return `
    <section class="card tour-head-card">
      <span class="tour-ico big">${ic('trophy')}</span>
      <h2>${esc(t.name || 'Torneo')}</h2>
      <p class="muted small">${[t.season, t.format === 'groups' ? 'Grupos' : 'Liga', t.playoff ? 'con playoffs' : '', `${(data.teams || []).length} equipos`].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="sh-teams">${(data.teams || []).map((tm) => `<span class="sh-team">${crest(tm, 'xs')}${esc(tm.name)}</span>`).join('')}</div>
    </section>
    ${table ? `<h3 class="group-title">Tabla</h3>${table}` : ''}
    ${[...byRound.entries()].map(([k, list]) => `<h3 class="group-title">${esc(k)}</h3><div class="card sh-round">${list.map(matchLine).join('')}</div>`).join('')}
    ${po}
    ${photos.length ? `<section class="card"><h3 class="card-title">${ic('camera')} Fotos</h3><div class="photo-grid">${photos.map((p) => `<div class="ph"><img src="${p.url}" alt=""></div>`).join('')}</div></section>` : ''}
    ${actions()}`;
}
