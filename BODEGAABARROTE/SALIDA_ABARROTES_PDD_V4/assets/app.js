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
  cfg:['almacenes','abarrotespdd','configuracion','salidas'],
  invBase:['almacenes','abarrotespdd','inventariofisico'],
  salidas:['almacenes','abarrotespdd','salidas'],
  // Catálogo maestro. Si tu ruta definitiva cambia, sólo modifica esta línea.
  productos:['productos']
};
const S={
  user:null,recibe:'',destino:'',fechaCaptura:'',
  config:{receptores:[],destinos:[],inventarioId:'INV-ABARROTESPDD-170826'},
  catalog:[],byCode:new Map(),cart:[],last:[],productInfo:new Map()
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
    const lines=pdf.splitTextToSize(`${x.renglon}. ${x.descripcion} | ${x.codigo} | Cant: ${x.cantidad}`,right-left);
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

async function askReceiver(){
  const list=S.config.receptores||[];
  if(!list.length){return configRequired('receptores')}
  open(`<h2>¿Quién recibe la mercancía?</h2><select id="recv" class="field"><option value="">Selecciona...</option>${list.map(x=>`<option>${esc(x)}</option>`).join('')}</select><button id="next" class="primary" style="margin-top:14px">CONTINUAR</button>`);
  $('next').onclick=()=>{const v=$('recv').value;if(!v)return alert('Selecciona quién recibe.');S.recibe=v;askDestination()}
}
function askDestination(){
  const list=S.config.destinos||[];
  if(!list.length){return configRequired('destinos')}
  open(`<h2>¿Hacia dónde va?</h2><select id="dest" class="field"><option value="">Selecciona...</option>${list.map(x=>`<option>${esc(x)}</option>`).join('')}</select><button id="next" class="primary" style="margin-top:14px">CARGAR INVENTARIO</button>`);
  $('next').onclick=async()=>{const v=$('dest').value;if(!v)return alert('Selecciona el destino.');S.destino=v;close();await loadInventory()}
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

async function loadInventory(){
  showLoad('Construyendo catálogo del inventario inicial...');
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
    S.catalog=[...map.values()].sort((a,b)=>a.descripcion.localeCompare(b.descripcion,'es'));
    S.catalog.forEach(p=>S.byCode.set(String(p.codigo),p));
    if(!S.catalog.length){
      hideLoad();
      alert(`No se encontraron partidas válidas para ${invId}.`);
      return;
    }
    $('loadingText').textContent='Catálogo construido y cargado. Listo para trabajar.';
    setTimeout(()=>{hideLoad();$('scanInput').focus()},900);
  }catch(e){
    console.error('[CATÁLOGO] Error general:',e);hideLoad();
    alert('No se pudo construir el catálogo del inventario.');
  }
}

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
      const full=norm(`${p.descripcion} ${p.codigo}`), pw=words(p.descripcion);
      if(!toks.every(t=>tokenMatches(t,pw,full)))return null;
      let score=0;if(norm(p.codigo)===q)score+=1000;if(norm(p.descripcion)===q)score+=500;
      if(norm(p.descripcion).startsWith(q))score+=150;
      toks.forEach(t=>{if(pw.includes(t))score+=20;else if(full.includes(t))score+=10;else score+=3});
      return{p,score};
    })
    .filter(Boolean).sort((a,b)=>b.score-a.score||a.p.descripcion.localeCompare(b.p.descripcion,'es')).slice(0,limit).map(x=>x.p)
}
function renderResults(container,rs){
  container.innerHTML=rs.length?rs.map((p,i)=>`<div class="result" data-i="${i}"><b>${esc(p.descripcion)}</b><small>${esc(p.codigo)} · Inicial ${p.inventarioInicial}</small></div>`).join(''):'<div class="noresult">Sin coincidencias dentro del inventario inicial</div>';
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
  try{
    // Se consulta cada vez que se abre el producto para mostrar el precio y
    // cantidadPorCaja que realmente existen en /productos/{codigo}.
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

  const abrirModalCantidad=()=>{
    open(`<h2>Cantidad de salida</h2>
      <div class="product-capture-info">
        <b>${esc(info.concepto||p.descripcion)}</b>
        <small>${esc(p.codigo)} · Inventario inicial: ${p.inventarioInicial}</small>
        <div class="price-box"><span>Precio público actual</span><strong>${Number.isFinite(precio)?`$${precio.toFixed(2)}`:'NO REGISTRADO'}</strong></div>
      </div>
      <label>Cantidad de salida</label>
      <input id="qty" class="field modal-main-input" type="number" min="0.001" step="0.001" inputmode="decimal" placeholder="0">
      <button id="openCalc" class="secondary calc-open">ABRIR CALCULADORA</button>
      <div id="calcPanel" class="calculator hidden">
        <input id="calcExpr" class="field calc-expression" inputmode="decimal" placeholder="Ej. 12 × 24  → escribe 12*24">
        <div id="calcResult" class="calc-result">Resultado: —</div>
        <div class="calc-grid">
          ${['7','8','9','/','4','5','6','*','1','2','3','-','0','.','(',')'].map(k=>`<button type="button" data-k="${k}">${k==='*'?'×':k==='/'?'÷':k}</button>`).join('')}
        </div>
        <div class="calc-actions"><button id="calcBack" class="secondary">BORRAR 1</button><button id="calcClear" class="secondary">LIMPIAR</button><button id="calcEqual" class="secondary">=</button></div>
        <button id="calcRegister" class="primary">REGISTRAR CÁLCULO EN CANTIDAD</button>
      </div>
      <div class="modal-step">Paso 1 de 2</div>
      <div class="actions"><button id="cancel" class="secondary">Cancelar</button><button id="nextBox" class="primary">SIGUIENTE</button></div>`);
    $('cancel').onclick=close;
    bindCalculator('qty');
    $('nextBox').onclick=()=>{
      const q=Number($('qty').value);
      if(!(q>0))return alert('Captura una cantidad válida.');
      abrirModalCaja(q);
    };
    $('qty').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('nextBox').click();}};
    setTimeout(()=>$('qty').focus(),100);
  };

  const abrirModalCaja=(q)=>{
    open(`<h2>Cantidad por caja</h2>
      <div class="product-capture-info compact-product-info">
        <b>${esc(info.concepto||p.descripcion)}</b>
        <small>${esc(p.codigo)} · Salida capturada: <strong>${esc(q)}</strong></small>
      </div>
      <label>Piezas que trae la caja <span class="optional-label">(dato de catálogo)</span></label>
      <input id="boxQty" class="field modal-main-input" type="number" min="1" step="1" inputmode="numeric" value="${Number.isFinite(cajaCatalogo)&&cajaCatalogo>0?esc(cajaCatalogo):''}" placeholder="Ej. 12, 24, 36...">
      <div class="box-help">Este dato se guarda en el catálogo del producto. Si ya existe, puedes conservarlo o modificarlo.</div>
      <div class="modal-step">Paso 2 de 2</div>
      <div class="actions"><button id="backQty" class="secondary">REGRESAR</button><button id="add" class="primary">AGREGAR PARTIDA</button></div>`);
    $('backQty').onclick=()=>abrirModalCantidadConValor(q);
    $('add').onclick=async()=>{
      const raw=$('boxQty').value.trim();
      const boxQty=Number(raw);
      if(raw&&!(boxQty>0))return alert('La cantidad por caja debe ser mayor a cero.');
      const ex=S.cart.find(x=>x.codigo===p.codigo);
      const totalPropuesto=(ex?Number(ex.cantidad||0):0)+q;
      const inicial=Number(p.inventarioInicial||0);
      if(inicial>=0 && totalPropuesto>inicial){
        const ok=confirm(`La salida supera el inventario inicial.\n\nInicial: ${inicial}\nSalida acumulada: ${totalPropuesto}\n\n¿Deseas continuar?`);
        if(!ok)return;
      }
      $('add').disabled=true;
      try{
        if(boxQty>0 && boxQty!==cajaCatalogo)await saveBoxQty(p.codigo,boxQty);
        if(ex){
          ex.cantidad=totalPropuesto;
          if(boxQty>0)ex.cantidadPorCaja=boxQty;
          if(Number.isFinite(precio))ex.precioPublico=precio;
        }else{
          S.cart.push({...p,cantidad:q,cantidadPorCaja:boxQty>0?boxQty:(Number.isFinite(cajaCatalogo)?cajaCatalogo:null),precioPublico:Number.isFinite(precio)?precio:null});
        }
        S.last=S.last.filter(x=>x.codigo!==p.codigo);
        S.last.unshift({codigo:p.codigo,ts:Date.now()});
        S.last=S.last.slice(0,20);
        render();
        close();
        $('scanInput').value='';
        clearQuickResults();
        $('scanInput').focus();
        toast('Partida agregada');
      }catch(e){
        console.error(e);
        alert('No se pudo guardar la cantidad por caja en el catálogo. La partida no fue agregada.');
        $('add').disabled=false;
      }
    };
    $('boxQty').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('add').click();}};
    setTimeout(()=>$('boxQty').focus(),100);
  };

  const abrirModalCantidadConValor=(q)=>{
    abrirModalCantidad();
    setTimeout(()=>{if($('qty')){$('qty').value=q;$('qty').focus();}},0);
  };

  abrirModalCantidad();
}
function recentCartItems(){
  const items=[];
  for(const r of S.last){const x=S.cart.find(c=>c.codigo===r.codigo);if(x&&!items.some(y=>y.codigo===x.codigo))items.push(x)}
  return items.slice(0,2);
}
function render(){
  $('cartCount').textContent=S.cart.length;
  const last=recentCartItems();
  $('lastItems').innerHTML=last.length?last.map(x=>`<div class="item"><b>${esc(x.descripcion)}</b><small>${esc(x.codigo)}</small><div class="qty">${x.cantidad}</div></div>`).join(''):'<div class="empty">Aún no hay partidas</div>';

  const desktopList=$('desktopCartList');
  const desktopTotals=$('desktopCartTotals');
  if(desktopTotals){
    const units=S.cart.reduce((a,x)=>a+Number(x.cantidad||0),0);
    desktopTotals.textContent=`${S.cart.length} partidas · ${units} unidades`;
  }
  if(desktopList){
    desktopList.innerHTML=S.cart.length?S.cart.map((x,i)=>`<div class="desktop-cart-row">
      <div class="desktop-cart-index">${i+1}</div>
      <div class="desktop-cart-product"><b>${esc(x.descripcion)}</b></div>
      <div class="desktop-cart-code">${esc(x.codigo)}</div>
      <div class="desktop-cart-value"><span>Cantidad</span><b>${esc(x.cantidad)}</b></div>
      <div class="desktop-cart-value"><span>Pzas/caja</span><b>${x.cantidadPorCaja??'—'}</b></div>
      <div class="desktop-cart-actions"><button type="button" class="desktop-edit" data-desktop-edit="${i}">MODIFICAR</button><button type="button" class="desktop-delete" data-desktop-delete="${i}">ELIMINAR</button></div>
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
  return `<div class="shipment-summary">
    <div><small>Entrega</small><b>${esc(S.user?.nombre||S.user?.usuario||'-')}</b></div>
    <div><small>Recibe</small><b>${esc(S.recibe||'-')}</b></div>
    <div><small>Destino</small><b>${esc(S.destino||'-')}</b></div>
  </div>
  <div class="cart-totals"><span>${S.cart.length} partidas</span><b>${units} unidades</b></div>`;
}
function cartRowsHtml(editable=true){
  if(!S.cart.length)return '<div class="empty">Carrito vacío</div>';
  return `<div class="cart-list">${S.cart.map((x,i)=>`<div class="cart-row-mobile">
    <div class="cart-index">${i+1}</div>
    <div class="cart-product"><b>${esc(x.descripcion)}</b><small>${esc(x.codigo)}</small></div>
    <div class="cart-qty"><small>Cant.</small><b>${x.cantidad}</b></div>
    ${editable?`<div class="cart-row-actions"><button class="cart-edit" data-edit="${i}" aria-label="Modificar cantidad">Editar</button><button class="cart-delete" data-delete="${i}" aria-label="Eliminar">×</button></div>`:''}
  </div>`).join('')}</div>`;
}
function editCartQuantity(index,returnTo='cart'){
  const item=S.cart[index];
  if(!item)return;
  open(`<h2>Modificar partida</h2><div class="product-capture-info"><b>${esc(item.descripcion)}</b><small>${esc(item.codigo)} · Inventario inicial: ${item.inventarioInicial}</small></div><label>Nueva cantidad</label><input id="editQty" class="field modal-main-input" type="number" min="0.001" step="0.001" inputmode="decimal" value="${esc(item.cantidad)}"><label>Cantidad por caja</label><input id="editBoxQty" class="field modal-main-input" type="number" min="1" step="1" inputmode="numeric" value="${item.cantidadPorCaja??''}"><div class="box-help">Al guardar, también se actualiza cantidad por caja en el catálogo del producto.</div><div class="actions"><button id="editCancel" class="secondary">Cancelar</button><button id="editSave" class="primary">GUARDAR CAMBIOS</button></div>`);
  const goBack=()=>{if(returnTo==='review')reviewBeforeFinish();else if(returnTo==='cart')cartModal();else {close();$('scanInput')?.focus();}};
  $('editCancel').onclick=goBack;
  $('editSave').onclick=async()=>{
    const q=Number($('editQty').value);
    const rawBox=$('editBoxQty').value.trim();
    const boxQty=Number(rawBox);
    if(!(q>0))return alert('Captura una cantidad válida.');
    if(rawBox&&!(boxQty>0))return alert('La cantidad por caja debe ser mayor a cero.');
    const inicial=Number(item.inventarioInicial||0);
    if(inicial>=0 && q>inicial){
      const ok=confirm(`La salida supera el inventario inicial.\n\nInicial: ${inicial}\nSalida: ${q}\n\n¿Deseas continuar?`);
      if(!ok)return;
    }
    $('editSave').disabled=true;
    try{
      if(boxQty>0 && boxQty!==Number(item.cantidadPorCaja))await saveBoxQty(item.codigo,boxQty);
      item.cantidad=q;
      item.cantidadPorCaja=boxQty>0?boxQty:null;
      render();
      goBack();
      toast('Partida modificada');
    }catch(e){
      console.error(e);
      alert('No se pudieron guardar los cambios.');
      $('editSave').disabled=false;
    }
  };
  $('editQty').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('editBoxQty').focus();$('editBoxQty').select();}};
  $('editBoxQty').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('editSave').click();}};
  setTimeout(()=>$('editQty')?.focus(),100);
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

function configModal(){const r=(S.config.receptores||[]).join('\n'),d=(S.config.destinos||[]).join('\n');open(`<h2>Configuración</h2><p>Se guarda en /almacenes/abarrotespdd/configuracion/salidas</p><label>Personas que reciben</label><textarea id="recs" class="field" rows="6" placeholder="Un nombre por línea">${esc(r)}</textarea><label>Destinos</label><textarea id="dests" class="field" rows="5" placeholder="Un destino por línea">${esc(d)}</textarea><label>Inventario inicial</label><input id="inv" class="field" value="${esc(S.config.inventarioId)}"><div class="actions"><button id="x" class="secondary">Cancelar</button><button id="save" class="primary">Guardar</button></div>`);$('x').onclick=close;$('save').onclick=async()=>{S.config.receptores=$('recs').value.split('\n').map(x=>x.trim()).filter(Boolean);S.config.destinos=$('dests').value.split('\n').map(x=>x.trim()).filter(Boolean);S.config.inventarioId=$('inv').value.trim()||'INV-ABARROTESPDD-170826';await saveConfig();close();toast('Configuración guardada')}}
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
      const salida={folio,almacenId:'abarrotespdd',inventarioId:S.config.inventarioId,fechaCaptura:S.fechaCaptura,fechaCapturaTxt,entrega:{usuarioId:S.user.id,usuario:S.user.usuario||'',nombre:S.user.nombre||'',rol:S.user.rol||'',rutaId:S.user.rutaId||''},recibe:S.recibe,destino:S.destino,partidas:S.cart.map((x,i)=>({renglon:i+1,codigo:x.codigo,descripcion:x.descripcion,cantidad:x.cantidad,inventarioInicial:x.inventarioInicial,cantidadPorCaja:x.cantidadPorCaja??null,precioPublico:x.precioPublico??null})),totalPartidas:S.cart.length,totalUnidades:S.cart.reduce((a,x)=>a+Number(x.cantidad||0),0),firmaRecibe:c.toDataURL('image/png'),fechaLocal:now.toLocaleDateString('es-MX'),horaLocal:now.toLocaleTimeString('es-MX'),creadoEn:serverTimestamp()};

      // 1) Primero se guarda definitivamente la salida.
      await setDoc(doc(db,...R.salidas,folio),salida);

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
      S.cart=[];S.last=[];render();S.recibe='';S.destino='';S.fechaCaptura='';await askCaptureDate();
    }catch(e){
      console.error(e);alert('No se pudo guardar la salida.');$('save').disabled=false;$('clear').disabled=false;
    }
  };
}

$('menuBtn').onclick=()=>$('menu').classList.toggle('hidden');
$('cartBtn').onclick=()=>{$('menu').classList.add('hidden');cartModal()};
$('cameraBtn').onclick=()=>{$('menu').classList.add('hidden');cameraScanner()};
$('configBtn').onclick=()=>{$('menu').classList.add('hidden');configModal()};
$('logoutBtn').onclick=()=>{sessionStorage.removeItem('salidaPddUser');location.reload()};
$('searchBtn').onclick=searchFromMain;$('finishBtn').onclick=reviewBeforeFinish;
$('scanInput').addEventListener('input',quickSearch);
$('scanInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchFromMain()}};

document.addEventListener('click',e=>{if(!e.target.closest('.capture'))clearQuickResults()});

(async()=>{await loadConfig();hideLoad();$('app').classList.remove('hidden');const cached=sessionStorage.getItem('salidaPddUser');if(cached){try{S.user=JSON.parse(cached);$('sesionTxt').textContent=S.user.nombre||S.user.usuario;await askCaptureDate();return}catch{}}await login()})();
