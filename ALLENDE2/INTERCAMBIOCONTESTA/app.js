import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from './config.js';
import { enviarContestacionIntercambioTelegram } from './telegram.js';

const TIENDA_SOLICITA = 'ALLENDE 1';
const TIENDA_CONTESTA = 'ALLENDE 2';

let solicitudes = [];
let solicitudActual = null;
let firmaBase64 = '';
let firmaInicializada = false;

const lista = document.getElementById('listaSolicitudes');

function estado(txt){
  document.getElementById('estadoCarga').textContent = txt;
}

function barra(v){
  document.getElementById('barra').style.width = v + '%';
}

function formatoFecha(fecha){
  try{
    if(!fecha) return '';
    const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return d.toLocaleString('es-MX');
  }catch{
    return '';
  }
}

function limpiarTemporales(){
  firmaBase64 = '';
  solicitudActual = null;

  const autorizadoPor = document.getElementById('autorizadoPor');
  const tbodyDetalle = document.getElementById('tbodyDetalle');
  const tbodyOrden = document.getElementById('tbodyOrden');
  const firmaSolicitudPreview = document.getElementById('firmaSolicitudPreview');

  if(autorizadoPor) autorizadoPor.value = '';
  if(tbodyDetalle) tbodyDetalle.innerHTML = '';
  if(tbodyOrden) tbodyOrden.innerHTML = '';
  if(firmaSolicitudPreview) firmaSolicitudPreview.innerHTML = '';

  limpiarFirmaSeguro();

  document.getElementById('modalOrden').style.display = 'none';
  document.getElementById('modalDetalle').style.display = 'none';
}

window.cargarSolicitudes = async function(){

  lista.innerHTML = 'Cargando órdenes...';

  estado('Leyendo solicitudes de Allende 1...');
  barra(25);

  try{

    const ref = collection(
      db,
      'TIENDAS',
      TIENDA_SOLICITA,
      'INTERCAMBIOS'
    );

    const q = query(
      ref,
      where('tienda_contesta','==',TIENDA_CONTESTA),
      where('estado','==','PENDIENTE_AUTORIZAR')
    );

    const snap = await getDocs(q);

    solicitudes = [];

    snap.forEach(docu=>{
      solicitudes.push({
        id:docu.id,
        ...docu.data()
      });
    });

    solicitudes.sort((a,b)=>{
      const fa = a.fecha_solicitud?.toDate ? a.fecha_solicitud.toDate().getTime() : new Date(a.fecha_solicitud || 0).getTime();
      const fb = b.fecha_solicitud?.toDate ? b.fecha_solicitud.toDate().getTime() : new Date(b.fecha_solicitud || 0).getTime();
      return fb - fa;
    });

    barra(70);
    renderSolicitudes();
    estado('Órdenes cargadas');
    barra(100);

  }catch(error){

    console.error(error);
    lista.innerHTML = `
      <div class="solicitud">
        Error al cargar solicitudes. Revisa consola o conexión.
      </div>
    `;
    estado('Error al cargar solicitudes');
    barra(100);

  }
};

function renderSolicitudes(){

  if(!solicitudes.length){
    lista.innerHTML = `
      <div class="solicitud">
        No hay órdenes pendientes por autorizar.
      </div>
    `;
    return;
  }

  lista.innerHTML = '';

  solicitudes.forEach(s=>{

    const div = document.createElement('div');

    div.className = 'solicitud';
    div.onclick = ()=>abrirOrden(s.id);

    div.innerHTML = `
      <div class="solicitud-head">
        <div>
          <h3>${s.folio || ''}</h3>
          <p><b>Solicita:</b> ${s.tienda_solicita || ''}</p>
          <p><b>Solicitado por:</b> ${s.solicitado_por || ''}</p>
          <p><b>Fecha:</b> ${formatoFecha(s.fecha_solicitud)}</p>
        </div>

        <div class="estado">${s.estado || ''}</div>
      </div>

      <p><b>Partidas:</b> ${(s.items || []).length}</p>
      <p style="margin-top:8px;color:#666;">Toca esta orden para visualizarla.</p>
    `;

    lista.appendChild(div);

  });
}

