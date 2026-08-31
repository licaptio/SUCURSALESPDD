// CONFIGURACIÓN FIREBASE
// Pega aquí la configuración web del proyecto Firebase.
// El proyecto/bucket se dejan prellenados con lo que aparece en las URLs de fotos compartidas.
export const firebaseConfig = {
  apiKey: "AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",
  authDomain: "inventariopv-643f1.firebaseapp.com",
  projectId: "inventariopv-643f1",
  storageBucket: "inventariopv-643f1.firebasestorage.app",
  messagingSenderId: "96242533231",
  appId: "1:96242533231:web:aae75a18fbaf9840529e9a"
};

// Ajusta SOLO esta ruta si tu catálogo principal está en otra colección.
export const CATALOG = {
  productsCollection: "productos",
  photoMetaCollection: "productos_fotos_meta",
  sectionFlagField: "catalogoReposteria",
  activeField: "activo",
  subcategoryField: "reposteriaSubclasificacion"
};
