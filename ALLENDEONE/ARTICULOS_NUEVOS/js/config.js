export const APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCK5nb6u2CGRJ8AB1aPlRn54b97bdeAFeM",
    authDomain: "inventariopv-643f1.firebaseapp.com",
    projectId: "inventariopv-643f1",
    storageBucket: "inventariopv-643f1.firebasestorage.app",
    messagingSenderId: "96242533231",
    appId: "1:96242533231:web:aae75a18fbaf9840529e9a"
  },

  // Colección donde están guardados los productos.
  coleccionProductos: "productos",

  // Colección donde están guardadas las fotografías.
  // Cada documento debe usar como ID el código del producto.
  coleccionFotos: "productos_fotos_meta",

  // Cantidad máxima de artículos nuevos a consultar.
  limiteProductos: 50,

  // Cantidad de artículos mostrados por página.
  productosPorPagina: 5,

  // Configuración de moneda.
  moneda: "MXN",
  locale: "es-MX"
};