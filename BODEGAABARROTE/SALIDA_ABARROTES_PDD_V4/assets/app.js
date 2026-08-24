import {db} from './firebase-config.js';
import {TELEGRAM} from './telegram-config.js';
import {jsPDF} from 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm';
import {
  collection,getDocs,doc,getDoc,setDoc,serverTimestamp,
  collectionGroup,query,where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $=id=>document.getElementById(id), modal=$('modal'), card=$('modalCard');
const R={
  users:['CLIENTES','PDD031204KL5','USUARIOS'],
  empleados:['CLIENTES','PDD031204KL5','EMPLEADOS'],
  cfg:['almacenes','abarrotespdd','configuracion','salidas'],
  invBase:['almacenes','abarrotespdd','inventariofisico'],
  salidas:['almacenes','abarrotespdd','salidas'],
  // Productos externos que ya tuvieron movimiento y desde entonces forman parte
  // del buscador operativo normal de esta app.
  catalogoOperativo:['almacenes','abarrotespdd','catalogo_operativo'],
  // Catálogo maestro. Si tu ruta definitiva cambia, sólo modifica esta línea.
  productos:['productos']
};
const S={
  user:null,recibe:'',recibeEmpleado:null,destino:'',fechaCaptura:'',
  config:{receptores:[],destinos:[],inventarioId:'INV-ABARROTESPDD-170826'},
  empleados:[],catalog:[],byCode:new Map(),cart:[],last:[],productInfo:new Map(),
  masterProducts:[],masterByCode:new Map(),inventoryReady:false,masterReady:false
};

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9. ]/g,' ').replace(/\s+/g,' ').trim();
const words=s=>norm(s).split(' ').filter(Boolean);
let cameraStream=null,cameraTimer=null;

function stopCamera(){
  if(cameraTimer){clearInterval(cameraTimer);cameraTimer=null}
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
}
function open(html,mode=''){stopCamera();card.innerHTML=html;modal.classList.toggle('signature-modal',mode==='signature-modal');modal.classList.remove('hidden')}
function close(){stopCamera();modal.classList.add('hidden');modal.classList.remove('signature-modal');card.innerHTML=''}
function toast(t){const x=document.createElement('div');x.textContent=t;x.className='toast';document.body.appendChild(x);setTimeout(()=>x.remove(),1800)}

function telegramReady(){return TELEGRAM?.enabled===true&&String(TELEGRAM.botToken||'').trim()&&String(TELEGRAM.chatId||'').trim()}
async function telegramMessage(text){
  if(!telegramReady())return;
  try{
    await fetch(`https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:TELEGRAM.chatId,text:String(text)})
    });
  }catch(e){console.warn('[TELEGRAM] No se pudo enviar mensaje:',e)}
}
async function telegramPdf(blob,filename,caption=''){
  if(!telegramReady())return;
  try{
    const fd=new FormData();fd.append('chat_id',TELEGRAM.chatId);fd.append('document',blob,filename);if(caption)fd.append('caption',caption);
    await fetch(`https://api.telegram.org/bot${TELEGRAM.botToken}/sendDocument`,{method:'POST',body:fd});
  }catch(e){console.warn('[TELEGRAM] No se pudo enviar PDF:',e)}
}
function makePdf(salida){
  const pdf=new jsPDF({unit:'mm',format:'a4'}), left=14, right=196;
  let y=16;
  pdf.setFont('helvetica','bold');pdf.setFontSize(15);pdf.text('SALIDA DE ABARROTES PDD',left,y);y+=8;
  pdf.setFont('helvetica','normal');pdf.setFontSize(9);
  const info=[`Folio: ${salida.folio}`,`Fecha de captura: ${salida.fechaCapturaTxt||salida.fechaCaptura||''}`,`Registrado: ${salida.fechaLocal} ${salida.horaLocal}`,`Entrega: ${salida.entrega.nombre||salida.entrega.usuario}`,`Recibe: ${salida.recibe}`,`Destino: ${salida.destino}`,`Inventario: ${salida.inventarioId}`];
  info.forEach(t=>{pdf.text(t,left,y);y+=5});y+=3;
  pdf.setFont('helvetica','bold');pdf.text('PARTIDAS',left,y);y+=5;pdf.setFont('helvetica','normal');
  salida.partidas.forEach(x=>{
    const lines=pdf.splitTextToSize(`${x.renglon}. ${x.descripcion} | ${x.codigo} | ${x.cajasSalieron??''} caja(s) x ${x.cantidadPorCaja??'—'} = ${x.cantidad} pzas`,right-left);
    if(y+lines.length*4.5>270){pdf.addPage();y=16}
    pdf.text(lines,left,y);y+=lines.length*4.5+2;
  });
  y+=3;if(y>245){pdf.addPage();y=16}
  pdf.setFont('helvetica','bold');pdf.text(`Total partidas: ${salida.totalPartidas}    Total unidades: ${salida.totalUnidades}`,left,y);y+=9;
  pdf.setFont('helvetica','normal');pdf.text('Firma de quien recibe:',left,y);y+=5;
  try{pdf.addImage(salida.firmaRecibe,'PNG',left,y,100,34)}catch(e){}
  y+=36;
  pdf.setDrawColor(80);pdf.line(left,y,118,y);y+=5;
  pdf.setFontSize(9);pdf.text(String(salida.recibe||''),left,y);
  return pdf.output('blob');
}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}

async function loadConfig(){
  try{const s=await getDoc(doc(db,...R.cfg));if(s.exists()) S.config={...S.config,...s.data()}}
  catch(e){console.warn('No se pudo leer configuración:',e)}
}
async function saveConfig(){await setDoc(doc(db,...R.cfg),{...S.config,actualizadoEn:serverTimestamp()},{merge:true})}

async function login(){
  open(`<h2>Iniciar sesión</h2><p>Usuario autorizado de PDD.</p><label>Usuario</label><input id="u" class="field" autocomplete="username"><label>Contraseña</label><input id="p" class="field" type="password" inputmode="numeric" autocomplete="current-password"><button id="go" class="primary" style="margin-top:14px">ENTRAR</button>`);
  $('go').onclick=async()=>{
    const u=norm($('u').value),p=$('p').value.trim();if(!u||!p)return alert('Captura usuario y contraseña.');$('go').disabled=true;
    try{
      const snap=await getDocs(collection(db,...R.users));
      const d=snap.docs.find(x=>{const a=x.data();return a.activo===true&&norm(a.usuario)===u&&String(a.password??'')===p});
      if(!d){alert('Usuario o contraseña incorrectos, o usuario inactivo.');$('go').disabled=false;return}
      S.user={id:d.id,...d.data()};sessionStorage.setItem('salidaPddUser',JSON.stringify(S.user));
      $('sesionTxt').textContent=S.user.nombre||S.user.usuario;close();await askCaptureDate();
    }catch(e){console.error(e);alert('No fue posible validar el usuario.');$('go').disabled=false}
  }
}

async function askCaptureDate(){
  const hoy=new Date();
  const localHoy=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  open(`<h2>Fecha de captura</h2><p>Selecciona la fecha que corresponde a esta salida.</p><label>Fecha de captura</label><input id="captureDate" class="field modal-main-input" type="date" value="${esc(S.fechaCaptura||localHoy)}"><button id="dateNext" class="primary" style="margin-top:14px">CONTINUAR</button>`);
  const continuar=()=>{
    const v=$('captureDate').value;
    if(!v)return alert('Selecciona la fecha de captura.');
    S.fechaCaptura=v;
    close();
    askReceiver();
  };
  $('dateNext').onclick=continuar;
  $('captureDate').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();continuar()}});
  setTimeout(()=>$('captureDate')?.focus(),100);
}

const RECEIVER_BRANCHES=new Set(['ALMACEN','ADMINISTRACION','MANTENIMIENTO','LOGISTICA','RUTAS']);

