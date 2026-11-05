// Thin wrapper around Firebase (loaded on demand from the official CDN).
import { firebaseConfig } from './config.js';

const V = '10.12.2';
let fb = null;

export const isConfigured = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

export async function init() {
  if (!isConfigured()) return null;
  if (fb) return fb;
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  const [appM, authM, fsM] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  const db = fsM.getFirestore(app);
  fb = { app, auth, db, authM, fsM };
  authM.getRedirectResult(auth).catch((e) => console.warn('redirect', e));
  return fb;
}

export function onUser(cb) {
  fb.authM.onAuthStateChanged(fb.auth, cb);
}

export async function signInGoogle() {
  const { authM, auth } = fb;
  const provider = new authM.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await authM.signInWithPopup(auth, provider);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
      return authM.signInWithRedirect(auth, provider);
    }
    if (e.code === 'auth/popup-closed-by-user') return;
    throw e;
  }
}

export const signOut = () => fb.authM.signOut(fb.auth);

export async function pull(uid) {
  const { fsM, db } = fb;
  const snap = await fsM.getDocs(fsM.collection(db, 'users', uid, 'data'));
  const out = {};
  snap.forEach((d) => {
    try { out[d.id] = JSON.parse(d.data().json); } catch {}
  });
  return out;
}

export async function push(uid, parts) {
  const { fsM, db } = fb;
  const batch = fsM.writeBatch(db);
  const now = Date.now();
  for (const [k, v] of Object.entries(parts)) {
    batch.set(fsM.doc(db, 'users', uid, 'data', k), { json: JSON.stringify(v), updatedAt: now });
  }
  await batch.commit();
}
