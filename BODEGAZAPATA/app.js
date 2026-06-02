import { db } from "./config.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FECHA_BASE_INVENTARIO = "2026-05-25";
const FECHA_INICIO_MINIMA = "2026-05-25";
const CONTEO_ID_INVENTARIO = "ZAPATA010626";

const REF_SALIDAS_ZAPATA = collection(
  db,
  "almacenes",
  "almacen_zapata",
  "salidas1.0"
);

const REF_USUARIOS_INVENTARIO = collection(
  db,
  "almacenes",
  "almacen_zapata",
  "Inventarios",
  CONTEO_ID_INVENTARIO,
  "USUARIOS"
);

const $ = (id) => document.getElementById(id);

let registrosDetalleSemana = [];
let registrosDetalleAcumuladoAnterior = [];
let registrosPivot = [];
let fechasColumnas = [];
let inventarioInicialOriginal = {};
let vistaActual = "resumen";
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

    return v;
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

async function cargarInventarioInicial() {
  const inventario = {};

  setStatus(`Cargando inventario inicial ${CONTEO_ID_INVENTARIO}...`);
  setProgress(8);

  const usuariosSnap = await getDocs(REF_USUARIOS_INVENTARIO);

  let usuariosLeidos = 0;
  let partidasLeidas = 0;

  for (const usuarioDoc of usuariosSnap.docs) {
    usuariosLeidos++;

    const refPartidas = collection(
      db,
      "almacenes",
      "almacen_zapata",
      "Inventarios",
      CONTEO_ID_INVENTARIO,
      "USUARIOS",
      usuarioDoc.id,
      "PARTIDAS"
    );

    const partidasSnap = await getDocs(refPartidas);

    partidasSnap.forEach((docu) => {
      const p = docu.data() || {};

      if (p.eliminado === true) return;

      const codigoOriginal = String(p.codigo || p.productoId || p.codigoOriginal || "").trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(p.descripcion || p.nombre || "").trim();
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

      if (!inventario[key].codigo && codigoOriginal) {
        inventario[key].codigo = codigoOriginal;
      }

      if (!inventario[key].nombre && nombre) {
        inventario[key].nombre = nombre;
      }

      partidasLeidas++;
    });
  }

  inventarioInicialOriginal = inventario;

  setStatus(
    `Inventario inicial cargado. Usuarios: ${usuariosLeidos}. Partidas: ${partidasLeidas}.`
  );

  return inventario;
}

