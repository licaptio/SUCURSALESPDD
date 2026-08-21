import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",
  authDomain: "inventariopv-643f1.firebaseapp.com",
  projectId: "inventariopv-643f1",
  storageBucket: "inventariopv-643f1.firebasestorage.app",
  messagingSenderId: "96242533231",
  appId: "1:96242533231:web:aae75a18fbaf9840529e9a"
};

export const APP_CONFIG = Object.freeze({
  nombre: "RUTA VENTA 1",
  tiendaDocumento: "RUTA1",
  almacenId: "Almacen_Ruta_1",
  rutaIdVentas: "Almacen_Ruta_1",
  fechaBaseInventario: "2026-05-14",
  fechaInicioMinima: "2026-05-14",
  corteInventario: "2026-05-14 23:59:59",
  colecciones: Object.freeze({
    inventarios: ["TIENDAS", "RUTA1", "INVENTARIOS"],
    entradas: ["almacenes", "Almacen_Ruta_1", "entradas"],
    ventas: ["ventas_rutav2"],
    ajustes: ["TIENDAS", "RUTA1", "AJUSTE"],
    conteos: ["TIENDAS", "RUTA1", "CONTEO_DIARIO"]
  }),
  cache: Object.freeze({
    dbName: "PROVSOFT_RUTA_VENTA_1",
    version: 1,
    store: "cache_app",
    ttlHoras: 8
  })
});

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Telegram · CASO ACTUAL / @StarCamina_bot
export const TELEGRAM_BOT_TOKEN = "8434600852:AAGJ8HPMhJv8jjqINr2IZLFeycSF1uWSfiw";
export const TELEGRAM_CHAT_ID = "6617988297";
export const TELEGRAM_TOPIC_ID = "";
