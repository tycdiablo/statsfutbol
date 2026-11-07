import * as store from '../store.js';
import { esc, fmtDate } from '../util.js';
import { ic } from '../icons.js';
import { crest, toast } from '../ui.js';
import * as cloud from '../cloud.js';
import { importShared } from '../share.js';

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
      const teams = (data.teams || []).map((t) => `<span class="sh-team">${crest(t, 'sm')}${esc(t.name)}</span>`).join('');
      const title = data.kind === 'match'
        ? `${esc(data.teams?.[0]?.name || '')} vs ${esc(data.teams?.[1]?.name || '')}`
        : esc(data.tournament?.name || 'Torneo');
      const detail = data.kind === 'match'
        ? `${data.match?.date ? fmtDate(data.match.date, true) : 'Sin fecha'}${data.match?.status === 'finished' && data.match?.result?.mode === 'exact' ? ` · ${data.match.result.home} – ${data.match.result.away}` : ''}`
        : `${(data.matches || []).length} partidos · ${(data.teams || []).length} equipos`;
      box.innerHTML = `<section class="card shared-card">
        <span class="tour-ico big">${ic(data.kind === 'match' ? 'ball' : 'trophy')}</span>
        <h2>${title}</h2>
        <p class="muted">${detail}</p>
        <div class="sh-teams">${teams}</div>
        <p class="hint">Es una copia. Si la guardás en tu app, tus cambios no afectan a quien te la mandó.</p>
        <button class="btn primary block" data-save-shared>${ic('download')} Guardar en mi app</button>
      </section>`;
      box.querySelector('[data-save-shared]').addEventListener('click', () => {
        const n = importShared(data);
        toast(data.kind === 'match' ? 'Partido guardado en tu app' : `Torneo guardado con ${n} partidos`, { type: 'ok' });
        location.hash = data.kind === 'match' ? '#/partidos' : '#/torneos';
      });
    } catch (e) {
      console.warn(e);
      box.innerHTML = '<p class="center pad">No pudimos abrir el link. Revisá la conexión.</p>';
    }
  },
};
