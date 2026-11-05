import * as store from './store.js';
import { esc, num, int0, todayISO, clone, uid, isNum } from './util.js';
import { ic } from './icons.js';
import { openSheet, toast, confirmDialog, pickImage, crest, avatar, seg, stepper, refreshShow, teamName } from './ui.js';
import { EVENT_TYPES, POSITIONS, STAT_LABELS, roundRobin, years } from './stats.js';

const footer = (saveLabel = 'Guardar', extra = '') =>
  `${extra}<button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" data-save type="button">${saveLabel}</button>`;

function bindForm(sh, onSave) {
  const form = sh.el.querySelector('form');
  form.addEventListener('submit', (e) => { e.preventDefault(); onSave(); });
  form.addEventListener('input', () => refreshShow(form));
  sh.el.querySelector('[data-save]').addEventListener('click', onSave);
  refreshShow(form);
  return form;
}

// ═════════════════════════════════════════════════════════
//  TEAMS
// ═════════════════════════════════════════════════════════
export function openTeamForm({ team = null, name = '', onSaved } = {}) {
  let logo = team?.logo || '';
  const sh = openSheet({
    title: team ? 'Editar equipo' : 'Nuevo equipo',
    cls: 'dialog',
    body: `<form class="form">
      <div class="logo-pick">
        <button type="button" class="logo-btn" data-logo>${crest(team || { name: name || '?' }, 'xl')}<span class="logo-badge">${ic('camera')}</span></button>
        <div class="logo-actions">
          <button type="button" class="link" data-logo>${team?.logo ? 'Cambiar escudo' : 'Agregar escudo'}</button>
          <button type="button" class="link muted" data-nologo ${logo ? '' : 'hidden'}>Quitar</button>
        </div>
      </div>
      <label class="field"><span>Nombre del equipo</span><input name="name" required maxlength="40" value="${esc(team?.name || name)}" placeholder="Ej: Los Pibes FC"></label>
      <label class="field"><span>Abreviatura <em>(opcional)</em></span><input name="short" maxlength="4" value="${esc(team?.short || '')}" placeholder="LPF" style="text-transform:uppercase"></label>
    </form>`,
    footer: footer(team ? 'Guardar' : 'Crear equipo'),
  });
  const form = bindForm(sh, save);
  const nameInp = form.elements.name;
  setTimeout(() => !team && nameInp.focus(), 250);
  const paint = () => {
    sh.el.querySelector('.logo-btn').innerHTML = crest({ name: nameInp.value || '?', logo }, 'xl') + `<span class="logo-badge">${ic('camera')}</span>`;
    sh.el.querySelector('[data-nologo]').hidden = !logo;
  };
  nameInp.addEventListener('input', paint);
  sh.el.querySelectorAll('[data-logo]').forEach((b) => b.addEventListener('click', async () => {
    const img = await pickImage();
    if (img) { logo = img; paint(); }
  }));
  sh.el.querySelector('[data-nologo]').addEventListener('click', () => { logo = ''; paint(); });

  function save() {
    const n = nameInp.value.trim();
    if (!n) { toast('Poné el nombre del equipo'); nameInp.focus(); return; }
    const dup = store.list('teams').find((t) => t.name.toLowerCase() === n.toLowerCase() && t.id !== team?.id);
    if (dup && !team) { toast('Ese equipo ya existe, lo elegí por vos'); sh.close(); onSaved && onSaved(dup); return; }
    const t = store.upsert('teams', { id: team?.id, name: n, short: form.elements.short.value.trim().toUpperCase(), logo });
    sh.close();
    onSaved && onSaved(t);
  }
}

export function openTeamPicker({ multi = false, selected = [], exclude = [], title, onDone }) {
  const sel = new Set(selected);
  let q = '';
  const sh = openSheet({
    title: title || (multi ? 'Elegir equipos' : 'Elegir equipo'),
    cls: 'tall',
    body: `<div class="picker">
      <div class="search">${ic('search')}<input type="search" placeholder="Buscar o escribir un equipo nuevo" data-q></div>
      <button type="button" class="row-btn add-row" data-new>${ic('plus')}<span>Crear equipo nuevo</span></button>
      <div class="pick-list" data-list></div>
    </div>`,
    footer: multi ? `<button class="btn primary block" data-done type="button">Listo</button>` : '',
  });
  const listEl = sh.el.querySelector('[data-list]');
  const newBtn = sh.el.querySelector('[data-new] span');
  function render() {
    const teams = store.list('teams')
      .filter((t) => !exclude.includes(t.id) && t.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
    newBtn.textContent = q ? `Crear “${q}”` : 'Crear equipo nuevo';
    listEl.innerHTML = teams.length
      ? teams.map((t) => `<button type="button" class="row-btn ${sel.has(t.id) ? 'sel' : ''}" data-id="${t.id}">${crest(t, 'sm')}<span>${esc(t.name)}</span>${multi ? `<span class="check">${ic('check')}</span>` : ic('chev', 'muted')}</button>`).join('')
      : `<p class="muted center pad">${store.list('teams').length ? 'No hay equipos con ese nombre.' : 'Todavía no creaste equipos. Creá el primero arriba.'}</p>`;
    if (multi) sh.el.querySelector('[data-done]').textContent = `Listo${sel.size ? ` (${sel.size})` : ''}`;
  }
  render();
  sh.el.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value.trim(); render(); });
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    if (multi) { sel.has(b.dataset.id) ? sel.delete(b.dataset.id) : sel.add(b.dataset.id); render(); }
    else { sh.close(); onDone(b.dataset.id); }
  });
  sh.el.querySelector('[data-new]').addEventListener('click', () => {
    openTeamForm({ name: q, onSaved: (t) => {
      if (multi) { sel.add(t.id); render(); } else { sh.close(); onDone(t.id); }
    } });
  });
  if (multi) sh.el.querySelector('[data-done]').addEventListener('click', () => { sh.close(); onDone([...sel]); });
}

