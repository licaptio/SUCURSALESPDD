const CHOFERES = [
  "EDUARDO CUELLAR VAZQUEZ",
  "LUIS MIGUEL MEDELLIN ESCALONA",
  "SERGIO BECERRA MARAVILLA",
  "DAVID WENCESLAO MORALES MARTINEZ",
  "LINDOLFO GAUNA PEDRAZA"
];

const QUIEN_ENTREGA = [
  'JOSE MARIA "CHEMA" LOPEZ GONZALEZ',
  "ROSENDO GARCIA HERNANDEZ",
  "LADREDO MEDINA GARCIA",
  "ARMANDO RIVERA CAMARILLO"
];

const DESTINOS = [
  "EL PARIENTE ALIMENTOS",
  "LA MISION SUPERMERCADO",
  "BODEGA CENTRAL MATRIZ"
];

function opcionesSelect(lista, valorActual = "") {
  return lista.map(x => `
    <option value="${escA(x)}" ${x === valorActual ? "selected" : ""}>
      ${esc(x)}
    </option>
  `).join("");
}

const DB_NAME="PROVSOFT_SALIDAS_ZAPATA",DB_VERSION=1,STORE_KV="kv",STORE_HIST="historial";
let idb=null,guia=null,catalogo=[],catalogoMap=new Map(),salida=nuevaSalida(),stack=[],guardando=false;
const $=id=>document.getElementById(id);

document.addEventListener("DOMContentLoaded",async()=>{bind();setLoad("Abriendo base local...",10);idb=await openIDB();setLoad("Cargando cache local...",20);guia=await getKV("guia");catalogo=await getKV("catalogo")||[];buildCatalogo();setLoad("Descargando configuración...",35);await sync();setLoad("Revisando borrador...",85);const b=await getKV("borrador");if(b&&b.iniciado&&confirm("Hay una salida pendiente. ¿Deseas continuarla?"))salida=b;else if(b)await delKV("borrador");updateUI();setLoad("Listo.",100);setTimeout(()=>$('loader').classList.add('hidden'),250)});

function nuevaSalida(){return{iniciado:false,fecha:hoy(),folioTemporal:"",entrega:"",recibe:"",destino:"",placas:"",notasGenerales:"",articulos:[],firmaEntrega:"",firmaRecibe:""}}

