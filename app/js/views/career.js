import * as store from '../store.js';
import { esc, fmtDate, fmtNum, age, fmtMonthShort, byDateDesc } from '../util.js';
import { ic } from '../icons.js';
import { avatar, crest, empty, seg, confirmDialog, toast } from '../ui.js';
import { totals, byYear, byTeam, monthly, achievements, years, STAT_LABELS, playedMatches, EVENT_TYPES } from '../stats.js';
import { statTile, progressBar, sectionHead, barChart } from '../components.js';
import { openProfileForm, openClubForm, openInjuryForm, openGoalForm } from '../forms.js';
import { goalProgress } from './home.js';

const F = { official: '', year: '' };

export default {
  title: 'Carrera',
  render() {
    const s = store.get();
    const p = s.profile;
    const f = { official: F.official, year: F.year };
    const t = totals(s.matches, s.injuries, f);
    const ys = years(playedMatches(s.matches));
    const a = age(p.birth);
    const clubs = s.clubs.slice().sort((x, y) => (y.current - x.current) || (+(y.to || y.from || 0)) - (+(x.to || x.from || 0)) || (+(y.from || 0)) - (+(x.from || 0)));
    const month = monthly(s.matches, f).map((d) => ({ ...d, label: fmtMonthShort(d.key) }));
    const seasons = byYear(s.matches, s.injuries, { official: F.official });
    const teamsRows = byTeam(s.matches, f);
    const ach = achievements(totals(s.matches, s.injuries));
    const matchInjuries = s.matches.flatMap((m) => (m.events || []).filter((e) => e.type === 'injury').map((e) => ({ ...e, match: m })));
    const dec = t.w + t.d + t.l;

    return `
    <section class="profile-card card">
      <div class="pc-top">
        ${avatar(p, 'xl')}
        <div class="pc-info">
          <h2>${esc(p.name || 'Tu nombre')}${p.nickname ? ` <span class="muted">“${esc(p.nickname)}”</span>` : ''}</h2>
          <span class="muted">${[p.position, p.position2].filter(Boolean).map(esc).join(' / ') || 'Sin posición'}</span>
          <div class="pc-tags">
            ${p.number ? `<span class="chip">#${esc(p.number)}</span>` : ''}
            ${p.foot ? `<span class="chip">Pie ${esc(p.foot.toLowerCase())}</span>` : ''}
            ${a != null ? `<span class="chip">${a} años</span>` : ''}
            ${p.height ? `<span class="chip">${esc(p.height)} cm</span>` : ''}
          </div>
        </div>
        <button class="icon-btn" data-act="profile" aria-label="Editar perfil">${ic('edit')}</button>
      </div>
      ${p.bio ? `<p class="pc-bio">${esc(p.bio)}</p>` : ''}
    </section>

    <div class="filter-bar">
      ${seg('cf-official', [['', 'Todos'], ['official', 'Oficiales'], ['friendly', 'No oficiales']], F.official, { small: true })}
      <select class="select-sm" data-yearsel aria-label="Temporada"><option value="">Toda la carrera</option>${ys.map((y) => `<option ${y === F.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
    </div>

    <section class="tiles tiles-4">
      ${statTile(t.pj, 'Partidos')}
      ${statTile(t.goals, 'Goles', { accent: true })}
      ${statTile(t.assists, 'Asistencias')}
      ${statTile(t.ga, 'G + A')}
      ${statTile(fmtNum(t.minutes), 'Minutos', { approx: t.minutesApprox })}
      ${statTile(t.mvps, 'MVP ⭐')}
      ${statTile(t.yellows, 'Amarillas 🟨')}
      ${statTile(t.reds, 'Rojas 🟥')}
      ${statTile(t.owngoals, 'Goles en contra')}
      ${statTile(t.injuries, 'Lesiones 🩹')}
      ${statTile(t.hattricks, 'Hat-tricks')}
      ${statTile(t.avgRating ? fmtNum(t.avgRating, 1) : '–', 'Nota media')}
    </section>
    ${t.minutesApprox ? '<p class="hint">~ Los minutos incluyen valores aproximados.</p>' : ''}

    <section class="card">
      <h3 class="card-title">Resultados con mis equipos</h3>
      ${dec ? `<div class="wdl"><i class="w" style="flex:${t.w}"></i><i class="d" style="flex:${t.d}"></i><i class="l" style="flex:${t.l}"></i></div>
        <div class="wdl-legend"><span><b>${t.w}</b> victorias</span><span><b>${t.d}</b> empates</span><span><b>${t.l}</b> derrotas</span></div>` : '<p class="muted small">Sin resultados conocidos todavía.</p>'}
      <div class="kv mt">
        <div><span>Promedio de gol</span><b>${fmtNum(t.gpm, 2)} por partido</b></div>
        <div><span>Asistencias por partido</span><b>${fmtNum(t.apm, 2)}</b></div>
        <div><span>Minutos por gol</span><b>${t.minPerGoal ? t.minPerGoal + "'" : '–'}</b></div>
        <div><span>Minutos por gol o asistencia</span><b>${t.minPerGA ? t.minPerGA + "'" : '–'}</b></div>
        <div><span>Titular / suplente</span><b>${t.starts} / ${t.subs}</b></div>
        <div><span>Partidos con gol</span><b>${t.withGoal}${t.pj ? ` (${Math.round((t.withGoal / t.pj) * 100)}%)` : ''}</b></div>
        <div><span>Dobletes</span><b>${t.braces}</b></div>
        <div><span>Penales convertidos / errados</span><b>${t.penScored} / ${t.penMissed}</b></div>
        ${t.penSaved ? `<div><span>Penales atajados</span><b>${t.penSaved}</b></div>` : ''}
        ${t.cleanSheets ? `<div><span>Vallas invictas</span><b>${t.cleanSheets}</b></div>` : ''}
        ${t.captain ? `<div><span>Partidos de capitán</span><b>${t.captain}</b></div>` : ''}
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">${ic('chart')} Últimos 12 meses</h3>
      ${barChart(month)}
    </section>

    ${sectionHead('Trayectoria', `<button class="link" data-act="addclub">${ic('plus', 'inline')} Club</button>`)}
    ${clubs.length ? `<div class="timeline-clubs">${clubs.map((c) => clubCard(c, s)).join('')}</div>`
      : `<div class="card cta-card"><p>Agregá los equipos por los que pasaste, con su escudo y los años.</p><button class="btn ghost sm" data-act="addclub">${ic('shield')} Agregar club</button></div>`}

    ${seasons.length ? `${sectionHead('Por temporada')}
      <div class="table-wrap"><table class="standings stats-table"><thead><tr><th class="tl">Año</th><th>PJ</th><th>G</th><th>A</th><th>Min</th><th>MVP</th><th class="hide-xs">🟨</th><th class="hide-xs">🟥</th><th>G-E-P</th></tr></thead>
      <tbody>${seasons.map(({ year, t: r }) => `<tr><td class="tl"><b>${year}</b></td><td>${r.pj}</td><td class="pts">${r.goals}</td><td>${r.assists}</td><td>${r.minutesApprox ? '~' : ''}${fmtNum(r.minutes)}</td><td>${r.mvps}</td><td class="hide-xs">${r.yellows}</td><td class="hide-xs">${r.reds}</td><td>${r.w}-${r.d}-${r.l}</td></tr>`).join('')}</tbody></table></div>` : ''}

    ${teamsRows.length ? `${sectionHead('Por equipo')}
      <div class="table-wrap"><table class="standings stats-table"><thead><tr><th class="tl">Equipo</th><th>PJ</th><th>G</th><th>A</th><th>MVP</th><th>G-E-P</th></tr></thead>
      <tbody>${teamsRows.map(({ teamId, t: r }) => { const tm = store.find('teams', teamId); return `<tr><td class="tl"><div class="team-cell">${crest(tm, 'xs')}<span>${esc(tm?.name || '?')}</span></div></td><td>${r.pj}</td><td class="pts">${r.goals}</td><td>${r.assists}</td><td>${r.mvps}</td><td>${r.w}-${r.d}-${r.l}</td></tr>`; }).join('')}</tbody></table></div>` : ''}

    ${sectionHead(`Lesiones <span class="count">${s.injuries.length + matchInjuries.length}</span>`, `<button class="link" data-act="addinj">${ic('plus', 'inline')} Lesión</button>`)}
    ${s.injuries.length || matchInjuries.length ? `<div class="card list-card">
      ${s.injuries.slice().sort(byDateDesc).map((i) => `<button class="inj-row" data-act="editinj" data-id="${i.id}"><span class="inj-ico">🩹</span><div><b>${esc(i.type)}</b><span class="muted small">${fmtDate(i.date)}${i.days ? ` · ${i.days} días de baja` : ''}</span></div>${i.status === 'active' ? '<span class="chip st-susp">En recuperación</span>' : '<span class="chip">Recuperado</span>'}</button>`).join('')}
      ${matchInjuries.map((e) => `<a class="inj-row" href="#/partido/${e.match.id}"><span class="inj-ico">⚽</span><div><b>${esc(e.note || 'Lesión en partido')}</b><span class="muted small">${fmtDate(e.match.date)}${e.minute !== '' && e.minute != null ? ` · min ${e.minute}` : ''} · en partido</span></div>${ic('chev', 'muted')}</a>`).join('')}
    </div>` : '<div class="card cta-card"><p>Sin lesiones registradas. ¡Que siga así! 💪</p></div>'}

    ${sectionHead('Objetivos', `<button class="link" data-act="addgoal">${ic('plus', 'inline')} Objetivo</button>`)}
    ${s.goals.length ? `<div class="card list-card">${s.goals.map((g) => {
      const gp = goalProgress(g, s);
      return `<button class="goal-row ${gp.done ? 'done' : ''}" data-act="editgoal" data-id="${g.id}"><div class="goal-top"><span>${gp.done ? '✅ ' : ''}${STAT_LABELS[g.stat]}${g.year ? ` en ${g.year}` : ' (carrera)'}${g.official ? (g.official === 'official' ? ' · oficiales' : ' · no oficiales') : ''}</span><b>${fmtNum(gp.v)} / ${fmtNum(g.target)}</b></div>${progressBar(gp.p)}</button>`;
    }).join('')}</div>` : `<div class="card cta-card"><p>Definí metas y seguí tu progreso automáticamente.</p><button class="btn ghost sm" data-act="addgoal">${ic('target')} Crear objetivo</button></div>`}

    ${sectionHead('Logros', `<span class="muted small">${ach.filter((x) => x.unlocked).length}/${ach.length}</span>`)}
    <div class="badges">${ach.map((x) => `<div class="badge ${x.unlocked ? 'on' : ''}" title="${esc(x.desc)}"><span class="badge-ico">${x.icon}</span><b>${esc(x.title)}</b><small>${esc(x.desc)}</small>${x.unlocked ? '' : progressBar(x.progress, 'thin')}</div>`).join('')}</div>
    `;
  },
  mount(root) {
    root.querySelector('[data-yearsel]')?.addEventListener('change', (e) => { F.year = e.target.value; window.__rerender(); });
    root.querySelector('input[name="cf-official"]')?.addEventListener('change', (e) => { F.official = e.target.value; window.__rerender(); });
  },
  actions: {
    profile: () => openProfileForm(),
    addclub: () => openClubForm(),
    editclub: async (el) => {
      const c = store.find('clubs', el.dataset.id);
      openClubForm({ club: c });
    },
    delclub: async (el) => {
      if (await confirmDialog('Se borra este club de tu trayectoria.', { ok: 'Borrar', danger: true })) { store.remove('clubs', el.dataset.id); toast('Club borrado'); }
    },
    addinj: () => openInjuryForm(),
    editinj: (el) => injuryActions(el.dataset.id),
    addgoal: () => openGoalForm(),
    editgoal: (el) => goalActions(el.dataset.id),
  },
};

async function injuryActions(id) {
  const { choiceDialog } = await import('../ui.js');
  const v = await choiceDialog('Lesión', [{ label: 'Editar', value: 'edit', icon: 'edit' }, { label: 'Borrar', value: 'del', icon: 'trash', danger: true }]);
  if (v === 'edit') openInjuryForm({ injury: store.find('injuries', id) });
  if (v === 'del') { store.remove('injuries', id); toast('Lesión borrada'); }
}
async function goalActions(id) {
  const { choiceDialog } = await import('../ui.js');
  const v = await choiceDialog('Objetivo', [{ label: 'Editar', value: 'edit', icon: 'edit' }, { label: 'Borrar', value: 'del', icon: 'trash', danger: true }]);
  if (v === 'edit') openGoalForm({ goal: store.find('goals', id) });
  if (v === 'del') { store.remove('goals', id); toast('Objetivo borrado'); }
}

function clubCard(c, s) {
  const years = c.current ? `${c.from || '?'} – Actualidad` : c.from && c.to && c.from !== c.to ? `${c.from} – ${c.to}` : c.from || c.to || 'Sin años';
  const t = c.teamId ? totals(s.matches, [], { teamId: c.teamId }) : null;
  return `<div class="club-card card ${c.current ? 'current' : ''}">
    <span class="club-dot"></span>
    ${crest({ name: c.name, logo: c.logo }, 'lg')}
    <div class="club-main">
      <b>${esc(c.name)}</b>
      <span class="muted small">${esc(years)}${c.category ? ' · ' + esc(c.category) : ''}${c.number ? ' · #' + esc(c.number) : ''}</span>
      ${t && t.pj ? `<span class="club-stats">${t.pj} PJ · ${t.goals} G · ${t.assists} A${t.mvps ? ` · ${t.mvps} MVP` : ''}</span>` : ''}
      ${c.notes ? `<span class="small">${esc(c.notes)}</span>` : ''}
    </div>
    <div class="club-actions">
      <button class="icon-btn sm" data-act="editclub" data-id="${c.id}" aria-label="Editar">${ic('edit')}</button>
      <button class="icon-btn sm" data-act="delclub" data-id="${c.id}" aria-label="Borrar">${ic('trash')}</button>
    </div>
  </div>`;
}