// ═════════════════════════════════════════════════════════
//  MATCH
// ═════════════════════════════════════════════════════════
export function openMatchForm({ match = null, defaults = {}, onSaved } = {}) {
  const s = store.get();
  const base = {
    status: 'scheduled', official: true, played: true, myTeam: 'home', homeId: '', awayId: '',
    date: todayISO(), time: '', venue: '', competition: '', tournamentId: '', round: '',
    result: { mode: 'exact', home: 0, away: 0, winner: '' },
    minutes: '', minutesExact: false, starter: '', position: s.profile.position || '', goals: 0, assists: 0,
    mvp: 'unknown', rating: 0, events: [], prediction: { mode: 'none', home: 1, away: 0, winner: '' },
    notes: '', suspendReason: '', newDate: '', motm: '',
  };
  const m = { ...base, ...clone(match || {}), ...defaults };
  m.result = { ...base.result, ...(m.result || {}) };
  m.prediction = { ...base.prediction, ...(m.prediction || {}) };
  let events = (m.events || []).map((e) => ({ ...e }));
  const slots = { home: m.homeId, away: m.awayId };
  const tours = s.tournaments;

  const body = `<form class="form" autocomplete="off">
    <section class="fs">
      <label class="fs-label">Estado del partido</label>
      ${seg('status', [['scheduled', 'Por jugarse'], ['finished', 'Finalizado'], ['suspended', 'Suspendido']], m.status, { cls: 'seg-status' })}
      <p class="hint" data-show="status:scheduled">Un partido que todavía no se jugó.</p>
      <p class="hint" data-show="status:finished">Un partido que ya se jugó.</p>
      <p class="hint" data-show="status:suspended">Iba a jugarse pero al final no se jugó.</p>
    </section>

    <section class="fs grid2">
      <div><label class="fs-label">Tipo</label>${seg('official', [['official', 'Oficial'], ['friendly', 'No oficial']], m.official === false ? 'friendly' : 'official', { small: true })}</div>
      <div><label class="fs-label">¿Quién juega?</label>${seg('played', [['yes', 'Yo juego'], ['no', 'De otros']], m.played === false ? 'no' : 'yes', { small: true })}</div>
    </section>

    <section class="fs">
      <label class="fs-label">Equipos</label>
      <div class="versus">
        <button type="button" class="team-slot" data-slot="home"></button>
        <button type="button" class="swap" data-swap aria-label="Invertir local y visitante">${ic('swap')}</button>
        <button type="button" class="team-slot" data-slot="away"></button>
      </div>
      <div data-show="played:yes" class="mt">
        <label class="fs-label">¿Con qué equipo jugaste?</label>
        ${seg('myTeam', [['home', '<span data-tn="home">Local</span>'], ['away', '<span data-tn="away">Visitante</span>']], m.myTeam || 'home')}
      </div>
    </section>

    <section class="fs" data-show="status:suspended">
      <label class="field"><span>Razón <em>(opcional)</em></span><textarea name="suspendReason" rows="2" placeholder="Lluvia, falta de árbitro, cancha cerrada…">${esc(m.suspendReason)}</textarea></label>
      <label class="field"><span>Nueva fecha <em>(si se reprogramó)</em></span><input type="date" name="newDate" value="${esc(m.newDate)}"></label>
    </section>

    <section class="fs" data-show="status:finished">
      <label class="fs-label">Resultado final</label>
      ${seg('rmode', [['exact', 'Exacto'], ['approx', 'Aproximado'], ['winner', 'Sé quién ganó'], ['unknown', 'No sé']], m.result.mode, { small: true })}
      <div class="score-edit" data-show="rmode:exact,approx">
        <div class="score-col"><span data-tn="home">Local</span>${stepper('rHome', m.result.home ?? 0, { max: 99, label: 'Goles local' })}</div>
        <span class="score-dash">–</span>
        <div class="score-col"><span data-tn="away">Visitante</span>${stepper('rAway', m.result.away ?? 0, { max: 99, label: 'Goles visitante' })}</div>
      </div>
      <p class="hint" data-show="rmode:approx">Poné el resultado que creés que fue. Se marca con “~”.</p>
      <div data-show="rmode:winner" class="mt">
        ${seg('rWinner', [['home', '<span data-tn="home">Local</span>'], ['draw', 'Empate'], ['away', '<span data-tn="away">Visitante</span>']], m.result.winner)}
        <p class="hint">Cuenta los puntos en la tabla, pero no los goles.</p>
      </div>
      <p class="hint" data-show="rmode:unknown">No se cuenta en tablas ni en victorias/derrotas.</p>
    </section>

    <section class="fs" data-show="status:finished;played:yes">
      <label class="fs-label">Mi partido</label>
      <div class="grid2">
        <div><span class="mini-label">Goles</span>${stepper('goals', m.goals ?? 0, { max: 50 })}</div>
        <div><span class="mini-label">Asistencias</span>${stepper('assists', m.assists ?? 0, { max: 50 })}</div>
      </div>
      <div class="mt">
        <span class="mini-label">Minutos jugados</span>
        <div class="minutes-row">
          ${stepper('minutes', m.minutes, { max: 200, step: 5 })}
          <label class="check-pill"><input type="checkbox" name="minutesExact" ${m.minutesExact ? 'checked' : ''}><span>Exactos</span></label>
        </div>
        <div class="quick-chips" data-quick-min>${[20, 30, 45, 60, 70, 80, 90].map((n) => `<button type="button" class="chip-btn" data-min="${n}">${n}'</button>`).join('')}</div>
        <p class="hint">Si no marcás “Exactos”, se guardan como aproximados.</p>
      </div>
      <div class="grid2 mt">
        <div><span class="mini-label">Arranqué</span>${seg('starter', [['starter', 'Titular'], ['sub', 'Suplente']], m.starter, { small: true })}</div>
        <label class="field"><span>Posición</span><select name="position"><option value="">—</option>${POSITIONS.map((p) => `<option ${p === m.position ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      </div>
      <div class="mt">
        <span class="mini-label">¿Fuiste el mejor de la cancha? (MVP)</span>
        ${seg('mvp', [['yes', '⭐ Sí'], ['no', 'No'], ['unknown', 'No lo sé']], m.mvp)}
      </div>
      <div class="mt" data-show="mvp:no,unknown">
        <label class="field"><span>¿Quién fue la figura? <em>(opcional)</em></span><input name="motm" value="${esc(m.motm)}" placeholder="Nombre"></label>
      </div>
      <div class="mt">
        <span class="mini-label">Mi calificación <b class="rating-val" data-rating-val></b></span>
        <input type="range" name="rating" min="0" max="10" step="0.5" value="${+m.rating || 0}" class="range">
        <div class="range-legend"><span>Sin nota</span><span>5</span><span>10</span></div>
      </div>
    </section>

    <section class="fs" data-show="status:finished;played:yes">
      <label class="fs-label">Eventos</label>
      <div class="ev-chips">${Object.entries(EVENT_TYPES).map(([k, v]) => `<button type="button" class="chip-btn" data-addev="${k}">${v.icon} ${v.label}</button>`).join('')}</div>
      <div class="ev-list" data-evlist></div>
    </section>

    <section class="fs" data-show="status:scheduled">
      <label class="fs-label">Predicción ${ic('crystal', 'inline')}</label>
      ${seg('pmode', [['none', 'Sin predicción'], ['score', 'Resultado'], ['winner', 'Ganador']], m.prediction.mode, { small: true })}
      <div class="score-edit" data-show="pmode:score">
        <div class="score-col"><span data-tn="home">Local</span>${stepper('pHome', m.prediction.home ?? 0, { max: 99 })}</div>
        <span class="score-dash">–</span>
        <div class="score-col"><span data-tn="away">Visitante</span>${stepper('pAway', m.prediction.away ?? 0, { max: 99 })}</div>
      </div>
      <div class="mt" data-show="pmode:winner">${seg('pWinner', [['home', '<span data-tn="home">Local</span>'], ['draw', 'Empate'], ['away', '<span data-tn="away">Visitante</span>']], m.prediction.winner)}</div>
    </section>

    <section class="fs">
      <label class="fs-label">Detalles</label>
      <div class="grid2">
        <label class="field"><span>Fecha</span><input type="date" name="date" value="${esc(m.date)}"></label>
        <label class="field"><span>Hora</span><input type="time" name="time" value="${esc(m.time)}"></label>
      </div>
      <label class="field"><span>Cancha / lugar</span><input name="venue" value="${esc(m.venue)}" placeholder="Ej: Club Atlético, cancha 2"></label>
      ${tours.length ? `<label class="field"><span>Torneo</span><select name="tournamentId"><option value="">Ninguno</option>${tours.map((t) => `<option value="${t.id}" ${t.id === m.tournamentId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : '<input type="hidden" name="tournamentId" value="">'}
      <div class="grid2">
        <label class="field" data-show="tournamentId:"><span>Competición</span><input name="competition" value="${esc(m.competition)}" placeholder="Liga, copa, amistoso…" list="comp-list"></label>
        <label class="field"><span>Fecha n° / jornada</span><input name="round" inputmode="numeric" value="${esc(m.round)}" placeholder="Ej: 5"></label>
      </div>
      <datalist id="comp-list">${[...new Set(s.matches.map((x) => x.competition).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <label class="field"><span>Notas del partido</span><textarea name="notes" rows="3" placeholder="Cómo te sentiste, qué mejorar, anécdotas…">${esc(m.notes)}</textarea></label>
    </section>
  </form>`;

  const sh = openSheet({ title: match ? 'Editar partido' : 'Nuevo partido', body, footer: footer(), cls: 'tall' });
  const form = bindForm(sh, save);
  const el = sh.el;

  function paintSlots() {
    for (const side of ['home', 'away']) {
      const t = store.find('teams', slots[side]);
      el.querySelector(`[data-slot="${side}"]`).innerHTML = `${crest(t, 'lg')}<span class="ts-name">${t ? esc(t.name) : 'Elegir equipo'}</span><span class="ts-side">${side === 'home' ? 'Local' : 'Visitante'}</span>`;
      el.querySelector(`[data-slot="${side}"]`).classList.toggle('empty', !t);
      el.querySelectorAll(`[data-tn="${side}"]`).forEach((x) => { x.textContent = t ? t.name : side === 'home' ? 'Local' : 'Visitante'; });
    }
  }
  paintSlots();
  el.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => {
    const side = b.dataset.slot;
    const other = slots[side === 'home' ? 'away' : 'home'];
    openTeamPicker({ title: side === 'home' ? 'Equipo local' : 'Equipo visitante', exclude: other ? [other] : [], onDone: (id) => { slots[side] = id; paintSlots(); } });
  }));
  el.querySelector('[data-swap]').addEventListener('click', () => {
    [slots.home, slots.away] = [slots.away, slots.home];
    const mt = form.elements.myTeam;
    const flip = mt.value === 'home' ? 'away' : 'home';
    mt.closest('.seg').querySelector(`[data-val="${flip}"]`).click();
    paintSlots();
  });

  // tournament → auto official + competition
  form.elements.tournamentId?.addEventListener?.('change', () => {
    const t = store.find('tournaments', form.elements.tournamentId.value);
    if (t) form.elements.official.closest('.seg').querySelector(`[data-val="${t.official === false ? 'friendly' : 'official'}"]`).click();
  });

  // minutes quick chips
  el.querySelector('[data-quick-min]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-min]');
    if (b) form.elements.minutes.value = b.dataset.min;
  });

  const ratingVal = el.querySelector('[data-rating-val]');
  const paintRating = () => { const v = +form.elements.rating.value; ratingVal.textContent = v ? v.toFixed(1).replace('.0', '') : '—'; };
  form.elements.rating.addEventListener('input', paintRating);
  paintRating();

  // events
  const evList = el.querySelector('[data-evlist]');
  function paintEvents() {
    evList.innerHTML = events.length ? events.map((e) => {
      const t = EVENT_TYPES[e.type] || EVENT_TYPES.other;
      return `<div class="ev-item" data-ev="${e.id}">
        <span class="ev-ico">${t.icon}</span>
        <div class="ev-main"><b>${t.label}</b><input class="ev-note" data-f="note" value="${esc(e.note || '')}" placeholder="${e.type === 'injury' ? 'Qué te pasó (ej: esguince tobillo)' : 'Detalle (opcional)'}"></div>
        <input class="ev-min" data-f="minute" inputmode="numeric" value="${esc(e.minute ?? '')}" placeholder="min" aria-label="Minuto">
        <button type="button" class="icon-btn sm" data-delev aria-label="Quitar">${ic('x')}</button>
      </div>`;
    }).join('') : '<p class="hint">Tocá un evento para agregarlo. Podés agregar el mismo varias veces.</p>';
  }
  paintEvents();
  el.querySelector('.ev-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-addev]');
    if (!b) return;
    events.push({ id: uid(), type: b.dataset.addev, minute: '', note: '' });
    paintEvents();
    evList.lastElementChild?.querySelector('.ev-note')?.focus({ preventScroll: true });
  });
  evList.addEventListener('input', (e) => {
    const item = e.target.closest('[data-ev]');
    const f = e.target.dataset.f;
    if (!item || !f) return;
    const ev = events.find((x) => x.id === item.dataset.ev);
    ev[f] = e.target.value;
  });
  evList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-delev]');
    if (!b) return;
    events = events.filter((x) => x.id !== b.closest('[data-ev]').dataset.ev);
    paintEvents();
  });

  function save() {
    const v = (n) => form.elements[n]?.value ?? '';
    if (!slots.home || !slots.away) { toast('Elegí los dos equipos'); return; }
    if (slots.home === slots.away) { toast('Los equipos tienen que ser distintos'); return; }
    const played = v('played') === 'yes';
    const tid = v('tournamentId');
    const tour = store.find('tournaments', tid);
    const data = {
      id: match?.id,
      status: v('status'),
      official: v('official') === 'official',
      played,
      homeId: slots.home, awayId: slots.away,
      myTeam: played ? v('myTeam') : '',
      date: v('date'), time: v('time'), venue: v('venue').trim(),
      tournamentId: tid,
      competition: tour ? tour.name : v('competition').trim(),
      round: v('round').trim(),
      suspendReason: v('suspendReason').trim(), newDate: v('newDate'),
      result: { mode: v('rmode'), home: int0(v('rHome')), away: int0(v('rAway')), winner: v('rWinner') },
      minutes: v('minutes') === '' ? '' : int0(v('minutes')),
      minutesExact: form.elements.minutesExact.checked,
      starter: v('starter'), position: v('position'),
      goals: int0(v('goals')), assists: int0(v('assists')),
      mvp: v('mvp'), motm: v('mvp') === 'yes' ? '' : v('motm').trim(),
      rating: num(v('rating')) || 0,
      events: events.map((e) => ({ ...e, minute: e.minute === '' ? '' : int0(e.minute), note: (e.note || '').trim() })),
      prediction: { mode: v('pmode'), home: int0(v('pHome')), away: int0(v('pAway')), winner: v('pWinner') },
      notes: v('notes').trim(),
    };
    if (data.status === 'finished' && data.result.mode === 'winner' && !data.result.winner) { toast('Elegí quién ganó (o marcá “No sé”)'); return; }
    if (data.status === 'scheduled' && data.prediction.mode === 'winner' && !data.prediction.winner) data.prediction.mode = 'none';
    const saved = store.upsert('matches', data);
    toast(match ? 'Partido actualizado' : 'Partido agregado', { type: 'ok' });
    sh.close().then(() => onSaved && onSaved(saved));
  }
}

