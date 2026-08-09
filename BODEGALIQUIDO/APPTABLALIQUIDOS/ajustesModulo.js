import {
  db,
  collection,
  doc,
  setDoc,
  serverTimestamp
} from "./config.js";
import { enviarAjusteTelegram } from "./telegramAjustes.js";

const REF_AJUSTES = collection(
  db,
  "almacenes",
  "Almacen_Dulces",
  "ajustes_inventario"
);

const $ = (id) => document.getElementById(id);

let articuloSeleccionado = null;
let opcionesModulo = {
  obtenerArticulos: () => [],
  calcularExistenciaTeorica: () => 0,
  onAjusteGuardado: null
};

export function iniciarModuloAjustesInventarioZapata(opciones = {}) {
  opcionesModulo = {
    ...opcionesModulo,
    ...opciones
  };

  const fecha = $("ajuFechaMovimiento");
  const hora = $("ajuHoraMovimiento");

  if (fecha && !fecha.value) fecha.value = fechaHoyISO();
  if (hora && !hora.value) hora.value = horaActualHHMM();

  $("ajuBuscarArticulo")?.addEventListener("input", pintarResultados);
  $("ajuCantidadFisica")?.addEventListener("input", recalcularPreview);
  $("ajuFechaMovimiento")?.addEventListener("change", recalcularPreview);
  $("ajuHoraMovimiento")?.addEventListener("change", recalcularPreview);
  $("btnGuardarAjusteInventario")?.addEventListener("click", guardarAjuste);
  $("btnLimpiarAjusteInventario")?.addEventListener("click", limpiarFormulario);
}

function fechaHoyISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function horaActualHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function normalizarCodigo(valor) {
  const s = String(valor ?? "").trim();
  if (!s) return "";
  const soloDigitos = s.replace(/\D/g, "");
  if (!soloDigitos) return s.toLowerCase();
  return soloDigitos.replace(/^0+/, "") || "0";
}

function obtenerCodigosCalculados() {
  return opcionesModulo.obtenerArticulos()
    .map(a => ({
      ...a,
      codigoKey: normalizarCodigo(a.codigoKey || a.codigo)
    }))
    .filter(a => a.codigoKey);
}

function articuloEstaEnTablaCalculada(articulo) {
  const key = normalizarCodigo(articulo?.codigoKey || articulo?.codigo);
  if (!key) return false;
  return obtenerCodigosCalculados().some(a => a.codigoKey === key);
}

function escapeHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmt(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function pintarResultados() {
  const cont = $("ajuResultadosArticulo");
  if (!cont) return;

  const q = String($("ajuBuscarArticulo")?.value || "").trim().toLowerCase();
  const qCod = normalizarCodigo(q);

  if (!q) {
    cont.innerHTML = "";
    return;
  }

  const articulos = obtenerCodigosCalculados()
    .filter(a => {
      const codigo = String(a.codigo || "").toLowerCase();
      const codigoKey = String(a.codigoKey || "").toLowerCase();
      const nombre = String(a.nombre || "").toLowerCase();
      return codigo.includes(q) || codigoKey.includes(qCod) || nombre.includes(q);
    })
    .slice(0, 40);

  if (!articulos.length) {
    cont.innerHTML = `<div class="aju-empty">Sin coincidencias en la tabla calculada. Primero debe existir en el pivot.</div>`;
    return;
  }

  cont.innerHTML = articulos.map((a, i) => `
    <button type="button" class="aju-articulo" data-index="${i}">
      <strong>${escapeHtml(a.codigo)}</strong>
      <span>${escapeHtml(a.nombre)}</span>
      <em>Existencia actual calculada: ${fmt(a.existenciaFinalSemana)}</em>
    </button>
  `).join("");

  cont.querySelectorAll(".aju-articulo").forEach(btn => {
    btn.addEventListener("click", () => {
      articuloSeleccionado = articulos[Number(btn.dataset.index)];
      $("ajuArticuloSeleccionado").innerHTML = `
        <b>Código:</b> ${escapeHtml(articuloSeleccionado.codigo)}<br>
        <b>Artículo:</b> ${escapeHtml(articuloSeleccionado.nombre)}
      `;
      cont.innerHTML = "";
      $("ajuBuscarArticulo").value = `${articuloSeleccionado.codigo} - ${articuloSeleccionado.nombre}`;
      recalcularPreview();
    });
  });
}

function recalcularPreview() {
  const info = $("ajuPreviewCalculo");
  if (!info) return;

  if (!articuloSeleccionado) {
    info.textContent = "Selecciona un código calculado de la tabla/pivot.";
    return;
  }

  const fecha = $("ajuFechaMovimiento")?.value || "";
  const hora = $("ajuHoraMovimiento")?.value || "23:59";
  const fisica = Number($("ajuCantidadFisica")?.value || 0);

  if (!fecha) {
    info.textContent = "Selecciona fecha del movimiento.";
    return;
  }

  const teorica = Number(opcionesModulo.calcularExistenciaTeorica(
    articuloSeleccionado.codigoKey,
    fecha,
    hora
  ) || 0);

  const diferencia = fisica - teorica;

  info.innerHTML = `
    <div><b>Existencia calculada por tabla a ${escapeHtml(fecha)} ${escapeHtml(hora)}:</b> ${fmt(teorica)}</div>
    <div><b>Cantidad física capturada:</b> ${fmt(fisica)}</div>
    <div><b>Ajuste que se grabará en AJUINV:</b> ${fmt(diferencia)}</div>
    <div><small>Ese resultado queda como base operativa para el día siguiente, porque el pivot recalcula: entradas - salidas + ajustes.</small></div>
  `;
}

async function guardarAjuste() {
  if (!articuloSeleccionado) {
    alert("Selecciona un código de la tabla calculada. No se permite capturar códigos manuales fuera del pivot.");
    return;
  }

  if (!articuloEstaEnTablaCalculada(articuloSeleccionado)) {
    alert("Ese código ya no pertenece a la tabla calculada actual. Vuelve a consultarlo en el pivot y selecciónalo de la lista.");
    articuloSeleccionado = null;
    return;
  }

  const fecha = $("ajuFechaMovimiento")?.value || "";
  const hora = $("ajuHoraMovimiento")?.value || "23:59";
  const cantidadFisicaRaw = $("ajuCantidadFisica")?.value;
  const motivo = String($("ajuMotivo")?.value || "AJUSTE FÍSICO DE INVENTARIO").trim() || "AJUSTE FÍSICO DE INVENTARIO";

  if (!fecha) {
    alert("Selecciona la fecha del movimiento.");
    return;
  }

  const fechaInput = $("ajuFechaMovimiento");
  if (fechaInput?.min && fecha < fechaInput.min) {
    alert(`La fecha no puede ser anterior al punto cero ${fechaInput.min}.`);
    return;
  }
  if (fechaInput?.max && fecha > fechaInput.max) {
    alert(`Para calcular correctamente el teórico, selecciona una fecha dentro de la semana cargada (hasta ${fechaInput.max}).`);
    return;
  }

  if (cantidadFisicaRaw === "" || cantidadFisicaRaw === null || cantidadFisicaRaw === undefined) {
    alert("Captura la cantidad física.");
    return;
  }

  const existenciaFisica = Number(cantidadFisicaRaw || 0);
  const existenciaTeorica = Number(opcionesModulo.calcularExistenciaTeorica(
    articuloSeleccionado.codigoKey,
    fecha,
    hora
  ) || 0);
  const diferencia = existenciaFisica - existenciaTeorica;

  const sufijo = String(Date.now()).slice(-5);
  const folio = `AJUINV-${fecha.replaceAll("-", "")}-${hora.replace(":", "")}-${sufijo}`;
  const ajusteId = folio;
  const partidaId = articuloSeleccionado.codigoKey || normalizarCodigo(articuloSeleccionado.codigo);

  const refAjuste = doc(REF_AJUSTES, ajusteId);
  const refPartida = doc(
    db,
    "almacenes",
    "Almacen_Dulces",
    "ajustes_inventario",
    ajusteId,
    "PARTIDAS",
    partidaId
  );

  const header = {
    folio,
    tipo: "AJUINV",
    modulo: "CORRECCION_INVENTARIO",
    almacen: "Almacen_Dulces",
    fecha_movimiento: fecha,
    hora_movimiento: hora,
    motivo,
    usuario: "OPERADOR",
    actualizado_en: serverTimestamp(),
    creado_en: serverTimestamp()
  };

  const partida = {
    partida: partidaId,
    codigo: articuloSeleccionado.codigo,
    codigoKey: articuloSeleccionado.codigoKey,
    nombre: articuloSeleccionado.nombre,
    descripcion: articuloSeleccionado.nombre,
    fecha_movimiento: fecha,
    hora_movimiento: hora,
    existencia_calculada_tabla: existenciaTeorica,
    existencia_teorica: existenciaTeorica,
    existencia_fisica: existenciaFisica,
    diferencia,
    cantidad: diferencia,
    motivo,
    tipo: "AJUINV",
    eliminado: false,
    actualizado_en: serverTimestamp(),
    creado_en: serverTimestamp()
  };

  $("btnGuardarAjusteInventario").disabled = true;

  try {
    await setDoc(refAjuste, header, { merge: true });
    await setDoc(refPartida, partida, { merge: true });

    if (typeof opcionesModulo.onAjusteGuardado === "function") {
      await opcionesModulo.onAjusteGuardado({
        docId: ajusteId,
        folio,
        ...partida,
        creado_en: null,
        actualizado_en: null
      });
    }

    let telegramOk = false;
    try {
      await enviarAjusteTelegram({
        folio,
        fecha,
        hora,
        codigo: articuloSeleccionado.codigo,
        descripcion: articuloSeleccionado.nombre,
        existenciaTeorica,
        existenciaFisica,
        diferencia,
        motivo
      });
      telegramOk = true;
    } catch (telegramError) {
      console.error("Ajuste guardado, pero Telegram falló:", telegramError);
    }

    alert(
      `Ajuste guardado. Diferencia: ${fmt(diferencia)}` +
      (telegramOk ? "\nNotificación enviada a Telegram." : "\nATENCIÓN: no se pudo enviar la notificación a Telegram. Revisa config.js.")
    );
    limpiarFormulario();
  } catch (error) {
    console.error(error);
    alert("Error al guardar ajuste: " + error.message);
  } finally {
    $("btnGuardarAjusteInventario").disabled = false;
  }
}

function limpiarFormulario() {
  articuloSeleccionado = null;
  if ($("ajuBuscarArticulo")) $("ajuBuscarArticulo").value = "";
  if ($("ajuCantidadFisica")) $("ajuCantidadFisica").value = "";
  if ($("ajuMotivo")) $("ajuMotivo").value = "";
  if ($("ajuArticuloSeleccionado")) $("ajuArticuloSeleccionado").textContent = "Sin artículo seleccionado.";
  if ($("ajuResultadosArticulo")) $("ajuResultadosArticulo").innerHTML = "";
  if ($("ajuPreviewCalculo")) $("ajuPreviewCalculo").textContent = "Selecciona fecha, hora, código calculado y cantidad física. No se aceptan códigos fuera del pivot.";
}
