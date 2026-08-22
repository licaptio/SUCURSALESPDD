import { db } from "./config.js";
import { iniciarModuloAjustesInventarioZapata } from "./ajustesModulo.js";
import { iniciarModuloEntradasZapata } from "./entradasModulo.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FECHA_BASE_INVENTARIO = "2026-08-01";
const FECHA_INICIO_MINIMA = "2026-08-01";
const SEMANA_MINIMA = "2026-W31";
const CONTEO_ID_INVENTARIO = "PUNTO_CERO_LIQUIDOS_010626";

const REF_SALIDAS_ZAPATA = collection(
  db,
  "almacenes",
  "Almacen_Dulces",
  "salidas"
);

const REF_ENTRADAS_ZAPATA = collection(
  db,
  "almacenes",
  "Almacen_Liquidos",
  "entradas"
);

// Transferencias provenientes de la app móvil de salidas de Zapata.
// Sólo se convierten en ENTRADA cuando cumplen la configuración TRASZAP.
const REF_SALIDAS_APP_ZAPATA = collection(
  db,
  "almacenes",
  "almacen_zapata",
  "salidas1.0"
);

const REF_CONFIG_TRASZAP = doc(
  db,
  "almacenes",
  "Almacen_Liquidos",
  "configuracion",
  "traszap"
);

const REF_AJUSTES_INVENTARIO_ZAPATA = collection(
  db,
  "almacenes",
  "Almacen_Dulces",
  "ajustes_inventario"
);

const REF_PROVEEDORES_AUTORIZADOS_ZAPATA = collection(
  db,
  "almacenes",
  "Almacen_Liquidos",
  "configuracion",
  "proveedores_autorizados",
  "items"
);

const REF_LISTAS_CONTEO = doc(
  db,
  "almacenes",
  "Almacen_Liquidos",
  "configuracion",
  "Listasconteo"
);

const REF_LISTAS_RESUMEN = doc(
  db,
  "almacenes",
  "Almacen_Liquidos",
  "configuracion",
  "Resumenlistas"
);

const REF_MENU_INICIO = doc(
  db,
  "almacenes",
  "Almacen_Liquidos",
  "configuracion",
  "codigoincial"
);

const REF_CODIGOS_BLOQUEADOS = doc(
  db,
  "almacenes",
  "Almacen_Liquidos",
  "configuracion",
  "codigosbloqueados"
);

const CACHE_CODIGOS_BLOQUEADOS = "provsoft_liquidos_codigos_bloqueados_v1";
const CACHE_DESCRIPCIONES_BLOQUEADOS = "provsoft_liquidos_desc_bloqueados_v1";
const CACHE_DESCRIPCION_MS = 30 * 24 * 60 * 60 * 1000;

const REF_USUARIOS_INVENTARIO = collection(
  db,
  "almacenes",
  "Almacen_Dulces",
  "Inventarios",
  CONTEO_ID_INVENTARIO,
  "USUARIOS"
);

const $ = (id) => document.getElementById(id);

let registrosDetalleSemana = [];
let registrosDetalleAcumuladoAnterior = [];

let registrosEntradasSemana = [];
let registrosEntradasAcumuladoAnterior = [];

let registrosAjustesSemana = [];
let registrosAjustesAcumuladoAnterior = [];

let registrosDetalleMovimientoSemana = [];
let registrosPivot = [];
let fechasColumnas = [];

let inventarioInicialOriginal = {};
let proveedoresAutorizadosPivot = {};
let configuracionTraszap = null;
let vistaActual = "resumen";
let listadosResumenProveedor = [];
let listadoConfigActual = null;
let articulosConfigActual = [];

let listasResumen = [];
let listaResumenActualId = "";
let listaResumenEditandoId = "";
let articulosListaResumenEditando = [];

let articulosMenuInicio = [];
let articulosMenuInicioEditando = [];
let indiceRevisionMenuInicio = 0;
let revisionMenuInicioActiva = false;
let cargaInicialEnProceso = true;

let codigosBloqueadosAdmin = [];
let descripcionesBloqueadosCache = {};
let unsubscribeCodigosBloqueados = null;
let consultaDescripcionEnCurso = new Map();

let rangoSemanaActual = {
  inicio: FECHA_BASE_INVENTARIO,
  fin: FECHA_BASE_INVENTARIO,
  acumuladoAnteriorFin: ""
};

// Cache únicamente en memoria. No se persiste ningún resultado calculado.
// Al recargar la página parte otra vez de Firestore.
let cacheMovimientos = {
  salidas: [],
  entradas: [],
  traszap: [],
  ajustes: [],
  cargadoHasta: "",
  inicializado: false
};

function leerCacheCodigosBloqueados() {
  try {
    const codigos = JSON.parse(localStorage.getItem(CACHE_CODIGOS_BLOQUEADOS) || "[]");
    codigosBloqueadosAdmin = Array.isArray(codigos)
      ? [...new Set(codigos.map(v => String(v || "").trim()).filter(Boolean))]
      : [];
  } catch {
    codigosBloqueadosAdmin = [];
  }

  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_DESCRIPCIONES_BLOQUEADOS) || "{}");
    descripcionesBloqueadosCache = cache && typeof cache === "object" ? cache : {};
  } catch {
    descripcionesBloqueadosCache = {};
  }
}

function guardarCacheCodigosBloqueados() {
  try {
    localStorage.setItem(CACHE_CODIGOS_BLOQUEADOS, JSON.stringify(codigosBloqueadosAdmin));
    localStorage.setItem(CACHE_DESCRIPCIONES_BLOQUEADOS, JSON.stringify(descripcionesBloqueadosCache));
  } catch (error) {
    console.warn("No se pudo guardar cache local de códigos bloqueados:", error);
  }
}

function descripcionBloqueadoCacheValida(codigo) {
  const item = descripcionesBloqueadosCache[codigo];
  if (!item || !String(item.concepto || "").trim()) return false;
  return (Date.now() - Number(item.ts || 0)) < CACHE_DESCRIPCION_MS;
}

async function obtenerDescripcionProductoBloqueado(codigo, forzar = false) {
  codigo = String(codigo || "").trim();
  if (!codigo) return "";

  if (!forzar && descripcionBloqueadoCacheValida(codigo)) {
    return String(descripcionesBloqueadosCache[codigo].concepto || "").trim();
  }

  if (consultaDescripcionEnCurso.has(codigo)) return consultaDescripcionEnCurso.get(codigo);

  const promesa = (async () => {
    try {
      // Lectura económica: sólo se consulta /productos/{codigo} para códigos bloqueados
      // nuevos o cuyo nombre lleve más de 30 días en cache. Nunca se descarga /productos completo.
      const snap = await getDoc(doc(db, "productos", codigo));
      const concepto = snap.exists()
        ? String(snap.data()?.concepto || snap.data()?.descripcion || "").trim()
        : "";
      descripcionesBloqueadosCache[codigo] = {
        concepto: concepto || "PRODUCTO NO ENCONTRADO",
        ts: Date.now(),
        existe: snap.exists()
      };
      guardarCacheCodigosBloqueados();
      return concepto;
    } catch (error) {
      console.error(`No se pudo consultar /productos/${codigo}:`, error);
      return String(descripcionesBloqueadosCache[codigo]?.concepto || "").trim();
    } finally {
      consultaDescripcionEnCurso.delete(codigo);
    }
  })();

  consultaDescripcionEnCurso.set(codigo, promesa);
  return promesa;
}

async function completarDescripcionesBloqueados(codigos = codigosBloqueadosAdmin) {
  const pendientes = codigos.filter(c => !descripcionBloqueadoCacheValida(c));
  if (!pendientes.length) return;
  await Promise.allSettled(pendientes.map(c => obtenerDescripcionProductoBloqueado(c)));
  pintarCodigosBloqueadosAdmin();
}

function pintarCodigosBloqueadosAdmin() {
  const cont = $("listaCodigosBloqueados");
  const contador = $("contadorCodigosBloqueados");
  if (contador) contador.textContent = `${codigosBloqueadosAdmin.length} código${codigosBloqueadosAdmin.length === 1 ? "" : "s"} bloqueado${codigosBloqueadosAdmin.length === 1 ? "" : "s"}`;
  if (!cont) return;

  if (!codigosBloqueadosAdmin.length) {
    cont.innerHTML = `<div class="cb-vacio">No hay códigos bloqueados.</div>`;
    return;
  }

  cont.innerHTML = codigosBloqueadosAdmin.map(codigo => {
    const info = descripcionesBloqueadosCache[codigo] || {};
    const concepto = String(info.concepto || "Consultando descripción...");
    return `<div class="cb-item">
      <div class="cb-identidad">
        <strong>${escapeHtml(codigo)}</strong>
        <span>${escapeHtml(concepto)}</span>
      </div>
      <div class="cb-acciones">
        <button type="button" class="cb-editar" data-cb-editar="${escapeHtml(codigo)}">Editar</button>
        <button type="button" class="cb-eliminar" data-cb-eliminar="${escapeHtml(codigo)}">Eliminar</button>
      </div>
    </div>`;
  }).join("");

  cont.querySelectorAll("[data-cb-editar]").forEach(btn => btn.addEventListener("click", () => editarCodigoBloqueado(btn.dataset.cbEditar)));
  cont.querySelectorAll("[data-cb-eliminar]").forEach(btn => btn.addEventListener("click", () => eliminarCodigoBloqueado(btn.dataset.cbEliminar)));
}

function abrirCodigosBloqueadosAdmin() {
  cerrarMenuMas();
  pintarCodigosBloqueadosAdmin();
  const input = $("nuevoCodigoBloqueado");
  if (input) input.value = "";
  $("estadoCodigoBloqueado") && ($("estadoCodigoBloqueado").textContent = "");
  $("modalCodigosBloqueados")?.classList.remove("oculto");
  completarDescripcionesBloqueados();
  setTimeout(() => input?.focus(), 50);
}

function cerrarCodigosBloqueadosAdmin() {
  $("modalCodigosBloqueados")?.classList.add("oculto");
}

async function validarProductoParaBloqueo(codigo) {
  codigo = String(codigo || "").trim();
  if (!codigo) throw new Error("Escribe un código.");
  const concepto = await obtenerDescripcionProductoBloqueado(codigo, true);
  const info = descripcionesBloqueadosCache[codigo] || {};
  if (info.existe === false || !concepto) {
    throw new Error(`No existe /productos/${codigo} o no tiene concepto.`);
  }
  return concepto;
}

async function reemplazarListaBloqueados(mutador) {
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(REF_CODIGOS_BLOQUEADOS);
    const actuales = snap.exists() && Array.isArray(snap.data()?.codigos)
      ? snap.data().codigos.map(v => String(v || "").trim()).filter(Boolean)
      : [];
    const nuevos = [...new Set(mutador(actuales).map(v => String(v || "").trim()).filter(Boolean))];
    transaction.set(REF_CODIGOS_BLOQUEADOS, { codigos: nuevos }, { merge: true });
  });
}

async function agregarCodigoBloqueado() {
  const input = $("nuevoCodigoBloqueado");
  const estado = $("estadoCodigoBloqueado");
  const codigo = String(input?.value || "").trim();
  if (!codigo) return;

  try {
    if (estado) estado.textContent = "Validando producto...";
    const concepto = await validarProductoParaBloqueo(codigo);
    if (codigosBloqueadosAdmin.includes(codigo)) throw new Error("Ese código ya está bloqueado.");
    await reemplazarListaBloqueados(actuales => [...actuales, codigo]);
    if (input) input.value = "";
    if (estado) estado.textContent = `Agregado: ${codigo} · ${concepto}`;
  } catch (error) {
    if (estado) estado.textContent = `Error: ${error?.message || error}`;
  }
}

async function eliminarCodigoBloqueado(codigo) {
  const concepto = String(descripcionesBloqueadosCache[codigo]?.concepto || "").trim();
  if (!confirm(`¿Eliminar el bloqueo de ${codigo}${concepto ? ` · ${concepto}` : ""}?`)) return;
  try {
    await reemplazarListaBloqueados(actuales => actuales.filter(c => c !== codigo));
  } catch (error) {
    alert(`No se pudo eliminar: ${error?.message || error}`);
  }
}

async function editarCodigoBloqueado(codigoActual) {
  const nuevo = prompt("Nuevo código de producto:", codigoActual);
  if (nuevo === null) return;
  const codigoNuevo = String(nuevo || "").trim();
  if (!codigoNuevo || codigoNuevo === codigoActual) return;

  try {
    const concepto = await validarProductoParaBloqueo(codigoNuevo);
    if (codigosBloqueadosAdmin.includes(codigoNuevo)) throw new Error("El nuevo código ya está bloqueado.");
    await reemplazarListaBloqueados(actuales => actuales.map(c => c === codigoActual ? codigoNuevo : c));
    delete descripcionesBloqueadosCache[codigoActual];
    guardarCacheCodigosBloqueados();
    const estado = $("estadoCodigoBloqueado");
    if (estado) estado.textContent = `Modificado: ${codigoNuevo} · ${concepto}`;
  } catch (error) {
    alert(`No se pudo modificar: ${error?.message || error}`);
  }
}

function iniciarEscuchaCodigosBloqueados() {
  leerCacheCodigosBloqueados();
  pintarCodigosBloqueadosAdmin();

  if (unsubscribeCodigosBloqueados) return;
  // Un único listener para un único documento. Firestore entrega el estado inicial y
  // después únicamente vuelve a leer cuando ese documento cambia.
  unsubscribeCodigosBloqueados = onSnapshot(
    REF_CODIGOS_BLOQUEADOS,
    snap => {
      const data = snap.exists() ? (snap.data() || {}) : {};
      codigosBloqueadosAdmin = Array.isArray(data.codigos)
        ? [...new Set(data.codigos.map(v => String(v || "").trim()).filter(Boolean))]
        : [];
      guardarCacheCodigosBloqueados();
      pintarCodigosBloqueadosAdmin();
      completarDescripcionesBloqueados(codigosBloqueadosAdmin);
    },
    error => console.error("Listener de códigos bloqueados:", error)
  );
}

function hoyISO() {
  return fechaISOLocal(new Date());
}

function fechaISOLocal(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function crearFechaLocal(fechaISO) {
  const [yyyy, mm, dd] = String(fechaISO).split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function sumarDias(fechaISO, dias) {
  const d = crearFechaLocal(fechaISO);
  d.setDate(d.getDate() + dias);
  return fechaISOLocal(d);
}

function normalizarFecha(valor) {
  if (!valor) return "";

  if (typeof valor === "string") {
    const v = valor.trim();

    const m1 = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m1) {
      const [, dd, mm, yyyy] = m1;
      return `${yyyy}-${mm}-${dd}`;
    }

    const m2 = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) {
      return `${m2[1]}-${m2[2]}-${m2[3]}`;
    }

    return v.substring(0, 10);
  }

  if (valor && typeof valor.toDate === "function") {
    return fechaISOLocal(valor.toDate());
  }

  if (valor && typeof valor.seconds === "number") {
    return fechaISOLocal(new Date(valor.seconds * 1000));
  }

  return String(valor).trim();
}