window.abrirOrden = function(id){

  solicitudActual = solicitudes.find(x=>x.id === id);

  if(!solicitudActual) return;

  document.getElementById('ordenFolio').textContent = solicitudActual.folio || '';

  document.getElementById('ordenInfo').innerHTML = `
    <b>Solicita:</b> ${solicitudActual.tienda_solicita || ''}<br>
    <b>Contesta:</b> ${solicitudActual.tienda_contesta || ''}<br>
    <b>Solicitado por:</b> ${solicitudActual.solicitado_por || ''}<br>
    <b>Estado:</b> ${solicitudActual.estado || ''}<br>
    <b>Fecha:</b> ${formatoFecha(solicitudActual.fecha_solicitud)}
  `;

  const tbody = document.getElementById('tbodyOrden');
  tbody.innerHTML = '';

  (solicitudActual.items || []).forEach(item=>{

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${item.codigo || ''}</td>
      <td>${item.descripcion || ''}</td>
      <td>${item.cantidad_solicitada || 0}</td>
    `;

    tbody.appendChild(tr);

  });

  document.getElementById('firmaSolicitudPreview').innerHTML =
    solicitudActual.firma_solicitud
      ? `<img src="${solicitudActual.firma_solicitud}" class="firma-img">`
      : '<p>Sin firma registrada.</p>';

  document.getElementById('modalOrden').style.display = 'flex';
};

window.cerrarOrden = function(){
  document.getElementById('modalOrden').style.display = 'none';
};

window.abrirContestacion = function(){
  cerrarOrden();
  if(!solicitudActual) return;
  abrirDetalle(solicitudActual.id);
};

window.imprimirOrden = function(){
  if(!solicitudActual) return;
  imprimirSolicitud(solicitudActual);
};

window.abrirDetalle = function(id){

  solicitudActual = solicitudes.find(x=>x.id === id);

  if(!solicitudActual) return;

  firmaBase64 = '';

  document.getElementById('modalFolio').textContent = solicitudActual.folio || '';

  document.getElementById('modalInfo').innerHTML = `
    <b>Solicita:</b> ${solicitudActual.tienda_solicita || ''}<br>
    <b>Contesta:</b> ${solicitudActual.tienda_contesta || ''}<br>
    <b>Solicitado por:</b> ${solicitudActual.solicitado_por || ''}
  `;

  const tbody = document.getElementById('tbodyDetalle');
  tbody.innerHTML = '';

  (solicitudActual.items || []).forEach((item,i)=>{

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${item.codigo || ''}</td>
      <td>${item.descripcion || ''}</td>
      <td>${item.cantidad_solicitada || 0}</td>
      <td>
        <input
          type="number"
          min="0"
          value="${item.cantidad_solicitada || 0}"
          data-index="${i}"
          class="cantidadAutorizada"
        >
      </td>
    `;

    tbody.appendChild(tr);

  });

  document.getElementById('autorizadoPor').value = '';

  document.getElementById('modalDetalle').style.display = 'flex';

  setTimeout(()=>{
    iniciarFirma();
    limpiarFirmaSeguro();
  },100);
};

window.cerrarModal = function(){
  document.getElementById('modalDetalle').style.display = 'none';
  firmaBase64 = '';
  limpiarFirmaSeguro();
};

