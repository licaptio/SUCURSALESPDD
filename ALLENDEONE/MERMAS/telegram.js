import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TELEGRAM_TOPIC_ID
} from "./config.js";

/**
 * Envía el PDF de una merma directamente a Telegram desde el navegador.
 * IMPORTANTE: al publicar en GitHub Pages, el token del bot será visible.
 */
export async function enviarPDFTelegram(pdfBlob, datosMerma) {
  validarConfiguracionTelegram();

  if (!(pdfBlob instanceof Blob)) {
    throw new Error("El PDF recibido no es un archivo Blob válido.");
  }

  const folio = datosMerma?.folio || "MERMA";
  const tienda = datosMerma?.tienda || "SIN TIENDA";
  const encargado = datosMerma?.encargado || "SIN ENCARGADO";
  const totalPiezas = Number(datosMerma?.totalPiezas || 0);
  const totalPublico = Number(datosMerma?.totalPublico || 0);

  const caption = [
    "🧾 NUEVA SOLICITUD DE MERMA",
    `Folio: ${folio}`,
    `Tienda: ${tienda}`,
    `Encargado: ${encargado}`,
    `Piezas: ${totalPiezas}`,
    `Precio público: $${totalPublico.toFixed(2)}`
  ].join("\n");

  const formData = new FormData();
  formData.append("chat_id", String(TELEGRAM_CHAT_ID));
  formData.append("document", pdfBlob, `${folio}.pdf`);
  formData.append("caption", caption);

  if (TELEGRAM_TOPIC_ID) {
    formData.append("message_thread_id", String(TELEGRAM_TOPIC_ID));
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;

  const respuesta = await fetch(url, {
    method: "POST",
    body: formData
  });

  let resultado;
  try {
    resultado = await respuesta.json();
  } catch {
    throw new Error(`Telegram respondió HTTP ${respuesta.status} sin JSON válido.`);
  }

  if (!respuesta.ok || resultado?.ok !== true) {
    throw new Error(
      resultado?.description ||
      `Telegram rechazó el archivo. HTTP ${respuesta.status}.`
    );
  }

  return resultado.result;
}

function validarConfiguracionTelegram() {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes("PEGA_AQUI")) {
    throw new Error("Falta TELEGRAM_BOT_TOKEN en config.js.");
  }

  if (!TELEGRAM_CHAT_ID || String(TELEGRAM_CHAT_ID).includes("PEGA_AQUI")) {
    throw new Error("Falta TELEGRAM_CHAT_ID en config.js.");
  }
}