function fechaCorta(fechaISO) {
  if (!fechaISO || !fechaISO.includes("-")) return fechaISO || "";
  const [yyyy, mm, dd] = fechaISO.split("-");
  return `${dd}/${mm}/${String(yyyy).slice(-2)}`;
}

function normalizarCodigo(valor) {
  const s = String(valor ?? "").trim();
  if (!s) return "";

  const soloDigitos = s.replace(/\D/g, "");
  if (!soloDigitos) return s.toLowerCase();

  return soloDigitos.replace(/^0+/, "") || "0";
}

function normalizarListaArticulos(data = {}) {
  const convertirMapaNumerico = (valor) => {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;

    const clavesNumericas = Object.keys(valor).filter(k => /^\d+$/.test(k));
    if (!clavesNumericas.length) return null;

    return clavesNumericas
      .sort((a, b) => Number(a) - Number(b))
      .map(k => valor[k])
      .filter(v => v && typeof v === "object");
  };

  // Formato normal: articulos: [...] / productos: [...] / detalle: [...] / items: [...]
  const candidatos = [data.articulos, data.productos, data.detalle, data.items];

  for (const valor of candidatos) {
    if (Array.isArray(valor)) return valor;

    const desdeMapa = convertirMapaNumerico(valor);
    if (desdeMapa?.length) return desdeMapa;
  }

  // Formato detectado en algunas entradas autorizadas:
  // las partidas quedaron directamente en la raíz del documento:
  // { 0:{...}, 1:{...}, ... 16:{...}, fecha:"...", estado:"AUTORIZADA", ... }
  const desdeRaiz = convertirMapaNumerico(data);
  if (desdeRaiz?.length) return desdeRaiz;

  return [];
}

// Repara nombres heredados con la Ñ dañada por codificación.
// No modifica Firestore: sólo corrige la presentación y la exportación.
function repararTexto(text) {
  return String(text ?? "")
    .replace(/Ã‘/g, "Ñ")
    .replace(/Ã±/g, "ñ")
    .replace(/([A-ZÁÉÍÓÚÜ])�([A-ZÁÉÍÓÚÜ])/g, "$1Ñ$2")
    .replace(/([a-záéíóúü])�([a-záéíóúü])/g, "$1ñ$2");
}

function escapeHtml(text) {
  return repararTexto(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtCelda(n) {
  const num = Number(n || 0);
  if (!num) return "";
  return num.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function setStatus(msg) {
  const status = $("status");
  if (status) status.textContent = msg;

  const loaderMsg = $("loaderMsg");
  if (loaderMsg) loaderMsg.textContent = msg;
}

function setProgress(porcentaje) {
  const bar = $("loaderBar");
  if (bar) bar.style.width = Math.max(0, Math.min(100, porcentaje)) + "%";
}

function ocultarLoader(forzar = false) {
  if (cargaInicialEnProceso && !forzar) return;
  const loader = $("loader");
  if (loader) loader.classList.add("hide");
}

function obtenerSemanaActualInput() {
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const dia = fecha.getDay();
  const jueves = new Date(fecha);
  jueves.setDate(fecha.getDate() + (4 - (dia || 7)));

  const inicioAnio = new Date(jueves.getFullYear(), 0, 1);
  const semana = Math.ceil((((jueves - inicioAnio) / 86400000) + 1) / 7);

  return `${jueves.getFullYear()}-W${String(semana).padStart(2, "0")}`;
}

function obtenerRangoDomingoSabadoDesdeWeek(valorWeek) {
  if (!valorWeek) {
    return {
      inicio: FECHA_BASE_INVENTARIO,
      fin: sumarDias(FECHA_BASE_INVENTARIO, 6)
    };
  }

  const [anioTexto, semanaTexto] = valorWeek.split("-W");
  const anio = Number(anioTexto);
  const semana = Number(semanaTexto);

  const enero4 = new Date(anio, 0, 4);
  const diaSemana = enero4.getDay() || 7;

  const lunesSemana1 = new Date(enero4);
  lunesSemana1.setDate(enero4.getDate() - diaSemana + 1);

  const lunes = new Date(lunesSemana1);
  lunes.setDate(lunesSemana1.getDate() + (semana - 1) * 7);

  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() - 1);

  const sabado = new Date(domingo);
  sabado.setDate(domingo.getDate() + 6);

  let inicio = fechaISOLocal(domingo);
  let fin = fechaISOLocal(sabado);

  if (inicio < FECHA_INICIO_MINIMA) inicio = FECHA_INICIO_MINIMA;
  if (fin < inicio) fin = inicio;

  return { inicio, fin };
}

function obtenerRangoSemana() {
  const selectorSemana = $("selectorSemana");
  let valorWeek = selectorSemana?.value || obtenerSemanaActualInput();

  if (valorWeek < SEMANA_MINIMA) {
    valorWeek = SEMANA_MINIMA;
    if (selectorSemana) selectorSemana.value = SEMANA_MINIMA;
  }

  if (selectorSemana && !selectorSemana.value) {
    selectorSemana.value = valorWeek;
  }

  const rango = obtenerRangoDomingoSabadoDesdeWeek(valorWeek);
  const acumuladoAnteriorFin = sumarDias(rango.inicio, -1);

  rangoSemanaActual = {
    inicio: rango.inicio,
    fin: rango.fin,
    acumuladoAnteriorFin
  };

  if ($("fechaInicio")) $("fechaInicio").value = rango.inicio;
  if ($("fechaFin")) $("fechaFin").value = rango.fin;

  return rangoSemanaActual;
}

function crearFechasSemana(inicio, fin) {
  const fechas = [];
  let actual = inicio;

  while (actual <= fin) {
    fechas.push(actual);
    actual = sumarDias(actual, 1);
  }

  return fechas;
}



function normalizarArticuloMenuInicio(row) {
  return {
    codigo: String(row?.codigo || "").trim(),
    codigoKey: normalizarCodigo(row?.codigoKey || row?.codigo || ""),
    nombre: String(row?.nombre || "").trim(),
    piezasPorCaja: Math.max(0, Number(row?.piezasPorCaja || 0))
  };
}

async function cargarMenuInicioConfig() {
  articulosMenuInicio = [];
  try {
    const snap = await getDoc(REF_MENU_INICIO);
    if (snap.exists()) {
      const data = snap.data() || {};
      articulosMenuInicio = (Array.isArray(data.articulos) ? data.articulos : [])
        .map(normalizarArticuloMenuInicio)
        .filter(a => a.codigoKey || a.nombre);
    }
  } catch (error) {
    console.error("Error al cargar MENUINICIO:", error);
  }
}

function articuloMenuInicioSeleccionado(codigoKey) {
  const key = normalizarCodigo(codigoKey);
  return articulosMenuInicioEditando.some(a => normalizarCodigo(a.codigoKey || a.codigo) === key);
}

function pintarResultadosMenuInicio() {
  const cont = $("resultadosMenuInicio");
  if (!cont) return;
  const q = String($("buscarArticuloMenuInicio")?.value || "").trim().toLowerCase();
  const rows = registrosPivot
    .filter(r => !q || [r.codigo, r.codigoKey, r.nombre].some(v => String(v || "").toLowerCase().includes(q)))
    .slice(0, 250);

  if (!rows.length) {
    cont.innerHTML = `<div class="menuinicio-vacio">No se encontraron artículos.</div>`;
    return;
  }

  cont.innerHTML = rows.map(r => {
    const key = normalizarCodigo(r.codigoKey || r.codigo);
    const marcado = articuloMenuInicioSeleccionado(key);
    return `<button type="button" class="menuinicio-item-disponible ${marcado ? 'seleccionado' : ''}" data-menuinicio-agregar="${escapeHtml(key)}" ${marcado ? 'disabled' : ''}>
      <strong>${escapeHtml(r.codigo || key)}</strong><span>${escapeHtml(r.nombre || '')}</span><em>${marcado ? 'Agregado' : '+ Agregar'}</em>
    </button>`;
  }).join("");

  cont.querySelectorAll("[data-menuinicio-agregar]").forEach(btn => btn.addEventListener("click", () => {
    const key = normalizarCodigo(btn.dataset.menuinicioAgregar || "");
    const row = registrosPivot.find(r => normalizarCodigo(r.codigoKey || r.codigo) === key);
    if (!row || articuloMenuInicioSeleccionado(key)) return;
    articulosMenuInicioEditando.push(normalizarArticuloMenuInicio(row));
    pintarSeleccionMenuInicio();
    pintarResultadosMenuInicio();
  }));
}

function moverArticuloMenuInicio(indice, delta) {
  const destino = indice + delta;
  if (indice < 0 || destino < 0 || destino >= articulosMenuInicioEditando.length) return;
  const [art] = articulosMenuInicioEditando.splice(indice, 1);
  articulosMenuInicioEditando.splice(destino, 0, art);
  pintarSeleccionMenuInicio();
}

function pintarSeleccionMenuInicio() {
  const cont = $("seleccionMenuInicio");
  if ($("contadorMenuInicio")) $("contadorMenuInicio").textContent = `${articulosMenuInicioEditando.length} artículos seleccionados`;
  if (!cont) return;
  if (!articulosMenuInicioEditando.length) {
    cont.innerHTML = `<div class="menuinicio-vacio">Todavía no hay artículos seleccionados.</div>`;
    return;
  }
  cont.innerHTML = articulosMenuInicioEditando.map((a, idx) => `<div class="menuinicio-item-seleccionado">
    <div><strong>${escapeHtml(a.codigo || a.codigoKey)}</strong><span>${escapeHtml(a.nombre || '')}</span></div>
    <label class="menuinicio-caja-config">Pzas/caja<input type="number" min="0" step="1" inputmode="numeric" value="${Number(a.piezasPorCaja || 0) || ''}" placeholder="Ej. 24" data-mi-caja="${idx}"></label>
    <div class="menuinicio-orden">
      <button type="button" data-mi-up="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" data-mi-down="${idx}" ${idx === articulosMenuInicioEditando.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="peligro" data-mi-remove="${idx}">×</button>
    </div>
  </div>`).join("");
  cont.querySelectorAll("[data-mi-caja]").forEach(inp => inp.addEventListener("input", () => {
    const i = Number(inp.dataset.miCaja);
    if (articulosMenuInicioEditando[i]) articulosMenuInicioEditando[i].piezasPorCaja = Math.max(0, Number(inp.value || 0));
  }));
  cont.querySelectorAll("[data-mi-up]").forEach(b => b.addEventListener("click", () => moverArticuloMenuInicio(Number(b.dataset.miUp), -1)));
  cont.querySelectorAll("[data-mi-down]").forEach(b => b.addEventListener("click", () => moverArticuloMenuInicio(Number(b.dataset.miDown), 1)));
  cont.querySelectorAll("[data-mi-remove]").forEach(b => b.addEventListener("click", () => {
    articulosMenuInicioEditando.splice(Number(b.dataset.miRemove), 1);
    pintarSeleccionMenuInicio();
    pintarResultadosMenuInicio();
  }));
}

function abrirConfigMenuInicio() {
  articulosMenuInicioEditando = articulosMenuInicio.map(normalizarArticuloMenuInicio);
  if ($("buscarArticuloMenuInicio")) $("buscarArticuloMenuInicio").value = "";
  pintarResultadosMenuInicio();
  pintarSeleccionMenuInicio();
  $("modalConfigMenuInicio")?.classList.remove("oculto");
}

function cerrarConfigMenuInicio() {
  $("modalConfigMenuInicio")?.classList.add("oculto");
}

async function guardarMenuInicio() {
  articulosMenuInicio = articulosMenuInicioEditando.map(normalizarArticuloMenuInicio);
  await setDoc(REF_MENU_INICIO, {
    activo: true,
    articulos: articulosMenuInicio,
    actualizadoEn: new Date().toISOString()
  }, { merge: true });
  cerrarConfigMenuInicio();
  setStatus(`MENUINICIO guardado: ${articulosMenuInicio.length} artículos para revisión de arranque.`);
}

function obtenerRowMenuInicio(articulo) {
  const key = normalizarCodigo(articulo?.codigoKey || articulo?.codigo);
  return registrosPivot.find(r => normalizarCodigo(r.codigoKey || r.codigo) === key) || {
    ...normalizarArticuloMenuInicio(articulo),
    inviniSemana: 0,
    totalEntradasSemana: 0,
    totalSalidasSemana: 0,
    totalAjustesSemana: 0,
    existenciaFinalSemana: 0,
    movimientosSemana: []
  };
}

function pintarRevisionMenuInicio() {
  if (!revisionMenuInicioActiva || !articulosMenuInicio.length) return;
  const art = articulosMenuInicio[indiceRevisionMenuInicio];
  const row = obtenerRowMenuInicio(art);
  const total = articulosMenuInicio.length;
  const ultimo = indiceRevisionMenuInicio >= total - 1;
  const existencia = Number(row.existenciaFinalSemana || 0);
  const piezasPorCaja = Math.max(0, Number(art.piezasPorCaja || 0));
  const absExistencia = Math.abs(existencia);
  const cajasCompletas = piezasPorCaja > 0 ? Math.floor(absExistencia / piezasPorCaja) : 0;
  const piezasSueltas = piezasPorCaja > 0 ? absExistencia - (cajasCompletas * piezasPorCaja) : absExistencia;
  const cajasEquivalentes = piezasPorCaja > 0 ? existencia / piezasPorCaja : null;
  const signo = existencia < 0 ? '-' : '';

  if ($("menuInicioProgreso")) $("menuInicioProgreso").textContent = `Artículo ${indiceRevisionMenuInicio + 1} de ${total}`;
  if ($("menuInicioCodigoArticulo")) $("menuInicioCodigoArticulo").textContent = row.codigo || row.codigoKey || "SIN CÓDIGO";
  if ($("menuInicioNombreArticulo")) $("menuInicioNombreArticulo").textContent = repararTexto(row.nombre || art.nombre || "Artículo sin descripción");
  if ($("menuInicioSemanaArticulo")) $("menuInicioSemanaArticulo").textContent = `Existencia calculada al día · ${fechaCorta(new Date().toISOString().slice(0,10))}`;
  if ($("menuInicioKpis")) $("menuInicioKpis").innerHTML = `
    <div class="menuinicio-existencia-principal"><span>EXISTENCIA AL DÍA</span><strong>${fmtNum(existencia)}</strong><small>piezas</small></div>
    ${piezasPorCaja > 0 ? `
      <div><span>Piezas por caja</span><strong>${fmtNum(piezasPorCaja)}</strong></div>
      <div><span>Cajas completas</span><strong>${signo}${fmtNum(cajasCompletas)}</strong></div>
      <div><span>Piezas sueltas</span><strong>${signo}${fmtNum(piezasSueltas)}</strong></div>
      <div><span>Cajas equivalentes</span><strong>${fmtNum(cajasEquivalentes)}</strong></div>` : `
      <div class="menuinicio-sin-caja"><span>Presentación</span><strong>Sin piezas por caja configuradas</strong></div>`}`;
  if ($("btnSiguienteRevisionMenuInicio")) $("btnSiguienteRevisionMenuInicio").textContent = ultimo ? "Aceptar y entrar a la tabla" : "Aceptar y siguiente";
}

function iniciarRevisionMenuInicio() {
  if (!articulosMenuInicio.length) return false;
  indiceRevisionMenuInicio = 0;
  revisionMenuInicioActiva = true;
  pintarRevisionMenuInicio();
  $("modalRevisionMenuInicio")?.classList.remove("oculto");
  return true;
}

function terminarRevisionMenuInicio() {
  revisionMenuInicioActiva = false;
  $("modalRevisionMenuInicio")?.classList.add("oculto");
  actualizarScrollHorizontalPivot();
}

function siguienteRevisionMenuInicio() {
  if (!revisionMenuInicioActiva) return;
  if (indiceRevisionMenuInicio >= articulosMenuInicio.length - 1) {
    terminarRevisionMenuInicio();
    return;
  }
  indiceRevisionMenuInicio += 1;
  pintarRevisionMenuInicio();
}

function crearIdListaResumen(nombre) {
  const base = String(nombre || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
  return base || `RESUMEN_${Date.now()}`;
}

function normalizarArticuloResumen(row) {
  return {
    codigo: String(row?.codigo || "").trim(),
    codigoKey: normalizarCodigo(row?.codigoKey || row?.codigo || ""),
    nombre: String(row?.nombre || "").trim()
  };
}

async function cargarListasResumen() {
  listasResumen = [];
  try {
    const snap = await getDoc(REF_LISTAS_RESUMEN);
    if (snap.exists()) {
      const data = snap.data() || {};
      const listas = Array.isArray(data.listas) ? data.listas : [];
      listasResumen = listas
        .filter(l => l && l.activo !== false)
        .map(l => ({
          id: String(l.id || crearIdListaResumen(l.nombre || "LISTA")),
          nombre: String(l.nombre || "LISTA SIN NOMBRE").trim(),
          activo: l.activo !== false,
          creadoEn: l.creadoEn || "",
          actualizadoEn: l.actualizadoEn || "",
          articulos: (Array.isArray(l.articulos) ? l.articulos : []).map(normalizarArticuloResumen)
        }));
    }
    listasResumen.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  } catch (error) {
    console.error("Error al cargar Listas de Resumen:", error);
    alert(`No se pudieron cargar las Listas de Resumen: ${error?.message || error}`);
  }
  pintarTarjetasListasResumen();
}

async function guardarDocumentoListasResumen() {
  await setDoc(REF_LISTAS_RESUMEN, {
    listas: listasResumen,
    actualizadoEn: new Date().toISOString()
  }, { merge: true });
}

function obtenerListaResumenPorId(id) {
  return listasResumen.find(l => l.id === id) || null;
}

function cambiarSubvistaResumenListas(vista) {
  $("vistaMenuResumenListas")?.classList.toggle("oculto", vista !== "menu");
  $("vistaVerListaResumen")?.classList.toggle("oculto", vista !== "ver");
  $("vistaConfigListaResumen")?.classList.toggle("oculto", vista !== "config");
  if (vista !== "ver") $("detalleMovimientosListaResumen")?.classList.add("oculto");
}

function pintarTarjetasListasResumen() {
  const cont = $("tarjetasListasResumen");
  if (!cont) return;
  if (!listasResumen.length) {
    cont.innerHTML = `<div class="resumen-listas-vacio">No hay listas creadas. Usa <b>+ Nueva lista</b> para crear la primera.</div>`;
    return;
  }
  cont.innerHTML = listasResumen.map(lista => `
    <article class="tarjeta-lista-resumen" data-abrir-lista-resumen="${escapeHtml(lista.id)}">
      <div>
        <span class="tarjeta-lista-kicker">LISTA DE RESUMEN</span>
        <h3>${escapeHtml(lista.nombre)}</h3>
        <p>${lista.articulos.length} artículos configurados</p>
      </div>
      <div class="tarjeta-lista-actions">
        <button type="button" data-editar-lista-resumen="${escapeHtml(lista.id)}">Editar</button>
        <button type="button" class="principal" data-ver-lista-resumen="${escapeHtml(lista.id)}">Abrir</button>
      </div>
    </article>
  `).join("");

  cont.querySelectorAll("[data-ver-lista-resumen]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      abrirListaResumen(btn.dataset.verListaResumen);
    });
  });
  cont.querySelectorAll("[data-editar-lista-resumen]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      abrirConfigListaResumen(btn.dataset.editarListaResumen);
    });
  });
  cont.querySelectorAll("[data-abrir-lista-resumen]").forEach(card => {
    card.addEventListener("click", () => abrirListaResumen(card.dataset.abrirListaResumen));
  });
}

