import { db } from "./config.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FECHA_BASE_INVENTARIO = "2026-06-01";
const FECHA_INICIO_MINIMA = "2026-06-01";
const CONTEO_ID_INVENTARIO = "CIGARRO010626";

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

const REF_AJUSTES_INVENTARIO_CIGARRO = collection(
  db,
  "almacenes",
  "almacen_cigarro",
  "ajustes_inventario"
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

let registrosDetalleMovimientoSemana = [];
let registrosPivot = [];
let fechasColumnas = [];

let inventarioInicialOriginal = {};
let proveedoresAutorizadosPivot = {};
let vistaActual = "resumen";
let listadosResumenProveedor = [];
let listadoConfigActual = null;
let articulosConfigActual = [];

let rangoSemanaActual = {
  inicio: FECHA_BASE_INVENTARIO,
  fin: FECHA_BASE_INVENTARIO,
  acumuladoAnteriorFin: ""
};

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

function ocultarLoader() {
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
  const valorWeek = selectorSemana?.value || obtenerSemanaActualInput();

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
      <td class="cantidad">${fmtNum(r.existenciaFinalSemana)}</td>
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
  // Almacén cigarro no usa inventario inicial.
  // La existencia se reconstruye desde FECHA_INICIO_MINIMA:
  // entradas - salidas + ajustes, desde 2026-06-01.
  inventarioInicialOriginal = {};
  setStatus(`Inventario inicial omitido. Base de cálculo desde ${FECHA_INICIO_MINIMA}.`);
  setProgress(8);
  return {};
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
      "ajustes_inventario",
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

    await cargarInventarioInicial();
    await cargarProveedoresAutorizadosPivot();

    setStatus(
      `Consultando semana ${rango.inicio} a ${rango.fin}. Acumulado anterior hasta ${rango.acumuladoAnteriorFin}...`
    );
    setProgress(25);

    const consultaSemana = await consultarSalidas(rango.inicio, rango.fin);
    const consultaEntradasSemana = await consultarEntradas(rango.inicio, rango.fin);
    const consultaAjustesSemana = await consultarAjustesInventario(rango.inicio, rango.fin);

    setProgress(55);

    let consultaAcumuladoAnterior = {
      detalle: [],
      totalDocs: 0
    };

    let consultaEntradasAcumuladoAnterior = {
      detalle: [],
      totalDocs: 0
    };

    let consultaAjustesAcumuladoAnterior = {
      detalle: [],
      totalDocs: 0
    };

    if (rango.acumuladoAnteriorFin >= FECHA_BASE_INVENTARIO) {
      consultaAcumuladoAnterior = await consultarSalidas(
        FECHA_BASE_INVENTARIO,
        rango.acumuladoAnteriorFin
      );

      consultaEntradasAcumuladoAnterior = await consultarEntradas(
        FECHA_BASE_INVENTARIO,
        rango.acumuladoAnteriorFin
      );

      consultaAjustesAcumuladoAnterior = await consultarAjustesInventario(
        FECHA_BASE_INVENTARIO,
        rango.acumuladoAnteriorFin
      );
    }

    setProgress(75);

    registrosDetalleSemana = consultaSemana.detalle;
    registrosDetalleAcumuladoAnterior = consultaAcumuladoAnterior.detalle;

    registrosEntradasSemana = consultaEntradasSemana.detalle;
    registrosEntradasAcumuladoAnterior = consultaEntradasAcumuladoAnterior.detalle;

    registrosAjustesSemana = consultaAjustesSemana.detalle;
    registrosAjustesAcumuladoAnterior = consultaAjustesAcumuladoAnterior.detalle;

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

    actualizarResumenSuperior(
      consultaSemana.totalDocs,
      consultaEntradasSemana.totalDocs,
      consultaAjustesSemana.totalDocs
    );

    pintarTabla();

    setProgress(100);
    setStatus(
      `Consulta lista. Semana: ${fechaCorta(rango.inicio)} a ${fechaCorta(rango.fin)}. Entradas: ${registrosEntradasSemana.length}. Salidas: ${registrosDetalleSemana.length}. Ajustes: ${registrosAjustesSemana.length}.`
    );

    ocultarLoader();
  } catch (error) {
    console.error(error);
    setStatus("Error al cargar movimientos Cigarro: " + error.message);
    ocultarLoader();
  }
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
  if (!row.nombre && item.nombre) row.nombre = item.nombre;

  return row;
}

function recalcularExistenciaFinal(row) {
  row.existenciaFinalSemana =
    Number(row.inviniSemana || 0) +
    Number(row.totalEntradasSemana || 0) -
    Number(row.totalSalidasSemana || 0) +
    Number(row.totalAjustesSemana || 0);
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
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
      totalAjustesSemana: 0,
      existenciaFinalSemana: Number(inv.inviniOriginal || 0)
    });
  });

  entradasAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    row.entradasAcumuladasAnteriores += Number(item.cantidad || 0);
  });

  detalleAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    row.salidasAcumuladasAnteriores += Number(item.cantidad || 0);
  });

  ajustesAcumuladoAnterior.forEach((item) => {
    const row = asegurarRow(mapa, item);
    row.ajustesAcumuladosAnteriores += Number(item.diferencia || item.cantidad || 0);
  });

