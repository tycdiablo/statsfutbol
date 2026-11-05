import * as store from '../store.js';
import { esc, download, todayISO } from '../util.js';
import { ic, googleLogo } from '../icons.js';
import { crest, seg, confirmDialog, toast, avatar } from '../ui.js';
import { openTeamForm } from '../forms.js';
import { session } from '../session.js';

const SYNC_TXT = {
  local: 'Guardado solo en este dispositivo',
  pending: 'Sincronizando…',
  ok: 'Todo guardado en la nube',
  error: 'No se pudo sincronizar. Se reintenta solo.',
  offline: 'Sin conexión: se guarda en el dispositivo y se sube al volver',
};

export default {
  title: 'Cuenta y ajustes',
  back: '#/inicio',
  render() {
    const s = store.get();
    const u = session.user;
    let theme = 'system';
    try { theme = localStorage.getItem('sf:theme') || 'system'; } catch {}
    const teams = s.teams.slice().sort((a, b) => a.name.localeCompare(b.name));
    const counts = { matches: s.matches.length, teams: s.teams.length, tournaments: s.tournaments.length, notes: s.notes.length };
    return `
    <section class="card account-card">
      ${u ? `
        <div class="acc-row">
          ${u.photo ? `<span class="avatar avatar-lg"><img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer"></span>` : avatar({ name: u.name }, 'lg')}
          <div><b>${esc(u.name || 'Mi cuenta')}</b><span class="muted small">${esc(u.email || '')}</span></div>
        </div>
        <div class="sync-row sync-${session.sync}">${ic('cloud')}<span>${SYNC_TXT[session.sync] || ''}</span></div>
        <div class="row-actions"><button class="btn ghost" data-act="syncnow">${ic('cloud')} Sincronizar ahora</button><button class="btn ghost" data-act="logout">${ic('logout')} Cerrar sesión</button></div>
      ` : `
        <h3 class="card-title">${ic('user')} Estás usando la app sin cuenta</h3>
        <p class="muted">Tus datos se guardan en este dispositivo. Entrá con Google para guardar tu progreso en la nube y verlo desde el celu y la compu.</p>
        <button class="btn google block" data-act="login">${googleLogo}<span>Continuar con Google</span></button>
        ${!session.configured ? '<p class="hint">El inicio con Google se activa cuando se configura Firebase (ver README). Mientras tanto podés exportar un backup y pasarlo a otro dispositivo.</p>' : ''}
      `}
    </section>

    <section class="card">
      <h3 class="card-title">${ic('moon')} Apariencia</h3>
      ${seg('theme', [['system', 'Sistema'], ['dark', 'Oscuro'], ['light', 'Claro']], theme)}
    </section>

    <section class="card">
      <div class="sec-head flat"><h3 class="card-title">${ic('shield')} Equipos guardados <span class="count">${teams.length}</span></h3><button class="link" data-act="newteam">${ic('plus', 'inline')} Nuevo</button></div>
      ${teams.length ? `<div class="team-list">${teams.map((t) => {
        const n = s.matches.filter((m) => m.homeId === t.id || m.awayId === t.id).length;
        return `<div class="team-row">${crest(t, 'sm')}<span><b>${esc(t.name)}</b><small class="muted">${n} partido${n === 1 ? '' : 's'}</small></span><button class="icon-btn sm" data-act="editteam" data-id="${t.id}" aria-label="Editar">${ic('edit')}</button><button class="icon-btn sm" data-act="delteam" data-id="${t.id}" aria-label="Borrar">${ic('trash')}</button></div>`;
      }).join('')}</div>` : '<p class="muted small">Los equipos que crees al cargar partidos aparecen acá.</p>'}
    </section>

    <section class="card">
      <h3 class="card-title">${ic('download')} Tus datos</h3>
      <p class="muted small">${counts.matches} partidos · ${counts.teams} equipos · ${counts.tournaments} torneos · ${counts.notes} notas</p>
      <div class="row-actions wrap">
        <button class="btn ghost" data-act="export">${ic('download')} Exportar backup</button>
        <button class="btn ghost" data-act="import">${ic('upload')} Importar backup</button>
        <button class="btn ghost" data-act="demo">${ic('spark')} Cargar ejemplo</button>
      </div>
      <button class="btn ghost danger-txt mt" data-act="wipe">${ic('trash')} Borrar todos mis datos</button>
    </section>

    ${session.installPrompt ? `<section class="card"><h3 class="card-title">${ic('download')} Instalar la app</h3><p class="muted small">Agregala a tu pantalla de inicio y usala como una app más, incluso sin internet.</p><button class="btn primary" data-act="install">Instalar</button></section>` : `<section class="card"><h3 class="card-title">${ic('info')} Instalar en el celular</h3><p class="muted small">En Android: menú ⋮ → “Instalar app”. En iPhone: botón Compartir → “Agregar a inicio”.</p></section>`}

    <p class="hint center">StatsFútbol · hecho para anotar cada partido ⚽</p>`;
  },
  mount(root) {
    root.querySelector('input[name="theme"]')?.addEventListener('change', (e) => {
      const v = e.target.value;
      try { v === 'system' ? localStorage.removeItem('sf:theme') : localStorage.setItem('sf:theme', v); } catch {}
      if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
      window.dispatchEvent(new Event('sf:theme'));
    });
  },
  actions: {
    login: () => session.signIn(),
    logout: async () => { if (await confirmDialog('Tus datos quedan guardados en tu cuenta. En este dispositivo vas a pasar al modo sin cuenta.', { ok: 'Cerrar sesión', title: 'Cerrar sesión' })) session.signOut(); },
    syncnow: () => session.syncNow?.(),
    newteam: () => openTeamForm(),
    editteam: (el) => openTeamForm({ team: store.find('teams', el.dataset.id) }),
    delteam: async (el) => {
      const id = el.dataset.id;
      const used = store.list('matches').some((m) => m.homeId === id || m.awayId === id) || store.list('tournaments').some((t) => (t.teamIds || []).includes(id));
      if (used) { toast('Este equipo se usa en partidos o torneos. Borralos primero o editá el equipo.'); return; }
      if (await confirmDialog('Se borra el equipo.', { ok: 'Borrar', danger: true })) store.remove('teams', id);
    },
    export: () => { download(`statsfutbol-backup-${todayISO()}.json`, store.exportJSON()); toast('Backup descargado', { type: 'ok' }); },
    import: () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        try {
          const json = JSON.parse(await f.text());
          const data = json.data || json;
          if (!data || !Array.isArray(data.matches)) throw new Error('formato');
          const mode = await import('../ui.js').then((u) => u.choiceDialog('Importar backup', [
            { label: 'Combinar con mis datos actuales', value: 'merge', icon: 'copy' },
            { label: 'Reemplazar todo por el backup', value: 'replace', icon: 'upload', danger: true },
          ]));
          if (!mode) return;
          if (mode === 'merge') { store.mergeIn(data); store.markAllDirty(); session.syncNow?.(); }
          else store.replaceAll(data);
          toast('Backup importado', { type: 'ok' });
        } catch { toast('Ese archivo no es un backup válido', { type: 'error' }); }
      };
      inp.click();
    },
    demo: async () => {
      if (store.hasContent() && !(await confirmDialog('Se agregan partidos, equipos y un torneo de ejemplo a tus datos actuales.', { ok: 'Cargar', title: 'Datos de ejemplo' }))) return;
      const { loadDemo } = await import('../demo.js');
      loadDemo();
      toast('Ejemplo cargado', { type: 'ok' });
      location.hash = '#/inicio';
    },
    wipe: async () => {
      if (!(await confirmDialog('Se borran todos tus partidos, torneos, carrera y notas' + (session.user ? ', también de la nube' : '') + '. No se puede deshacer.', { ok: 'Borrar todo', danger: true }))) return;
      store.wipe();
      toast('Datos borrados');
    },
    install: async () => {
      const p = session.installPrompt;
      if (!p) return;
      p.prompt();
      await p.userChoice;
      session.installPrompt = null;
      window.__rerender();
    },
  },
};
