// Fotos de partidos.
// Cada foto se guarda en este celular (IndexedDB) y, si hay sesión con Google,
// también en la nube: users/{uid}/photos/{id} (un documento por foto, ~200 KB).
// Así las fotos aparecen en todos los dispositivos donde entres con la misma cuenta.
import * as store from './store.js';
import * as cloud from './cloud.js';
import { session } from './session.js';
import { uid } from './util.js';

const DB = 'sf-media';
const STORE = 'photos';
const UP_KEY = 'sf:photosUp';
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
  });
}

// Imagen reducida a `max` px, en WebP
async function toWebp(source, max, quality) {
  const url = source instanceof Blob ? URL.createObjectURL(source) : source;
  try {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
  } finally { if (source instanceof Blob) URL.revokeObjectURL(url); }
}

const canvasToBlob = (c, q) => new Promise((res) => c.toBlob((b) => res(b), 'image/webp', q));
const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

// Foto para guardar en este celular
export async function addPhoto(file) {
  const c = await toWebp(file, 1200, 0.8);
  const blob = await canvasToBlob(c, 0.8);
  const id = uid();
  await tx('readwrite', (s) => s.put(blob, id));
  photosSync();
  return id;
}

export async function getPhotoURL(id) {
  const blob = await tx('readonly', (s) => s.get(id));
  return blob ? URL.createObjectURL(blob) : null;
}

export async function removePhoto(id) {
  await tx('readwrite', (s) => s.delete(id));
  const up = upSet();
  if (up.delete(id)) saveUp(up);
  if (session.user && cloud.isConfigured()) cloud.deletePhoto(session.user.uid, id).catch(() => {});
}

// Versión chica (para compartir por link): dataURL en WebP
export async function photoDataURL(id) {
  const blob = await tx('readonly', (s) => s.get(id));
  if (!blob) return null;
  const c = await toWebp(blob, 800, 0.75);
  return c.toDataURL('image/webp', 0.75);
}

// Guarda una dataURL recibida (por compartir) como foto local
export async function saveDataURL(dataURL) {
  const id = uid();
  await putDataURL(id, dataURL);
  return id;
}

async function putDataURL(id, dataURL) {
  const blob = await (await fetch(dataURL)).blob();
  await tx('readwrite', (s) => s.put(blob, id));
}

// ── Sincronización con la nube ─────────────────────────────
function upSet() {
  try { return new Set(JSON.parse(localStorage.getItem(UP_KEY) || '[]')); } catch { return new Set(); }
}
function saveUp(s) {
  try { localStorage.setItem(UP_KEY, JSON.stringify([...s])); } catch {}
}

let running = false;
let again = false;

// Sube las fotos de este celular que están en algún partido y baja las que faltan.
// Se llama al entrar, al sincronizar y al agregar una foto.
export async function photosSync() {
  if (!session.user || !cloud.isConfigured()) return;
  if (running) { again = true; return; }
  running = true;
  try {
    await cloud.init();
    const me = session.user.uid;
    const needed = store.list('matches').flatMap((m) => m.photos || []);
    const neededSet = new Set(needed);
    const local = new Set(await tx('readonly', (s) => s.getAllKeys()));
    const up = upSet();
    for (const id of local) {
      if (!neededSet.has(id) || up.has(id)) continue;
      const blob = await tx('readonly', (s) => s.get(id));
      const c = await toWebp(blob, 1200, 0.8);
      let data = await canvasToBlob(c, 0.8).then(blobToDataURL);
      if (data.length > 900000) data = (await toWebp(blob, 900, 0.7)).toDataURL('image/webp', 0.7);
      await cloud.uploadPhoto(me, id, data);
      up.add(id); saveUp(up);
    }
    let got = 0;
    for (const id of needed) {
      if (local.has(id)) continue;
      const data = await cloud.downloadPhoto(me, id);
      if (data) { await putDataURL(id, data); got++; }
    }
    if (got) window.__rerender && window.__rerender();
  } catch (e) {
    console.warn('fotos', e);
  } finally {
    running = false;
    if (again) { again = false; photosSync(); }
  }
}