function abrirConfigListaResumen(id = "") {
  listaResumenEditandoId = id || "";
  const lista = id ? obtenerListaResumenPorId(id) : null;
  articulosListaResumenEditando = (lista?.articulos || []).map(normalizarArticuloResumen);
  if ($("nombreListaResumen")) $("nombreListaResumen").value = lista?.nombre || "";
  if ($("buscarArticuloResumen")) $("buscarArticuloResumen").value = "";
  if ($("tituloConfigListaResumen")) $("tituloConfigListaResumen").textContent = lista ? "Editar lista" : "Nueva lista";
  $("btnEliminarListaResumen")?.classList.toggle("oculto", !lista);
  pintarResultadosArticuloResumen();
  pintarArticulosListaResumenEditando();
  cambiarSubvistaResumenListas("config");
}

function articuloResumenIncluido(codigoKey) {
  return articulosListaResumenEditando.some(a => normalizarCodigo(a.codigoKey || a.codigo) === codigoKey);
}

function pintarResultadosArticuloResumen() {
  const cont = $("resultadosArticuloResumen");
  if (!cont) return;
  const q = String($("buscarArticuloResumen")?.value || "").trim().toLowerCase();
  const rows = registrosPivot
    .filter(r => !q || [r.codigo, r.nombre].some(v => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"))
    .slice(0, 400);

  if (!rows.length) {
    cont.innerHTML = `<div class="resumen-listas-vacio compacto">No se encontraron artículos calculados.</div>`;
    return;
  }

  cont.innerHTML = rows.map((r, idx) => {
    const key = normalizarCodigo(r.codigoKey || r.codigo);
    const incluido = articuloResumenIncluido(key);
    return `
      <div class="resultado-articulo-resumen ${incluido ? "incluido" : ""}">
        <div>
          <b>${escapeHtml(r.codigo)}</b>
          <span>${escapeHtml(r.nombre)}</span>
          <small>Existencia semana: ${fmtNum(r.existenciaFinalSemana)}</small>
        </div>
        <button type="button" data-agregar-articulo-resumen="${idx}" ${incluido ? "disabled" : ""}>${incluido ? "Agregado" : "+ Agregar"}</button>
      </div>`;
  }).join("");

  cont.querySelectorAll("[data-agregar-articulo-resumen]").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = rows[Number(btn.dataset.agregarArticuloResumen)];
      const art = normalizarArticuloResumen(row);
      if (art.codigoKey && !articuloResumenIncluido(art.codigoKey)) {
        articulosListaResumenEditando.push(art);
        pintarArticulosListaResumenEditando();
        pintarResultadosArticuloResumen();
      }
    });
  });
}

function moverArticuloListaResumen(indice, delta) {
  const destino = indice + delta;
  if (indice < 0 || destino < 0 || destino >= articulosListaResumenEditando.length) return;
  const [art] = articulosListaResumenEditando.splice(indice, 1);
  articulosListaResumenEditando.splice(destino, 0, art);
  pintarArticulosListaResumenEditando();
}

function pintarArticulosListaResumenEditando() {
  const cont = $("articulosListaResumenActual");
  if ($("contadorArticulosResumen")) $("contadorArticulosResumen").textContent = `${articulosListaResumenEditando.length} artículos`;
  if (!cont) return;
  if (!articulosListaResumenEditando.length) {
    cont.innerHTML = `<div class="resumen-listas-vacio compacto">Agrega artículos desde el buscador.</div>`;
    return;
  }

  cont.innerHTML = articulosListaResumenEditando.map((a, idx) => `
    <div class="articulo-resumen-orden">
      <span class="numero-orden-resumen">${idx + 1}</span>
      <div class="articulo-resumen-datos">
        <b>${escapeHtml(a.codigo)}</b>
        <span>${escapeHtml(a.nombre)}</span>
      </div>
      <div class="articulo-resumen-actions">
        <button type="button" data-subir-resumen="${idx}" title="Subir" ${idx === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-bajar-resumen="${idx}" title="Bajar" ${idx === articulosListaResumenEditando.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-quitar-resumen="${idx}" class="peligro-suave" title="Quitar">Quitar</button>
      </div>
    </div>
  `).join("");

  cont.querySelectorAll("[data-subir-resumen]").forEach(btn => btn.addEventListener("click", () => moverArticuloListaResumen(Number(btn.dataset.subirResumen), -1)));
  cont.querySelectorAll("[data-bajar-resumen]").forEach(btn => btn.addEventListener("click", () => moverArticuloListaResumen(Number(btn.dataset.bajarResumen), 1)));
  cont.querySelectorAll("[data-quitar-resumen]").forEach(btn => btn.addEventListener("click", () => {
    articulosListaResumenEditando.splice(Number(btn.dataset.quitarResumen), 1);
    pintarArticulosListaResumenEditando();
    pintarResultadosArticuloResumen();
  }));
}

async function guardarListaResumenActual() {
  const nombre = String($("nombreListaResumen")?.value || "").trim().toUpperCase();
  if (!nombre) return alert("Escribe el título de la lista.");
  if (!articulosListaResumenEditando.length) return alert("Agrega al menos un artículo.");

  const ahora = new Date().toISOString();
  const existente = listaResumenEditandoId ? obtenerListaResumenPorId(listaResumenEditandoId) : null;
  let id = existente?.id || crearIdListaResumen(nombre);
  if (!existente && listasResumen.some(l => l.id === id)) id = `${id}_${Date.now()}`;

  const nueva = {
    id,
    nombre,
    activo: true,
    creadoEn: existente?.creadoEn || ahora,
    actualizadoEn: ahora,
    articulos: articulosListaResumenEditando.map(normalizarArticuloResumen)
  };
  const idx = listasResumen.findIndex(l => l.id === id);
  if (idx >= 0) listasResumen[idx] = nueva;
  else listasResumen.push(nueva);
  listasResumen.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));

  await guardarDocumentoListasResumen();
  listaResumenEditandoId = id;
  pintarTarjetasListasResumen();
  abrirListaResumen(id);
}

async function eliminarListaResumenActual() {
  const lista = obtenerListaResumenPorId(listaResumenEditandoId);
  if (!lista) return;
  if (!confirm(`¿Eliminar la lista "${lista.nombre}"? Esto no elimina artículos ni movimientos de la tabla principal.`)) return;
  listasResumen = listasResumen.filter(l => l.id !== lista.id);
  await guardarDocumentoListasResumen();
  listaResumenActualId = "";
  listaResumenEditandoId = "";
  pintarTarjetasListasResumen();
  cambiarSubvistaResumenListas("menu");
}

function obtenerRowsListaResumen(lista) {
  const mapa = new Map(registrosPivot.map(r => [normalizarCodigo(r.codigoKey || r.codigo), r]));
  return (lista?.articulos || []).map(a => {
    const key = normalizarCodigo(a.codigoKey || a.codigo);
    const row = mapa.get(key);
    return row || {
      codigo: a.codigo,
      codigoKey: key,
      nombre: a.nombre,
      inviniSemana: 0,
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
      totalAjustesSemana: 0,
      existenciaFinalSemana: 0,
      movimientosSemana: []
    };
  });
}

function abrirListaResumen(id) {
  const lista = obtenerListaResumenPorId(id);
  if (!lista) return;
  listaResumenActualId = id;
  if ($("tituloListaResumenVista")) $("tituloListaResumenVista").textContent = lista.nombre;
  if ($("selectorSemanaResumen") && $("selectorSemana")) $("selectorSemanaResumen").value = $("selectorSemana").value;
  pintarVistaListaResumen();
  cambiarSubvistaResumenListas("ver");
}

