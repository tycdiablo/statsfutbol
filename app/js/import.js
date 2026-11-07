// Lee un mensaje de fixture (texto de WhatsApp del club) y lo convierte en partidos.
import * as store from './store.js';
import { esc, todayISO } from './util.js';
import { openSheet, toast } from './ui.js';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{203C}\u{2049}\u{FE0F}\u{200D}]/gu;
const MONTHS_OK = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/i;

const clean = (s) => s.replace(EMOJI, ' ').replace(/[_]{2,}/g, ' ').replace(/[-]{3,}/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pad = (n) => String(n).padStart(2, '0');

function titleCase(s) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

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
    if (!c) { awaitingRival = awaitingRival && null; return; }

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
      venue = c.replace(/\(.*?\)/g, '').trim();
      return;
    }

    const tm = c.match(/De\s*(\d{1,2})(?::(\d{2}))?\s*a\s*\d{1,2}/i);
    if (tm) { time = `${pad(tm[1])}:${tm[2] || '00'}`; return; }

    const cm = c.match(/(\d{4})\s*\/\s*(\d{4})/);
    if (cm) { category = `${cm[1]}/${cm[2]}`; return; }

    if (/amistoso/i.test(c)) {
      const last = items[items.length - 1];
      if (last) last.official = false;
      return;
    }

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

export function openImportSheet({ onDone } = {}) {
  let parsed = null;
  const sh = openSheet({
    title: 'Importar fixture',
    cls: 'tall',
    body: `<form class="form">
      <p class="hint">Pegá acá el mensaje que manda el club. La app saca fecha, hora, cancha, categoría y rival.</p>
      <label class="field"><span>Mensaje del fixture</span><textarea name="text" rows="8" placeholder="Pegá el texto completo acá…"></textarea></label>
      <label class="field"><span>¿Cómo aparece tu equipo en el mensaje?</span><input name="kw" placeholder="Ej: Juventus" value=""></label>
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
    preview.innerHTML = `<div class="imp-head"><b>${list.length} partido${list.length > 1 ? 's' : ''} encontrado${list.length > 1 ? 's' : ''}</b>
      <label class="check-row small"><input type="checkbox" data-allmine> <span>Mostrar todos (no solo los de mi equipo)</span></label></div>
      <div class="imp-list">${list.map((it, i) => `
        <label class="imp-item ${it.mine ? 'mine' : ''}" data-i="${i}">
          <input type="checkbox" data-pick ${it.mine ? 'checked' : ''}>
          <div>
            <b>${esc(it.left)} <span class="muted">vs</span> ${esc(it.right || '¿?')}</b>
            <span class="muted small">${esc(it.date || 'Sin fecha')}${it.time ? ' · ' + esc(it.time) : ''}${it.category ? ' · ' + esc(it.category) : ''}${it.official ? '' : ' · amistoso'}</span>
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
        if (all || it.mine) { /* visible */ }
        lab.hidden = !all && !it.mine;
      });
    }
    if (e.target.matches('[data-pick]')) paintCount();
  });
  goBtn.addEventListener('click', () => {
    const picked = [...preview.querySelectorAll('.imp-item')]
      .filter((lab) => lab.querySelector('[data-pick]').checked)
      .map((lab) => parsed.items[+lab.dataset.i]);
    const created = addItems(picked);
    toast(`${created} partido${created !== 1 ? 's' : ''} agregado${created !== 1 ? 's' : ''}`, { type: 'ok' });
    sh.close().then(() => onDone && onDone(created));
  });
}

function teamByName(name) {
  const n = name.toLowerCase();
  return store.list('teams').find((t) => t.name.toLowerCase() === n) || store.upsert('teams', { name, short: '', logo: '' });
}

function venueByName(name) {
  if (!name) return;
  const n = name.toLowerCase();
  if (!store.list('venues').some((v) => v.name.toLowerCase() === n)) {
    store.upsert('venues', { name, surface: '', size: '' });
  }
}

// Agrega partidos sin duplicar los que ya existen (misma fecha, hora y equipos)
function addItems(items) {
  let n = 0;
  const today = todayISO();
  for (const it of items) {
    const mine = teamByName(it.left);
    const rival = it.right ? teamByName(it.right) : null;
    const dup = store.list('matches').some((m) => m.date === it.date && m.time === it.time
      && [m.homeId, m.awayId].includes(mine.id) && (!rival || [m.homeId, m.awayId].includes(rival.id)));
    if (dup) continue;
    venueByName(it.venue);
    const past = it.date && it.date < today;
    store.upsert('matches', {
      status: 'scheduled', stage: undefined, official: it.official, played: true, myTeam: 'home',
      homeId: mine.id, awayId: rival ? rival.id : '', date: it.date, time: it.time,
      venue: it.venue, competition: it.competition, round: it.round,
      notes: [it.category && `Categoría ${it.category}`, past && 'Fecha pasada: cargá el resultado'].filter(Boolean).join(' · '),
      result: { mode: 'exact', home: 0, away: 0, winner: '' }, minutes: '', minutesExact: false,
      goals: 0, assists: 0, mvp: 'unknown', events: [], prediction: { mode: 'none' },
    });
    n++;
  }
  return n;
}
