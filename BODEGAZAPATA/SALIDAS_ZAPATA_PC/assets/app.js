import { db } from "../config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const REF_SALIDAS = collection(db, "almacenes", "almacen_zapata", "salidas1.0");
const POR_PAGINA = 30;

const $ = (id) => document.getElementById(id);
const estado = {
  salidas: [],
  filtradas: [],
  pagina: 1,
  busqueda: "",
  salidaActual: null
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
  $("estado").textContent = "Leyendo historial completo de salidas...";
  $("btnRecargar").disabled = true;
  try {
    const snap = await getDocs(REF_SALIDAS);
    estado.salidas = snap.docs.map(normalizarSalida).sort((a,b) => {
      const porFechaHora = claveOrden(b).localeCompare(claveOrden(a));
      if (porFechaHora !== 0) return porFechaHora;
      return b.folio.localeCompare(a.folio, "es", { numeric:true });
    });
    aplicarFiltro(false);
    $("estado").textContent = `Historial cargado: ${estado.salidas.length.toLocaleString("es-MX")} salidas.`;
  } catch (error) {
    console.error(error);
    estado.salidas = [];
    estado.filtradas = [];
    render();
    $("estado").textContent = `No se pudo leer la colección de salidas: ${error?.message || error}`;
  } finally {
    $("btnRecargar").disabled = false;
  }
}

function aplicarFiltro(resetPagina = true) {
  const q = estado.busqueda.trim().toLowerCase();
  estado.filtradas = q ? estado.salidas.filter(s => s.buscar.includes(q)) : [...estado.salidas];
  if (resetPagina) estado.pagina = 1;
  const max = Math.max(1, Math.ceil(estado.filtradas.length / POR_PAGINA));
  estado.pagina = Math.min(estado.pagina, max);
  render();
}

function render() {
  const total = estado.filtradas.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const inicio = (estado.pagina - 1) * POR_PAGINA;
  const pagina = estado.filtradas.slice(inicio, inicio + POR_PAGINA);

  $("rangoMostrado").textContent = total ? `${inicio + 1}–${Math.min(inicio + POR_PAGINA, total)} de ${total}` : "0 resultados";
  $("vacio").classList.toggle("hidden", total > 0);

  $("listaSalidas").innerHTML = pagina.map((s) => `
    <button type="button" class="salida-card" data-id="${escapeHtml(s.id)}" aria-label="Abrir salida ${escapeHtml(s.folio)} a ${escapeHtml(s.destino)}">
      <div class="card-folio">
        <span class="card-label">FOLIO</span>
        <strong>${escapeHtml(s.folio || "—")}</strong>
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
  renderPaginacion(paginas);
}

function renderPaginacion(totalPaginas) {
  const nav = $("paginacion");
  if (estado.filtradas.length <= POR_PAGINA) { nav.innerHTML = ""; return; }
  const actual = estado.pagina;
  const nums = new Set([1, totalPaginas, actual-2, actual-1, actual, actual+1, actual+2]);
  const validos = [...nums].filter(n => n >= 1 && n <= totalPaginas).sort((a,b)=>a-b);
  let html = `<button class="page-btn" data-page="${actual-1}" ${actual===1?"disabled":""}>‹</button>`;
  let anterior = 0;
  for (const n of validos) {
    if (anterior && n - anterior > 1) html += `<span class="page-ellipsis">…</span>`;
    html += `<button class="page-btn ${n===actual?"active":""}" data-page="${n}">${n}</button>`;
    anterior = n;
  }
  html += `<button class="page-btn" data-page="${actual+1}" ${actual===totalPaginas?"disabled":""}>›</button>`;
  nav.innerHTML = html;
  nav.querySelectorAll("button[data-page]").forEach(b => b.addEventListener("click", () => {
    const p = Number(b.dataset.page);
    if (!Number.isFinite(p) || p < 1 || p > totalPaginas || p === estado.pagina) return;
    estado.pagina = p;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
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

cargar();
