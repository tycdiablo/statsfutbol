// Alineación: cancha con la formación, camisetas personalizadas por equipo.
// Las camisetas se guardan en el equipo (team.kits) y se reutilizan en otros partidos.
import * as store from './store.js';
import { esc, uid, clone } from './util.js';
import { ic } from './icons.js';
import { openSheet, toast, seg, confirmDialog } from './ui.js';

export const FORMATIONS = {
  '2-2': { label: '2 · 2', slots: [[30, 92], [70, 92], [30, 52], [70, 52]] },
  '1-2-1': { label: '1 · 2 · 1', slots: [[50, 104], [24, 66], [76, 66], [50, 30]] },
  '1-1-2': { label: '1 · 1 · 2', slots: [[50, 104], [50, 72], [30, 36], [70, 36]] },
};
const GK = [50, 128];

export const KIT_STYLES = { liso: 'Liso', 'rayas-v': 'Rayas verticales', 'rayas-h': 'Rayas horizontales', mitad: 'Mitad y mitad' };
const SHIRT = 'M30 12 L8 24 L16 44 L26 40 L26 90 L74 90 L74 40 L84 44 L92 24 L70 12 Q50 22 30 12 Z';

export const defaultKit = (name = 'Camiseta') => ({ id: uid(), name, base: '#2f9e44', style: 'liso', stripe: '#ffffff', num: '#ffffff' });

export const kitsOf = (teamId) => store.find('teams', teamId)?.kits || [];
export const kitById = (teamId, kitId) => kitsOf(teamId).find((k) => k.id === kitId) || kitsOf(teamId)[0] || null;

// Camiseta dibujada en un grupo SVG (coordenadas 0..100), con número opcional
function shirtSVG(kit, num, uidp) {
  const k = kit || defaultKit();
  const cp = `cp${uidp}`;
  let stripes = '';
  if (k.style === 'rayas-v') stripes = [0, 20, 40, 60, 80].map((x) => `<rect x="${x}" y="0" width="10" height="100" fill="${k.stripe}"/>`).join('');
  if (k.style === 'rayas-h') stripes = [30, 50, 70, 90].map((y) => `<rect x="0" y="${y}" width="100" height="10" fill="${k.stripe}"/>`).join('');
  if (k.style === 'mitad') stripes = `<rect x="50" y="0" width="50" height="100" fill="${k.stripe}"/>`;
  return `<defs><clipPath id="${cp}"><path d="${SHIRT}"/></clipPath></defs>
    <path d="${SHIRT}" fill="${k.base}"/>
    <g clip-path="url(#${cp})">${stripes}</g>
    <path d="${SHIRT}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>
    ${num !== '' && num != null ? `<text x="50" y="66" text-anchor="middle" font-size="26" font-weight="800" font-family="Barlow Condensed, Inter, sans-serif" fill="${k.num}">${esc(String(num))}</text>` : ''}`;
}

// Cancha de fútbol 5 con los jugadores. players: [arquero, j1, j2, j3, j4]
export function pitchSVG({ formation = '2-2', players = [], kit = null, names = true, mirror = false, uidp = 'a' }) {
  const f = FORMATIONS[formation] || FORMATIONS['2-2'];
  const pos = [GK, ...f.slots];
  const tokens = pos.map((p, i) => {
    const x = mirror ? 100 - p[0] : p[0];
    const y = mirror ? 160 - p[1] : p[1];
    const name = players[i] || '';
    return `<g transform="translate(${x - 17} ${y - 19}) scale(.34)">${shirtSVG(kit, i + 1, `${uidp}${i}`)}</g>
      ${names && name ? `<text x="${x}" y="${y + 20}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.6)" stroke-width="2" paint-order="stroke">${esc(name)}</text>` : ''}`;
  }).join('');
  return `<svg class="pitch" viewBox="0 0 100 160" role="img" aria-label="Cancha con la alineación">
    <rect x="0" y="0" width="100" height="160" rx="4" fill="#2a7f3e"/>
    <g fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1">
      <rect x="4" y="4" width="92" height="152" rx="2"/>
      <line x1="4" y1="80" x2="96" y2="80"/>
      <circle cx="50" cy="80" r="12"/>
      <path d="M30 156 Q50 136 70 156"/>
      <path d="M30 4 Q50 22 70 4"/>
    </g>
    ${tokens}
  </svg>`;
}

export function kitPreview(kit, size = 'md') {
  if (!kit) return '';
  return `<svg class="kit-ico kit-${size}" viewBox="0 0 100 100" aria-hidden="true">${shirtSVG(kit, '', 'k' + kit.id)}</svg>`;
}

