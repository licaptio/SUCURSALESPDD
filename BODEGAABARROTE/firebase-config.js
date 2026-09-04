import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { ACTIVE_FIREBASE, FIREBASE_PROFILES, getActiveFirebaseConfig } from "./firebase-connections.js?v=32";

export const firebaseConfig=getActiveFirebaseConfig();
export const firebaseApp=getApps().length?getApp():initializeApp(firebaseConfig);
export const db=getFirestore(firebaseApp);
export const storage=getStorage(firebaseApp);
export {ACTIVE_FIREBASE,FIREBASE_PROFILES};
