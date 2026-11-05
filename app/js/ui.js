import { esc, initials, hue, $$ } from './util.js';
import { ic } from './icons.js';
import * as store from './store.js';

// ── Toast ──────────────────────────────────────────────────
export function toast(msg, { type = '', ms = 2600 } = {}) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

// ── Sheets (bottom sheet on phone, dialog on desktop) ─────
let z = 100;
let ignorePop = 0;
const stack = [];

window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  const top = stack[stack.length - 1];
  if (top) top.close('nav');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close('dismiss');
});

export function openSheet({ title = '', body = '', footer = '', cls = '', onClose, headActions = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.style.zIndex = ++z;
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <header class="sheet-head">
        <button class="icon-btn" data-close type="button" aria-label="Cerrar">${ic('x')}</button>
        <h2>${esc(title)}</h2>
        <div class="sheet-head-actions">${headActions}</div>
      </header>
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </section>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  history.pushState({ sfSheet: true }, '');

  let closed = false;
  const api = {
    el: wrap,
    body: wrap.querySelector('.sheet-body'),
    close(reason = 'done') {
      if (closed) return Promise.resolve();
      closed = true;
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      wrap.classList.remove('open');
      setTimeout(() => {
        wrap.remove();
        if (!stack.length) document.body.classList.remove('no-scroll');
      }, 240);
      if (reason === 'nav') { onClose && onClose(reason); return Promise.resolve(); }
      // wait until the history entry of the sheet is gone before notifying,
      // so callers can safely navigate afterwards
      return new Promise((res) => {
        ignorePop++;
        let fired = false;
        const done = () => {
          if (fired) return;
          fired = true;
          window.removeEventListener('popstate', done);
          onClose && onClose(reason);
          res();
        };
        window.addEventListener('popstate', done);
        history.back();
        setTimeout(done, 400);
      });
    },
  };
  stack.push(api);
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) api.close('dismiss');
  });
  return api;
}

export function confirmDialog(msg, { ok = 'Aceptar', danger = false, title = '¿Seguro?' } = {}) {
  return new Promise((resolve) => {
    let val = false;
    const sh = openSheet({
      title, cls: 'dialog',
      body: `<p class="dialog-msg">${esc(msg)}</p>`,
      footer: `<button class="btn ghost" data-close type="button">Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok type="button">${esc(ok)}</button>`,
      onClose: () => resolve(val),
    });
    sh.el.querySelector('[data-ok]').addEventListener('click', () => { val = true; sh.close(); });
  });
}

export function choiceDialog(title, options) {
  return new Promise((resolve) => {
    let val = null;
    const sh = openSheet({
      title, cls: 'dialog',
      body: `<div class="choice-list">${options.map((o, i) => `<button type="button" class="choice ${o.danger ? 'danger' : ''}" data-i="${i}">${o.icon ? ic(o.icon) : ''}<span>${esc(o.label)}</span></button>`).join('')}</div>`,
      onClose: () => resolve(val),
    });
    sh.el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { val = options[+b.dataset.i].value; sh.close(); }));
  });
}

// ── Images ─────────────────────────────────────────────────
export function pickImage({ max = 192 } = {}) {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      inp.remove();
      if (!f) return res(null);
      try { res(await compressImage(f, max)); } catch { toast('No se pudo leer la imagen', { type: 'error' }); res(null); }
    });
    inp.click();
  });
}

async function compressImage(file, max) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    let out = c.toDataURL('image/webp', 0.85);
    if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
    return out;
  } finally { URL.revokeObjectURL(url); }
}

// ── Small render helpers ───────────────────────────────────
export function crest(team, size = 'md') {
  if (!team) return `<span class="crest crest-${size} crest-empty">${ic('shield')}</span>`;
  if (team.logo) return `<span class="crest crest-${size}"><img src="${team.logo}" alt="" loading="lazy"></span>`;
  const h = hue(team.name);
  return `<span class="crest crest-${size} crest-init" style="--h:${h}">${esc(initials(team.name))}</span>`;
}

export function avatar(profile, size = 'md') {
  if (profile?.photo) return `<span class="avatar avatar-${size}"><img src="${profile.photo}" alt=""></span>`;
  return `<span class="avatar avatar-${size} avatar-init" style="--h:${hue(profile?.name || 'x')}">${profile?.name ? esc(initials(profile.name)) : ic('user')}</span>`;
}

export const teamName = (id) => store.find('teams', id)?.name || 'Equipo';

export function seg(name, options, value, { cls = '', small = false } = {}) {
  return `<div class="seg ${small ? 'seg-sm' : ''} ${cls}" role="radiogroup">
    <input type="hidden" name="${name}" value="${esc(value ?? '')}">
    ${options.map(([v, label]) => `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" class="${String(v) === String(value) ? 'on' : ''}" data-val="${esc(v)}">${label}</button>`).join('')}
  </div>`;
}

export function stepper(name, value, { min = 0, max = 999, step = 1, label = '' } = {}) {
  return `<div class="stepper" data-min="${min}" data-max="${max}">
    <button type="button" data-step="${-step}" aria-label="Restar">−</button>
    <input type="number" inputmode="numeric" name="${name}" value="${esc(value ?? '')}" min="${min}" max="${max}" ${label ? `aria-label="${esc(label)}"` : ''}>
    <button type="button" data-step="${step}" aria-label="Sumar">+</button>
  </div>`;
}

export function empty(icon, title, text = '', action = '') {
  return `<div class="empty">${ic(icon)}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

// Elements with data-show="field:val1,val2;other:val" are only visible when
// every listed field of the enclosing form currently has one of the values.
export function refreshShow(form) {
  $$('[data-show]', form).forEach((el) => {
    const ok = el.dataset.show.split(';').every((cond) => {
      const [name, vals] = cond.split(':');
      const field = form.elements[name];
      const v = field ? (field.type === 'checkbox' ? String(field.checked) : field.value) : '';
      return vals.split(',').includes(v);
    });
    el.hidden = !ok;
  });
}

export function installGlobalControls() {
  document.addEventListener('click', (e) => {
    const sb = e.target.closest('.seg [data-val]');
    if (sb) {
      const segEl = sb.closest('.seg');
      const inp = segEl.querySelector('input[type=hidden]');
      segEl.querySelectorAll('[data-val]').forEach((b) => { b.classList.toggle('on', b === sb); b.setAttribute('aria-checked', String(b === sb)); });
      inp.value = sb.dataset.val;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const st = e.target.closest('.stepper [data-step]');
    if (st) {
      const wrap = st.closest('.stepper');
      const inp = wrap.querySelector('input');
      const min = +wrap.dataset.min, max = +wrap.dataset.max;
      const v = Math.min(max, Math.max(min, (parseFloat(inp.value) || 0) + +st.dataset.step));
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}
