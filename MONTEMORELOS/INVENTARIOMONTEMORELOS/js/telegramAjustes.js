// Notificaciones Telegram para ajustes de inventario - MONTEMORELOS
// ADVERTENCIA: al ejecutarse en navegador, el token es visible para quien inspeccione el sitio.

export const TELEGRAM_BOT_TOKEN = "8434600852:AAGJ8HPMhJv8jjqINr2IZLFeycSF1uWSfiw";
export const TELEGRAM_CHAT_ID = "6617988297";
export const TELEGRAM_TOPIC_ID = "";

function fmt(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });
}

function signo(n) {
  const v = Number(n || 0);
  return v > 0 ? `+${fmt(v)}` : fmt(v);
}

function partirMensaje(texto, max = 3600) {
  if (texto.length <= max) return [texto];
  const lineas = texto.split("\n");
  const partes = [];
  let actual = "";
  for (const linea of lineas) {
    const candidata = actual ? `${actual}\n${linea}` : linea;
    if (candidata.length > max && actual) {
      partes.push(actual);
      actual = linea;
    } else {
      actual = candidata;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

async function enviarMensajeTelegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("Falta configurar Telegram.");
  }

  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: texto
  };
  if (TELEGRAM_TOPIC_ID) payload.message_thread_id = Number(TELEGRAM_TOPIC_ID);

  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram respondió HTTP ${resp.status}`);
  }
  return data;
}

export async function enviarLoteAjustesTelegram({ tienda, folio, ajustes = [] }) {
  if (!ajustes.length) return;

  const primero = ajustes[0] || {};
  const fechaHora = [primero.fecha, primero.hora].filter(Boolean).join(" ") || new Date().toLocaleString("es-MX");
  const neto = ajustes.reduce((s, a) => s + Number(a.diferencia || 0), 0);

  const encabezado = [
    `⚖️ AJUSTE DE INVENTARIO · ${tienda} · LOTE`,
    `🆔 Folio: ${folio}`,
    `📅 Fecha/hora: ${fechaHora}`,
    `📋 Artículos: ${ajustes.length}`,
    `🧮 Ajuste neto: ${signo(neto)}`,
    ""
  ].join("\n");

  const detalle = ajustes.map((a, i) => {
    const motivo = a.notas ? `\n   📝 ${a.notas}` : "";
    return `${i + 1}. ${a.codigo} · ${a.descripcion}\n   T:${fmt(a.sistema)}  F:${fmt(a.fisico)}  AJ:${signo(a.diferencia)}${motivo}`;
  }).join("\n\n");

  const partes = partirMensaje(encabezado + detalle);
  for (let i = 0; i < partes.length; i++) {
    const sufijo = partes.length > 1 ? `\n\n📨 Parte ${i + 1}/${partes.length}` : "";
    await enviarMensajeTelegram(partes[i] + sufijo);
  }
}
