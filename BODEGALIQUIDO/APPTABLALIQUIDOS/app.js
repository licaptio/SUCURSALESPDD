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
  "Almacen_Dulces",
  "entradas"
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
  "Almacen_Dulces",
  "configuracion",
  "proveedores_autorizados",
  "items"
);

const REF_LISTADOS_RESUMEN_PROVEEDOR = collection(
  db,
  "almacenes",
  "Almacen_Dulces",
  "configuracion",
  "listados_resumen_proveedor",
  "items"
);

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
let vistaActual = "resumen";
let listadosResumenProveedor = [];
let listadoConfigActual = null;
let articulosConfigActual = [];

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
  ajustes: [],
  cargadoHasta: "",
  inicializado: false
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
    "Almacen_Dulces",
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
    "Almacen_Dulces",
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

  const snap = await getDocs(REF_PROVEEDORES_AUTORIZADOS_ZAPATA);

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

    const articulos = Array.isArray(data.productos)
      ? data.productos
      : (Array.isArray(data.articulos) ? data.articulos : []);

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

    const articulos = Array.isArray(data.productos)
      ? data.productos
      : (Array.isArray(data.articulos) ? data.articulos : []);

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(
        art.codigoBarra ?? art.codigo ?? art.codigo_interno ?? ""
      ).trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(
        art.concepto ?? art.nombre ?? art.descripcion ?? art.descripcion_interna ?? ""
      ).trim();
      const cantidad = Number(art.cantidad || art.cantidad_entrada || 0);

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
      ajustes: [],
      cargadoHasta: "",
      inicializado: false
    };
  } else if (cacheMovimientos.inicializado) {
    if (fin <= cacheMovimientos.cargadoHasta) return;
    inicioConsulta = sumarDias(cacheMovimientos.cargadoHasta, 1);
  }

  if (fin < inicioConsulta) return;

  setStatus(`Descargando movimientos ${fechaCorta(inicioConsulta)} a ${fechaCorta(fin)}...`);

  const [salidas, entradas, ajustes] = await Promise.all([
    consultarSalidas(inicioConsulta, fin),
    consultarEntradas(inicioConsulta, fin),
    consultarAjustesInventario(inicioConsulta, fin)
  ]);

  anexarSinDuplicados(cacheMovimientos.salidas, salidas.detalle);
  anexarSinDuplicados(cacheMovimientos.entradas, entradas.detalle);
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
    const entradas = dividirMovimientosPorSemana(cacheMovimientos.entradas, rango);
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
      `Entradas: ${registrosEntradasSemana.length}. Salidas: ${registrosDetalleSemana.length}. ` +
      `Ajustes: ${registrosAjustesSemana.length}. Cache temporal hasta ${fechaCorta(cacheMovimientos.cargadoHasta)}.`
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
  return String(item.codigo || "").toLowerCase().includes(q);
}

function pasaFiltroDetalle(item) {
  const q = getFiltroBusqueda();
  if (!q) return true;
  return String(item.codigo || "").toLowerCase().includes(q);
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
    $("btnVerEntradas").disabled = true;
    $("btnVerEntradas").title = "Las entradas se habilitarán cuando comience su captura.";
  }

  if ($("btnVerAjustesInventario")) {
    $("btnVerAjustesInventario").style.display = "none";
  }

  $("btnCerrarAjustesInventario")?.addEventListener("click", async () => {
    ocultarPanelAjustesInventario();
    await cargarSalidasZapata();
  });

  $("btnCerrarEntradasZapata")?.addEventListener("click", async () => {
    ocultarPanelEntradasZapata();
    await cargarSalidasZapata();
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
  await cargarSalidasZapata();
  await cargarListadosResumenProveedor();

});
