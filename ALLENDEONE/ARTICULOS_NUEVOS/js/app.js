import { APP_CONFIG } from "./config.js";
import { obtenerArticulosNuevos, descargarCatalogoFotos } from "./firebase.js";
import {
  guardarCatalogoFotos,
  leerCatalogoFotos,
  obtenerImagenCache,
  guardarImagenCache,
  contarImagenesCache
} from "./indexeddb.js";
import { obtenerCodigo } from "./formatos.js";
import { crearIndiceFotos, buscarMetaFoto, extraerPrimeraUrl } from "./relaciones.js";
import { mostrarError, renderizarPagina } from "./ui.js";

const estado = {
  productos: [],
  pagina: 0,
  fotosPorCodigo: new Map(),
  urlsObjeto: new Set(),
  catalogoFotos: []
};

const elementos = {
  aplicacion: document.querySelector("#aplicacion"),
  pantallaCarga: document.querySelector("#pantallaCarga"),
  mensajeCarga: document.querySelector("#mensajeCarga"),
  detalleCarga: document.querySelector("#detalleCarga"),
  progresoCarga: document.querySelector("#progresoCarga"),
  btnAnterior: document.querySelector("#btnAnterior"),
  btnSiguiente: document.querySelector("#btnSiguiente"),
  btnRecargar: document.querySelector("#btnRecargar"),
  estadoFotos: document.querySelector("#estadoFotos")
};

elementos.btnAnterior.addEventListener("click", () => cambiarPagina(-1));
elementos.btnSiguiente.addEventListener("click", () => cambiarPagina(1));
elementos.btnRecargar.addEventListener("click", () => cargarAplicacion(true));

document.addEventListener("keydown", evento => {
  if (evento.key === "ArrowLeft") cambiarPagina(-1);
  if (evento.key === "ArrowRight") cambiarPagina(1);
});

window.addEventListener("beforeunload", liberarUrlsObjeto);

async function cargarAplicacion(forzarActualizacion = false) {
  mostrarPantallaCarga("Cargando catálogo de productos…", "Consultando los artículos más recientes", 5);
  elementos.btnRecargar.disabled = true;

  try {
    estado.productos = await obtenerArticulosNuevos();
    estado.pagina = 0;
    estado.fotosPorCodigo.clear();
    liberarUrlsObjeto();

    if (!estado.productos.length) {
      throw new Error("No se encontraron productos con el campo creadoEn.");
    }

    actualizarCarga("Cargando catálogo de fotografías…", "Preparando los registros locales", 15);
    estado.catalogoFotos = await obtenerCatalogoFotos(forzarActualizacion);

    actualizarCarga("Cargando fotografías…", "Revisando y descargando imágenes para uso local", 25);
    await sincronizarImagenes(estado.catalogoFotos);

    actualizarCarga("Relacionando productos y fotografías…", "Aplicando códigos equivalentes y conceptos", 92);
    await relacionarFotos(estado.productos, estado.catalogoFotos);

    actualizarCarga("Preparando la aplicación…", "Todo está listo", 100);
    pintarPagina();

    await esperar(350);
    ocultarPantallaCarga();
  } catch (error) {
    console.error("Error al cargar la aplicación:", error);
    actualizarCarga("No fue posible iniciar la aplicación", error.message || "Revisa Firebase y vuelve a intentarlo", 100);
    mostrarError(error.message || "No fue posible cargar los productos o las fotografías.");
  } finally {
    elementos.btnRecargar.disabled = false;
  }
}

async function obtenerCatalogoFotos(forzar) {
  if (!forzar) {
    const local = await leerCatalogoFotos();
    if (local.length) {
      actualizarEstadoFotos(`Catálogo local: ${local.length} registros`);
      return local;
    }
  }

  const remoto = await descargarCatalogoFotos();
  await guardarCatalogoFotos(remoto);
  actualizarEstadoFotos(`Catálogo actualizado: ${remoto.length} registros`);
  return remoto;
}

