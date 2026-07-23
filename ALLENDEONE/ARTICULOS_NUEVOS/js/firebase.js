import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { APP_CONFIG } from "./config.js";

const app = initializeApp(APP_CONFIG.firebase);
export const db = getFirestore(app);

export async function obtenerArticulosNuevos() {
  const referencia = collection(db, APP_CONFIG.coleccionProductos);
  const consulta = query(
    referencia,
    where("activo", "==", true),
    orderBy("creadoEn", "desc"),
    limit(APP_CONFIG.limiteProductos)
  );

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map(documento => ({
    id: documento.id,
    ...documento.data()
  }));
}

// Una sola lectura completa del catálogo remoto de fotografías.
export async function descargarCatalogoFotos() {
  const snapshot = await getDocs(collection(db, APP_CONFIG.coleccionFotos));
  return snapshot.docs.map(documento => ({
    id: documento.id,
    ...documento.data()
  }));
}
