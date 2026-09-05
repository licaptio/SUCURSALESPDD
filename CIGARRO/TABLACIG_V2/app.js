import { iniciarModuloEntradasCigarro } from "./entradasModulo.js";
import { iniciarModuloAjustesInventarioCigarro } from "./ajustesModulo.js";
import { iniciarModuloCigman } from "./cigmanModulo.js";
import { db } from "./config.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  crearKeySemana,
  leerCacheSemana,
  guardarCacheSemana,
  limpiarCacheInventario,
  guardarCalculoInventario,
  leerCalculoInventario,
  invalidarCacheDesdeMovimiento,
  leerMetaSync,
  guardarMetaSync
} from "./modulos/cacheInventario.js";

const FECHA_BASE_INVENTARIO = "2026-06-23";
const FECHA_INICIO_MINIMA = "2026-06-23";
const CONTEO_ID_INVENTARIO = "CIGARRO230626";
const ID_INVENTARIO_INICIAL = "2026-06-23";
const ALMACEN_ID = "almacen_cigarro";
const SEMANA_MINIMA_INVENTARIO = "2026-W26";
const CACHE_VERSION_INVENTARIO = "cig-v15-sync-incremental-salidas";

const REF_SALIDAS_CIGARRO = collection(
  db,
  "almacenes",
  "almacen_cigarro",
  "salidas1.0"
);

const REF_ENTRADAS_CIGARRO = collection(
  db,
  "almacenes",
  "almacen_cigarro",
  "entradas"
);

const REF_CIGMAN_CIGARRO = collection(
  db,
  "almacenes",
  "almacen_cigarro",
  "cigarrosincargo"
);

const REF_AJUSTES_INVENTARIO_CIGARRO = collection(
  db,
  "almacenes",
  "almacen_cigarro",
  "ajustes"
);

const REF_INVENTARIO_INICIAL_CIGARRO = collection(
  db,
  "almacenes",
  "almacen_cigarro",
  "inventarioinicial",
  ID_INVENTARIO_INICIAL,
  "productos"
);

const REF_PROVEEDORES_AUTORIZADOS_CIGARRO = collection(
  db,
  "almacenes",
  "almacen_cigarro",
  "configuracion",
  "proveedores_autorizados",
  "items"
);

const REF_LISTADOS_RESUMEN_PROVEEDOR = collection(
  db,
  "almacenes",
  "almacen_cigarro",
  "configuracion",
  "listados_resumen_proveedor",
  "items"
);

const REF_USUARIOS_INVENTARIO = collection(
  db,
  "almacenes",
  "almacen_cigarro",
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

let registrosCigmanSemana = [];
let registrosCigmanAcumuladoAnterior = [];

let registrosDetalleMovimientoSemana = [];
let registrosPivot = [];
let fechasColumnas = [];

let inventarioInicialOriginal = {};
let proveedoresAutorizadosPivot = {};
let vistaActual = "resumen";
let loaderInicioMs = performance.now();
let loaderTimerInterval = null;
let listadosResumenProveedor = [];
let listadoConfigActual = null;
let articulosConfigActual = [];

let rangoSemanaActual = {
  inicio: FECHA_BASE_INVENTARIO,
  fin: FECHA_BASE_INVENTARIO,
  acumuladoAnteriorFin: ""
};

// V15: sincronización incremental en tiempo real.
// SALIDAS y AJUSTES: nuevos/modificados por actualizado_en.
// ENTRADAS y CIGMAN: nuevos por creado_en (hasta que sus apps también escriban actualizado_en).
// Los documentos históricos siguen disponibles desde la carga inicial/IndexedDB;
// el listener solo trae novedades, evitando releer colecciones completas.
let realtimeUnsubs = [];
let realtimeQueue = Promise.resolve();
const SOLAPE_SYNC_MS = 5 * 60 * 1000;

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

    // Soporta fechas como:
    // 27/6/2026, 2:06:49 p.m.
    // 27/06/2026
    // 2026-06-27
    const mDMY = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mDMY) {
      const [, d, m, yyyy] = mDMY;
      const dd = String(d).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }

    const mISO = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (mISO) {
      const [, yyyy, m, d] = mISO;
      const dd = String(d).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
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

function escapeHtml(text) {
  return String(text ?? "")
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

function actualizarLoaderTimer() {
  const el = $("loaderTimer");
  if (!el) return;
  const transcurrido = Math.max(0, performance.now() - loaderInicioMs);
  const minutos = Math.floor(transcurrido / 60000);
  const segundos = Math.floor((transcurrido % 60000) / 1000);
  const decima = Math.floor((transcurrido % 1000) / 100);
  el.textContent = `${String(minutos).padStart(2,"0")}:${String(segundos).padStart(2,"0")}.${decima}`;
}

function iniciarLoaderTimer() {
  loaderInicioMs = performance.now();
  actualizarLoaderTimer();
  clearInterval(loaderTimerInterval);
  loaderTimerInterval = setInterval(actualizarLoaderTimer, 100);
}

function ocultarLoader() {
  actualizarLoaderTimer();
  clearInterval(loaderTimerInterval);
  loaderTimerInterval = null;
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


function fechaISOAWeek(fechaISO) {
  const d = crearFechaLocal(fechaISO);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
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

  if (valorWeek < SEMANA_MINIMA_INVENTARIO) {
    valorWeek = SEMANA_MINIMA_INVENTARIO;
  }

  if (selectorSemana && selectorSemana.value !== valorWeek) {
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

  const snap = await getDocs(REF_LISTADOS_RESUMEN_PROVEEDOR);

  snap.forEach((docu) => {
    const data = docu.data() || {};
    if (data.activo === false) return;

    listadosResumenProveedor.push({
      id: docu.id,
      nombre: String(data.nombre || docu.id || "").trim(),
      articulos: Array.isArray(data.articulos) ? data.articulos : [],
      activo: data.activo !== false
    });
  });

  listadosResumenProveedor.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  llenarSelectoresListadosProveedor();
}

function llenarSelectoresListadosProveedor() {
  const opciones = listadosResumenProveedor.map((l) =>
    `<option value="${escapeHtml(l.id)}">${escapeHtml(l.nombre)}</option>`
  ).join("");

  const html = opciones || `<option value="">Sin listados</option>`;

  if ($("selectorListadoResumen")) $("selectorListadoResumen").innerHTML = html;
  if ($("selectorListadoConfig")) $("selectorListadoConfig").innerHTML = `<option value="">Nuevo listado</option>${opciones}`;
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
  if (!cont) return;

  if (!articulosConfigActual.length) {
    cont.innerHTML = `<div class="vacio-articulos">Sin artículos agregados.</div>`;
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
    });
  });
}

function pintarResultadosBusquedaListado() {
  const cont = $("resultadosBusquedaListado");
  if (!cont) return;

  const q = String($("buscarArticuloListado")?.value || "").trim().toLowerCase();
  if (!q) {
    cont.innerHTML = `<div class="vacio-articulos">Escribe código o nombre para buscar.</div>`;
    return;
  }

  const rows = registrosPivot
    .filter((r) => [r.codigo, r.nombre].some((v) => String(v || "").toLowerCase().includes(q)))
    .slice(0, 30);

  if (!rows.length) {
    cont.innerHTML = `<div class="vacio-articulos">No se encontraron artículos.</div>`;
    return;
  }

  cont.innerHTML = rows.map((r, idx) => `
    <button type="button" class="resultado-articulo" data-agregar-articulo="${idx}">
      <b>${escapeHtml(r.codigo)}</b> · ${escapeHtml(r.nombre)}
    </button>
  `).join("");

  cont.querySelectorAll("[data-agregar-articulo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows[Number(btn.dataset.agregarArticulo)];
      const art = normalizarArticuloListado(row);
      if (!art.codigoKey) return;

      if (!articuloYaIncluido(art.codigoKey)) {
        articulosConfigActual.push(art);
        pintarArticulosConfigActual();
      }
    });
  });
}

function cargarListadoConfig(id) {
  const listado = obtenerListadoPorId(id);
  listadoConfigActual = listado;

  if ($("nombreListadoProveedor")) $("nombreListadoProveedor").value = listado?.nombre || "";
  articulosConfigActual = (listado?.articulos || []).map(normalizarArticuloListado);

  pintarArticulosConfigActual();
  pintarResultadosBusquedaListado();
}