async function loadEmployees(){
  try{
    const snap=await getDocs(query(collection(db,...R.empleados),where('activo','==',true)));
    S.empleados=snap.docs
      .map(d=>({id:d.id,...d.data()}))
      .filter(e=>RECEIVER_BRANCHES.has(norm(e.sucursal)))
      .sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
    return S.empleados;
  }catch(e){
    console.error('[EMPLEADOS] No fue posible cargar el catálogo:',e);
    S.empleados=[];
    throw e;
  }
}

function receiverMatches(text){
  const q=words(text);
  if(!q.length)return S.empleados.slice(0,40);
  return S.empleados.filter(e=>{
    const hay=norm(`${e.nombre||''} ${e.empleadoId||''} ${e.sucursal||''}`);
    return q.every(w=>hay.includes(w));
  }).slice(0,40);
}

function renderReceiverSuggestions(text=''){
  const box=$('employeeSuggestions');if(!box)return;
  const list=receiverMatches(text);
  if(!list.length){box.innerHTML='<div class="noresult">No hay empleados coincidentes.</div>';return}
  box.innerHTML=list.map((e,i)=>`<button type="button" class="employee-suggestion" data-idx="${i}"><b>${esc(e.nombre||'SIN NOMBRE')}</b><small>${esc(e.empleadoId||e.id||'')} · ${esc(e.sucursal||'')}</small></button>`).join('');
  [...box.querySelectorAll('.employee-suggestion')].forEach((btn,i)=>{
    btn.onclick=()=>{
      const e=list[i];
      S.recibe=String(e.nombre||'').trim();
      S.recibeEmpleado={id:e.id,empleadoId:e.empleadoId||e.id||'',nombre:S.recibe,sucursal:e.sucursal||''};
      $('employeeSearch').value=S.recibe;
      $('employeeSelected').innerHTML=`<b>Seleccionado:</b> ${esc(S.recibe)}<small>${esc(S.recibeEmpleado.empleadoId)} · ${esc(S.recibeEmpleado.sucursal)}</small>`;
      $('employeeSelected').classList.remove('hidden');
      box.innerHTML='';
      $('receiverNext').disabled=false;
    };
  });
}

async function askReceiver(){
  open(`<h2>¿Quién recibe la mercancía?</h2><p>Busca por nombre, apellidos o número de empleado.</p><input id="employeeSearch" class="field" autocomplete="off" placeholder="Ej. GERARDO, RIOS QUEZADA..."><div id="employeeSelected" class="employee-selected hidden"></div><div id="employeeSuggestions" class="employee-suggestions"><div class="noresult">Cargando empleados...</div></div><button id="receiverNext" class="primary" style="margin-top:14px" disabled>CONTINUAR</button>`);
  S.recibe='';S.recibeEmpleado=null;
  try{
    await loadEmployees();
    if(!S.empleados.length){$('employeeSuggestions').innerHTML='<div class="noresult">No hay empleados activos en las sucursales autorizadas.</div>';return}
    renderReceiverSuggestions('');
    const input=$('employeeSearch');
    input.addEventListener('input',()=>{S.recibe='';S.recibeEmpleado=null;$('receiverNext').disabled=true;$('employeeSelected').classList.add('hidden');renderReceiverSuggestions(input.value)});
    $('receiverNext').onclick=()=>{if(!S.recibeEmpleado)return alert('Selecciona una persona del catálogo de empleados.');askDestination()};
    setTimeout(()=>input?.focus(),100);
  }catch(e){
    $('employeeSuggestions').innerHTML='<div class="noresult">No fue posible consultar /CLIENTES/PDD031204KL5/EMPLEADOS/.</div>';
  }
}
function askDestination(){
  const list=S.config.destinos||[];
  if(!list.length){return configRequired('destinos')}
  open(`<h2>¿Hacia dónde va?</h2><select id="dest" class="field"><option value="">Selecciona...</option>${list.map(x=>`<option>${esc(x)}</option>`).join('')}</select><button id="next" class="primary" style="margin-top:14px">CARGAR INVENTARIO</button>`);
  $('next').onclick=async()=>{
    const v=$('dest').value;if(!v)return alert('Selecciona el destino.');
    S.destino=v;close();
    if(!S.inventoryReady)await loadInventory();
    else {$('scanInput').focus();toast('Datos listos para capturar')}
  }
}
async function configRequired(kind){
  const isRec=kind==='receptores';
  open(`<h2>Configuración inicial</h2><p>No hay ${isRec?'personas que reciben':'destinos'} configurados. Captura el primero para continuar.</p><label>${isRec?'Nombre de quien recibe':'Destino'}</label><input id="firstCfg" class="field" autocomplete="off"><button id="saveFirst" class="primary" style="margin-top:14px">GUARDAR Y CONTINUAR</button>`);
  $('saveFirst').onclick=async()=>{
    const v=$('firstCfg').value.trim(); if(!v)return alert('Captura el dato.');
    $('saveFirst').disabled=true;
    try{
      S.config[kind]=[...new Set([...(S.config[kind]||[]),v])];await saveConfig();close();
      if(isRec) await askReceiver(); else askDestination();
    }catch(e){console.error(e);alert('No se pudo guardar la configuración.');$('saveFirst').disabled=false}
  };
  setTimeout(()=>$('firstCfg')?.focus(),100)
}

function addInventoryPart(map,d){
  if(d.eliminado===true)return false;
  const code=String(d.codigo||d.productoId||d.codigoOriginal||'').trim();
  if(!code)return false;
  const desc=String(d.descripcion||'SIN DESCRIPCIÓN').trim();
  const prev=map.get(code)||{codigo:code,descripcion:desc,inventarioInicial:0,partidas:0};
  prev.inventarioInicial+=Number(d.cantidad||0);prev.partidas++;
  if((!prev.descripcion||prev.descripcion==='SIN DESCRIPCIÓN')&&desc)prev.descripcion=desc;
  map.set(code,prev);return true;
}

async function mergeOperationalCatalog(map){
  try{
    const snap=await getDocs(collection(db,...R.catalogoOperativo));
    let added=0;
    snap.forEach(d=>{
      const x=d.data()||{};
      if(x.activo===false)return;
      const code=String(x.codigo||x.codigoBarra||d.id||'').trim();
      if(!code)return;
      const aliases=Array.isArray(x.codigosEquivalentes)?x.codigosEquivalentes.map(v=>String(v).trim()).filter(Boolean):[];
      const existing=map.get(code);
      if(existing){
        existing.codigosEquivalentes=[...new Set([...(existing.codigosEquivalentes||[]),...aliases])];
        return;
      }
      map.set(code,{
        codigo:code,
        descripcion:String(x.descripcion||x.concepto||'SIN DESCRIPCIÓN').trim(),
        inventarioInicial:0,
        partidas:0,
        fueraInventario:true,
        catalogoOperativo:true,
        codigosEquivalentes:aliases,
        cantidadPorCaja:x.cantidadPorCaja??null,
        precioPublico:x.precioPublico??null
      });
      added++;
    });
    console.info('[CATÁLOGO OPERATIVO]',added,'productos externos incorporados al buscador normal');
    return added;
  }catch(e){
    console.warn('[CATÁLOGO OPERATIVO] No se pudo cargar:',e);
    return 0;
  }
}

function rebuildCatalogIndex(){
  S.byCode.clear();
  for(const p of S.catalog){
    S.byCode.set(String(p.codigo),p);
    (p.codigosEquivalentes||[]).forEach(c=>S.byCode.set(String(c),p));
  }
}

