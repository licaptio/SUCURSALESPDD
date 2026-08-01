import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TELEGRAM_TOPIC_ID
} from "./config.js";

export async function enviarPDFTelegram(pdfBlob, datos = {}){
  if(!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes("PEGA_AQUI")){
    throw new Error("Falta configurar TELEGRAM_BOT_TOKEN.");
  }

  if(!TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID.includes("PEGA_AQUI")){
    throw new Error("Falta configurar TELEGRAM_CHAT_ID.");
  }

  if(!(pdfBlob instanceof Blob)){
    throw new Error("El PDF generado no es un Blob válido.");
  }

  const folio = datos.folio || "DEVOLUCION";
  const totalPublico = Number(datos.totalPublico || 0);

  const caption = [
    "📦 NUEVA DEVOLUCIÓN A MATRIZ",
    `🆔 Folio: ${folio}`,
    `🏪 Tienda origen: ${datos.tiendaOrigen || "Sin dato"}`,
    `🏢 Destino: ${datos.destino || "MATRIZ"}`,
    `👤 Encargado: ${datos.encargado || "Sin dato"}`,
    `📋 Productos: ${Number(datos.totalRenglones || 0)}`,
    `📦 Piezas: ${Number(datos.totalPiezas || 0)}`,
    `💰 Precio público: $${totalPublico.toFixed(2)}`
  ].join("\n");

  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHAT_ID);
  formData.append("caption", caption);
  formData.append("document", pdfBlob, `${folio}.pdf`);

  if(TELEGRAM_TOPIC_ID){
    formData.append("message_thread_id", TELEGRAM_TOPIC_ID);
  }

  const respuesta = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
    {
      method:"POST",
      body:formData
    }
  );

  let resultado;

  try{
    resultado = await respuesta.json();
  }catch{
    throw new Error(`Telegram respondió con HTTP ${respuesta.status}.`);
  }

  if(!respuesta.ok || !resultado.ok){
    throw new Error(resultado.description || `Error HTTP ${respuesta.status} al enviar a Telegram.`);
  }

  return resultado;
}