mapa.forEach((row) => {
  row.inviniSemana =
    Number(row.inviniOriginal || 0) +
    Number(row.entradasAcumuladasAnteriores || 0) -
    Number(row.salidasAcumuladasAnteriores || 0) +
    Number(row.ajustesAcumuladosAnteriores || 0);

  row.existenciaFinalSemana = row.inviniSemana;

  // Motor cronológico de la semana
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
      SALIDA: 2,
      AJUINV: 3
    };

    return Number(orden[a.tipo] || 99) - Number(orden[b.tipo] || 99);
  });

  row.movimientosSemana.forEach((mov) => {
    if (mov.tipo === "ENTRADA") {
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
      <th class="left">Código</th>
      <th class="left">Nombre</th>
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

      <th>TOTAL<br>ENTRADAS</th>
      <th>TOTAL<br>SALIDAS</th>
      <th>TOTAL<br>AJUINV</th>
      <th>EXISTENCIA<br>FINAL</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad">${fmtNum(r.inviniSemana)}</td>

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

      <td class="cantidad entrada-total">${fmtNum(r.totalEntradasSemana)}</td>
      <td class="cantidad">${fmtNum(r.totalSalidasSemana)}</td>
      <td class="cantidad">${fmtNum(r.totalAjustesSemana)}</td>
      <td class="cantidad">${fmtNum(r.existenciaFinalSemana)}</td>
    </tr>
  `).join("");

  const totalEntradasPorFecha = {};
  const totalSalidasPorFecha = {};
  const totalAjustesPorFecha = {};

  fechasColumnas.forEach(f => {
    totalEntradasPorFecha[f] = 0;
    totalSalidasPorFecha[f] = 0;
    totalAjustesPorFecha[f] = 0;
  });

  rows.forEach(r => {
    fechasColumnas.forEach(f => {
      totalEntradasPorFecha[f] += Number(r.entradasPorFecha[f] || 0);
      totalSalidasPorFecha[f] += Number(r.salidasPorFecha[f] || 0);
      totalAjustesPorFecha[f] += Number(r.ajustesPorFecha[f] || 0);
    });
  });

  const totalInviniSemana = rows.reduce((sum, r) => sum + Number(r.inviniSemana || 0), 0);
  const totalEntradasSemana = rows.reduce((sum, r) => sum + Number(r.totalEntradasSemana || 0), 0);
  const totalSalidasSemana = rows.reduce((sum, r) => sum + Number(r.totalSalidasSemana || 0), 0);
  const totalAjustesSemana = rows.reduce((sum, r) => sum + Number(r.totalAjustesSemana || 0), 0);
  const totalExistenciaFinal = rows.reduce((sum, r) => sum + Number(r.existenciaFinalSemana || 0), 0);

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="2">TOTAL</td>
      <td>${fmtNum(totalInviniSemana)}</td>

      ${fechasColumnas.map(f => {
        const tieneEntrada = fechasConEntrada.includes(f);
        const tieneAjuste = fechasConAjuste.includes(f);

        return `
          ${
            tieneEntrada
              ? `<td class="entrada-col">${fmtNum(totalEntradasPorFecha[f])}</td>`
              : ""
          }

          <td class="salida-col">${fmtNum(totalSalidasPorFecha[f])}</td>

          ${
            tieneAjuste
              ? `<td class="ajuste-col">${fmtNum(totalAjustesPorFecha[f])}</td>`
              : ""
          }
        `;
      }).join("")}

      <td>${fmtNum(totalEntradasSemana)}</td>
      <td>${fmtNum(totalSalidasSemana)}</td>
      <td>${fmtNum(totalAjustesSemana)}</td>
      <td>${fmtNum(totalExistenciaFinal)}</td>
    </tr>
  `;
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
        Nombre: r.nombre,
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
      Nombre: r.nombre,
      Cantidad_Diferencia: r.tipo === "AJUINV" ? Number(r.diferencia || 0) : Number(r.cantidad || 0),
      Existencia_Teorica: r.tipo === "AJUINV" ? Number(r.existencia_teorica || 0) : "",
      Existencia_Fisica: r.tipo === "AJUINV" ? Number(r.existencia_fisica || 0) : ""
    }));
  } else {
    rows = registrosPivot.filter(pasaFiltroPivot).map((r) => {
      const obj = {
        Codigo: r.codigo,
        Nombre: r.nombre,
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
    `movimientos_cigarro_${vistaActual}_${rangoSemanaActual.inicio}_a_${rangoSemanaActual.fin}.xlsx`
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

function inicializarEventos() {
  crearSelectorSemanaSiNoExiste();

  if ($("selectorSemana")) {
    $("selectorSemana").value = obtenerSemanaActualInput();
    $("selectorSemana").addEventListener("change", cargarSalidasZapata);
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

  $("btnRecargar").addEventListener("click", cargarSalidasZapata);
  $("btnExportar").addEventListener("click", exportarExcel);
  $("busqueda").addEventListener("input", pintarTabla);

  $("tabResumen").textContent = "Pivot semanal";
  $("tabResumen").addEventListener("click", () => cambiarVista("resumen"));

  $("tabDetalle").textContent = "Detalle semana";
  $("tabDetalle").addEventListener("click", () => cambiarVista("detalle"));

  $("btnVerInventarios")?.addEventListener("click", async () => {
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

document.addEventListener("DOMContentLoaded", async () => {
  inicializarEventos();
  await cargarSalidasZapata();
  await cargarListadosResumenProveedor();
});