function addToOperationalSearch(item){
  const code=String(item.codigo||'').trim();
  if(!code)return;
  let p=S.catalog.find(x=>String(x.codigo)===code);
  if(!p){
    const master=S.masterByCode.get(code);
    p={
      codigo:code,
      descripcion:String(item.descripcion||master?.descripcion||'SIN DESCRIPCIÓN'),
      inventarioInicial:0,
      partidas:0,
      fueraInventario:true,
      catalogoOperativo:true,
      codigosEquivalentes:[...(master?.codigosEquivalentes||[])],
      cantidadPorCaja:item.cantidadPorCaja??master?.cantidadPorCaja??null,
      precioPublico:item.precioPublico??master?.precioPublico??null
    };
    S.catalog.push(p);
    S.catalog.sort((a,b)=>a.descripcion.localeCompare(b.descripcion,'es'));
  }
  rebuildCatalogIndex();
}

async function promoteMovedProducts(partidas){
  const nuevos=(partidas||[]).filter(x=>x.fueraInventario===true||x.catalogoOperativo===true);
  if(!nuevos.length)return;
  for(const x of nuevos)addToOperationalSearch(x);
  const writes=nuevos.map(async x=>{
    const code=String(x.codigo||'').trim();
    if(!code)return;
    const master=S.masterByCode.get(code);
    await setDoc(doc(db,...R.catalogoOperativo,code),{
      codigo:code,
      codigoBarra:code,
      descripcion:String(x.descripcion||master?.descripcion||'SIN DESCRIPCIÓN'),
      concepto:String(master?.concepto||x.descripcion||''),
      codigosEquivalentes:[...(master?.codigosEquivalentes||[])],
      cantidadPorCaja:x.cantidadPorCaja??master?.cantidadPorCaja??null,
      precioPublico:x.precioPublico??master?.precioPublico??null,
      activo:true,
      origen:'MOVIMIENTO_OPERATIVO',
      ultimoMovimiento:'SALIDA',
      actualizadoEn:serverTimestamp()
    },{merge:true});
  });
  const rs=await Promise.allSettled(writes);
  const failed=rs.filter(r=>r.status==='rejected');
  if(failed.length)console.warn('[CATÁLOGO OPERATIVO] Algunos productos no pudieron persistirse:',failed);
}

async function loadInventory(options={}){
  const boot=options.boot===true;
  if(!boot)showLoad('Construyendo catálogo del inventario inicial...');
  else setBootStatus('Preparando inventario inicial...');
  S.catalog=[];S.byCode.clear();clearQuickResults();
  const invId=String(S.config.inventarioId||'INV-ABARROTESPDD-170826').trim();
  const conteoId=invId.replace(/^INV-/i,'');
  const map=new Map();let n=0;
  try{
    const usersPath=[...R.invBase,invId,'USUARIOS'];
    const users=await getDocs(collection(db,...usersPath));
    const usuariosProcesados=new Set();
    let partidasKrystal=0;

    for(const u of users.docs){
      usuariosProcesados.add(u.id);
      try{
        const ps=await getDocs(collection(db,...usersPath,u.id,'PARTIDAS'));
        ps.forEach(p=>{
          if(addInventoryPart(map,p.data())){
            n++;
            if(u.id==='krystal-156140')partidasKrystal++;
          }
        });
      }catch(err){console.warn(`[CATÁLOGO] No se pudieron leer PARTIDAS de ${u.id}`,err)}
    }

    // Firestore permite que exista /USUARIOS/{id}/PARTIDAS aunque el documento
    // padre {id} no esté materializado. En ese caso getDocs(USUARIOS) no lo
    // devuelve. KRYSTAL tiene partidas reales bajo esa estructura, por lo que
    // se consulta directamente si no apareció en el recorrido normal.
    const usuariosConPartidasSinPadre=['krystal-156140'];
    for(const usuarioId of usuariosConPartidasSinPadre){
      if(usuariosProcesados.has(usuarioId))continue;
      try{
        const ps=await getDocs(collection(db,...usersPath,usuarioId,'PARTIDAS'));
        ps.forEach(p=>{
          const d=p.data()||{};
          if(String(d.almacenId||'').trim().toLowerCase()!=='abarrotespdd')return;
          if(String(d.conteoId||'').trim()!==conteoId)return;
          if(addInventoryPart(map,d)){
            n++;
            if(usuarioId==='krystal-156140')partidasKrystal++;
          }
        });
      }catch(err){console.warn(`[CATÁLOGO] No se pudieron leer PARTIDAS directas de ${usuarioId}`,err)}
    }

    console.info('[CATÁLOGO] Usuarios padre:',users.size);
    console.info('[CATÁLOGO] KRYSTAL:',partidasKrystal,'partidas incluidas');
    console.info('[CATÁLOGO] Total partidas:',n);

    // Respaldo sólo si no se pudo construir absolutamente ningún catálogo.
    if(n===0){
      try{
        const q=query(collectionGroup(db,'PARTIDAS'),where('conteoId','==',conteoId));
        const all=await getDocs(q);
        all.forEach(p=>{
          const d=p.data();
          if(String(d.almacenId||'').toLowerCase()!=='abarrotespdd')return;
          if(addInventoryPart(map,d))n++;
        });
      }catch(fallbackErr){console.warn('[CATÁLOGO] Respaldo collectionGroup no disponible:',fallbackErr)}
    }
    // Además del inventario físico inicial, incorporamos productos que ya
    // tuvieron un movimiento externo anteriormente. Así pasan al buscador normal.
    await mergeOperationalCatalog(map);
    S.catalog=[...map.values()].sort((a,b)=>a.descripcion.localeCompare(b.descripcion,'es'));
    rebuildCatalogIndex();
    if(!S.catalog.length){
      S.inventoryReady=false;
      if(!boot)hideLoad();
      console.warn(`No se encontraron partidas válidas para ${invId}.`);
      return false;
    }
    S.inventoryReady=true;
    if(!boot){
      $('loadingText').textContent='Inventario cargado. Listo para trabajar.';
      setTimeout(()=>{hideLoad();$('scanInput').focus()},450);
    }
    return true;
  }catch(e){
    console.error('[CATÁLOGO] Error general:',e);S.inventoryReady=false;if(!boot)hideLoad();
    if(!boot)alert('No se pudo construir el catálogo del inventario.');
    return false;
  }
}

async function loadActiveProducts(){
  setBootStatus('Descargando catálogo de productos activos...');
  try{
    const snap=await getDocs(query(collection(db,...R.productos),where('activo','==',true)));
    const list=[];
    snap.forEach(d=>{
      const x=d.data()||{};
      const codigo=String(x.codigoBarra||d.id||'').trim();
      if(!codigo)return;
      const p={
        codigo,
        codigoBarra:codigo,
        descripcion:String(x.concepto||x.descripcion||'SIN DESCRIPCIÓN').trim(),
        concepto:String(x.concepto||x.descripcion||'SIN DESCRIPCIÓN').trim(),
        precioPublico:x.precioPublico??null,
        cantidadPorCaja:x.cantidadPorCaja??null,
        codigosEquivalentes:Array.isArray(x.codigosEquivalentes)?x.codigosEquivalentes.map(v=>String(v).trim()).filter(Boolean):[],
        activo:true,
        _raw:x
      };
      list.push(p);
    });
    list.sort((a,b)=>a.descripcion.localeCompare(b.descripcion,'es'));
    S.masterProducts=list;S.masterByCode.clear();
    for(const p of list){
      S.masterByCode.set(p.codigo,p);
      p.codigosEquivalentes.forEach(c=>S.masterByCode.set(c,p));
      S.productInfo.set(p.codigo,p._raw||{});
    }
    S.masterReady=true;
    setBootStatus(`${list.length.toLocaleString('es-MX')} productos activos cargados...`);
    return true;
  }catch(e){
    console.error('[PRODUCTOS] No se pudo cargar catálogo activo:',e);
    S.masterReady=false;S.masterProducts=[];S.masterByCode.clear();
    return false;
  }
}

