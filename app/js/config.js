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
  apiKey: 'AIzaSyAFX_tj6_EJ0tWemM8VJpNGD7imhQ9M6pE',
  authDomain: 'statsfutbol-26ea7.firebaseapp.com',
  projectId: 'statsfutbol-26ea7',
  storageBucket: 'statsfutbol-26ea7.firebasestorage.app',
  messagingSenderId: '386282711783',
  appId: '1:386282711783:web:ed7bc7f9a00eb525f95042',
  measurementId: 'G-5CXZG47V14',
};