function pintarVistaListaResumen() {
  const lista = obtenerListaResumenPorId(listaResumenActualId);
  const tabla = $("tablaResumenLista");
  if (!lista || !tabla) return;
  const rows = obtenerRowsListaResumen(lista);
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  if ($("metaListaResumenVista")) {
    $("metaListaResumenVista").textContent = `${rows.length} artículos · Semana ${rangoSemanaActual.inicio} a ${rangoSemanaActual.fin}`;
  }

  const te = rows.reduce((s,r)=>s+Number(r.totalEntradasSemana||0),0);
  const ts = rows.reduce((s,r)=>s+Number(r.totalSalidasSemana||0),0);
  const ta = rows.reduce((s,r)=>s+Number(r.totalAjustesSemana||0),0);
  if ($("kpisListaResumen")) $("kpisListaResumen").innerHTML = `
    <div><span>Artículos</span><strong>${rows.length}</strong></div>
    <div><span>Entradas</span><strong>${fmtNum(te)}</strong></div>
    <div><span>Salidas</span><strong>${fmtNum(ts)}</strong></div>
    <div><span>Ajustes</span><strong>${fmtNum(ta)}</strong></div>`;

  thead.innerHTML = `<tr><th>#</th><th class="left">Código</th><th class="left">Artículo</th><th>Inv. inicio</th><th>Entradas</th><th>Salidas</th><th>Ajustes</th><th>Existencia final</th><th>Movimientos</th></tr>`;
  tbody.innerHTML = rows.map((r, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad ${Number(r.inviniSemana||0)<0?'inventario-negativo':''}">${fmtNum(r.inviniSemana)}</td>
      <td class="cantidad entrada-col">${fmtNum(r.totalEntradasSemana)}</td>
      <td class="cantidad salida-col">${fmtNum(r.totalSalidasSemana)}</td>
      <td class="cantidad ajuste-col">${fmtNum(r.totalAjustesSemana)}</td>
      <td class="cantidad ${Number(r.existenciaFinalSemana||0)<0?'inventario-negativo':''}">${fmtNum(r.existenciaFinalSemana)}</td>
      <td><button type="button" data-movimientos-resumen="${idx}">Ver ${Array.isArray(r.movimientosSemana) ? r.movimientosSemana.length : 0}</button></td>
    </tr>`).join("");

  const inv = rows.reduce((s,r)=>s+Number(r.inviniSemana||0),0);
  const fin = rows.reduce((s,r)=>s+Number(r.existenciaFinalSemana||0),0);
  tfoot.innerHTML = `<tr><td colspan="3" class="left">TOTAL LISTA</td><td>${fmtNum(inv)}</td><td>${fmtNum(te)}</td><td>${fmtNum(ts)}</td><td>${fmtNum(ta)}</td><td>${fmtNum(fin)}</td><td></td></tr>`;

  tbody.querySelectorAll("[data-movimientos-resumen]").forEach(btn => btn.addEventListener("click", () => {
    pintarMovimientosArticuloResumen(rows[Number(btn.dataset.movimientosResumen)]);
  }));
}

function pintarMovimientosArticuloResumen(row) {
  const cont = $("detalleMovimientosListaResumen");
  if (!cont || !row) return;
  const movimientos = Array.isArray(row.movimientosSemana) ? [...row.movimientosSemana].sort(ordenarMovimientosInventario) : [];
  cont.classList.remove("oculto");
  cont.innerHTML = `
    <div class="detalle-movimientos-head">
      <div><b>${escapeHtml(row.codigo)} · ${escapeHtml(row.nombre)}</b><span>Movimientos de ${rangoSemanaActual.inicio} a ${rangoSemanaActual.fin}</span></div>
      <button type="button" id="btnCerrarDetalleMovResumen">Cerrar</button>
    </div>
    ${movimientos.length ? `<div class="movimientos-resumen-scroll"><table><thead><tr><th>Tipo</th><th>Fecha</th><th>Hora</th><th>Folio</th><th>Origen / destino</th><th>Cantidad</th></tr></thead><tbody>${movimientos.map(m => {
      const item = m.item || {};
      return `<tr><td>${escapeHtml(m.tipo)}</td><td>${escapeHtml(m.fecha)}</td><td>${escapeHtml(m.hora || '')}</td><td>${escapeHtml(item.folio || item.folioEntrada || item.docId || '')}</td><td>${escapeHtml(item.destino || item.proveedor || item.entrega || '')}</td><td class="cantidad">${fmtNum(m.tipo === 'AJUINV' ? (m.diferencia ?? m.cantidad) : m.cantidad)}</td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="resumen-listas-vacio compacto">Este artículo no tiene movimientos en la semana seleccionada.</div>`}
  `;
  $("btnCerrarDetalleMovResumen")?.addEventListener("click", () => cont.classList.add("oculto"));
  cont.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function mostrarPanelResumenListas() {
  const card = document.querySelector(".card");
  card?.classList.remove("modo-inventarios", "modo-entradas-zapata", "modo-ajustes-inventario");
  card?.classList.add("modo-resumen-listas");
  $("panelInventarios")?.classList.add("oculto");
  $("panelEntradasZapata")?.classList.add("oculto");
  $("panelAjustesInventario")?.classList.add("oculto");
  $("panelResumenListas")?.classList.remove("oculto");
  cambiarSubvistaResumenListas("menu");
  pintarTarjetasListasResumen();
}

function ocultarPanelResumenListas() {
  document.querySelector(".card")?.classList.remove("modo-resumen-listas");
  $("panelResumenListas")?.classList.add("oculto");
  cambiarSubvistaResumenListas("menu");
  cambiarVista("resumen");
}

function crearIdListadoProveedor(nombre) {
  const base = String(nombre || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return base || `LISTADO_${Date.now()}`;
}

async function cargarListadosResumenProveedor() {
  listadosResumenProveedor = [];

  const snap = await getDoc(REF_LISTAS_CONTEO);
  if (snap.exists()) {
    const data = snap.data() || {};
    const listas = Array.isArray(data.listas) ? data.listas : [];

    listadosResumenProveedor = listas
      .filter((l) => l && l.activo !== false)
      .map((l) => ({
        id: String(l.id || crearIdListadoProveedor(l.nombre || "LISTA")),
        nombre: String(l.nombre || l.id || "").trim(),
        articulos: Array.isArray(l.articulos) ? l.articulos : [],
        activo: l.activo !== false,
        creadoEn: l.creadoEn || "",
        actualizadoEn: l.actualizadoEn || ""
      }));
  }

  listadosResumenProveedor.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  llenarSelectoresListadosProveedor();
}

function llenarSelectoresListadosProveedor() {
  const opciones = listadosResumenProveedor.map((l) =>
    `<option value="${escapeHtml(l.id)}">${escapeHtml(l.nombre)}</option>`
  ).join("");

  const html = opciones || `<option value="">Sin listas de conteo</option>`;

  if ($("selectorListadoResumen")) $("selectorListadoResumen").innerHTML = html;
  if ($("selectorListadoConfig")) $("selectorListadoConfig").innerHTML = `<option value="">Nueva lista</option>${opciones}`;
}

function obtenerListadoPorId(id) {
  return listadosResumenProveedor.find((l) => l.id === id) || null;
}

function normalizarArticuloListado(row) {
  return {
    codigo: String(row.codigo || "").trim(),
    codigoKey: normalizarCodigo(row.codigoKey || row.codigo || ""),
    nombre: String(row.nombre || "").trim()
  };
}

function articuloYaIncluido(codigoKey) {
  return articulosConfigActual.some((a) => normalizarCodigo(a.codigoKey || a.codigo) === codigoKey);
}

function pintarArticulosConfigActual() {
  const cont = $("articulosListadoActual");
  const contador = $("contadorArticulosListado");
  if (contador) contador.textContent = `${articulosConfigActual.length} seleccionados`;
  if (!cont) return;

  if (!articulosConfigActual.length) {
    cont.innerHTML = `<div class="vacio-articulos">Sin artículos seleccionados.</div>`;
    return;
  }

  cont.innerHTML = articulosConfigActual.map((a, idx) => `
    <div class="articulo-chip">
      <span><b>${escapeHtml(a.codigo)}</b> · ${escapeHtml(a.nombre)}</span>
      <button type="button" data-quitar-articulo="${idx}">Quitar</button>
    </div>
  `).join("");

  cont.querySelectorAll("[data-quitar-articulo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.quitarArticulo);
      articulosConfigActual.splice(idx, 1);
      pintarArticulosConfigActual();
      pintarResultadosBusquedaListado();
    });
  });
}

function obtenerFilasDisponiblesListado() {
  const q = String($("buscarArticuloListado")?.value || "").trim().toLowerCase();
  return registrosPivot
    .filter((r) => !q || [r.codigo, r.nombre].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
}

function pintarResultadosBusquedaListado() {
  const cont = $("resultadosBusquedaListado");
  if (!cont) return;

  const rows = obtenerFilasDisponiblesListado();
  const limite = 600;
  const visibles = rows.slice(0, limite);

  if (!visibles.length) {
    cont.innerHTML = `<div class="vacio-articulos">No se encontraron artículos del pivot.</div>`;
    return;
  }

  cont.innerHTML = `
    <div class="lista-codigos-encabezado">
      <span>${rows.length} códigos encontrados${rows.length > limite ? ` · mostrando ${limite}` : ""}</span>
      <span>Marca los que formarán la lista</span>
    </div>
    ${visibles.map((r, idx) => {
      const key = normalizarCodigo(r.codigoKey || r.codigo);
      const checked = articuloYaIncluido(key) ? "checked" : "";
      return `
        <label class="resultado-articulo resultado-articulo-check">
          <input type="checkbox" data-seleccionar-articulo="${idx}" ${checked} />
          <span class="resultado-articulo-datos">
            <b>${escapeHtml(r.codigo)}</b>
            <span>${escapeHtml(r.nombre)}</span>
            <small>Teórico: ${fmtNum(r.existenciaFinalSemana)}</small>
          </span>
        </label>
      `;
    }).join("")}
  `;

  cont.querySelectorAll("[data-seleccionar-articulo]").forEach((check) => {
    check.addEventListener("change", () => {
      const row = visibles[Number(check.dataset.seleccionarArticulo)];
      const art = normalizarArticuloListado(row);
      if (!art.codigoKey) return;

      if (check.checked) {
        if (!articuloYaIncluido(art.codigoKey)) articulosConfigActual.push(art);
      } else {
        articulosConfigActual = articulosConfigActual.filter(
          (a) => normalizarCodigo(a.codigoKey || a.codigo) !== art.codigoKey
        );
      }
      pintarArticulosConfigActual();
    });
  });
}

function seleccionarArticulosVisiblesListado() {
  obtenerFilasDisponiblesListado().slice(0, 600).forEach((row) => {
    const art = normalizarArticuloListado(row);
    if (art.codigoKey && !articuloYaIncluido(art.codigoKey)) articulosConfigActual.push(art);
  });
  pintarArticulosConfigActual();
  pintarResultadosBusquedaListado();
}

function limpiarSeleccionListado() {
  articulosConfigActual = [];
  pintarArticulosConfigActual();
  pintarResultadosBusquedaListado();
}

function cargarListadoConfig(id) {
  const listado = obtenerListadoPorId(id);
  listadoConfigActual = listado;

  if ($("nombreListadoProveedor")) $("nombreListadoProveedor").value = listado?.nombre || "";
  articulosConfigActual = (listado?.articulos || []).map(normalizarArticuloListado);

  pintarArticulosConfigActual();
  pintarResultadosBusquedaListado();
}

async function guardarDocumentoListasConteo() {
  await setDoc(REF_LISTAS_CONTEO, {
    listas: listadosResumenProveedor,
    actualizadoEn: new Date().toISOString()
  }, { merge: true });
}

async function guardarListadoProveedor() {
  const nombre = String($("nombreListadoProveedor")?.value || "").trim().toUpperCase();

  if (!nombre) {
    alert("Escribe el nombre de la lista de conteo.");
    return;
  }

  if (!articulosConfigActual.length) {
    alert("Selecciona al menos un código del pivot.");
    return;
  }

  const ahora = new Date().toISOString();
  const id = listadoConfigActual?.id || crearIdListadoProveedor(nombre);
  const existente = obtenerListadoPorId(id);
  const nuevaLista = {
    id,
    nombre,
    activo: true,
    creadoEn: existente?.creadoEn || ahora,
    actualizadoEn: ahora,
    articulos: articulosConfigActual.map(normalizarArticuloListado)
  };

  const idx = listadosResumenProveedor.findIndex((l) => l.id === id);
  if (idx >= 0) listadosResumenProveedor[idx] = nuevaLista;
  else listadosResumenProveedor.push(nuevaLista);

  listadosResumenProveedor.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  await guardarDocumentoListasConteo();
  llenarSelectoresListadosProveedor();
  if ($("selectorListadoConfig")) $("selectorListadoConfig").value = id;
  if ($("selectorListadoResumen")) $("selectorListadoResumen").value = id;
  listadoConfigActual = nuevaLista;
  cargarListadoConfig(id);
  setStatus(`Lista ${nombre} guardada con ${articulosConfigActual.length} artículos.`);
}

async function eliminarListadoProveedor() {
  if (!listadoConfigActual?.id) {
    alert("Selecciona una lista para eliminar.");
    return;
  }

  if (!confirm(`¿Eliminar lista ${listadoConfigActual.nombre}?`)) return;

  listadosResumenProveedor = listadosResumenProveedor.filter((l) => l.id !== listadoConfigActual.id);
  await guardarDocumentoListasConteo();

  listadoConfigActual = null;
  articulosConfigActual = [];
  if ($("nombreListadoProveedor")) $("nombreListadoProveedor").value = "";
  llenarSelectoresListadosProveedor();
  pintarArticulosConfigActual();
  pintarResultadosBusquedaListado();
  setStatus("Lista de conteo eliminada.");
}

function cambiarSubvistaInventarios(tipo) {
  const esMenu = tipo === "menu";
  const esResumen = tipo === "resumen";
  const esConfig = tipo === "config";

  $("vistaMenuInventarios")?.classList.toggle("oculto", !esMenu);
  $("vistaListadosResumen")?.classList.toggle("oculto", !esResumen);
  $("vistaConfigurarListados")?.classList.toggle("oculto", !esConfig);

  if (!esResumen) {
    $("contenedorTablaListadoResumen")?.classList.add("oculto");
  }
}

function obtenerRowsListado(listado) {
  const codigos = new Set((listado?.articulos || []).map((a) => normalizarCodigo(a.codigoKey || a.codigo)));
  return registrosPivot
    .filter((r) => codigos.has(normalizarCodigo(r.codigoKey || r.codigo)))
    .filter(pasaFiltroPivot)
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

function pintarListadoResumenProveedor() {
  const id = $("selectorListadoResumen")?.value || "";
  const listado = obtenerListadoPorId(id);

  if (!listado) {
    alert("No hay lista seleccionada.");
    return;
  }

  vistaActual = "listado_proveedor";
  $("tabResumen")?.classList.remove("active");
  $("tabDetalle")?.classList.remove("active");

  const rows = obtenerRowsListado(listado);
  const tabla = $("tablaListadoResumen") || $("tabla");
  const contenedorTablaResumen = $("contenedorTablaListadoResumen");
  if (contenedorTablaResumen) contenedorTablaResumen.classList.remove("oculto");

  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  thead.innerHTML = `
    <tr>
      <th class="left">Código</th>
      <th class="left">Concepto</th>
      <th>Cantidad</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad"></td>
    </tr>
  `).join("");

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="3">${escapeHtml(listado.nombre)} · ${rows.length} artículos</td>
    </tr>
  `;

  setStatus(`Lista ${listado.nombre}: ${rows.length} artículos. Lista de conteo manual; no modifica el inventario.`);
}

function imprimirListaConteo(listado) {
  if (!listado) {
    alert("Selecciona una lista de conteo para imprimir.");
    return;
  }

  const rows = obtenerRowsListado(listado);
  if (!rows.length) {
    alert("La lista no tiene códigos disponibles en el pivot actual.");
    return;
  }

  // Formato TEXTO PURO para impresora térmica de 80 mm instalada en
  // Windows como "Generic / Text Only". Se trabaja a 48 caracteres por línea,
  // compatible con el ancho estándar de la TM-T20II usando Font A.
  const COLUMNAS = 48;
  const ANCHO_CODIGO = 13;
  const ANCHO_CONCEPTO = 25;
  const ANCHO_CANTIDAD = 8;

  const limpiarTexto = (valor) => String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cortar = (texto, ancho) => {
    const t = limpiarTexto(texto);
    const partes = [];
    let resto = t;
    while (resto.length > ancho) {
      let corte = resto.lastIndexOf(" ", ancho);
      if (corte < Math.floor(ancho * 0.55)) corte = ancho;
      partes.push(resto.slice(0, corte).trim());
      resto = resto.slice(corte).trim();
    }
    partes.push(resto);
    return partes.length ? partes : [""];
  };

  const padR = (texto, ancho) => limpiarTexto(texto).slice(0, ancho).padEnd(ancho, " ");
  const padL = (texto, ancho) => limpiarTexto(texto).slice(0, ancho).padStart(ancho, " ");
  const centrar = (texto, ancho = COLUMNAS) => {
    const t = limpiarTexto(texto).slice(0, ancho);
    const izq = Math.max(0, Math.floor((ancho - t.length) / 2));
    return " ".repeat(izq) + t;
  };

  const ahora = new Date();
  const fechaInventario = ahora.toLocaleDateString("es-MX", {
    day: "2-digit", month: "2-digit", year: "numeric"
  });
  const horaInventario = ahora.toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", hour12: false
  });

  const lineas = [];
  lineas.push(centrar(listado.nombre));
  lineas.push(centrar("LISTA DE CONTEO"));
  lineas.push("-".repeat(COLUMNAS));
  lineas.push(`FECHA: ${fechaInventario}   HORA: ${horaInventario}`);
  lineas.push("-".repeat(COLUMNAS));
  lineas.push(`${padR("CODIGO", ANCHO_CODIGO)} ${padR("CONCEPTO", ANCHO_CONCEPTO)} ${padL("CANT.", ANCHO_CANTIDAD)}`);
  lineas.push("-".repeat(COLUMNAS));

  rows.forEach((r) => {
    const codigo = cortar(r.codigo, ANCHO_CODIGO);
    const concepto = cortar(r.nombre, ANCHO_CONCEPTO);
    const alto = Math.max(codigo.length, concepto.length);

    for (let i = 0; i < alto; i++) {
      const colCodigo = i < codigo.length ? codigo[i] : "";
      const colConcepto = i < concepto.length ? concepto[i] : "";
      // Cuadro compacto de captura manual. En Generic / Text Only se usa ASCII
      // para que se imprima correctamente sin depender de bordes CSS.
      const colCantidad = i === 0 ? "[      ]" : "";
      lineas.push(`${padR(colCodigo, ANCHO_CODIGO)} ${padR(colConcepto, ANCHO_CONCEPTO)} ${padL(colCantidad, ANCHO_CANTIDAD)}`);
    }
    lineas.push("-".repeat(COLUMNAS));
  });

  lineas.push(centrar(`${rows.length} ARTICULOS`));
  lineas.push("");
  lineas.push("");
  lineas.push("");

  const textoPlano = lineas.join("\r\n");
  const ventana = window.open("", "_blank", "width=520,height=800");
  if (!ventana) {
    alert("El navegador bloqueó la ventana de impresión.");
    return;
  }

  // Solo <pre>: sin tablas, bordes, imágenes ni maquetación compleja.
  // Así Generic / Text Only conserva principalmente caracteres, espacios y saltos.
  ventana.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Conteo - ${escapeHtml(listado.nombre)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin:0; padding:0; background:#fff; }
  pre {
    margin:0;
    padding:0;
    font-family:"Courier New", Courier, monospace;
    font-size:10pt;
    line-height:1.05;
    white-space:pre;
    color:#000;
  }
  @media print { html, body { margin:0 !important; padding:0 !important; } }
</style></head><body><pre>${escapeHtml(textoPlano)}</pre>
<script>window.onload=()=>{setTimeout(()=>window.print(),120);};<\/script>
</body></html>`);
  ventana.document.close();
}


async function cargarProveedoresAutorizadosPivot() {
  proveedoresAutorizadosPivot = {};

  const snap = await getDocs(REF_PROVEEDORES_AUTORIZADOS_ZAPATA);

  snap.forEach((docu) => {
    const p = docu.data() || {};
    const rfc = String(p.rfc_emisor || p.rfc || docu.id || "").trim().toUpperCase();

    if (!rfc) return;
    if (p.activo === false) return;

    proveedoresAutorizadosPivot[rfc] = {
      rfc,
      razon_social_emisor: String(p.razon_social_emisor || p.nombre || "").trim(),
      alias_pivot: String(p.alias_pivot || p.razon_social_emisor || p.nombre || rfc).trim()
    };
  });
}

function obtenerAliasProveedorPivot(rfc, razonSocial) {
  const key = String(rfc || "").trim().toUpperCase();

  if (key && proveedoresAutorizadosPivot[key]) {
    return proveedoresAutorizadosPivot[key].alias_pivot;
  }

  return String(razonSocial || key || "PROVEEDOR").trim();
}

function obtenerProveedoresEntradaPorFecha(fecha) {
  const proveedores = registrosEntradasSemana
    .filter(x => x.fecha === fecha)
    .map(x => String(x.alias_pivot || x.proveedor || x.entrega || "").trim())
    .filter(Boolean);

  return [...new Set(proveedores)].join(" / ");
}

function obtenerFoliosAjustePorFecha(fecha) {
  const folios = registrosAjustesSemana
    .filter(x => x.fecha === fecha)
    .map(x => String(x.folio || "").trim())
    .filter(Boolean);

  return [...new Set(folios)].join(" / ");
}

async function cargarConfiguracionTraszap() {
  const snap = await getDoc(REF_CONFIG_TRASZAP);

  if (!snap.exists()) {
    throw new Error(
      "No existe la configuración TRASZAP en /almacenes/Almacen_Liquidos/configuracion/traszap"
    );
  }

  const data = snap.data() || {};
  const skusRaw = Array.isArray(data.skus) ? data.skus : [];
  const skusActivos = new Map();

  skusRaw.forEach((item) => {
    const esObjeto = item && typeof item === "object";
    if (esObjeto && item.activo === false) return;

    const codigoOriginal = esObjeto
      ? String(item.codigo ?? item.sku ?? "").trim()
      : String(item ?? "").trim();
    const codigoKey = normalizarCodigo(codigoOriginal);
    if (!codigoKey) return;

    skusActivos.set(codigoKey, {
      codigo: codigoOriginal,
      nombre: esObjeto ? String(item.nombre || "").trim() : ""
    });
  });

  configuracionTraszap = {
    activo: data.activo !== false,
    destino: String(data.destino || "BODEGA MATRIZ MADERO 690").trim(),
    tipoMovimiento: String(data.tipoMovimiento || "TRASZAP").trim().toUpperCase(),
    skusActivos
  };

  return configuracionTraszap;
}

async function consultarEntradasTraszap(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0, totalDocsAceptados: 0 };

  const config = configuracionTraszap || await cargarConfiguracionTraszap();
  if (!config.activo || !config.skusActivos.size) {
    return { detalle: [], totalDocs: 0, totalDocsAceptados: 0 };
  }

  // Se consulta sólo por fecha para no exigir un índice compuesto Firestore.
  // El destino y los SKU se filtran en memoria.
  const q = query(
    REF_SALIDAS_APP_ZAPATA,
    where("fecha", ">=", inicio),
    where("fecha", "<=", `${fin}\uf8ff`),
    orderBy("fecha", "asc")
  );

  const snap = await getDocs(q);
  const detalle = [];
  const documentosAceptados = new Set();
  const destinoConfigurado = config.destino.toUpperCase();

  snap.forEach((documento) => {
    const data = documento.data() || {};
    const fecha = normalizarFecha(data.fecha || data.creadoEn || data.timestamp || "");
    if (!fecha || fecha < inicio || fecha > fin || fecha < FECHA_INICIO_MINIMA) return;

    const destinoDocumento = String(data.destino || "").trim();
    if (destinoDocumento.toUpperCase() !== destinoConfigurado) return;

    const articulos = Array.isArray(data.articulos)
      ? data.articulos
      : (Array.isArray(data.productos) ? data.productos : []);

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(
        art.codigo ?? art.codigoBarra ?? art.codigo_interno ?? ""
      ).trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      if (!codigoKey || !config.skusActivos.has(codigoKey)) return;

      const cantidad = Number(art.cantidad || art.cantidad_salida || 0);
      if (!(cantidad > 0)) return;

      const catalogo = config.skusActivos.get(codigoKey) || {};
      const nombre = String(
        art.nombre ?? art.concepto ?? art.descripcion ?? catalogo.nombre ?? ""
      ).trim();

      documentosAceptados.add(documento.id);
      detalle.push({
        tipo: "ENTRADA",
        subtipo: config.tipoMovimiento || "TRASZAP",
        origenMovimiento: "TRASZAP",
        docId: `TRASZAP:${documento.id}`,
        docIdOrigen: documento.id,
        partida: idx + 1,
        folio: String(data.folio || documento.id || "").trim(),
        fecha,
        hora: String(data.hora || "").trim(),
        destino: destinoDocumento,
        proveedor: "TRASZAP",
        entrega: "TRASZAP",
        alias_pivot: "TRASZAP",
        recibe: String(data.recibe || data.capturadoPorEmail || "").trim(),
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad
      });
    });
  });

  return {
    detalle,
    totalDocs: snap.size,
    totalDocsAceptados: documentosAceptados.size
  };
}