function setBootStatus(t){const el=$('loadingText');if(el)el.textContent=t}
function showLoad(t){$('loadingText').textContent=t;$('loading').classList.remove('hidden')}
function hideLoad(){$('loading').classList.add('hidden')}

// Distancia Damerau-Levenshtein simple para tolerar errores pequeños como EMPREADOR / EMPERADOR.
function editDistance(a,b){
  a=norm(a);b=norm(b);const m=a.length,n=b.length,d=Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++)d[i][0]=i;for(let j=0;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){
    const cost=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+cost);
  }
  return d[m][n]
}
function tokenMatches(token,productWords,full){
  if(full.includes(token))return true;
  if(token.length<5)return false;
  return productWords.some(w=>Math.abs(w.length-token.length)<=1&&editDistance(token,w)<=1)
}
function searchProducts(text,limit=40){
  const q=norm(text);if(!q)return[];
  const toks=words(q);
  return S.catalog
    .map(p=>{
      const aliases=(p.codigosEquivalentes||[]).join(' ');
      const full=norm(`${p.descripcion} ${p.codigo} ${aliases}`), pw=words(p.descripcion);
      if(!toks.every(t=>tokenMatches(t,pw,full)))return null;
      let score=0;if(norm(p.codigo)===q)score+=1000;if(norm(p.descripcion)===q)score+=500;
      if(norm(p.descripcion).startsWith(q))score+=150;
      toks.forEach(t=>{if(pw.includes(t))score+=20;else if(full.includes(t))score+=10;else score+=3});
      return{p,score};
    })
    .filter(Boolean).sort((a,b)=>b.score-a.score||a.p.descripcion.localeCompare(b.p.descripcion,'es')).slice(0,limit).map(x=>x.p)
}
function renderResults(container,rs){
  container.innerHTML=rs.length?rs.map((p,i)=>`<div class="result" data-i="${i}"><b>${esc(p.descripcion)}</b><small>${esc(p.codigo)} · ${p.catalogoOperativo?'AGREGADO POR MOVIMIENTO':'Inicial '+p.inventarioInicial}</small></div>`).join(''):'<div class="noresult">Sin coincidencias en el catálogo operativo</div>';
  [...container.querySelectorAll('.result')].forEach((el,i)=>el.onclick=()=>{clearQuickResults();selectProduct(rs[i])})
}
function clearQuickResults(){const r=$('quickResults');if(r){r.classList.add('hidden');r.innerHTML=''}}
function quickSearch(){
  const text=$('scanInput').value.trim();
  if(text.length<2){clearQuickResults();return}
  if(!S.catalog.length){clearQuickResults();return}
  const rs=searchProducts(text,20),box=$('quickResults');box.classList.remove('hidden');renderResults(box,rs)
}
function searchFromMain(){
  const text=$('scanInput').value.trim();
  if(!text)return searchModal('');
  const exact=S.byCode.get(text);if(exact)return selectProduct(exact);
  const rs=searchProducts(text,40);
  if(rs.length===1)return selectProduct(rs[0]);
  searchModal(text,rs)
}

