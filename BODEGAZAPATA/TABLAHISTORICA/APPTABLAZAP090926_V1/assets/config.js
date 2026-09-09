import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================
   CONFIGURACIÓN
   ========================= */

// 🔥 Firebase
export const firebaseConfig = {
  apiKey: "AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",
  authDomain: "inventariopv-643f1.firebaseapp.com",
  projectId: "inventariopv-643f1",
  storageBucket: "inventariopv-643f1.firebasestorage.app",
  messagingSenderId: "96242533231",
  appId: "1:96242533231:web:aae75a18fbaf9840529e9a"
};

// 🟢 Supabase
export const supabaseUrl =
  "https://cvpbtjlupswbyxenugpz.supabase.co";

export const supabaseAnonKey =
  "sb_publishable_SQ7Q5LFJqlxVzwNTxcIyzQ_8F1bqyiX";

// ============================================================
// AISLAMIENTO TOTAL DE ESTA APLICACIÓN
// ============================================================
// Nombre único de la app Firebase. Evita compartir la misma clave
// de persistencia con otras aplicaciones PROVSOFT del mismo proyecto.
export const APP_NAMESPACE = "PROVSOFT_INVENTARIO_ZAPATA_09092026";

// Inicializar Firebase con nombre EXCLUSIVO para esta aplicación.
const app = initializeApp(firebaseConfig, APP_NAMESPACE);

// Firestore con caché persistente propia en IndexedDB.
// Además, server.py usa un puerto exclusivo, por lo que el origen web
// también queda separado de las demás apps locales.
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
  console.info(`[${APP_NAMESPACE}] IndexedDB persistente habilitado.`);
} catch (error) {
  // Fallback seguro si el navegador bloquea IndexedDB (modo privado,
  // políticas del navegador, etc.). No comparte datos con otra app.
  console.warn(`[${APP_NAMESPACE}] No fue posible habilitar IndexedDB persistente. Se usará memoria.`, error);
  firestoreDb = getFirestore(app);
}

// ✅ Exportar Firestore aislado
export const db = firestoreDb;


// Exportaciones Firestore para módulos integrados de Entradas Zapata
export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc
};
