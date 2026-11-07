// Compartir partidos y torneos con un link. Es una copia fija: incluye resultados,
// escudos, camisetas, alineación y fotos chicas. Quien la recibe la guarda en su app si quiere.
import * as store from './store.js';
import * as cloud from './cloud.js';
import { session } from './session.js';
import { toast } from './ui.js';
import { photoDataURL, saveDataURL } from './media.js';

const MAX_CHARS = 850000;
const slimTeam = (t) => ({ id: t.id, name: t.name, short: t.short || '', kits: t.kits || [], logo: t.logo || '' });
const clean = (m) => { const c = { ...m }; delete c.photos; delete c.updatedAt; delete c.createdAt; return c; };

// Fotos de los partidos como dataURL, hasta que el link no pase el tamaño máximo
async function withPhotos(payload, matches) {
  const all = [];
  for (const m of matches) for (const pid of m.photos || []) all.push({ m, pid });
  const data = [];
  for (const { m, pid } of all) {
    const url = await photoDataURL(pid).catch(() => null);
    if (url) data.push({ matchId: m.id, url });
  }
  let kept = data.slice();
  const build = () => ({ ...payload, photos: kept });
  while (kept.length && JSON.stringify(build()).length > MAX_CHARS) kept.pop();
  return { payload: build(), total: data.length, shared: kept.length };
}

export async function matchPayload(m) {
  const teams = [m.homeId, m.awayId].map((id) => store.find('teams', id)).filter(Boolean).map(slimTeam);
  const venue = store.list('venues').find((v) => v.name.toLowerCase() === String(m.venue || '').toLowerCase()) || null;
  const base = { kind: 'match', teams, venue, match: clean(m) };
  return withPhotos(base, [m]);
}

export async function tournamentPayload(t) {
  const matches = store.list('matches').filter((x) => x.tournamentId === t.id);
  const ids = new Set([...(t.teamIds || []), ...matches.flatMap((x) => [x.homeId, x.awayId])]);
  const teams = [...ids].map((id) => store.find('teams', id)).filter(Boolean).map(slimTeam);
  const tour = { ...t };
  delete tour.createdAt; delete tour.updatedAt;
  const base = { kind: 'tournament', teams, tournament: tour, matches: matches.map(clean) };
  return withPhotos(base, matches);
}

// Sube la copia y devuelve el link
export async function shareLink(build) {
  if (!session.user) { toast('Entrá con Google para compartir', { ms: 3500 }); await session.signIn(); return null; }
  try {
    const { payload, total, shared } = await build;
    await cloud.init();
    const id = await cloud.createShare(payload);
    const url = `${location.origin}${location.pathname}#/compartido/${id}`;
    if (total && shared < total) toast(`Se compartieron ${shared} de ${total} fotos (el link tiene un límite de tamaño)`, { ms: 4500 });
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

// Guarda en mi app lo que me compartieron: escudos, camisetas, fotos y partidos.
export async function importShared(payload) {
  const teamMap = {};
  for (const t of payload.teams || []) {
    const ex = store.list('teams').find((x) => x.name.toLowerCase() === t.name.toLowerCase());
    if (ex) {
      const patch = {};
      if (!ex.logo && t.logo) patch.logo = t.logo;
      if (!(ex.kits || []).length && (t.kits || []).length) patch.kits = t.kits;
      if (Object.keys(patch).length) store.upsert('teams', { id: ex.id, ...patch });
      teamMap[t.id] = ex.id;
    } else {
      teamMap[t.id] = store.upsert('teams', { name: t.name, short: t.short || '', logo: t.logo || '', aliases: [], kits: t.kits || [] }).id;
    }
  }
  const tr = (id) => teamMap[id] || '';
  // fotos: se guardan en este celular y se asocian al partido
  const photosByMatch = {};
  for (const ph of payload.photos || []) {
    const pid = await saveDataURL(ph.url).catch(() => null);
    if (pid) (photosByMatch[ph.matchId] = photosByMatch[ph.matchId] || []).push(pid);
  }
  if (payload.venue && !store.list('venues').some((v) => v.name.toLowerCase() === payload.venue.name.toLowerCase())) {
    store.upsert('venues', { name: payload.venue.name, surface: payload.venue.surface || '', size: payload.venue.size || '' });
  }
  if (payload.kind === 'match') {
    const m = payload.match;
    const created = store.upsert('matches', { ...m, id: undefined, homeId: tr(m.homeId), awayId: tr(m.awayId), photos: photosByMatch[m.id] || [] });
    return { count: 1, id: created.id, kind: 'match' };
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
      ...m, id: undefined, tournamentId: tour.id, homeId: tr(m.homeId), awayId: tr(m.awayId),
      photos: photosByMatch[m.id] || [], homeRef: '', awayRef: '',
    });
    matchMap[m.id] = created.id;
    if (m.homeRef || m.awayRef) pending.push({ id: created.id, homeRef: m.homeRef, awayRef: m.awayRef });
  }
  for (const p of pending) store.upsert('matches', { id: p.id, homeRef: matchMap[p.homeRef] || '', awayRef: matchMap[p.awayRef] || '' });
  return { count: (payload.matches || []).length, id: tour.id, kind: 'tournament' };
}