async function getProductInfo(code){
  code=String(code||'').trim();
  if(!code)return{};
  if(S.productInfo.has(code))return S.productInfo.get(code)||{};
  try{
    const snap=await getDoc(doc(db,...R.productos,code));
    const data=snap.exists()?snap.data():{};
    S.productInfo.set(code,data);
    return data;
  }catch(e){
    console.warn(`[PRODUCTO] No se pudo consultar ${code}:`,e);
    // Si hubo una falla de red, usamos la última lectura de esta sesión sólo
    // como respaldo visual; no inventamos valores.
    return S.productInfo.get(code)||{};
  }
}
async function saveBoxQty(code,value){
  const cantidadPorCaja=Number(value);
  if(!(cantidadPorCaja>0))return;
  const ref=doc(db,...R.productos,String(code));
  // Se modifica únicamente el campo solicitado del catálogo maestro.
  await setDoc(ref,{cantidadPorCaja},{merge:true});
  const prev=S.productInfo.get(String(code))||{};
  S.productInfo.set(String(code),{...prev,cantidadPorCaja});
}
function calcExpression(text){
  const src=String(text||'').replace(/,/g,'.').replace(/\s+/g,'');
  if(!src||!/^[0-9.+\-*/()]+$/.test(src))throw new Error('Expresión inválida');
  const tokens=src.match(/\d*\.?\d+|[()+\-*/]/g);
  if(!tokens||tokens.join('')!==src)throw new Error('Expresión inválida');
  const out=[],ops=[],prec={'+':1,'-':1,'*':2,'/':2};
  let prev='op';
  for(let i=0;i<tokens.length;i++){
    let t=tokens[i];
    if(/^\d/.test(t)||t.startsWith('.')){out.push(Number(t));prev='num';continue}
    if(t==='('){ops.push(t);prev='op';continue}
    if(t===')'){while(ops.length&&ops.at(-1)!=='(')out.push(ops.pop());if(ops.pop()!=='(')throw new Error('Paréntesis inválidos');prev='num';continue}
    if((t==='+'||t==='-')&&prev==='op')out.push(0);
    while(ops.length&&ops.at(-1)!=='('&&prec[ops.at(-1)]>=prec[t])out.push(ops.pop());
    ops.push(t);prev='op';
  }
  while(ops.length){const op=ops.pop();if(op==='(')throw new Error('Paréntesis inválidos');out.push(op)}
  const st=[];
  for(const t of out){
    if(typeof t==='number'){st.push(t);continue}
    const b=st.pop(),a=st.pop();if(a===undefined||b===undefined)throw new Error('Expresión inválida');
    st.push(t==='+'?a+b:t==='-'?a-b:t==='*'?a*b:a/b);
  }
  if(st.length!==1||!Number.isFinite(st[0]))throw new Error('Resultado inválido');
  return Math.round((st[0]+Number.EPSILON)*1000)/1000;
}
function bindCalculator(targetId){
  const panel=$('calcPanel'),expr=$('calcExpr'),result=$('calcResult');
  $('openCalc').onclick=()=>{panel.classList.toggle('hidden');if(!panel.classList.contains('hidden'))expr.focus()};
  panel.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{expr.value+=b.dataset.k;expr.focus()});
  $('calcClear').onclick=()=>{expr.value='';result.textContent='Resultado: —';expr.focus()};
  $('calcBack').onclick=()=>{expr.value=expr.value.slice(0,-1);expr.focus()};
  const run=()=>{try{const v=calcExpression(expr.value);result.textContent=`Resultado: ${v}`;return v}catch(e){result.textContent='Resultado: revisa el cálculo';return null}};
  $('calcEqual').onclick=run;
  $('calcRegister').onclick=()=>{const v=run();if(v!==null&&v>0){$(targetId).value=v;panel.classList.add('hidden');$(targetId).focus()}};
  expr.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('calcRegister').click()}};
}
async function selectProduct(p){
  const info=await getProductInfo(p.codigo);
  const precio=Number(info.precioPublico);
  const cajaCatalogo=Number(info.cantidadPorCaja);

  // Paso 1: confirmar la cantidad por caja. El dato inicia bloqueado cuando
  // ya existe en catálogo para evitar cambios accidentales.
  const abrirModalCaja=(boxValue=cajaCatalogo)=>{
    const cajaValida=Number.isFinite(Number(boxValue))&&Number(boxValue)>0;
    open(`<h2>Confirmar cantidad por caja</h2>
      <div class="product-capture-info compact-product-info">
        <b>${esc(info.concepto||p.descripcion)}</b>
        <small>${esc(p.codigo)} · ${p.fueraInventario?'FUERA DEL INVENTARIO INICIAL':'Inventario inicial: '+esc(p.inventarioInicial)}</small>
        <div class="price-box"><span>Precio público actual</span><strong>${Number.isFinite(precio)?`$${precio.toFixed(2)}`:'NO REGISTRADO'}</strong></div>
      </div>
      <label>Piezas que trae cada caja</label>
      <input id="boxQty" class="field modal-main-input" type="number" min="1" step="1" inputmode="numeric" value="${cajaValida?esc(Number(boxValue)):''}" placeholder="Ej. 12, 24, 36..." ${cajaValida?'disabled':''}>
      <div id="boxHelp" class="box-help">${cajaValida?'Cantidad por caja registrada. Si es correcta, continúa.':'No hay una cantidad por caja válida; captúrala para continuar.'}</div>
      <div class="modal-step">Paso 1 de 2 · Verificar empaque</div>
      <div class="actions">
        <button id="cancel" class="secondary">Cancelar</button>
        ${cajaValida?'<button id="editBox" class="secondary">MODIFICAR CAJA</button>':''}
        <button id="nextBoxes" class="primary">ESTÁ CORRECTO · SIGUIENTE</button>
      </div>`);
    $('cancel').onclick=close;
    const input=$('boxQty');
    const editBtn=$('editBox');
    if(editBtn)editBtn.onclick=()=>{
      input.disabled=false;
      editBtn.disabled=true;
      $('boxHelp').textContent='Corrige las piezas por caja y después continúa. El nuevo valor se guardará en el catálogo.';
      setTimeout(()=>{input.focus();try{input.select()}catch(_){ }},0);
    };
    $('nextBoxes').onclick=async()=>{
      const boxQty=Number(input.value);
      if(!(boxQty>0))return alert('Captura una cantidad por caja mayor a cero.');
      if(!Number.isInteger(boxQty))return alert('La cantidad por caja debe registrarse en piezas enteras.');
      $('nextBoxes').disabled=true;
      try{
        if(boxQty!==cajaCatalogo)await saveBoxQty(p.codigo,boxQty);
        abrirModalCajasSalida(boxQty);
      }catch(e){
        console.error(e);
        alert('No se pudo guardar la cantidad por caja.');
        $('nextBoxes').disabled=false;
      }
    };
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('nextBoxes').click();}};
    // Flujo de teclado: si la caja ya está registrada, el foco cae en SIGUIENTE
    // para que Enter avance sin tocar el dato. MODIFICAR CAJA queda como acción manual.
    if(cajaValida){
      setTimeout(()=>$('nextBoxes')?.focus(),100);
    }else{
      setTimeout(()=>input.focus(),100);
    }
  };

  // Paso 2: el usuario captura cajas; el sistema convierte automáticamente a piezas.
  const abrirModalCajasSalida=(boxQty,boxesValue='')=>{
    open(`<h2>Cajas que salieron</h2>
      <div class="product-capture-info compact-product-info">
        <b>${esc(info.concepto||p.descripcion)}</b>
        <small>${esc(p.codigo)} · <strong>${esc(boxQty)} piezas por caja</strong></small>
      </div>
      <label>¿Cuántas cajas salieron?</label>
      <input id="boxesOut" class="field modal-main-input" type="number" min="0.001" step="0.001" inputmode="decimal" value="${esc(boxesValue)}" placeholder="Ej. 1, 2, 2.5...">
      <div class="box-help">El sistema registrará la salida en piezas: <strong id="piecesPreview">0 piezas</strong>.</div>
      <div class="modal-step">Paso 2 de 2 · Registrar salida</div>
      <div class="actions"><button id="backBox" class="secondary">REGRESAR</button><button id="add" class="primary">AGREGAR PARTIDA</button></div>`);
    $('backBox').onclick=()=>abrirModalCaja(boxQty);
    const boxesInput=$('boxesOut');
    const updatePreview=()=>{
      const boxes=Number(boxesInput.value);
      const pieces=boxes>0?Math.round((boxes*boxQty+Number.EPSILON)*1000)/1000:0;
      $('piecesPreview').textContent=`${pieces} piezas`;
    };
    boxesInput.oninput=updatePreview;
    updatePreview();
    $('add').onclick=()=>{
      const boxes=Number(boxesInput.value);
      if(!(boxes>0))return alert('Captura cuántas cajas salieron.');
      const q=Math.round((boxes*boxQty+Number.EPSILON)*1000)/1000;
      if(!(q>0))return alert('La salida calculada no es válida.');
      const ex=S.cart.find(x=>x.codigo===p.codigo);
      const totalPropuesto=(ex?Number(ex.cantidad||0):0)+q;
      const inicial=Number(p.inventarioInicial||0);
      if(!p.fueraInventario && inicial>=0 && totalPropuesto>inicial){
        const ok=confirm(`La salida supera el inventario inicial.\n\nInicial: ${inicial}\nSalida acumulada: ${totalPropuesto} piezas\n\n¿Deseas continuar?`);
        if(!ok)return;
      }
      if(ex){
        ex.cantidad=totalPropuesto;
        ex.cantidadPorCaja=boxQty;
        ex.cajasSalieron=Math.round(((Number(ex.cajasSalieron)||0)+boxes+Number.EPSILON)*1000)/1000;
        if(Number.isFinite(precio))ex.precioPublico=precio;
      }else{
        S.cart.push({...p,cantidad:q,cantidadPorCaja:boxQty,cajasSalieron:boxes,precioPublico:Number.isFinite(precio)?precio:null});
      }
      S.last=S.last.filter(x=>x.codigo!==p.codigo);
      S.last.unshift({codigo:p.codigo,ts:Date.now()});
      S.last=S.last.slice(0,20);
      render();
      close();
      $('scanInput').value='';
      clearQuickResults();
      $('scanInput').focus();
      toast(`Partida agregada: ${boxes} caja(s) = ${q} piezas`);
    };
    boxesInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('add').click();}};
    setTimeout(()=>{boxesInput.focus();try{boxesInput.select()}catch(_){ }},100);
  };

  abrirModalCaja();
}
function recentCartItems(){
  const items=[];
  for(const r of S.last){const x=S.cart.find(c=>c.codigo===r.codigo);if(x&&!items.some(y=>y.codigo===x.codigo))items.push(x)}
  return items.slice(0,2);
}
function orderedCartItems(){
  const lastPos=new Map(S.last.map((r,i)=>[String(r.codigo),i]));
  return S.cart
    .map((x,index)=>({x,index,pos:lastPos.has(String(x.codigo))?lastPos.get(String(x.codigo)):Number.MAX_SAFE_INTEGER}))
    .sort((a,b)=>a.pos-b.pos||b.index-a.index);
}
function render(){
  $('cartCount').textContent=S.cart.length;
  const last=recentCartItems();
  $('lastItems').innerHTML=last.length?last.map(x=>`<div class="item"><b>${esc(x.descripcion)}</b><small>${esc(x.codigo)}</small><div class="qty">${x.cantidad}</div></div>`).join(''):'<div class="empty">Aún no hay partidas</div>';

  const desktopList=$('desktopCartList');
  const desktopTotals=$('desktopCartTotals');
  if(desktopTotals){
    const units=S.cart.reduce((a,x)=>a+Number(x.cantidad||0),0);
    const boxes=S.cart.reduce((a,x)=>a+Number(x.cajasSalieron ?? (Number(x.cantidadPorCaja)>0 ? Number(x.cantidad)/Number(x.cantidadPorCaja) : 0)),0);
    const boxesTxt=Math.round((boxes+Number.EPSILON)*1000)/1000;
    desktopTotals.textContent=`${S.cart.length} partidas · ${boxesTxt} cajas · ${units} piezas`;
  }
  if(desktopList){
    const ordered=orderedCartItems();
    desktopList.innerHTML=ordered.length?ordered.map(({x,index},displayIndex)=>`<div class="desktop-cart-row">
      <div class="desktop-cart-index">${displayIndex+1}</div>
      <div class="desktop-cart-product"><b>${esc(x.descripcion)}</b></div>
      <div class="desktop-cart-code">${esc(x.codigo)}</div>
      <div class="desktop-cart-value"><span>Cajas salieron</span><b>${x.cajasSalieron??(Number(x.cantidadPorCaja)>0?Math.round((Number(x.cantidad)/Number(x.cantidadPorCaja)+Number.EPSILON)*1000)/1000:'—')}</b></div>
      <div class="desktop-cart-value"><span>Pzas/caja</span><b>${x.cantidadPorCaja??'—'}</b></div>
      <div class="desktop-cart-value desktop-cart-pieces"><span>Total piezas</span><b>${esc(x.cantidad)}</b><small>${x.cajasSalieron??(Number(x.cantidadPorCaja)>0?Math.round((Number(x.cantidad)/Number(x.cantidadPorCaja)+Number.EPSILON)*1000)/1000:'—')} × ${x.cantidadPorCaja??'—'} = ${esc(x.cantidad)}</small></div>
      <div class="desktop-cart-actions"><button type="button" class="desktop-edit" data-desktop-edit="${index}">MODIFICAR</button><button type="button" class="desktop-delete" data-desktop-delete="${index}">ELIMINAR</button></div>
    </div>`).join(''):'<div class="empty">Carrito vacío</div>';
    desktopList.querySelectorAll('[data-desktop-edit]').forEach(b=>b.onclick=()=>editCartQuantity(Number(b.dataset.desktopEdit),'desktop'));
    desktopList.querySelectorAll('[data-desktop-delete]').forEach(b=>b.onclick=()=>{
      const i=Number(b.dataset.desktopDelete);
      if(!confirm('¿Eliminar esta partida del carrito?'))return;
      const removed=S.cart[i];
      S.cart.splice(i,1);
      if(removed)S.last=S.last.filter(x=>x.codigo!==removed.codigo);
      render();
      $('scanInput')?.focus();
    });
  }
}
function searchMasterProducts(text,limit=60){
  const q=norm(text);if(!q)return[];
  const toks=words(q);
  return S.masterProducts.map(p=>{
    const aliases=(p.codigosEquivalentes||[]).join(' ');
    const full=norm(`${p.descripcion} ${p.codigo} ${aliases}`),pw=words(p.descripcion);
    if(!toks.every(t=>tokenMatches(t,pw,full)))return null;
    let score=0;if(norm(p.codigo)===q)score+=1400;
    if((p.codigosEquivalentes||[]).some(c=>norm(c)===q))score+=1300;
    if(norm(p.descripcion)===q)score+=600;if(norm(p.descripcion).startsWith(q))score+=180;
    toks.forEach(t=>{if(pw.includes(t))score+=25;else if(full.includes(t))score+=12;else score+=3});
    return{p,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.p.descripcion.localeCompare(b.p.descripcion,'es')).slice(0,limit).map(x=>x.p)
}
function addMasterProductModal(){
  if(!S.masterReady||!S.masterProducts.length)return alert('El catálogo de productos activos no está disponible. Vuelve a abrir la app con conexión.');
  open(`<h2>Ingresar producto del catálogo</h2>
    <p class="catalog-extra-note">Busca un producto activo aunque no exista en el inventario inicial de esta captura.</p>
    <input id="masterQ" class="field" autocomplete="off" placeholder="Código, descripción o código equivalente">
    <div class="match-hint">Solo se muestran productos con activo = true.</div>
    <div id="masterRes" class="results master-results"><div class="noresult">Escribe al menos 2 caracteres.</div></div>
    <button id="masterClose" class="secondary">Cerrar</button>`);
  $('masterClose').onclick=close;
  const run=()=>{
    const q=$('masterQ').value.trim(),box=$('masterRes');
    if(q.length<2){box.innerHTML='<div class="noresult">Escribe al menos 2 caracteres.</div>';return}
    const rs=searchMasterProducts(q,60);
    box.innerHTML=rs.length?rs.map((p,i)=>`<div class="result master-result" data-i="${i}"><b>${esc(p.descripcion)}</b><small>${esc(p.codigo)} · $${Number(p.precioPublico||0).toFixed(2)}${S.byCode.has(p.codigo)?' · YA ESTÁ EN INVENTARIO':' · FUERA DE INVENTARIO'}</small></div>`).join(''):'<div class="noresult">Sin coincidencias en productos activos.</div>';
    [...box.querySelectorAll('.result')].forEach((el,i)=>el.onclick=()=>{
      const m=rs[i],inv=S.byCode.get(m.codigo);
      const p=inv?{...inv}:{codigo:m.codigo,descripcion:m.descripcion,inventarioInicial:0,partidas:0,fueraInventario:true};
      close();selectProduct(p);
    });
  };
  $('masterQ').oninput=run;
  $('masterQ').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const exact=S.masterByCode.get($('masterQ').value.trim());if(exact){const inv=S.byCode.get(exact.codigo);close();selectProduct(inv?{...inv}:{codigo:exact.codigo,descripcion:exact.descripcion,inventarioInicial:0,partidas:0,fueraInventario:true})}else run()}};
  setTimeout(()=>$('masterQ')?.focus(),100)
}
function searchModal(initial='',initialResults=null){
  open(`<h2>Buscar producto</h2><input id="q" class="field" placeholder="Ej. PASTA COLGATE / EMPERADOR VAINILLA" value="${esc(initial)}"><div class="match-hint">Las palabras pueden escribirse en cualquier orden.</div><div id="res" class="results"></div><button id="x" class="secondary">Cerrar</button>`);
  $('x').onclick=close;
  const run=()=>{const q=$('q').value.trim();const rs=q.length>=2?searchProducts(q,40):[];renderResults($('res'),rs)};
  $('q').oninput=run;
  if(initialResults){renderResults($('res'),initialResults)}else run();
  setTimeout(()=>$('q').focus(),100)
}
function cartSummaryHtml(){
  const units=S.cart.reduce((a,x)=>a+Number(x.cantidad||0),0);
  const boxes=S.cart.reduce((a,x)=>a+Number(x.cajasSalieron ?? (Number(x.cantidadPorCaja)>0 ? Number(x.cantidad)/Number(x.cantidadPorCaja) : 0)),0);
  const boxesTxt=Math.round((boxes+Number.EPSILON)*1000)/1000;
  return `<div class="shipment-summary">
    <div><small>Entrega</small><b>${esc(S.user?.nombre||S.user?.usuario||'-')}</b></div>
    <div><small>Recibe</small><b>${esc(S.recibe||'-')}</b></div>
    <div><small>Destino</small><b>${esc(S.destino||'-')}</b></div>
  </div>
  <div class="cart-totals"><span>${S.cart.length} partidas · ${boxesTxt} cajas</span><b>${units} piezas</b></div>`;
}
function cartRowsHtml(editable=true){
  const ordered=orderedCartItems();
  if(!ordered.length)return '<div class="empty">Carrito vacío</div>';
  return `<div class="cart-list">${ordered.map(({x,index},displayIndex)=>`<div class="cart-row-mobile">
    <div class="cart-index">${displayIndex+1}</div>
    <div class="cart-product"><b>${esc(x.descripcion)}</b><small>${esc(x.codigo)}</small></div>
    <div class="cart-qty">
      <small>Cajas salieron</small><b>${x.cajasSalieron??(Number(x.cantidadPorCaja)>0?Math.round((Number(x.cantidad)/Number(x.cantidadPorCaja)+Number.EPSILON)*1000)/1000:'—')}</b>
      <small>${x.cantidadPorCaja??'—'} pzas/caja</small>
      <strong class="cart-pieces-total">= ${x.cantidad} piezas</strong>
    </div>
    ${editable?`<div class="cart-row-actions"><button class="cart-edit" data-edit="${index}" aria-label="Modificar cantidad">Editar</button><button class="cart-delete" data-delete="${index}" aria-label="Eliminar">×</button></div>`:''}
  </div>`).join('')}</div>`;
}
function editCartQuantity(index,returnTo='cart'){
  const item=S.cart[index];
  if(!item)return;
  const cajaActual=Number(item.cantidadPorCaja);
  const cajasActuales=Number(item.cajasSalieron)>0?Number(item.cajasSalieron):(cajaActual>0?Math.round((Number(item.cantidad)/cajaActual+Number.EPSILON)*1000)/1000:'');
  open(`<h2>Modificar partida</h2>
    <div class="product-capture-info"><b>${esc(item.descripcion)}</b><small>${esc(item.codigo)} · Inventario inicial: ${item.inventarioInicial}</small></div>
    <label>Cantidad por caja</label>
    <input id="editBoxQty" class="field modal-main-input" type="number" min="1" step="1" inputmode="numeric" value="${cajaActual>0?esc(cajaActual):''}" ${cajaActual>0?'disabled':''}>
    ${cajaActual>0?'<button id="editUnlockBox" class="secondary" style="margin-top:8px">MODIFICAR CAJA</button>':''}
    <label style="margin-top:14px">Cajas que salieron</label>
    <input id="editBoxesOut" class="field modal-main-input" type="number" min="0.001" step="0.001" inputmode="decimal" value="${esc(cajasActuales)}">
    <div class="box-help">Salida calculada: <strong id="editPiecesPreview">${esc(item.cantidad)} piezas</strong>.</div>
    <div class="actions"><button id="editCancel" class="secondary">Cancelar</button><button id="editSave" class="primary">GUARDAR CAMBIOS</button></div>`);
  const goBack=()=>{if(returnTo==='review')reviewBeforeFinish();else if(returnTo==='cart')cartModal();else {close();$('scanInput')?.focus();}};
  $('editCancel').onclick=goBack;
  if($('editUnlockBox'))$('editUnlockBox').onclick=()=>{$('editBoxQty').disabled=false;$('editUnlockBox').disabled=true;$('editBoxQty').focus();$('editBoxQty').select();};
  const update=()=>{
    const bq=Number($('editBoxQty').value), boxes=Number($('editBoxesOut').value);
    const pieces=bq>0&&boxes>0?Math.round((bq*boxes+Number.EPSILON)*1000)/1000:0;
    $('editPiecesPreview').textContent=`${pieces} piezas`;
  };
  $('editBoxQty').oninput=update;$('editBoxesOut').oninput=update;
  $('editSave').onclick=async()=>{
    const boxQty=Number($('editBoxQty').value);
    const boxes=Number($('editBoxesOut').value);
    if(!(boxQty>0)||!Number.isInteger(boxQty))return alert('La cantidad por caja debe ser un número entero mayor a cero.');
    if(!(boxes>0))return alert('Captura cuántas cajas salieron.');
    const q=Math.round((boxQty*boxes+Number.EPSILON)*1000)/1000;
    const inicial=Number(item.inventarioInicial||0);
    if(inicial>=0 && q>inicial){
      const ok=confirm(`La salida supera el inventario inicial.\n\nInicial: ${inicial}\nSalida: ${q} piezas\n\n¿Deseas continuar?`);
      if(!ok)return;
    }
    $('editSave').disabled=true;
    try{
      if(boxQty!==Number(item.cantidadPorCaja))await saveBoxQty(item.codigo,boxQty);
      item.cantidad=q;
      item.cantidadPorCaja=boxQty;
      item.cajasSalieron=boxes;
      render();
      goBack();
      toast('Partida modificada');
    }catch(e){
      console.error(e);
      alert('No se pudieron guardar los cambios.');
      $('editSave').disabled=false;
    }
  };
  $('editBoxesOut').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('editSave').click();}};
  setTimeout(()=>$('editBoxesOut')?.focus(),100);
}
function bindCartActions(returnTo='cart'){
  card.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editCartQuantity(Number(b.dataset.edit),returnTo));
  card.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.delete);
    if(!confirm('¿Eliminar esta partida del carrito?'))return;
    const removed=S.cart[i];S.cart.splice(i,1);if(removed)S.last=S.last.filter(x=>x.codigo!==removed.codigo);render();
    if(returnTo==='review')reviewBeforeFinish();else cartModal();
  });
}

