import { db } from "./config.js";
import { collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const REF_ENTRADAS = collection(db, "almacenes", "almacen_zapata", "entradas");
export const REF_SALIDAS = collection(db, "almacenes", "almacen_zapata", "salidas1.0");
export const REF_AJUSTES = collection(db, "almacenes", "almacen_zapata", "ajustes_inventario");
