export function iniciarCorteRuta(ctx) {
  const {
    db,
    collection,
    query,
    where,
    getDocs,
    addDoc,
    updateDoc,
    doc,
    getUsuario
  } = ctx;

  const btn = document.getElementById("btnCorteRuta");
  if (!btn) return;

  btn.addEventListener("click", abrirPanelCorte);

  function mxn(n) {
    return Number(n || 0).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function imprimirRAWBT(texto) {
    texto = "\x1B\x40" + texto + "\n\n\n\n";
    const intent = `intent://print/?data=${encodeURIComponent(texto)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
    window.location.href = intent;
  }

  async function enviarTelegramTexto(texto) {
    const BOT = "8272633411:AAE6uKTpEtPW--IPk6ufix_CDGJ0dH6ru4Q";
    const CHAT = "6617988297";

    try {
      await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT, text: texto })
      });
    } catch (e) {
      console.error("Telegram:", e);
    }
  }

  async function abrirPanelCorte() {
    const usuario = getUsuario() || JSON.parse(localStorage.getItem("usuario_ruta") || "null");
    if (!usuario) {
      alert("No hay usuario logueado.");
      return;
    }

    const ruta = usuario.rutaId;
    const modal = document.createElement("div");
    modal.id = "modalCorteRuta";
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;display:flex;align-items:center;justify-content:center;">
        <div style="background:#fff;width:min(430px,94vw);border-radius:16px;padding:16px;font-family:Poppins,sans-serif;">
          <h2 style="text-align:center;color:#00416A;margin-bottom:14px;">CORTE DE RUTA</h2>

          <div style="font-size:14px;margin-bottom:10px;font-weight:700;">
            ${usuario.nombre || usuario.usuario} – Ruta ${ruta}
          </div>

          <select id="corteFecha" style="width:100%;padding:12px;border-radius:8px;border:1px solid #ccc;margin-bottom:12px;">
            <option value="">Cargando fechas...</option>
          </select>

          <button id="btnGenerarCorteInterno" class="btn">📊 GENERAR CORTE</button>
          <button id="btnCerrarCorteInterno" class="btn" style="margin-top:10px;background:#777;">Cerrar</button>

          <div id="corteStatus" style="display:none;margin-top:12px;text-align:center;font-weight:700;color:#00416A;">
            Procesando...
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("btnCerrarCorteInterno").onclick = () => modal.remove();
    document.getElementById("btnGenerarCorteInterno").onclick = () => generarCorte(usuario, ruta);

    await cargarFechasPendientes(ruta);
  }

  async function cargarFechasPendientes(ruta) {
    const selectFecha = document.getElementById("corteFecha");

    const qv = query(
      collection(db, "ventas_rutav2"),
      where("rutaId", "==", ruta)
    );

    const snap = await getDocs(qv);
    const fechas = {};

    snap.docs.forEach(d => {
      const v = d.data();
      if (v.cortado === true) return;
      if (!v.fecha_txt) return;

      const f = v.fecha_txt.split(" ")[0];
      fechas[f] = (fechas[f] || 0) + 1;
    });

    selectFecha.innerHTML = `<option value="">Selecciona una fecha pendiente...</option>`;

    Object.entries(fechas)
      .sort((a, b) => {
        const [da, ma, ya] = a[0].split("/").map(Number);
        const [db, mb, yb] = b[0].split("/").map(Number);
        return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
      })
      .forEach(([f, c]) => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = `${f} – ${c} ventas pendientes`;
        selectFecha.appendChild(opt);
      });
  }

  async function generarCorte(usuario, ruta) {
    const fecha = document.getElementById("corteFecha").value;
    const status = document.getElementById("corteStatus");
    const btn = document.getElementById("btnGenerarCorteInterno");

    if (!fecha) {
      alert("Selecciona una fecha.");
      return;
    }

    btn.disabled = true;
    status.style.display = "block";
    status.textContent = "Consultando ventas...";

    const qv = query(
      collection(db, "ventas_rutav2"),
      where("rutaId", "==", ruta)
    );

    const snap = await getDocs(qv);
    const ventas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const ventasDia = ventas.filter(v =>
      v.fecha_txt &&
      v.fecha_txt.startsWith(fecha) &&
      v.cortado !== true
    );

    if (!ventasDia.length) {
      btn.disabled = false;
      alert("No hay ventas sin cortar.");
      return;
    }

    let totalDia = 0;
    let totalDescuento = 0;
    let utilidadTotal = 0;
    let porDepto = {};
    let porDeptoConcentrado = {};
    let porArticulo = {};

    for (const v of ventasDia) {
      const rf = v.resumen_financiero || {};
      const total = Number(rf.total || 0);
      const desc = Number(rf.descuento || v.descuento_monto || 0);
      const costo = Number(rf.costo_total || 0);
      const util = total - costo;

      totalDia += total;
      totalDescuento += desc;
      utilidadTotal += util;

      for (const d of (v.detalle || [])) {
        const dep = d.departamento_info?.nombre?.toUpperCase() || "SIN DEPTO";
        const imp = Number(d.importe || 0) - Number(d.descuento_monto || 0);
        const c = Number(d.costo_total || (d.costo_unit * (d.cantidad || 1)) || 0);

        if (!porDepto[dep]) porDepto[dep] = { venta: 0, costo: 0, utilidad: 0 };
        porDepto[dep].venta += imp;
        porDepto[dep].costo += c;
        porDepto[dep].utilidad += imp - c;

        porDeptoConcentrado[dep] = (porDeptoConcentrado[dep] || 0) + imp;

        const art = d.nombre?.toUpperCase() || "SIN NOMBRE";
        if (!porArticulo[art]) porArticulo[art] = { cantidad: 0, importe: 0, costo: 0 };
        porArticulo[art].cantidad += Number(d.cantidad || 0);
        porArticulo[art].importe += imp;
        porArticulo[art].costo += c;
      }
    }

    const utilidadPorcentaje = totalDia
      ? ((utilidadTotal / (totalDia - totalDescuento)) * 100).toFixed(2)
      : 0;

    const listaDeptos = Object.entries(porDepto).sort((a, b) => b[1].venta - a[1].venta);
    const topArt = Object.entries(porArticulo).sort((a, b) => b[1].importe - a[1].importe).slice(0, 10);

    let texto = `CORTE RUTA VENTA - ${fecha}
--------------------------------
RUTA: ${ruta}
VENDEDOR: ${usuario.nombre}
TOTAL MXN: $${mxn(totalDia)}
UTILIDAD %: ${utilidadPorcentaje}%
VENTAS: ${ventasDia.length}
--------------------------------
VENTA POR DEPARTAMENTO
--------------------------------
`;

    Object.entries(porDeptoConcentrado)
      .sort((a, b) => b[1] - a[1])
      .forEach(([d, total]) => {
        texto += `${d.substring(0, 16).padEnd(16)} $${mxn(total)}\n`;
      });

    texto += `\n--------------------------------\nTOP ARTICULOS\n--------------------------------\n`;

    topArt.forEach(([n, v]) => {
      texto += `${n.substring(0, 20).padEnd(22)}$${mxn(v.importe)}\n`;
    });

    texto += `\n--------------------------------\n¡BONITO DIA!\n`;

    status.textContent = "Enviando Telegram...";
    await enviarTelegramTexto(texto);

    status.textContent = "Guardando corte...";

    await addDoc(collection(db, "cortes_globalesV4"), {
      rutaId: ruta,
      fecha_corte: fecha,
      creado_por: usuario.nombre,
      creado_en: new Date().toISOString(),
      totales: {
        totalDia,
        totalDescuento,
        utilidadTotal,
        utilidadPorcentaje,
        ventas: ventasDia.length
      },
      vista: {
        deptosOrdenados: listaDeptos.map(([nombre, v]) => ({
          departamento: nombre,
          venta: v.venta,
          costo: v.costo,
          utilidad: v.utilidad
        })),
        topArticulos: topArt.map(([nombre, v]) => ({
          articulo: nombre,
          cantidad: v.cantidad,
          importe: v.importe,
          costo: v.costo
        }))
      }
    });

    status.textContent = "Marcando ventas como cortadas...";

    for (const v of ventasDia) {
      await updateDoc(doc(db, "ventas_rutav2", v.id), {
        cortado: true
      });
    }

    status.textContent = "Imprimiendo...";
    imprimirRAWBT(texto);

    setTimeout(() => {
      document.getElementById("modalCorteRuta")?.remove();
    }, 800);
  }
}