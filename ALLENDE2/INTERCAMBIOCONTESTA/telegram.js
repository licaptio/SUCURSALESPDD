import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TELEGRAM_TOPIC_ID
} from "./config.js";

function total(items,campo){
  return (Array.isArray(items) ? items : []).reduce(
    (acumulado,item)=>acumulado + Number(item[campo] || 0),
    0
  );
}

export async function enviarContestacionIntercambioTelegram(pdfBlob,documento){
  if(!TELEGRAM_BOT_TOKEN) throw new Error("Falta TELEGRAM_BOT_TOKEN.");
  if(!TELEGRAM_CHAT_ID) throw new Error("Falta TELEGRAM_CHAT_ID.");
  if(!(pdfBlob instanceof Blob)) throw new Error("El PDF generado no es válido.");

  const items = Array.isArray(documento.items) ? documento.items : [];
  const estado = String(documento.estado || "CONTESTADO").toUpperCase();

  let encabezado = "📋 INTERCAMBIO CONTESTADO";
  if(estado === "AUTORIZADO") encabezado = "✅ INTERCAMBIO AUTORIZADO";
  else if(estado === "AUTORIZADO_PARCIAL") encabezado = "🟡 INTERCAMBIO AUTORIZADO PARCIALMENTE";
  else if(estado === "RECHAZADO") encabezado = "❌ INTERCAMBIO RECHAZADO";

  const caption = [
    encabezado,
    `🆔 Folio: ${documento.folio || "Sin folio"}`,
    `🏪 Solicita: ${documento.tienda_solicita || "ALLENDE 1"}`,
    `🏬 Contesta: ${documento.tienda_contesta || "ALLENDE 2"}`,
    `👤 Solicitado por: ${documento.solicitado_por || "Sin dato"}`,
    `✍️ Contestado por: ${documento.autorizado_por || "Sin dato"}`,
    `📋 Productos: ${items.length}`,
    `📦 Piezas solicitadas: ${total(items,"cantidad_solicitada")}`,
    `✅ Piezas autorizadas: ${total(items,"cantidad_autorizada")}`,
    `📌 Estado: ${estado}`
  ].join("\n");

  const formData = new FormData();
  formData.append("chat_id",TELEGRAM_CHAT_ID);
  formData.append("caption",caption);
  formData.append("document",pdfBlob,`${documento.folio || "INTERCAMBIO"}-${estado}.pdf`);

  if(TELEGRAM_TOPIC_ID){
    formData.append("message_thread_id",TELEGRAM_TOPIC_ID);
  }

  const respuesta = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
    { method:"POST", body:formData }
  );

  const resultado = await respuesta.json();

  if(!respuesta.ok || !resultado.ok){
    throw new Error(resultado.description || `Error HTTP ${respuesta.status}`);
  }

  return resultado;
}
