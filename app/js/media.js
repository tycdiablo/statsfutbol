// Fotos de partidos. Se guardan en este dispositivo (IndexedDB), no en la nube:
// las fotos pesan demasiado para la base de datos que sincroniza la app.
// En el partido solo queda la lista de ids.
import { uid } from './util.js';

const DB = 'sf-media';
const STORE = 'photos';
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
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && out.result);
    t.onerror = () => rej(t.error);
  });
}

// Reduce la foto a un máximo de 1600 px y la guarda como WebP
export async function compressPhoto(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((res) => c.toBlob((b) => res(b), 'image/webp', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

export async function addPhoto(file) {
  const blob = await compressPhoto(file);
  const id = uid();
  await tx('readwrite', (s) => s.put(blob, id));
  return id;
}

export async function getPhotoURL(id) {
  const blob = await tx('readonly', (s) => s.get(id));
  return blob ? URL.createObjectURL(blob) : null;
}

export async function removePhoto(id) {
  await tx('readwrite', (s) => s.delete(id));
}
