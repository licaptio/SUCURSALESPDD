const firebaseConfig = {
  apiKey: "AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",
  authDomain: "inventariopv-643f1.firebaseapp.com",
  projectId: "inventariopv-643f1",
  storageBucket: "inventariopv-643f1.firebasestorage.app",
  messagingSenderId: "96242533231",
  appId: "1:96242533231:web:aae75a18fbaf9840529e9a"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth ? firebase.auth() : null;

const APP_VERSION = "1.0.2-catalogo-guiado-articulos";

const RUTAS = {
  CONFIG_DOC: db.collection("almacenes")
    .doc("almacen_cigarro")
    .collection("configuracion")
    .doc("catalogo_guiado"),

  SALIDAS_REF: db.collection("almacenes")
    .doc("almacen_cigarro")
    .collection("salidas1.0"),

  PRODUCTOS_REF: db.collection("productos")
};