window.autorizarSolicitud = async function(){

  if(!solicitudActual){
    alert('No hay solicitud seleccionada');
    return;
  }

  const autorizadoPor = document.getElementById('autorizadoPor').value.trim();

  if(!autorizadoPor){
    alert('Captura quién autoriza en Allende 2');
    return;
  }

  if(!firmaBase64){
    alert('Falta firma de autorización');
    return;
  }

  const inputs = document.querySelectorAll('.cantidadAutorizada');

  const itemsActualizados = (solicitudActual.items || []).map((item,i)=>{

    const input = [...inputs].find(x=>Number(x.dataset.index) === i);
    const autorizada = Number(input?.value || 0);

    return {
      ...item,
      cantidad_autorizada: autorizada,
      estado_item:
        autorizada <= 0
          ? 'NO_AUTORIZADO'
          : autorizada < Number(item.cantidad_solicitada || 0)
          ? 'AUTORIZADO_PARCIAL'
          : 'AUTORIZADO'
    };
  });

  const todoCero = itemsActualizados.every(
    x=>Number(x.cantidad_autorizada || 0) <= 0
  );

  const parcial = itemsActualizados.some(
    x => x.estado_item === 'AUTORIZADO_PARCIAL' ||
         x.estado_item === 'NO_AUTORIZADO'
  );

  let estadoFinal = 'AUTORIZADO';

  if(todoCero){
    estadoFinal = 'RECHAZADO';
  }else if(parcial){
    estadoFinal = 'AUTORIZADO_PARCIAL';
  }

  const reciboAutorizacion = {
    ...solicitudActual,
    estado: estadoFinal,
    autorizado_por: autorizadoPor,
    firma_autorizacion: firmaBase64,
    fecha_autorizacion_local: new Date(),
    items: itemsActualizados
  };

  const ref = doc(
    db,
    'TIENDAS',
    TIENDA_SOLICITA,
    'INTERCAMBIOS',
    solicitudActual.id
  );

  try{

    await updateDoc(ref, {
      estado: estadoFinal,
      autorizado_por: autorizadoPor,
      firma_autorizacion: firmaBase64,
      fecha_autorizacion: serverTimestamp(),
      items: itemsActualizados,
      updatedAt: serverTimestamp()
    });

    let telegramEnviado = false;
    let errorTelegram = null;

    try{
      await enviarContestacionConPDF(reciboAutorizacion);
      telegramEnviado = true;
    }catch(errTelegram){
      console.error('Error enviando autorización a Telegram',errTelegram);
      errorTelegram = errTelegram;
    }

    imprimirReciboAutorizacion(reciboAutorizacion);
    limpiarTemporales();
    await cargarSolicitudes();

    if(telegramEnviado){
      alert('Autorización registrada. El PDF fue enviado a Telegram.');
    }else{
      alert(
        'La autorización se registró y se generó el recibo, pero no pudo enviarse a Telegram.\n\n' +
        (errorTelegram?.message || 'Revisa token, chat ID y conexión.')
      );
    }

  }catch(error){

    console.error(error);
    alert('Error al autorizar. No se limpió la pantalla para evitar perder la información.');

  }
};

window.rechazarSolicitud = async function(){

  if(!solicitudActual){
    alert('No hay solicitud seleccionada');
    return;
  }

  const autorizadoPor = document.getElementById('autorizadoPor').value.trim();

  if(!autorizadoPor){
    alert('Captura quién rechaza en Allende 2');
    return;
  }

  const itemsRechazados = (solicitudActual.items || []).map(item=>({
    ...item,
    cantidad_autorizada:0,
    estado_item:'NO_AUTORIZADO'
  }));

  const reciboRechazo = {
    ...solicitudActual,
    estado:'RECHAZADO',
    autorizado_por: autorizadoPor,
    firma_autorizacion: firmaBase64 || '',
    fecha_autorizacion_local: new Date(),
    items: itemsRechazados
  };

  const ref = doc(
    db,
    'TIENDAS',
    TIENDA_SOLICITA,
    'INTERCAMBIOS',
    solicitudActual.id
  );

  try{

    await updateDoc(ref, {
      estado:'RECHAZADO',
      autorizado_por: autorizadoPor,
      firma_autorizacion: firmaBase64 || '',
      fecha_autorizacion: serverTimestamp(),
      items: itemsRechazados,
      updatedAt: serverTimestamp()
    });

    let telegramEnviado = false;
    let errorTelegram = null;

    try{
      await enviarContestacionConPDF(reciboRechazo);
      telegramEnviado = true;
    }catch(errTelegram){
      console.error('Error enviando rechazo a Telegram',errTelegram);
      errorTelegram = errTelegram;
    }

    imprimirReciboAutorizacion(reciboRechazo);
    limpiarTemporales();
    await cargarSolicitudes();

    if(telegramEnviado){
      alert('Solicitud rechazada. El PDF fue enviado a Telegram.');
    }else{
      alert(
        'La solicitud se rechazó y se generó el recibo, pero no pudo enviarse a Telegram.\n\n' +
        (errorTelegram?.message || 'Revisa token, chat ID y conexión.')
      );
    }

  }catch(error){

    console.error(error);
    alert('Error al rechazar. No se limpió la pantalla para evitar perder la información.');

  }
};


