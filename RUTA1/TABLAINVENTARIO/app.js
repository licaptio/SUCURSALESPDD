import { db } from "./config.js";
import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const REF_INVENTARIO_RUTA1 = collection(
  db,
  "TIENDAS",
  "RUTA1",
  "INVENTARIOS"
);

const REF_ENTRADAS_RUTA1 = collection(
  db,
  "almacenes",
  "Almacen_Ruta_1",
  "entradas"
);

const REF_VENTAS_RUTAV2 = collection(
  db,
  "ventas_rutav2"
);

const FECHA_BASE_INVENTARIO = "2026-05-14";
const FECHA_INICIO_MINIMA = "2026-05-14";
const CORTE_INVENTARIO_TXT = "2026-05-14 23:59:59";
const CORTE_INVENTARIO = new Date("2026-05-14T23:59:59-06:00");
const RUTA_ID_VENTAS = "Almacen_Ruta_1";

const $ = (id) => document.getElementById(id);

let registrosDetalleSemana = [];
let registrosDetalleAcumuladoAnterior = [];
let registrosEntradasSemana = [];
let registrosEntradasAcumuladoAnterior = [];
let registrosDetalleMovimientoSemana = [];
let registrosPivot = [];
let fechasColumnas = [];

let inventarioInicialOriginal = {};
let proveedoresAutorizadosPivot = {};
let vistaActual = "resumen";

let appCargada = false;
let cacheBaseCargado = false;
let cacheInventarioInicial = {};
let cacheVentasTodas = [];
let cacheEntradasTodas = [];
let cacheSemanas = new Map();
let cargaBasePromise = null;

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