async function cargarInventarioInicial() {
  // Punto cero operativo solicitado: 01/08/2026.
  // No se lee ningún conteo anterior; todos los artículos comienzan en cero.
  inventarioInicialOriginal = {};
  setStatus("Punto cero cargado: inventario inicial en 0 al 01/08/2026.");
  setProgress(8);
  return inventarioInicialOriginal;
}

async function consultarSalidas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  // Firestore filtra desde servidor por la fecha ISO. Así no descargamos
  // documentos anteriores al punto cero ni posteriores al rango requerido.
  const q = query(
    REF_SALIDAS_ZAPATA,
    where("fecha", ">=", inicio),
    where("fecha", "<=", `${fin}\uf8ff`),
    orderBy("fecha", "asc")
  );

  const snap = await getDocs(q);
  const detalle = [];

  snap.forEach((documento) => {
    const data = documento.data() || {};
    const fecha = normalizarFecha(data.fecha || "");
    if (!fecha || fecha < inicio || fecha > fin || fecha < FECHA_INICIO_MINIMA) return;

    const articulos = normalizarListaArticulos(data);

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(
        art.codigoBarra ?? art.codigo ?? art.codigo_interno ?? ""
      ).trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(
        art.concepto ?? art.nombre ?? art.descripcion ?? art.descripcion_interna ?? ""
      ).trim();
      const cantidad = Number(art.cantidad || art.cantidad_salida || 0);

      if (!codigoKey && !nombre && !cantidad) return;

      // En memoria conservamos sólo lo que usa la tabla/detalle.
      detalle.push({
        tipo: "SALIDA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folio || documento.id || "").trim(),
        fecha,
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad
      });
    });
  });

  return { detalle, totalDocs: snap.size };
}

async function consultarEntradas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  const q = query(
    REF_ENTRADAS_ZAPATA,
    where("fecha", ">=", inicio),
    where("fecha", "<=", fin),
    orderBy("fecha", "asc")
  );

  const snap = await getDocs(q);
  const detalle = [];

  snap.forEach((documento) => {
    const data = documento.data() || {};
    const fecha = normalizarFecha(data.fecha || "");
    if (!fecha || fecha < inicio || fecha > fin || fecha < FECHA_INICIO_MINIMA) return;

    const articulos = normalizarListaArticulos(data);

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(
        art.codigoBarra ?? art.codigo ?? art.codigo_interno ?? ""
      ).trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(
        art.concepto ?? art.nombre ?? art.descripcion ?? art.descripcion_interna ?? ""
      ).trim();
      const cantidad = Number(
        art.cantidad_entrada ?? art.cantidad ?? art.cantidad_recibida ?? 0
      );

      if (!codigoKey && !nombre && !cantidad) return;

      // Proveedor se conserva porque se usa en los encabezados del pivot.
      const proveedor = String(data.proveedor || data.entrega || data.razon_social_emisor || "").trim();

      detalle.push({
        tipo: "ENTRADA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folioEntrada || data.folio || documento.id || "").trim(),
        fecha,
        proveedor,
        entrega: proveedor,
        alias_pivot: proveedor,
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad
      });
    });
  });

  console.log(`[ENTRADAS LÍQUIDOS] ${snap.size} documento(s), ${detalle.length} partida(s) cargadas entre ${inicio} y ${fin}.`);
  return { detalle, totalDocs: snap.size };
}

async function consultarAjustesInventario(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  // Primero filtramos los encabezados del ajuste por fecha en Firestore.
  // Sólo después leemos PARTIDAS de los ajustes que realmente corresponden.
  const qAjustes = query(
    REF_AJUSTES_INVENTARIO_ZAPATA,
    where("fecha_movimiento", ">=", inicio),
    where("fecha_movimiento", "<=", fin),
    orderBy("fecha_movimiento", "asc")
  );

  const snapAjustes = await getDocs(qAjustes);
  const detalle = [];

  for (const ajusteDoc of snapAjustes.docs) {
    const ajusteId = ajusteDoc.id;
    const ajusteData = ajusteDoc.data() || {};

    const refPartidas = collection(
      db,
      "almacenes",
      "Almacen_Dulces",
      "ajustes_inventario",
      ajusteId,
      "PARTIDAS"
    );

    const partidasSnap = await getDocs(refPartidas);

    partidasSnap.forEach((partidaDoc) => {
      const p = partidaDoc.data() || {};
      if (p.eliminado === true) return;

      const fecha = normalizarFecha(p.fecha_movimiento || ajusteData.fecha_movimiento || "");
      if (!fecha || fecha < inicio || fecha > fin || fecha < FECHA_INICIO_MINIMA) return;

      const codigoOriginal = String(p.codigo || p.codigoKey || "").trim();
      const codigoKey = normalizarCodigo(p.codigoKey || codigoOriginal);
      const nombre = String(p.nombre || p.descripcion || "").trim();
      const diferencia = Number(p.diferencia || 0);

      if (!codigoKey && !nombre && !diferencia) return;

      detalle.push({
        tipo: "AJUINV",
        docId: ajusteId,
        partida: p.partida || partidaDoc.id || "",
        folio: String(ajusteData.folio || ajusteId || "").trim(),
        fecha,
        hora: String(p.hora_movimiento || ajusteData.hora_movimiento || "").trim(),
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad: diferencia,
        diferencia,
        existencia_fisica: Number(p.existencia_fisica || 0),
        existencia_teorica: Number(p.existencia_teorica || 0)
      });
    });
  }

  return { detalle, totalDocs: snapAjustes.size };
}

function claveMovimiento(item) {
  return `${item.tipo}|${item.docId}|${item.partida}`;
}

function anexarSinDuplicados(destino, nuevos) {
  const existentes = new Set(destino.map(claveMovimiento));
  nuevos.forEach(item => {
    const clave = claveMovimiento(item);
    if (!existentes.has(clave)) {
      destino.push(item);
      existentes.add(clave);
    }
  });
}

