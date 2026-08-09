import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_TOPIC_ID } from "./config.js";

function validarTelegram() {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes("PEGA_AQUI")) throw new Error("Falta configurar TELEGRAM_BOT_TOKEN.");
  if (!TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID.includes("PEGA_AQUI")) throw new Error("Falta configurar TELEGRAM_CHAT_ID.");
}

function fmt(n) {
  return Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

async function enviarTexto(texto) {
  const body = { chat_id: TELEGRAM_CHAT_ID, text: texto };
  if (TELEGRAM_TOPIC_ID) body.message_thread_id = TELEGRAM_TOPIC_ID;
  const respuesta = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let resultado;
  try { resultado = await respuesta.json(); }
  catch { throw new Error(`Telegram respondió con HTTP ${respuesta.status}.`); }
  if (!respuesta.ok || !resultado.ok) throw new Error(resultado.description || `Error HTTP ${respuesta.status} al enviar a Telegram.`);
  return resultado;
}

export async function enviarAjusteTelegram(datos = {}) {
  return enviarLoteAjustesTelegram({ ...datos, partidas: [{
    codigo: datos.codigo,
    descripcion: datos.descripcion,
    existencia_teorica: datos.existenciaTeorica,
    existencia_fisica: datos.existenciaFisica,
    diferencia: datos.diferencia
  }]});
}

export async function enviarLoteAjustesTelegram(datos = {}) {
  validarTelegram();
  const partidas = Array.isArray(datos.partidas) ? datos.partidas : [];
  const totalNeto = partidas.reduce((s,p) => s + Number(p.diferencia || 0), 0);
  const cabecera = [
    "⚖️ AJUSTE DE INVENTARIO · LÍQUIDOS · LOTE",
    `🆔 Folio: ${datos.folio || "AJUINV"}`,
    `📅 Fecha/hora: ${datos.fecha || "Sin fecha"} ${datos.hora || ""}`.trim(),
    `📋 Artículos: ${partidas.length}`,
    `🧮 Ajuste neto: ${totalNeto > 0 ? "+" : ""}${fmt(totalNeto)}`,
    ""
  ].join("\n");

  const lineas = partidas.map((p, i) => {
    const dif = Number(p.diferencia || 0);
    return `${i + 1}. ${p.codigo || "SIN CÓDIGO"} · ${p.descripcion || p.nombre || ""}\n   T:${fmt(p.existencia_teorica ?? p.existenciaTeorica)}  F:${fmt(p.existencia_fisica ?? p.existenciaFisica)}  AJ:${dif > 0 ? "+" : ""}${fmt(dif)}`;
  });

  const mensajes = [];
  let actual = cabecera;
  for (const linea of lineas) {
    if ((actual + "\n" + linea).length > 3600) {
      mensajes.push(actual.trim());
      actual = `⚖️ ${datos.folio || "AJUINV"} · continuación\n\n${linea}`;
    } else {
      actual += "\n" + linea;
    }
  }
  if (actual.trim()) mensajes.push(actual.trim());

  const resultados = [];
  for (const mensaje of mensajes) resultados.push(await enviarTexto(mensaje));
  return resultados;
}
