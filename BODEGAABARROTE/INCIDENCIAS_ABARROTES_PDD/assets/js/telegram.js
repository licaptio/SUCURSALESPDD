import { TELEGRAM_CONFIG } from "./telegram-config.js";

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function enviarTelegram(incidencia) {
  if (!TELEGRAM_CONFIG.enabled || !TELEGRAM_CONFIG.botToken || !TELEGRAM_CONFIG.chatId) {
    return { skipped: true };
  }

  const api = `https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}`;

  const comentario = incidencia.comentario?.trim() || "Sin comentario";
  const caption =
`⚠️ <b>NUEVA INCIDENCIA DE INVENTARIO</b>

Departamento: <b>${esc(incidencia.departamento)}</b>
Proveedor: <b>${esc(incidencia.proveedor)}</b>

Comentario:
${esc(comentario)}

Folio:
<code>${esc(incidencia.incidenciaId)}</code>

⚠️ <b>REVISAR Y MODIFICAR INVENTARIO</b>`;

  const body = new FormData();
  body.append("chat_id", TELEGRAM_CONFIG.chatId);
  body.append("photo", incidencia.fotoUrl);
  body.append("caption", caption);
  body.append("parse_mode", "HTML");

  const resp = await fetch(`${api}/sendPhoto`, { method: "POST", body });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Telegram respondió ${resp.status}: ${detail}`);
  }

  return await resp.json();
}