function hoy(){return new Date().toISOString().slice(0,10)}
function ymd(d){return`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`}
function hms(d){return`${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}${String(d.getSeconds()).padStart(2,"0")}`}
function folioTemp(){const d=new Date();return`BORRADOR-ZAP-${ymd(d)}-${hms(d)}`}
function folioFinal(){const d=new Date();return`ZAP-${ymd(d)}-${hms(d)}`}
function setLoad(m,p){$('loaderMsg').textContent=m;$('loaderBar').style.width=p+'%'}
function fmt(n){return Number(n||0).toLocaleString('es-MX',{maximumFractionDigits:2})}
function esc(t){return String(t??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function escA(t){return esc(t).replace(/`/g,"")}
function slug(t){return String(t||"").normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function normCod(v){const s=String(v??"").trim(),d=s.replace(/\D/g,"");return d?(d.replace(/^0+/,"")||"0"):s.toLowerCase()}

function openIDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains(STORE_KV))d.createObjectStore(STORE_KV);if(!d.objectStoreNames.contains(STORE_HIST))d.createObjectStore(STORE_HIST,{keyPath:'folio'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function getKV(k){return new Promise((res,rej)=>{const tx=idb.transaction(STORE_KV,'readonly'),r=tx.objectStore(STORE_KV).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function setKV(k,v){return new Promise((res,rej)=>{const tx=idb.transaction(STORE_KV,'readwrite');tx.objectStore(STORE_KV).put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function delKV(k){return new Promise((res,rej)=>{const tx=idb.transaction(STORE_KV,'readwrite');tx.objectStore(STORE_KV).delete(k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function putHist(v){return new Promise((res,rej)=>{const tx=idb.transaction(STORE_HIST,'readwrite');tx.objectStore(STORE_HIST).put(v);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function getHist(){return new Promise((res,rej)=>{const tx=idb.transaction(STORE_HIST,'readonly'),r=tx.objectStore(STORE_HIST).getAll();r.onsuccess=()=>res((r.result||[]).sort((a,b)=>String(b.fechaGuardado).localeCompare(String(a.fechaGuardado))).slice(0,20));r.onerror=()=>rej(r.error)})}

async function sync(){let ok=false;try{const d=await RUTAS.CONFIG_DOC.get();if(d.exists){guia=normalizeGuia(d.data());await setKV('guia',guia);ok=true}}catch(e){console.warn(e)}try{const s=await RUTAS.PRODUCTOS_REF.where('activo','==',true).get();catalogo=[];s.forEach(d=>catalogo.push({id:d.id,...d.data()}));buildCatalogo();await setKV('catalogo',catalogo);ok=true}catch(e){console.warn(e)}$('estadoConexion').textContent=ok?'Sincronizado':'Modo local'}

function normalizeGuia(raw){const arts=Array.isArray(raw.articulos)?raw.articulos:[];if(Array.isArray(raw.departamentos)&&raw.departamentos.length){return{...raw,departamentos:raw.departamentos.map((d,i)=>({id:slug(d.id||d.nombre),nombre:d.nombre||'SIN DEPTO',icono:d.icono||'📦',activo:d.activo!==false,orden:+(d.orden||i+1),familias:(d.familias||[]).map((f,j)=>({id:slug(f.id||f.nombre),nombre:f.nombre||'SIN FAMILIA',icono:f.icono||'📁',activo:f.activo!==false,orden:+(f.orden||j+1),articulos:(f.articulos||[]).map((a,k)=>({codigo:String(a.codigo||'').trim(),concepto:a.concepto||a.nombre||'',icono:a.icono||'📦',activo:a.activo!==false,orden:+(a.orden||k+1)}))}))}))}}const map=new Map();arts.forEach((a,i)=>{const dep=a.departamento||'SIN DEPARTAMENTO',fam=a.familia||'SIN FAMILIA',dk=slug(dep),fk=slug(fam);if(!map.has(dk))map.set(dk,{id:dk,nombre:dep,icono:'📦',activo:true,orden:i+1,familiasMap:new Map()});const d=map.get(dk);if(!d.familiasMap.has(fk))d.familiasMap.set(fk,{id:fk,nombre:fam,icono:'📁',activo:true,orden:i+1,articulos:[]});d.familiasMap.get(fk).articulos.push({codigo:String(a.codigo||'').trim(),concepto:a.concepto||'',icono:'📦',activo:a.activo!==false,orden:+(a.orden||i+1)})});const departamentos=[...map.values()].map(d=>{const familias=[...d.familiasMap.values()].map(f=>({...f,articulos:f.articulos.sort((a,b)=>a.orden-b.orden)})).sort((a,b)=>a.orden-b.orden);delete d.familiasMap;return{...d,familias}}).sort((a,b)=>a.orden-b.orden);return{...raw,departamentos,articulos:arts}}

function buildCatalogo(){catalogoMap=new Map();catalogo.forEach(p=>[p.codigo,p.Codigo,p.CODIGO,p.codigoBarra,p.codigo_barra,p.id].filter(Boolean).forEach(c=>catalogoMap.set(normCod(c),p)))}
function prodByCod(c){return catalogoMap.get(normCod(c))}
function codProd(p){return String(p.codigo||p.Codigo||p.CODIGO||p.codigoBarra||p.id||'').trim()}
function nomProd(p,fb=''){return String(p.concepto||p.Concepto||p.descripcion||p.nombre||p.Nombre||fb||'').trim()}

function bind(){$('btnNuevaSalida').onclick=abrirDatos;$('btnAgregarProducto').onclick=()=>abrirDepartamentos();$('btnBuscarProducto').onclick=abrirBusqueda;$('btnCarrito').onclick=abrirCarrito;$('btnConfig').onclick=abrirConfig;$('btnHistorial').onclick=abrirHistorial;$('btnContinuarNotas').onclick=abrirNotas;$('btnClose').onclick=cerrarModal;$('btnBack').onclick=backModal}

function updateUI(){const total=salida.articulos.reduce((s,a)=>s+Number(a.cantidad||0),0);$('badgeCarrito').textContent=salida.articulos.length;$('stArticulos').textContent=salida.articulos.length;$('stCantidad').textContent=fmt(total);$('stGuia').textContent=(guia?.articulos?.length)||contarGuia();$('stCatalogo').textContent=catalogo.length;if(!salida.iniciado){$('tituloEstado').textContent='Nueva salida';$('resumenSalida').textContent='Inicia una salida para comenzar.';$('panelAcciones').classList.add('hidden');$('btnNuevaSalida').classList.remove('hidden');return}$('tituloEstado').textContent=salida.folioTemporal;$('resumenSalida').innerHTML=`<b>Destino:</b> ${esc(salida.destino||'SIN DESTINO')}<br><b>Entrega:</b> ${esc(salida.entrega||'')} · <b>Chofer:</b> ${esc(salida.recibe||'')}<br><b>Artículos:</b> ${salida.articulos.length} · <b>Cantidad:</b> ${fmt(total)}`;$('panelAcciones').classList.remove('hidden');$('btnNuevaSalida').classList.add('hidden')}

function contarGuia(){return(guia?.departamentos||[]).flatMap(d=>d.familias||[]).flatMap(f=>f.articulos||[]).length}

function modal(title,html,back=false,push=true){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').classList.remove('hidden');$('btnBack').classList.toggle('hidden',!back);if(push)stack.push({title,html,back})}
function cerrarModal(){$('modal').classList.add('hidden');$('modalBody').innerHTML='';stack=[]}
function backModal(){stack.pop();const p=stack.pop();if(!p)return cerrarModal();modal(p.title,p.html,p.back,true)}
function validarInicio(){if(!salida.iniciado){alert('Primero inicia una salida.');return false}return true}
async function saveDraft(){if(salida.iniciado)await setKV('borrador',salida)}

function abrirDatos(){
  if(!salida.iniciado){
    salida=nuevaSalida();
    salida.iniciado=true;
    salida.folioTemporal=folioTemp();
  }

  modal('Datos generales',`
    <div class="field">
      <label>Chofer *</label>
      <select id="recibe">
        <option value="">Selecciona chofer</option>
        ${opcionesSelect(CHOFERES,salida.recibe)}
      </select>
    </div>

    <div class="field">
      <label>Quién entrega *</label>
      <select id="entrega">
        <option value="">Selecciona quién entrega</option>
        ${opcionesSelect(QUIEN_ENTREGA,salida.entrega)}
      </select>
    </div>

    <div class="field">
      <label>Destino *</label>
      <select id="destino">
        <option value="">Selecciona destino</option>
        ${opcionesSelect(DESTINOS,salida.destino)}
      </select>
    </div>

    <div class="field">
      <label>Placas</label>
      <input id="placas" value="${escA(salida.placas)}">
    </div>

    <button class="btn primary" onclick="guardarDatos()">Continuar</button>
  `,false,false);
}

window.guardarDatos=async()=>{
  salida.recibe=$('recibe').value.trim();
  salida.entrega=$('entrega').value.trim();
  salida.destino=$('destino').value.trim();
  salida.placas=$('placas').value.trim();

  if(!salida.recibe||!salida.entrega||!salida.destino){
    return alert('Chofer, entrega y destino son obligatorios.');
  }

  await saveDraft();
  updateUI();
  cerrarModal();
  setTimeout(abrirDepartamentos,100);
}

function deps(){return(guia?.departamentos||[]).filter(d=>d.activo!==false).sort((a,b)=>(a.orden||0)-(b.orden||0))}

function abrirDepartamentos(){if(!validarInicio())return;const d=deps();modal('Departamento',d.length?`<div class="grid">${d.map(x=>`<button class="tile" onclick="abrirFamilias('${escA(x.id)}')"><span class="ico">${esc(x.icono||'📦')}</span><span>${esc(x.nombre)}</span></button>`).join('')}</div>`:`<div class="empty">Sin departamentos activos.</div>`,false,false)}

window.abrirFamilias=id=>{const d=deps().find(x=>x.id===id);const f=(d?.familias||[]).filter(x=>x.activo!==false).sort((a,b)=>(a.orden||0)-(b.orden||0));modal(d?.nombre||'Familia',f.length?`<div class="grid">${f.map(x=>`<button class="tile" onclick="abrirProductos('${escA(d.id)}','${escA(x.id)}')"><span class="ico">${esc(x.icono||'📁')}</span><span>${esc(x.nombre)}</span><small>${(x.articulos||[]).filter(a=>a.activo!==false).length} productos</small></button>`).join('')}</div>`:`<div class="empty">Sin familias activas.</div>`,true)};

window.abrirProductos=(depId,famId)=>{const d=deps().find(x=>x.id===depId),f=d?.familias?.find(x=>x.id===famId);const arts=(f?.articulos||[]).filter(a=>a.activo!==false).sort((a,b)=>(a.orden||0)-(b.orden||0));modal(f?.nombre||'Productos',arts.length?arts.map(a=>prodBtn(a.codigo,a.concepto)).join(''):`<div class="empty">Sin productos.</div>`,true)}

function prodBtn(c,n){const p=prodByCod(c);const nombre=p?nomProd(p,n):n;return`<button class="item" onclick="abrirCantidad('${escA(c)}','${escA(nombre)}')"><h4>${esc(nombre)}</h4><p>Código: <b>${esc(c)}</b></p></button>`}

window.abrirCantidad=(c,n)=>{modal('Cantidad',`<div class="item"><h4>${esc(n)}</h4><p>Código: <b>${esc(c)}</b></p></div><div class="field"><label>Cantidad</label><input id="cant" type="number" min="0.01" step="0.01" inputmode="decimal"></div><button class="btn green" onclick="addCart('${escA(c)}','${escA(n)}')">Agregar</button>`,true);setTimeout(()=>$('cant')?.focus(),100)}

window.addCart=async(c,n)=>{const q=Number($('cant').value||0);if(q<=0)return alert('Cantidad inválida.');const i=salida.articulos.findIndex(a=>normCod(a.codigo)===normCod(c));if(i>=0)salida.articulos[i].cantidad=Number(salida.articulos[i].cantidad||0)+q;else salida.articulos.push({codigo:c,nombre:n,cantidad:q});await saveDraft();updateUI();modal('Agregado',`<div class="notice">Producto agregado.</div><button class="btn green" onclick="abrirDepartamentos()">Agregar otro</button><button class="btn blue" onclick="abrirCarrito()">Ver carrito</button><button class="btn gray" onclick="cerrarModal()">Cerrar</button>`,false,false)}

function abrirBusqueda(){if(!validarInicio())return;modal('Buscar producto',`<input id="buscar" class="search" placeholder="Código o nombre..." oninput="renderBuscar()"><div id="resBuscar" class="empty">Escribe para buscar.</div>`,false,false)}

window.renderBuscar=()=>{const q=$('buscar').value.trim().toLowerCase();if(q.length<2){$('resBuscar').innerHTML=`<div class="empty">Escribe mínimo 2 caracteres.</div>`;return}const r=catalogo.filter(p=>codProd(p).toLowerCase().includes(q)||nomProd(p).toLowerCase().includes(q)).slice(0,40);$('resBuscar').innerHTML=r.length?r.map(p=>prodBtn(codProd(p),nomProd(p))).join(''):`<div class="empty">Sin resultados.</div>`}

function abrirCarrito(){if(!validarInicio())return;modal('Carrito',salida.articulos.length?salida.articulos.map((a,i)=>`<div class="item"><h4>${esc(a.nombre)}</h4><p>Código: <b>${esc(a.codigo)}</b></p><div class="cart-controls"><button onclick="chgQty(${i},-1)">−</button><div class="qty">${fmt(a.cantidad)}</div><button onclick="chgQty(${i},1)">+</button><button onclick="delItem(${i})">🗑️</button></div></div>`).join('')+`<button class="btn green" onclick="abrirDepartamentos()">Agregar otro</button><button class="btn primary" onclick="abrirNotas()">Continuar</button>`:`<div class="empty">Carrito vacío.</div><button class="btn green" onclick="abrirDepartamentos()">Agregar producto</button>`,false,false)}

window.chgQty=async(i,d)=>{if(!salida.articulos[i])return;const n=Number(salida.articulos[i].cantidad||0)+d;if(n<=0){if(!confirm('¿Eliminar artículo?'))return;salida.articulos.splice(i,1)}else salida.articulos[i].cantidad=n;await saveDraft();updateUI();abrirCarrito()}
window.delItem=async i=>{if(!confirm('¿Eliminar artículo?'))return;salida.articulos.splice(i,1);await saveDraft();updateUI();abrirCarrito()}

function abrirNotas(){if(!salida.articulos.length)return alert('Agrega mínimo un artículo.');modal('Notas generales',`<div class="field"><label>Notas generales</label><textarea id="notas">${esc(salida.notasGenerales)}</textarea></div><button class="btn primary" onclick="saveNotas()">Siguiente: firmas</button>`,false,false)}

window.saveNotas=async()=>{salida.notasGenerales=$('notas').value.trim();await saveDraft();abrirFirma('entrega')}

function abrirFirma(tipo){modal(tipo==='entrega'?'Firma entrega':'Firma chofer',`<div class="sigbox"><canvas id="sig"></canvas></div><button class="btn gray" onclick="clearSig()">Limpiar</button><button class="btn primary" onclick="saveSig('${tipo}')">${tipo==='entrega'?'Siguiente':'Guardar salida'}</button>`,false,false);setTimeout(initSig,80)}

let ctx,drawing=false,hasSig=false;

function initSig(){const c=$('sig'),r=c.getBoundingClientRect();c.width=r.width*devicePixelRatio;c.height=r.height*devicePixelRatio;ctx=c.getContext('2d');ctx.scale(devicePixelRatio,devicePixelRatio);ctx.lineWidth=2.3;ctx.lineCap='round';ctx.strokeStyle='#111827';const pos=e=>{const rr=c.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return{x:t.clientX-rr.left,y:t.clientY-rr.top}};const st=e=>{e.preventDefault();drawing=true;hasSig=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};const mv=e=>{if(!drawing)return;e.preventDefault();const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke()};const en=e=>{e.preventDefault();drawing=false};['mousedown','touchstart'].forEach(ev=>c.addEventListener(ev,st,{passive:false}));['mousemove','touchmove'].forEach(ev=>c.addEventListener(ev,mv,{passive:false}));['mouseup','mouseleave','touchend'].forEach(ev=>c.addEventListener(ev,en,{passive:false}))}

window.clearSig=()=>{const c=$('sig');ctx.clearRect(0,0,c.width,c.height);hasSig=false}

window.saveSig=async tipo=>{if(!hasSig)return alert('Firma obligatoria.');const data=$('sig').toDataURL('image/png');if(tipo==='entrega'){salida.firmaEntrega=data;await saveDraft();abrirFirma('recibe')}else{salida.firmaRecibe=data;await saveDraft();guardarFinal()}}

async function guardarFinal(){
  if(guardando)return;
  if(!salida.firmaEntrega||!salida.firmaRecibe)return alert('Faltan firmas.');

  guardando=true;

  try{
    const folio=folioFinal();

    const arts=salida.articulos
      .map(a=>({
        codigo:String(a.codigo).trim(),
        nombre:String(a.nombre).trim(),
        cantidad:Number(a.cantidad||0)
      }))
      .filter(a=>a.codigo&&a.nombre&&a.cantidad>0);

    const user=auth?.currentUser||null;

    const payload={
      folio,
      fecha:hoy(),
      timestamp:firebase.firestore.FieldValue.serverTimestamp(),
      entrega:salida.entrega,
      recibe:salida.recibe,
      destino:salida.destino,
      placas:salida.placas||'',
      notasGenerales:salida.notasGenerales||'',
      articulos:arts,
      firmaEntrega:salida.firmaEntrega,
      firmaRecibe:salida.firmaRecibe,
      estado:'GUARDADA',
      origenApp:'APP_SALIDAS_ZAPATA_MOVIL',
      versionApp:APP_VERSION,
      dispositivo:navigator.userAgent,
      capturadoPorUid:user?.uid||'',
      capturadoPorEmail:user?.email||'',
      creadoEn:firebase.firestore.FieldValue.serverTimestamp()
    };

    const payloadLocal={...payload,timestamp:null,creadoEn:null};

    await RUTAS.SALIDAS_REF.doc(folio).set(payload);

    await putHist({
      folio,
      fecha:payload.fecha,
      destino:payload.destino,
      entrega:payload.entrega,
      recibe:payload.recibe,
      totalArticulos:arts.length,
      totalCantidad:arts.reduce((s,a)=>s+a.cantidad,0),
      fechaGuardado:new Date().toISOString(),
      payloadLocal
    });

    await delKV('borrador');

    generarPDF(payloadLocal);

    setTimeout(()=>{
      imprimirRawBT(payloadLocal);
    },1500);

    salida=nuevaSalida();
    updateUI();

    modal('Guardada',`
      <div class="notice">
        Salida guardada.<br>
        <b>${folio}</b><br><br>
        PDF descargado y ticket enviado a RawBT.
      </div>
      <button class="btn green" onclick="cerrarModal()">Terminar</button>
    `,false,false);

  }catch(e){
    alert('Error al guardar: '+e.message);
  }finally{
    guardando=false;
  }
}

function generarPDF(p){
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF();

  doc.setFontSize(14);
  doc.text('SALIDA ZAPATA',14,14);

  doc.setFontSize(10);
  doc.text(`Folio: ${p.folio}`,14,24);
  doc.text(`Fecha: ${p.fecha}`,14,30);
  doc.text(`Destino: ${p.destino}`,14,36);
  doc.text(`Entrega: ${p.entrega}`,14,42);
  doc.text(`Chofer: ${p.recibe}`,14,48);
  doc.text(`Placas: ${p.placas||''}`,14,54);

  doc.autoTable({
    startY:62,
    head:[["Código","Nombre","Cantidad"]],
    body:p.articulos.map(a=>[a.codigo,a.nombre,a.cantidad])
  });

  let y=doc.lastAutoTable.finalY+12;

  if(p.notasGenerales){
    doc.text('Notas:',14,y);
    doc.text(String(p.notasGenerales),14,y+6,{maxWidth:180});
    y+=22;
  }

  try{
    doc.addImage(p.firmaEntrega,'PNG',14,y,70,28);
    doc.addImage(p.firmaRecibe,'PNG',115,y,70,28);
    doc.text('Firma entrega',22,y+34);
    doc.text('Firma chofer',125,y+34);
  }catch(e){}

  doc.save(`${p.folio}.pdf`);
}

function limpiarTicketRaw(t){
  return String(t||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\x20-\x7E\n\r]/g,'');
}

function crearTicketRawBT(p){
  const totalCantidad=p.articulos.reduce((s,a)=>s+Number(a.cantidad||0),0);

  let txt='';
  txt+='================================\n';
  txt+='        SALIDA ZAPATA\n';
  txt+='================================\n\n';
  txt+=`FOLIO: ${p.folio}\n`;
  txt+=`FECHA: ${p.fecha}\n`;
  txt+=`DESTINO: ${p.destino}\n`;
  txt+=`ENTREGA: ${p.entrega}\n`;
  txt+=`CHOFER: ${p.recibe}\n`;
  txt+=`PLACAS: ${p.placas||''}\n\n`;
  txt+='--------------------------------\n';

  p.articulos.forEach(a=>{
    txt+=`${a.codigo}\n`;
    txt+=`${a.nombre}\n`;
    txt+=`CANT: ${a.cantidad}\n`;
    txt+='--------------------------------\n';
  });

  txt+=`\nTOTAL ARTICULOS: ${p.articulos.length}\n`;
  txt+=`TOTAL PIEZAS: ${totalCantidad}\n\n`;

  if(p.notasGenerales){
    txt+='NOTAS:\n';
    txt+=`${p.notasGenerales}\n\n`;
  }

  txt+='FIRMA ENTREGA: CAPTURADA\n';
  txt+='FIRMA CHOFER: CAPTURADA\n\n';
  txt+='================================\n';
  txt+='PROVSOFT\n';
  txt+='================================\n\n\n\n';

  return limpiarTicketRaw(txt);
}

function imprimirRawBT(p){
  const ticket=crearTicketRawBT(p);
  const b64=btoa(unescape(encodeURIComponent(ticket)));
  window.location.href='rawbt:base64,'+b64;
}


async function abrirHistorial(){const h=await getHist();modal('Historial',h.length?h.map(x=>`<div class="item"><h4>${esc(x.folio)}</h4><p>${esc(x.fecha)} · ${esc(x.destino)} · ${x.totalArticulos} artículos</p><button class="btn blue" onclick="pdfHist('${escA(x.folio)}')">PDF</button></div>`).join(''):`<div class="empty">Sin historial local.</div>`,false,false)}

window.pdfHist = async(folio)=>{

  const h = await getHist();

  const it = h.find(x=>x.folio===folio);

  if(!it){
    return alert('No está en historial local.');
  }

  generarPDF(it.payloadLocal);

}


function abrirConfig(){const all=guia?.departamentos||[];modal('Configuración',all.length?`<div class="notice">Activa/desactiva departamentos. Se guarda en Firestore.</div>`+all.map((d,i)=>`<div class="item"><div class="switch"><div><h4>${esc(d.icono||'📦')} ${esc(d.nombre)}</h4><p>${(d.familias||[]).length} familias</p></div><button class="${d.activo===false?'off':''}" onclick="toggleDep(${i})">${d.activo===false?'OFF':'ON'}</button></div><button class="btn gray" onclick="abrirConfigFamilias(${i})">Familias</button></div>`).join(''):`<div class="empty">Sin configuración.</div>`,false,false)}

window.toggleDep=async i=>{guia.departamentos[i].activo=guia.departamentos[i].activo===false;await saveConfig();abrirConfig()}

window.abrirConfigFamilias=i=>{const d=guia.departamentos[i];modal(d.nombre,(d.familias||[]).map((f,j)=>`<div class="item"><div class="switch"><div><h4>${esc(f.icono||'📁')} ${esc(f.nombre)}</h4><p>${(f.articulos||[]).length} productos</p></div><button class="${f.activo===false?'off':''}" onclick="toggleFam(${i},${j})">${f.activo===false?'OFF':'ON'}</button></div></div>`).join(''),true)}

window.toggleFam=async(i,j)=>{guia.departamentos[i].familias[j].activo=guia.departamentos[i].familias[j].activo===false;await saveConfig();abrirConfigFamilias(i)}

async function saveConfig(){await RUTAS.CONFIG_DOC.set({...guia,actualizadoEn:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});await setKV('guia',guia);updateUI()}
