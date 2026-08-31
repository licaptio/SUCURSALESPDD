import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
const firebaseConfig={apiKey:"AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",authDomain:"inventariopv-643f1.firebaseapp.com",projectId:"inventariopv-643f1",storageBucket:"inventariopv-643f1.firebasestorage.app",messagingSenderId:"96242533231",appId:"1:96242533231:web:aae75a18fbaf9840529e9a"};
export const firebaseApp=initializeApp(firebaseConfig);
export const db=getFirestore(firebaseApp);
export const storage=getStorage(firebaseApp);
