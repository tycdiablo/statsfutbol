import * as store from './store.js';
import { esc, fmtDate, relDays } from './util.js';
import { ic } from './icons.js';
import { crest } from './ui.js';
import { STATUS, outcome, predOutcome, myResult, isMine, RES_LABEL, EVENT_TYPES } from './stats.js';

export function resPill(r, cls = '') {
  if (!r) return '';
  const lower = r === r.toLowerCase();
  const R = r.toUpperCase();
  return `<span class="res res-${R} ${lower ? 'res-pred' : ''} ${cls}" title="${lower ? 'Predicción' : ''}">${RES_LABEL[R]}</span>`;
}

export function scoreHTML(m, big = false) {
  const o = outcome(m);
  if (m.status === 'suspended') return `<span class="score-susp">SUSP</span>`;
  if (m.status === 'scheduled') return `<span class="score-vs">${m.time ? esc(m.time) : 'vs'}</span>`;
  if (!o.known) return `<span class="score-unk">?<i>–</i>?</span>`;
  if (!o.scoreKnown) {
    const txt = o.winner === 'draw' ? 'Empate' : 'Ganó ' + (o.winner === 'home' ? 'local' : 'visit.');
    return `<span class="score-win">${txt}</span>`;
  }
  return `<span class="score ${big ? 'big' : ''} ${o.approx ? 'approx' : ''}">${o.approx ? '<i class="tilde">~</i>' : ''}${o.hg}<i>–</i>${o.ag}</span>`;
}

export function statusChip(m) {
  const s = STATUS[m.status] || STATUS.scheduled;
  return `<span class="chip ${s.cls}">${s.label}</span>`;
}

export function matchCard(m, { compact = false } = {}) {
  const h = store.find('teams', m.homeId), a = store.find('teams', m.awayId);
  const mine = isMine(m);
  const r = myResult(m);
  const o = outcome(m);
  const hw = o.known && o.winner === 'home', aw = o.known && o.winner === 'away';
  const meta = [m.competition, m.round ? `Fecha ${m.round}` : ''].filter(Boolean).join(' · ');
  const stats = [];
  if (m.status === 'finished' && mine) {
    if (m.goals) stats.push(`<span>⚽ ${m.goals}</span>`);
    if (m.assists) stats.push(`<span>🅰️ ${m.assists}</span>`);
    if (m.minutes !== '' && m.minutes != null) stats.push(`<span>${m.minutesExact ? '' : '~'}${m.minutes}'</span>`);
    if (m.mvp === 'yes') stats.push('<span class="mvp-tag">⭐ MVP</span>');
    for (const e of m.events || []) if (['yellow', 'red', 'injury', 'owngoal'].includes(e.type)) stats.push(`<span>${EVENT_TYPES[e.type].icon}</span>`);
  }
  if (m.status === 'scheduled') {
    const p = predOutcome(m.prediction);
    if (p.known) stats.push(`<span class="muted">${ic('crystal', 'inline')} ${p.scoreKnown ? `${p.hg}–${p.ag}` : p.winner === 'draw' ? 'Empate' : 'Gana ' + esc((p.winner === 'home' ? h : a)?.name || '')}</span>`);
    if (m.date) stats.push(`<span class="muted">${relDays(m.date, m.time)}</span>`);
  }
  if (m.status === 'suspended' && m.suspendReason) stats.push(`<span class="muted">${esc(m.suspendReason).slice(0, 60)}</span>`);
  const side = (t, isMineSide, won) => `<div class="mc-team ${isMineSide ? 'mine' : ''} ${won ? 'won' : ''}">${crest(t, compact ? 'sm' : 'md')}<span>${esc(t?.name || '—')}</span></div>`;
  return `<a class="match-card ${compact ? 'compact' : ''} ${mine ? '' : 'others'}" href="#/partido/${m.id}">
    <div class="mc-top">
      ${statusChip(m)}
      ${m.official === false ? '<span class="chip">No oficial</span>' : '<span class="chip chip-off">Oficial</span>'}
      ${!mine ? '<span class="chip">De otros</span>' : ''}
      <span class="mc-date">${m.date ? fmtDate(m.date) : 'Sin fecha'}</span>
    </div>
    <div class="mc-body">
      ${side(h, mine && m.myTeam === 'home', hw)}
      <div class="mc-score">${scoreHTML(m)}</div>
      ${side(a, mine && m.myTeam === 'away', aw)}
    </div>
    ${meta || stats.length || r ? `<div class="mc-foot"><span class="mc-meta">${esc(meta)}</span><span class="mc-stats">${stats.join('')}${resPill(r)}</span></div>` : ''}
  </a>`;
}

export function statTile(value, label, { accent = false, sub = '', approx = false } = {}) {
  return `<div class="tile ${accent ? 'accent' : ''}"><b>${approx ? '<i class="tilde">~</i>' : ''}${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

export function progressBar(p, cls = '') {
  return `<div class="bar ${cls}"><i style="width:${Math.round(Math.min(1, Math.max(0, p)) * 100)}%"></i></div>`;
}

export function sectionHead(title, action = '') {
  return `<div class="sec-head"><h2>${title}</h2>${action}</div>`;
}

export function barChart(data) {
  const max = Math.max(1, ...data.map((d) => d.goals + d.assists));
  const W = 100 / data.length;
  return `<div class="chart" role="img" aria-label="Goles y asistencias por mes">
    ${data.map((d) => {
      const gh = (d.goals / max) * 100, ah = (d.assists / max) * 100;
      return `<div class="chart-col" style="width:${W}%" title="${d.goals} goles, ${d.assists} asistencias, ${d.pj} PJ">
        <div class="chart-stack">${d.goals + d.assists ? `<span class="chart-val">${d.goals + d.assists}</span>` : ''}<i class="cb-a" style="height:${ah}%"></i><i class="cb-g" style="height:${gh}%"></i></div>
        <span class="chart-lbl">${d.label}</span></div>`;
    }).join('')}
  </div>
  <div class="legend"><span><i class="cb-g"></i>Goles</span><span><i class="cb-a"></i>Asistencias</span></div>`;
}