function parseFechaCompleta(...vals) {
  for (const val of vals) {
    if (val === null || val === undefined || val === "") continue;

    if (typeof val?.toDate === "function") return val.toDate();

    if (typeof val === "number") {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) return d;
    }

    if (typeof val === "string") {
      let s = val.trim();

      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
        s = s.replace(" ", "T") + "-06:00";
      }

      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  return null;
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

function mostrarLoaderEntrada(msg = "Entrando a la aplicación...") {
  const loader = $("loader");
  if (!loader) return;
  loader.classList.remove("hide");
  loader.classList.remove("transition");
  setStatus(msg);
  setProgress(5);
}

function mostrarTransicionSemana(msg = "Calculando semana...") {
  const loader = $("loader");
  if (!loader) return;
  loader.classList.remove("hide");
  loader.classList.add("transition");
  setStatus(msg);
  setProgress(35);
}

function ocultarTransiciones() {
  const loader = $("loader");
  if (!loader) return;
  loader.classList.add("hide");
  loader.classList.remove("transition");
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

function obtenerAliasProveedorPivot(rfc, razonSocial) {
  return String(razonSocial || rfc || "ENTRADA").trim();
}

function obtenerProveedoresEntradaPorFecha(fecha) {
  const proveedores = registrosEntradasSemana
    .filter(x => x.fecha === fecha)
    .map(x => String(x.alias_pivot || x.proveedor || x.entrega || "").trim())
    .filter(Boolean);

  return [...new Set(proveedores)].join(" / ");
}

async function cargarInventarioInicial() {
  if (cacheBaseCargado && cacheInventarioInicial) {
    inventarioInicialOriginal = cacheInventarioInicial;
    return cacheInventarioInicial;
  }

  const inventario = {};

  setStatus(`Cargando inventario inicial Ruta 1 al corte ${CORTE_INVENTARIO_TXT}...`);
  setProgress(12);

  const snap = await getDocs(REF_INVENTARIO_RUTA1);

  let partidasLeidas = 0;

  snap.forEach((docu) => {
    const p = docu.data() || {};
    if (p.eliminado === true) return;

    const fechaRegistro = parseFechaCompleta(p.fecha, p.epochMs);
    if (fechaRegistro && fechaRegistro > CORTE_INVENTARIO) return;

    const codigoOriginal = String(p.codigo || p.productoId || p.codigoOriginal || docu.id || "").trim();
    const codigoKey = normalizarCodigo(codigoOriginal);
    const nombre = String(p.descripcion || p.nombre || p.concepto || "").trim();
    const cantidad = Number(p.cantidad || 0);

    if (!codigoKey && !nombre && !cantidad) return;

    const key = codigoKey || nombre.toLowerCase();

    if (!inventario[key]) {
      inventario[key] = {
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        inviniOriginal: 0,
        fechaBase: FECHA_BASE_INVENTARIO
      };
    }

    inventario[key].inviniOriginal += cantidad;

    if (!inventario[key].codigo && codigoOriginal) inventario[key].codigo = codigoOriginal;
    if (!inventario[key].nombre && nombre) inventario[key].nombre = nombre;

    partidasLeidas++;
  });

  inventarioInicialOriginal = inventario;
  cacheInventarioInicial = inventario;

  setStatus(`Inventario inicial Ruta 1 cargado. Partidas: ${partidasLeidas}.`);

  return inventario;
}


async function cargarVentasRuta1UnaVez() {
  if (cacheBaseCargado && cacheVentasTodas.length) return cacheVentasTodas;

  setStatus("Cargando ventas Ruta 1...");
  setProgress(45);

  const q = query(
    REF_VENTAS_RUTAV2,
    where("rutaId", "==", RUTA_ID_VENTAS)
  );

  const snap = await getDocs(q);
  const ventas = [];

  snap.forEach((documento) => {
    const data = documento.data() || {};
    if (data.cancelada === true || data.estatus === "cancelada") return;
    if (data.rutaId !== RUTA_ID_VENTAS) return;

    const fecha = normalizarFecha(data.fecha || data.facturada_at || data.fecha_txt || data.createdAt || "");
    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;

    const articulos = Array.isArray(data.detalle) ? data.detalle : [];

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(art.codigo ?? art.id ?? art.codigoBarra ?? "").trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(art.nombre ?? art.descripcion ?? art.concepto ?? "").trim();
      const cantidad = Number(art.cantidad || 0);

      if (!codigoKey && !nombre && !cantidad) return;

      ventas.push({
        tipo: "SALIDA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folio || data.folio_fiscal || data.factura || documento.id || "").trim(),
        fecha,
        destino: String(data.cliente || "VENTA RUTA 1").trim(),
        entrega: String(data.usuarioNombre || data.usuario || "").trim(),
        recibe: String(data.cliente || "").trim(),
        folioCincho: "",
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

  cacheVentasTodas = ventas;
  return ventas;
}

async function consultarSalidas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  const ventas = await cargarVentasRuta1UnaVez();
  const detalle = ventas.filter(x => x.fecha >= inicio && x.fecha <= fin);
  const docsVistos = new Set(detalle.map(x => x.docId));

  return {
    detalle,
    totalDocs: docsVistos.size
  };
}


function obtenerArticulosEntradaRuta1(data) {
  if (Array.isArray(data.articulos)) return data.articulos;
  if (Array.isArray(data.detalle)) return data.detalle;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.productos)) return data.productos;

  if (
    data.codigo ||
    data.codigoBarra ||
    data.id ||
    data.productoId ||
    data.codigo_interno
  ) {
    return [data];
  }

  return [];
}

async function cargarEntradasRuta1UnaVez() {
  if (cacheBaseCargado && cacheEntradasTodas.length) return cacheEntradasTodas;

  setStatus("Cargando entradas Ruta 1...");
  setProgress(65);

  const snap = await getDocs(REF_ENTRADAS_RUTA1);
  const entradas = [];

  snap.forEach((documento) => {
    const data = documento.data() || {};

    const fecha = normalizarFecha(
      data.fecha ||
      data.fecha_factura ||
      data.creado_en ||
      data.createdAt ||
      data.fechaRegistro ||
      data.timestamp ||
      ""
    );

    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;

    const proveedor = String(
      data.proveedor ||
      data.proveedorNombre ||
      data.razon_social_emisor ||
      data.usuario ||
      "ENTRADA RUTA 1"
    ).trim();

    const articulos = obtenerArticulosEntradaRuta1(data);

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(
        art.codigo_interno ||
        art.codigo ||
        art.codigoBarra ||
        art.id ||
        art.productoId ||
        ""
      ).trim();

      const codigoKey = normalizarCodigo(codigoOriginal);

      const nombre = String(
        art.descripcion_interna ||
        art.descripcion_factura ||
        art.descripcion ||
        art.concepto ||
        art.nombre ||
        ""
      ).trim();

      const cantidad = Number(
        art.cantidad_entrada ||
        art.cantidadEntrada ||
        art.cantidad ||
        art.piezas ||
        art.unidades ||
        0
      );

      if (!codigoKey && !nombre && !cantidad) return;

      entradas.push({
        tipo: "ENTRADA",
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folioEntrada || data.folio || data.folioRegistro || documento.id || "").trim(),
        fecha,
        destino: "ALMACÉN RUTA 1",
        entrega: proveedor,
        recibe: String(data.usuario || data.usuarioNombre || "").trim(),
        folioCincho: "",
        proveedor,
        rfc_emisor: String(data.rfc_emisor || "").trim().toUpperCase(),
        razon_social_emisor: String(data.razon_social_emisor || proveedor || "").trim(),
        alias_pivot: proveedor,
        codigo: codigoOriginal,
        codigoKey,
        nombre,
        cantidad
      });
    });
  });

  cacheEntradasTodas = entradas;
  return entradas;
}

