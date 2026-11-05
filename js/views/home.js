import * as store from '../store.js';
import { esc, fmtDate, relDays, fmtNum, byDateDesc } from '../util.js';
import { ic } from '../icons.js';
import { avatar, crest, empty } from '../ui.js';
import { totals, form, streaks, upcoming, playedMatches, predictionAccuracy, achievements, STAT_LABELS, myResult, RES_TEXT, rivalId, standings } from '../stats.js';
import { matchCard, resPill, statTile, progressBar, sectionHead } from '../components.js';
import { openMatchForm, openProfileForm, openNoteEditor, openTournamentForm, openGoalForm } from '../forms.js';

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export function goalProgress(g, s) {
  const t = totals(s.matches, s.injuries, { year: g.year, official: g.official });
  const v = t[g.stat] || 0;
  return { v, p: v / g.target, done: v >= g.target };
}

export default {
  title: 'Inicio',
  fab: { icon: 'plus', label: 'Partido', run: () => openMatchForm() },
  render() {
    const s = store.get();
    const p = s.profile;
    const t = totals(s.matches, s.injuries);
    const year = new Date().getFullYear().toString();
    const ty = totals(s.matches, s.injuries, { year });
    const next = upcoming(s.matches)[0];
    const last = playedMatches(s.matches).sort(byDateDesc)[0];
    const fm = form(s.matches, 5);
    const st = streaks(s.matches);
    const acc = predictionAccuracy(s.matches);
    const ach = achievements(t);
    const unlocked = ach.filter((a) => a.unlocked);
    const nextAch = ach.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress)[0];
    const goals = s.goals.slice(0, 3);
    const club = s.clubs.find((c) => c.current);
    const activeTours = s.tournaments.filter((tr) => s.matches.some((m) => m.tournamentId === tr.id && m.status === 'scheduled')).slice(0, 2);

    return `
    <section class="hero">
      <a href="#/carrera" class="hero-avatar">${avatar(p, 'lg')}</a>
      <div class="hero-text">
        <span class="muted">${greeting()},</span>
        <h2>${esc(p.nickname || p.name || 'crack')}</h2>
        <span class="hero-sub">${[p.position, p.number ? `#${esc(p.number)}` : '', club?.name].filter(Boolean).map(esc).join(' · ') || '<button class="link" data-act="profile">Completá tu perfil →</button>'}</span>
      </div>
    </section>

    <section class="tiles tiles-4">
      ${statTile(t.pj, 'Partidos')}
      ${statTile(t.goals, 'Goles', { accent: true })}
      ${statTile(t.assists, 'Asist.')}
      ${statTile(t.mvps, 'MVP')}
    </section>
    <div class="season-strip">
      <span>${year}</span>
      <b>${ty.pj}</b> PJ · <b>${ty.goals}</b> G · <b>${ty.assists}</b> A · <b>${ty.w}</b>-<b>${ty.d}</b>-<b>${ty.l}</b>
      ${t.minutes ? `<span class="muted">· ${t.minutesApprox ? '~' : ''}${fmtNum(t.minutes)}' totales</span>` : ''}
    </div>

    ${sectionHead('Próximo partido', '<a class="link" href="#/partidos">Ver todos</a>')}
    ${next ? `<div class="next-card">
        <div class="next-count"><b>${next.date ? relDays(next.date, next.time) : 'Sin fecha'}</b><span>${next.date ? fmtDate(next.date, true) : ''}${next.time ? ' · ' + esc(next.time) : ''}${next.venue ? ' · ' + esc(next.venue) : ''}</span></div>
        ${matchCard(next)}
      </div>`
      : `<div class="card cta-card"><p>No tenés partidos por jugarse.</p><button class="btn primary sm" data-act="newmatch">${ic('plus')} Agregar partido</button></div>`}

    ${last ? `${sectionHead('Último partido')}${lastCard(last)}` : ''}

    <div class="grid-2col">
      <section class="card">
        <h3 class="card-title">${ic('bolt')} Forma</h3>
        ${fm.length ? `<div class="form-row">${fm.map((x) => `<a href="#/partido/${x.m.id}">${resPill(x.r, 'lg')}</a>`).join('')}</div>` : '<p class="muted small">Jugá partidos para ver tu forma.</p>'}
        <div class="mini-stats">
          <div><b>${st.unbeaten}</b><span>invicto</span></div>
          <div><b>${st.scoring}</b><span>con gol seguidos</span></div>
          <div><b>${t.winRate != null ? Math.round(t.winRate * 100) + '%' : '–'}</b><span>victorias</span></div>
        </div>
      </section>
      <section class="card">
        <h3 class="card-title">${ic('crystal')} Predicciones</h3>
        ${acc.total ? `<div class="mini-stats">
            <div><b>${Math.round(acc.pct * 100)}%</b><span>acertadas</span></div>
            <div><b>${acc.result}/${acc.total}</b><span>ganador</span></div>
            <div><b>${acc.exact}</b><span>exactas</span></div>
          </div>` : '<p class="muted small">Predecí resultados de partidos por jugarse y acá vas a ver cuánto acertás.</p>'}
      </section>
    </div>

    ${sectionHead('Objetivos', `<button class="link" data-act="newgoal">${ic('plus', 'inline')} Nuevo</button>`)}
    ${goals.length ? `<div class="card list-card">${goals.map((g) => {
      const gp = goalProgress(g, s);
      return `<div class="goal-row ${gp.done ? 'done' : ''}"><div class="goal-top"><span>${STAT_LABELS[g.stat]}${g.year ? ` en ${g.year}` : ''}</span><b>${fmtNum(gp.v)} / ${fmtNum(g.target)}</b></div>${progressBar(gp.p)}</div>`;
    }).join('')}<a class="link small" href="#/carrera">Ver todos →</a></div>`
      : `<div class="card cta-card"><p>Ponete metas: “15 goles este año”, “10 MVP”…</p><button class="btn ghost sm" data-act="newgoal">${ic('target')} Crear objetivo</button></div>`}

    ${activeTours.length ? `${sectionHead('Torneos en curso', '<a class="link" href="#/torneos">Ver</a>')}<div class="tour-mini-list">${activeTours.map((tr) => tourMini(tr, s)).join('')}</div>` : ''}

    ${sectionHead('Logros', `<span class="muted small">${unlocked.length}/${ach.length}</span>`)}
    <div class="card">
      ${unlocked.length ? `<div class="badges-row">${unlocked.slice(-6).reverse().map((a) => `<span class="badge-mini" title="${esc(a.title)}">${a.icon}</span>`).join('')}</div>` : ''}
      ${nextAch ? `<div class="next-ach"><span class="badge-mini locked">${nextAch.icon}</span><div><b>${esc(nextAch.title)}</b><span class="muted small">${esc(nextAch.desc)} · ${fmtNum(nextAch.value)}/${fmtNum(nextAch.target)}</span>${progressBar(nextAch.progress)}</div></div>` : '<p>¡Desbloqueaste todos los logros! 🐐</p>'}
    </div>

    <div class="quick-actions">
      <button class="qa" data-act="newmatch">${ic('ball')}<span>Partido</span></button>
      <button class="qa" data-act="newtour">${ic('trophy')}<span>Torneo</span></button>
      <button class="qa" data-act="newnote">${ic('note')}<span>Nota</span></button>
    </div>`;
  },
  actions: {
    profile: () => openProfileForm(),
    newmatch: () => openMatchForm(),
    newnote: () => openNoteEditor(),
    newtour: () => openTournamentForm({ onSaved: (t) => { location.hash = '#/torneo/' + t.id; } }),
    newgoal: () => openGoalForm(),
  },
};

function lastCard(m) {
  const r = myResult(m);
  const rival = store.find('teams', rivalId(m));
  return `<a class="last-card card" href="#/partido/${m.id}">
    <div class="last-top">${resPill(r, 'lg')}<div><b>${r ? RES_TEXT[r] : 'Resultado desconocido'}${rival ? ` vs ${esc(rival.name)}` : ''}</b><span class="muted small">${fmtDate(m.date)}${m.competition ? ' · ' + esc(m.competition) : ''}</span></div>${crest(rival, 'md')}</div>
    <div class="last-stats">
      <div><b>${m.goals || 0}</b><span>Goles</span></div>
      <div><b>${m.assists || 0}</b><span>Asist.</span></div>
      <div><b>${m.minutes !== '' && m.minutes != null ? (m.minutesExact ? '' : '~') + m.minutes + "'" : '–'}</b><span>Minutos</span></div>
      <div><b>${+m.rating ? m.rating : '–'}</b><span>Nota</span></div>
      <div><b>${m.mvp === 'yes' ? '⭐' : m.mvp === 'no' ? 'No' : '?'}</b><span>MVP</span></div>
    </div>
  </a>`;
}

export function tourMini(tr, s) {
  const rows = standings(tr, s.matches);
  const pos = tr.myTeamId ? rows.findIndex((r) => r.teamId === tr.myTeamId) + 1 : 0;
  const ms = s.matches.filter((m) => m.tournamentId === tr.id);
  const done = ms.filter((m) => m.status === 'finished').length;
  const my = rows.find((r) => r.teamId === tr.myTeamId);
  return `<a class="card tour-mini" href="#/torneo/${tr.id}">
    <span class="tour-ico">${ic('trophy')}</span>
    <div class="tm-main"><b>${esc(tr.name)}</b><span class="muted small">${done}/${ms.length} partidos jugados</span>${progressBar(ms.length ? done / ms.length : 0, 'thin')}</div>
    ${pos ? `<div class="tm-pos"><b>${pos}°</b><span>${my?.pts ?? 0} pts</span></div>` : ''}
  </a>`;
}
