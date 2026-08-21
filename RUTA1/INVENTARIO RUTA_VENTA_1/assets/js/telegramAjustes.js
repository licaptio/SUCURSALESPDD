import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_TOPIC_ID } from './config.js';

function fmt(n) {
  return Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function enviarAjusteTelegram(datos = {}) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Falta configurar Telegram.');
  const diferencia = Number(datos.diferencia || 0);
  const signo = diferencia > 0 ? '+' : '';
  const texto = [
    '⚖️ AJUSTE DE INVENTARIO · RUTA VENTA 1',
    `🆔 Folio: ${datos.folio || '-'}`,
    `📅 Fecha/hora: ${datos.fecha || '-'} ${datos.hora || ''}`,
    '',
    `📦 ${datos.codigo || ''} · ${datos.nombre || ''}`,
    `Teórico: ${fmt(datos.teorico)}`,
    `Físico: ${fmt(datos.fisico)}`,
    `Ajuste: ${signo}${fmt(diferencia)}`
  ].join('\n');

  const body = { chat_id: TELEGRAM_CHAT_ID, text: texto };
  if (TELEGRAM_TOPIC_ID) body.message_thread_id = Number(TELEGRAM_TOPIC_ID);
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.description || `Telegram HTTP ${r.status}`);
  return j;
}


export async function enviarLoteAjustesTelegram(datos = {}) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Falta configurar Telegram.');
  const partidas = Array.isArray(datos.partidas) ? datos.partidas : [];
  const detalle = partidas.slice(0, 40).map((x, i) => {
    const diferencia = Number(x.diferencia || 0);
    const signo = diferencia > 0 ? '+' : '';
    return `${i + 1}. ${x.codigo || ''} · ${x.nombre || ''}\n   ${fmt(x.teorico)} → ${fmt(x.fisico)} · Ajuste ${signo}${fmt(diferencia)}`;
  });
  if (partidas.length > 40) detalle.push(`... y ${partidas.length - 40} partida(s) más.`);
  const texto = [
    '⚖️ LOTE DE AJUSTES · RUTA VENTA 1',
    `🆔 Folio: ${datos.folio || '-'}`,
    `📅 Fecha/hora: ${datos.fecha || '-'} ${datos.hora || ''}`,
    `📦 Partidas: ${partidas.length}`,
    '',
    ...detalle
  ].join('\n');

  const body = { chat_id: TELEGRAM_CHAT_ID, text: texto };
  if (TELEGRAM_TOPIC_ID) body.message_thread_id = Number(TELEGRAM_TOPIC_ID);
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.description || `Telegram HTTP ${r.status}`);
  return j;
}