// ═════════════════════════════════════════════════════════
//  TOURNAMENT
// ═════════════════════════════════════════════════════════
export function openTournamentForm({ tour = null, onSaved } = {}) {
  const t = { name: '', season: todayISO().slice(0, 4), double: false, points: { w: 3, d: 1, l: 0 }, teamIds: [], myTeamId: '', official: true, notes: '', promo: 0, releg: 0, ...clone(tour || {}) };
  let teamIds = [...t.teamIds];
  let myTeamId = t.myTeamId;
  const hasMatches = tour && store.list('matches').some((m) => m.tournamentId === tour.id);
  const sh = openSheet({
    title: tour ? 'Editar torneo' : 'Nuevo torneo', cls: 'tall',
    body: `<form class="form">
      <section class="fs">
        <label class="field"><span>Nombre</span><input name="name" value="${esc(t.name)}" placeholder="Ej: Liga del barrio 2026" maxlength="50"></label>
        <div class="grid2">
          <label class="field"><span>Temporada</span><input name="season" value="${esc(t.season)}" placeholder="2026"></label>
          <div><span class="mini-label">Tipo</span>${seg('official', [['official', 'Oficial'], ['friendly', 'No oficial']], t.official === false ? 'friendly' : 'official', { small: true })}</div>
        </div>
      </section>
      <section class="fs">
        <label class="fs-label">Equipos participantes</label>
        <div class="tour-teams" data-teams></div>
        <button type="button" class="btn ghost block" data-addteams>${ic('plus')} Agregar equipos</button>
        <p class="hint">Tocá la ⭐ para marcar tu equipo.</p>
      </section>
      <section class="fs">
        <label class="fs-label">Formato</label>
        ${seg('double', [['no', 'Solo ida'], ['yes', 'Ida y vuelta']], t.double ? 'yes' : 'no')}
        <div class="grid3 mt">
          <div><span class="mini-label">Pts victoria</span>${stepper('pw', t.points.w, { max: 10 })}</div>
          <div><span class="mini-label">Pts empate</span>${stepper('pd', t.points.d, { max: 10 })}</div>
          <div><span class="mini-label">Pts derrota</span>${stepper('pl', t.points.l, { max: 10 })}</div>
        </div>
        <div class="grid2 mt">
          <div><span class="mini-label">Clasifican / ascienden</span>${stepper('promo', t.promo || 0, { max: 30 })}</div>
          <div><span class="mini-label">Descienden</span>${stepper('releg', t.releg || 0, { max: 30 })}</div>
        </div>
        ${!hasMatches ? `<label class="check-row mt"><input type="checkbox" name="gen" checked><span><b>Generar el fixture automáticamente</b><br><small class="muted">Todos contra todos. Después podés cargar fechas y resultados.</small></span></label>` : ''}
      </section>
      <section class="fs">
        <label class="field"><span>Notas <em>(opcional)</em></span><textarea name="notes" rows="2" placeholder="Reglamento, premios, sede…">${esc(t.notes)}</textarea></label>
      </section>
    </form>`,
    footer: footer(tour ? 'Guardar' : 'Crear torneo'),
  });
  const form = bindForm(sh, save);
  const box = sh.el.querySelector('[data-teams]');
  function paint() {
    box.innerHTML = teamIds.length ? teamIds.map((id) => {
      const tm = store.find('teams', id);
      return `<div class="tt-item ${id === myTeamId ? 'mine' : ''}" data-id="${id}">${crest(tm, 'sm')}<span>${esc(tm?.name || '?')}</span>
        <button type="button" class="icon-btn sm star" data-star aria-label="Mi equipo">${ic('star')}</button>
        <button type="button" class="icon-btn sm" data-rm aria-label="Quitar">${ic('x')}</button></div>`;
    }).join('') : '<p class="hint">Todavía no agregaste equipos.</p>';
  }
  paint();
  box.addEventListener('click', (e) => {
    const it = e.target.closest('[data-id]');
    if (!it) return;
    if (e.target.closest('[data-star]')) { myTeamId = myTeamId === it.dataset.id ? '' : it.dataset.id; paint(); }
    if (e.target.closest('[data-rm]')) { teamIds = teamIds.filter((x) => x !== it.dataset.id); if (myTeamId === it.dataset.id) myTeamId = ''; paint(); }
  });
  sh.el.querySelector('[data-addteams]').addEventListener('click', () => {
    openTeamPicker({ multi: true, selected: teamIds, onDone: (ids) => { teamIds = ids; if (!ids.includes(myTeamId)) myTeamId = ''; paint(); } });
  });

  function save() {
    const v = (n) => form.elements[n]?.value ?? '';
    const name = v('name').trim();
    if (!name) { toast('Poné un nombre al torneo'); form.elements.name.focus(); return; }
    const official = v('official') === 'official';
    const saved = store.upsert('tournaments', {
      id: tour?.id, name, season: v('season').trim(), official, double: v('double') === 'yes',
      points: { w: int0(v('pw')), d: int0(v('pd')), l: int0(v('pl')) },
      promo: int0(v('promo')), releg: int0(v('releg')),
      teamIds, myTeamId, notes: v('notes').trim(),
    });
    if (form.elements.gen?.checked && teamIds.length >= 2) {
      generateFixture(saved);
    }
    // keep "played/myTeam" in sync with the chosen team
    if (tour && myTeamId !== tour.myTeamId) syncMyTeam(saved);
    toast(tour ? 'Torneo actualizado' : 'Torneo creado', { type: 'ok' });
    sh.close().then(() => onSaved && onSaved(saved));
  }
}

