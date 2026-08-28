const PAGE_SIZE = 30;

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function normalizar(v) {
  return String(v ?? "").trim().toLowerCase();
}

function moneda(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN"
  });
}

function cantidad(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    maximumFractionDigits: 3
  });
}

function isoADisplay(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
}

function lunesDeSemana(valorSemana) {
  const m = String(valorSemana || "").match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;

  const anio = Number(m[1]);
  const semana = Number(m[2]);

  const ene4 = new Date(anio, 0, 4, 12);
  const diaEne4 = ene4.getDay() || 7;

  const lunes = new Date(ene4);
  lunes.setDate(ene4.getDate() - (diaEne4 - 1) + (semana - 1) * 7);
  lunes.setHours(0, 0, 0, 0);

  return lunes;
}

function fechaISO(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function rangoSemana(valorSemana) {
  const inicio = lunesDeSemana(valorSemana);
  if (!inicio) return null;

  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);

  return {
    inicio: fechaISO(inicio),
    fin: fechaISO(fin)
  };
}

function semanaISODesdeFecha(fecha) {
  const d = new Date(Date.UTC(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate()
  ));

  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);

  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((d - inicioAnio) / 86400000) + 1) / 7);

  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

export function crearVisorTickets({
  container,
  ventas = [],
  catalogo = [],
  semanaInicial = "",
  onBack
}) {
  if (!container) {
    throw new Error("No existe el contenedor interno del visor.");
  }

  let pagina = 1;
  let sugerencias = [];
  let sugerenciaActiva = -1;
  let ticketAbierto = null;

  // -----------------------------------------------------------------
  // CONSTRUCCIÓN DE TICKETS
  // Se hace 100% con ventasData.docs recibidos desde la tabla.
  // No consulta Firebase.
  // -----------------------------------------------------------------
  const mapaTickets = new Map();

  for (const partida of ventas) {
    if (!partida.ticket || !partida.fecha) continue;

    const llave = `${partida.fecha}|${partida.ticket}`;

    if (!mapaTickets.has(llave)) {
      mapaTickets.set(llave, {
        llave,
        fecha: partida.fecha,
        ticket: partida.ticket,
        cliente: partida.cliente || "",
        nombreCliente: partida.nombreCliente || "PUBLICO EN GENERAL",
        importe: 0,
        partidas: []
      });
    }

    const ticket = mapaTickets.get(llave);
    ticket.partidas.push(partida);
    ticket.importe += Number(partida.ventaTotal || 0);
  }

  const tickets = [...mapaTickets.values()].sort((a, b) => {
    const porFecha = b.fecha.localeCompare(a.fecha);
    if (porFecha) return porFecha;

    return Number(b.ticket || 0) - Number(a.ticket || 0);
  });

  // Catálogo que YA construyó la tabla.
  const catalogoBusqueda = (catalogo || [])
    .map(item => ({
      codigo: String(item.codigo ?? item.Codigo ?? ""),
      descripcion: String(item.descripcion ?? item.Descripcion ?? "")
    }))
    .filter(item => item.codigo);

  container.innerHTML = `
    <style>
      #viewVisorTickets .vt-card{
        background:#fff;
        border:1px solid #dbe3ee;
        border-radius:14px;
        overflow:hidden;
      }

      #viewVisorTickets .vt-head{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        padding:13px 15px;
        border-bottom:1px solid #e2e8f0;
      }

      #viewVisorTickets .vt-title{
        font-size:17px;
        font-weight:900;
        color:#0f172a;
      }

      #viewVisorTickets .vt-subtitle{
        margin-top:2px;
        font-size:12px;
        color:#64748b;
      }

      #viewVisorTickets .vt-back{
        border:1px solid #cbd5e1;
        background:#fff;
        color:#0f172a;
        border-radius:9px;
        padding:8px 11px;
        font-weight:850;
        cursor:pointer;
      }

      #viewVisorTickets .vt-controls{
        display:grid;
        grid-template-columns:minmax(230px,.7fr) minmax(340px,1.3fr) auto;
        gap:10px;
        align-items:end;
        padding:13px 15px;
        border-bottom:1px solid #e2e8f0;
      }

      #viewVisorTickets .vt-field{
        position:relative;
      }

      #viewVisorTickets .vt-field label{
        display:block;
        margin-bottom:5px;
        color:#64748b;
        font-size:11px;
        font-weight:900;
        text-transform:uppercase;
      }

      #viewVisorTickets .vt-field input{
        width:100%;
        height:40px;
        border:1px solid #cbd5e1;
        border-radius:9px;
        padding:0 11px;
        background:#fff;
        color:#0f172a;
      }

      #viewVisorTickets .vt-search-btn{
        height:40px;
        border:0;
        border-radius:9px;
        padding:0 16px;
        background:#b91c1c;
        color:#fff;
        font-weight:900;
        cursor:pointer;
      }

      #viewVisorTickets .vt-suggestions{
        display:none;
        position:absolute;
        left:0;
        right:0;
        top:100%;
        z-index:40;
        background:#fff;
        border:1px solid #cbd5e1;
        border-radius:0 0 10px 10px;
        max-height:300px;
        overflow:auto;
        box-shadow:0 12px 28px rgba(15,23,42,.15);
      }

      #viewVisorTickets .vt-suggestions.open{
        display:block;
      }

      #viewVisorTickets .vt-suggestion{
        padding:9px 11px;
        border-bottom:1px solid #eef2f7;
        cursor:pointer;
      }

      #viewVisorTickets .vt-suggestion:hover,
      #viewVisorTickets .vt-suggestion.active{
        background:#fff5f5;
      }

      #viewVisorTickets .vt-s-code{
        font-family:Consolas,monospace;
        font-size:12px;
        font-weight:900;
        color:#0f172a;
      }

      #viewVisorTickets .vt-s-desc{
        margin-top:2px;
        color:#475569;
        font-size:12px;
      }

      #viewVisorTickets .vt-summary{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        padding:10px 15px;
        background:#f8fafc;
        border-bottom:1px solid #e2e8f0;
      }

      #viewVisorTickets .vt-week-label{
        font-size:13px;
        font-weight:850;
        color:#334155;
      }

      #viewVisorTickets .vt-count{
        background:#e2e8f0;
        border-radius:999px;
        padding:5px 8px;
        font-size:12px;
        font-weight:850;
        color:#334155;
      }

      #viewVisorTickets .vt-list{
        display:flex;
        flex-direction:column;
        gap:7px;
        padding:10px 14px;
      }

      #viewVisorTickets .vt-row{
        display:grid;
        grid-template-columns:135px minmax(180px,1fr) 180px 34px;
        gap:14px;
        align-items:center;
        padding:11px 13px;
        background:#fff;
        border:1px solid #dbe3ee;
        border-radius:10px;
        cursor:pointer;
      }

      #viewVisorTickets .vt-row:hover{
        background:#fff8f8;
        border-color:#e6b3b6;
      }

      #viewVisorTickets .vt-date{
        color:#475569;
        font-size:12px;
        font-weight:800;
      }

      #viewVisorTickets .vt-ticket{
        color:#0f172a;
        font-family:Consolas,monospace;
        font-size:17px;
        font-weight:950;
      }

      #viewVisorTickets .vt-match{
        overflow:hidden;
        margin-top:3px;
        color:#64748b;
        font-size:11px;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      #viewVisorTickets .vt-amount{
        text-align:right;
        color:#0f172a;
        font-size:16px;
        font-weight:950;
      }

      #viewVisorTickets .vt-arrow{
        width:32px;
        height:32px;
        display:grid;
        place-items:center;
        border-radius:8px;
        background:#fff0f1;
        color:#b91c1c;
        font-weight:950;
      }

      #viewVisorTickets .vt-empty{
        padding:44px 16px;
        text-align:center;
        color:#64748b;
      }

      #viewVisorTickets .vt-pager{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        padding:10px 14px;
        background:#f8fafc;
        border-top:1px solid #e2e8f0;
      }

      #viewVisorTickets .vt-page-info{
        color:#64748b;
        font-size:12px;
        font-weight:750;
      }

      #viewVisorTickets .vt-pages{
        display:flex;
        gap:5px;
        align-items:center;
        flex-wrap:wrap;
      }

      #viewVisorTickets .vt-pg{
        min-width:33px;
        height:33px;
        border:1px solid #cbd5e1;
        border-radius:8px;
        background:#fff;
        font-weight:850;
        cursor:pointer;
      }

      #viewVisorTickets .vt-pg.active{
        border-color:#b91c1c;
        background:#b91c1c;
        color:#fff;
      }

      #viewVisorTickets .vt-pg:disabled{
        opacity:.4;
        cursor:default;
      }

      /* Ticket interno */
      #viewVisorTickets .vt-ticket-screen{
        display:none;
      }

      #viewVisorTickets .vt-ticket-screen.open{
        display:block;
      }

      #viewVisorTickets .vt-list-screen.hidden{
        display:none;
      }

      #viewVisorTickets .vt-ticket-toolbar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        padding:12px 14px;
        border-bottom:1px solid #e2e8f0;
      }

      #viewVisorTickets .vt-ticket-actions{
        display:flex;
        gap:7px;
      }

      #viewVisorTickets .vt-ticket-btn{
        border:1px solid #cbd5e1;
        border-radius:8px;
        background:#fff;
        color:#0f172a;
        padding:8px 10px;
        font-weight:850;
        cursor:pointer;
      }

      #viewVisorTickets .vt-ticket-btn.primary{
        border-color:#b91c1c;
        background:#b91c1c;
        color:#fff;
      }

      #viewVisorTickets .vt-paper-wrap{
        display:flex;
        justify-content:center;
        padding:22px 12px 30px;
        background:#eef2f6;
      }

      #viewVisorTickets .vt-paper{
        width:390px;
        max-width:100%;
        padding:20px 18px;
        background:#fff;
        color:#000;
        box-shadow:0 10px 26px rgba(15,23,42,.12);
        font-family:"Courier New",monospace;
      }

      #viewVisorTickets .vt-paper-brand{
        text-align:center;
        font-family:Arial,sans-serif;
        font-size:22px;
        font-weight:950;
      }

      #viewVisorTickets .vt-paper-store{
        margin-top:4px;
        text-align:center;
        font-size:12px;
        font-weight:800;
      }

      #viewVisorTickets .vt-rule{
        margin:11px 0;
        border-top:1px dashed #000;
      }

      #viewVisorTickets .vt-meta{
        font-size:12px;
        line-height:1.55;
      }

      #viewVisorTickets .vt-items{
        width:100%;
        border-collapse:collapse;
        font-size:11px;
      }

      #viewVisorTickets .vt-items th,
      #viewVisorTickets .vt-items td{
        padding:5px 2px;
        border:0;
        vertical-align:top;
      }

      #viewVisorTickets .vt-items th{
        border-bottom:1px dashed #000;
        text-align:left;
      }

      #viewVisorTickets .vt-item-name{
        font-weight:700;
        line-height:1.25;
      }

      #viewVisorTickets .vt-item-code{
        margin-top:2px;
        color:#444;
        font-size:10px;
      }

      #viewVisorTickets .vt-item-qty,
      #viewVisorTickets .vt-item-total{
        text-align:right;
      }

      #viewVisorTickets .vt-grand{
        display:flex;
        justify-content:space-between;
        gap:10px;
        padding-top:9px;
        border-top:1px dashed #000;
        font-size:18px;
        font-weight:950;
      }

      #viewVisorTickets .vt-foot{
        margin-top:14px;
        text-align:center;
        font-size:11px;
      }

      @media(max-width:760px){
        #viewVisorTickets .vt-controls{
          grid-template-columns:1fr;
        }

        #viewVisorTickets .vt-search-btn{
          width:100%;
        }

        #viewVisorTickets .vt-row{
          grid-template-columns:1fr 36px;
          gap:7px;
        }

        #viewVisorTickets .vt-date{
          grid-column:1;
        }

        #viewVisorTickets .vt-arrow{
          grid-column:2;
          grid-row:1 / 3;
        }

        #viewVisorTickets .vt-amount{
          grid-column:1;
          text-align:left;
        }

        #viewVisorTickets .vt-pager{
          align-items:flex-start;
          flex-direction:column;
        }

        #viewVisorTickets .vt-paper-wrap{
          padding:10px 0;
        }

        #viewVisorTickets .vt-paper{
          width:100%;
          box-shadow:none;
        }
      }

      @media print{
        body *{
          visibility:hidden !important;
        }

        #viewVisorTickets,
        #viewVisorTickets *,
        #vtTicketScreen,
        #vtTicketScreen *{
          visibility:visible !important;
        }

        #viewVisorTickets{
          position:absolute !important;
          left:0 !important;
          top:0 !important;
          width:100% !important;
        }

        #vtListScreen,
        #vtTicketToolbar{
          display:none !important;
        }

        #vtTicketScreen{
          display:block !important;
        }

        #viewVisorTickets .vt-paper-wrap{
          padding:0 !important;
          background:#fff !important;
        }

        #viewVisorTickets .vt-paper{
          width:80mm !important;
          max-width:80mm !important;
          padding:4mm 3mm !important;
          box-shadow:none !important;
          margin:0 auto !important;
        }

        @page{
          margin:4mm;
        }
      }
    </style>

    <div class="vt-card">
      <div class="vt-list-screen" id="vtListScreen">
        <div class="vt-head">
          <div>
            <div class="vt-title">Visor de tickets de venta</div>
            <div class="vt-subtitle">Integrado a la tabla · usa los datos ya cargados</div>
          </div>
          <button class="vt-back" id="vtBack">← Tabla</button>
        </div>

        <div class="vt-controls">
          <div class="vt-field">
            <label>Semana</label>
            <input type="week" id="vtWeek">
          </div>

          <div class="vt-field">
            <label>Buscar en esta semana</label>
            <input
              type="search"
              id="vtSearch"
              autocomplete="off"
              placeholder="Código, descripción o ticket..."
            >
            <div class="vt-suggestions" id="vtSuggestions"></div>
          </div>

          <button class="vt-search-btn" id="vtSearchBtn">Buscar</button>
        </div>

        <div class="vt-summary">
          <div class="vt-week-label" id="vtWeekLabel">Semana</div>
          <div class="vt-count" id="vtCount">0 tickets</div>
        </div>

        <div class="vt-list" id="vtList"></div>

        <div class="vt-pager">
          <div class="vt-page-info" id="vtPageInfo">Sin registros</div>
          <div class="vt-pages" id="vtPages"></div>
        </div>
      </div>

      <div class="vt-ticket-screen" id="vtTicketScreen">
        <div class="vt-ticket-toolbar" id="vtTicketToolbar">
          <div>
            <div class="vt-title" id="vtTicketTitle">Ticket</div>
            <div class="vt-subtitle">Reconstruido con las partidas ya cargadas</div>
          </div>

          <div class="vt-ticket-actions">
            <button class="vt-ticket-btn" id="vtTicketBack">← Tickets</button>
            <button class="vt-ticket-btn primary" id="vtPrint">Imprimir</button>
          </div>
        </div>

        <div class="vt-paper-wrap">
          <div class="vt-paper" id="vtPaper"></div>
        </div>
      </div>
    </div>
  `;

  const $ = id => container.querySelector("#" + id);

  const semanaInput = $("vtWeek");
  const buscarInput = $("vtSearch");
  const sugerenciasBox = $("vtSuggestions");

  semanaInput.value = semanaInicial || semanaISODesdeFecha(new Date());

  function obtenerRangoActual() {
    return rangoSemana(semanaInput.value);
  }

  function buscarEnCatalogo(texto) {
    const q = normalizar(texto);
    if (!q) return [];

    return catalogoBusqueda
      .filter(item =>
        normalizar(item.codigo).includes(q) ||
        normalizar(item.descripcion).includes(q)
      )
      .slice(0, 12);
  }

  function ocultarSugerencias() {
    sugerenciasBox.classList.remove("open");
    sugerenciasBox.innerHTML = "";
    sugerencias = [];
    sugerenciaActiva = -1;
  }

  function actualizarSugerencias() {
    sugerencias = buscarEnCatalogo(buscarInput.value);
    sugerenciaActiva = -1;

    if (!sugerencias.length) {
      ocultarSugerencias();
      return;
    }

    sugerenciasBox.innerHTML = sugerencias.map((item, i) => `
      <div class="vt-suggestion" data-index="${i}">
        <div class="vt-s-code">${esc(item.codigo)}</div>
        <div class="vt-s-desc">${esc(item.descripcion)}</div>
      </div>
    `).join("");

    sugerenciasBox.classList.add("open");

    sugerenciasBox.querySelectorAll(".vt-suggestion").forEach(el => {
      el.addEventListener("mousedown", event => {
        event.preventDefault();

        const item = sugerencias[Number(el.dataset.index)];
        if (!item) return;

        buscarInput.value = item.codigo;
        ocultarSugerencias();
        pagina = 1;
        renderLista();
      });
    });
  }

  function ticketsFiltrados() {
    const rango = obtenerRangoActual();
    if (!rango) return [];

    const termino = normalizar(buscarInput.value);

    return tickets.filter(ticket => {
      if (ticket.fecha < rango.inicio || ticket.fecha > rango.fin) {
        return false;
      }

      if (!termino) return true;

      if (normalizar(ticket.ticket).includes(termino)) {
        return true;
      }

      return ticket.partidas.some(partida =>
        normalizar(partida.codigo).includes(termino) ||
        normalizar(partida.descripcion).includes(termino)
      );
    });
  }

  function abrirTicket(ticket) {
    ticketAbierto = ticket;

    const partidas = [...ticket.partidas].sort(
      (a, b) => Number(a.lineaOrigen || 0) - Number(b.lineaOrigen || 0)
    );

    $("vtTicketTitle").textContent =
      `Ticket ${ticket.ticket} · ${isoADisplay(ticket.fecha)}`;

    $("vtPaper").innerHTML = `
      <div class="vt-paper-brand">PROVSOFT</div>
      <div class="vt-paper-store">ALLENDE 2</div>

      <div class="vt-rule"></div>

      <div class="vt-meta">
        <div><b>FECHA:</b> ${esc(isoADisplay(ticket.fecha))}</div>
        <div><b>TICKET:</b> ${esc(ticket.ticket)}</div>
        <div><b>CLIENTE:</b> ${esc(ticket.nombreCliente || "PUBLICO EN GENERAL")}</div>
      </div>

      <div class="vt-rule"></div>

      <table class="vt-items">
        <thead>
          <tr>
            <th>ARTÍCULO</th>
            <th style="text-align:right">CANT.</th>
            <th style="text-align:right">IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          ${partidas.map(partida => `
            <tr>
              <td>
                <div class="vt-item-name">${esc(partida.descripcion)}</div>
                <div class="vt-item-code">
                  ${esc(partida.codigo)} · ${moneda(partida.ventaPieza)} c/u
                </div>
              </td>
              <td class="vt-item-qty">${cantidad(partida.cantidad)}</td>
              <td class="vt-item-total">${moneda(partida.ventaTotal)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="vt-rule"></div>

      <div class="vt-grand">
        <span>TOTAL</span>
        <span>${moneda(ticket.importe)}</span>
      </div>

      <div class="vt-foot">
        PROVSOFT · ALLENDE 2
      </div>
    `;

    $("vtListScreen").classList.add("hidden");
    $("vtTicketScreen").classList.add("open");

    container.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function cerrarTicket() {
    ticketAbierto = null;
    $("vtTicketScreen").classList.remove("open");
    $("vtListScreen").classList.remove("hidden");
  }

  function renderPaginacion(totalRegistros) {
    const totalPaginas = Math.max(
      1,
      Math.ceil(totalRegistros / PAGE_SIZE)
    );

    if (pagina > totalPaginas) {
      pagina = totalPaginas;
    }

    const inicio = totalRegistros
      ? (pagina - 1) * PAGE_SIZE + 1
      : 0;

    const fin = Math.min(
      pagina * PAGE_SIZE,
      totalRegistros
    );

    $("vtPageInfo").textContent = totalRegistros
      ? `Mostrando ${inicio}-${fin} de ${totalRegistros} · 30 por página`
      : "Sin registros";

    const paginas = $("vtPages");

    if (totalRegistros <= PAGE_SIZE) {
      paginas.innerHTML = "";
      return;
    }

    const candidatas = new Set([
      1,
      totalPaginas,
      pagina - 2,
      pagina - 1,
      pagina,
      pagina + 1,
      pagina + 2
    ]);

    const lista = [...candidatas]
      .filter(n => n >= 1 && n <= totalPaginas)
      .sort((a, b) => a - b);

    const html = [];

    html.push(`
      <button
        class="vt-pg"
        data-page="${pagina - 1}"
        ${pagina === 1 ? "disabled" : ""}
      >‹</button>
    `);

    let anterior = 0;

    for (const numero of lista) {
      if (anterior && numero - anterior > 1) {
        html.push(`<span style="color:#94a3b8">…</span>`);
      }

      html.push(`
        <button
          class="vt-pg ${numero === pagina ? "active" : ""}"
          data-page="${numero}"
        >${numero}</button>
      `);

      anterior = numero;
    }

    html.push(`
      <button
        class="vt-pg"
        data-page="${pagina + 1}"
        ${pagina === totalPaginas ? "disabled" : ""}
      >›</button>
    `);

    paginas.innerHTML = html.join("");

    paginas.querySelectorAll("button[data-page]").forEach(btn => {
      btn.addEventListener("click", () => {
        const nuevaPagina = Number(btn.dataset.page);

        if (
          nuevaPagina >= 1 &&
          nuevaPagina <= totalPaginas
        ) {
          pagina = nuevaPagina;
          renderLista();
        }
      });
    });
  }

  function renderLista() {
    const rango = obtenerRangoActual();
    const encontrados = ticketsFiltrados();
    const termino = normalizar(buscarInput.value);

    $("vtWeekLabel").textContent = rango
      ? `${isoADisplay(rango.inicio)} al ${isoADisplay(rango.fin)}`
      : "Semana inválida";

    $("vtCount").textContent =
      `${encontrados.length.toLocaleString("es-MX")} tickets`;

    const inicio = (pagina - 1) * PAGE_SIZE;
    const paginaActual = encontrados.slice(
      inicio,
      inicio + PAGE_SIZE
    );

    if (!paginaActual.length) {
      $("vtList").innerHTML = `
        <div class="vt-empty">
          ${
            termino
              ? `Sin coincidencias para <b>${esc(buscarInput.value)}</b> en esta semana.`
              : "No hay tickets en esta semana."
          }
        </div>
      `;
    } else {
      $("vtList").innerHTML = paginaActual.map(ticket => {
        const coincidencia = termino
          ? ticket.partidas.find(partida =>
              normalizar(partida.codigo).includes(termino) ||
              normalizar(partida.descripcion).includes(termino)
            )
          : null;

        return `
          <div class="vt-row" data-key="${esc(ticket.llave)}">
            <div class="vt-date">
              ${esc(isoADisplay(ticket.fecha))}
            </div>

            <div>
              <div class="vt-ticket">
                Ticket ${esc(ticket.ticket)}
              </div>

              ${
                coincidencia
                  ? `<div class="vt-match">
                      ${esc(coincidencia.codigo)} ·
                      ${esc(coincidencia.descripcion)}
                    </div>`
                  : ""
              }
            </div>

            <div class="vt-amount">
              ${moneda(ticket.importe)}
            </div>

            <div class="vt-arrow">›</div>
          </div>
        `;
      }).join("");

      $("vtList")
        .querySelectorAll(".vt-row")
        .forEach(row => {
          row.addEventListener("click", () => {
            const ticket = tickets.find(
              item => item.llave === row.dataset.key
            );

            if (ticket) {
              abrirTicket(ticket);
            }
          });
        });
    }

    renderPaginacion(encontrados.length);
  }

  $("vtBack").addEventListener("click", () => {
    cerrarTicket();
    onBack?.();
  });

  $("vtSearchBtn").addEventListener("click", () => {
    ocultarSugerencias();
    pagina = 1;
    renderLista();
  });

  semanaInput.addEventListener("change", () => {
    buscarInput.value = "";
    ocultarSugerencias();
    pagina = 1;
    renderLista();
  });

  buscarInput.addEventListener("input", actualizarSugerencias);
  buscarInput.addEventListener("focus", actualizarSugerencias);

  buscarInput.addEventListener("blur", () => {
    setTimeout(ocultarSugerencias, 120);
  });

  buscarInput.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" && sugerencias.length) {
      event.preventDefault();

      sugerenciaActiva =
        (sugerenciaActiva + 1) % sugerencias.length;

      sugerenciasBox
        .querySelectorAll(".vt-suggestion")
        .forEach((el, i) =>
          el.classList.toggle(
            "active",
            i === sugerenciaActiva
          )
        );

      return;
    }

    if (event.key === "ArrowUp" && sugerencias.length) {
      event.preventDefault();

      sugerenciaActiva =
        sugerenciaActiva <= 0
          ? sugerencias.length - 1
          : sugerenciaActiva - 1;

      sugerenciasBox
        .querySelectorAll(".vt-suggestion")
        .forEach((el, i) =>
          el.classList.toggle(
            "active",
            i === sugerenciaActiva
          )
        );

      return;
    }

    if (event.key === "Escape") {
      ocultarSugerencias();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (
        sugerenciaActiva >= 0 &&
        sugerencias[sugerenciaActiva]
      ) {
        buscarInput.value =
          sugerencias[sugerenciaActiva].codigo;
      }

      ocultarSugerencias();
      pagina = 1;
      renderLista();
    }
  });

  $("vtTicketBack").addEventListener(
    "click",
    cerrarTicket
  );

  $("vtPrint").addEventListener(
    "click",
    () => window.print()
  );

  renderLista();
}
