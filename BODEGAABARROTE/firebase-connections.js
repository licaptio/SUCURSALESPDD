// PROVSOFT - conexiones Firebase
export const FIREBASE_PROFILES = {
  viejo: {
    label: "Firebase anterior",
    enabled: true,
    config: {
      apiKey: "AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",
      authDomain: "inventariopv-643f1.firebaseapp.com",
      projectId: "inventariopv-643f1",
      storageBucket: "inventariopv-643f1.firebasestorage.app",
      messagingSenderId: "96242533231",
      appId: "1:96242533231:web:aae75a18fbaf9840529e9a"
    }
  },
  nuevo: {
    label: "Firebase nuevo",
    enabled: true,
    config: {
      apiKey: "AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",
      authDomain: "inventariopv-643f1.firebaseapp.com",
      projectId: "inventariopv-643f1",
      storageBucket: "inventariopv-643f1.firebasestorage.app",
      messagingSenderId: "96242533231",
      appId: "1:96242533231:web:aae75a18fbaf9840529e9a"
    }
  }
};
export const ACTIVE_FIREBASE = "nuevo";
export function getActiveFirebaseConfig(){
  const p=FIREBASE_PROFILES[ACTIVE_FIREBASE];
  if(!p?.enabled) throw new Error("Perfil Firebase deshabilitado");
  return p.config;
}