function cartModal(){
  open(`<h2>Carrito de salida</h2>${cartSummaryHtml()}${cartRowsHtml(true)}<button id="x" class="secondary sticky-modal-btn">Cerrar</button>`);
  $('x').onclick=close;
  bindCartActions('cart');
}
function reviewBeforeFinish(){
  if(!S.user||!S.recibe||!S.destino)return alert('Faltan datos de la salida.');
  if(!S.cart.length)return alert('El carrito está vacío.');
  open(`<h2>Revisar salida</h2><p class="review-note">Confirma los datos y las partidas antes de firmar.</p>${cartSummaryHtml()}${cartRowsHtml(true)}<div class="final-actions"><button id="back" class="secondary">SEGUIR CAPTURANDO</button><button id="tosign" class="primary">CONTINUAR A FIRMA</button></div>`);
  $('back').onclick=close;
  $('tosign').onclick=signAndSave;
  bindCartActions('review');
}

async function cameraScanner(){
  if(!S.catalog.length)return alert('El catálogo todavía no está listo.');
  if(!navigator.mediaDevices?.getUserMedia)return alert('Este dispositivo no permite acceso a cámara desde el navegador.');
  if(!('BarcodeDetector' in window))return alert('El lector de códigos por cámara no está disponible en este navegador. Usa Chrome actualizado en el celular.');
  open(`<h2>Escanear código</h2><p class="camera-help">Apunta la cámara al código de barras. La búsqueda se hará únicamente dentro del inventario inicial.</p><div class="camera-frame"><video id="cameraVideo" autoplay playsinline muted></video><div class="scan-line"></div></div><div id="cameraMsg" class="camera-msg">Buscando código...</div><button id="camClose" class="secondary">Cerrar cámara</button>`);
  $('camClose').onclick=close;
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const video=$('cameraVideo');video.srcObject=cameraStream;await video.play();
    const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','codabar']});
    let busy=false;
    cameraTimer=setInterval(async()=>{
      if(busy||video.readyState<2)return;busy=true;
      try{
        const codes=await detector.detect(video);
        if(codes.length){
          const raw=String(codes[0].rawValue||'').trim();
          if(raw){
            stopCamera();
            const p=S.byCode.get(raw)||S.byCode.get(raw.replace(/^0+/,''));
            if(p){close();selectProduct(p)}
            else{close();$('scanInput').value=raw;alert(`Código ${raw}

No hay coincidencias en tu catálogo.`);$('scanInput').focus()}
          }
        }
      }catch(e){}finally{busy=false}
    },350);
  }catch(e){console.error(e);stopCamera();$('cameraMsg').textContent='No se pudo abrir la cámara. Revisa el permiso de cámara.'}
}