async function guardarListadoProveedor() {
  const nombre = String($("nombreListadoProveedor")?.value || "").trim().toUpperCase();

  if (!nombre) {
    alert("Escribe el nombre del listado/proveedor.");
    return;
  }

  const id = listadoConfigActual?.id || crearIdListadoProveedor(nombre);
  const ref = doc(
    db,
    "almacenes",
    "almacen_cigarro",
    "configuracion",
    "listados_resumen_proveedor",
    "items",
    id
  );

  await setDoc(ref, {
    nombre,
    activo: true,
    actualizadoEn: new Date().toISOString(),
    articulos: articulosConfigActual.map(normalizarArticuloListado)
  }, { merge: true });

  await cargarListadosResumenProveedor();
  if ($("selectorListadoConfig")) $("selectorListadoConfig").value = id;
  cargarListadoConfig(id);
  setStatus(`Listado ${nombre} guardado con ${articulosConfigActual.length} artículos.`);
}

async function eliminarListadoProveedor() {
  if (!listadoConfigActual?.id) {
    alert("Selecciona un listado para eliminar.");
    return;
  }

  if (!confirm(`¿Eliminar listado ${listadoConfigActual.nombre}?`)) return;

  const ref = doc(
    db,
    "almacenes",
    "almacen_cigarro",
    "configuracion",
    "listados_resumen_proveedor",
    "items",
    listadoConfigActual.id
  );

  await deleteDoc(ref);
  listadoConfigActual = null;
  articulosConfigActual = [];
  if ($("nombreListadoProveedor")) $("nombreListadoProveedor").value = "";
  await cargarListadosResumenProveedor();
  pintarArticulosConfigActual();
  setStatus("Listado eliminado.");
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

function pintarListadoResumenProveedor() {
  const id = $("selectorListadoResumen")?.value || "";
  const listado = obtenerListadoPorId(id);

  if (!listado) {
    alert("No hay listado seleccionado.");
    return;
  }

  vistaActual = "listado_proveedor";
  $("tabResumen")?.classList.remove("active");
  $("tabDetalle")?.classList.remove("active");

  const codigos = new Set((listado.articulos || []).map((a) => normalizarCodigo(a.codigoKey || a.codigo)));
  const rows = registrosPivot
    .filter((r) => codigos.has(normalizarCodigo(r.codigoKey || r.codigo)))
    .filter(pasaFiltroPivot)
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));

  const tabla = $("tablaListadoResumen") || $("tabla");
  const contenedorTablaResumen = $("contenedorTablaListadoResumen");
  if (contenedorTablaResumen) contenedorTablaResumen.classList.remove("oculto");

  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  thead.innerHTML = `
    <tr>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>INVENTARIO<br>TEÓRICO FINAL</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad ${Number(r.existenciaFinalSemana || 0) < 0 ? "negativo-parpadeo" : ""}">${fmtNum(r.existenciaFinalSemana)}</td>
    </tr>
  `).join("");

  const total = rows.reduce((sum, r) => sum + Number(r.existenciaFinalSemana || 0), 0);

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="2">TOTAL ${escapeHtml(listado.nombre)}</td>
      <td>${fmtNum(total)}</td>
    </tr>
  `;

  setStatus(`Resumen ${listado.nombre}: ${rows.length} artículos. Solo inventario teórico final.`);
}


async function cargarProveedoresAutorizadosPivot() {
  proveedoresAutorizadosPivot = {};

  const snap = await getDocs(REF_PROVEEDORES_AUTORIZADOS_CIGARRO);

  snap.forEach((docu) => {
    const p = docu.data() || {};
    const rfc = String(p.rfc_emisor || docu.id || "").trim().toUpperCase();

    if (!rfc) return;
    if (p.activo === false) return;

    proveedoresAutorizadosPivot[rfc] = {
      rfc,
      razon_social_emisor: String(p.razon_social_emisor || "").trim(),
      alias_pivot: String(p.alias_pivot || p.razon_social_emisor || rfc).trim()
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

async function cargarInventarioInicial() {
  inventarioInicialOriginal = {};

  const snap = await getDocs(REF_INVENTARIO_INICIAL_CIGARRO);

  snap.forEach((docu) => {
    const data = docu.data() || {};

    const codigoOriginal = String(
      data.codigo ||
      data.codigoKey ||
      docu.id ||
      ""
    ).trim();

    const codigoKey = normalizarCodigo(
      data.codigoKey ||
      data.codigo ||
      docu.id ||
      ""
    );

    const nombre = String(
      data.nombre ||
      data.descripcion ||
      data.producto ||
      ""
    ).trim();

    const existencia = Number(
      data.existencia ??
      data.cantidad ??
      data.invini ??
      data.inviniOriginal ??
      0
    );

    if (!codigoKey) return;

    inventarioInicialOriginal[codigoKey] = {
      codigo: codigoOriginal,
      codigoKey,
      nombre,
      inviniOriginal: existencia
    };
  });

  setStatus(
    `Inventario inicial cargado ${ID_INVENTARIO_INICIAL}: ${Object.keys(inventarioInicialOriginal).length} artículos.`
  );

  setProgress(8);
  return inventarioInicialOriginal;
}

function crearMovimientosInventarioInicialSemana(inicio, fin) {
  if (ID_INVENTARIO_INICIAL < inicio || ID_INVENTARIO_INICIAL > fin) return [];

  return Object.values(inventarioInicialOriginal).map((inv, idx) => ({
    tipo: "INVINI",
    docId: ID_INVENTARIO_INICIAL,
    partida: idx + 1,
    folio: `INVINI-${ID_INVENTARIO_INICIAL.replaceAll("-", "")}`,
    fecha: ID_INVENTARIO_INICIAL,
    hora: "00:00",
    destino: "ALMACÉN CIGARRO",
    entrega: "INVENTARIO INICIAL",
    recibe: "PROVSOFT",
    folioCincho: "",
    proveedor: "",
    alias_pivot: "",
    rfc_emisor: "",
    razon_social_emisor: "",
    codigo: inv.codigo,
    codigoKey: inv.codigoKey,
    nombre: inv.nombre,
    cantidad: Number(inv.inviniOriginal || 0),
    diferencia: 0,
    existencia_fisica: Number(inv.inviniOriginal || 0),
    existencia_teorica: 0
  }));
}

async function consultarSalidas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  // Lectura cruda: no filtramos por fecha en Firestore porque los documentos
  // históricos traen fecha como texto: "27/6/2026, 2:06:49 p.m.".
  // Primero leemos la colección y luego normalizamos/filtramos en memoria.
  const snap = await getDocs(REF_SALIDAS_CIGARRO);
  const detalle = [];
  const docsVistos = new Set();

  snap.forEach((documento) => {
    const data = documento.data() || {};
    docsVistos.add(documento.id);

    const fecha = normalizarFecha(data.fecha || data.timestamp || "");
    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;
    if (fecha < inicio || fecha > fin) return;

    // Las salidas reales del almacén cigarro vienen con arreglo "productos",
    // no "articulos". Dejamos ambos para compatibilidad.
    const articulos = Array.isArray(data.productos)
      ? data.productos
      : Array.isArray(data.articulos)
        ? data.articulos
        : [];

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(
        art.codigo ??
        art.codigo_interno ??
        art.codigoInterno ??
        ""
      ).trim();

      const codigoKey = normalizarCodigo(codigoOriginal);

      const nombre = String(
        art.descripcion ??
        art.nombre ??
        art.descripcion_interna ??
        art.descripcion_factura ??
        ""
      ).trim();

      const cantidad = Number(
        art.cantidad ??
        art.cantidad_salida ??
        art.cantidadSalida ??
        0
      );

      if (!codigoKey && !nombre && !cantidad) return;

      detalle.push({
        tipo: "SALIDA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folio || documento.id || "").trim(),
        fecha,
        destino: String(data.destino || "").trim(),
        entrega: String(data.entrega || "").trim(),
        recibe: String(data.recibe || "").trim(),
        folioCincho: String(data.folioCincho || "").trim(),
        proveedor: "",
        alias_pivot: "",
        rfc_emisor: "",
        razon_social_emisor: "",
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad
      });
    });
  });

  return {
    detalle,
    totalDocs: docsVistos.size
  };
}

async function consultarEntradas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  // Lectura cruda: entradas puede estar vacía, pero si existen documentos
  // se normalizan y filtran en memoria igual que salidas.
  const snap = await getDocs(REF_ENTRADAS_CIGARRO);
  const detalle = [];
  const docsVistos = new Set();

  snap.forEach((documento) => {
    const data = documento.data() || {};
    docsVistos.add(documento.id);

    if (data.estado_zapata && data.estado_zapata !== "ENTRADA_GENERADA") return;

    const fecha = normalizarFecha(
      data.fecha ||
      data.fecha_factura ||
      data.creado_en ||
      data.timestamp ||
      ""
    );

    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;
    if (fecha < inicio || fecha > fin) return;

    const rfcEmisor = String(data.rfc_emisor || "").trim().toUpperCase();
    const razonSocialEmisor = String(data.razon_social_emisor || "").trim();
    const aliasPivot = obtenerAliasProveedorPivot(rfcEmisor, razonSocialEmisor);

    const articulos = Array.isArray(data.articulos) ? data.articulos : [];

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(art.codigo_interno || "").trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(art.descripcion_interna || art.descripcion_factura || "").trim();
      const cantidad = Number(art.cantidad_entrada || 0);

      if (!codigoKey && !nombre && !cantidad) return;

      detalle.push({
        tipo: "ENTRADA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folioEntrada || data.folio || documento.id || "").trim(),
        fecha,
        destino: "ALMACÉN CIGARRO",
        entrega: aliasPivot,
        recibe: String(data.usuario || "").trim(),
        folioCincho: "",
        proveedor: aliasPivot,
        rfc_emisor: rfcEmisor,
        razon_social_emisor: razonSocialEmisor,
        alias_pivot: aliasPivot,
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad
      });
    });
  });

  return {
    detalle,
    totalDocs: docsVistos.size
  };
}

async function consultarCigman(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };
  const snap = await getDocs(REF_CIGMAN_CIGARRO);
  const detalle = [];
  const docsVistos = new Set();
  snap.forEach((documento) => {
    const d = documento.data() || {};
    const fecha = normalizarFecha(d.fecha || d.fecha_movimiento || d.creado_en || "");
    if (!fecha || fecha < FECHA_INICIO_MINIMA || fecha < inicio || fecha > fin) return;
    const codigo = String(d.codigo || d.codigoKey || "").trim();
    const codigoKey = normalizarCodigo(d.codigoKey || codigo);
    const nombre = String(d.nombre || d.descripcion || "").trim();
    const cantidad = Number(d.cantidad || 0);
    if (!codigoKey || !cantidad) return;
    docsVistos.add(documento.id);
    detalle.push({
      tipo: "CIGMAN", docId: documento.id, partida: 1,
      folio: String(d.folio || documento.id), fecha,
      hora: String(d.hora || d.hora_movimiento || "00:00").substring(0,5),
      destino: "ENTRADA MANUAL CIGARRO", entrega: "CIGMAN",
      recibe: String(d.usuario || "OPERADOR"), folioCincho: "",
      proveedor: "SIN CARGO", alias_pivot: "CIGMAN", rfc_emisor: "", razon_social_emisor: "",
      codigo, codigoKey, nombre, cantidad, motivo: String(d.motivo || "CIGARRO SIN CARGO")
    });
  });
  return { detalle, totalDocs: docsVistos.size };
}

async function consultarAjustesInventario(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  const snapAjustes = await getDocs(REF_AJUSTES_INVENTARIO_CIGARRO);
  const detalle = [];
  const docsVistos = new Set();

  for (const ajusteDoc of snapAjustes.docs) {
    const ajusteId = ajusteDoc.id;
    const ajusteData = ajusteDoc.data() || {};

    const refPartidas = collection(
      db,
      "almacenes",
      "almacen_cigarro",
      "ajustes",
      ajusteId,
      "PARTIDAS"
    );

    const partidasSnap = await getDocs(refPartidas);

    partidasSnap.forEach((partidaDoc) => {
      const p = partidaDoc.data() || {};

      if (p.eliminado === true) return;

      const fecha = normalizarFecha(
        p.fecha_movimiento ||
        ajusteData.fecha_movimiento ||
        ajusteData.fecha ||
        p.creado_en ||
        ajusteData.creado_en ||
        ""
      );

      if (!fecha || fecha < inicio || fecha > fin) return;
      if (fecha < FECHA_INICIO_MINIMA) return;

      const codigoOriginal = String(p.codigo || p.codigoKey || "").trim();
      const codigoKey = normalizarCodigo(p.codigoKey || codigoOriginal);
      const nombre = String(p.nombre || p.descripcion || "").trim();

      const diferencia = Number(p.diferencia || 0);
      const existenciaFisica = Number(p.existencia_fisica || 0);
      const existenciaTeorica = Number(p.existencia_teorica || 0);

      if (!codigoKey && !nombre && !diferencia) return;

      docsVistos.add(ajusteId);

      const fechaDDMMYY = fecha.replaceAll("-", "").substring(2);
      const folioAju = String(ajusteData.folio || ajusteId || "").trim();

      detalle.push({
        tipo: "AJUINV",
        docId: ajusteId,
        partida: p.partida || partidaDoc.id || "",
        folio: folioAju || `AJUINV-${fechaDDMMYY}`,
        fecha,
        hora: String(p.hora_movimiento || ajusteData.hora_movimiento || "").trim(),
        destino: "AJUSTE INVENTARIO",
        entrega: "AJUINV",
        recibe: String(ajusteData.usuario || ajusteData.usuario_nombre || "").trim(),
        folioCincho: "",
        proveedor: "",
        alias_pivot: "",
        rfc_emisor: "",
        razon_social_emisor: "",
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad: diferencia,
        diferencia,
        existencia_fisica: existenciaFisica,
        existencia_teorica: existenciaTeorica
      });
    });
  }

  return {
    detalle,
    totalDocs: docsVistos.size
  };
}

async function cargarSalidasZapata() {
  try {
    const rango = obtenerRangoSemana();
    const cacheKey = crearKeySemana({
      almacen: ALMACEN_ID,
      inicio: rango.inicio,
      fin: rango.fin,
      base: `${FECHA_BASE_INVENTARIO}|${CACHE_VERSION_INVENTARIO}`
    });

    const cache = await leerCacheSemana(cacheKey) || await leerCalculoInventario(cacheKey);

    if (cache) {
      inventarioInicialOriginal = cache.inventarioInicialOriginal || {};
      proveedoresAutorizadosPivot = cache.proveedoresAutorizadosPivot || {};

      registrosDetalleSemana = cache.registrosDetalleSemana || [];
      registrosDetalleAcumuladoAnterior = cache.registrosDetalleAcumuladoAnterior || [];
      registrosEntradasSemana = cache.registrosEntradasSemana || [];
      registrosEntradasAcumuladoAnterior = cache.registrosEntradasAcumuladoAnterior || [];
      registrosAjustesSemana = cache.registrosAjustesSemana || [];
      registrosAjustesAcumuladoAnterior = cache.registrosAjustesAcumuladoAnterior || [];
      registrosCigmanSemana = cache.registrosCigmanSemana || [];
      registrosCigmanAcumuladoAnterior = cache.registrosCigmanAcumuladoAnterior || [];

      registrosDetalleMovimientoSemana = []; // V12: Detalle semana eliminado; no se reconstruye ni se restaura.
      registrosPivot = cache.registrosPivot || [];
      fechasColumnas = cache.fechasColumnas || [];

      actualizarResumenSuperior(
        cache.totalDocsSemana || 0,
        cache.totalDocsEntradasSemana || 0,
        cache.totalDocsAjustesSemana || 0
      );

      setStatus("Cargando Pivot semanal desde IndexedDB...");
      pintarTabla();
      setProgress(100);
      const segundosCarga = ((performance.now() - loaderInicioMs) / 1000).toFixed(1);
      setStatus(`Listo en ${segundosCarga} s · Pivot cargado desde IndexedDB.`);
      setTimeout(ocultarLoader, 350);
      return;
    }

    setStatus("Cargando datos base desde Firebase...");
    await cargarInventarioInicial();
    await cargarProveedoresAutorizadosPivot();

    setStatus(
      `Consultando Firebase. Semana ${rango.inicio} a ${rango.fin}. Acumulado anterior hasta ${rango.acumuladoAnteriorFin}...`
    );
    setProgress(25);

    // Ahorro de lecturas: cada colección se descarga una sola vez hasta el fin
    // de la semana seleccionada. Luego se divide localmente en semana y acumulado.
    const consultaSalidasTotal = await consultarSalidas(FECHA_BASE_INVENTARIO, rango.fin);
    const consultaEntradasTotal = await consultarEntradas(FECHA_BASE_INVENTARIO, rango.fin);
    const consultaAjustesTotal = await consultarAjustesInventario(FECHA_BASE_INVENTARIO, rango.fin);
    const consultaCigmanTotal = await consultarCigman(FECHA_BASE_INVENTARIO, rango.fin);

    setStatus("Procesando movimientos y preparando Pivot semanal...");
    setProgress(65);

    const dividirPorSemana = (detalle) => ({
      semana: detalle.filter(x => x.fecha >= rango.inicio && x.fecha <= rango.fin),
      anterior: rango.acumuladoAnteriorFin >= FECHA_BASE_INVENTARIO
        ? detalle.filter(x => x.fecha >= FECHA_BASE_INVENTARIO && x.fecha <= rango.acumuladoAnteriorFin)
        : []
    });

    const salidasDiv = dividirPorSemana(consultaSalidasTotal.detalle);
    const entradasDiv = dividirPorSemana(consultaEntradasTotal.detalle);
    const ajustesDiv = dividirPorSemana(consultaAjustesTotal.detalle);
    const cigmanDiv = dividirPorSemana(consultaCigmanTotal.detalle);

    registrosDetalleSemana = salidasDiv.semana;
    registrosDetalleAcumuladoAnterior = salidasDiv.anterior;
    registrosEntradasSemana = entradasDiv.semana;
    registrosEntradasAcumuladoAnterior = entradasDiv.anterior;
    registrosAjustesSemana = ajustesDiv.semana;
    registrosAjustesAcumuladoAnterior = ajustesDiv.anterior;
    registrosCigmanSemana = cigmanDiv.semana;
    registrosCigmanAcumuladoAnterior = cigmanDiv.anterior;

    const consultaSemana = { detalle: registrosDetalleSemana, totalDocs: new Set(registrosDetalleSemana.map(x => x.docId)).size };
    const consultaEntradasSemana = { detalle: registrosEntradasSemana, totalDocs: new Set(registrosEntradasSemana.map(x => x.docId)).size };
    const consultaAjustesSemana = { detalle: registrosAjustesSemana, totalDocs: new Set(registrosAjustesSemana.map(x => x.docId)).size };

    setStatus("Calculando inventario teórico...");
    setProgress(75);

    // V12: no se construye el dataset de "Detalle semana". Solo se calcula el Pivot.
    registrosDetalleMovimientoSemana = [];

    construirPivot(
      registrosDetalleSemana,
      registrosDetalleAcumuladoAnterior,
      registrosEntradasSemana,
      registrosEntradasAcumuladoAnterior,
      registrosAjustesSemana,
      registrosAjustesAcumuladoAnterior,
      registrosCigmanSemana,
      registrosCigmanAcumuladoAnterior,
      rango.inicio,
      rango.fin
    );

    actualizarResumenSuperior(
      consultaSemana.totalDocs,
      consultaEntradasSemana.totalDocs,
      consultaAjustesSemana.totalDocs
    );

    await guardarEstadoActualEnIndexedDB(cacheKey, {
      totalDocsSemana: consultaSemana.totalDocs,
      totalDocsEntradasSemana: consultaEntradasSemana.totalDocs,
      totalDocsAjustesSemana: consultaAjustesSemana.totalDocs
    });

    setStatus("Guardando Pivot semanal en IndexedDB...");
    pintarTabla();

    setProgress(100);
    const segundosCarga = ((performance.now() - loaderInicioMs) / 1000).toFixed(1);
    setStatus(`Listo en ${segundosCarga} s · Pivot semanal cargado y guardado localmente.`);

    setTimeout(ocultarLoader, 450);
  } catch (error) {
    console.error(error);
    setStatus("Error al cargar movimientos Cigarro: " + error.message);
    ocultarLoader();
  }
}


function crearCacheKeyActual() {
  const rango = obtenerRangoSemana();
  return crearKeySemana({
    almacen: ALMACEN_ID,
    inicio: rango.inicio,
    fin: rango.fin,
    base: `${FECHA_BASE_INVENTARIO}|${CACHE_VERSION_INVENTARIO}`
  });
}

async function guardarEstadoActualEnIndexedDB(cacheKey = crearCacheKeyActual(), totales = {}) {
  const payload = {
    inventarioInicialOriginal,
    proveedoresAutorizadosPivot,
    registrosDetalleSemana,
    registrosDetalleAcumuladoAnterior,
    registrosEntradasSemana,
    registrosEntradasAcumuladoAnterior,
    registrosAjustesSemana,
    registrosAjustesAcumuladoAnterior,
    registrosCigmanSemana,
    registrosCigmanAcumuladoAnterior,
    registrosPivot,
    fechasColumnas,
    totalDocsSemana: totales.totalDocsSemana ?? new Set(registrosDetalleSemana.map(x => x.docId)).size,
    totalDocsEntradasSemana: totales.totalDocsEntradasSemana ?? new Set(registrosEntradasSemana.map(x => x.docId)).size,
    totalDocsAjustesSemana: totales.totalDocsAjustesSemana ?? new Set(registrosAjustesSemana.map(x => x.docId)).size
  };

  await guardarCacheSemana(cacheKey, payload);
  await guardarCalculoInventario(cacheKey, payload);
}

function asegurarRow(mapa, item) {
  const key = item.codigoKey || String(item.nombre || "").toLowerCase();

  if (!mapa.has(key)) {
    mapa.set(key, {
      codigo: item.codigo,
      codigoKey: item.codigoKey,
      nombre: item.nombre,
      inviniOriginal: 0,
      entradasAcumuladasAnteriores: 0,
      salidasAcumuladasAnteriores: 0,
      ajustesAcumuladosAnteriores: 0,
      cigmanAcumuladoAnterior: 0,
      inviniSemana: 0,
      entradasPorFecha: {},
      salidasPorFecha: {},
      ajustesPorFecha: {},
      cigmanPorFecha: {},
      movimientosAnteriores: [],
      movimientosSemana: [],
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
      totalAjustesSemana: 0,
      totalCigmanSemana: 0,
      existenciaFinalSemana: 0
    });
  }

  const row = mapa.get(key);

  if (!row.codigo && item.codigo) row.codigo = item.codigo;
  if (!row.nombre && item.nombre) row.nombre = item.nombre;

  return row;
}

function recalcularExistenciaFinal(row) {
  row.existenciaFinalSemana =
    Number(row.inviniSemana || 0) +
    Number(row.totalEntradasSemana || 0) -
    Number(row.totalSalidasSemana || 0) +
    Number(row.totalAjustesSemana || 0) +
    Number(row.totalCigmanSemana || 0);
}

function construirPivot(
  detalleSemana,
  detalleAcumuladoAnterior,
  entradasSemana,
  entradasAcumuladoAnterior,
  ajustesSemana,
  ajustesAcumuladoAnterior,
  cigmanSemana,
  cigmanAcumuladoAnterior,
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
      cigmanAcumuladoAnterior: 0,
      inviniSemana: Number(inv.inviniOriginal || 0),
      entradasPorFecha: {},
      salidasPorFecha: {},
      ajustesPorFecha: {},
      cigmanPorFecha: {},
      movimientosAnteriores: [],
      movimientosSemana: [],
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
      totalAjustesSemana: 0,
      totalCigmanSemana: 0,
      existenciaFinalSemana: Number(inv.inviniOriginal || 0)
    });
  });

  // Construimos el inventario inicial de la semana reproduciendo cronológicamente
  // TODOS los movimientos anteriores. Esto garantiza que INVINI sea exactamente
  // la EXISTENCIA FINAL TEÓRICA de la semana anterior, incluso cuando hubo AJUINV,
  // porque un ajuste fija la existencia al inventario físico capturado.
  entradasAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    row.entradasAcumuladasAnteriores += Number(item.cantidad || 0);
    row.movimientosAnteriores.push({
      tipo: "ENTRADA", fecha: item.fecha, hora: item.hora || "00:00",
      cantidad: Number(item.cantidad || 0), item
    });
  });

  detalleAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    row.salidasAcumuladasAnteriores += Number(item.cantidad || 0);
    row.movimientosAnteriores.push({
      tipo: "SALIDA", fecha: item.fecha, hora: item.hora || "00:00",
      cantidad: Number(item.cantidad || 0), item
    });
  });

  ajustesAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    const diferencia = Number(item.diferencia || item.cantidad || 0);
    row.ajustesAcumuladosAnteriores += diferencia;
    row.movimientosAnteriores.push({
      tipo: "AJUINV", fecha: item.fecha, hora: item.hora || "00:00",
      cantidad: diferencia, diferencia,
      existencia_fisica: Number(item.existencia_fisica || 0),
      existencia_teorica: Number(item.existencia_teorica || 0),
      item
    });
  });

  cigmanAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    row.cigmanAcumuladoAnterior += Number(item.cantidad || 0);
    row.movimientosAnteriores.push({
      tipo: "CIGMAN", fecha: item.fecha, hora: item.hora || "00:00",
      cantidad: Number(item.cantidad || 0), item
    });
  });

  mapa.forEach((row) => {
    let existenciaAnterior = Number(row.inviniOriginal || 0);

    row.movimientosAnteriores.sort((a, b) => {
      if (a.fecha !== b.fecha) return String(a.fecha).localeCompare(String(b.fecha));
      if (String(a.hora || "") !== String(b.hora || "")) {
        return String(a.hora || "").localeCompare(String(b.hora || ""));
      }
      const orden = { ENTRADA: 1, CIGMAN: 2, SALIDA: 3, AJUINV: 4 };
      return Number(orden[a.tipo] || 99) - Number(orden[b.tipo] || 99);
    });

    row.movimientosAnteriores.forEach((mov) => {
      if (mov.tipo === "ENTRADA" || mov.tipo === "CIGMAN") {
        existenciaAnterior += Number(mov.cantidad || 0);
      } else if (mov.tipo === "SALIDA") {
        existenciaAnterior -= Number(mov.cantidad || 0);
      } else if (mov.tipo === "AJUINV") {
        existenciaAnterior = Number(mov.existencia_fisica || 0);
      }
    });

    row.inviniSemana = existenciaAnterior;
    row.existenciaFinalSemana = existenciaAnterior;
    row.movimientosSemana = [];
  });
entradasSemana.forEach((item) => {
  const row = asegurarRow(mapa, item);

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
  
cigmanSemana.forEach((item) => {
  const row = asegurarRow(mapa, item);
  row.cigmanPorFecha[item.fecha] = Number(row.cigmanPorFecha[item.fecha] || 0) + Number(item.cantidad || 0);
  row.totalCigmanSemana += Number(item.cantidad || 0);
  row.movimientosSemana.push({ tipo: "CIGMAN", fecha: item.fecha, hora: item.hora || "00:00", cantidad: Number(item.cantidad || 0), item });
});
  
detalleSemana.forEach((item) => {
  const row = asegurarRow(mapa, item);

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

  row.movimientosSemana.sort((a, b) => {
    if (a.fecha !== b.fecha) return String(a.fecha).localeCompare(String(b.fecha));
    if (String(a.hora || "") !== String(b.hora || "")) {
      return String(a.hora || "").localeCompare(String(b.hora || ""));
    }

    const orden = {
      ENTRADA: 1,
      CIGMAN: 2,
      SALIDA: 3,
      AJUINV: 4
    };

    return Number(orden[a.tipo] || 99) - Number(orden[b.tipo] || 99);
  });

  row.movimientosSemana.forEach((mov) => {
    if (mov.tipo === "ENTRADA" || mov.tipo === "CIGMAN") {
      existencia += Number(mov.cantidad || 0);
    }

    if (mov.tipo === "SALIDA") {
      existencia -= Number(mov.cantidad || 0);
    }

    if (mov.tipo === "AJUINV") {
      existencia = Number(mov.existencia_fisica || 0);
    }
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

  const totalCantidadCigmanSemana = registrosCigmanSemana.reduce((sum, x) => sum + Number(x.cantidad || 0), 0);

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
    $("totalPartidas").textContent = registrosPivot.length;
  }

  if ($("totalCantidad")) {
    $("totalCantidad").textContent =
      `E ${fmtNum(totalCantidadEntradasSemana)} / CIGMAN ${fmtNum(totalCantidadCigmanSemana)} / S ${fmtNum(totalCantidadSalidasSemana)} / AJU ${fmtNum(totalCantidadAjustesSemana)}`;
  }

  if ($("totalCodigos")) $("totalCodigos").textContent = registrosPivot.length;
}

function getFiltroBusqueda() {
  return String($("busqueda")?.value || "").trim().toLowerCase();
}

function pasaFiltroPivot(item) {
  const q = getFiltroBusqueda();
  if (!q) return true;

  return [
    item.codigo,
    item.nombre
  ].some((v) => String(v || "").toLowerCase().includes(q));
}

function pasaFiltroDetalle(item) {
  const q = getFiltroBusqueda();
  if (!q) return true;

  return [
    item.tipo,
    item.codigo,
    item.nombre,
    item.folio,
    item.destino,
    item.entrega,
    item.recibe,
    item.proveedor,
    item.alias_pivot,
    item.rfc_emisor,
    item.razon_social_emisor
  ].some((v) => String(v || "").toLowerCase().includes(q));
}

function pintarTabla() {
  if (vistaActual === "listado_proveedor") {
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

  const fechasConCigman = fechasColumnas.filter(f => registrosCigmanSemana.some(x => x.fecha === f));

  const fechasConAjuste = fechasColumnas.filter(f =>
    registrosAjustesSemana.some(x => x.fecha === f)
  );

  const fechaInviniVisible = rangoSemanaActual.inicio > FECHA_BASE_INVENTARIO
    ? sumarDias(rangoSemanaActual.inicio, -1)
    : FECHA_BASE_INVENTARIO;

  thead.innerHTML = `
    <tr>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>INVINI<br>${fechaCorta(fechaInviniVisible)}</th>

      ${fechasColumnas.map(f => {
        const proveedor = obtenerProveedoresEntradaPorFecha(f);
        const foliosAjuste = obtenerFoliosAjustePorFecha(f);
        const tieneEntrada = fechasConEntrada.includes(f);
        const tieneCigman = fechasConCigman.includes(f);
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

          ${tieneCigman ? `<th class="cigman-head">${fechaCorta(f)}<br>CIGMAN</th>` : ""}

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

      <th>EXISTENCIA<br>FINAL TEÓRICA</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad ${Number(r.inviniSemana || 0) < 0 ? "negativo-parpadeo" : ""}">${fmtNum(r.inviniSemana)}</td>

      ${fechasColumnas.map(f => {
        const entrada = Number((r.entradasPorFecha?.[f]) || 0);
        const cigman = Number((r.cigmanPorFecha?.[f]) || 0);
        const salida = Number((r.salidasPorFecha?.[f]) || 0);
        const ajuste = Number((r.ajustesPorFecha?.[f]) || 0);
        const tieneAjusteFisico = ajuste !== 0;
        const tieneEntrada = fechasConEntrada.includes(f);
        const tieneCigman = fechasConCigman.includes(f);
        const tieneAjuste = fechasConAjuste.includes(f);

        return `
          ${
            tieneEntrada
              ? `<td class="entrada-col ${entrada ? "cantidad" : ""}">
                  ${fmtCelda(entrada)}
                </td>`
              : ""
          }

          ${tieneCigman ? `<td class="cigman-col ${cigman ? "cantidad" : ""}">${fmtCelda(cigman)}</td>` : ""}

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

      <td class="cantidad ${Number(r.existenciaFinalSemana || 0) < 0 ? "negativo-parpadeo" : ""}">${fmtNum(r.existenciaFinalSemana)}</td>
    </tr>
  `).join("");

  // Sin fila TOTAL: en inventario por artículo esos totales no aportan valor operativo.
  tfoot.innerHTML = "";
}

function pintarDetalle() {
  const tabla = $("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  const rows = registrosDetalleMovimientoSemana.filter(pasaFiltroDetalle);

  const totalInvini = rows
    .filter(x => x.tipo === "INVINI")
    .reduce((sum, x) => sum + Number(x.cantidad || 0), 0);

  const totalEntradas = rows
    .filter(x => x.tipo === "ENTRADA")
    .reduce((sum, x) => sum + Number(x.cantidad || 0), 0);

  const totalCigman = rows
    .filter(x => x.tipo === "CIGMAN")
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
      <td class="left" colspan="12">TOTAL INVINI ${fechaCorta(ID_INVENTARIO_INICIAL)}</td>
      <td>${fmtNum(totalInvini)}</td>
    </tr>
    <tr>
      <td class="left" colspan="12">TOTAL ENTRADAS SEMANA</td>
      <td>${fmtNum(totalEntradas)}</td>
    </tr>
    <tr>
      <td class="left" colspan="12">TOTAL CIGMAN SEMANA</td>
      <td>${fmtNum(totalCigman)}</td>
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
        Nombre: r.nombre,
        Inventario_Teorico_Final: Number(r.existenciaFinalSemana || 0)
      }));
  } else {
    rows = registrosPivot.filter(pasaFiltroPivot).map((r) => {
      const obj = {
        Codigo: r.codigo,
        Nombre: r.nombre,
        [`INVINI ${fechaCorta(rangoSemanaActual.inicio > FECHA_BASE_INVENTARIO ? sumarDias(rangoSemanaActual.inicio, -1) : FECHA_BASE_INVENTARIO)}`]: Number(r.inviniSemana || 0)
      };

      fechasColumnas.forEach((f) => {
        obj[`ENTRADA ${fechaCorta(f)}`] = Number((r.entradasPorFecha?.[f]) || 0);
        obj[`CIGMAN ${fechaCorta(f)}`] = Number((r.cigmanPorFecha?.[f]) || 0);
        obj[`SALIDA ${fechaCorta(f)}`] = Number((r.salidasPorFecha?.[f]) || 0);
        obj[`AJUINV ${fechaCorta(f)}`] = Number((r.ajustesPorFecha?.[f]) || 0);
      });

      obj["EXISTENCIA FINAL TEORICA"] = Number(r.existenciaFinalSemana || 0);

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
    vistaActual === "listado_proveedor" ? "Listado proveedor" : "Pivot semana"
  );

  XLSX.writeFile(
    wb,
    `movimientos_cigarro_${vistaActual}_${rangoSemanaActual.inicio}_a_${rangoSemanaActual.fin}.xlsx`
  );
}

function cambiarVista(vista) {
  // La tabla principal queda exclusivamente en Pivot semanal.
  vistaActual = vista === "listado_proveedor" ? "listado_proveedor" : "resumen";
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

function ordenarMovimientosInventario(a, b) {
  if (String(a.fecha || "") !== String(b.fecha || "")) {
    return String(a.fecha || "").localeCompare(String(b.fecha || ""));
  }

  const horaA = String(a.hora || "00:00").substring(0, 5);
  const horaB = String(b.hora || "00:00").substring(0, 5);

  if (horaA !== horaB) {
    return horaA.localeCompare(horaB);
  }

  const orden = {
    ENTRADA: 1,
    SALIDA: 2,
    AJUINV: 4
  };

  return Number(orden[a.tipo] || 99) - Number(orden[b.tipo] || 99);
}

function aplicarMovimientoInventario(existenciaActual, movimiento) {
  const existencia = Number(existenciaActual || 0);
  const cantidad = Number(movimiento.cantidad || movimiento.diferencia || 0);

  if (movimiento.tipo === "ENTRADA" || movimiento.tipo === "CIGMAN") {
    return existencia + cantidad;
  }

  if (movimiento.tipo === "SALIDA") {
    return existencia - cantidad;
  }

  if (movimiento.tipo === "AJUINV") {
    return Number(movimiento.existencia_fisica || 0);
  }

  return existencia;
}

function calcularExistenciaTeoricaParaAjuste(codigoKey, fecha, hora) {
  const key = normalizarCodigo(codigoKey);

  const inv = inventarioInicialOriginal[key] || {};
  let existencia = Number(inv.inviniOriginal || 0);

  const movimientos = [
    ...registrosEntradasAcumuladoAnterior,
    ...registrosDetalleAcumuladoAnterior,
    ...registrosAjustesAcumuladoAnterior,
    ...registrosCigmanAcumuladoAnterior,
    ...registrosEntradasSemana,
    ...registrosCigmanSemana,
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

function abrirModalOpciones() {
  $("modalOpciones")?.classList.remove("oculto");
}

function cerrarModalOpciones() {
  $("modalOpciones")?.classList.add("oculto");
}

function inicializarEventos() {
  crearSelectorSemanaSiNoExiste();

  if ($("selectorSemana")) {
    $("selectorSemana").min = SEMANA_MINIMA_INVENTARIO;
    const semanaActual = obtenerSemanaActualInput();
    $("selectorSemana").value = semanaActual < SEMANA_MINIMA_INVENTARIO
      ? SEMANA_MINIMA_INVENTARIO
      : semanaActual;
    const validarSemanaSeleccionada = async () => {
      const selector = $("selectorSemana");
      if (!selector) return;
      if (selector.value && selector.value < SEMANA_MINIMA_INVENTARIO) {
        selector.value = SEMANA_MINIMA_INVENTARIO;
        return;
      }
      await cargarSalidasZapata();
    };
    $("selectorSemana").addEventListener("change", validarSemanaSeleccionada);
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

  $("btnRecargar")?.addEventListener("click", async () => {
    cerrarModalOpciones();
    setStatus("Limpiando caché local y consultando Firebase...");
    await limpiarCacheInventario();
    await cargarSalidasZapata();
  });
  $("btnExportar")?.addEventListener("click", () => { cerrarModalOpciones(); exportarExcel(); });
  $("busqueda")?.addEventListener("input", pintarTabla);

  $("btnMenuOpciones")?.addEventListener("click", abrirModalOpciones);
  $("btnCerrarOpciones")?.addEventListener("click", cerrarModalOpciones);
  $("modalOpciones")?.addEventListener("click", (e) => {
    if (e.target === $("modalOpciones")) cerrarModalOpciones();
  });

  $("btnVerInventarios")?.addEventListener("click", async () => {
    cerrarModalOpciones();
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

  $("btnVerEntradas")?.addEventListener("click", async () => {
    cerrarModalOpciones();
    document.querySelector(".card")?.classList.add("modo-entradas-cigarro");
    $("panelEntradasCigarro")?.classList.remove("oculto");
    await iniciarModuloEntradasCigarro({
      onEntradaGenerada: async (entrada) => {
        await aplicarEntradaGeneradaLocal(entrada);
      }
    });
  });

  $("btnCerrarEntradasCigarro")?.addEventListener("click", () => {
    document.querySelector(".card")?.classList.remove("modo-entradas-cigarro");
    $("panelEntradasCigarro")?.classList.add("oculto");
    cambiarVista("resumen");
  });


  $("btnVerCigman")?.addEventListener("click", () => {
    cerrarModalOpciones();
    document.querySelector(".card")?.classList.add("modo-cigman");
    $("panelCigman")?.classList.remove("oculto");
  });

  $("btnCerrarCigman")?.addEventListener("click", () => {
    document.querySelector(".card")?.classList.remove("modo-cigman");
    $("panelCigman")?.classList.add("oculto");
    cambiarVista("resumen");
  });

  $("btnVerAjustesInventario")?.addEventListener("click", async () => {
    cerrarModalOpciones();
    mostrarPanelAjustesInventario();
  });

  $("btnCerrarAjustesInventario")?.addEventListener("click", async () => {
    ocultarPanelAjustesInventario();
    await cargarSalidasZapata();
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
  $("buscarArticuloListado")?.addEventListener("input", pintarResultadosBusquedaListado);

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
  const articulos = Array.isArray(entrada.articulos) ? entrada.articulos : [];
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
      destino: "ALMACÉN CIGARRO",
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

async function aplicarEntradaGeneradaLocal(entrada) {
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
    registrosEntradasSemana.push(...detalleEntrada);
  } else if (fechaEntrada >= FECHA_BASE_INVENTARIO && fechaEntrada <= rango.acumuladoAnteriorFin) {
    const docId = detalleEntrada[0].docId;
    registrosEntradasAcumuladoAnterior = registrosEntradasAcumuladoAnterior.filter(x => x.docId !== docId);
    registrosEntradasAcumuladoAnterior.push(...detalleEntrada);
  } else {
    setStatus("Entrada registrada. La semana visible no cambió.");
    return;
  }

  await invalidarCacheDesdeMovimiento(fechaEntrada);

  construirPivot(
    registrosDetalleSemana,
    registrosDetalleAcumuladoAnterior,
    registrosEntradasSemana,
    registrosEntradasAcumuladoAnterior,
    registrosAjustesSemana,
    registrosAjustesAcumuladoAnterior,
    registrosCigmanSemana,
    registrosCigmanAcumuladoAnterior,
    rango.inicio,
    rango.fin
  );

  pintarTabla();
  actualizarResumenSuperior(
    new Set(registrosDetalleSemana.map(x => x.docId)).size,
    new Set(registrosEntradasSemana.map(x => x.docId)).size,
    new Set(registrosAjustesSemana.map(x => x.docId)).size
  );

  await guardarEstadoActualEnIndexedDB(crearCacheKeyActual());
  setStatus("Entrada registrada; se actualizó el Pivot local y se invalidaron únicamente las semanas posteriores afectadas.");
}


async function aplicarAjusteGuardadoLocal(ajuste) {
  if (!ajuste) return;

  const fecha = normalizarFecha(ajuste.fecha_movimiento || ajuste.fecha || "");
  const hora = String(ajuste.hora_movimiento || "23:59").substring(0, 5) || "23:59";
  const codigoOriginal = String(ajuste.codigo || ajuste.codigoKey || "").trim();
  const codigoKey = normalizarCodigo(ajuste.codigoKey || codigoOriginal);

  const item = {
    tipo: "AJUINV",
    docId: ajuste.docId || ajuste.folio || `AJUINV-${fecha.replaceAll("-", "")}-${hora.replace(":", "")}`,
    partida: ajuste.partida || codigoKey,
    folio: ajuste.folio || `AJUINV-${fecha.replaceAll("-", "")}-${hora.replace(":", "")}`,
    fecha,
    hora,
    destino: "AJUSTE INVENTARIO",
    entrega: "AJUINV",
    recibe: "OPERADOR",
    folioCincho: "",
    proveedor: "",
    alias_pivot: "",
    rfc_emisor: "",
    razon_social_emisor: "",
    codigo: codigoOriginal,
    codigoKey,
    nombre: String(ajuste.nombre || ajuste.descripcion || "").trim(),
    cantidad: Number(ajuste.diferencia || ajuste.cantidad || 0),
    diferencia: Number(ajuste.diferencia || ajuste.cantidad || 0),
    existencia_fisica: Number(ajuste.existencia_fisica || 0),
    existencia_teorica: Number(ajuste.existencia_teorica || ajuste.existencia_calculada_tabla || 0)
  };

  if (!item.fecha || !item.codigoKey) return;

  const rango = obtenerRangoSemana();

  registrosAjustesSemana = registrosAjustesSemana.filter(x => !(x.docId === item.docId && x.codigoKey === item.codigoKey));
  registrosAjustesAcumuladoAnterior = registrosAjustesAcumuladoAnterior.filter(x => !(x.docId === item.docId && x.codigoKey === item.codigoKey));

  if (item.fecha >= rango.inicio && item.fecha <= rango.fin) {
    registrosAjustesSemana.push(item);
  } else if (item.fecha >= FECHA_BASE_INVENTARIO && item.fecha <= rango.acumuladoAnteriorFin) {
    registrosAjustesAcumuladoAnterior.push(item);
  }

  await invalidarCacheDesdeMovimiento(item.fecha);

  construirPivot(
    registrosDetalleSemana,
    registrosDetalleAcumuladoAnterior,
    registrosEntradasSemana,
    registrosEntradasAcumuladoAnterior,
    registrosAjustesSemana,
    registrosAjustesAcumuladoAnterior,
    registrosCigmanSemana,
    registrosCigmanAcumuladoAnterior,
    rango.inicio,
    rango.fin
  );

  pintarTabla();
  actualizarResumenSuperior(
    new Set(registrosDetalleSemana.map(x => x.docId)).size,
    new Set(registrosEntradasSemana.map(x => x.docId)).size,
    new Set(registrosAjustesSemana.map(x => x.docId)).size
  );

  await guardarEstadoActualEnIndexedDB(crearCacheKeyActual());
  setStatus("Ajuste registrado y cálculo actualizado en IndexedDB local, sin recargar Firestore completo.");
}

async function aplicarCigmanGuardadoLocal(mov) {
  const item = {
    tipo: "CIGMAN", docId: mov.docId || mov.folio, partida: 1, folio: mov.folio,
    fecha: mov.fecha, hora: mov.hora || "00:00", destino: "ENTRADA MANUAL CIGARRO",
    entrega: "CIGMAN", recibe: mov.usuario || "OPERADOR", folioCincho: "",
    proveedor: "SIN CARGO", alias_pivot: "CIGMAN", rfc_emisor: "", razon_social_emisor: "",
    codigo: mov.codigo, codigoKey: normalizarCodigo(mov.codigoKey || mov.codigo), nombre: mov.nombre,
    cantidad: Number(mov.cantidad || 0), motivo: mov.motivo || "CIGARRO SIN CARGO"
  };
  const rango = obtenerRangoSemana();
  if (item.fecha >= rango.inicio && item.fecha <= rango.fin) registrosCigmanSemana.push(item);
  else if (item.fecha >= FECHA_BASE_INVENTARIO && item.fecha <= rango.acumuladoAnteriorFin) registrosCigmanAcumuladoAnterior.push(item);
  else { setStatus("CIGMAN guardado. La semana visible no cambió."); return; }

  await invalidarCacheDesdeMovimiento(item.fecha);
  construirPivot(registrosDetalleSemana, registrosDetalleAcumuladoAnterior, registrosEntradasSemana, registrosEntradasAcumuladoAnterior,
    registrosAjustesSemana, registrosAjustesAcumuladoAnterior, registrosCigmanSemana, registrosCigmanAcumuladoAnterior, rango.inicio, rango.fin);
  pintarTabla();
  actualizarResumenSuperior(new Set(registrosDetalleSemana.map(x=>x.docId)).size, new Set(registrosEntradasSemana.map(x=>x.docId)).size, new Set(registrosAjustesSemana.map(x=>x.docId)).size);
  await guardarEstadoActualEnIndexedDB(crearCacheKeyActual());
  setStatus("CIGMAN registrado y sumado al inventario teórico.");
}


function quitarDocumentoDeArrays(docId, arrays) {
  const fechas = [];
  arrays.forEach((arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (String(arr[i]?.docId || "") === String(docId || "")) {
        if (arr[i]?.fecha) fechas.push(String(arr[i].fecha));
        arr.splice(i, 1);
      }
    }
  });
  return fechas;
}

function clasificarMovimientosEnRango(items, arrSemana, arrAnterior) {
  const rango = obtenerRangoSemana();
  items.forEach((item) => {
    if (!item?.fecha || item.fecha < FECHA_BASE_INVENTARIO) return;
    if (item.fecha >= rango.inicio && item.fecha <= rango.fin) {
      arrSemana.push(item);
    } else if (rango.acumuladoAnteriorFin >= FECHA_BASE_INVENTARIO &&
               item.fecha >= FECHA_BASE_INVENTARIO &&
               item.fecha <= rango.acumuladoAnteriorFin) {
      arrAnterior.push(item);
    }
  });
}

function movimientosSalidaDesdeSnapshot(documento) {
  const data = documento.data() || {};
  if (data.eliminado === true) return [];

  const fecha = normalizarFecha(
    data.fecha || data.fecha_movimiento || data.actualizado_en || data.creado_en || data.timestamp || ""
  );
  if (!fecha || fecha < FECHA_INICIO_MINIMA) return [];

  const articulos = Array.isArray(data.productos)
    ? data.productos
    : Array.isArray(data.articulos)
      ? data.articulos
      : [];

  return articulos.map((art, idx) => {
    const codigoOriginal = String(
      art.codigo ?? art.codigo_interno ?? art.codigoInterno ?? ""
    ).trim();
    const codigoKey = normalizarCodigo(codigoOriginal);
    const nombre = String(
      art.descripcion ?? art.nombre ?? art.descripcion_interna ?? art.descripcion_factura ?? ""
    ).trim();
    const cantidad = Number(
      art.cantidad ?? art.cantidad_salida ?? art.cantidadSalida ?? 0
    );
    if (!codigoKey && !nombre && !cantidad) return null;

    return {
      tipo: "SALIDA", docId: documento.id, partida: idx + 1,
      folio: String(data.folio || documento.id || "").trim(),
      fecha, destino: String(data.destino || "").trim(),
      entrega: String(data.entrega || "").trim(),
      recibe: String(data.recibe || "").trim(),
      folioCincho: String(data.folioCincho || "").trim(),
      proveedor: "", alias_pivot: "", rfc_emisor: "", razon_social_emisor: "",
      codigo: codigoOriginal, codigoKey, nombre, cantidad
    };
  }).filter(Boolean);
}

function movimientosEntradaDesdeSnapshot(documento) {
  const data = documento.data() || {};
  if (data.estado_zapata && data.estado_zapata !== "ENTRADA_GENERADA") return [];
  const fecha = normalizarFecha(data.fecha || data.fecha_factura || data.creado_en || data.timestamp || "");
  if (!fecha || fecha < FECHA_INICIO_MINIMA) return [];
  const rfcEmisor = String(data.rfc_emisor || "").trim().toUpperCase();
  const razonSocialEmisor = String(data.razon_social_emisor || "").trim();
  const aliasPivot = obtenerAliasProveedorPivot(rfcEmisor, razonSocialEmisor);
  const articulos = Array.isArray(data.articulos) ? data.articulos : [];
  return articulos.map((art, idx) => {
    const codigoOriginal = String(art.codigo_interno || "").trim();
    const codigoKey = normalizarCodigo(codigoOriginal);
    const nombre = String(art.descripcion_interna || art.descripcion_factura || "").trim();
    const cantidad = Number(art.cantidad_entrada || 0);
    if (!codigoKey && !nombre && !cantidad) return null;
    return {
      tipo: "ENTRADA", docId: documento.id, partida: idx + 1,
      folio: String(data.folioEntrada || data.folio || documento.id || "").trim(),
      fecha, destino: "ALMACÉN CIGARRO", entrega: aliasPivot,
      recibe: String(data.usuario || "").trim(), folioCincho: "",
      proveedor: aliasPivot, rfc_emisor: rfcEmisor,
      razon_social_emisor: razonSocialEmisor, alias_pivot: aliasPivot,
      codigo: codigoOriginal, codigoKey, nombre, cantidad
    };
  }).filter(Boolean);
}

function movimientosCigmanDesdeSnapshot(documento) {
  const d = documento.data() || {};
  const fecha = normalizarFecha(d.fecha || d.fecha_movimiento || d.creado_en || "");
  if (!fecha || fecha < FECHA_INICIO_MINIMA) return [];
  const codigo = String(d.codigo || d.codigoKey || "").trim();
  const codigoKey = normalizarCodigo(d.codigoKey || codigo);
  const nombre = String(d.nombre || d.descripcion || "").trim();
  const cantidad = Number(d.cantidad || 0);
  if (!codigoKey || !cantidad) return [];
  return [{
    tipo: "CIGMAN", docId: documento.id, partida: 1,
    folio: String(d.folio || documento.id), fecha,
    hora: String(d.hora || d.hora_movimiento || "00:00").substring(0, 5),
    destino: "ENTRADA MANUAL CIGARRO", entrega: "CIGMAN",
    recibe: String(d.usuario || "OPERADOR"), folioCincho: "",
    proveedor: "SIN CARGO", alias_pivot: "CIGMAN", rfc_emisor: "", razon_social_emisor: "",
    codigo, codigoKey, nombre, cantidad, motivo: String(d.motivo || "CIGARRO SIN CARGO")
  }];
}

async function movimientosAjusteDesdeSnapshot(ajusteDoc) {
  const ajusteId = ajusteDoc.id;
  const ajusteData = ajusteDoc.data() || {};
  const refPartidas = collection(db, "almacenes", "almacen_cigarro", "ajustes", ajusteId, "PARTIDAS");
  const partidasSnap = await getDocs(refPartidas);
  const items = [];
  partidasSnap.forEach((partidaDoc) => {
    const p = partidaDoc.data() || {};
    if (p.eliminado === true) return;
    const fecha = normalizarFecha(
      p.fecha_movimiento || ajusteData.fecha_movimiento || ajusteData.fecha ||
      p.creado_en || ajusteData.creado_en || ""
    );
    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;
    const codigoOriginal = String(p.codigo || p.codigoKey || "").trim();
    const codigoKey = normalizarCodigo(p.codigoKey || codigoOriginal);
    const nombre = String(p.nombre || p.descripcion || "").trim();
    const diferencia = Number(p.diferencia || 0);
    const existenciaFisica = Number(p.existencia_fisica || 0);
    const existenciaTeorica = Number(p.existencia_teorica || 0);
    if (!codigoKey && !nombre && !diferencia) return;
    const fechaDDMMYY = fecha.replaceAll("-", "").substring(2);
    const folioAju = String(ajusteData.folio || ajusteId || "").trim();
    items.push({
      tipo: "AJUINV", docId: ajusteId, partida: p.partida || partidaDoc.id || "",
      folio: folioAju || `AJUINV-${fechaDDMMYY}`, fecha,
      hora: String(p.hora_movimiento || ajusteData.hora_movimiento || "").trim(),
      destino: "AJUSTE INVENTARIO", entrega: "AJUINV",
      recibe: String(ajusteData.usuario || ajusteData.usuario_nombre || "").trim(),
      folioCincho: "", proveedor: "", alias_pivot: "", rfc_emisor: "", razon_social_emisor: "",
      codigo: codigoOriginal, codigoKey, nombre, cantidad: diferencia, diferencia,
      existencia_fisica: existenciaFisica, existencia_teorica: existenciaTeorica
    });
  });
  return items;
}

async function reconstruirPivotTrasCambioRealtime(fechaMinima, mensaje) {
  if (fechaMinima) await invalidarCacheDesdeMovimiento(fechaMinima);
  const rango = obtenerRangoSemana();
  construirPivot(
    registrosDetalleSemana, registrosDetalleAcumuladoAnterior,
    registrosEntradasSemana, registrosEntradasAcumuladoAnterior,
    registrosAjustesSemana, registrosAjustesAcumuladoAnterior,
    registrosCigmanSemana, registrosCigmanAcumuladoAnterior,
    rango.inicio, rango.fin
  );
  pintarTabla();
  actualizarResumenSuperior(
    new Set(registrosDetalleSemana.map(x => x.docId)).size,
    new Set(registrosEntradasSemana.map(x => x.docId)).size,
    new Set(registrosAjustesSemana.map(x => x.docId)).size
  );
  await guardarEstadoActualEnIndexedDB(crearCacheKeyActual());
  if (mensaje) setStatus(mensaje);
}

async function aplicarDocumentoRealtime(tipo, cambio) {
  const docSnap = cambio.doc;
  const docId = docSnap.id;
  let arrSemana, arrAnterior, nuevos = [];
  if (tipo === "SALIDAS") {
    arrSemana = registrosDetalleSemana; arrAnterior = registrosDetalleAcumuladoAnterior;
    if (cambio.type !== "removed") nuevos = movimientosSalidaDesdeSnapshot(docSnap);
  } else if (tipo === "ENTRADAS") {
    arrSemana = registrosEntradasSemana; arrAnterior = registrosEntradasAcumuladoAnterior;
    if (cambio.type !== "removed") nuevos = movimientosEntradaDesdeSnapshot(docSnap);
  } else if (tipo === "CIGMAN") {
    arrSemana = registrosCigmanSemana; arrAnterior = registrosCigmanAcumuladoAnterior;
    if (cambio.type !== "removed") nuevos = movimientosCigmanDesdeSnapshot(docSnap);
  } else if (tipo === "AJUSTES") {
    arrSemana = registrosAjustesSemana; arrAnterior = registrosAjustesAcumuladoAnterior;
    if (cambio.type !== "removed") nuevos = await movimientosAjusteDesdeSnapshot(docSnap);
  } else return;

  const fechasViejas = quitarDocumentoDeArrays(docId, [arrSemana, arrAnterior]);
  clasificarMovimientosEnRango(nuevos, arrSemana, arrAnterior);
  const fechasNuevas = nuevos.map(x => x.fecha).filter(Boolean);
  const todas = [...fechasViejas, ...fechasNuevas].sort();
  const fechaMin = todas[0] || "";
  if (!fechaMin) return false;

  const rango = obtenerRangoSemana();
  if (fechaMin <= rango.fin) {
    await reconstruirPivotTrasCambioRealtime(
      fechaMin,
      `Actualización automática: ${tipo.toLowerCase()} sincronizado desde Firebase.`
    );
  } else {
    await invalidarCacheDesdeMovimiento(fechaMin);
  }
  return true;
}

async function iniciarListenerIncremental(nombre, refColeccion, campoSync) {
  const metaKey = `ultima_sync_${nombre.toLowerCase()}`;
  const guardado = await leerMetaSync(metaKey);
  const ahora = Date.now();
  const desdeMs = Math.max(FECHA_BASE_INVENTARIO ? new Date(`${FECHA_BASE_INVENTARIO}T00:00:00`).getTime() : 0,
    Number(guardado?.valor || ahora) - SOLAPE_SYNC_MS);
  const q = query(refColeccion, where(campoSync, ">=", Timestamp.fromMillis(desdeMs)));

  const unsub = onSnapshot(q, (snap) => {
    realtimeQueue = realtimeQueue.then(async () => {
      try {
        for (const cambio of snap.docChanges()) {
          await aplicarDocumentoRealtime(nombre, cambio);
        }
        await guardarMetaSync(metaKey, Date.now());
      } catch (err) {
        console.error(`Realtime ${nombre}:`, err);
      }
    });
  }, (err) => console.error(`Listener ${nombre}:`, err));

  realtimeUnsubs.push(unsub);
}

async function iniciarSincronizacionTiempoReal() {
  try {
    await Promise.all([
      iniciarListenerIncremental("SALIDAS", REF_SALIDAS_CIGARRO, "actualizado_en"),
      iniciarListenerIncremental("ENTRADAS", REF_ENTRADAS_CIGARRO, "creado_en"),
      iniciarListenerIncremental("CIGMAN", REF_CIGMAN_CIGARRO, "creado_en"),
      iniciarListenerIncremental("AJUSTES", REF_AJUSTES_INVENTARIO_CIGARRO, "actualizado_en")
    ]);
  } catch (err) {
    console.error("No se pudo iniciar sincronización automática:", err);
  }
}

window.addEventListener("beforeunload", () => {
  realtimeUnsubs.forEach((u) => { try { u(); } catch {} });
  realtimeUnsubs = [];
});

document.addEventListener("DOMContentLoaded", async () => {
  iniciarLoaderTimer();
  setStatus("Abriendo IndexedDB local...");
  inicializarEventos();
  await cargarSalidasZapata();
  await cargarListadosResumenProveedor();

  iniciarModuloCigman({
    obtenerArticulos: obtenerArticulosParaAjuste,
    onCigmanGuardado: aplicarCigmanGuardadoLocal
  });

  iniciarModuloAjustesInventarioCigarro({
    obtenerArticulos: obtenerArticulosParaAjuste,
    calcularExistenciaTeorica: calcularExistenciaTeoricaParaAjuste,
    onAjusteGuardado: async (ajuste) => {
      await aplicarAjusteGuardadoLocal(ajuste);
    }
  });

  // V13: después de pintar desde IndexedDB/Firebase, queda escuchando novedades.
  await iniciarSincronizacionTiempoReal();
});
