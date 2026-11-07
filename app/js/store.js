// Local-first data store. Each account (guest or Google user) has its own
// copy in localStorage; cloud sync pushes "dirty" parts to Firestore.
import { uid as newId } from './util.js';

export const COLS = ['teams', 'matches', 'tournaments', 'clubs', 'injuries', 'notes', 'goals', 'venues', 'players'];
export const PARTS = ['profile', 'meta', ...COLS];

const listeners = new Set();
let key = 'guest';
let state = empty();
const dirty = new Set();
let syncHook = null;

function empty() {
  return {
    profile: { name: '', nickname: '', position: '', position2: '', number: '', foot: '', birth: '', height: '', bio: '', photo: '', updatedAt: 0 },
    teams: [], matches: [], tournaments: [], clubs: [], injuries: [], notes: [], goals: [], venues: [], players: [],
    meta: { deleted: {}, updatedAt: 0 },
  };
}

function normalize(s) {
  const e = empty();
  s = s || {};
  const out = { ...e };
  out.profile = { ...e.profile, ...(s.profile || {}) };
  out.meta = { ...e.meta, ...(s.meta || {}) };
  out.meta.deleted = { ...(out.meta.deleted || {}) };
  for (const c of COLS) out[c] = Array.isArray(s[c]) ? s[c].filter((x) => x && x.id) : [];
  return out;
}

const skey = (k) => 'sf:data:' + k;

export function readKey(k) {
  try {
    const raw = localStorage.getItem(skey(k));
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch { return null; }
}
export function clearKey(k) { try { localStorage.removeItem(skey(k)); } catch {} }

export function load(k) {
  key = k;
  state = readKey(k) || empty();
  dirty.clear();
  emit();
}

function persist() {
  try {
    localStorage.setItem(skey(key), JSON.stringify(state));
  } catch (e) {
    console.warn(e);
    window.dispatchEvent(new CustomEvent('sf:quota'));
  }
}

function emit() { listeners.forEach((f) => f(state)); }

function touch(...parts) {
  parts.forEach((p) => dirty.add(p));
  state.meta.updatedAt = Date.now();
  persist();
  emit();
  syncHook && syncHook();
}

export const get = () => state;
export const currentKey = () => key;
export const list = (col) => state[col];
export const find = (col, id) => (id ? state[col].find((x) => x.id === id) : undefined);

export function upsert(col, obj) {
  const now = Date.now();
  const arr = state[col];
  let item;
  const i = obj.id ? arr.findIndex((x) => x.id === obj.id) : -1;
  if (i >= 0) {
    item = { ...arr[i], ...obj, updatedAt: now };
    arr[i] = item;
  } else {
    item = { ...obj, id: obj.id || newId(), createdAt: now, updatedAt: now };
    arr.push(item);
  }
  touch(col);
  return item;
}

export function upsertMany(col, objs) {
  const now = Date.now();
  const out = objs.map((o, i) => ({ ...o, id: o.id || newId() + i, createdAt: now, updatedAt: now }));
  state[col].push(...out);
  touch(col);
  return out;
}

export function remove(col, id) {
  state[col] = state[col].filter((x) => x.id !== id);
  state.meta.deleted[id] = Date.now();
  touch(col, 'meta');
}

export function removeWhere(col, pred) {
  const now = Date.now();
  state[col] = state[col].filter((x) => {
    if (pred(x)) { state.meta.deleted[x.id] = now; return false; }
    return true;
  });
  touch(col, 'meta');
}

export function setProfile(patch) {
  state.profile = { ...state.profile, ...patch, updatedAt: Date.now() };
  touch('profile');
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setSyncHook(fn) { syncHook = fn; }

export function takeDirty() {
  const parts = {};
  for (const k of dirty) parts[k] = state[k];
  dirty.clear();
  return parts;
}
export function markDirty(keys) { keys.forEach((k) => dirty.add(k)); }
export function markAllDirty() { PARTS.forEach((k) => dirty.add(k)); }

export function hasContent(s = state) {
  return COLS.some((c) => s[c]?.length) || !!s.profile?.name;
}

// Merge another copy (cloud or guest) into the current one. Newest item wins,
// deletions are respected through tombstones.
export function mergeIn(remote) {
  const r = normalize(remote);
  const del = { ...state.meta.deleted };
  for (const [id, t] of Object.entries(r.meta.deleted)) del[id] = Math.max(t, del[id] || 0);
  for (const c of COLS) {
    const map = new Map();
    for (const it of [...state[c], ...r[c]]) {
      const prev = map.get(it.id);
      if (!prev || (it.updatedAt || 0) > (prev.updatedAt || 0)) map.set(it.id, it);
    }
    state[c] = [...map.values()].filter((it) => !(del[it.id] && del[it.id] >= (it.updatedAt || 0)));
  }
  if ((r.profile.updatedAt || 0) > (state.profile.updatedAt || 0)) state.profile = r.profile;
  state.meta.deleted = del;
  state.meta.updatedAt = Math.max(state.meta.updatedAt || 0, r.meta.updatedAt || 0);
  persist();
  emit();
}

export function replaceAll(data) {
  const old = state;
  state = normalize(data);
  // tombstone everything that disappeared so the cloud forgets it too
  const ids = new Set(COLS.flatMap((c) => state[c].map((x) => x.id)));
  const now = Date.now();
  for (const c of COLS) for (const it of old[c]) if (!ids.has(it.id)) state.meta.deleted[it.id] = now;
  for (const c of COLS) for (const it of state[c]) { it.updatedAt = now; delete state.meta.deleted[it.id]; }
  state.profile.updatedAt = now;
  markAllDirty();
  touch('meta');
}

export function wipe() {
  replaceAll(empty());
}

export function exportJSON() {
  return JSON.stringify({ app: 'statsfutbol', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
}
