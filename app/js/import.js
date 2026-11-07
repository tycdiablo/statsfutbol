// Lee un mensaje de fixture (texto de WhatsApp del club) y lo convierte en partidos.
// Todo lo que viene de un fixture del club es oficial. Si la fecha ya pasó, el
// partido queda como jugado (el resultado se completa después).
import * as store from './store.js';
import { esc, todayISO, titleCase } from './util.js';
import { openSheet, toast } from './ui.js';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{203C}\u{2049}\u{FE0F}\u{200D}]/gu;
const MONTHS_OK = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/i;

const clean = (s) => s.replace(EMOJI, ' ').replace(/[_]{2,}/g, ' ').replace(/[-]{3,}/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Clave para comparar nombres: sin tildes, sin espacios ni signos (San José = San Jose)
export const nameKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = (n) => String(n).padStart(2, '0');

// Devuelve { competition, items[] }. Cada item: date, time, category, venue, round, official,
// left (equipo de la izquierda), right (rival), mine (si coincide con la palabra clave).
export function parseFixture(text, keyword = '') {
  const lines = text.replace(/\r/g, '').split('\n');
  const kw = norm(keyword);
  const year = new Date().getFullYear();
  let competition = '', round = '', date = '', venue = '', time = '', category = '';
  const items = [];
  let awaitingRival = null;

  lines.forEach((raw, idx) => {
    const c = clean(raw);
    if (!c) { awaitingRival = null; return; }

    if (!competition && idx < 4 && !/\bvs\b/i.test(c) && !/\d{1,2}\s*\/\s*\d{1,2}/.test(c)) {
      competition = c;
      const r = c.match(/(\d+)\s*°?\s*FECHA/i);
      if (r) round = r[1];
      return;
    }

    const dm = c.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (dm && MONTHS_OK.test(c)) {
      date = `${year}-${pad(dm[2])}-${pad(dm[1])}`;
      return;
    }

    if (/COMPLEJO|PARADA|POLIDEPORTIVO|ESTADIO|CANCHA/i.test(c) && !/\bvs\b/i.test(c) && !/horario/i.test(c)) {
      venue = titleCase(c.replace(/\(.*?\)/g, ''));
      return;
    }

    const tm = c.match(/De\s*(\d{1,2})(?::(\d{2}))?\s*a\s*\d{1,2}/i);
    if (tm) { time = `${pad(tm[1])}:${tm[2] || '00'}`; return; }

    const cm = c.match(/(\d{4})\s*\/\s*(\d{4})/);
    if (cm) { category = `${cm[1]}/${cm[2]}`; return; }

    if (/amistoso/i.test(c)) return;

    const parts = c.split(/\bvs\.?(?=\s|$)/i);
    if (parts.length >= 2) {
      const left = clean(parts[0]);
      const right = clean(parts.slice(1).join(' '));
      if (!left) return;
      const item = {
        date, time, category, venue, round, competition, official: true,
        left: titleCase(left), right: right ? titleCase(right) : '',
        mine: !!kw && norm(left).includes(kw),
      };
      items.push(item);
      awaitingRival = right ? null : item;
      return;
    }

    // rival que quedó en la línea siguiente
    if (awaitingRival && !awaitingRival.right && !/^[_\-=]+$/.test(c) && !/^\(/.test(c)) {
      awaitingRival.right = titleCase(c);
      awaitingRival = null;
    }
  });

  return { competition, items };
}

// Equipo que ya existe con ese nombre (o con un alias guardado)
function exactTeam(name) {
  const l = String(name).toLowerCase();
  return store.list('teams').find((t) => t.name.toLowerCase() === l || (t.aliases || []).some((a) => a.toLowerCase() === l));
}

// Equipos que se parecen pero no son idénticos (San Jose / San José)
function similarTeam(name) {
  const k = nameKey(name);
  if (!k) return null;
  return store.list('teams').find((t) => nameKey(t.name) === k) || null;
}

// Nombres del fixture que hay que confirmar: parecen un equipo guardado pero no coinciden exacto
function suggestions(items) {
  const names = new Set(items.flatMap((it) => [it.left, it.right]).filter(Boolean));
  const out = [];
  for (const n of names) {
    if (exactTeam(n)) continue;
    const cand = similarTeam(n);
    if (cand) out.push({ name: n, team: cand });
  }
  return out;
}

export function openImportSheet({ onDone } = {}) {
  let parsed = null;
  let links = {};
  const sh = openSheet({
    title: 'Importar fixture',
    cls: 'tall',
    body: `<form class="form">
      <p class="hint">Pegá el mensaje que manda el club. La app saca fecha, hora, cancha, categoría y rival. Todo lo que se importa es oficial.</p>
      <label class="field"><span>Mensaje del fixture</span><textarea name="text" rows="8" placeholder="Pegá el texto completo acá…"></textarea></label>
      <label class="field"><span>¿Cómo aparece tu equipo en el mensaje?</span><input name="kw" placeholder="Ej: Juventus"></label>
      <button type="button" class="btn ghost block" data-analyze>Analizar mensaje</button>
      <div data-preview class="mt"></div>
    </form>`,
    footer: `<button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" data-go type="button" disabled>Agregar partidos</button>`,
  });
  const el = sh.el;
  const form = el.querySelector('form');
  const preview = el.querySelector('[data-preview]');
  const goBtn = el.querySelector('[data-go]');

  function paint() {
    if (!parsed) { preview.innerHTML = ''; goBtn.disabled = true; return; }
    const list = parsed.items;
    if (!list.length) { preview.innerHTML = '<p class="muted">No encontré partidos en ese texto.</p>'; goBtn.disabled = true; return; }
    const sugg = suggestions(list);
    links = {};
    sugg.forEach((s) => { links[s.name] = s.team.id; });
    const today = todayISO();
    preview.innerHTML = `
      ${sugg.length ? `<div class="imp-confirm"><b>¿Son el mismo equipo?</b>
        ${sugg.map((s) => `<label class="check-row small"><input type="checkbox" data-link="${esc(s.name)}" checked><span>“${esc(s.name)}” es el mismo que <b>${esc(s.team.name)}</b></span></label>`).join('')}
        <p class="hint">Si desmarcás, se crea como equipo aparte. Si es el mismo, la app lo recuerda para la próxima.</p></div>` : ''}
      <div class="imp-head"><b>${list.length} partido${list.length > 1 ? 's' : ''} encontrado${list.length > 1 ? 's' : ''}</b>
        <label class="check-row small"><input type="checkbox" data-allmine> <span>Mostrar todos (no solo los de mi equipo)</span></label></div>
      <div class="imp-list">${list.map((it, i) => `
        <label class="imp-item ${it.mine ? 'mine' : ''}" data-i="${i}" ${it.mine ? '' : 'hidden'}>
          <input type="checkbox" data-pick ${it.mine ? 'checked' : ''}>
          <div>
            <b>${esc(it.left)} <span class="muted">vs</span> ${esc(it.right || '¿?')}</b>
            <span class="muted small">${esc(it.date || 'Sin fecha')}${it.time ? ' · ' + esc(it.time) : ''}${it.category ? ' · ' + esc(it.category) : ''}${it.date && it.date < today ? ' · ya jugado' : ''}</span>
            <span class="muted small">${esc(it.venue || '')}</span>
          </div>
        </label>`).join('')}</div>`;
    goBtn.disabled = false;
    paintCount();
  }
  function paintCount() {
    const n = el.querySelectorAll('[data-pick]:checked').length;
    goBtn.textContent = n ? `Agregar ${n} partido${n > 1 ? 's' : ''}` : 'Agregar partidos';
    goBtn.disabled = !n;
  }
  el.querySelector('[data-analyze]').addEventListener('click', () => {
    const text = form.elements.text.value;
    if (!text.trim()) { toast('Pegá el mensaje primero'); return; }
    parsed = parseFixture(text, form.elements.kw.value);
    if (!form.elements.kw.value.trim()) parsed.items.forEach((it) => { it.mine = true; });
    paint();
  });
  preview.addEventListener('change', (e) => {
    if (e.target.matches('[data-allmine]')) {
      const all = e.target.checked;
      preview.querySelectorAll('.imp-item').forEach((lab) => {
        const it = parsed.items[+lab.dataset.i];
        lab.hidden = !all && !it.mine;
      });
    }
    if (e.target.matches('[data-link]')) {
      const name = e.target.dataset.link;
      links[name] = e.target.checked ? links[name] || suggestions(parsed.items).find((s) => s.name === name)?.team.id : null;
    }
    if (e.target.matches('[data-pick]')) paintCount();
  });
  goBtn.addEventListener('click', () => {
    const picked = [...preview.querySelectorAll('.imp-item')]
      .filter((lab) => lab.querySelector('[data-pick]').checked)
      .map((lab) => parsed.items[+lab.dataset.i]);
    const created = addItems(picked, links);
    toast(`${created} partido${created !== 1 ? 's' : ''} agregado${created !== 1 ? 's' : ''}`, { type: 'ok' });
    sh.close().then(() => onDone && onDone(created));
  });
}

// Busca o crea el equipo. Si el usuario confirmó que es el mismo, guarda el nombre como alias.
function teamFor(name, links) {
  const linkId = links[name];
  if (linkId) {
    const t = store.find('teams', linkId);
    if (t) {
      if (nameKey(t.name) !== nameKey(name) && !(t.aliases || []).some((a) => nameKey(a) === nameKey(name))) {
        store.upsert('teams', { id: t.id, aliases: [...(t.aliases || []), name] });
      }
      return store.find('teams', t.id);
    }
  }
  const found = exactTeam(name);
  if (found) return found;
  return store.upsert('teams', { name, short: '', logo: '', aliases: [] });
}

function venueByName(name) {
  if (!name) return;
  const k = nameKey(name);
  if (!store.list('venues').some((v) => nameKey(v.name) === k)) {
    store.upsert('venues', { name, surface: '', size: '' });
  }
}

// Agrega partidos sin duplicar los que ya existen (misma fecha, hora y equipos)
function addItems(items, links) {
  let n = 0;
  const today = todayISO();
  for (const it of items) {
    const mine = teamFor(it.left, links);
    const rival = it.right ? teamFor(it.right, links) : null;
    const dup = store.list('matches').some((m) => m.date === it.date && m.time === it.time
      && [m.homeId, m.awayId].includes(mine.id) && (!rival || [m.homeId, m.awayId].includes(rival.id)));
    if (dup) continue;
    venueByName(it.venue);
    const past = !!it.date && it.date < today;
    store.upsert('matches', {
      status: past ? 'finished' : 'scheduled', official: true, played: true, myTeam: 'home',
      homeId: mine.id, awayId: rival ? rival.id : '', date: it.date, time: it.time,
      venue: it.venue, competition: it.competition, round: it.round,
      notes: [it.category && `Categoría ${it.category}`, past && 'Resultado pendiente de cargar'].filter(Boolean).join(' · '),
      result: { mode: 'unknown', home: 0, away: 0, winner: '' }, minutes: '', minutesExact: false,
      goals: 0, assists: 0, mvp: 'unknown', events: [], prediction: { mode: 'none' },
    });
    n++;
  }
  return n;
}

// ── Convocados: "JUVENTUS NEGRO ⬛" y debajo los nombres ────
export function parseRoster(text) {
  const lines = text.replace(/\r/g, '').split('\n').map(clean).filter(Boolean);
  let category = '', team = '';
  const out = [];
  const SKIP = /costo|atenci|horario|alias|pesos|inscripci|comprobante|recuerden|saludos|lluvia|efectivo/i;
  for (const c of lines) {
    const cat = c.match(/(\d{4})\s*\/\s*(\d{4})/);
    if (cat && /categor|indoor|convocad/i.test(c)) { category = `${cat[1]}/${cat[2]}`; continue; }
    if (cat) { category = `${cat[1]}/${cat[2]}`; continue; }
    if (/^[A-ZÁÉÍÓÚÑ ]{3,}$/.test(c) && !SKIP.test(c) && !/convocad|categor/i.test(c)) { team = titleCase(c); continue; }
    if (/^[\p{L} .'-]+$/u.test(c) && c.split(' ').length >= 2 && !SKIP.test(c)) out.push({ name: titleCase(c), team, category });
  }
  return out;
}

export function addRoster(list) {
  let n = 0;
  for (const p of list) {
    const k = nameKey(p.name), tk = nameKey(p.team);
    if (store.list('players').some((x) => nameKey(x.name) === k && nameKey(x.team) === tk)) continue;
    store.upsert('players', { name: p.name, team: p.team, category: p.category, position: '', goals: 0, assists: 0, matches: 0, notes: '' });
    n++;
  }
  return n;
}

export function openRosterSheet({ onDone } = {}) {
  let list = [];
  const sh = openSheet({
    title: 'Importar convocados', cls: 'tall',
    body: `<form class="form">
      <p class="hint">Pegá la lista de convocados que manda el club. Se guardan como jugadores para ver sus datos.</p>
      <label class="field"><span>Lista de convocados</span><textarea name="text" rows="8" placeholder="Categoría (2010/2009) INDOOR 3&#10;&#10;JUVENTUS NEGRO ⬛&#10;Schleider Lila&#10;…"></textarea></label>
      <button type="button" class="btn ghost block" data-analyze>Analizar lista</button>
      <div data-preview class="mt"></div>
    </form>`,
    footer: `<button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" data-go type="button" disabled>Guardar convocados</button>`,
  });
  const el = sh.el;
  const form = el.querySelector('form');
  const preview = el.querySelector('[data-preview]');
  const go = el.querySelector('[data-go]');
  el.querySelector('[data-analyze]').addEventListener('click', () => {
    list = parseRoster(form.elements.text.value);
    preview.innerHTML = list.length
      ? `<b>${list.length} jugador${list.length > 1 ? 'es' : ''}</b><div class="imp-list">${list.map((p) => `<div class="imp-item"><div><b>${esc(p.name)}</b><span class="muted small">${esc(p.team || 'Sin equipo')}${p.category ? ' · ' + esc(p.category) : ''}</span></div></div>`).join('')}</div>`
      : '<p class="muted">No encontré nombres en esa lista.</p>';
    go.disabled = !list.length;
  });
  go.addEventListener('click', () => {
    const n = addRoster(list);
    toast(`${n} jugador${n !== 1 ? 'es' : ''} guardado${n !== 1 ? 's' : ''}`, { type: 'ok' });
    sh.close().then(() => onDone && onDone(n));
  });
}
