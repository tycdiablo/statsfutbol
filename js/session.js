// Shared runtime state (auth + sync) filled in by app.js
export const session = {
  user: null,          // { uid, name, email, photo }
  cloudReady: false,   // Firebase loaded
  configured: false,   // firebase config present
  sync: 'local',       // local | pending | ok | error | offline
  lastSync: 0,
  installPrompt: null,
  signIn: async () => {},
  signOut: async () => {},
};
