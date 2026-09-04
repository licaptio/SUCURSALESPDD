import { db } from "../config.js";
import { collection, getDocs, query, orderBy, limit, startAfter, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const REF_SALIDAS = collection(db, "almacenes", "almacen_zapata", "salidas1.0");
const POR_PAGINA = 30;

const $ = (id) => document.getElementById(id);
const estado = {
  salidas: [],
  filtradas: [],
  pagina: 1,
  busqueda: "",
  salidaActual: null,
  cursores: { 1: null },
  cachePaginas: new Map(),
  haySiguiente: false,
  cargando: false,
  listenerInicializado: false,
  ultimaSalidaDetectada: null,
  recargaAutomaticaPendiente: false
};

function escapeHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function texto(v) { return String(v ?? "").trim(); }

function timestampToDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "object" && Number.isFinite(v.seconds)) return new Date(v.seconds * 1000);
  return null;
}

function extraerFecha(data) {
  const candidatos = [data.fecha, data.fecha_salida, data.creado_en, data.timestamp, data.createdAt, data.fechaHora];
  for (const v of candidatos) {
    const d = timestampToDate(v);
    if (d && !Number.isNaN(d.getTime())) return localISO(d);
    if (typeof v === "string" && v.trim()) {
      const s = v.trim();
      const iso = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const mx = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
      if (mx) return `${mx[3]}-${mx[2]}-${mx[1]}`;
      const parsed = new Date(s);
      if (!Number.isNaN(parsed.getTime())) return localISO(parsed);
    }
  }
  return "";
}

