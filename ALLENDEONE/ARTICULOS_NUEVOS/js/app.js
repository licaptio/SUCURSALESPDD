import { APP_CONFIG } from "./config.js";
import { obtenerArticulosNuevos, descargarCatalogoFotos } from "./firebase.js";
import {
  guardarCatalogoFotos,
  leerCatalogoFotos,
  obtenerImagenCache,
  guardarImagenCache
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
  mostrarPantallaCarga("Cargando catálogo de productos…", "Consultando los 50 artículos más recientes", 8);
  elementos.btnRecargar.disabled = true;

  try {
    estado.productos = await obtenerArticulosNuevos();
    estado.pagina = 0;
    estado.fotosPorCodigo.clear();
    liberarUrlsObjeto();

    if (!estado.productos.length) {
      throw new Error("No se encontraron productos con el campo creadoEn.");
    }

    actualizarCarga("Cargando catálogo de fotografías…", "Revisando la metadata guardada localmente", 22);
    estado.catalogoFotos = await obtenerCatalogoFotos(forzarActualizacion);

    actualizarCarga("Relacionando fotografías…", "Buscando únicamente las fotos de estos 50 artículos", 38);
    const relaciones = prepararRelaciones(estado.productos, estado.catalogoFotos);

    actualizarCarga("Cargando fotografías…", "Descargando sólo las imágenes necesarias", 45);
    await cargarImagenesNecesarias(relaciones);

    actualizarCarga("Preparando la aplicación…", "Todo está listo", 100);
    pintarPagina();

    await esperar(250);
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
      actualizarEstadoFotos(`Metadata local: ${local.length} registros`);
      return local;
    }
  }

  const remoto = await descargarCatalogoFotos();
  await guardarCatalogoFotos(remoto);
  actualizarEstadoFotos(`Metadata actualizada: ${remoto.length} registros`);
  return remoto;
}

function prepararRelaciones(productos, catalogo) {
  const indice = crearIndiceFotos(catalogo);
  const relaciones = [];

  for (const producto of productos) {
    const codigo = obtenerCodigo(producto);
    const resultado = buscarMetaFoto(producto, indice);
    const url = resultado ? extraerPrimeraUrl(resultado.meta) : null;

    relaciones.push({
      producto,
      codigo,
      url,
      metodo: resultado?.metodo || null
    });
  }

  return relaciones;
}

async function cargarImagenesNecesarias(relaciones) {
  const urlsUnicas = [...new Set(relaciones.map(item => item.url).filter(Boolean))];
  const blobsPorUrl = new Map();
  const total = urlsUnicas.length;
  let procesadas = 0;
  let descargadas = 0;
  let desdeCache = 0;

  if (!total) {
    for (const relacion of relaciones) {
      estado.fotosPorCodigo.set(relacion.codigo, null);
    }
    actualizarEstadoFotos(`0/${relaciones.length} artículos con fotografía`);
    return;
  }

  const cola = [...urlsUnicas];
  const trabajadores = Array.from({ length: 5 }, async () => {
    while (cola.length) {
      const url = cola.shift();

      try {
        let blob = await obtenerImagenCache(url);

        if (blob) {
          desdeCache += 1;
        } else {
          const respuesta = await fetch(url);
          if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
          blob = await respuesta.blob();
          await guardarImagenCache(url, blob);
          descargadas += 1;
        }

        blobsPorUrl.set(url, blob);
      } catch (error) {
        console.warn("No se pudo cargar una fotografía:", url, error);
        blobsPorUrl.set(url, null);
      } finally {
        procesadas += 1;
        const porcentaje = 45 + Math.round((procesadas / total) * 50);
        actualizarCarga(
          "Cargando fotografías…",
          `${procesadas}/${total} revisadas · ${desdeCache} locales · ${descargadas} descargadas`,
          porcentaje
        );
      }
    }
  });

  await Promise.all(trabajadores);

  let relacionadas = 0;
  for (const relacion of relaciones) {
    if (!relacion.url) {
      estado.fotosPorCodigo.set(relacion.codigo, null);
      continue;
    }

    const blob = blobsPorUrl.get(relacion.url);
    if (blob) {
      estado.fotosPorCodigo.set(relacion.codigo, crearUrlObjeto(blob));
      relacionadas += 1;
    } else {
      // Si IndexedDB o la descarga fallaron, se intenta mostrar la URL remota.
      estado.fotosPorCodigo.set(relacion.codigo, relacion.url);
      relacionadas += 1;
    }
  }

  actualizarEstadoFotos(
    `${relacionadas}/${relaciones.length} artículos con fotografía · ${descargadas} nuevas descargas`
  );
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