async function consultarEntradas(inicio, fin) {
  if (fin < inicio) return { detalle: [], totalDocs: 0 };

  const entradas = await cargarEntradasRuta1UnaVez();
  const detalle = entradas.filter(x => x.fecha >= inicio && x.fecha <= fin);
  const docsVistos = new Set(detalle.map(x => x.docId));

  return {
    detalle,
    totalDocs: docsVistos.size
  };
}



async function asegurarDatosBaseCargados() {
  if (cacheBaseCargado) return;

  if (cargaBasePromise) {
    await cargaBasePromise;
    return;
  }

  cargaBasePromise = (async () => {
    await cargarInventarioInicial();
    await cargarVentasRuta1UnaVez();
    await cargarEntradasRuta1UnaVez();
    cacheBaseCargado = true;
  })();

  await cargaBasePromise;
  cargaBasePromise = null;
}

function claveSemana(rango) {
  return `${rango.inicio}_${rango.fin}`;
}

function guardarSemanaEnCache(clave) {
  cacheSemanas.set(clave, {
    registrosDetalleSemana: [...registrosDetalleSemana],
    registrosDetalleAcumuladoAnterior: [...registrosDetalleAcumuladoAnterior],
    registrosEntradasSemana: [...registrosEntradasSemana],
    registrosEntradasAcumuladoAnterior: [...registrosEntradasAcumuladoAnterior],
    registrosDetalleMovimientoSemana: [...registrosDetalleMovimientoSemana],
    registrosPivot: registrosPivot.map(r => ({
      ...r,
      entradasPorFecha: { ...r.entradasPorFecha },
      salidasPorFecha: { ...r.salidasPorFecha }
    })),
    fechasColumnas: [...fechasColumnas],
    rangoSemanaActual: { ...rangoSemanaActual }
  });
}

function cargarSemanaDesdeCache(clave) {
  const cache = cacheSemanas.get(clave);
  if (!cache) return false;

  registrosDetalleSemana = [...cache.registrosDetalleSemana];
  registrosDetalleAcumuladoAnterior = [...cache.registrosDetalleAcumuladoAnterior];
  registrosEntradasSemana = [...cache.registrosEntradasSemana];
  registrosEntradasAcumuladoAnterior = [...cache.registrosEntradasAcumuladoAnterior];
  registrosDetalleMovimientoSemana = [...cache.registrosDetalleMovimientoSemana];
  registrosPivot = cache.registrosPivot.map(r => ({
    ...r,
    entradasPorFecha: { ...r.entradasPorFecha },
    salidasPorFecha: { ...r.salidasPorFecha }
  }));
  fechasColumnas = [...cache.fechasColumnas];
  rangoSemanaActual = { ...cache.rangoSemanaActual };

  return true;
}

function pintarSemanaCacheada() {
  actualizarResumenSuperior(
    new Set(registrosDetalleSemana.map(x => x.docId)).size,
    new Set(registrosEntradasSemana.map(x => x.docId)).size
  );
  pintarTabla();
}