export function generateFixture(tour) {
  const rounds = roundRobin(tour.teamIds, tour.double);
  const out = [];
  rounds.forEach((pairs, i) => pairs.forEach(([h, a]) => {
    const mine = tour.myTeamId && (h === tour.myTeamId || a === tour.myTeamId);
    out.push({
      status: 'scheduled', tournamentId: tour.id, competition: tour.name, round: String(i + 1),
      homeId: h, awayId: a, official: tour.official !== false, played: !!mine,
      myTeam: mine ? (h === tour.myTeamId ? 'home' : 'away') : '',
      date: '', time: '', result: { mode: 'exact', home: 0, away: 0, winner: '' },
      goals: 0, assists: 0, mvp: 'unknown', events: [], prediction: { mode: 'none' },
    });
  }));
  store.upsertMany('matches', out);
  return out.length;
}

function syncMyTeam(tour) {
  for (const m of store.list('matches').filter((x) => x.tournamentId === tour.id && x.status === 'scheduled')) {
    const mine = tour.myTeamId && (m.homeId === tour.myTeamId || m.awayId === tour.myTeamId);
    if (mine) store.upsert('matches', { id: m.id, played: true, myTeam: m.homeId === tour.myTeamId ? 'home' : 'away' });
  }
}

// ═════════════════════════════════════════════════════════
//  PROFILE
// ═════════════════════════════════════════════════════════
export function openProfileForm() {
  const p = store.get().profile;
  let photo = p.photo || '';
  const posOpts = (sel) => `<option value="">—</option>${POSITIONS.map((x) => `<option ${x === sel ? 'selected' : ''}>${x}</option>`).join('')}`;
  const sh = openSheet({
    title: 'Mi perfil', cls: 'tall',
    body: `<form class="form">
      <div class="logo-pick">
        <button type="button" class="logo-btn round" data-photo>${avatar(p, 'xl')}<span class="logo-badge">${ic('camera')}</span></button>
        <div class="logo-actions"><button type="button" class="link" data-photo>Cambiar foto</button><button type="button" class="link muted" data-nophoto ${photo ? '' : 'hidden'}>Quitar</button></div>
      </div>
      <div class="grid2">
        <label class="field"><span>Nombre</span><input name="name" value="${esc(p.name)}" placeholder="Tu nombre"></label>
        <label class="field"><span>Apodo</span><input name="nickname" value="${esc(p.nickname)}" placeholder="Opcional"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Posición</span><select name="position">${posOpts(p.position)}</select></label>
        <label class="field"><span>Posición secundaria</span><select name="position2">${posOpts(p.position2)}</select></label>
      </div>
      <div class="grid3">
        <label class="field"><span>Dorsal</span><input name="number" inputmode="numeric" maxlength="3" value="${esc(p.number)}" placeholder="10"></label>
        <label class="field"><span>Altura (cm)</span><input name="height" inputmode="numeric" maxlength="3" value="${esc(p.height)}" placeholder="175"></label>
        <label class="field"><span>Nacimiento</span><input type="date" name="birth" value="${esc(p.birth)}"></label>
      </div>
      <div><span class="mini-label">Pie hábil</span>${seg('foot', [['Derecho', 'Derecho'], ['Izquierdo', 'Izquierdo'], ['Ambidiestro', 'Ambos']], p.foot)}</div>
      <label class="field mt"><span>Sobre mí</span><textarea name="bio" rows="3" placeholder="Tu estilo de juego, ídolos, sueños…">${esc(p.bio)}</textarea></label>
    </form>`,
    footer: footer(),
  });
  const form = bindForm(sh, save);
  const paint = () => {
    sh.el.querySelector('.logo-btn').innerHTML = avatar({ name: form.elements.name.value, photo }, 'xl') + `<span class="logo-badge">${ic('camera')}</span>`;
    sh.el.querySelector('[data-nophoto]').hidden = !photo;
  };
  sh.el.querySelectorAll('[data-photo]').forEach((b) => b.addEventListener('click', async () => { const img = await pickImage({ max: 320 }); if (img) { photo = img; paint(); } }));
  sh.el.querySelector('[data-nophoto]').addEventListener('click', () => { photo = ''; paint(); });
  function save() {
    const v = (n) => form.elements[n].value.trim();
    store.setProfile({ name: v('name'), nickname: v('nickname'), position: v('position'), position2: v('position2'), number: v('number'), height: v('height'), birth: v('birth'), foot: v('foot'), bio: v('bio'), photo });
    toast('Perfil guardado', { type: 'ok' });
    sh.close();
  }
}

