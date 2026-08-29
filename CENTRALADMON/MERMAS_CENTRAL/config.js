import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Sustituye estos datos por los de tu proyecto Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",
  authDomain: "inventariopv-643f1.firebaseapp.com",
  projectId: "inventariopv-643f1",
  storageBucket: "inventariopv-643f1.firebasestorage.app",
  messagingSenderId: "96242533231",
  appId: "1:96242533231:web:aae75a18fbaf9840529e9a"
};

// CONFIGURACIÓN DE TELEGRAM PARA GITHUB PAGES.
// ADVERTENCIA: estos valores serán visibles para quien inspeccione el sitio.
export const TELEGRAM_BOT_TOKEN = "8324500461:AAGv7B5Xd6w1sl2Z0_7VJA-Gm4oc7NwC4Ac";
export const TELEGRAM_CHAT_ID = "6617988297";

// Solo para grupos con temas. Déjalo vacío si no usas un tema específico.
export const TELEGRAM_TOPIC_ID = "";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
