import { db } from "./config.js";
import {
  collection,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const REF_CIGMAN = collection(db, "almacenes", "almacen_cigarro", "cigarrosincargo");
const $ = (id) => document.getElementById(id);

let articuloSeleccionado = null;
let opcionesModulo = {
  obtenerArticulos: () => [],
  onCigmanGuardado: null
};

export function iniciarModuloCigman(opciones = {}) {
  opcionesModulo = { ...opcionesModulo, ...opciones };
  const fecha = $("cigmanFecha");
  const hora = $("cigmanHora");
  if (fecha && !fecha.value) fecha.value = fechaHoyISO();
  if (hora && !hora.value) hora.value = horaActualHHMM();

  $("cigmanBuscarArticulo")?.addEventListener("input", pintarResultados);
  $("btnGuardarCigman")?.addEventListener("click", guardarCigman);
  $("btnLimpiarCigman")?.addEventListener("click", limpiarFormulario);
}

function fechaHoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function horaActualHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function normalizarCodigo(valor) {
  const s = String(valor ?? "").trim();
  const soloDigitos = s.replace(/\D/g, "");
  return soloDigitos ? (soloDigitos.replace(/^0+/, "") || "0") : s.toLowerCase();
}

function escapeHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

function obtenerArticulos() {
  return opcionesModulo.obtenerArticulos()
    .map(a => ({ ...a, codigoKey: normalizarCodigo(a.codigoKey || a.codigo) }))
    .filter(a => a.codigoKey);
}

function pintarResultados() {
  const cont = $("cigmanResultadosArticulo");
  if (!cont) return;
  const q = String($("cigmanBuscarArticulo")?.value || "").trim().toLowerCase();
  const qCod = normalizarCodigo(q);
  if (!q) { cont.innerHTML = ""; return; }

  const articulos = obtenerArticulos().filter(a =>
    String(a.codigo || "").toLowerCase().includes(q) ||
    String(a.codigoKey || "").toLowerCase().includes(qCod) ||
    String(a.nombre || "").toLowerCase().includes(q)
  ).slice(0, 40);

  if (!articulos.length) {
    cont.innerHTML = '<div class="aju-empty">Sin coincidencias en la tabla calculada.</div>';
    return;
  }

  cont.innerHTML = articulos.map((a, i) => `
    <button type="button" class="aju-articulo" data-index="${i}">
      <strong>${escapeHtml(a.codigo)}</strong>
      <span>${escapeHtml(a.nombre)}</span>
      <em>Existencia teórica: ${Number(a.existenciaFinalSemana || 0).toLocaleString("es-MX")}</em>
    </button>`).join("");

  cont.querySelectorAll(".aju-articulo").forEach(btn => btn.addEventListener("click", () => {
    articuloSeleccionado = articulos[Number(btn.dataset.index)];
    $("cigmanArticuloSeleccionado").innerHTML = `<b>Código:</b> ${escapeHtml(articuloSeleccionado.codigo)}<br><b>Artículo:</b> ${escapeHtml(articuloSeleccionado.nombre)}`;
    $("cigmanBuscarArticulo").value = `${articuloSeleccionado.codigo} - ${articuloSeleccionado.nombre}`;
    cont.innerHTML = "";
  }));
}

async function guardarCigman() {
  if (!articuloSeleccionado) { alert("Selecciona un código de la tabla."); return; }
  const fecha = $("cigmanFecha")?.value || "";
  const hora = $("cigmanHora")?.value || "00:00";
  const raw = $("cigmanCantidad")?.value;
  const motivo = String($("cigmanMotivo")?.value || "CIGARRO SIN CARGO").trim() || "CIGARRO SIN CARGO";
  const cantidad = Number(raw);
  if (!fecha) { alert("Selecciona la fecha."); return; }
  if (raw === "" || !Number.isFinite(cantidad) || cantidad <= 0) { alert("Captura una cantidad mayor que cero."); return; }

  const codigoKey = normalizarCodigo(articuloSeleccionado.codigoKey || articuloSeleccionado.codigo);
  const id = `CIGMAN-${fecha.replaceAll("-", "")}-${hora.replace(":", "")}-${codigoKey}-${Date.now()}`;
  const movimiento = {
    tipo: "CIGMAN",
    folio: id,
    fecha,
    hora,
    codigo: String(articuloSeleccionado.codigo || "").trim(),
    codigoKey,
    nombre: String(articuloSeleccionado.nombre || "").trim(),
    cantidad,
    motivo,
    almacen: "almacen_cigarro",
    usuario: "OPERADOR",
    creado_en: serverTimestamp()
  };

  const btn = $("btnGuardarCigman");
  if (btn) btn.disabled = true;
  try {
    await setDoc(doc(REF_CIGMAN, id), movimiento);
    if (typeof opcionesModulo.onCigmanGuardado === "function") {
      await opcionesModulo.onCigmanGuardado({ docId: id, ...movimiento, creado_en: null });
    }
    alert(`Entrada manual CIGMAN guardada: ${cantidad}`);
    limpiarFormulario();
  } catch (error) {
    console.error(error);
    alert("No se pudo guardar CIGMAN: " + error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function limpiarFormulario() {
  articuloSeleccionado = null;
  if ($("cigmanBuscarArticulo")) $("cigmanBuscarArticulo").value = "";
  if ($("cigmanCantidad")) $("cigmanCantidad").value = "";
  if ($("cigmanMotivo")) $("cigmanMotivo").value = "CIGARRO SIN CARGO";
  if ($("cigmanResultadosArticulo")) $("cigmanResultadosArticulo").innerHTML = "";
  if ($("cigmanArticuloSeleccionado")) $("cigmanArticuloSeleccionado").textContent = "Sin artículo seleccionado.";
}
