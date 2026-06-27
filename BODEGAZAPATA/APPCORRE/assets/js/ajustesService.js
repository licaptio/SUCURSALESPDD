import { doc, setDoc, addDoc, collection, serverTimestamp, getDocs, query, orderBy, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { REF_AJUSTES } from "./firebaseRefs.js";

function folioAjuste() {
  const d = new Date();
  return `AJU-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}${String(d.getSeconds()).padStart(2,"0")}`;
}

export async function grabarMovimiento(encabezado, partidas, modo = "nuevo") {
  if (!partidas.length) throw new Error("No hay partidas para grabar.");

  const folio = encabezado.folio && !encabezado.folio.startsWith("TEMP-") ? encabezado.folio : folioAjuste();
  const refDoc = doc(REF_AJUSTES, folio);

  const totalDiferencia = partidas.reduce((s, p) => s + Number(p.diferencia || 0), 0);

  await setDoc(refDoc, {
    folio,
    tipo: "AJUSTE_INVENTARIO",
    almacen: "almacen_zapata",
    fecha_entrada: encabezado.fecha_entrada,
    fecha_movimiento: encabezado.fecha_movimiento,
    hora_movimiento: encabezado.hora_movimiento,
    motivo: encabezado.motivo,
    usuario: encabezado.usuario,
    observaciones: encabezado.observaciones || "",
    total_partidas: partidas.length,
    total_diferencia: totalDiferencia,
    estado: "GRABADO",
    cancelado: false,
    fecha_hora_aplicacion: serverTimestamp(),
    creado_en: modo === "nuevo" ? serverTimestamp() : encabezado.creado_en || null,
    modificado_en: serverTimestamp(),
    modificado_por: encabezado.usuario || "USUARIO"
  }, { merge: true });

  const partidasRef = collection(REF_AJUSTES, folio, "PARTIDAS");
  const existentes = await getDocs(partidasRef);
  for (const pdoc of existentes.docs) await deleteDoc(pdoc.ref);

  for (let i = 0; i < partidas.length; i++) {
    const p = partidas[i];
    await setDoc(doc(partidasRef, String(i + 1).padStart(4, "0")), {
      partida: i + 1,
      codigo: p.codigo,
      codigoKey: p.codigoKey,
      nombre: p.nombre,
      existencia_teorica: Number(p.teorico || 0),
      existencia_fisica: Number(p.fisico || 0),
      diferencia: Number(p.diferencia || 0),
      fecha_movimiento: encabezado.fecha_movimiento,
      hora_movimiento: encabezado.hora_movimiento,
      creado_en: serverTimestamp()
    });
  }

  return folio;
}

export async function listarMovimientos() {
  const q = query(REF_AJUSTES, orderBy("fecha_movimiento", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function cargarPartidas(folio) {
  const snap = await getDocs(collection(REF_AJUSTES, folio, "PARTIDAS"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => Number(a.partida || 0) - Number(b.partida || 0));
}

export async function cancelarMovimiento(folio, usuario = "USUARIO") {
  await updateDoc(doc(REF_AJUSTES, folio), {
    cancelado: true,
    estado: "CANCELADO",
    cancelado_por: usuario,
    cancelado_en: serverTimestamp()
  });
}
