import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

import { firebaseConfig, APP_CONFIG } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

export async function guardarIncidencia({ incidenciaId, proveedor, comentario, fotoBlob, fechaLocal, horaLocal }) {
  const [anio, mes] = fechaLocal.split("-");
  const storagePath = `${APP_CONFIG.storageRoot}/${anio}/${mes}/${incidenciaId}/incidencia.jpg`;
  const fotoRef = ref(storage, storagePath);

  await uploadBytes(fotoRef, fotoBlob, {
    contentType: fotoBlob.type || "image/jpeg",
    customMetadata: {
      incidenciaId,
      departamento: APP_CONFIG.departamento,
      proveedor
    }
  });

  const fotoUrl = await getDownloadURL(fotoRef);

  const incidenciaRef = doc(
    db,
    ...APP_CONFIG.firestoreCollectionPath,
    incidenciaId
  );

  const payload = {
    incidenciaId,
    folio: incidenciaId,
    departamento: APP_CONFIG.departamento,
    almacenId: APP_CONFIG.almacenId,
    proveedor: proveedor.trim(),
    comentario: comentario.trim(),
    fotoUrl,
    fotoPath: storagePath,
    estado: "PENDIENTE",
    fechaLocal,
    horaLocal,
    creadoEn: serverTimestamp()
  };

  await setDoc(incidenciaRef, payload);

  return { ...payload, fotoUrl };
}