function extraerHora(data) {
  const directos = [data.hora, data.hora_salida, data.hora_movimiento, data.time];
  for (const v of directos) {
    const s = texto(v);
    const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) return `${m[1].padStart(2,"0")}:${m[2]}${m[3] ? `:${m[3]}` : ""}`;
  }
  const candidatos = [data.creado_en, data.timestamp, data.createdAt, data.fechaHora, data.fecha];
  for (const v of candidatos) {
    const d = timestampToDate(v);
    if (d && !Number.isNaN(d.getTime())) return d.toLocaleTimeString("es-MX", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
    if (typeof v === "string") {
      const m = v.match(/[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (m) return `${m[1].padStart(2,"0")}:${m[2]}${m[3] ? `:${m[3]}` : ""}`;
    }
  }
  return "";
}

function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function fechaBonita(iso) {
  if (!iso) return "Sin fecha";
  const [y,m,d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("es-MX", { day:"2-digit", month:"short", year:"numeric" }).format(new Date(y,m-1,d));
}

function claveOrden(s) {
  const hora = (s.hora || "00:00:00").padEnd(8,"0").slice(0,8);
  return `${s.fecha || "0000-00-00"}T${hora}`;
}

function normalizarSalida(docSnap) {
  const data = docSnap.data() || {};
  const articulos = Array.isArray(data.articulos) ? data.articulos.map((a, i) => ({
    partida: i + 1,
    codigo: texto(a?.codigo ?? a?.codigoBarra ?? a?.sku),
    nombre: texto(a?.nombre ?? a?.descripcion ?? a?.concepto),
    cantidad: Number(a?.cantidad ?? a?.cant ?? a?.piezas ?? 0)
  })) : [];

  const salida = {
    id: docSnap.id,
    folio: texto(data.folio) || docSnap.id,
    fecha: extraerFecha(data),
    hora: extraerHora(data),
    destino: texto(data.destino) || "Sin destino",
    entrega: texto(data.entrega),
    recibe: texto(data.recibe),
    folioCincho: texto(data.folioCincho ?? data.folio_cincho),
    articulos,
    datos: data
  };
  salida.buscar = [
    salida.id, salida.folio, salida.fecha, salida.hora, salida.destino,
    salida.entrega, salida.recibe, salida.folioCincho,
    ...articulos.flatMap(a => [a.codigo, a.nombre])
  ].join(" ").toLowerCase();
  return salida;
}

async function cargar() {
  // Recargar significa pedir datos frescos a Firestore y vaciar el cache de navegación.
  estado.cursores = { 1: null };
  estado.cachePaginas.clear();
  estado.pagina = 1;
  await cargarPagina(1, null, true);
}

function usarPaginaCacheada(numeroPagina) {
  const cache = estado.cachePaginas.get(numeroPagina);
  if (!cache) return false;

  estado.salidas = cache.salidas;
  estado.haySiguiente = cache.haySiguiente;
  estado.pagina = numeroPagina;
  aplicarFiltro(false);

  const inicio = (numeroPagina - 1) * POR_PAGINA + 1;
  const fin = inicio + estado.salidas.length - 1;
  $("estado").textContent = estado.salidas.length
    ? `Página ${numeroPagina} recuperada del cache: 0 lecturas nuevas de Firestore.`
    : "No hay más salidas para mostrar.";
  $("rangoMostrado").textContent = estado.salidas.length ? `${inicio}–${fin}` : "0 resultados";
  return true;
}

async function cargarPagina(numeroPagina, cursorInicio, forzarFirestore = false) {
  if (!forzarFirestore && usarPaginaCacheada(numeroPagina)) return;
  if (estado.cargando) return;
  estado.cargando = true;
  $("estado").textContent = `Cargando página ${numeroPagina} · máximo ${POR_PAGINA} salidas...`;
  $("btnRecargar").disabled = true;

  try {
    const partes = [orderBy("folio", "desc")];
    if (cursorInicio) partes.push(startAfter(cursorInicio));
    partes.push(limit(POR_PAGINA));

    const snap = await getDocs(query(REF_SALIDAS, ...partes));
    const docsPagina = snap.docs;

    estado.salidas = docsPagina.map(normalizarSalida).sort((a,b) => {
      const porFechaHora = claveOrden(b).localeCompare(claveOrden(a));
      if (porFechaHora !== 0) return porFechaHora;
      return b.folio.localeCompare(a.folio, "es", { numeric:true });
    });

    // Con limit(30) no gastamos una lectura 31 solo para comprobar.
    // Si llegan 30, se permite intentar la página siguiente. Si ya no hay más,
    // esa siguiente consulta regresará vacía y el usuario puede volver al cache anterior.
    estado.haySiguiente = docsPagina.length === POR_PAGINA;
    estado.pagina = numeroPagina;

    // Cursor para la siguiente página: último documento leído en esta consulta.
    if (docsPagina.length) estado.cursores[numeroPagina + 1] = docsPagina[docsPagina.length - 1];
    else delete estado.cursores[numeroPagina + 1];

    // Guardamos la página completa en memoria. Volver a ella no vuelve a consultar Firestore.
    estado.cachePaginas.set(numeroPagina, {
      salidas: estado.salidas,
      haySiguiente: estado.haySiguiente
    });

    aplicarFiltro(false);
    const inicio = (numeroPagina - 1) * POR_PAGINA + 1;
    const fin = inicio + estado.salidas.length - 1;
    $("estado").textContent = estado.salidas.length
      ? `Página ${numeroPagina} cargada: ${estado.salidas.length} lecturas como máximo desde Firestore.`
      : "No hay más salidas para mostrar.";
    $("rangoMostrado").textContent = estado.salidas.length ? `${inicio}–${fin}` : "0 resultados";
  } catch (error) {
    console.error(error);
    estado.salidas = [];
    estado.filtradas = [];
    estado.haySiguiente = false;
    render();
    $("estado").textContent = `No se pudo leer la página: ${error?.message || error}`;
  } finally {
    estado.cargando = false;
    $("btnRecargar").disabled = false;

    if (estado.recargaAutomaticaPendiente) {
      estado.recargaAutomaticaPendiente = false;
      estado.cursores = { 1: null };
      estado.cachePaginas.clear();
      estado.pagina = 1;
      setTimeout(async () => {
        await cargarPagina(1, null, true);
        $("estado").textContent = "Nueva salida detectada · página 1 actualizada automáticamente.";
      }, 0);
    }
  }
}

function aplicarFiltro(resetPagina = true) {
  const q = estado.busqueda.trim().toLowerCase();
  estado.filtradas = q ? estado.salidas.filter(s => s.buscar.includes(q)) : [...estado.salidas];
  render();
}

function ajustarFolios() {
  document.querySelectorAll(".card-folio strong").forEach(el => {
    el.style.fontSize = "15px";
    let px = 15;
    while (el.scrollWidth > el.clientWidth && px > 8) {
      px -= 0.5;
      el.style.fontSize = `${px}px`;
    }
  });
}

function render() {
  const total = estado.filtradas.length;
  const inicioReal = (estado.pagina - 1) * POR_PAGINA + 1;
  const finReal = inicioReal + estado.salidas.length - 1;

  if (!estado.busqueda) {
    $("rangoMostrado").textContent = estado.salidas.length ? `${inicioReal}–${finReal}` : "0 resultados";
  } else {
    $("rangoMostrado").textContent = `${total} coincidencia${total === 1 ? "" : "s"} en página ${estado.pagina}`;
  }
  $("vacio").classList.toggle("hidden", total > 0);

  $("listaSalidas").innerHTML = estado.filtradas.map((s) => `
    <button type="button" class="salida-card" data-id="${escapeHtml(s.id)}" aria-label="Abrir salida ${escapeHtml(s.folio)} a ${escapeHtml(s.destino)}">
      <div class="card-folio">
        <span class="card-label">FOLIO</span>
        <strong title="${escapeHtml(s.folio || "—")}">${escapeHtml(s.folio || "—")}</strong>
      </div>
      <div class="card-date">
        <span class="card-label">FECHA Y HORA</span>
        <strong>${escapeHtml(fechaBonita(s.fecha))}</strong>
        <span class="card-time">${escapeHtml(s.hora || "Hora no registrada")}</span>
      </div>
      <div class="card-destination">
        <span class="card-label">DESTINO</span>
        <strong>${escapeHtml(s.destino)}</strong>
      </div>
      <div class="card-receiver">
        <span class="card-label">RECIBE</span>
        <strong>${escapeHtml(s.recibe || "No registrado")}</strong>
      </div>
      <div class="card-arrow" aria-hidden="true">›</div>
    </button>
  `).join("");

  $("listaSalidas").querySelectorAll(".salida-card").forEach(btn => {
    btn.addEventListener("click", () => abrirDetalle(btn.dataset.id));
  });
  ajustarFolios();
  renderPaginacion();
}

function renderPaginacion() {
  const nav = $("paginacion");
  const anterior = estado.pagina > 1;
  const siguiente = estado.haySiguiente;

  if (!anterior && !siguiente) { nav.innerHTML = ""; return; }

  nav.innerHTML = `
    <button class="page-btn" id="paginaAnterior" ${anterior ? "" : "disabled"}>‹ Anterior</button>
    <span class="page-current">Página ${estado.pagina}</span>
    <button class="page-btn" id="paginaSiguiente" ${siguiente ? "" : "disabled"}>Siguiente ›</button>
  `;

  $("paginaAnterior")?.addEventListener("click", async () => {
    const objetivo = estado.pagina - 1;
    if (objetivo < 1) return;
    await cargarPagina(objetivo, estado.cursores[objetivo] ?? null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("paginaSiguiente")?.addEventListener("click", async () => {
    if (!estado.haySiguiente) return;
    const objetivo = estado.pagina + 1;
    const cursor = estado.cursores[objetivo];
    if (!cursor) return;
    await cargarPagina(objetivo, cursor);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function iniciarEscuchaUltimaSalida() {
  // Escucha mínima: solo el documento con el folio más alto.
  // No escucha toda la colección ni todas las páginas.
  const qUltima = query(REF_SALIDAS, orderBy("folio", "desc"), limit(1));

  onSnapshot(qUltima, async (snap) => {
    const docMasReciente = snap.docs[0] || null;
    const idMasReciente = docMasReciente?.id || null;

    // La primera emisión solo establece la referencia actual; no provoca otra lectura de página.
    if (!estado.listenerInicializado) {
      estado.listenerInicializado = true;
      estado.ultimaSalidaDetectada = idMasReciente;
      return;
    }

    if (!idMasReciente || idMasReciente === estado.ultimaSalidaDetectada) return;
    estado.ultimaSalidaDetectada = idMasReciente;

    // Una inserción al inicio desplaza los cursores de todas las páginas.
    // Para evitar duplicados u omisiones, invalidamos la navegación cacheada y
    // refrescamos automáticamente solo la página 1. Las demás se volverán a
    // pedir únicamente cuando el usuario navegue hacia ellas.
    estado.cursores = { 1: null };
    estado.cachePaginas.clear();
    estado.pagina = 1;

    if (estado.cargando) {
      estado.recargaAutomaticaPendiente = true;
      return;
    }

    await cargarPagina(1, null, true);
    $("estado").textContent = "Nueva salida detectada · página 1 actualizada automáticamente.";
  }, (error) => {
    console.error("No se pudo mantener la escucha de la última salida:", error);
  });
}

function abrirDetalle(id) {
  const s = estado.salidas.find(x => x.id === id);
  if (!s) return;
  estado.salidaActual = s;
  $("detalleFolio").textContent = s.folio || "—";
  $("detalleDestino").textContent = s.destino || "—";
  $("detalleFecha").textContent = fechaBonita(s.fecha);
  $("detalleHora").textContent = s.hora || "No registrada";
  $("detalleEntrega").textContent = s.entrega || "—";
  $("detalleRecibe").textContent = s.recibe || "—";
  $("detalleCincho").textContent = s.folioCincho || "—";
  $("detallePartidas").textContent = `${s.articulos.length} ${s.articulos.length === 1 ? "partida" : "partidas"}`;
  $("detalleArticulos").innerHTML = s.articulos.length ? s.articulos.map(a => `
    <tr><td>${a.partida}</td><td>${escapeHtml(a.codigo || "—")}</td><td>${escapeHtml(a.nombre || "Sin descripción")}</td><td class="num qty">${Number(a.cantidad || 0).toLocaleString("es-MX", { maximumFractionDigits:3 })}</td></tr>
  `).join("") : `<tr><td colspan="4">Esta salida no contiene un arreglo de artículos.</td></tr>`;
  $("modalDetalle").showModal();
}

function firmaValida(v) {
  const s = texto(v);
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(s) ? s : "";
}

function imprimirSalida() {
  const s = estado.salidaActual;
  if (!s) return;

  const firmaEntrega = firmaValida(s.datos?.firmaEntrega);
  const firmaRecibe = firmaValida(s.datos?.firmaRecibe);
  const logoUrl = new URL("./logo-proveedora.jfif", import.meta.url).href;
  const fechaHora = `${fechaBonita(s.fecha)}${s.hora ? ` · ${s.hora}` : ""}`;
  const filas = s.articulos.length ? s.articulos.map(a => `
    <tr>
      <td>${a.partida}</td>
      <td>${escapeHtml(a.codigo || "—")}</td>
      <td>${escapeHtml(a.nombre || "Sin descripción")}</td>
      <td class="num">${Number(a.cantidad || 0).toLocaleString("es-MX", { maximumFractionDigits:3 })}</td>
    </tr>`).join("") : `<tr><td colspan="4">Sin artículos registrados.</td></tr>`;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Salida ${escapeHtml(s.folio)}</title>
<style>
  @page{size:auto;margin:12mm}
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:12px}
  .sheet{max-width:900px;margin:0 auto}
  .head{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:3px solid #d71920;padding-bottom:10px;margin-bottom:14px}
  .logo{width:230px;max-height:72px;object-fit:contain}
  .title{text-align:right}.title h1{margin:0;font-size:22px}.title p{margin:4px 0 0;font-weight:700;color:#555}
  .folio{font-size:17px;font-weight:900;color:#b51218;margin-top:4px}
  .meta{display:grid;grid-template-columns:2fr 1fr;gap:0;border:1px solid #bbb;margin-bottom:14px}
  .meta>div{padding:8px 10px;border-right:1px solid #ddd;border-bottom:1px solid #ddd;min-height:50px}
  .meta>div:nth-child(2n){border-right:0}.meta>div:nth-last-child(-n+2){border-bottom:0}
  .label{display:block;font-size:9px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
  .value{font-size:12px;font-weight:700}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th,td{border:1px solid #bbb;padding:7px 8px;text-align:left}
  th{background:#f1f1f1;font-size:10px;text-transform:uppercase}.num{text-align:right;font-weight:800}
  .section-title{font-size:13px;font-weight:900;margin:14px 0 5px;text-transform:uppercase}
  .signatures{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:34px;page-break-inside:avoid}
  .signature{text-align:center}.signature-box{height:125px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #222;padding-bottom:5px}
  .signature-box img{max-width:90%;max-height:115px;object-fit:contain}
  .signature-name{font-weight:800;margin-top:7px;font-size:12px}.signature-role{font-size:10px;color:#555;text-transform:uppercase;margin-top:2px}
  .no-sign{align-self:center;color:#888;font-size:11px}
  .foot{text-align:center;color:#777;font-size:9px;margin-top:18px}
  @media print{.sheet{max-width:none}}
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <img class="logo" src="${logoUrl}" alt="La Proveedora">
    <div class="title"><h1>SALIDA DE ALMACÉN</h1><div class="folio">${escapeHtml(s.folio || "—")}</div><p>ALMACÉN ZAPATA</p></div>
  </div>

  <div class="meta">
    <div><span class="label">Destino</span><span class="value">${escapeHtml(s.destino || "—")}</span></div>
    <div><span class="label">Fecha y hora</span><span class="value">${escapeHtml(fechaHora)}</span></div>
    <div><span class="label">Entrega</span><span class="value">${escapeHtml(s.entrega || "—")}</span></div>
    <div><span class="label">Recibe</span><span class="value">${escapeHtml(s.recibe || "—")}</span></div>
    <div><span class="label">Folio cincho</span><span class="value">${escapeHtml(s.folioCincho || "—")}</span></div>
    <div><span class="label">Partidas</span><span class="value">${s.articulos.length}</span></div>
  </div>

  <div class="section-title">Artículos</div>
  <table>
    <thead><tr><th>#</th><th>Código</th><th>Artículo</th><th class="num">Cantidad</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>

  <div class="signatures">
    <div class="signature">
      <div class="signature-box">${firmaEntrega ? `<img src="${firmaEntrega}" alt="Firma de quien entrega">` : `<span class="no-sign">Sin firma registrada</span>`}</div>
      <div class="signature-name">${escapeHtml(s.entrega || "—")}</div>
      <div class="signature-role">Firma de quien entrega</div>
    </div>
    <div class="signature">
      <div class="signature-box">${firmaRecibe ? `<img src="${firmaRecibe}" alt="Firma de quien recibe">` : `<span class="no-sign">Sin firma registrada</span>`}</div>
      <div class="signature-name">${escapeHtml(s.recibe || "—")}</div>
      <div class="signature-role">Firma de quien recibe</div>
    </div>
  </div>

  <div class="foot">Documento generado desde el historial de salidas de Almacén Zapata.</div>
</div>
<script>
  window.addEventListener('load', () => {
    const imgs = Array.from(document.images);
    Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload=r; img.onerror=r; })))
      .then(() => setTimeout(() => { window.print(); }, 120));
  });
  window.addEventListener('afterprint', () => window.close());
<\/script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) {
    alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para esta aplicación.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

$("buscador").addEventListener("input", (e) => { estado.busqueda = e.target.value; aplicarFiltro(true); });
$("btnRecargar").addEventListener("click", cargar);
$("btnImprimir").addEventListener("click", imprimirSalida);
$("btnCerrar").addEventListener("click", () => $("modalDetalle").close());
$("modalDetalle").addEventListener("click", (e) => { if (e.target === $("modalDetalle")) $("modalDetalle").close(); });
window.addEventListener("resize", ajustarFolios);

iniciarEscuchaUltimaSalida();
cargar();
