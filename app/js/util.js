export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
export const int0 = (v) => Math.max(0, parseInt(v, 10) || 0);

export const clone = (o) => JSON.parse(JSON.stringify(o ?? null));

export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function parseDate(iso, time) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

const dfShort = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const dfLong = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dfMonth = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
const dfMonthShort = new Intl.DateTimeFormat('es-AR', { month: 'short' });

export function fmtDate(iso, long = false) {
  const d = parseDate(iso);
  if (!d) return 'Sin fecha';
  return (long ? dfLong : dfShort).format(d).replace('.', '');
}
export function fmtMonth(key) {
  const [y, m] = key.split('-').map(Number);
  const s = dfMonth.format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function fmtMonthShort(key) {
  const [y, m] = key.split('-').map(Number);
  return dfMonthShort.format(new Date(y, m - 1, 1)).replace('.', '');
}

export function relDays(iso, time) {
  const d = parseDate(iso, time);
  if (!d) return '';
  const today = parseDate(todayISO());
  const diff = Math.round((parseDate(iso) - today) / 86400000);
  if (diff === 0) {
    if (time) {
      const h = (d - new Date()) / 3600000;
      if (h > 0 && h < 1) return 'en menos de 1 hora';
      if (h > 0) return `hoy en ${Math.round(h)} h`;
    }
    return 'hoy';
  }
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  if (diff > 0) return `en ${diff} días`;
  return `hace ${-diff} días`;
}

export function age(birth) {
  const b = parseDate(birth);
  if (!b) return null;
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

export const plural = (n, s, p) => `${n} ${n === 1 ? s : p ?? s + 's'}`;

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export function hue(str) {
  let h = 0;
  for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function fmtNum(n, d = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export function byDateAsc(a, b) {
  const da = (a.date || '9999') + (a.time || '');
  const db = (b.date || '9999') + (b.time || '');
  return da < db ? -1 : da > db ? 1 : (a.round || 0) - (b.round || 0);
}
export const byDateDesc = (a, b) => byDateAsc(b, a);

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
