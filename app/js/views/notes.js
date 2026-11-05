import * as store from '../store.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { empty } from '../ui.js';
import { openNoteEditor } from '../forms.js';

const F = { q: '', tag: '' };
const rel = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function ago(ts) {
  const s = (ts - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return rel.format(Math.round(s / n), u);
  return 'recién';
}

export default {
  title: 'Notas',
  fab: { icon: 'plus', label: 'Nota', run: () => openNoteEditor() },
  render() {
    const all = store.list('notes');
    const q = F.q.toLowerCase();
    const tags = [...new Set(all.map((n) => n.tag).filter(Boolean))].sort();
    const notes = all
      .filter((n) => (!F.tag || n.tag === F.tag) && (!q || (n.title + ' ' + n.body).toLowerCase().includes(q)))
      .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    if (!all.length) {
      return empty('note', 'Tus notas libres', 'Anotá lo que quieras: entrenamientos, sensaciones, tácticas, cosas para mejorar, la rutina del gimnasio…', `<button class="btn primary" data-act="new">${ic('plus')} Nueva nota</button>`);
    }
    return `
      <div class="search">${ic('search')}<input type="search" placeholder="Buscar en tus notas" value="${esc(F.q)}" data-search></div>
      ${tags.length ? `<div class="filters"><button class="fchip ${!F.tag ? 'on' : ''}" data-act="tag" data-v="">Todas</button>${tags.map((t) => `<button class="fchip ${F.tag === t ? 'on' : ''}" data-act="tag" data-v="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
      ${notes.length ? `<div class="notes-grid">${notes.map((n) => `
        <button class="note-card nc-${n.color || 'default'}" data-act="open" data-id="${n.id}">
          ${n.pinned ? `<span class="note-pin">${ic('tack')}</span>` : ''}
          ${n.title ? `<b>${esc(n.title)}</b>` : ''}
          ${n.body ? `<p>${esc(n.body.slice(0, 280))}${n.body.length > 280 ? '…' : ''}</p>` : ''}
          <span class="note-meta">${n.tag ? `#${esc(n.tag)} · ` : ''}${ago(n.updatedAt)}</span>
        </button>`).join('')}</div>` : empty('search', 'Sin resultados')}`;
  },
  mount(root) {
    const inp = root.querySelector('[data-search]');
    inp?.addEventListener('input', () => {
      F.q = inp.value;
      const pos = inp.selectionStart;
      window.__rerender();
      const n = document.querySelector('[data-search]');
      n?.focus(); n?.setSelectionRange(pos, pos);
    });
  },
  actions: {
    new: () => openNoteEditor(),
    open: (el) => openNoteEditor({ note: store.find('notes', el.dataset.id) }),
    tag: (el) => { F.tag = el.dataset.v; window.__rerender(); },
  },
};