async function cargarMovimientosRuta1() {
  try {
    const rango = obtenerRangoSemana();
    const clave = claveSemana(rango);
    const textoSemana = `${fechaCorta(rango.inicio)} a ${fechaCorta(rango.fin)}`;

    if (!appCargada) {
      mostrarLoaderEntrada("Entrando a Inventario Ruta 1...");
    } else {
      mostrarTransicionSemana(`Calculando semana ${textoSemana}...`);
    }

    await new Promise(resolve => setTimeout(resolve, 60));

    if (cacheSemanas.has(clave)) {
      setProgress(80);
      setStatus(`Recuperando semana ${textoSemana} desde memoria...`);
      cargarSemanaDesdeCache(clave);
      pintarSemanaCacheada();

      setProgress(100);
      setStatus(
        `Consulta lista. Semana: ${textoSemana}. Entradas semana: ${registrosEntradasSemana.length}. Salidas semana: ${registrosDetalleSemana.length}.`
      );

      appCargada = true;
      setTimeout(ocultarTransiciones, 180);
      return;
    }

    await asegurarDatosBaseCargados();

    setStatus(`Calculando semana ${textoSemana}. Acumulado anterior hasta ${rango.acumuladoAnteriorFin}...`);
    setProgress(appCargada ? 55 : 78);

    const ventasTodas = cacheVentasTodas;
    const entradasTodas = cacheEntradasTodas;

    const detalleSemana = ventasTodas.filter(x => x.fecha >= rango.inicio && x.fecha <= rango.fin);
    const entradasSemana = entradasTodas.filter(x => x.fecha >= rango.inicio && x.fecha <= rango.fin);

    let detalleAcumuladoAnterior = [];
    let entradasAcumuladoAnterior = [];

    if (rango.acumuladoAnteriorFin >= FECHA_BASE_INVENTARIO) {
      detalleAcumuladoAnterior = ventasTodas.filter(
        x => x.fecha >= FECHA_BASE_INVENTARIO && x.fecha <= rango.acumuladoAnteriorFin
      );

      entradasAcumuladoAnterior = entradasTodas.filter(
        x => x.fecha >= FECHA_BASE_INVENTARIO && x.fecha <= rango.acumuladoAnteriorFin
      );
    }

    registrosDetalleSemana = detalleSemana;
    registrosDetalleAcumuladoAnterior = detalleAcumuladoAnterior;
    registrosEntradasSemana = entradasSemana;
    registrosEntradasAcumuladoAnterior = entradasAcumuladoAnterior;

    registrosDetalleMovimientoSemana = [
      ...registrosEntradasSemana,
      ...registrosDetalleSemana
    ].sort((a, b) => {
      if (a.fecha !== b.fecha) return String(b.fecha).localeCompare(String(a.fecha));
      return String(a.tipo).localeCompare(String(b.tipo));
    });

    construirPivot(
      registrosDetalleSemana,
      registrosDetalleAcumuladoAnterior,
      registrosEntradasSemana,
      registrosEntradasAcumuladoAnterior,
      rango.inicio,
      rango.fin
    );

    actualizarResumenSuperior(
      new Set(registrosDetalleSemana.map(x => x.docId)).size,
      new Set(registrosEntradasSemana.map(x => x.docId)).size
    );

    setProgress(92);
    pintarTabla();
    guardarSemanaEnCache(clave);

    setProgress(100);
    setStatus(
      `Consulta lista. Semana: ${textoSemana}. Entradas semana: ${registrosEntradasSemana.length}. Salidas semana: ${registrosDetalleSemana.length}.`
    );

    appCargada = true;
    setTimeout(ocultarTransiciones, 180);
  } catch (error) {
    console.error(error);
    setStatus("Error al cargar movimientos Ruta 1: " + error.message);
    ocultarTransiciones();
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
      inviniSemana: 0,
      entradasPorFecha: {},
      salidasPorFecha: {},
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
      existenciaFinalSemana: 0
    });
  }

  const row = mapa.get(key);

  if (!row.codigo && item.codigo) row.codigo = item.codigo;
  if (!row.nombre && item.nombre) row.nombre = item.nombre;

  return row;
}

