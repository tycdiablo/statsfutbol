import * as store from './store.js';
import * as cloud from './cloud.js';
import { session } from './session.js';
import { $, esc } from './util.js';
import { ic, googleLogo } from './icons.js';
import { installGlobalControls, toast, avatar } from './ui.js';
import Home from './views/home.js';
import { MatchesView, MatchDetailView } from './views/matches.js';
import { ToursView, TourDetailView } from './views/tournaments.js';
import Career from './views/career.js';
import Notes from './views/notes.js';
import Settings from './views/settings.js';
import Shared from './views/shared.js';

const routes = {
  inicio: Home, partidos: MatchesView, partido: MatchDetailView, torneos: ToursView,
  torneo: TourDetailView, carrera: Career, notas: Notes, ajustes: Settings, compartido: Shared,
};
const NAV = [
  ['inicio', 'Inicio', 'home'], ['partidos', 'Partidos', 'ball'], ['torneos', 'Torneos', 'trophy'],
  ['carrera', 'Carrera', 'medal'], ['notas', 'Notas', 'note'],
];
const SECTION_OF = { partido: 'partidos', torneo: 'torneos', ajustes: '' };

const view = $('#view');
let current = null;
let params = [];

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  return { name: routes[name] ? name : 'inicio', params: rest.map(decodeURIComponent) };
}

function renderNav(active) {
  $('#nav-items').innerHTML = NAV.map(([k, label, icon]) =>
    `<a href="#/${k}" class="nav-item ${k === active ? 'on' : ''}" ${k === active ? 'aria-current="page"' : ''}>${ic(icon)}<span>${label}</span></a>`).join('');
}

function renderTopbar(V, name) {
  $('#tb-title').textContent = V.title;
  $('#tb-left').innerHTML = V.back ? `<button class="icon-btn" data-back aria-label="Volver">${ic('back')}</button>` : `<a href="#/inicio" class="tb-brand"><img src="icons/icon.svg" alt="" width="28" height="28"></a>`;
  const u = session.user;
  const p = store.get().profile;
  $('#tb-avatar').innerHTML = u?.photo && !p.photo ? `<span class="avatar avatar-sm"><img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer"></span>` : avatar(p.name || p.photo ? p : { name: u?.name }, 'sm');
  $('#tb-avatar').classList.toggle('on', name === 'ajustes');
  paintSync();
}

function paintSync() {
  const el = $('#sync');
  const st = session.user ? session.sync : 'local';
  el.className = 'sync sync-' + st;
  el.title = { local: 'Sin cuenta: guardado en este dispositivo', pending: 'Sincronizando…', ok: 'Guardado en la nube', error: 'Error de sincronización', offline: 'Sin conexión' }[st];
  el.innerHTML = session.user ? ic('cloud') : (session.configured ? `<a href="#/ajustes" class="sync-off" title="Sin cuenta: tocá para entrar con Google">${ic('cloud')}</a>` : '');
}

function renderFab(V) {
  const fab = $('#fab');
  if (V.fab) {
    fab.hidden = false;
    fab.innerHTML = `${ic(V.fab.icon)}<span>${V.fab.label}</span>`;
    fab.onclick = V.fab.run;
  } else fab.hidden = true;
}

function render() {
  if (document.body.classList.contains('welcome-on')) return;
  const r = parse();
  const V = routes[r.name];
  const changed = V !== current || r.params.join('/') !== params.join('/');
  current = V; params = r.params;
  view.innerHTML = V.render(...params);
  view.dataset.view = r.name;
  renderNav(SECTION_OF[r.name] ?? r.name);
  renderTopbar(V, r.name);
  renderFab(V);
  V.mount && V.mount(view, ...params);
  if (changed) { window.scrollTo(0, 0); }
}

let raf = 0;
function rerender() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }
window.__rerender = render;

view.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !current?.actions) return;
  const fn = current.actions[el.dataset.act];
  if (fn) { if (el.tagName !== 'INPUT') e.preventDefault(); fn(el, e, ...params); }
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) {
    if (history.state?.sfNav) history.back();
    else location.hash = current?.back || '#/inicio';
  }
});

window.addEventListener('hashchange', () => {
  if (!history.state?.sfSheet) history.replaceState({ ...(history.state || {}), sfNav: true }, '');
  render();
});

// ── Welcome / onboarding ───────────────────────────────────
function showWelcome() {
  document.body.classList.add('welcome-on');
  const w = document.createElement('div');
  w.className = 'welcome';
  w.innerHTML = `
    <div class="welcome-inner">
      <img class="welcome-logo" src="icons/icon.svg" alt="" width="84" height="84">
      <h1>Stats<b>Fútbol</b></h1>
      <p class="welcome-tag">Tu carrera de jugador, partido a partido.</p>
      <ul class="welcome-list">
        <li>${ic('ball')}<span>Anotá goles, asistencias, minutos, MVP y eventos de cada partido</span></li>
        <li>${ic('trophy')}<span>Creá torneos, seguí la tabla y predecí cómo terminan</span></li>
        <li>${ic('medal')}<span>Mirá tu carrera: clubes, lesiones, logros y objetivos</span></li>
      </ul>
      <div class="welcome-actions">
        <button class="btn google block" data-w="google">${googleLogo}<span>Continuar con Google</span></button>
        <button class="btn ghost block" data-w="guest">Usar sin cuenta</button>
        <p class="hint center">${session.configured ? 'Con Google tu progreso se guarda en la nube. Sin cuenta, se guarda en este dispositivo (podés entrar con Google después y no perdés nada).' : 'Sin cuenta tu progreso se guarda en este dispositivo. Podés exportar un backup cuando quieras.'}</p>
      </div>
    </div>`;
  document.body.appendChild(w);
  const done = () => {
    try { localStorage.setItem('sf:started', '1'); } catch {}
    document.body.classList.remove('welcome-on');
    w.classList.add('out');
    setTimeout(() => w.remove(), 300);
    render();
  };
  w.querySelector('[data-w="guest"]').addEventListener('click', done);
  w.querySelector('[data-w="google"]').addEventListener('click', async () => {
    const ok = await session.signIn();
    if (ok !== false) done();
  });
}