async function cargarMovimientosHasta(fin, forzar = false) {
  let inicioConsulta = FECHA_BASE_INVENTARIO;

  if (forzar) {
    cacheMovimientos = {
      salidas: [],
      entradas: [],
      traszap: [],
      ajustes: [],
      cargadoHasta: "",
      inicializado: false
    };
    configuracionTraszap = null;
  } else if (cacheMovimientos.inicializado) {
    if (fin <= cacheMovimientos.cargadoHasta) return;
    inicioConsulta = sumarDias(cacheMovimientos.cargadoHasta, 1);
  }

  if (fin < inicioConsulta) return;

  setStatus(`Descargando movimientos ${fechaCorta(inicioConsulta)} a ${fechaCorta(fin)}...`);

  // La configuración se relee cuando se fuerza Refrescar para que los SKU
  // agregados o desactivados surtan efecto sin tocar el código.
  if (!configuracionTraszap) {
    await cargarConfiguracionTraszap();
  }

  const [salidas, entradas, traszap, ajustes] = await Promise.all([
    consultarSalidas(inicioConsulta, fin),
    consultarEntradas(inicioConsulta, fin),
    consultarEntradasTraszap(inicioConsulta, fin),
    consultarAjustesInventario(inicioConsulta, fin)
  ]);

  anexarSinDuplicados(cacheMovimientos.salidas, salidas.detalle);
  anexarSinDuplicados(cacheMovimientos.entradas, entradas.detalle);
  anexarSinDuplicados(cacheMovimientos.traszap, traszap.detalle);
  anexarSinDuplicados(cacheMovimientos.ajustes, ajustes.detalle);

  cacheMovimientos.cargadoHasta = fin;
  cacheMovimientos.inicializado = true;
}

function dividirMovimientosPorSemana(items, rango) {
  const semana = [];
  const anterior = [];

  for (const item of items) {
    if (item.fecha < FECHA_BASE_INVENTARIO || item.fecha > rango.fin) continue;
    if (item.fecha >= rango.inicio) semana.push(item);
    else anterior.push(item);
  }

  return { semana, anterior };
}

async function cargarSalidasZapata(forzarRecarga = false) {
  try {
    const rango = obtenerRangoSemana();

    await cargarInventarioInicial();
    await cargarProveedoresAutorizadosPivot();

    setProgress(20);
    await cargarMovimientosHasta(rango.fin, forzarRecarga);
    setProgress(65);

    const salidas = dividirMovimientosPorSemana(cacheMovimientos.salidas, rango);
    const entradasNormales = dividirMovimientosPorSemana(cacheMovimientos.entradas, rango);
    const entradasTraszap = dividirMovimientosPorSemana(cacheMovimientos.traszap, rango);
    const entradas = {
      semana: [...entradasNormales.semana, ...entradasTraszap.semana],
      anterior: [...entradasNormales.anterior, ...entradasTraszap.anterior]
    };
    const ajustes = dividirMovimientosPorSemana(cacheMovimientos.ajustes, rango);

    registrosDetalleSemana = salidas.semana;
    registrosDetalleAcumuladoAnterior = salidas.anterior;

    registrosEntradasSemana = entradas.semana;
    registrosEntradasAcumuladoAnterior = entradas.anterior;

    registrosAjustesSemana = ajustes.semana;
    registrosAjustesAcumuladoAnterior = ajustes.anterior;

    registrosDetalleMovimientoSemana = [
      ...registrosEntradasSemana,
      ...registrosDetalleSemana,
      ...registrosAjustesSemana
    ].sort((a, b) => {
      if (a.fecha !== b.fecha) return String(b.fecha).localeCompare(String(a.fecha));
      if (String(a.hora || "") !== String(b.hora || "")) {
        return String(b.hora || "").localeCompare(String(a.hora || ""));
      }
      return String(a.tipo).localeCompare(String(b.tipo));
    });

    construirPivot(
      registrosDetalleSemana,
      registrosDetalleAcumuladoAnterior,
      registrosEntradasSemana,
      registrosEntradasAcumuladoAnterior,
      registrosAjustesSemana,
      registrosAjustesAcumuladoAnterior,
      rango.inicio,
      rango.fin
    );

    const docsSemana = arr => new Set(arr.map(x => x.docId)).size;
    actualizarResumenSuperior(
      docsSemana(registrosDetalleSemana),
      docsSemana(registrosEntradasSemana),
      docsSemana(registrosAjustesSemana)
    );

    pintarTabla();

    setProgress(100);
    setStatus(
      `Consulta lista. Semana: ${fechaCorta(rango.inicio)} a ${fechaCorta(rango.fin)}. ` +
      `Entradas: ${registrosEntradasSemana.length} (TRASZAP: ${entradasTraszap.semana.length}). ` +
      `Salidas: ${registrosDetalleSemana.length}. Ajustes: ${registrosAjustesSemana.length}. ` +
      `Cache temporal hasta ${fechaCorta(cacheMovimientos.cargadoHasta)}.`
    );

    ocultarLoader();
  } catch (error) {
    console.error(error);
    setStatus("Error al cargar movimientos de líquidos: " + error.message);
    ocultarLoader();
  }
}

function asegurarRow(mapa, item) {
  const key = item.codigoKey || String(item.nombre || "").toLowerCase();

  if (!mapa.has(key)) {
    mapa.set(key, {
      codigo: item.codigo,
      codigoKey: item.codigoKey,
      nombre: repararTexto(item.nombre),
      inviniOriginal: 0,
      entradasAcumuladasAnteriores: 0,
      salidasAcumuladasAnteriores: 0,
      ajustesAcumuladosAnteriores: 0,
      inviniSemana: 0,
      entradasPorFecha: {},
      salidasPorFecha: {},
      ajustesPorFecha: {},
      movimientosSemana: [],
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
      totalAjustesSemana: 0,
      existenciaFinalSemana: 0
    });
  }

  const row = mapa.get(key);

  if (!row.codigo && item.codigo) row.codigo = item.codigo;
  if (!row.nombre && item.nombre) row.nombre = repararTexto(item.nombre);

  return row;
}

function recalcularExistenciaFinal(row) {
  row.existenciaFinalSemana =
    Number(row.inviniSemana || 0) +
    Number(row.totalEntradasSemana || 0) -
    Number(row.totalSalidasSemana || 0) +
    Number(row.totalAjustesSemana || 0);
}

function ordenarMovimientosInventario(a, b) {
  if (a.fecha !== b.fecha) return String(a.fecha).localeCompare(String(b.fecha));

  if (String(a.hora || "") !== String(b.hora || "")) {
    return String(a.hora || "").localeCompare(String(b.hora || ""));
  }

  const orden = {
    ENTRADA: 1,
    SALIDA: 2,
    AJUINV: 3
  };

  return Number(orden[a.tipo] || 99) - Number(orden[b.tipo] || 99);
}

function aplicarMovimientoInventario(existenciaActual, mov) {
  if (mov.tipo === "ENTRADA") {
    return Number(existenciaActual || 0) + Number(mov.cantidad || 0);
  }

  if (mov.tipo === "SALIDA") {
    return Number(existenciaActual || 0) - Number(mov.cantidad || 0);
  }

  if (mov.tipo === "AJUINV") {
    return Number(existenciaActual || 0) + Number(mov.diferencia || mov.cantidad || 0);
  }

  return Number(existenciaActual || 0);
}

function construirPivot(
  detalleSemana,
  detalleAcumuladoAnterior,
  entradasSemana,
  entradasAcumuladoAnterior,
  ajustesSemana,
  ajustesAcumuladoAnterior,
  inicioSemana,
  finSemana
) {
  const mapa = new Map();

  fechasColumnas = crearFechasSemana(inicioSemana, finSemana);

  Object.keys(inventarioInicialOriginal).forEach((key) => {
    const inv = inventarioInicialOriginal[key];

    mapa.set(key, {
      codigo: inv.codigo,
      codigoKey: inv.codigoKey,
      nombre: inv.nombre,
      inviniOriginal: Number(inv.inviniOriginal || 0),
      entradasAcumuladasAnteriores: 0,
      salidasAcumuladasAnteriores: 0,
      ajustesAcumuladosAnteriores: 0,
      inviniSemana: Number(inv.inviniOriginal || 0),
      entradasPorFecha: {},
      salidasPorFecha: {},
      ajustesPorFecha: {},
      movimientosAnteriores: [],
      movimientosSemana: [],
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
      totalAjustesSemana: 0,
      existenciaFinalSemana: Number(inv.inviniOriginal || 0)
    });
  });

  // IMPORTANTE:
  // La tabla/pivot manda. El AJUINV NO sustituye la existencia.
  // Cada ajuste es una diferencia calculada: físico capturado - existencia actual calculada.
  // La existencia se reconstruye cronológicamente con entradas - salidas + ajustes.
  // Así el resultado final del día queda como base operativa para el día siguiente.

  entradasAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    if (!row.movimientosAnteriores) row.movimientosAnteriores = [];

    row.entradasAcumuladasAnteriores += Number(item.cantidad || 0);
    row.movimientosAnteriores.push({
      tipo: "ENTRADA",
      fecha: item.fecha,
      hora: item.hora || "00:00",
      cantidad: Number(item.cantidad || 0),
      item
    });
  });

  detalleAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    if (!row.movimientosAnteriores) row.movimientosAnteriores = [];

    row.salidasAcumuladasAnteriores += Number(item.cantidad || 0);
    row.movimientosAnteriores.push({
      tipo: "SALIDA",
      fecha: item.fecha,
      hora: item.hora || "00:00",
      cantidad: Number(item.cantidad || 0),
      item
    });
  });

  ajustesAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    if (!row.movimientosAnteriores) row.movimientosAnteriores = [];

    const diferencia = Number(item.diferencia || item.cantidad || 0);
    const existenciaFisica = Number(item.existencia_fisica || 0);
    const existenciaTeorica = Number(item.existencia_teorica || 0);

    row.ajustesAcumuladosAnteriores += diferencia;
    row.movimientosAnteriores.push({
      tipo: "AJUINV",
      fecha: item.fecha,
      hora: item.hora || "00:00",
      cantidad: diferencia,
      diferencia,
      existencia_fisica: existenciaFisica,
      existencia_teorica: existenciaTeorica,
      item
    });
  });

  mapa.forEach((row) => {
    let existencia = Number(row.inviniOriginal || 0);

    row.movimientosAnteriores = Array.isArray(row.movimientosAnteriores)
      ? row.movimientosAnteriores
      : [];

    row.movimientosAnteriores
      .sort(ordenarMovimientosInventario)
      .forEach((mov) => {
        existencia = aplicarMovimientoInventario(existencia, mov);
      });

    row.inviniSemana = existencia;
    row.existenciaFinalSemana = existencia;
    row.movimientosSemana = [];
  });

  entradasSemana.forEach((item) => {
    const row = asegurarRow(mapa, item);
    if (!row.movimientosSemana) row.movimientosSemana = [];

    row.entradasPorFecha[item.fecha] =
      Number(row.entradasPorFecha[item.fecha] || 0) + Number(item.cantidad || 0);

    row.totalEntradasSemana += Number(item.cantidad || 0);

    row.movimientosSemana.push({
      tipo: "ENTRADA",
      fecha: item.fecha,
      hora: item.hora || "00:00",
      cantidad: Number(item.cantidad || 0),
      item
    });
  });

  detalleSemana.forEach((item) => {
    const row = asegurarRow(mapa, item);
    if (!row.movimientosSemana) row.movimientosSemana = [];

    row.salidasPorFecha[item.fecha] =
      Number(row.salidasPorFecha[item.fecha] || 0) + Number(item.cantidad || 0);

    row.totalSalidasSemana += Number(item.cantidad || 0);

    row.movimientosSemana.push({
      tipo: "SALIDA",
      fecha: item.fecha,
      hora: item.hora || "00:00",
      cantidad: Number(item.cantidad || 0),
      item
    });
  });

  ajustesSemana.forEach((item) => {
    const row = asegurarRow(mapa, item);
    if (!row.movimientosSemana) row.movimientosSemana = [];

    const diferencia = Number(item.diferencia || item.cantidad || 0);
    const existenciaFisica = Number(item.existencia_fisica || 0);
    const existenciaTeorica = Number(item.existencia_teorica || 0);

    row.ajustesPorFecha[item.fecha] =
      Number(row.ajustesPorFecha[item.fecha] || 0) + diferencia;

    row.totalAjustesSemana += diferencia;

    row.movimientosSemana.push({
      tipo: "AJUINV",
      fecha: item.fecha,
      hora: item.hora || "00:00",
      cantidad: diferencia,
      diferencia,
      existencia_fisica: existenciaFisica,
      existencia_teorica: existenciaTeorica,
      item
    });
  });

  mapa.forEach((row) => {
    let existencia = Number(row.inviniSemana || 0);

    row.movimientosSemana = Array.isArray(row.movimientosSemana)
      ? row.movimientosSemana
      : [];

    row.movimientosSemana
      .sort(ordenarMovimientosInventario)
      .forEach((mov) => {
        existencia = aplicarMovimientoInventario(existencia, mov);
      });

    row.existenciaFinalSemana = existencia;
  });

  registrosPivot = Array.from(mapa.values())
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

function actualizarResumenSuperior(totalDocsSemana, totalDocsEntradasSemana, totalDocsAjustesSemana) {
  const totalCantidadSalidasSemana = registrosDetalleSemana.reduce(
    (sum, x) => sum + Number(x.cantidad || 0),
    0
  );

  const totalCantidadEntradasSemana = registrosEntradasSemana.reduce(
    (sum, x) => sum + Number(x.cantidad || 0),
    0
  );

  const totalCantidadAjustesSemana = registrosAjustesSemana.reduce(
    (sum, x) => sum + Number(x.diferencia || x.cantidad || 0),
    0
  );

  if ($("totalDocs")) {
    $("totalDocs").textContent =
      Number(totalDocsSemana || 0) +
      Number(totalDocsEntradasSemana || 0) +
      Number(totalDocsAjustesSemana || 0);
  }

  if ($("totalPartidas")) {
    $("totalPartidas").textContent = registrosDetalleMovimientoSemana.length;
  }

  if ($("totalCantidad")) {
    $("totalCantidad").textContent =
      `E ${fmtNum(totalCantidadEntradasSemana)} / S ${fmtNum(totalCantidadSalidasSemana)} / AJU ${fmtNum(totalCantidadAjustesSemana)}`;
  }

  if ($("totalCodigos")) $("totalCodigos").textContent = registrosPivot.length;
}

function getFiltroBusqueda() {
  return String($("busqueda")?.value || "").trim().toLowerCase();
}

function pasaFiltroPivot(item) {
  const q = getFiltroBusqueda();
  if (!q) return true;
  return [item.codigo, item.codigoKey, item.nombre, item.descripcion]
    .some(v => String(v || "").toLowerCase().includes(q));
}

function pasaFiltroDetalle(item) {
  const q = getFiltroBusqueda();
  if (!q) return true;
  return [item.codigo, item.codigoKey, item.nombre, item.descripcion]
    .some(v => String(v || "").toLowerCase().includes(q));
}


