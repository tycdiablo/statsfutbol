import * as store from '../store.js';
import { esc, fmtDate, fmtMonth, byDateAsc, byDateDesc, todayISO, relDays, clone } from '../util.js';
import { ic } from '../icons.js';
import { crest, empty, seg, confirmDialog, toast, choiceDialog } from '../ui.js';
import { isMine, outcome, predOutcome, myResult, RES_TEXT, EVENT_TYPES, STATUS, venueDetail } from '../stats.js';
import { matchCard, scoreHTML, statusChip, resPill } from '../components.js';
import { openMatchForm } from '../forms.js';
import { pitchSVG, kitById, openLineupEditor, openKitsManager } from '../lineup.js';
import { addPhoto, getPhotoURL, removePhoto } from '../media.js';
import { matchPayload, shareLink } from '../share.js';
import { openImportSheet } from '../import.js';

const F = { status: 'all', kind: 'all', who: 'all', q: '' };

function filtered() {
  const q = F.q.toLowerCase();
  return store.list('matches').filter((m) => {
    if (F.status !== 'all' && m.status !== F.status) return false;
    if (F.kind === 'official' && m.official === false) return false;
    if (F.kind === 'friendly' && m.official !== false) return false;
    if (F.who === 'mine' && !isMine(m)) return false;
    if (F.who === 'others' && isMine(m)) return false;
    if (q) {
      const txt = [store.find('teams', m.homeId)?.name, store.find('teams', m.awayId)?.name, m.competition, m.venue, m.notes].join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });
}

const chip = (key, val, label, count) => `<button type="button" class="fchip ${F[key] === val ? 'on' : ''}" data-act="filter" data-k="${key}" data-v="${val}">${label}${count != null ? ` <i>${count}</i>` : ''}</button>`;

export const MatchesView = {
  title: 'Partidos',
  fab: { icon: 'plus', label: 'Partido', run: () => openMatchForm() },
  render() {
    const all = store.list('matches');
    const list = filtered();
    const today = todayISO();
    const upcomingL = list.filter((m) => m.status === 'scheduled').sort(byDateAsc);
    const rest = list.filter((m) => m.status !== 'scheduled').sort(byDateDesc);
    const groups = new Map();
    for (const m of rest) {
      const k = (m.date || '').slice(0, 7) || 'sin';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    const cnt = (st) => all.filter((m) => m.status === st).length;
    const overdue = upcomingL.filter((m) => m.date && m.date < today && isMine(m)).length;
    return `
      <div class="row-actions import-row"><button class="btn ghost sm" data-act="import">${ic('upload')} Importar fixture del club</button></div>
      <div class="search">${ic('search')}<input type="search" placeholder="Buscar equipo, torneo, cancha…" value="${esc(F.q)}" data-search></div>
      <div class="filters">
        ${chip('status', 'all', 'Todos', all.length)}${chip('status', 'scheduled', 'Por jugarse', cnt('scheduled'))}${chip('status', 'finished', 'Finalizados', cnt('finished'))}${chip('status', 'suspended', 'Suspendidos', cnt('suspended'))}
      </div>
      <div class="filters">
        ${chip('kind', 'all', 'Oficiales y no')}${chip('kind', 'official', 'Oficiales')}${chip('kind', 'friendly', 'No oficiales')}
        <span class="fsep"></span>
        ${chip('who', 'all', 'Todos')}${chip('who', 'mine', 'Míos')}${chip('who', 'others', 'De otros')}
      </div>
      ${overdue ? `<div class="banner warn">${ic('info')}<span>Tenés ${overdue} partido${overdue > 1 ? 's' : ''} “por jugarse” con fecha pasada. Tocá para cargar el resultado.</span></div>` : ''}
      ${!all.length ? empty('ball', 'Todavía no hay partidos', 'Agregá tu primer partido: por jugarse, finalizado o suspendido.', `<button class="btn primary" data-act="new">${ic('plus')} Agregar partido</button>`)
        : !list.length ? empty('search', 'Sin resultados', 'Probá con otros filtros.') : ''}
      ${upcomingL.length ? `<h3 class="group-title">Próximos <span>${upcomingL.length}</span></h3><div class="cards">${upcomingL.map((m) => matchCard(m)).join('')}</div>` : ''}
      ${[...groups.entries()].map(([k, ms]) => `<h3 class="group-title">${k === 'sin' ? 'Sin fecha' : fmtMonth(k)} <span>${ms.length}</span></h3><div class="cards">${ms.map((m) => matchCard(m)).join('')}</div>`).join('')}
    `;
  },
  mount(root) {
    const inp = root.querySelector('[data-search]');
    inp?.addEventListener('input', () => {
      F.q = inp.value;
      const pos = inp.selectionStart;
      window.__rerender?.();
      const n = document.querySelector('[data-search]');
      n?.focus(); n?.setSelectionRange(pos, pos);
    });
  },
  actions: {
    filter: (el) => { F[el.dataset.k] = el.dataset.v; window.__rerender?.(); },
    new: () => openMatchForm(),
    import: () => openImportSheet({ onDone: () => window.__rerender() }),
  },
};

// ── Detail ─────────────────────────────────────────────────
export const MatchDetailView = {
  title: 'Partido',
  back: '#/partidos',
  render(id) {
    const m = store.find('matches', id);
    if (!m) return empty('ball', 'Partido no encontrado', 'Puede que lo hayas borrado.', '<a class="btn ghost" href="#/partidos">Volver</a>');
    const h = store.find('teams', m.homeId), a = store.find('teams', m.awayId);
    const tour = store.find('tournaments', m.tournamentId);
    const mine = isMine(m);
    const o = outcome(m);
    const r = myResult(m);
    const p = predOutcome(m.prediction);
    const evs = (m.events || []).slice().sort((x, y) => (+x.minute || 999) - (+y.minute || 999));
    const resultModeTxt = { exact: 'Resultado exacto', approx: 'Resultado aproximado', winner: 'Solo se sabe quién ganó', unknown: 'Resultado desconocido' }[m.result?.mode] || '';
    let predTxt = '';
    if (p.known) {
      const pt = p.scoreKnown ? `${p.hg} – ${p.ag}` : p.winner === 'draw' ? 'Empate' : `Gana ${esc((p.winner === 'home' ? h : a)?.name || '')}`;
      let verdict = '';
      if (o.known) {
        const exact = p.scoreKnown && o.scoreKnown && p.hg === o.hg && p.ag === o.ag;
        verdict = exact ? '<span class="chip st-fin">¡Exacta! 🎯</span>' : p.winner === o.winner ? '<span class="chip st-fin">Acertaste el ganador</span>' : '<span class="chip st-loss">Fallaste</span>';
      }
      predTxt = `<div class="card pred-card">${ic('crystal')}<div><span class="muted small">Tu predicción</span><b>${pt}</b></div>${verdict}</div>`;
    }
    const isOverdue = m.status === 'scheduled' && m.date && m.date < todayISO();

    return `
    <section class="scoreboard ${m.status}">
      <div class="sb-meta">${statusChip(m)} ${m.official === false ? '<span class="chip">No oficial</span>' : '<span class="chip chip-off">Oficial</span>'} ${!mine ? '<span class="chip">Partido de otros</span>' : ''}</div>
      <div class="sb-main">
        <div class="sb-team ${m.myTeam === 'home' && mine ? 'mine' : ''}">${crest(h, 'xl')}<b>${esc(h?.name || '—')}</b>${m.myTeam === 'home' && mine ? '<span class="my-tag">Mi equipo</span>' : '<span class="muted small">Local</span>'}</div>
        <div class="sb-score">${scoreHTML(m, true)}${r ? `<span class="sb-res res-txt-${r}">${RES_TEXT[r]}</span>` : ''}</div>
        <div class="sb-team ${m.myTeam === 'away' && mine ? 'mine' : ''}">${crest(a, 'xl')}<b>${esc(a?.name || '—')}</b>${m.myTeam === 'away' && mine ? '<span class="my-tag">Mi equipo</span>' : '<span class="muted small">Visitante</span>'}</div>
      </div>
      <div class="sb-info">
        <span>${ic('cal', 'inline')} ${m.date ? fmtDate(m.date, true) : 'Sin fecha'}${m.date && m.status === 'scheduled' ? ` (${relDays(m.date, m.time)})` : ''}</span>
        ${m.time ? `<span>${ic('clock', 'inline')} ${esc(m.time)}</span>` : ''}
        ${m.venue ? `<span>${ic('pin', 'inline')} ${esc(m.venue)}${venueDetail(m.venue, store.list('venues')) ? ` <small class="muted">· ${esc(venueDetail(m.venue, store.list('venues')))}</small>` : ''}</span>` : ''}
        ${m.competition ? `<span>${ic('trophy', 'inline')} ${tour ? `<a href="#/torneo/${tour.id}">${esc(m.competition)}</a>` : esc(m.competition)}${m.round ? ` · Fecha ${esc(m.round)}` : ''}</span>` : ''}
      </div>
      ${m.status === 'finished' && m.result?.mode !== 'exact' ? `<p class="sb-note">${resultModeTxt}</p>` : ''}
    </section>

    ${isOverdue ? `<div class="banner warn">${ic('info')}<span>Este partido ya debería haberse jugado.</span><button class="btn sm primary" data-act="finish">Cargar resultado</button></div>` : ''}
    ${m.status === 'scheduled' && !isOverdue ? `<div class="row-actions"><button class="btn primary" data-act="finish">${ic('check')} Marcar como finalizado</button><button class="btn ghost" data-act="suspend">Suspendido</button></div>` : ''}

    ${m.status === 'suspended' ? `<div class="card susp-card"><h3 class="card-title">Partido suspendido</h3><p>${m.suspendReason ? esc(m.suspendReason) : '<span class="muted">Sin razón especificada.</span>'}</p>${m.newDate ? `<p class="muted small">Reprogramado para el ${fmtDate(m.newDate, true)}</p>` : ''}</div>` : ''}

    ${m.status === 'finished' && mine ? `
      <section class="card">
        <h3 class="card-title">Mi partido</h3>
        <div class="tiles tiles-4 flat">
          <div class="tile accent"><b>${m.goals || 0}</b><span>Goles</span></div>
          <div class="tile"><b>${m.assists || 0}</b><span>Asist.</span></div>
          <div class="tile"><b>${m.minutes !== '' && m.minutes != null ? `${m.minutesExact ? '' : '<i class="tilde">~</i>'}${m.minutes}'` : '–'}</b><span>${m.minutes !== '' && m.minutes != null ? (m.minutesExact ? 'Exactos' : 'Aprox.') : 'Minutos'}</span></div>
          <div class="tile"><b>${+m.rating ? m.rating : '–'}</b><span>Nota</span></div>
        </div>
        <div class="kv">
          <div><span>MVP</span><b>${m.mvp === 'yes' ? '⭐ Sí, fui el mejor' : m.mvp === 'no' ? 'No' + (m.motm ? ` (fue ${esc(m.motm)})` : '') : 'No lo sé' + (m.motm ? ` (¿${esc(m.motm)}?)` : '')}</b></div>
          ${m.starter ? `<div><span>Arranqué</span><b>${m.starter === 'starter' ? 'Titular' : 'Suplente'}</b></div>` : ''}
          ${m.position ? `<div><span>Posición</span><b>${esc(m.position)}</b></div>` : ''}
        </div>
      </section>
      ${evs.length ? `<section class="card"><h3 class="card-title">Eventos</h3><ul class="timeline">${evs.map((e) => {
        const t = EVENT_TYPES[e.type] || EVENT_TYPES.other;
        return `<li><span class="tl-min">${e.minute !== '' && e.minute != null ? e.minute + "'" : ''}</span><span class="tl-ico">${t.icon}</span><div><b>${t.label}</b>${e.note ? `<span class="muted small">${esc(e.note)}</span>` : ''}</div></li>`;
      }).join('')}</ul></section>` : ''}
    ` : ''}

    ${predTxt}
    ${m.notes ? `<section class="card"><h3 class="card-title">${ic('note')} Notas</h3><p class="prewrap">${esc(m.notes)}</p></section>` : ''}

    ${mine || m.lineup ? `<section class="card">
      <div class="sec-head flat"><h3 class="card-title">${ic('user')} Alineación</h3><button class="link" data-act="lineup">${m.lineup ? 'Editar' : 'Cargar'}</button></div>
      ${m.lineup ? lineupBlock(m) : '<p class="muted small">Opcional: la formación, los nombres y las camisetas.</p>'}
      ${m.lineup ? `<div class="row-actions"><button class="btn ghost sm" data-act="kits">${ic('shield')} Camisetas</button></div>` : ''}
    </section>` : ''}

    <section class="card">
      <div class="sec-head flat"><h3 class="card-title">${ic('camera')} Fotos</h3><button class="link" data-act="addphoto">${ic('plus', 'inline')} Agregar</button></div>
      <div class="photo-grid" data-photos></div>
      <p class="hint">Las fotos se guardan en este celular (no se suben a la nube).</p>
    </section>

    <div class="detail-actions">
      <button class="btn ghost" data-act="edit">${ic('edit')} Editar</button>
      <button class="btn ghost" data-act="share">${ic('share')} Compartir</button>
      <button class="btn ghost" data-act="sharelink">${ic('cloud')} Link</button>
      <button class="btn ghost" data-act="dup">${ic('copy')} Duplicar</button>
      <button class="btn ghost danger-txt" data-act="del">${ic('trash')} Borrar</button>
    </div>`;
  },
  mount(root, id) { loadPhotos(root, id); },
  actions: {
    edit: (el, ev, id) => openMatchForm({ match: store.find('matches', id) }),
    lineup: (el, ev, id) => {
      const m = store.find('matches', id);
      openLineupEditor({ match: m, onSave: (lineup) => { store.upsert('matches', { id, lineup }); toast('Alineación guardada', { type: 'ok' }); window.__rerender(); } });
    },
    kits: (el, ev, id) => {
      const m = store.find('matches', id);
      const team = store.find('teams', m.myTeam === 'away' ? m.awayId : m.homeId);
      if (team) openKitsManager(team);
    },
    addphoto: (el, ev, id) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.onchange = async () => {
        const m = store.find('matches', id);
        const ids = [...(m.photos || [])];
        for (const f of inp.files) {
          try { ids.push(await addPhoto(f)); } catch (e) { console.warn(e); toast('No se pudo guardar una foto', { type: 'error' }); }
        }
        store.upsert('matches', { id, photos: ids });
        window.__rerender();
      };
      inp.click();
    },
    delphoto: async (el, ev, id) => {
      const pid = el.dataset.p;
      if (!(await confirmDialog('Se borra la foto de este celular.', { ok: 'Borrar', danger: true }))) return;
      await removePhoto(pid);
      const m = store.find('matches', id);
      store.upsert('matches', { id, photos: (m.photos || []).filter((x) => x !== pid) });
      window.__rerender();
    },
    sharelink: (el, ev, id) => shareLink(matchPayload(store.find('matches', id))),
    finish: (el, ev, id) => openMatchForm({ match: store.find('matches', id), defaults: { status: 'finished' } }),
    suspend: (el, ev, id) => openMatchForm({ match: store.find('matches', id), defaults: { status: 'suspended' } }),
    dup: async (el, ev, id) => {
      const m = store.find('matches', id);
      const kind = await choiceDialog('Duplicar partido', [
        { label: 'Mismo partido, por jugarse (revancha / próxima fecha)', value: 'same', icon: 'copy' },
        { label: 'Invertir local y visitante', value: 'swap', icon: 'swap' },
      ]);
      if (!kind) return;
      const c = clone(m);
      delete c.id;
      Object.assign(c, { status: 'scheduled', date: '', time: '', goals: 0, assists: 0, minutes: '', events: [], mvp: 'unknown', rating: 0, notes: '', motm: '', result: { mode: 'exact', home: 0, away: 0, winner: '' }, prediction: { mode: 'none' }, suspendReason: '', newDate: '' });
      if (kind === 'swap') { [c.homeId, c.awayId] = [c.awayId, c.homeId]; c.myTeam = c.myTeam === 'home' ? 'away' : c.myTeam === 'away' ? 'home' : ''; }
      openMatchForm({ defaults: c, onSaved: (s) => { location.hash = '#/partido/' + s.id; } });
    },
    share: async (el, ev, id) => {
      const m = store.find('matches', id);
      const text = shareText(m);
      try {
        if (navigator.share) await navigator.share({ title: 'Mi partido', text });
        else { await navigator.clipboard.writeText(text); toast('Copiado al portapapeles', { type: 'ok' }); }
      } catch (e) { if (e.name !== 'AbortError') { try { await navigator.clipboard.writeText(text); toast('Copiado al portapapeles', { type: 'ok' }); } catch { toast('No se pudo compartir'); } } }
    },
    del: async (el, ev, id) => {
      if (!(await confirmDialog('Se borra el partido y sus estadísticas.', { ok: 'Borrar', danger: true }))) return;
      store.remove('matches', id);
      toast('Partido borrado');
      location.replace('#/partidos');
    },
  },
};

function shareText(m) {
  const h = store.find('teams', m.homeId)?.name || 'Local', a = store.find('teams', m.awayId)?.name || 'Visitante';
  const o = outcome(m);
  const lines = [];
  if (m.status === 'finished') {
    lines.push(o.scoreKnown ? `⚽ ${h} ${o.approx ? '~' : ''}${o.hg} - ${o.ag} ${a}` : `⚽ ${h} vs ${a}`);
    const r = myResult(m);
    if (r) lines.push(RES_TEXT[r]);
    if (isMine(m)) {
      const st = [];
      if (m.goals) st.push(`${m.goals} gol${m.goals > 1 ? 'es' : ''}`);
      if (m.assists) st.push(`${m.assists} asist.`);
      if (m.minutes) st.push(`${m.minutesExact ? '' : '~'}${m.minutes}'`);
      if (m.mvp === 'yes') st.push('MVP ⭐');
      if (st.length) lines.push('Yo: ' + st.join(' · '));
    }
  } else if (m.status === 'scheduled') {
    lines.push(`📅 ${h} vs ${a}`, `${m.date ? fmtDate(m.date, true) : ''}${m.time ? ' ' + m.time : ''}${m.venue ? ' · ' + m.venue : ''}`);
  } else {
    lines.push(`⛔ Suspendido: ${h} vs ${a}${m.suspendReason ? ' — ' + m.suspendReason : ''}`);
  }
  if (m.competition) lines.push(m.competition);
  lines.push('— StatsFútbol');
  return lines.filter(Boolean).join('\n');
}

// Vista previa de la alineación guardada
function lineupBlock(m) {
  const L = m.lineup;
  const myT = store.find('teams', m.myTeam === 'away' ? m.awayId : m.homeId);
  const rivT = store.find('teams', m.myTeam === 'away' ? m.homeId : m.awayId);
  return `<div class="pitch-wrap">${pitchSVG({ formation: L.formation, players: L.mine, kit: kitById(myT?.id, L.kitMine), uidp: 'dm' })}${L.showRival ? pitchSVG({ formation: L.formation, players: L.rival, kit: kitById(rivT?.id, L.kitRival), mirror: true, uidp: 'dr' }) : ''}</div>`;
}

async function loadPhotos(root, id) {
  const m = store.find('matches', id);
  const box = root.querySelector('[data-photos]');
  if (!box) return;
  const ids = m?.photos || [];
  if (!ids.length) { box.innerHTML = '<p class="muted small">Todavía no hay fotos.</p>'; return; }
  box.innerHTML = ids.map((p) => `<div class="ph" data-ph="${p}"><span class="muted small">cargando…</span></div>`).join('');
  for (const pid of ids) {
    const url = await getPhotoURL(pid).catch(() => null);
    const cell = box.querySelector(`[data-ph="${pid}"]`);
    if (!cell) continue;
    cell.innerHTML = url ? `<img src="${url}" alt="Foto del partido"><button class="ph-del" data-act="delphoto" data-p="${pid}" aria-label="Borrar foto">${ic('x')}</button>` : '<span class="muted small">No disponible</span>';
  }
}