// ── Cloud sync ─────────────────────────────────────────────
let pushT = 0;
function setSync(st) { session.sync = st; paintSync(); if (current === Settings) rerender(); }

async function doPush() {
  if (!session.user) return;
  const parts = store.takeDirty();
  const keys = Object.keys(parts);
  if (!keys.length) { setSync('ok'); return; }
  if (!navigator.onLine) { store.markDirty(keys); setSync('offline'); return; }
  try {
    await cloud.push(session.user.uid, parts);
    session.lastSync = Date.now();
    setSync('ok');
  } catch (e) {
    console.warn('push', e);
    store.markDirty(keys);
    setSync('error');
    clearTimeout(pushT);
    pushT = setTimeout(doPush, 15000);
  }
}

store.setSyncHook(() => {
  if (!session.user) return;
  setSync('pending');
  clearTimeout(pushT);
  pushT = setTimeout(doPush, 1200);
});

async function pullAndMerge() {
  if (!session.user || !navigator.onLine) return;
  try {
    const remote = await cloud.pull(session.user.uid);
    if (Object.keys(remote).length) store.mergeIn(remote);
  } catch (e) { console.warn('pull', e); setSync('error'); }
}

session.syncNow = async () => {
  if (!session.user) return;
  setSync('pending');
  await pullAndMerge();
  store.markAllDirty();
  await doPush();
  toast('Sincronizado', { type: 'ok' });
};

async function handleUser(u) {
  if (u) {
    session.user = { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL };
    const k = 'user:' + u.uid;
    if (store.currentKey() !== k) store.load(k);
    try { localStorage.setItem('sf:last', k); localStorage.setItem('sf:started', '1'); } catch {}
    setSync('pending');
    await pullAndMerge();
    const guest = store.readKey('guest');
    if (guest && store.hasContent(guest)) {
      store.mergeIn(guest);
      store.clearKey('guest');
      toast('Sumamos a tu cuenta lo que tenías guardado sin cuenta', { ms: 4000 });
    }
    if (!store.get().profile.name && u.displayName) store.setProfile({ name: u.displayName });
    store.markAllDirty();
    await doPush();
  } else {
    const wasUser = !!session.user;
    session.user = null;
    if (store.currentKey() !== 'guest') store.load('guest');
    try { localStorage.setItem('sf:last', 'guest'); } catch {}
    if (wasUser) toast('Sesión cerrada');
  }
  rerender();
}

session.signIn = async () => {
  if (!session.configured) {
    toast('El inicio con Google todavía no está configurado en esta web. Usala sin cuenta por ahora.', { ms: 4500 });
    return false;
  }
  try {
    if (!session.cloudReady) await cloud.init();
    await cloud.signInGoogle();
    return true;
  } catch (e) {
    console.warn(e);
    toast(e.code === 'auth/unauthorized-domain' ? 'Este dominio no está autorizado en Firebase' : 'No se pudo iniciar sesión', { type: 'error' });
    return false;
  }
};
session.signOut = async () => {
  try { await doPush(); } catch {}
  await cloud.signOut();
};

window.addEventListener('online', () => { if (session.user) { pullAndMerge().then(doPush); } });
window.addEventListener('offline', () => { if (session.user) setSync('offline'); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session.user && Date.now() - session.lastSync > 60000) pullAndMerge();
  if (document.visibilityState === 'hidden' && session.user) doPush();
});
window.addEventListener('sf:quota', () => toast('El almacenamiento está lleno. Probá usar fotos más chicas o borrar algunas.', { type: 'error', ms: 5000 }));
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); session.installPrompt = e; });

// ── Boot ───────────────────────────────────────────────────
installGlobalControls();
session.configured = cloud.isConfigured();
let last = 'guest';
try { last = localStorage.getItem('sf:last') || 'guest'; } catch {}
store.load(last.startsWith('user:') && !session.configured ? 'guest' : last);
store.subscribe(rerender);
if (!history.state?.sfNav) history.replaceState({ sfNav: false }, '');

let started = false;
try { started = !!localStorage.getItem('sf:started'); } catch {}
if (!started) showWelcome();
else render();

if (session.configured) {
  cloud.init().then(() => {
    session.cloudReady = true;
    cloud.onUser(handleUser);
  }).catch((e) => { console.warn('firebase', e); setSync('error'); });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
