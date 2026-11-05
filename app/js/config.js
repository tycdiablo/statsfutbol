// ─────────────────────────────────────────────────────────────
//  Login con Google + guardado en la nube (opcional)
//
//  1. Creá un proyecto gratis en https://console.firebase.google.com
//  2. Agregá una "App web" y copiá acá su configuración.
//  3. Authentication → Sign-in method → activá "Google".
//  4. Authentication → Settings → Authorized domains → agregá tu dominio
//     (por ejemplo tuusuario.github.io).
//  5. Firestore Database → crear base → pegá las reglas de firestore.rules.
//
//  Si dejás esto vacío, la app funciona igual "sin cuenta" y guarda todo
//  en el dispositivo.
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