async function sincronizarImagenes(catalogo) {
  const urls = [...new Set(catalogo.map(extraerPrimeraUrl).filter(Boolean))];
  const total = urls.length;
  let procesadas = 0;
  let guardadas = await contarImagenesCache();

  if (!total) {
    actualizarCarga("Cargando fotografías…", "No se encontraron URLs de imágenes", 85);
    return;
  }

  const cola = [...urls];
  const trabajadores = Array.from({ length: 6 }, async () => {
    while (cola.length) {
      const url = cola.shift();

      try {
        const existente = await obtenerImagenCache(url);
        if (!existente) {
          const respuesta = await fetch(url);
          if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
          await guardarImagenCache(url, await respuesta.blob());
          guardadas += 1;
        }
      } catch (error) {
        console.warn("No se pudo guardar una fotografía:", url, error);
      } finally {
        procesadas += 1;
        const porcentaje = 25 + Math.round((procesadas / total) * 65);
        actualizarCarga(
          "Cargando fotografías…",
          `${procesadas}/${total} revisadas · ${guardadas} guardadas localmente`,
          porcentaje
        );
      }
    }
  });

  await Promise.all(trabajadores);
  actualizarEstadoFotos(`Catálogo local listo: ${catalogo.length} registros · ${guardadas} fotos`);
}

async function relacionarFotos(productos, catalogo) {
  const indice = crearIndiceFotos(catalogo);
  let relacionadas = 0;

  for (const producto of productos) {
    const codigo = obtenerCodigo(producto);
    const resultado = buscarMetaFoto(producto, indice);

    if (!resultado) {
      estado.fotosPorCodigo.set(codigo, null);
      continue;
    }

    const url = extraerPrimeraUrl(resultado.meta);
    if (!url) {
      estado.fotosPorCodigo.set(codigo, null);
      continue;
    }

    estado.fotosPorCodigo.set(codigo, await obtenerUrlVisual(url));
    relacionadas += 1;
  }

  actualizarEstadoFotos(`${relacionadas}/${productos.length} artículos con fotografía`);
}

async function obtenerUrlVisual(url) {
  try {
    const blobLocal = await obtenerImagenCache(url);
    if (blobLocal) return crearUrlObjeto(blobLocal);
    return url;
  } catch {
    return url;
  }
}

function crearUrlObjeto(blob) {
  const urlObjeto = URL.createObjectURL(blob);
  estado.urlsObjeto.add(urlObjeto);
  return urlObjeto;
}

function liberarUrlsObjeto() {
  for (const url of estado.urlsObjeto) URL.revokeObjectURL(url);
  estado.urlsObjeto.clear();
}

function mostrarPantallaCarga(mensaje, detalle, progreso) {
  elementos.aplicacion.classList.add("oculto");
  elementos.pantallaCarga.classList.remove("oculto");
  elementos.pantallaCarga.setAttribute("aria-busy", "true");
  actualizarCarga(mensaje, detalle, progreso);
}

function actualizarCarga(mensaje, detalle, progreso) {
  elementos.mensajeCarga.textContent = mensaje;
  elementos.detalleCarga.textContent = detalle;
  elementos.progresoCarga.style.width = `${Math.max(0, Math.min(100, progreso))}%`;
}

function ocultarPantallaCarga() {
  elementos.pantallaCarga.setAttribute("aria-busy", "false");
  elementos.pantallaCarga.classList.add("oculto");
  elementos.aplicacion.classList.remove("oculto");
}

function actualizarEstadoFotos(texto) {
  elementos.estadoFotos.textContent = texto;
}

function cambiarPagina(direccion) {
  const nueva = estado.pagina + direccion;
  const total = calcularTotalPaginas();
  if (nueva < 0 || nueva >= total) return;
  estado.pagina = nueva;
  pintarPagina();
}

function pintarPagina() {
  const inicio = estado.pagina * APP_CONFIG.productosPorPagina;
  const productos = estado.productos.slice(inicio, inicio + APP_CONFIG.productosPorPagina);

  renderizarPagina({
    productos,
    pagina: estado.pagina,
    totalPaginas: calcularTotalPaginas(),
    fotosPorCodigo: estado.fotosPorCodigo
  });
}

function calcularTotalPaginas() {
  return Math.ceil(estado.productos.length / APP_CONFIG.productosPorPagina);
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

cargarAplicacion();
