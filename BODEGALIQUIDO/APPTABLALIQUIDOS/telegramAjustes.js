import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TELEGRAM_TOPIC_ID
} from "./config.js";

function validarTelegram() {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes("PEGA_AQUI")) {
    throw new Error("Falta configurar TELEGRAM_BOT_TOKEN.");
  }
  if (!TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID.includes("PEGA_AQUI")) {
    throw new Error("Falta configurar TELEGRAM_CHAT_ID.");
  }
}

function fmt(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });
}

export async function enviarAjusteTelegram(datos = {}) {
  validarTelegram();

  const diferencia = Number(datos.diferencia || 0);
  const signo = diferencia > 0 ? "+" : "";
  const texto = [
    "⚖️ AJUSTE DE INVENTARIO · LÍQUIDOS",
    `🆔 Folio: ${datos.folio || "AJUINV"}`,
    `📅 Fecha/hora: ${datos.fecha || "Sin fecha"} ${datos.hora || ""}`.trim(),
    `🔢 Código: ${datos.codigo || "Sin código"}`,
    `📦 Descripción: ${datos.descripcion || "Sin descripción"}`,
    `📊 Teórico: ${fmt(datos.existenciaTeorica)}`,
    `👁️ Físico: ${fmt(datos.existenciaFisica)}`,
    `🧮 Ajuste aplicado: ${signo}${fmt(diferencia)}`,
    "✅ El inventario queda cuadrado contra la existencia física capturada."
  ].join("\n");

  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: texto
  };

  if (TELEGRAM_TOPIC_ID) {
    body.message_thread_id = TELEGRAM_TOPIC_ID;
  }

  const respuesta = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  let resultado;
  try {
    resultado = await respuesta.json();
  } catch {
    throw new Error(`Telegram respondió con HTTP ${respuesta.status}.`);
  }

  if (!respuesta.ok || !resultado.ok) {
    throw new Error(resultado.description || `Error HTTP ${respuesta.status} al enviar a Telegram.`);
  }

  return resultado;
}
