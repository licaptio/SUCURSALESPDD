import {
  db,
  collection,
  doc,
  writeBatch,
  serverTimestamp
} from "./config.js";
import { enviarLoteAjustesTelegram } from "./telegramAjustes.js";

const REF_AJUSTES = collection(db, "almacenes", "Almacen_Dulces", "ajustes_inventario");
const MAX_PARTIDAS_LOTE = 450; // Firestore permite 500 operaciones por batch; dejamos margen.
const $ = (id) => document.getElementById(id);

let articuloSeleccionado = null;
let partidasLote = [];
let opcionesModulo = {
  obtenerArticulos: () => [],
  calcularExistenciaTeorica: () => 0,
  onAjusteGuardado: null
};

export function iniciarModuloAjustesInventarioZapata(opciones = {}) {
  opcionesModulo = { ...opcionesModulo, ...opciones };

  const fecha = $("ajuFechaMovimiento");
  const hora = $("ajuHoraMovimiento");
  if (fecha && !fecha.value) fecha.value = fechaHoyISO();
  if (hora && !hora.value) hora.value = horaActualHHMM();

  $("ajuBuscarArticulo")?.addEventListener("input", pintarResultados);
  $("ajuCantidadFisica")?.addEventListener("input", recalcularPreview);
  $("ajuCantidadFisica")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      agregarPartidaAlLote();
    }
  });
  $("ajuFechaMovimiento")?.addEventListener("change", recalcularTodoElLote);
  $("ajuHoraMovimiento")?.addEventListener("change", recalcularTodoElLote);
  $("btnAgregarAjusteLote")?.addEventListener("click", agregarPartidaAlLote);
  $("btnGuardarAjusteInventario")?.addEventListener("click", guardarLoteAjustes);
  $("btnLimpiarAjusteInventario")?.addEventListener("click", confirmarVaciarLote);
  $("ajuLotePartidas")?.addEventListener("click", manejarAccionLote);
  $("ajuLoteTarjetasMobile")?.addEventListener("click", manejarAccionLote);
  $("btnAbrirCapturaAjuste")?.addEventListener("click", abrirModalCaptura);
  $("btnAgregarOtroAjuste")?.addEventListener("click", abrirModalCaptura);
  $("btnRevisarLoteMobile")?.addEventListener("click", () => {
    if (!partidasLote.length) return;
    document.querySelectorAll("[data-aju-step]").forEach(el => el.classList.toggle("activo", Number(el.dataset.ajuStep) <= 3));
    $("ajuZonaRevision")?.classList.add("aju-mobile-review-focus");
    $("ajuZonaRevision")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("btnCerrarCapturaAjuste")?.addEventListener("click", cerrarModalCaptura);
  $("btnCancelarCapturaAjuste")?.addEventListener("click", cerrarModalCaptura);
  $("modalCapturaAjuste")?.addEventListener("click", (e) => {
    if (e.target === $("modalCapturaAjuste")) cerrarModalCaptura();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("modalCapturaAjuste")?.classList.contains("oculto")) cerrarModalCaptura();
  });

  pintarLote();
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
  if (!s) return "";
  const soloDigitos = s.replace(/\D/g, "");
  if (!soloDigitos) return s.toLowerCase();
  return soloDigitos.replace(/^0+/, "") || "0";
}

function obtenerCodigosCalculados() {
  return opcionesModulo.obtenerArticulos()
    .map(a => ({ ...a, codigoKey: normalizarCodigo(a.codigoKey || a.codigo) }))
    .filter(a => a.codigoKey);
}

function articuloEstaEnTablaCalculada(articulo) {
  const key = normalizarCodigo(articulo?.codigoKey || articulo?.codigo);
  return !!key && obtenerCodigosCalculados().some(a => a.codigoKey === key);
}

function escapeHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