// ── Editor de alineación (dentro de un partido) ────────────
export function openLineupEditor({ match, onSave }) {
  const s = store.get();
  const home = store.find('teams', match.homeId), away = store.find('teams', match.awayId);
  const mySide = match.myTeam === 'away' ? 'away' : 'home';
  const myTeam = mySide === 'home' ? home : away;
  const rivalTeam = mySide === 'home' ? away : home;
  const L = clone(match.lineup || {});
  const st = {
    formation: L.formation || '2-2',
    mine: L.mine || ['', '', '', '', ''],
    rival: L.rival || ['', '', '', '', ''],
    showRival: !!L.showRival,
    kitMine: L.kitMine || myTeam?.kits?.[0]?.id || '',
    kitRival: L.kitRival || rivalTeam?.kits?.[0]?.id || '',
  };
  const names = [...new Set([s.profile.name, ...s.players.map((p) => p.name)].filter(Boolean))];
  const slotInputs = (side, arr) => arr.map((v, i) => `<label class="slot-in"><span>${i === 0 ? 'Arquero' : `Jugador ${i}`}</span>
      <input data-slot="${side}:${i}" value="${esc(v)}" list="names-list" placeholder="(sin nombre)" maxlength="24"></label>`).join('');

  const sh = openSheet({
    title: 'Alineación', cls: 'tall',
    body: `<form class="form">
      <div class="lineup-preview" data-preview></div>
      <section class="fs">
        <label class="fs-label">Formación</label>
        ${seg('formation', Object.entries(FORMATIONS).map(([k, v]) => [k, v.label]), st.formation)}
      </section>
      <section class="fs">
        <label class="fs-label">Mi equipo${myTeam ? ` · ${esc(myTeam.name)}` : ''}</label>
        <div class="slots">${slotInputs('mine', st.mine)}</div>
        <p class="hint">Si no ponés nombres, se ven solo los circulitos. Los nombres de tus jugadores y convocados aparecen como sugerencia.</p>
        ${kitSelect('kitMine', myTeam, st.kitMine)}
      </section>
      <section class="fs">
        <label class="check-row"><input type="checkbox" name="showRival" ${st.showRival ? 'checked' : ''}><span><b>Mostrar también al rival</b><br><small class="muted">Opcional. Si no lo ponés, no aparece.</small></span></label>
        <div data-show="showRival:true" class="mt">
          <label class="fs-label">Rival${rivalTeam ? ` · ${esc(rivalTeam.name)}` : ''}</label>
          <div class="slots">${slotInputs('rival', st.rival)}</div>
          ${kitSelect('kitRival', rivalTeam, st.kitRival)}
        </div>
      </section>
      <datalist id="names-list">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </form>`,
    footer: `<button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" data-save type="button">Guardar alineación</button>`,
  });
  const el = sh.el;
  const form = el.querySelector('form');

  function paint() {
    const kitM = kitById(myTeam?.id, st.kitMine);
    const kitR = kitById(rivalTeam?.id, st.kitRival);
    el.querySelector('[data-preview]').innerHTML = `<div class="pitch-wrap">${pitchSVG({ formation: st.formation, players: st.mine, kit: kitM, uidp: 'm' })}
      ${st.showRival ? pitchSVG({ formation: st.formation, players: st.rival, kit: kitR, names: true, mirror: true, uidp: 'r' }) : ''}</div>`;
  }
  paint();
  form.addEventListener('input', (e) => {
    const f = e.target.dataset.slot;
    if (f) {
      const [side, i] = f.split(':');
      st[side][+i] = e.target.value;
    }
    if (e.target.name === 'showRival') st.showRival = e.target.checked;
    if (e.target.name === 'formation') st.formation = e.target.value;
    if (e.target.name === 'kitMine') st.kitMine = e.target.value;
    if (e.target.name === 'kitRival') st.kitRival = e.target.value;
    if (e.target.name === 'showRival') { /* refresh show */ }
    paint();
  });
  form.addEventListener('change', (e) => { if (e.target.name === 'formation' || e.target.name === 'showRival') paint(); });
  el.querySelectorAll('[data-kit-new]').forEach((b) => b.addEventListener('click', () => {
    const team = b.dataset.kitNew === 'mine' ? myTeam : rivalTeam;
    if (!team) { toast('Elegí los equipos primero'); return; }
    openKitEditor({ team, onSaved: (kit) => {
      if (b.dataset.kitNew === 'mine') st.kitMine = kit.id; else st.kitRival = kit.id;
      el.querySelectorAll(`select[name="${b.dataset.kitNew === 'mine' ? 'kitMine' : 'kitRival'}"]`).forEach((sel) => { sel.innerHTML = kitOptions(team, kit.id); sel.value = kit.id; });
      paint();
    } });
  }));

  el.querySelector('[data-save]').addEventListener('click', () => {
    const lineup = {
      formation: st.formation,
      mine: st.mine.map((x) => x.trim()),
      rival: st.rival.map((x) => x.trim()),
      showRival: st.showRival, kitMine: st.kitMine, kitRival: st.kitRival,
    };
    onSave && onSave(lineup);
    sh.close();
  });
}