// ============================================================
// SCROLL HORIZONTAL AUXILIAR DEL PIVOT
// Permite desplazarse izquierda/derecha sin bajar al final.
// Se crea dinámicamente para no requerir cambios en index.html.
// ============================================================
function asegurarScrollHorizontalPivot() {
  const tableWrap = document.querySelector(".card > .table-wrap");
  const tabla = $("tabla");
  if (!tableWrap || !tabla) return null;

  let barra = document.getElementById("pivotScrollHorizontal");
  if (!barra) {
    barra = document.createElement("div");
    barra.id = "pivotScrollHorizontal";
    barra.className = "pivot-scroll-horizontal";
    barra.innerHTML = '<div class="pivot-scroll-horizontal-inner"></div>';
    document.body.appendChild(barra);

    let sincronizando = false;

    barra.addEventListener("scroll", () => {
      if (sincronizando) return;
      sincronizando = true;
      tableWrap.scrollLeft = barra.scrollLeft;
      sincronizando = false;
    });

    tableWrap.addEventListener("scroll", () => {
      if (sincronizando) return;
      sincronizando = true;
      barra.scrollLeft = tableWrap.scrollLeft;
      sincronizando = false;
    });

    window.addEventListener("resize", actualizarScrollHorizontalPivot);
  }

  return barra;
}

function actualizarScrollHorizontalPivot() {
  const tableWrap = document.querySelector(".card > .table-wrap");
  const tabla = $("tabla");
  const barra = asegurarScrollHorizontalPivot();
  if (!tableWrap || !tabla || !barra) return;

  const card = document.querySelector(".card");
  const ocultar =
    !card ||
    card.classList.contains("modo-inventarios") ||
    card.classList.contains("modo-entradas-zapata") ||
    card.classList.contains("modo-ajustes-inventario") ||
    card.classList.contains("modo-resumen-listas") ||
    tabla.scrollWidth <= tableWrap.clientWidth + 2;

  barra.classList.toggle("oculto-scroll-pivot", ocultar);

  const inner = barra.querySelector(".pivot-scroll-horizontal-inner");
  if (inner) inner.style.width = `${tabla.scrollWidth}px`;

  if (!ocultar) barra.scrollLeft = tableWrap.scrollLeft;
}

function pintarTabla() {
  if (vistaActual === "detalle") {
    pintarDetalle();
  } else if (vistaActual === "listado_proveedor") {
    pintarListadoResumenProveedor();
  } else {
    pintarPivotPorSemana();
  }
}

function pintarPivotPorSemana() {
  const tabla = $("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  const rows = registrosPivot.filter(pasaFiltroPivot);

  const fechasConEntrada = fechasColumnas.filter(f =>
    registrosEntradasSemana.some(x => x.fecha === f)
  );

  const fechasConAjuste = fechasColumnas.filter(f =>
    registrosAjustesSemana.some(x => x.fecha === f)
  );

  thead.innerHTML = `
    <tr>
      <th class="left pivot-fija-codigo">Código</th>
      <th class="left pivot-fija-nombre">Nombre</th>
      <th>INVINI<br>SEMANA</th>

      ${fechasColumnas.map(f => {
        const proveedor = obtenerProveedoresEntradaPorFecha(f);
        const foliosAjuste = obtenerFoliosAjustePorFecha(f);
        const tieneEntrada = fechasConEntrada.includes(f);
        const tieneAjuste = fechasConAjuste.includes(f);

        return `
          ${
            tieneEntrada
              ? `<th class="entrada-head">
                  ${fechaCorta(f)}<br>
                  ENTRADA<br>
                  <small>${escapeHtml(proveedor)}</small>
                </th>`
              : ""
          }

          <th class="salida-head">
            ${fechaCorta(f)}<br>
            SALIDA
          </th>

          ${
            tieneAjuste
? `<th class="ajuste-head">
    ${fechaCorta(f)}<br>
    AJUINV
  </th>`
              : ""
          }
        `;
      }).join("")}

      <th>EXISTENCIA<br>FINAL</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="left codigo pivot-fija-codigo">${escapeHtml(r.codigo)}</td>
      <td class="left pivot-fija-nombre">${escapeHtml(r.nombre)}</td>
      <td class="cantidad ${Number(r.inviniSemana || 0) < 0 ? "inventario-negativo" : ""}">${fmtNum(r.inviniSemana)}</td>

      ${fechasColumnas.map(f => {
        const entrada = Number(r.entradasPorFecha[f] || 0);
        const salida = Number(r.salidasPorFecha[f] || 0);
        const ajuste = Number(r.ajustesPorFecha[f] || 0);
        const tieneAjusteFisico = ajuste !== 0;
        const tieneEntrada = fechasConEntrada.includes(f);
        const tieneAjuste = fechasConAjuste.includes(f);

        return `
          ${
            tieneEntrada
              ? `<td class="entrada-col ${entrada ? "cantidad" : ""}">
                  ${fmtCelda(entrada)}
                </td>`
              : ""
          }

          <td class="salida-col ${salida ? "cantidad" : ""}">
            ${fmtCelda(salida)}
          </td>

${
  tieneAjuste
    ? `<td class="ajuste-col ${ajuste ? "cantidad ajuinv-parpadeo" : ""}">
        ${fmtCelda(ajuste)}
      </td>`
    : ""
}
        `;
      }).join("")}

      <td class="cantidad ${Number(r.existenciaFinalSemana || 0) < 0 ? "inventario-negativo" : ""}">${fmtNum(r.existenciaFinalSemana)}</td>
    </tr>
  `).join("");

  // El pivot principal no necesita fila de totales inferior.
  // Se deja el <tfoot> vacío para ganar espacio vertical.
  tfoot.innerHTML = "";

  // Actualiza la barra horizontal auxiliar después de reconstruir la tabla.
  requestAnimationFrame(actualizarScrollHorizontalPivot);
}