function configModal(){const d=(S.config.destinos||[]).join('\n');open(`<h2>Configuración</h2><p>Se guarda en /almacenes/abarrotespdd/configuracion/salidas</p><p class="config-note"><b>Quién recibe:</b> se consulta automáticamente desde /CLIENTES/PDD031204KL5/EMPLEADOS/ y solo muestra empleados activos de ALMACEN, ADMINISTRACION, MANTENIMIENTO, LOGISTICA y RUTAS.</p><label>Destinos</label><textarea id="dests" class="field" rows="5" placeholder="Un destino por línea">${esc(d)}</textarea><label>Inventario inicial</label><input id="inv" class="field" value="${esc(S.config.inventarioId)}"><div class="actions"><button id="x" class="secondary">Cancelar</button><button id="save" class="primary">Guardar</button></div>`);$('x').onclick=close;$('save').onclick=async()=>{S.config.destinos=$('dests').value.split('\n').map(x=>x.trim()).filter(Boolean);S.config.inventarioId=$('inv').value.trim()||'INV-ABARROTESPDD-170826';await saveConfig();close();toast('Configuración guardada')}}
function signAndSave(){
  if(!S.user||!S.recibe||!S.destino||!S.cart.length)return alert('La salida no está completa.');

  open(`<div class="signature-screen">
    <div class="signature-head">
      <div>
        <h2>Firma de quien recibe</h2>
        <p>Firma sobre la línea.</p>
      </div>
    </div>
    <div class="signature-pad-wrap">
      <canvas id="sig" class="sig sig-full"></canvas>
      <div class="signature-line"></div>
      <div class="signature-name">${esc(S.recibe)}</div>
    </div>
    <div class="signature-actions">
      <button id="btnRegresarCarritoFirma" class="btn secondary">← REGRESAR AL CARRITO</button>
<button id="clear" class="secondary">BORRAR FIRMA</button>
      <button id="save" class="primary">CONTINUAR</button>
    </div>
  </div>`, 'signature-modal');

  const c=$('sig'),ctx=c.getContext('2d');
  let down=false,has=false,lastDpr=devicePixelRatio||1;
  function resize(){
    const r=c.getBoundingClientRect();
    const old = has ? c.toDataURL('image/png') : null;
    lastDpr=devicePixelRatio||1;
    c.width=Math.max(1,Math.round(r.width*lastDpr));
    c.height=Math.max(1,Math.round(r.height*lastDpr));
    ctx.setTransform(lastDpr,0,0,lastDpr,0,0);
    ctx.lineWidth=2.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';
    if(old){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,r.width,r.height);img.src=old}
  }
  resize();
  const ro=new ResizeObserver(()=>resize());ro.observe(c);
  const pos=e=>{const r=c.getBoundingClientRect(),t=e.touches?.[0]||e;return{x:t.clientX-r.left,y:t.clientY-r.top}};
  const st=e=>{e.preventDefault();down=true;has=true;try{c.setPointerCapture?.(e.pointerId)}catch{}const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};
  const mv=e=>{if(!down)return;e.preventDefault();const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke()};
  const en=e=>{down=false;try{c.releasePointerCapture?.(e.pointerId)}catch{}};
  c.onpointerdown=st;c.onpointermove=mv;c.onpointerup=en;c.onpointercancel=en;c.onpointerleave=en;

  $('btnRegresarCarritoFirma').onclick=()=>{
    ro.disconnect();
    close();
    cartModal();
  };
  $('clear').onclick=()=>{const r=c.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);has=false};
  $('save').onclick=async()=>{
    if(!has)return alert('Falta la firma de quien recibe.');
    $('save').disabled=true;$('clear').disabled=true;
    try{
      const now=new Date(),folio=`SABPDD-${now.toISOString().slice(0,10).replaceAll('-','')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
      const fechaCapturaTxt=(()=>{const [y,m,d]=S.fechaCaptura.split('-');return y&&m&&d?`${d}/${m}/${y}`:S.fechaCaptura})();
      const salida={folio,almacenId:'abarrotespdd',inventarioId:S.config.inventarioId,fechaCaptura:S.fechaCaptura,fechaCapturaTxt,entrega:{usuarioId:S.user.id,usuario:S.user.usuario||'',nombre:S.user.nombre||'',rol:S.user.rol||'',rutaId:S.user.rutaId||''},recibe:S.recibe,recibeEmpleado:S.recibeEmpleado?{...S.recibeEmpleado}:null,destino:S.destino,partidas:S.cart.map((x,i)=>({renglon:i+1,codigo:x.codigo,descripcion:x.descripcion,cantidad:x.cantidad,inventarioInicial:x.inventarioInicial,cantidadPorCaja:x.cantidadPorCaja??null,cajasSalieron:x.cajasSalieron??(Number(x.cantidadPorCaja)>0?Math.round((Number(x.cantidad)/Number(x.cantidadPorCaja)+Number.EPSILON)*1000)/1000:null),precioPublico:x.precioPublico??null,fueraInventario:x.fueraInventario===true})),totalPartidas:S.cart.length,totalUnidades:S.cart.reduce((a,x)=>a+Number(x.cantidad||0),0),firmaRecibe:c.toDataURL('image/png'),fechaLocal:now.toLocaleDateString('es-MX'),horaLocal:now.toLocaleTimeString('es-MX'),creadoEn:serverTimestamp()};

      // 1) Primero se guarda definitivamente la salida.
      await setDoc(doc(db,...R.salidas,folio),salida);

      // Los productos que entraron por la opción externa se promueven al catálogo
      // operativo. Desde este momento ya aparecen en la captura/buscador normal.
      // La salida ya quedó guardada aunque una escritura auxiliar de catálogo falle.
      await promoteMovedProducts(salida.partidas);

      // 2) Después se genera la copia PDF con la firma.
      const pdfBlob=makePdf(salida),pdfName=`${folio}.pdf`;
      downloadBlob(pdfBlob,pdfName);

      // 3) Telegram SOLO se notifica después de que Firestore confirmó el guardado.
      const msg=`Salida registrada\n${folio}\nFecha de captura: ${salida.fechaCapturaTxt||salida.fechaCaptura}\nEntrega: ${salida.entrega.nombre||salida.entrega.usuario}\nRecibe: ${salida.recibe}\nDestino: ${salida.destino}\n${salida.totalPartidas} partidas | ${salida.totalUnidades} unidades`;
      await Promise.allSettled([
        telegramMessage(msg),
        telegramPdf(pdfBlob,pdfName,`Salida ${folio}`)
      ]);

      ro.disconnect();close();alert(`Salida guardada correctamente\n${folio}\nPDF generado`);
      S.cart=[];S.last=[];render();S.recibe='';S.recibeEmpleado=null;S.destino='';S.fechaCaptura='';await askCaptureDate();
    }catch(e){
      console.error(e);alert('No se pudo guardar la salida.');$('save').disabled=false;$('clear').disabled=false;
    }
  };
}

$('menuBtn').onclick=()=>$('menu').classList.toggle('hidden');
$('cartBtn').onclick=()=>{$('menu').classList.add('hidden');cartModal()};
$('cameraBtn').onclick=()=>{$('menu').classList.add('hidden');cameraScanner()};
$('extraProductBtn').onclick=()=>{$('menu').classList.add('hidden');addMasterProductModal()};
$('configBtn').onclick=()=>{$('menu').classList.add('hidden');configModal()};
$('logoutBtn').onclick=()=>{sessionStorage.removeItem('salidaPddUser');location.reload()};
$('searchBtn').onclick=searchFromMain;$('finishBtn').onclick=reviewBeforeFinish;
$('scanInput').addEventListener('input',quickSearch);
$('scanInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchFromMain()}};

document.addEventListener('click',e=>{if(!e.target.closest('.capture'))clearQuickResults()});

(async()=>{
  // La aplicación permanece completamente tapada mientras prepara los datos.
  $('app').classList.add('hidden');showLoad('Iniciando catálogos...');
  await loadConfig();
  await Promise.all([loadActiveProducts(),loadInventory({boot:true})]);
  setBootStatus('Datos listos. Abriendo aplicación...');
  await new Promise(r=>setTimeout(r,450));
  hideLoad();$('app').classList.remove('hidden');
  const cached=sessionStorage.getItem('salidaPddUser');
  if(cached){try{S.user=JSON.parse(cached);$('sesionTxt').textContent=S.user.nombre||S.user.usuario;await askCaptureDate();return}catch{}}
  await login();
})();