function generarPDFContestacion(docu){
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p','mm','letter');
  let y = 15;

  pdf.setFont('helvetica','bold');
  pdf.setFontSize(16);
  pdf.text('CONTESTACIÓN DE INTERCAMBIO',105,y,{align:'center'});

  y += 8;
  pdf.setFontSize(10);
  pdf.setFont('helvetica','normal');
  pdf.text(`${docu.tienda_solicita || TIENDA_SOLICITA} → ${docu.tienda_contesta || TIENDA_CONTESTA}`,105,y,{align:'center'});
  y += 12;

  const campos = [
    ['Folio:',docu.folio || ''],
    ['Estado final:',docu.estado || ''],
    ['Tienda solicita:',docu.tienda_solicita || TIENDA_SOLICITA],
    ['Tienda contesta:',docu.tienda_contesta || TIENDA_CONTESTA],
    ['Solicitado por:',docu.solicitado_por || ''],
    ['Contestado por:',docu.autorizado_por || ''],
    ['Fecha:',formatoFecha(docu.fecha_autorizacion_local || new Date())]
  ];

  campos.forEach(([etiqueta,valor])=>{
    if(!valor) return;
    pdf.setFont('helvetica','bold');
    pdf.text(etiqueta,15,y);
    pdf.setFont('helvetica','normal');
    pdf.text(String(valor).substring(0,90),52,y);
    y += 7;
  });

  y += 4;
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(8);
  pdf.text('Código',15,y);
  pdf.text('Producto',45,y);
  pdf.text('Solicitado',145,y);
  pdf.text('Autorizado',170,y);
  pdf.text('Estado',200,y,{align:'right'});
  y += 4;
  pdf.line(15,y,200,y);
  y += 6;
  pdf.setFont('helvetica','normal');

  const items = Array.isArray(docu.items) ? docu.items : [];

  items.forEach(item=>{
    if(y > 238){
      pdf.addPage();
      y = 15;
    }
    pdf.text(String(item.codigo || '').substring(0,16),15,y);
    pdf.text(String(item.descripcion || '').substring(0,50),45,y);
    pdf.text(String(item.cantidad_solicitada || 0),145,y);
    pdf.text(String(item.cantidad_autorizada || 0),170,y);
    pdf.text(String(item.estado_item || '').substring(0,20),200,y,{align:'right'});
    y += 6;
  });

  y += 8;
  const totalSolicitado = items.reduce((t,i)=>t + Number(i.cantidad_solicitada || 0),0);
  const totalAutorizado = items.reduce((t,i)=>t + Number(i.cantidad_autorizada || 0),0);

  pdf.setFont('helvetica','bold');
  pdf.setFontSize(10);
  pdf.text(`Total piezas solicitadas: ${totalSolicitado}`,15,y);
  y += 7;
  pdf.text(`Total piezas autorizadas: ${totalAutorizado}`,15,y);
  y += 12;

  if(docu.firma_solicitud){
    pdf.text('Firma solicitud:',15,y);
    try{ pdf.addImage(docu.firma_solicitud,'PNG',15,y+4,65,25); }catch(err){ console.warn(err); }
  }

  if(docu.firma_autorizacion){
    pdf.text('Firma contestación:',110,y);
    try{ pdf.addImage(docu.firma_autorizacion,'PNG',110,y+4,65,25); }catch(err){ console.warn(err); }
  }

  return pdf.output('blob');
}

async function enviarContestacionConPDF(docu){
  const pdfBlob = generarPDFContestacion(docu);
  await enviarContestacionIntercambioTelegram(pdfBlob,docu);
  return pdfBlob;
}


