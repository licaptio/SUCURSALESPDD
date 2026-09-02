// PROVSOFT / SALIDA ABARROTES PDD - perfiles Firebase
// Este archivo es modificado por 00_CONFIGURAR_FIREBASE_NUEVO.bat.
// No elimina proyectos ni datos de Firebase.

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
    enabled: false,
    config: {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    }
  }
};

export const ACTIVE_FIREBASE = "viejo";

export function getActiveFirebaseConfig(){
  const profile=FIREBASE_PROFILES[ACTIVE_FIREBASE];
  if(!profile?.enabled) throw new Error(`El perfil Firebase ${ACTIVE_FIREBASE} esta deshabilitado.`);
  const c=profile.config||{};
  const required=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  const missing=required.filter(k=>!String(c[k]||'').trim());
  if(missing.length) throw new Error(`Configuracion Firebase incompleta (${ACTIVE_FIREBASE}): ${missing.join(', ')}`);
  return c;
}