// ═════════════════════════════════════════════════════════
//  CLUB (career path)
// ═════════════════════════════════════════════════════════
export function openClubForm({ club = null } = {}) {
  const c = { name: '', logo: '', from: '', to: '', current: false, category: '', number: '', teamId: '', notes: '', ...clone(club || {}) };
  let logo = c.logo;
  const teams = store.list('teams').slice().sort((a, b) => a.name.localeCompare(b.name));
  const sh = openSheet({
    title: club ? 'Editar club' : 'Agregar club', cls: 'tall',
    body: `<form class="form">
      <div class="logo-pick">
        <button type="button" class="logo-btn" data-logo>${crest({ name: c.name || '?', logo }, 'xl')}<span class="logo-badge">${ic('camera')}</span></button>
        <div class="logo-actions"><button type="button" class="link" data-logo>Escudo</button><button type="button" class="link muted" data-nologo ${logo ? '' : 'hidden'}>Quitar</button></div>
      </div>
      ${teams.length ? `<label class="field"><span>Vincular con un equipo guardado <em>(para ver tus stats ahí)</em></span><select name="teamId"><option value="">No vincular</option>${teams.map((t) => `<option value="${t.id}" ${t.id === c.teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : '<input type="hidden" name="teamId" value="">'}
      <label class="field"><span>Nombre del club</span><input name="name" value="${esc(c.name)}" placeholder="Ej: Club Atlético Barrio"></label>
      <div class="grid2">
        <label class="field"><span>Desde (año)</span><input name="from" inputmode="numeric" maxlength="4" value="${esc(c.from)}" placeholder="2022"></label>
        <label class="field" data-show="current:false"><span>Hasta (año)</span><input name="to" inputmode="numeric" maxlength="4" value="${esc(c.to)}" placeholder="2024"></label>
      </div>
      <label class="check-row"><input type="checkbox" name="current" ${c.current ? 'checked' : ''}><span>Juego acá actualmente</span></label>
      <div class="grid2 mt">
        <label class="field"><span>Categoría / división</span><input name="category" value="${esc(c.category)}" placeholder="Primera, Sub-17…"></label>
        <label class="field"><span>Dorsal</span><input name="number" inputmode="numeric" maxlength="3" value="${esc(c.number)}" placeholder="9"></label>
      </div>
      <label class="field"><span>Notas / logros</span><textarea name="notes" rows="2" placeholder="Campeón 2023, capitán…">${esc(c.notes)}</textarea></label>
    </form>`,
    footer: footer(),
  });
  const form = bindForm(sh, save);
  const paint = () => {
    sh.el.querySelector('.logo-btn').innerHTML = crest({ name: form.elements.name.value || '?', logo }, 'xl') + `<span class="logo-badge">${ic('camera')}</span>`;
    sh.el.querySelector('[data-nologo]').hidden = !logo;
  };
  form.elements.name.addEventListener('input', paint);
  form.elements.teamId?.addEventListener?.('change', () => {
    const t = store.find('teams', form.elements.teamId.value);
    if (t) { if (!form.elements.name.value) form.elements.name.value = t.name; if (!logo && t.logo) logo = t.logo; paint(); }
  });
  sh.el.querySelectorAll('[data-logo]').forEach((b) => b.addEventListener('click', async () => { const img = await pickImage(); if (img) { logo = img; paint(); } }));
  sh.el.querySelector('[data-nologo]').addEventListener('click', () => { logo = ''; paint(); });
  function save() {
    const v = (n) => form.elements[n].value.trim();
    if (!v('name')) { toast('Poné el nombre del club'); return; }
    const current = form.elements.current.checked;
    store.upsert('clubs', { id: club?.id, name: v('name'), logo, from: v('from'), to: current ? '' : v('to'), current, category: v('category'), number: v('number'), teamId: v('teamId'), notes: v('notes') });
    toast('Club guardado', { type: 'ok' });
    sh.close();
  }
}

// ═════════════════════════════════════════════════════════
//  INJURY
// ═════════════════════════════════════════════════════════
const INJURY_TYPES = ['Esguince de tobillo', 'Esguince de rodilla', 'Desgarro', 'Contractura', 'Distensión', 'Rotura de ligamentos', 'Fractura', 'Tendinitis', 'Golpe / contusión', 'Pubalgia', 'Lumbalgia'];
export function openInjuryForm({ injury = null } = {}) {
  const i = { type: '', zone: '', date: todayISO(), days: '', status: 'recovered', notes: '', ...clone(injury || {}) };
  const sh = openSheet({
    title: injury ? 'Editar lesión' : 'Registrar lesión', cls: 'dialog',
    body: `<form class="form">
      <label class="field"><span>Lesión</span><input name="type" list="inj-list" value="${esc(i.type)}" placeholder="Ej: Esguince de tobillo"></label>
      <datalist id="inj-list">${INJURY_TYPES.map((x) => `<option value="${x}">`).join('')}</datalist>
      <div class="grid2">
        <label class="field"><span>Fecha</span><input type="date" name="date" value="${esc(i.date)}"></label>
        <label class="field"><span>Días de baja</span><input name="days" inputmode="numeric" value="${esc(i.days)}" placeholder="Ej: 15"></label>
      </div>
      <div><span class="mini-label">Estado</span>${seg('status', [['recovered', 'Recuperado'], ['active', 'En recuperación']], i.status)}</div>
      <label class="field mt"><span>Notas</span><textarea name="notes" rows="2" placeholder="Tratamiento, cómo pasó…">${esc(i.notes)}</textarea></label>
    </form>`,
    footer: footer(),
  });
  const form = bindForm(sh, save);
  function save() {
    const v = (n) => form.elements[n].value.trim();
    if (!v('type')) { toast('Escribí qué lesión fue'); return; }
    store.upsert('injuries', { id: injury?.id, type: v('type'), date: v('date'), days: v('days') ? int0(v('days')) : '', status: v('status'), notes: v('notes') });
    toast('Lesión guardada', { type: 'ok' });
    sh.close();
  }
}

// ═════════════════════════════════════════════════════════
//  GOAL (objetivo)
// ═════════════════════════════════════════════════════════
export function openGoalForm({ goal = null } = {}) {
  const g = { stat: 'goals', target: 10, year: todayISO().slice(0, 4), official: '', ...clone(goal || {}) };
  const ys = years(store.list('matches'));
  const next = String(+todayISO().slice(0, 4) + 1);
  if (!ys.includes(next)) ys.unshift(next);
  const sh = openSheet({
    title: goal ? 'Editar objetivo' : 'Nuevo objetivo', cls: 'dialog',
    body: `<form class="form">
      <label class="field"><span>Quiero llegar a…</span><select name="stat">${Object.entries(STAT_LABELS).map(([k, l]) => `<option value="${k}" ${k === g.stat ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div><span class="mini-label">Meta</span>${stepper('target', g.target, { min: 1, max: 9999 })}</div>
      <div class="grid2 mt">
        <label class="field"><span>Período</span><select name="year"><option value="">Toda la carrera</option>${ys.map((y) => `<option ${y === g.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        <label class="field"><span>Partidos</span><select name="official"><option value="">Todos</option><option value="official" ${g.official === 'official' ? 'selected' : ''}>Oficiales</option><option value="friendly" ${g.official === 'friendly' ? 'selected' : ''}>No oficiales</option></select></label>
      </div>
    </form>`,
    footer: footer(),
  });
  const form = bindForm(sh, save);
  function save() {
    const v = (n) => form.elements[n].value;
    store.upsert('goals', { id: goal?.id, stat: v('stat'), target: Math.max(1, int0(v('target'))), year: v('year'), official: v('official') });
    toast('Objetivo guardado', { type: 'ok' });
    sh.close();
  }
}

// ═════════════════════════════════════════════════════════
//  NOTE
// ═════════════════════════════════════════════════════════
export const NOTE_COLORS = ['default', 'lime', 'sky', 'amber', 'rose', 'violet'];
export function openNoteEditor({ note = null } = {}) {
  const n = { title: '', body: '', color: 'default', pinned: false, tag: '', ...clone(note || {}) };
  let color = n.color, pinned = n.pinned, deleted = false;
  const sh = openSheet({
    title: note ? 'Nota' : 'Nueva nota', cls: 'tall note-sheet',
    headActions: `<button type="button" class="icon-btn ${pinned ? 'on' : ''}" data-pin aria-label="Fijar">${ic('tack')}</button>${note ? `<button type="button" class="icon-btn" data-del aria-label="Borrar">${ic('trash')}</button>` : ''}`,
    body: `<form class="form note-form" data-color="${color}">
      <input class="note-title" name="title" value="${esc(n.title)}" placeholder="Título" maxlength="80">
      <textarea class="note-body" name="body" placeholder="Escribí lo que quieras: entrenamientos, sensaciones, objetivos, tácticas…">${esc(n.body)}</textarea>
      <div class="note-tools">
        <div class="swatches">${NOTE_COLORS.map((c) => `<button type="button" class="swatch sw-${c} ${c === color ? 'on' : ''}" data-color="${c}" aria-label="Color ${c}"></button>`).join('')}</div>
        <input class="note-tag" name="tag" value="${esc(n.tag)}" placeholder="#etiqueta" maxlength="20" list="tag-list">
        <datalist id="tag-list">${[...new Set(store.list('notes').map((x) => x.tag).filter(Boolean))].map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      </div>
    </form>`,
    footer: `<button class="btn primary block" data-save type="button">Listo</button>`,
    onClose: () => persist(),
  });
  const form = sh.el.querySelector('form');
  const ta = form.elements.body;
  setTimeout(() => (note ? null : form.elements.title.focus()), 250);
  sh.el.querySelector('.swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    color = b.dataset.color;
    form.dataset.color = color;
    sh.el.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b));
  });
  sh.el.querySelector('[data-pin]').addEventListener('click', (e) => { pinned = !pinned; e.currentTarget.classList.toggle('on', pinned); });
  sh.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (await confirmDialog('La nota se va a borrar.', { ok: 'Borrar', danger: true })) { deleted = true; store.remove('notes', note.id); sh.close(); toast('Nota borrada'); }
  });
  sh.el.querySelector('[data-save]').addEventListener('click', () => sh.close());
  let savedOnce = false;
  function persist() {
    if (deleted || savedOnce) return;
    savedOnce = true;
    const title = form.elements.title.value.trim(), body = ta.value.trim(), tag = form.elements.tag.value.trim().replace(/^#/, '');
    if (!title && !body) { if (note) { store.remove('notes', note.id); } return; }
    if (note && title === n.title && body === n.body && color === n.color && pinned === n.pinned && tag === n.tag) return;
    store.upsert('notes', { id: note?.id, title, body, color, pinned, tag });
  }
}

export { isNum };