async function consultarSalidas(inicio, fin) {
  if (fin < inicio) return [];

  const q = query(
    REF_SALIDAS_ZAPATA,
    where("fecha", ">=", inicio),
    where("fecha", "<=", fin),
    orderBy("fecha", "desc")
  );

  const snap = await getDocs(q);
  const detalle = [];
  const docsVistos = new Set();

  snap.forEach((documento) => {
    const data = documento.data() || {};
    docsVistos.add(documento.id);

    const fecha = normalizarFecha(data.fecha || data.timestamp || "");
    if (!fecha || fecha < FECHA_INICIO_MINIMA) return;

    const articulos = Array.isArray(data.articulos) ? data.articulos : [];

    articulos.forEach((art, idx) => {
      const codigoOriginal = String(art.codigo ?? "").trim();
      const codigoKey = normalizarCodigo(codigoOriginal);
      const nombre = String(art.nombre ?? "").trim();
      const cantidad = Number(art.cantidad || 0);

      if (!codigoKey && !nombre && !cantidad) return;

      detalle.push({
        docId: documento.id,
        partida: idx + 1,
        folio: String(data.folio || documento.id || "").trim(),
        fecha,
        destino: String(data.destino || "").trim(),
        entrega: String(data.entrega || "").trim(),
        recibe: String(data.recibe || "").trim(),
        folioCincho: String(data.folioCincho || "").trim(),
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

async function cargarSalidasZapata() {
  try {
    const rango = obtenerRangoSemana();

    await cargarInventarioInicial();

    setStatus(
      `Consultando semana ${rango.inicio} a ${rango.fin}. Acumulado anterior hasta ${rango.acumuladoAnteriorFin}...`
    );
    setProgress(25);

    const consultaSemana = await consultarSalidas(rango.inicio, rango.fin);
    setProgress(55);

    let consultaAcumuladoAnterior = {
      detalle: [],
      totalDocs: 0
    };

    if (rango.acumuladoAnteriorFin >= FECHA_BASE_INVENTARIO) {
      consultaAcumuladoAnterior = await consultarSalidas(
        FECHA_BASE_INVENTARIO,
        rango.acumuladoAnteriorFin
      );
    }

    setProgress(75);

    registrosDetalleSemana = consultaSemana.detalle;
    registrosDetalleAcumuladoAnterior = consultaAcumuladoAnterior.detalle;

    construirPivot(
      registrosDetalleSemana,
      registrosDetalleAcumuladoAnterior,
      rango.inicio,
      rango.fin
    );

    actualizarResumenSuperior(consultaSemana.totalDocs);
    pintarTabla();

    setProgress(100);
    setStatus(
      `Consulta lista. Semana: ${fechaCorta(rango.inicio)} a ${fechaCorta(rango.fin)}. Partidas semana: ${registrosDetalleSemana.length}. Acumulado anterior: ${registrosDetalleAcumuladoAnterior.length}.`
    );

    ocultarLoader();
  } catch (error) {
    console.error(error);
    setStatus("Error al cargar salidas Zapata: " + error.message);
    ocultarLoader();
  }
}

function construirPivot(detalleSemana, detalleAcumuladoAnterior, inicioSemana, finSemana) {
  const mapa = new Map();

  fechasColumnas = crearFechasSemana(inicioSemana, finSemana);

  Object.keys(inventarioInicialOriginal).forEach((key) => {
    const inv = inventarioInicialOriginal[key];

    mapa.set(key, {
      codigo: inv.codigo,
      codigoKey: inv.codigoKey,
      nombre: inv.nombre,
      inviniOriginal: Number(inv.inviniOriginal || 0),
      salidasAcumuladasAnteriores: 0,
      inviniSemana: Number(inv.inviniOriginal || 0),
      porFecha: {},
      totalSemana: 0,
      existenciaFinalSemana: Number(inv.inviniOriginal || 0)
    });
  });

  detalleAcumuladoAnterior.forEach((item) => {
    const key = item.codigoKey || item.nombre.toLowerCase();

    if (!mapa.has(key)) {
      mapa.set(key, {
        codigo: item.codigo,
        codigoKey: item.codigoKey,
        nombre: item.nombre,
        inviniOriginal: 0,
        salidasAcumuladasAnteriores: 0,
        inviniSemana: 0,
        porFecha: {},
        totalSemana: 0,
        existenciaFinalSemana: 0
      });
    }

    const row = mapa.get(key);

    if (!row.codigo && item.codigo) row.codigo = item.codigo;
    if (!row.nombre && item.nombre) row.nombre = item.nombre;

    row.salidasAcumuladasAnteriores += Number(item.cantidad || 0);
  });

  mapa.forEach((row) => {
    row.inviniSemana =
      Number(row.inviniOriginal || 0) -
      Number(row.salidasAcumuladasAnteriores || 0);

    row.existenciaFinalSemana = row.inviniSemana;
  });

  detalleSemana.forEach((item) => {
    const key = item.codigoKey || item.nombre.toLowerCase();

    if (!mapa.has(key)) {
      mapa.set(key, {
        codigo: item.codigo,
        codigoKey: item.codigoKey,
        nombre: item.nombre,
        inviniOriginal: 0,
        salidasAcumuladasAnteriores: 0,
        inviniSemana: 0,
        porFecha: {},
        totalSemana: 0,
        existenciaFinalSemana: 0
      });
    }

    const row = mapa.get(key);

    if (!row.codigo && item.codigo) row.codigo = item.codigo;
    if (!row.nombre && item.nombre) row.nombre = item.nombre;

    row.porFecha[item.fecha] =
      Number(row.porFecha[item.fecha] || 0) + Number(item.cantidad || 0);

    row.totalSemana += Number(item.cantidad || 0);

    row.existenciaFinalSemana =
      Number(row.inviniSemana || 0) - Number(row.totalSemana || 0);
  });

  registrosPivot = Array.from(mapa.values())
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

function actualizarResumenSuperior(totalDocsSemana) {
  const totalCantidadSemana = registrosDetalleSemana.reduce(
    (sum, x) => sum + Number(x.cantidad || 0),
    0
  );

  if ($("totalDocs")) $("totalDocs").textContent = totalDocsSemana;
  if ($("totalPartidas")) $("totalPartidas").textContent = registrosDetalleSemana.length;
  if ($("totalCantidad")) $("totalCantidad").textContent = fmtNum(totalCantidadSemana);
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
    item.codigo,
    item.nombre,
    item.folio,
    item.destino,
    item.entrega,
    item.recibe
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

  thead.innerHTML = `
    <tr>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>INVINI<br>SEMANA</th>
      ${fechasColumnas.map(f => `<th>SALIDA<br>${fechaCorta(f)}</th>`).join("")}
      <th>TOTAL<br>SEMANA</th>
      <th>EXISTENCIA<br>FINAL</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="left codigo">${escapeHtml(r.codigo)}</td>
      <td class="left">${escapeHtml(r.nombre)}</td>
      <td class="cantidad">${fmtNum(r.inviniSemana)}</td>
      ${fechasColumnas.map(f => {
        const val = Number(r.porFecha[f] || 0);
        return `<td class="${val ? "cantidad" : ""}">${fmtCelda(val)}</td>`;
      }).join("")}
      <td class="cantidad">${fmtNum(r.totalSemana)}</td>
      <td class="cantidad">${fmtNum(r.existenciaFinalSemana)}</td>
    </tr>
  `).join("");

  const totalPorFecha = {};
  fechasColumnas.forEach(f => totalPorFecha[f] = 0);

  rows.forEach(r => {
    fechasColumnas.forEach(f => {
      totalPorFecha[f] += Number(r.porFecha[f] || 0);
    });
  });

  const totalInviniSemana = rows.reduce((sum, r) => sum + Number(r.inviniSemana || 0), 0);
  const granTotalSemana = rows.reduce((sum, r) => sum + Number(r.totalSemana || 0), 0);
  const totalExistenciaFinal = rows.reduce((sum, r) => sum + Number(r.existenciaFinalSemana || 0), 0);

  tfoot.innerHTML = `
    <tr>
      <td class="left" colspan="2">TOTAL</td>
      <td>${fmtNum(totalInviniSemana)}</td>
      ${fechasColumnas.map(f => `<td>${fmtNum(totalPorFecha[f])}</td>`).join("")}
      <td>${fmtNum(granTotalSemana)}</td>
      <td>${fmtNum(totalExistenciaFinal)}</td>
    </tr>
  `;
}

function pintarDetalle() {
  const tabla = $("tabla");
  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  const tfoot = tabla.querySelector("tfoot");

  const rows = registrosDetalleSemana.filter(pasaFiltroDetalle);
  const totalCantidad = rows.reduce((sum, x) => sum + Number(x.cantidad || 0), 0);

  thead.innerHTML = `
    <tr>
      <th>Fecha</th>
      <th class="left">Folio</th>
      <th class="left">Destino</th>
      <th class="left">Entrega</th>
      <th class="left">Recibe</th>
      <th>Partida</th>
      <th class="left">Código</th>
      <th class="left">Nombre</th>
      <th>Cantidad</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((r) => `
    <tr>
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
      <td class="left" colspan="8">TOTAL SEMANA</td>
      <td>${fmtNum(totalCantidad)}</td>
    </tr>
  `;
}

function exportarExcel() {
  let rows;

  if (vistaActual === "detalle") {
    rows = registrosDetalleSemana.filter(pasaFiltroDetalle).map((r) => ({
      Fecha: r.fecha,
      Folio: r.folio,
      Destino: r.destino,
      Entrega: r.entrega,
      Recibe: r.recibe,
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
        obj[`SALIDA ${fechaCorta(f)}`] = Number(r.porFecha[f] || 0);
      });

      obj["TOTAL SEMANA"] = Number(r.totalSemana || 0);
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
    `salidas_zapata_${vistaActual}_${rangoSemanaActual.inicio}_a_${rangoSemanaActual.fin}.xlsx`
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
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarEventos();
  await cargarSalidasZapata();
});