function fmt(n) {
  return Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function obtenerFechaHora() {
  return {
    fecha: $("ajuFechaMovimiento")?.value || "",
    hora: $("ajuHoraMovimiento")?.value || "23:59"
  };
}

function validarFechaHora() {
  const { fecha } = obtenerFechaHora();
  if (!fecha) {
    mostrarMensajeAjuste("Falta la fecha", "Selecciona la fecha del movimiento para continuar.");
    return false;
  }
  const fechaInput = $("ajuFechaMovimiento");
  if (fechaInput?.min && fecha < fechaInput.min) {
    mostrarMensajeAjuste("Fecha no válida", `La fecha no puede ser anterior al punto cero ${fechaInput.min}.`);
    return false;
  }
  if (fechaInput?.max && fecha > fechaInput.max) {
    mostrarMensajeAjuste("Fecha fuera de semana", `Selecciona una fecha dentro de la semana cargada (hasta ${fechaInput.max}).`);
    return false;
  }
  return true;
}

function pintarResultados() {
  const cont = $("ajuResultadosArticulo");
  if (!cont) return;

  const q = String($("ajuBuscarArticulo")?.value || "").trim().toLowerCase();
  const qCod = normalizarCodigo(q);
  if (!q) { cont.innerHTML = ""; return; }

  const agregados = new Set(partidasLote.map(p => p.codigoKey));
  const articulos = obtenerCodigosCalculados()
    .filter(a => {
      const codigo = String(a.codigo || "").toLowerCase();
      const codigoKey = String(a.codigoKey || "").toLowerCase();
      const nombre = String(a.nombre || "").toLowerCase();
      return !agregados.has(a.codigoKey) && (codigo.includes(q) || codigoKey.includes(qCod) || nombre.includes(q));
    })
    .slice(0, 40);

  if (!articulos.length) {
    cont.innerHTML = `<div class="aju-empty">Sin coincidencias disponibles. Si ya está en el lote, edítalo o elimínalo de la lista.</div>`;
    return;
  }

  cont.innerHTML = articulos.map((a, i) => `
    <button type="button" class="aju-articulo" data-index="${i}">
      <strong>${escapeHtml(a.codigo)}</strong>
      <span>${escapeHtml(a.nombre)}</span>
      <em>Existencia calculada al cierre de semana: ${fmt(a.existenciaFinalSemana)}</em>
    </button>`).join("");

  cont.querySelectorAll(".aju-articulo").forEach(btn => {
    btn.addEventListener("click", () => {
      articuloSeleccionado = articulos[Number(btn.dataset.index)];
      $("ajuArticuloSeleccionado").innerHTML = `<b>Código:</b> ${escapeHtml(articuloSeleccionado.codigo)}<br><b>Artículo:</b> ${escapeHtml(articuloSeleccionado.nombre)}`;
      cont.innerHTML = "";
      $("ajuBuscarArticulo").value = `${articuloSeleccionado.codigo} - ${articuloSeleccionado.nombre}`;
      $("ajuCantidadFisica")?.focus();
      recalcularPreview();
    });
  });
}

function calcularPartida(articulo, existenciaFisica) {
  const { fecha, hora } = obtenerFechaHora();
  const existenciaTeorica = Number(opcionesModulo.calcularExistenciaTeorica(articulo.codigoKey, fecha, hora) || 0);
  return {
    codigo: articulo.codigo,
    codigoKey: normalizarCodigo(articulo.codigoKey || articulo.codigo),
    nombre: articulo.nombre,
    existenciaTeorica,
    existenciaFisica: Number(existenciaFisica || 0),
    diferencia: Number(existenciaFisica || 0) - existenciaTeorica
  };
}

function recalcularPreview() {
  const info = $("ajuPreviewCalculo");
  if (!info) return;
  if (!articuloSeleccionado) {
    info.textContent = "Selecciona un artículo y captura su cantidad física; después agrégalo al lote.";
    return;
  }
  const { fecha, hora } = obtenerFechaHora();
  const raw = $("ajuCantidadFisica")?.value;
  const fisica = raw === "" ? 0 : Number(raw || 0);
  const p = calcularPartida(articuloSeleccionado, fisica);
  info.innerHTML = `
    <div><b>Teórico a ${escapeHtml(fecha)} ${escapeHtml(hora)}:</b> ${fmt(p.existenciaTeorica)}</div>
    <div><b>Físico:</b> ${fmt(p.existenciaFisica)}</div>
    <div><b>Ajuste:</b> ${p.diferencia > 0 ? "+" : ""}${fmt(p.diferencia)}</div>`;
}

function agregarPartidaAlLote() {
  if (!validarFechaHora()) return;
  if (!articuloSeleccionado) {
    mostrarMensajeAjuste("Selecciona un artículo", "Busca y selecciona un producto antes de agregarlo al lote.");
    return;
  }
  if (!articuloEstaEnTablaCalculada(articuloSeleccionado)) {
    mostrarMensajeAjuste("Artículo no disponible", "Ese código ya no pertenece a la tabla calculada actual.");
    articuloSeleccionado = null;
    return;
  }
  if (partidasLote.length >= MAX_PARTIDAS_LOTE) {
    mostrarMensajeAjuste("Lote completo", `El lote llegó al máximo de ${MAX_PARTIDAS_LOTE} artículos. Guarda este lote y comienza otro.`);
    return;
  }

  const raw = $("ajuCantidadFisica")?.value;
  if (raw === "" || raw === null || raw === undefined) {
    mostrarMensajeAjuste("Falta cantidad física", "Captura la existencia física contada para este artículo.");
    return;
  }

  const key = normalizarCodigo(articuloSeleccionado.codigoKey || articuloSeleccionado.codigo);
  if (partidasLote.some(p => p.codigoKey === key)) {
    mostrarMensajeAjuste("Artículo duplicado", "Ese código ya está agregado al lote. Puedes modificar su físico directamente en la tabla.");
    return;
  }

  partidasLote.push(calcularPartida(articuloSeleccionado, Number(raw || 0)));
  limpiarCapturaActual();
  pintarLote();
  cerrarModalCaptura();
}

function recalcularTodoElLote() {
  if (!validarFechaHora()) return;
  partidasLote = partidasLote.map(p => {
    const articulo = { codigo: p.codigo, codigoKey: p.codigoKey, nombre: p.nombre };
    return calcularPartida(articulo, p.existenciaFisica);
  });
  recalcularPreview();
  pintarLote();
}

function pintarLote() {
  const body = $("ajuLotePartidas");
  const resumen = $("ajuLoteResumen");
  const tarjetasMobile = $("ajuLoteTarjetasMobile");
  const btnGuardar = $("btnGuardarAjusteInventario");
  const btnRevisarMobile = $("btnRevisarLoteMobile");
  const conteoMobile = $("ajuMobileConteo");
  if (!body || !resumen) return;

  if (!partidasLote.length) {
    body.innerHTML = `<tr><td colspan="7" class="aju-lote-vacio">Aún no hay artículos en el lote.</td></tr>`;
    if (tarjetasMobile) tarjetasMobile.innerHTML = `<div class="aju-mobile-empty"><b>Tu lote está vacío</b><span>Usa “Agregar artículo” para comenzar el conteo físico.</span></div>`;
  } else {
    body.innerHTML = partidasLote.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(p.codigo)}</strong></td>
        <td>${escapeHtml(p.nombre)}</td>
        <td class="num">${fmt(p.existenciaTeorica)}</td>
        <td class="num"><input class="aju-fisico-inline" type="number" step="0.0001" data-index="${i}" value="${p.existenciaFisica}"></td>
        <td class="num ${p.diferencia !== 0 ? "aju-diferencia" : ""}">${p.diferencia > 0 ? "+" : ""}${fmt(p.diferencia)}</td>
        <td><button type="button" class="aju-quitar" data-action="quitar" data-index="${i}">Quitar</button></td>
      </tr>`).join("");

    if (tarjetasMobile) {
      tarjetasMobile.innerHTML = partidasLote.map((p, i) => `
        <article class="aju-mobile-partida">
          <div class="aju-mobile-partida-top">
            <span class="aju-mobile-num">${i + 1}</span>
            <div><b>${escapeHtml(p.nombre)}</b><small>${escapeHtml(p.codigo)}</small></div>
            <button type="button" class="aju-quitar aju-mobile-quitar" data-action="quitar" data-index="${i}">Quitar</button>
          </div>
          <div class="aju-mobile-valores">
            <div><span>Teórico</span><strong>${fmt(p.existenciaTeorica)}</strong></div>
            <label><span>Físico</span><input class="aju-fisico-inline" type="number" inputmode="decimal" step="0.0001" data-index="${i}" value="${p.existenciaFisica}"></label>
            <div class="${p.diferencia !== 0 ? "aju-mobile-ajuste-dif" : ""}"><span>Ajuste</span><strong>${p.diferencia > 0 ? "+" : ""}${fmt(p.diferencia)}</strong></div>
          </div>
        </article>`).join("");
    }
  }

  document.querySelectorAll(".aju-fisico-inline").forEach(input => {
    input.addEventListener("change", () => {
      const i = Number(input.dataset.index);
      partidasLote[i] = calcularPartida(partidasLote[i], Number(input.value || 0));
      pintarLote();
    });
  });

  const totalAjuste = partidasLote.reduce((sum, p) => sum + Number(p.diferencia || 0), 0);
  resumen.innerHTML = `<b>${partidasLote.length}</b> artículos en el lote · Ajuste neto: <b>${totalAjuste > 0 ? "+" : ""}${fmt(totalAjuste)}</b> · Máximo ${MAX_PARTIDAS_LOTE}`;
  if (conteoMobile) conteoMobile.textContent = `${partidasLote.length} ${partidasLote.length === 1 ? "artículo agregado" : "artículos agregados"}`;
  if (btnGuardar) btnGuardar.disabled = partidasLote.length === 0;
  if (btnRevisarMobile) btnRevisarMobile.disabled = partidasLote.length === 0;

  document.querySelectorAll("[data-aju-step]").forEach(el => {
    const paso = Number(el.dataset.ajuStep);
    el.classList.toggle("activo", paso === 1 || (paso === 2 && partidasLote.length > 0));
  });
}

function manejarAccionLote(e) {
  const btn = e.target.closest("button[data-action='quitar']");
  if (!btn) return;
  partidasLote.splice(Number(btn.dataset.index), 1);
  pintarLote();
}

async function guardarLoteAjustes() {
  if (!validarFechaHora()) return;
  if (!partidasLote.length) {
    mostrarMensajeAjuste("Lote vacío", "Agrega por lo menos un artículo antes de guardar.");
    return;
  }

  const totalAjustePrevio = partidasLote.reduce((s, p) => s + Number(p.diferencia || 0), 0);
  const confirmado = await confirmarAjuste(
    "Confirmar lote de ajuste",
    `Se guardarán ${partidasLote.length} artículos como un solo movimiento.`,
    `Ajuste neto: ${totalAjustePrevio > 0 ? "+" : ""}${fmt(totalAjustePrevio)}\nDespués de guardar, el inventario se recalculará con estas partidas.`
  );
  if (!confirmado) return;

  const { fecha, hora } = obtenerFechaHora();
  const motivo = String($("ajuMotivo")?.value || "AJUSTE FÍSICO DE INVENTARIO").trim() || "AJUSTE FÍSICO DE INVENTARIO";

  // Recalcular justo antes de guardar contra la memoria cargada en la tabla.
  recalcularTodoElLote();

  const sufijo = String(Date.now()).slice(-6);
  const folio = `AJUINV-${fecha.replaceAll("-", "")}-${hora.replace(":", "")}-${sufijo}`;
  const ajusteId = folio;
  const refAjuste = doc(REF_AJUSTES, ajusteId);
  const batch = writeBatch(db);

  batch.set(refAjuste, {
    folio,
    tipo: "AJUINV",
    modulo: "CORRECCION_INVENTARIO_LOTE",
    almacen: "Almacen_Dulces",
    fecha_movimiento: fecha,
    hora_movimiento: hora,
    motivo,
    usuario: "OPERADOR",
    total_partidas: partidasLote.length,
    actualizado_en: serverTimestamp(),
    creado_en: serverTimestamp()
  }, { merge: true });

  const partidasGuardadas = partidasLote.map((p, index) => {
    const partidaId = p.codigoKey;
    const partida = {
      partida: partidaId,
      renglon: index + 1,
      codigo: p.codigo,
      codigoKey: p.codigoKey,
      nombre: p.nombre,
      descripcion: p.nombre,
      fecha_movimiento: fecha,
      hora_movimiento: hora,
      existencia_calculada_tabla: p.existenciaTeorica,
      existencia_teorica: p.existenciaTeorica,
      existencia_fisica: p.existenciaFisica,
      diferencia: p.diferencia,
      cantidad: p.diferencia,
      motivo,
      tipo: "AJUINV",
      eliminado: false,
      actualizado_en: serverTimestamp(),
      creado_en: serverTimestamp()
    };
    const refPartida = doc(db, "almacenes", "Almacen_Dulces", "ajustes_inventario", ajusteId, "PARTIDAS", partidaId);
    batch.set(refPartida, partida, { merge: true });
    return partida;
  });

  const btn = $("btnGuardarAjusteInventario");
  if (btn) btn.disabled = true;

  try {
    await batch.commit();

    if (typeof opcionesModulo.onAjusteGuardado === "function") {
      await opcionesModulo.onAjusteGuardado({ docId: ajusteId, folio, partidas: partidasGuardadas });
    }

    let telegramOk = false;
    try {
      await enviarLoteAjustesTelegram({ folio, fecha, hora, motivo, partidas: partidasGuardadas });
      telegramOk = true;
    } catch (telegramError) {
      console.error("Lote guardado, pero Telegram falló:", telegramError);
    }

    limpiarLoteCompleto();
    mostrarMensajeAjuste(
      "Lote guardado correctamente",
      `El ajuste quedó registrado con ${partidasGuardadas.length} artículos.`,
      `Folio: ${folio}\n${telegramOk ? "Notificación enviada a Telegram." : "El lote sí quedó guardado, pero no se pudo enviar la notificación a Telegram."}`,
      "ok"
    );
  } catch (error) {
    console.error(error);
    mostrarMensajeAjuste("No se pudo guardar", "Error al guardar el lote de ajustes: " + error.message);
  } finally {
    if (btn) btn.disabled = partidasLote.length === 0;
  }
}

function abrirModalCaptura() {
  if (!validarFechaHora()) return;
  limpiarCapturaActual();
  $("modalCapturaAjuste")?.classList.remove("oculto");
  setTimeout(() => $("ajuBuscarArticulo")?.focus(), 40);
}

function cerrarModalCaptura() {
  $("modalCapturaAjuste")?.classList.add("oculto");
  limpiarCapturaActual();
}

function mostrarMensajeAjuste(titulo, texto, detalle = "", tipo = "aviso") {
  const modal = $("modalMensajeAjuste");
  if (!modal) return;
  $("ajuMensajeTitulo").textContent = titulo;
  $("ajuMensajeTexto").textContent = texto;
  const det = $("ajuMensajeDetalle");
  det.textContent = detalle || "";
  det.classList.toggle("oculto", !detalle);
  const icono = $("ajuMensajeIcono");
  icono.textContent = tipo === "ok" ? "✓" : "!";
  icono.classList.toggle("aju-message-ok", tipo === "ok");
  $("btnAjuMensajeCancelar")?.classList.add("oculto");
  const aceptar = $("btnAjuMensajeAceptar");
  aceptar.textContent = "Aceptar";
  aceptar.onclick = () => modal.classList.add("oculto");
  modal.classList.remove("oculto");
}

function confirmarAjuste(titulo, texto, detalle = "") {
  return new Promise(resolve => {
    const modal = $("modalMensajeAjuste");
    if (!modal) return resolve(window.confirm(texto));
    $("ajuMensajeTitulo").textContent = titulo;
    $("ajuMensajeTexto").textContent = texto;
    const det = $("ajuMensajeDetalle");
    det.textContent = detalle;
    det.classList.toggle("oculto", !detalle);
    const icono = $("ajuMensajeIcono");
    icono.textContent = "?";
    icono.classList.remove("aju-message-ok");
    const cancelar = $("btnAjuMensajeCancelar");
    const aceptar = $("btnAjuMensajeAceptar");
    cancelar.classList.remove("oculto");
    aceptar.textContent = "Confirmar y guardar";
    const cerrar = (valor) => {
      modal.classList.add("oculto");
      aceptar.onclick = null;
      cancelar.onclick = null;
      resolve(valor);
    };
    aceptar.onclick = () => cerrar(true);
    cancelar.onclick = () => cerrar(false);
    modal.classList.remove("oculto");
  });
}

async function confirmarVaciarLote() {
  if (!partidasLote.length) return;
  const ok = await confirmarAjuste(
    "Vaciar lote",
    `Se eliminarán de la captura los ${partidasLote.length} artículos actuales.`,
    "Esta acción solo limpia el lote en pantalla; no elimina ajustes previamente guardados."
  );
  if (ok) limpiarLoteCompleto();
}

function limpiarCapturaActual() {
  articuloSeleccionado = null;
  if ($("ajuBuscarArticulo")) $("ajuBuscarArticulo").value = "";
  if ($("ajuCantidadFisica")) $("ajuCantidadFisica").value = "";
  if ($("ajuArticuloSeleccionado")) $("ajuArticuloSeleccionado").textContent = "Sin artículo seleccionado.";
  if ($("ajuResultadosArticulo")) $("ajuResultadosArticulo").innerHTML = "";
  if ($("ajuPreviewCalculo")) $("ajuPreviewCalculo").textContent = "Selecciona otro artículo, captura el físico y agrégalo al lote.";
}

function limpiarLoteCompleto() {
  partidasLote = [];
  limpiarCapturaActual();
  pintarLote();
}
