// Compartir partidos y torneos con un link. Es una copia fija: quien la recibe
// la guarda en su app si quiere, y sus cambios no se mezclan con los tuyos.
import * as store from './store.js';
import * as cloud from './cloud.js';
import { session } from './session.js';
import { toast } from './ui.js';

const slimTeam = (t) => ({ id: t.id, name: t.name, short: t.short || '', kits: t.kits || [] });
const clean = (m) => { const c = { ...m }; delete c.photos; delete c.updatedAt; delete c.createdAt; return c; };

export function matchPayload(m) {
  const ids = [m.homeId, m.awayId];
  return { kind: 'match', teams: ids.map((id) => store.find('teams', id)).filter(Boolean).map(slimTeam), match: clean(m) };
}

export function tournamentPayload(t) {
  const matches = store.list('matches').filter((m) => m.tournamentId === t.id).map(clean);
  const ids = new Set([...(t.teamIds || []), ...matches.flatMap((m) => [m.homeId, m.awayId])]);
  const teams = [...ids].map((id) => store.find('teams', id)).filter(Boolean).map(slimTeam);
  const tour = { ...t };
  delete tour.createdAt; delete tour.updatedAt;
  return { kind: 'tournament', teams, tournament: tour, matches };
}

// Sube la copia y devuelve el link
export async function shareLink(payload) {
  if (!session.user) { toast('Entrá con Google para compartir', { ms: 3500 }); await session.signIn(); return null; }
  try {
    await cloud.init();
    const id = await cloud.createShare(payload);
    const url = `${location.origin}${location.pathname}#/compartido/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: 'StatsFútbol', url });
      else { await navigator.clipboard.writeText(url); toast('Link copiado', { type: 'ok' }); }
    } catch (e) {
      if (e.name !== 'AbortError') { try { await navigator.clipboard.writeText(url); toast('Link copiado', { type: 'ok' }); } catch { toast(url, { ms: 6000 }); } }
    }
    return url;
  } catch (e) {
    console.warn(e);
    toast('No se pudo crear el link. Revisá la conexión.', { type: 'error' });
    return null;
  }
}

// Guarda en mi app lo que me compartieron. Reasigna ids para no mezclar con lo mío.
export function importShared(payload) {
  const teamMap = {};
  for (const t of payload.teams || []) {
    const ex = store.list('teams').find((x) => x.name.toLowerCase() === t.name.toLowerCase());
    teamMap[t.id] = ex ? ex.id : store.upsert('teams', { name: t.name, short: t.short || '', logo: '', aliases: [], kits: t.kits || [] }).id;
  }
  const tr = (id) => teamMap[id] || '';
  if (payload.kind === 'match') {
    const m = payload.match;
    store.upsert('matches', { ...m, id: undefined, homeId: tr(m.homeId), awayId: tr(m.awayId), myTeam: m.myTeam, photos: [] });
    return 1;
  }
  const t = payload.tournament;
  const remap = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [tr(k) || k, v]));
  const tour = store.upsert('tournaments', {
    ...t, id: undefined, teamIds: (t.teamIds || []).map(tr).filter(Boolean),
    myTeamId: tr(t.myTeamId), withdrawn: remap(t.withdrawn), adjust: remap(t.adjust), groupOf: remap(t.groupOf),
  });
  const matchMap = {};
  const pending = [];
  for (const m of payload.matches || []) {
    const created = store.upsert('matches', {
      ...m, id: undefined, tournamentId: tour.id, homeId: tr(m.homeId), awayId: tr(m.awayId), photos: [],
      homeRef: '', awayRef: '',
    });
    matchMap[m.id] = created.id;
    if (m.homeRef || m.awayRef) pending.push({ id: created.id, homeRef: m.homeRef, awayRef: m.awayRef });
  }
  for (const p of pending) store.upsert('matches', { id: p.id, homeRef: matchMap[p.homeRef] || '', awayRef: matchMap[p.awayRef] || '' });
  return (payload.matches || []).length;
}