function kitOptions(team, sel) {
  const kits = team?.kits || [];
  return kits.length ? kits.map((k) => `<option value="${k.id}" ${k.id === sel ? 'selected' : ''}>${esc(k.name)}</option>`).join('') : '<option value="">Sin camiseta guardada</option>';
}
function kitSelect(name, team, sel) {
  const label = team ? esc(team.name) : 'equipo';
  const who = name === 'kitMine' ? 'mine' : 'rival';
  return `<div class="kit-row">
    <div class="kit-pick">${kitPreview(kitById(team?.id, sel), 'sm')}
      <label class="field"><span>Camiseta de ${label}</span><select name="${name}">${kitOptions(team, sel)}</select></label></div>
    <button type="button" class="chip-btn" data-kit-new="${who}">${ic('plus')} Nueva camiseta</button>
  </div>`;
}

// ── Camisetas de un equipo ─────────────────────────────────
export function openKitEditor({ team, kit = null, onSaved }) {
  const k = { ...defaultKit(), ...clone(kit || {}) };
  if (!kit) k.name = `Camiseta ${(team.kits?.length || 0) + 1}`;
  let style = k.style;
  const sh = openSheet({
    title: kit ? 'Editar camiseta' : 'Nueva camiseta', cls: 'dialog',
    body: `<form class="form">
      <div class="kit-big" data-kit-prev>${kitPreview(k, 'xl')}</div>
      <label class="field"><span>Nombre</span><input name="name" value="${esc(k.name)}" maxlength="30" placeholder="Ej: Negra titular"></label>
      <div class="grid2">
        <label class="field"><span>Color principal</span><input type="color" name="base" value="${k.base}"></label>
        <label class="field"><span>Color de número</span><input type="color" name="num" value="${k.num}"></label>
      </div>
      <div><span class="mini-label">Diseño</span>
        <div class="kit-styles">${Object.entries(KIT_STYLES).map(([v, l]) => `<button type="button" class="kit-style ${v === style ? 'on' : ''}" data-style="${v}">${l}</button>`).join('')}</div>
      </div>
      <label class="field mt"><span>Color de rayas o mitad</span><input type="color" name="stripe" value="${k.stripe}"></label>
    </form>`,
    footer: `${kit ? `<button class="btn ghost danger-txt" data-del type="button">Borrar</button>` : ''}<button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" data-save type="button">Guardar</button>`,
  });
  const el = sh.el;
  const form = el.querySelector('form');
  const paint = () => {
    el.querySelector('[data-kit-prev]').innerHTML = kitPreview({ ...k, style, base: form.elements.base.value, num: form.elements.num.value, stripe: form.elements.stripe.value, name: '' }, 'xl');
  };
  form.addEventListener('input', paint);
  el.querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => {
    style = b.dataset.style;
    el.querySelectorAll('[data-style]').forEach((x) => x.classList.toggle('on', x === b));
    paint();
  }));
  el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Se borra esta camiseta. Los partidos que la usaban quedan sin camiseta.', { ok: 'Borrar', danger: true }))) return;
    const kits = (store.find('teams', team.id)?.kits || []).filter((x) => x.id !== kit.id);
    store.upsert('teams', { id: team.id, kits });
    sh.close();
    onSaved && onSaved(null);
  });
  el.querySelector('[data-save]').addEventListener('click', () => {
    const name = form.elements.name.value.trim() || 'Camiseta';
    const cur = store.find('teams', team.id);
    const kits = [...(cur?.kits || [])];
    const next = { id: k.id, name, base: form.elements.base.value, num: form.elements.num.value, stripe: form.elements.stripe.value, style };
    const i = kits.findIndex((x) => x.id === next.id);
    if (i >= 0) kits[i] = next; else kits.push(next);
    store.upsert('teams', { id: team.id, kits });
    toast('Camiseta guardada', { type: 'ok' });
    sh.close();
    onSaved && onSaved(next);
  });
}

// Camisetas de un equipo: lista para ver, crear o editar
export function openKitsManager(team) {
  const paint = () => {
    const cur = store.find('teams', team.id);
    const kits = cur?.kits || [];
    sh.body.innerHTML = `
      <p class="hint">Las camisetas se guardan con el equipo. Podés tener varias (titular, suplente) y elegir una en cada partido.</p>
      ${kits.length ? kits.map((k) => `<div class="kit-row-item">${kitPreview(k, 'md')}<b>${esc(k.name)}</b>
        <button class="icon-btn sm" data-edit="${k.id}" aria-label="Editar">${ic('edit')}</button></div>`).join('') : '<p class="muted">Todavía no hay camisetas.</p>'}
      <button class="btn primary block mt" data-new>${ic('plus')} Nueva camiseta</button>`;
    sh.body.querySelector('[data-new]').addEventListener('click', () => openKitEditor({ team: store.find('teams', team.id), onSaved: paint }));
    sh.body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openKitEditor({ team: store.find('teams', team.id), kit: kits.find((k) => k.id === b.dataset.edit), onSaved: paint })));
  };
  const sh = openSheet({ title: `Camisetas · ${team.name}`, cls: 'dialog', body: '' });
  paint();
}