function imprimirSolicitud(docu){

  const win = window.open('');

  if(!win){
    alert('El navegador bloqueó la ventana de impresión.');
    return;
  }

  const filas = (docu.items || []).map(x=>`
    <tr>
      <td>${x.codigo || ''}</td>
      <td>${x.descripcion || ''}</td>
      <td>${x.cantidad_solicitada || 0}</td>
    </tr>
  `).join('');

  win.document.write(`
    <html>
    <head>
      <title>Solicitud ${docu.folio || ''}</title>
      <style>
        body{font-family:Arial;padding:18px;font-size:13px;}
        .ticket{max-width:780px;margin:auto;}
        .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #c40000;padding-bottom:10px;margin-bottom:15px;}
        .logo{width:180px;}
        table{width:100%;border-collapse:collapse;margin-top:12px;}
        th,td{border:1px solid #aaa;padding:7px;font-size:12px;}
        th{background:#eee;}
        .firma{width:220px;max-height:120px;border:1px solid #ccc;margin-top:8px;}
        @media print{
          body{padding:0;}
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        <div class="head">
          <div>
            <h2>Solicitud de Intercambio</h2>
            <b>Folio:</b> ${docu.folio || ''}<br>
            <b>Estado:</b> ${docu.estado || ''}
          </div>
          <img src="logo.jfif" class="logo">
        </div>

        <b>Solicita:</b> ${docu.tienda_solicita || ''}<br>
        <b>Contesta:</b> ${docu.tienda_contesta || ''}<br>
        <b>Solicitado por:</b> ${docu.solicitado_por || ''}<br>
        <b>Fecha:</b> ${formatoFecha(docu.fecha_solicitud)}<br><br>

        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Solicitado</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>

        <br>

        <h3>Firma solicitud</h3>
        ${
          docu.firma_solicitud
          ? `<img src="${docu.firma_solicitud}" class="firma">`
          : '<p>Sin firma registrada.</p>'
        }
      </div>

      <script>
        window.onload = function(){
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);

  win.document.close();
}

function imprimirReciboAutorizacion(docu){

  const win = window.open('');

  if(!win){
    alert('El navegador bloqueó la ventana de impresión.');
    return;
  }

  const filas = (docu.items || []).map(x=>`
    <tr>
      <td>${x.codigo || ''}</td>
      <td>${x.descripcion || ''}</td>
      <td style="text-align:center;">${x.cantidad_solicitada || 0}</td>
      <td style="text-align:center;">${x.cantidad_autorizada || 0}</td>
      <td>${x.estado_item || ''}</td>
    </tr>
  `).join('');

  win.document.write(`
    <html>
    <head>
      <title>Recibo autorización ${docu.folio || ''}</title>
      <style>
        body{
          font-family:Arial;
          padding:18px;
          font-size:13px;
          color:#111;
        }

        .ticket{
          max-width:780px;
          margin:auto;
        }

        .head{
          display:flex;
          justify-content:space-between;
          align-items:center;
          border-bottom:3px solid #c40000;
          padding-bottom:10px;
          margin-bottom:15px;
        }

        .logo{
          width:180px;
        }

        h2{
          margin:0 0 4px 0;
          font-size:22px;
        }

        .titulo-recibo{
          text-align:center;
          border:2px solid #111;
          padding:10px;
          margin:12px 0;
          font-size:18px;
          font-weight:bold;
        }

        .box{
          border:1px solid #999;
          padding:10px;
          margin:10px 0;
          line-height:1.6;
        }

        table{
          width:100%;
          border-collapse:collapse;
          margin-top:12px;
        }

        th,td{
          border:1px solid #999;
          padding:7px;
          font-size:12px;
        }

        th{
          background:#eee;
        }

        .firmas{
          display:flex;
          justify-content:space-between;
          gap:20px;
          margin-top:25px;
        }

        .firma-box{
          width:48%;
          text-align:center;
        }

        .firma{
          width:220px;
          max-width:100%;
          max-height:120px;
          border:1px solid #ccc;
          margin-top:8px;
        }

        .linea{
          border-top:1px solid #111;
          margin-top:45px;
          padding-top:5px;
          font-size:12px;
        }

        .nota{
          margin-top:15px;
          font-size:11px;
          color:#444;
        }

        @media print{
          body{padding:0;}
        }

        @media(max-width:600px){
          .head{display:block;text-align:center;}
          .logo{margin-top:10px;}
          .firmas{display:block;}
          .firma-box{width:100%;margin-top:20px;}
        }
      </style>
    </head>
    <body>

      <div class="ticket">

        <div class="head">
          <div>
            <h2>PROVEEDORA</h2>
            <b>Intercambio entre tiendas</b><br>
            <b>Folio:</b> ${docu.folio || ''}
          </div>
          <img src="logo.jfif" class="logo">
        </div>

        <div class="titulo-recibo">
          RECIBO DE AUTORIZACIÓN
        </div>

        <div class="box">
          <b>Estado final:</b> ${docu.estado || ''}<br>
          <b>Tienda solicita:</b> ${docu.tienda_solicita || ''}<br>
          <b>Tienda que contesta:</b> ${docu.tienda_contesta || ''}<br>
          <b>Solicitado por:</b> ${docu.solicitado_por || ''}<br>
          <b>Autorizado por:</b> ${docu.autorizado_por || ''}<br>
          <b>Fecha autorización:</b> ${formatoFecha(docu.fecha_autorizacion_local || new Date())}
        </div>

        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Solicitado</th>
              <th>Autorizado</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>

        <div class="firmas">
          <div class="firma-box">
            <h3>Firma solicitud</h3>
            ${
              docu.firma_solicitud
              ? `<img src="${docu.firma_solicitud}" class="firma">`
              : '<div class="linea">Sin firma registrada</div>'
            }
            <div class="linea">${docu.solicitado_por || 'Solicitante'}</div>
          </div>

          <div class="firma-box">
            <h3>Firma autorización</h3>
            ${
              docu.firma_autorizacion
              ? `<img src="${docu.firma_autorizacion}" class="firma">`
              : '<div class="linea">Sin firma registrada</div>'
            }
            <div class="linea">${docu.autorizado_por || 'Autorizador'}</div>
          </div>
        </div>

        <div class="nota">
          Este recibo se genera al momento de contestar la solicitud. 
          La solicitud deja de aparecer en pendientes después de ser autorizada, autorizada parcialmente o rechazada.
        </div>

      </div>

      <script>
        window.onload = function(){
          window.print();
        };
      <\/script>

    </body>
    </html>
  `);

  win.document.close();
}

function iniciarFirma(){

  const canvas = document.getElementById('firma');
  const ctx = canvas.getContext('2d');

  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width;
  canvas.height = rect.height;

  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111';

  if(firmaInicializada) return;
  firmaInicializada = true;

  let dibujando = false;

  function pos(e){
    const r = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;

    return {
      x: touch.clientX - r.left,
      y: touch.clientY - r.top
    };
  }

  function start(e){
    e.preventDefault();

    dibujando = true;

    const p = pos(e);

    ctx.beginPath();
    ctx.moveTo(p.x,p.y);
  }

  function move(e){
    if(!dibujando) return;

    e.preventDefault();

    const p = pos(e);

    ctx.lineTo(p.x,p.y);
    ctx.stroke();

    firmaBase64 = canvas.toDataURL('image/png');
  }

  function end(e){
    if(e) e.preventDefault();

    if(!dibujando) return;

    dibujando = false;

    firmaBase64 = canvas.toDataURL('image/png');
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);

  canvas.addEventListener('touchstart', start, {passive:false});
  canvas.addEventListener('touchmove', move, {passive:false});
  canvas.addEventListener('touchend', end, {passive:false});
}

function limpiarFirmaSeguro(){

  const canvas = document.getElementById('firma');

  if(!canvas) return;

  const ctx = canvas.getContext('2d');

  if(!ctx) return;

  ctx.clearRect(0,0,canvas.width,canvas.height);

  firmaBase64 = '';
}

async function init(){

  estado('Preparando aplicación...');
  barra(20);

  barra(40);

  await cargarSolicitudes();

  barra(100);

  setTimeout(()=>{
    document.getElementById('loading').style.display = 'none';
  },500);
}

window.onload = init;