function construirPivot(
  detalleSemana,
  detalleAcumuladoAnterior,
  entradasSemana,
  entradasAcumuladoAnterior,
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
      inviniSemana: Number(inv.inviniOriginal || 0),
      entradasPorFecha: {},
      salidasPorFecha: {},
      totalEntradasSemana: 0,
      totalSalidasSemana: 0,
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

  mapa.forEach((row) => {
    row.inviniSemana =
      Number(row.inviniOriginal || 0) +
      Number(row.entradasAcumuladasAnteriores || 0) -
      Number(row.salidasAcumuladasAnteriores || 0);

    row.existenciaFinalSemana = row.inviniSemana;
  });

  entradasSemana.forEach((item) => {
    const row = asegurarRow(mapa, item);

    row.entradasPorFecha[item.fecha] =
      Number(row.entradasPorFecha[item.fecha] || 0) + Number(item.cantidad || 0);

    row.totalEntradasSemana += Number(item.cantidad || 0);

    row.existenciaFinalSemana =
      Number(row.inviniSemana || 0) +
      Number(row.totalEntradasSemana || 0) -
      Number(row.totalSalidasSemana || 0);
  });

  detalleSemana.forEach((item) => {
    const row = asegurarRow(mapa, item);

    row.salidasPorFecha[item.fecha] =
      Number(row.salidasPorFecha[item.fecha] || 0) + Number(item.cantidad || 0);

    row.totalSalidasSemana += Number(item.cantidad || 0);

    row.existenciaFinalSemana =
      Number(row.inviniSemana || 0) +
      Number(row.totalEntradasSemana || 0) -
      Number(row.totalSalidasSemana || 0);
  });

  registrosPivot = Array.from(mapa.values())
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

function actualizarResumenSuperior(totalDocsSemana, totalDocsEntradasSemana) {
  const totalCantidadSalidasSemana = registrosDetalleSemana.reduce(
    (sum, x) => sum + Number(x.cantidad || 0),
    0
  );

  const totalCantidadEntradasSemana = registrosEntradasSemana.reduce(
    (sum, x) => sum + Number(x.cantidad || 0),
    0
  );

  if ($("totalDocs")) {
    $("totalDocs").textContent =
      Number(totalDocsSemana || 0) + Number(totalDocsEntradasSemana || 0);
  }

  if ($("totalPartidas")) {
    $("totalPartidas").textContent = registrosDetalleMovimientoSemana.length;
  }

  if ($("totalCantidad")) {
    $("totalCantidad").textContent =
      `E ${fmtNum(totalCantidadEntradasSemana)} / S ${fmtNum(totalCantidadSalidasSemana)}`;
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

  thead.innerHTML = `
    <tr>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>INVINI<br>SEMANA</th>

      ${fechasColumnas.map(f => {
        const proveedor = obtenerProveedoresEntradaPorFecha(f);
        const tieneEntrada = fechasConEntrada.includes(f);

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
        `;
      }).join("")}

      <th>TOTAL<br>ENTRADAS</th>
      <th>TOTAL<br>SALIDAS</th>
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
        const tieneEntrada = fechasConEntrada.includes(f);

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
        `;
      }).join("")}

      <td class="cantidad entrada-total">${fmtNum(r.totalEntradasSemana)}</td>
      <td class="cantidad">${fmtNum(r.totalSalidasSemana)}</td>
      <td class="${
  Number(r.existenciaFinalSemana) < 0
    ? 'cantidad negativo-parpadeo'
    : 'cantidad'
}">
  ${fmtNum(r.existenciaFinalSemana)}
</td>
    </tr>
  `).join("");

  const totalEntradasPorFecha = {};
  const totalSalidasPorFecha = {};

  fechasColumnas.forEach(f => {
    totalEntradasPorFecha[f] = 0;
    totalSalidasPorFecha[f] = 0;
  });

  rows.forEach(r => {
    fechasColumnas.forEach(f => {
      totalEntradasPorFecha[f] += Number(r.entradasPorFecha[f] || 0);
      totalSalidasPorFecha[f] += Number(r.salidasPorFecha[f] || 0);
    });
  });

  const totalInviniSemana = rows.reduce((sum, r) => sum + Number(r.inviniSemana || 0), 0);
  const totalEntradasSemana = rows.reduce((sum, r) => sum + Number(r.totalEntradasSemana || 0), 0);
  const totalSalidasSemana = rows.reduce((sum, r) => sum + Number(r.totalSalidasSemana || 0), 0);
  const totalExistenciaFinal = rows.reduce((sum, r) => sum + Number(r.existenciaFinalSemana || 0), 0);

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="2">TOTAL</td>
      <td>${fmtNum(totalInviniSemana)}</td>

      ${fechasColumnas.map(f => {
        const tieneEntrada = fechasConEntrada.includes(f);

        return `
          ${
            tieneEntrada
              ? `<td class="entrada-col">${fmtNum(totalEntradasPorFecha[f])}</td>`
              : ""
          }
          <td class="salida-col">${fmtNum(totalSalidasPorFecha[f])}</td>
        `;
      }).join("")}

      <td>${fmtNum(totalEntradasSemana)}</td>
      <td>${fmtNum(totalSalidasSemana)}</td>
      <td class="${
  totalExistenciaFinal < 0
    ? 'negativo-parpadeo'
    : ''
}">
  ${fmtNum(totalExistenciaFinal)}