function pintarDetalle() {
  const tabla = $("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  const rows = registrosDetalleMovimientoSemana.filter(pasaFiltroDetalle);

  const totalEntradas = rows
    .filter(x => x.tipo === "ENTRADA")
    .reduce((sum, x) => sum + Number(x.cantidad || 0), 0);

  const totalSalidas = rows
    .filter(x => x.tipo === "SALIDA")
    .reduce((sum, x) => sum + Number(x.cantidad || 0), 0);

  const totalAjustes = rows
    .filter(x => x.tipo === "AJUINV")
    .reduce((sum, x) => sum + Number(x.diferencia || x.cantidad || 0), 0);

  thead.innerHTML = `
    <tr>
      <th>Tipo</th>
      <th>Fecha</th>
      <th>Hora</th>
      <th class="left">Folio</th>
      <th class="left">Destino / Proveedor</th>
      <th class="left">Entrega / Emisor</th>
      <th class="left">Recibe / Usuario</th>
      <th>Partida</th>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>Cantidad / Diferencia</th>
      <th>Teórica</th>
      <th>Física</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.tipo)}</td>
      <td>${escapeHtml(r.fecha)}</td>
      <td>${escapeHtml(r.hora || "")}</td>
      <td class="left">${escapeHtml(r.folio)}</td>
      <td class="left">${escapeHtml(r.destino)}</td>
      <td class="left">${escapeHtml(r.entrega)}</td>
      <td class="left">${escapeHtml(r.recibe)}</td>
      <td>${escapeHtml(r.partida)}</td>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad">${fmtNum(r.tipo === "AJUINV" ? r.diferencia : r.cantidad)}</td>
      <td class="cantidad">${r.tipo === "AJUINV" ? fmtNum(r.existencia_teorica) : ""}</td>
      <td class="cantidad">${r.tipo === "AJUINV" ? fmtNum(r.existencia_fisica) : ""}</td>
    </tr>
  `).join("");

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="12">TOTAL ENTRADAS SEMANA</td>
      <td>${fmtNum(totalEntradas)}</td>
    </tr>
    <tr>
      <td class="left" colspan="12">TOTAL SALIDAS SEMANA</td>
      <td>${fmtNum(totalSalidas)}</td>
    </tr>
    <tr>
      <td class="left" colspan="12">TOTAL AJUINV SEMANA</td>
      <td>${fmtNum(totalAjustes)}</td>
    </tr>
  `;
}

function exportarExcel() {
  let rows;

  if (vistaActual === "listado_proveedor") {
    const id = $("selectorListadoResumen")?.value || "";
    const listado = obtenerListadoPorId(id);
    const codigos = new Set((listado?.articulos || []).map((a) => normalizarCodigo(a.codigoKey || a.codigo)));

    rows = registrosPivot
      .filter((r) => codigos.has(normalizarCodigo(r.codigoKey || r.codigo)))
      .filter(pasaFiltroPivot)
      .map((r) => ({
        Codigo: r.codigo,
        Nombre: repararTexto(r.nombre),
        Inventario_Teorico_Final: Number(r.existenciaFinalSemana || 0)
      }));
  } else if (vistaActual === "detalle") {
    rows = registrosDetalleMovimientoSemana.filter(pasaFiltroDetalle).map((r) => ({
      Tipo: r.tipo,
      Fecha: r.fecha,
      Hora: r.hora || "",
      Folio: r.folio,
      Destino_Proveedor: r.destino,
      Entrega_Emisor: r.entrega,
      Recibe_Usuario: r.recibe,
      RFC_Emisor: r.rfc_emisor,
      Razon_Social_Emisor: r.razon_social_emisor,
      Alias_Pivot: r.alias_pivot,
      Partida: r.partida,
      Codigo: r.codigo,
      Nombre: repararTexto(r.nombre),
      Cantidad_Diferencia: r.tipo === "AJUINV" ? Number(r.diferencia || 0) : Number(r.cantidad || 0),
      Existencia_Teorica: r.tipo === "AJUINV" ? Number(r.existencia_teorica || 0) : "",
      Existencia_Fisica: r.tipo === "AJUINV" ? Number(r.existencia_fisica || 0) : ""
    }));
  } else {
    rows = registrosPivot.filter(pasaFiltroPivot).map((r) => {
      const obj = {
        Codigo: r.codigo,
        Nombre: repararTexto(r.nombre),
        "INVINI SEMANA": Number(r.inviniSemana || 0)
      };

      fechasColumnas.forEach((f) => {
        obj[`ENTRADA ${fechaCorta(f)}`] = Number(r.entradasPorFecha[f] || 0);
        obj[`SALIDA ${fechaCorta(f)}`] = Number(r.salidasPorFecha[f] || 0);
        obj[`AJUINV ${fechaCorta(f)}`] = Number(r.ajustesPorFecha[f] || 0);
      });

      obj["TOTAL ENTRADAS"] = Number(r.totalEntradasSemana || 0);
      obj["TOTAL SALIDAS"] = Number(r.totalSalidasSemana || 0);
      obj["TOTAL AJUINV"] = Number(r.totalAjustesSemana || 0);
      obj["EXISTENCIA FINAL"] = Number(r.existenciaFinalSemana || 0);

      return obj;
    });
  }

  if (!rows.length) {
    alert("No hay datos para exportar.");
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(
    wb,
    ws,
    vistaActual === "detalle" ? "Detalle semana" : vistaActual === "listado_proveedor" ? "Listado proveedor" : "Pivot semana"
  );

  XLSX.writeFile(
    wb,
    `movimientos_liquidos_${vistaActual}_${rangoSemanaActual.inicio}_a_${rangoSemanaActual.fin}.xlsx`
  );
}

function cambiarVista(vista) {
  vistaActual = vista;

  $("tabResumen").classList.toggle("active", vista === "resumen");
  $("tabDetalle").classList.toggle("active", vista === "detalle");

  pintarTabla();
}

function crearSelectorSemanaSiNoExiste() {
  if ($("selectorSemana")) return;

  const actions = document.querySelector(".actions");
  if (!actions) return;

  const label = document.createElement("label");
  label.innerHTML = `
    Semana
    <input id="selectorSemana" type="week" />
  `;

  actions.insertBefore(label, actions.firstChild);
}


function mostrarPanelAjustesInventario() {
  const rango = obtenerRangoSemana();
  const fechaAjuste = $("ajuFechaMovimiento");
  if (fechaAjuste) {
    fechaAjuste.min = FECHA_INICIO_MINIMA;
    fechaAjuste.max = rango.fin;
    const hoy = hoyISO();
    const fechaSugerida = hoy >= rango.inicio && hoy <= rango.fin ? hoy : rango.fin;
    if (!fechaAjuste.value || fechaAjuste.value < FECHA_INICIO_MINIMA || fechaAjuste.value > rango.fin) {
      fechaAjuste.value = fechaSugerida;
    }
  }

  document.querySelector(".card")?.classList.add("modo-ajustes-inventario");
  $("panelAjustesInventario")?.classList.remove("oculto");
}

function ocultarPanelAjustesInventario() {
  document.querySelector(".card")?.classList.remove("modo-ajustes-inventario");
  $("panelAjustesInventario")?.classList.add("oculto");
}

function obtenerArticulosParaAjuste() {
  return registrosPivot.map(r => ({
    codigo: r.codigo,
    codigoKey: r.codigoKey || normalizarCodigo(r.codigo),
    nombre: r.nombre,
    existenciaFinalSemana: r.existenciaFinalSemana
  }));
}

function movimientoEsAntesOIgual(mov, fecha, hora) {
  const f = String(mov.fecha || "");
  const h = String(mov.hora || "00:00").substring(0, 5) || "00:00";
  const horaCorte = String(hora || "23:59").substring(0, 5) || "23:59";

  if (f < fecha) return true;
  if (f > fecha) return false;
  return h <= horaCorte;
}

function calcularExistenciaTeoricaParaAjuste(codigoKey, fecha, hora) {
  const key = normalizarCodigo(codigoKey);

  const inv = inventarioInicialOriginal[key] || {};
  let existencia = Number(inv.inviniOriginal || 0);

  const movimientos = [
    ...registrosEntradasAcumuladoAnterior,
    ...registrosDetalleAcumuladoAnterior,
    ...registrosAjustesAcumuladoAnterior,
    ...registrosEntradasSemana,
    ...registrosDetalleSemana,
    ...registrosAjustesSemana
  ]
    .filter(x => normalizarCodigo(x.codigoKey || x.codigo) === key)
    .filter(x => movimientoEsAntesOIgual(x, fecha, hora))
    .map(x => ({
      tipo: x.tipo,
      fecha: x.fecha,
      hora: x.hora || "00:00",
      cantidad: Number(x.cantidad || x.diferencia || 0),
      diferencia: Number(x.diferencia || x.cantidad || 0),
      existencia_fisica: Number(x.existencia_fisica || 0)
    }))
    .sort(ordenarMovimientosInventario);

  movimientos.forEach(mov => {
    existencia = aplicarMovimientoInventario(existencia, mov);
  });

  return existencia;
}

function mostrarPanelEntradasZapata() {
  document.querySelector(".card")?.classList.add("modo-entradas-zapata");
  $("panelEntradasZapata")?.classList.remove("oculto");
}

function ocultarPanelEntradasZapata() {
  document.querySelector(".card")?.classList.remove("modo-entradas-zapata");
  $("panelEntradasZapata")?.classList.add("oculto");
}

function cerrarMenuMas() {
  const menu = $("menuMas");
  if (menu?.open) menu.open = false;
}

function inicializarEventos() {
  crearSelectorSemanaSiNoExiste();

  if ($("selectorSemana")) {
    $("selectorSemana").min = SEMANA_MINIMA;
    $("selectorSemana").value = obtenerSemanaActualInput() < SEMANA_MINIMA
      ? SEMANA_MINIMA
      : obtenerSemanaActualInput();

    $("selectorSemana").addEventListener("change", async (event) => {
      if (!event.target.value || event.target.value < SEMANA_MINIMA) {
        event.target.value = SEMANA_MINIMA;
        alert("El punto cero inicia el 01/08/2026. No se permiten semanas anteriores.");
      }
      await cargarSalidasZapata();
    });
  }

  if ($("fechaInicio")) {
    $("fechaInicio").min = FECHA_INICIO_MINIMA;
    $("fechaInicio").value = FECHA_INICIO_MINIMA;
    $("fechaInicio").readOnly = true;
  }

  if ($("fechaFin")) {
    $("fechaFin").value = hoyISO();
    $("fechaFin").readOnly = true;
  }

  $("btnRecargar").addEventListener("click", async () => { cerrarMenuMas(); await cargarSalidasZapata(true); });
  $("btnExportar").addEventListener("click", () => { cerrarMenuMas(); exportarExcel(); });
  $("busqueda").addEventListener("input", pintarTabla);

  $("tabResumen").textContent = "Pivot semanal";
  $("tabResumen").addEventListener("click", () => { cambiarVista("resumen"); cerrarMenuMas(); });

  $("tabDetalle").textContent = "Detalle semana";
  $("tabDetalle").addEventListener("click", () => { cambiarVista("detalle"); cerrarMenuMas(); });

  if ($("btnVerEntradas")) {
    $("btnVerEntradas").disabled = false;
    $("btnVerEntradas").title = "Revisar, enlazar y autorizar entradas por factura";
    $("btnVerEntradas").addEventListener("click", async () => {
      cerrarMenuMas();
      mostrarPanelEntradasZapata();
      try {
        await iniciarModuloEntradasZapata({
          onEntradaGenerada: aplicarEntradaGeneradaLocal
        });
      } catch (error) {
        console.error("Error al abrir Entradas de Líquidos:", error);
        setStatus(`Error al abrir Entradas: ${error?.message || error}`);
      }
    });
  }

  $("btnVerAjustesInventario")?.addEventListener("click", () => {
    cerrarMenuMas();
    mostrarPanelAjustesInventario();
  });

  $("btnCerrarAjustesInventario")?.addEventListener("click", async () => {
    ocultarPanelAjustesInventario();
    await cargarSalidasZapata();
  });

  $("btnCerrarEntradasZapata")?.addEventListener("click", async () => {
    ocultarPanelEntradasZapata();
    await cargarSalidasZapata();
  });

  $("btnVerResumenListas")?.addEventListener("click", async () => {
    cerrarMenuMas();
    mostrarPanelResumenListas();
    await cargarListasResumen();
  });

  $("btnCerrarResumenListas")?.addEventListener("click", ocultarPanelResumenListas);
  $("btnNuevaListaResumen")?.addEventListener("click", () => abrirConfigListaResumen(""));
  $("btnVolverListasResumen")?.addEventListener("click", () => {
    pintarTarjetasListasResumen();
    cambiarSubvistaResumenListas("menu");
  });
  $("btnCancelarConfigListaResumen")?.addEventListener("click", () => {
    if (listaResumenActualId && obtenerListaResumenPorId(listaResumenActualId)) abrirListaResumen(listaResumenActualId);
    else cambiarSubvistaResumenListas("menu");
  });
  $("btnEditarListaResumenActual")?.addEventListener("click", () => abrirConfigListaResumen(listaResumenActualId));
  $("btnGuardarListaResumen")?.addEventListener("click", async () => {
    try { await guardarListaResumenActual(); }
    catch (error) { console.error(error); alert(`No se pudo guardar la lista: ${error?.message || error}`); }
  });
  $("btnEliminarListaResumen")?.addEventListener("click", async () => {
    try { await eliminarListaResumenActual(); }
    catch (error) { console.error(error); alert(`No se pudo eliminar la lista: ${error?.message || error}`); }
  });
  $("buscarArticuloResumen")?.addEventListener("input", pintarResultadosArticuloResumen);
  $("selectorSemanaResumen")?.addEventListener("change", async (event) => {
    let valor = event.target.value;
    if (!valor || valor < SEMANA_MINIMA) {
      valor = SEMANA_MINIMA;
      event.target.value = valor;
      alert("El punto cero inicia el 01/08/2026. No se permiten semanas anteriores.");
    }
    if ($("selectorSemana")) $("selectorSemana").value = valor;
    await cargarSalidasZapata();
    pintarVistaListaResumen();
  });

  $("btnMenuInicio")?.addEventListener("click", () => {
    cerrarMenuMas();
    abrirConfigMenuInicio();
  });
  $("btnCerrarConfigMenuInicio")?.addEventListener("click", cerrarConfigMenuInicio);
  $("btnCancelarConfigMenuInicio")?.addEventListener("click", cerrarConfigMenuInicio);
  $("buscarArticuloMenuInicio")?.addEventListener("input", pintarResultadosMenuInicio);
  $("btnGuardarMenuInicio")?.addEventListener("click", async () => {
    try { await guardarMenuInicio(); }
    catch (error) { console.error(error); alert(`No se pudo guardar MENUINICIO: ${error?.message || error}`); }
  });
  $("btnCerrarRevisionMenuInicio")?.addEventListener("click", terminarRevisionMenuInicio);
  $("btnCancelarRevisionMenuInicio")?.addEventListener("click", terminarRevisionMenuInicio);
  $("btnSiguienteRevisionMenuInicio")?.addEventListener("click", siguienteRevisionMenuInicio);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (revisionMenuInicioActiva) {
      event.preventDefault();
      terminarRevisionMenuInicio();
    } else if (!$("modalConfigMenuInicio")?.classList.contains("oculto")) {
      cerrarConfigMenuInicio();
    }
  });

  $("btnVerInventarios")?.addEventListener("click", async () => {
    cerrarMenuMas();
    document.querySelector(".card")?.classList.add("modo-inventarios");
    $("panelInventarios")?.classList.remove("oculto");
    cambiarSubvistaInventarios("menu");
    await cargarListadosResumenProveedor();
  });

  $("btnCerrarInventarios")?.addEventListener("click", () => {
    document.querySelector(".card")?.classList.remove("modo-inventarios");
    $("panelInventarios")?.classList.add("oculto");
    $("contenedorTablaListadoResumen")?.classList.add("oculto");
    cambiarSubvistaInventarios("menu");
    cambiarVista("resumen");
  });

  $("btnIrVerListadosResumen")?.addEventListener("click", () => {
    cambiarSubvistaInventarios("resumen");
  });

  $("btnIrConfigurarListados")?.addEventListener("click", () => {
    cambiarSubvistaInventarios("config");
    cargarListadoConfig($("selectorListadoConfig")?.value || "");
  });

  $("btnVolverMenuInventarios1")?.addEventListener("click", () => cambiarSubvistaInventarios("menu"));
  $("btnVolverMenuInventarios2")?.addEventListener("click", () => cambiarSubvistaInventarios("menu"));

  $("btnCargarListadoResumen")?.addEventListener("click", pintarListadoResumenProveedor);
  $("btnImprimirListadoResumen")?.addEventListener("click", () => {
    imprimirListaConteo(obtenerListadoPorId($("selectorListadoResumen")?.value || ""));
  });

  $("selectorListadoResumen")?.addEventListener("change", pintarListadoResumenProveedor);
  $("selectorListadoConfig")?.addEventListener("change", (e) => cargarListadoConfig(e.target.value));

  $("btnNuevoListadoProveedor")?.addEventListener("click", () => {
    listadoConfigActual = null;
    articulosConfigActual = [];
    if ($("selectorListadoConfig")) $("selectorListadoConfig").value = "";
    if ($("nombreListadoProveedor")) $("nombreListadoProveedor").value = "";
    if ($("buscarArticuloListado")) $("buscarArticuloListado").value = "";
    pintarArticulosConfigActual();
    pintarResultadosBusquedaListado();
  });

  $("btnGuardarListadoProveedor")?.addEventListener("click", guardarListadoProveedor);
  $("btnEliminarListadoProveedor")?.addEventListener("click", eliminarListadoProveedor);
  $("btnImprimirListadoConfig")?.addEventListener("click", () => {
    const listaTemporal = {
      id: listadoConfigActual?.id || "TEMPORAL",
      nombre: String($("nombreListadoProveedor")?.value || "LISTA SIN GUARDAR").trim().toUpperCase(),
      articulos: articulosConfigActual
    };
    imprimirListaConteo(listaTemporal);
  });
  $("btnSeleccionarVisiblesListado")?.addEventListener("click", seleccionarArticulosVisiblesListado);
  $("btnLimpiarSeleccionListado")?.addEventListener("click", limpiarSeleccionListado);
  $("buscarArticuloListado")?.addEventListener("input", pintarResultadosBusquedaListado);

  $("btnCodigosBloqueados")?.addEventListener("click", abrirCodigosBloqueadosAdmin);
  $("btnCerrarCodigosBloqueados")?.addEventListener("click", cerrarCodigosBloqueadosAdmin);
  $("btnCancelarCodigosBloqueados")?.addEventListener("click", cerrarCodigosBloqueadosAdmin);
  $("btnAgregarCodigoBloqueado")?.addEventListener("click", agregarCodigoBloqueado);
  $("nuevoCodigoBloqueado")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      agregarCodigoBloqueado();
    }
  });

  pintarArticulosConfigActual();
}


function entradaGeneradaADetalleMovimientos(entrada) {
  if (!entrada) return [];

  const fecha = normalizarFecha(
    entrada.fecha ||
    entrada.fecha_factura ||
    entrada.creado_en ||
    entrada.timestamp ||
    ""
  );

  if (!fecha || fecha < FECHA_INICIO_MINIMA) return [];

  const rfcEmisor = String(entrada.rfc_emisor || "").trim().toUpperCase();
  const razonSocialEmisor = String(entrada.razon_social_emisor || "").trim();
  const aliasPivot = obtenerAliasProveedorPivot(rfcEmisor, razonSocialEmisor);
  const articulos = normalizarListaArticulos(entrada);
  const docId = String(entrada.uuid_cfdi || entrada.id || entrada.folioEntrada || "").trim();

  return articulos.map((art, idx) => {
    const codigoOriginal = String(art.codigo_interno || "").trim();
    const codigoKey = normalizarCodigo(codigoOriginal);
    const nombre = String(art.descripcion_interna || art.descripcion_factura || "").trim();
    const cantidad = Number(art.cantidad_entrada || 0);

    if (!codigoKey && !nombre && !cantidad) return null;

    return {
      tipo: "ENTRADA",
      docId,
      partida: idx + 1,
      folio: String(entrada.folioEntrada || entrada.folio || docId || "").trim(),
      fecha,
      destino: "ALMACÉN DE LÍQUIDOS",
      entrega: aliasPivot,
      recibe: String(entrada.usuario || "").trim(),
      folioCincho: "",
      proveedor: aliasPivot,
      rfc_emisor: rfcEmisor,
      razon_social_emisor: razonSocialEmisor,
      alias_pivot: aliasPivot,
      codigo: codigoOriginal,
      codigoKey,
      nombre,
      cantidad
    };
  }).filter(Boolean);
}

function aplicarEntradaGeneradaLocal(entrada) {
  const rango = obtenerRangoSemana();
  const detalleEntrada = entradaGeneradaADetalleMovimientos(entrada);

  if (!detalleEntrada.length) {
    setStatus("Entrada registrada. No afectó la semana visible.");
    return;
  }

  const fechaEntrada = detalleEntrada[0].fecha;

  if (fechaEntrada >= rango.inicio && fechaEntrada <= rango.fin) {
    const docId = detalleEntrada[0].docId;
    registrosEntradasSemana = registrosEntradasSemana.filter(x => x.docId !== docId);
    registrosDetalleMovimientoSemana = registrosDetalleMovimientoSemana.filter(x => x.docId !== docId);

    registrosEntradasSemana.push(...detalleEntrada);
    registrosDetalleMovimientoSemana = [
      ...registrosEntradasSemana,
      ...registrosDetalleSemana,
      ...registrosAjustesSemana
    ].sort((a, b) => {
      if (a.fecha !== b.fecha) return String(b.fecha).localeCompare(String(a.fecha));
      if (String(a.hora || "") !== String(b.hora || "")) {
        return String(b.hora || "").localeCompare(String(a.hora || ""));
      }
      return String(a.tipo).localeCompare(String(b.tipo));
    });
  } else if (fechaEntrada >= FECHA_BASE_INVENTARIO && fechaEntrada <= rango.acumuladoAnteriorFin) {
    const docId = detalleEntrada[0].docId;
    registrosEntradasAcumuladoAnterior = registrosEntradasAcumuladoAnterior.filter(x => x.docId !== docId);
    registrosEntradasAcumuladoAnterior.push(...detalleEntrada);
  } else {
    setStatus("Entrada registrada. La semana visible no cambió.");
    return;
  }

  construirPivot(
    registrosDetalleSemana,
    registrosDetalleAcumuladoAnterior,
    registrosEntradasSemana,
    registrosEntradasAcumuladoAnterior,
    registrosAjustesSemana,
    registrosAjustesAcumuladoAnterior,
    rango.inicio,
    rango.fin
  );

  pintarTabla();
  actualizarResumenSuperior(
    new Set(registrosDetalleSemana.map(x => x.docId)).size,
    new Set(registrosEntradasSemana.map(x => x.docId)).size,
    new Set(registrosAjustesSemana.map(x => x.docId)).size
  );

  setStatus("Entrada registrada y tabla actualizada en memoria local, sin recargar Firestore completo.");
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarEventos();
  iniciarEscuchaCodigosBloqueados();
  await cargarSalidasZapata();
  await cargarListadosResumenProveedor();
  await cargarListasResumen();
  await cargarMenuInicioConfig();

  cargaInicialEnProceso = false;
  ocultarLoader(true);

  // Arranque responsive:
  // - CELULAR: abre directamente el panel completo del menu de tres puntos (⋮).
  // - PC: conserva el comportamiento anterior de MENUINICIO.
  const esCelular = window.matchMedia("(max-width: 760px)").matches;
  if (esCelular) {
    const menuMas = $("menuMas");
    if (menuMas) menuMas.open = true;
  } else {
    iniciarRevisionMenuInicio();
  }

  iniciarModuloAjustesInventarioZapata({
    obtenerArticulos: obtenerArticulosParaAjuste,
    calcularExistenciaTeorica: calcularExistenciaTeoricaParaAjuste,
    onAjusteGuardado: async () => {
      // Un ajuste es poco frecuente: aquí sí hacemos una lectura limpia para cuadrar
      // inmediatamente contra la fuente real de Firestore.
      await cargarSalidasZapata(true);
    }
  });
});