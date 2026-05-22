import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


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
export const supabaseUrl = "https://cvpbtjlupswbyxenugpz.supabase.co";
export const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2cGJ0amx1cHN3Ynl4ZW51Z3B6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3MDIxOTQsImV4cCI6MjA2MzI3ODE5NH0.iiJsYM3TtaGPdeCtPcEXwAz3LfFc1uJGECEvOErvrqY";

// ✅ Inicializar Firebase
const app = initializeApp(firebaseConfig);

// ✅ Exportar Firestore
export const db = getFirestore(app);