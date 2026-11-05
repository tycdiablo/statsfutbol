import * as store from './store.js';
import { uid, todayISO } from './util.js';
import { roundRobin } from './stats.js';

const NAMES = ['Los Halcones', 'Deportivo Barrio', 'Atlético Plaza', 'Real Potrero', 'Sportivo Norte', 'Unión del Sur'];

function shift(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
const rnd = (n) => Math.floor(Math.random() * n);

export function loadDemo() {
  const teams = store.upsertMany('teams', NAMES.map((name) => ({ id: uid() + rnd(999), name, logo: '' })));
  const ids = teams.map((t) => t.id);
  const mine = ids[0];
  const tour = store.upsert('tournaments', {
    name: 'Liga de Ejemplo ' + todayISO().slice(0, 4), season: todayISO().slice(0, 4), official: true, double: false,
    points: { w: 3, d: 1, l: 0 }, promo: 2, releg: 1, teamIds: ids, myTeamId: mine, notes: 'Torneo de ejemplo: borralo cuando quieras.',
  });
  const rounds = roundRobin(ids, false);
  const played = 3;
  const matches = [];
  rounds.forEach((pairs, r) => pairs.forEach(([h, a]) => {
    const isMine = h === mine || a === mine;
    const date = shift((r - played) * 7 + (r < played ? 0 : 1));
    const m = {
      tournamentId: tour.id, competition: tour.name, round: String(r + 1), homeId: h, awayId: a, official: true,
      played: isMine, myTeam: isMine ? (h === mine ? 'home' : 'away') : '', date, time: '18:00', venue: 'Complejo Municipal',
      status: r < played ? 'finished' : 'scheduled', events: [], prediction: { mode: 'none' }, goals: 0, assists: 0, mvp: 'unknown',
      result: { mode: 'exact', home: rnd(4), away: rnd(3), winner: '' },
    };
    if (r < played && !isMine && rnd(4) === 0) m.result = { mode: 'winner', winner: ['home', 'draw', 'away'][rnd(3)] };
    if (r < played && isMine) {
      Object.assign(m, { goals: rnd(3), assists: rnd(2), minutes: 60 + rnd(31), minutesExact: rnd(2) === 1, starter: 'starter', mvp: rnd(3) === 0 ? 'yes' : 'no', rating: 6 + rnd(4) });
      if (r === 1) m.events = [{ id: uid(), type: 'yellow', minute: 34, note: 'Falta táctica' }];
    }
    matches.push(m);
  }));
  // a friendly and a suspended match
  matches.push({ homeId: ids[0], awayId: ids[3], played: true, myTeam: 'home', official: false, status: 'finished', date: shift(-30), result: { mode: 'approx', home: 5, away: 3 }, goals: 3, assists: 1, minutes: 50, minutesExact: false, mvp: 'yes', rating: 9, events: [{ id: uid(), type: 'golazo', minute: 12, note: 'De chilena' }], competition: 'Picado del jueves', starter: 'starter', prediction: { mode: 'none' } });
  matches.push({ homeId: ids[0], awayId: ids[5], played: true, myTeam: 'home', official: false, status: 'suspended', suspendReason: 'Lluvia, cancha inundada', date: shift(-12), result: { mode: 'exact', home: 0, away: 0 }, events: [], prediction: { mode: 'none' }, competition: 'Amistoso' });
  store.upsertMany('matches', matches);
  store.upsert('clubs', { name: NAMES[0], teamId: mine, from: String(+todayISO().slice(0, 4) - 1), current: true, category: 'Primera', number: '10', logo: '' });
  store.upsert('clubs', { name: 'Club Infantil Estrella', from: '2018', to: '2023', current: false, category: 'Inferiores', logo: '' });
  store.upsert('injuries', { type: 'Esguince de tobillo', date: shift(-90), days: 21, status: 'recovered', notes: 'Kinesiología 3 semanas' });
  store.upsert('goals', { stat: 'goals', target: 20, year: todayISO().slice(0, 4), official: '' });
  store.upsert('notes', { title: 'Rutina de pretemporada', body: 'Lunes: pasadas 10x100\nMiércoles: gimnasio + core\nViernes: definición', color: 'lime', pinned: true, tag: 'entreno' });
  if (!store.get().profile.name) store.setProfile({ name: 'Jugador Demo', position: 'Mediocampista ofensivo', number: '10', foot: 'Derecho' });
}