</td>
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

  thead.innerHTML = `
    <tr>
      <th>Tipo</th>
      <th>Fecha</th>
      <th class="left">Folio</th>
      <th class="left">Destino / Proveedor</th>
      <th class="left">Entrega / Emisor</th>
      <th class="left">Recibe / Usuario</th>
      <th>Partida</th>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>Cantidad</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.tipo)}</td>
      <td>${escapeHtml(r.fecha)}</td>
      <td class="left">${escapeHtml(r.folio)}</td>
      <td class="left">${escapeHtml(r.destino)}</td>
      <td class="left">${escapeHtml(r.entrega)}</td>
      <td class="left">${escapeHtml(r.recibe)}</td>
      <td>${r.partida}</td>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad">${fmtNum(r.cantidad)}</td>
    </tr>
  `).join("");

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="9">TOTAL ENTRADAS SEMANA</td>
      <td>${fmtNum(totalEntradas)}</td>
    </tr>
    <tr>
      <td class="left" colspan="9">TOTAL SALIDAS SEMANA</td>
      <td>${fmtNum(totalSalidas)}</td>
    </tr>
  `;
}

function exportarExcel() {
  let rows;

  if (vistaActual === "detalle") {
    rows = registrosDetalleMovimientoSemana.filter(pasaFiltroDetalle).map((r) => ({
      Tipo: r.tipo,
      Fecha: r.fecha,
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
      Cantidad: r.cantidad
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
      });

      obj["TOTAL ENTRADAS"] = Number(r.totalEntradasSemana || 0);
      obj["TOTAL SALIDAS"] = Number(r.totalSalidasSemana || 0);
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
    vistaActual === "detalle" ? "Detalle semana" : "Pivot semana"
  );

  XLSX.writeFile(
    wb,
    `inventario_ruta1_${vistaActual}_${rangoSemanaActual.inicio}_a_${rangoSemanaActual.fin}.xlsx`
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
    $("selectorSemana").addEventListener("change", () => {
      mostrarTransicionSemana("Calculando semana...");
      setTimeout(cargarMovimientosRuta1, 40);
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

  $("btnRecargar").addEventListener("click", async () => {
    cacheBaseCargado = false;
    cacheInventarioInicial = {};
    cacheVentasTodas = [];
    cacheEntradasTodas = [];
    cacheSemanas.clear();
    cargaBasePromise = null;
    mostrarLoaderEntrada("Recargando datos desde Firebase...");
    await cargarMovimientosRuta1();
  });
  $("btnExportar").addEventListener("click", exportarExcel);
  $("busqueda").addEventListener("input", pintarTabla);

  $("tabResumen").textContent = "Pivot semanal";
  $("tabResumen").addEventListener("click", () => cambiarVista("resumen"));

  $("tabDetalle").textContent = "Detalle semana";
  $("tabDetalle").addEventListener("click", () => cambiarVista("detalle"));
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarEventos();
  await cargarMovimientosRuta1();
});
