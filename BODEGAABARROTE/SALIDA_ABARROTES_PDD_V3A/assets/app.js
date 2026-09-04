const APP_BUILD_VERSION='V37-ESC-POS-58MM-LOGO';
const INVENTARIO_ID='INV-ABARROTESPDD-170826';
console.info('[SALIDA PDD] versión cargada:',APP_BUILD_VERSION);
import {TELEGRAM} from './telegram-config.js';
import {ACTIVE_FIREBASE,FIREBASE_PROFILES,getActiveFirebaseConfig} from './firebase-connections.js?v=32';

// V37: ticket térmico 58 mm ESC/POS con logo PROVEEDORA rasterizado + puente nativo Android desacoplado + PDF 58 mm de respaldo. El arranque ya NO depende de Firebase/CDN. Todo lo remoto se carga
// únicamente cuando una operación realmente necesita internet. Así la interfaz
// y los catálogos locales pueden abrir incluso si la red móvil deja una petición colgada.
let db=null,storage=null,jsPDF=null;
let collection,getDocs,doc,getDoc,setDoc,serverTimestamp,collectionGroup,query,where,onSnapshot; // V32: un solo listener centinela, nunca listener masivo
let storageRef,uploadBytes,getDownloadURL;
let onlineStackPromise=null;
const FIREBASE_CONFIG=getActiveFirebaseConfig();
console.info('[FIREBASE] perfil activo:',ACTIVE_FIREBASE,'proyecto:',FIREBASE_CONFIG.projectId);
window.__FIREBASE_PROFILES={active:ACTIVE_FIREBASE,profiles:FIREBASE_PROFILES};
function withTimeout(p,ms,msg='La conexión tardó demasiado'){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg)),ms))])}
async function ensureOnlineStack(timeoutMs=12000){
  if(db&&storage&&collection&&jsPDF)return true;
  if(!onlineStackPromise){
    onlineStackPromise=(async()=>{
      const [appMod,fs,st,pdf]=await withTimeout(Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js'),
        import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm')
      ]),timeoutMs,'No se pudieron cargar los servicios en línea.');
      const firebaseApp=appMod.getApps().length?appMod.getApp():appMod.initializeApp(FIREBASE_CONFIG);
      db=fs.getFirestore(firebaseApp);storage=st.getStorage(firebaseApp);jsPDF=pdf.jsPDF;
      ({collection,getDocs,doc,getDoc,setDoc,serverTimestamp,collectionGroup,query,where,onSnapshot}=fs);
      storageRef=st.ref;uploadBytes=st.uploadBytes;getDownloadURL=st.getDownloadURL;
      return true;
    })().catch(e=>{onlineStackPromise=null;throw e});
  }
  return withTimeout(onlineStackPromise,timeoutMs,'Los servicios en línea no respondieron a tiempo.');
}

const $=id=>document.getElementById(id), modal=$('modal'), card=$('modalCard');
const diag=(m,x)=>{try{window.__diag?.(m,x)}catch{}};
diag('APP.JS','MÓDULO CARGADO');
window.__V16_APP_STARTED=true;
const R={
  users:['CLIENTES','PDD031204KL5','USUARIOS'],
  empleados:['CLIENTES','PDD031204KL5','EMPLEADOS'],
  cfg:['almacenes','abarrotespdd','configuracion','salidas'],
  destinos:['almacenes','abarrotespdd','configuracion','direcciones','destinos'],
  invBase:['almacenes','abarrotespdd','inventariofisico'],
  salidas:['almacenes','abarrotespdd','salidas'],
  // Productos externos que ya tuvieron movimiento y desde entonces forman parte
  // del buscador operativo normal de esta app.
  catalogoOperativo:['almacenes','abarrotespdd','catalogo_operativo'],
  catalogoBloqueados:['almacenes','abarrotespdd','catalogo_bloqueados'],
  // Catálogo maestro. Si tu ruta definitiva cambia, sólo modifica esta línea.
  productos:['productos'],
  // Un solo documento centinela. El sistema que modifica /productos debe actualizarlo.
  catalogVersion:['almacenes','abarrotespdd','configuracion','catalogo_version'],
  entradasFoto:['almacenes','abarrotespdd','entradas','fotobodega','registros']
};
const S={
  user:null,recibe:'',recibeEmpleado:null,destino:'',destinoDetalle:null,fechaCaptura:'',
  config:{receptores:[],destinos:[],inventarioId:'INV-ABARROTESPDD-170826'},destinos:[],
  empleados:[],catalog:[],byCode:new Map(),cart:[],last:[],productInfo:new Map(),
  masterProducts:[],masterByCode:new Map(),inventoryReady:false,masterReady:false,offlineCatalogAt:null,blockedCodes:new Set(),catalogLastDeltaAt:0
};

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9. ]/g,' ').replace(/\s+/g,' ').trim();
const words=s=>norm(s).split(' ').filter(Boolean);
let cameraStream=null,cameraTimer=null;

// ===== V12 OFFLINE =====
const OFFLINE_DB='abarrotes-pdd-offline-v12',OFFLINE_STORE='cache';
// V32 AHORRO FIREBASE: sin polling y sin descarga completa automática diaria.
const AUX_TTL_MS={employees:6*60*60*1000,config:6*60*60*1000,fixedUser:12*60*60*1000,blockedCodes:6*60*60*1000};
const CATALOG_DEBOUNCE_MS=7000;
let catalogVersionUnsubscribe=null;
let catalogDebounceTimer=null;
let catalogSyncPromise=null;
let catalogWatcherStarting=false;
function offlineDb(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(OFFLINE_DB,1);
    r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(OFFLINE_STORE))db.createObjectStore(OFFLINE_STORE)};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function cachePut(key,value){
  try{const db=await offlineDb();await new Promise((resolve,reject)=>{const tx=db.transaction(OFFLINE_STORE,'readwrite');tx.objectStore(OFFLINE_STORE).put({value,updatedAt:Date.now()},key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();return true}catch(e){console.warn('[OFFLINE] No se pudo guardar',key,e);return false}
}
async function cacheGet(key){
  try{const db=await offlineDb();const out=await new Promise((resolve,reject)=>{const tx=db.transaction(OFFLINE_STORE,'readonly');const r=tx.objectStore(OFFLINE_STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});db.close();return out}catch(e){console.warn('[OFFLINE] No se pudo leer',key,e);return null}
}
function cacheFresh(rec,ttl){return !!rec&&Number(rec.updatedAt||0)>0&&(Date.now()-Number(rec.updatedAt))<ttl}
function cacheAgeText(ms){if(!ms)return 'sin fecha';const d=new Date(ms);return d.toLocaleDateString('es-MX')+' '+d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
function setConnectionBadge(){
  const b=$('offlineBadge');if(!b)return;
  b.textContent=navigator.onLine?'● EN LÍNEA':'● SIN INTERNET';
  b.classList.toggle('offline',!navigator.onLine);
}
window.addEventListener('online',()=>{setConnectionBadge();toast('Conexión recuperada');setTimeout(()=>startCatalogVersionWatcher(),1200)});
window.addEventListener('offline',()=>{setConnectionBadge();toast('Sin internet: usando datos guardados')});

// V15: navigator.onLine NO se usa como bloqueo. En algunos Motorola con datos
// móviles puede reportar un estado incorrecto. Las operaciones de red se intentan
// directamente y sólo se consideran fallidas cuando Firebase/fetch realmente falla.
async function hasUsableInternet(timeoutMs=5000){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    await fetch('https://www.google.com/generate_204?provsoft='+Date.now(),{method:'GET',mode:'no-cors',cache:'no-store',signal:ctrl.signal});
    return true;
  }catch(e){return false}
  finally{clearTimeout(timer)}
}

let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;localStorage.setItem('abarrotesPddInstalled','1')});
if('serviceWorker' in navigator)window.addEventListener('load',async()=>{
  try{const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});await reg.update()}catch(e){console.warn('[PWA] Service worker:',e)}
});
function isStandalonePwa(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true||localStorage.getItem('abarrotesPddInstalled')==='1'}
function waitForInstallPrompt(ms=1200){
  if(deferredInstallPrompt)return Promise.resolve(true);
  return new Promise(resolve=>{
    const started=Date.now();
    const t=setInterval(()=>{
      if(deferredInstallPrompt||Date.now()-started>=ms){clearInterval(t);resolve(!!deferredInstallPrompt)}
    },100);
  });
}
async function startupPwaInstallStep(){
  if(isStandalonePwa())return true;
  const installBtn=$('pwaInstallBtn'),continueBtn=$('pwaContinueBtn');
  setBootStatus('INSTALACIÓN PWA');
  $('bootHint').textContent='Instala la aplicación en este equipo o continúa en el navegador. Después verificaremos los catálogos offline.';
  installBtn.classList.remove('hidden');
  continueBtn.classList.remove('hidden');
  await waitForInstallPrompt(1200);
  return await new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;installBtn.classList.add('hidden');continueBtn.classList.add('hidden');resolve(true)};
    continueBtn.onclick=()=>{sessionStorage.setItem('pwaInstallSkipped','1');finish()};
    installBtn.onclick=async()=>{
      const p=deferredInstallPrompt;
      if(!p){
        alert('Chrome todavía no habilita el instalador automático. Puedes usar el menú de Chrome → Instalar aplicación / Agregar a pantalla principal, o continuar en el navegador.');
        return;
      }
      installBtn.disabled=true;
      try{
        p.prompt();
        const choice=await p.userChoice;
        deferredInstallPrompt=null;
        if(choice?.outcome==='accepted')localStorage.setItem('abarrotesPddInstalled','1');
      }catch(e){console.warn('[PWA] Instalación:',e)}
      finally{installBtn.disabled=false;finish()}
    };
  });
}


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
  // V36: respaldo PDF con ancho FISICO de 58 mm, igual al papel objetivo.
  const pageW=58;
  const marginL=2.4, marginR=2.4;
  const contentW=pageW-marginL-marginR;
  const countLines=(txt,size=28)=>Math.max(1,Math.ceil(String(txt||'').length/size));
  let pageH=73;
  for(const x of salida.partidas||[])pageH += 10 + countLines(`${x.renglon}. ${x.descripcion}`,27)*3.65;
  pageH += 29; pageH=Math.max(90,Math.min(900,Math.ceil(pageH)));
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:[pageW,pageH],compress:true,putOnlyUsedFonts:true,precision:4});
  try{pdf.internal.pageSize.width=pageW;pdf.internal.pageSize.height=pageH}catch{}
  let y=3.2; const center=pageW/2;
  try{pdf.addImage(PROVEEDORA_LOGO_JPEG_DATA_URL,'JPEG',3.2,y,51.6,24.0,undefined,'FAST');y+=25.2}catch(e){console.warn('[PDF LOGO] No se pudo insertar logo:',e);y=5}
  const sep=()=>{pdf.setDrawColor(90);pdf.setLineWidth(.20);pdf.line(marginL,y,pageW-marginR,y);y+=2.7};
  const textLines=(txt,fontSize=7.8,bold=false)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(fontSize);const lines=pdf.splitTextToSize(String(txt||''),contentW);pdf.text(lines,marginL,y);y+=lines.length*(fontSize<=7.5?3.35:3.7)};
  pdf.setTextColor(0);pdf.setFont('helvetica','bold');pdf.setFontSize(10.2);pdf.text('SALIDA ABARROTES PDD',center,y,{align:'center'});y+=4.2;
  pdf.setFontSize(8.2);pdf.text('PROVSOFT',center,y,{align:'center'});y+=3.2;sep();
  textLines(`FOLIO: ${salida.folio}`,7.3,true); textLines(`FECHA: ${salida.fechaCapturaTxt||salida.fechaCaptura||''}`,7.4); textLines(`HORA: ${salida.horaLocal||''}`,7.4);
  textLines(`DESTINO: ${salida.destino||''}`,7.6,true); textLines(`ENTREGA: ${salida.entrega?.nombre||salida.entrega?.usuario||''}`,7.5); textLines(`RECIBE: ${salida.recibe||''}`,7.5); y+=.4;sep();
  pdf.setFont('helvetica','bold');pdf.setFontSize(8.1);pdf.text('DETALLE',marginL,y);y+=3.4;sep();
  for(const x of salida.partidas||[]){textLines(`${x.renglon}. ${x.descripcion}`,7.8,true);pdf.setFont('helvetica','normal');pdf.setFontSize(7);pdf.text(`COD: ${x.codigo}`,marginL,y);y+=3.15;const cajas=x.cajasSalieron!=null&&x.cantidadPorCaja!=null?`${x.cajasSalieron} cj x ${x.cantidadPorCaja} = `:'';pdf.setFont('helvetica','bold');pdf.setFontSize(8.2);pdf.text(`${cajas}${x.cantidad} PZAS`,marginL,y);y+=3.8;pdf.setDrawColor(185);pdf.setLineWidth(.12);pdf.line(marginL,y,pageW-marginR,y);y+=2.2}
  sep();pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.text(`PARTIDAS: ${salida.totalPartidas}`,marginL,y);y+=4.1;pdf.text(`UNIDADES: ${salida.totalUnidades}`,marginL,y);y+=4.1;sep();
  textLines(`ENTREGA: ${salida.entrega?.nombre||salida.entrega?.usuario||''}`,7.7,true);textLines(`RECIBE: ${salida.recibe||''}`,7.7,true);y+=1;pdf.setFont('helvetica','bold');pdf.setFontSize(7.5);pdf.text('*** SALIDA REGISTRADA ***',center,y,{align:'center'});
  return pdf.output('blob');
}

function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}


// ===== V37 IMPRESION TERMICA 58 MM ESC/POS + LOGO PROVEEDORA + COLA DE SINCRONIZACION =====
// El ticket se construye COMPLETO aqui en JavaScript. Android solo abre Bluetooth
// RFCOMM/SPP y envia estos bytes a la impresora seleccionada.
const SALIDAS_PENDING_KEY='abarrotesPddSalidasPendientesV17';
const PRINTER_CONFIG_KEY='provsoftPrinter58ConfigV1';
const PRINTER_DEFAULTS={paperMm:58,charsPerLine:32,protocol:'ESC/POS',autoPrint:true,feedLines:4,partialCut:true};
// V37: Logo exacto de PROVEEDORA preparado para ticket térmico 58 mm.
// Se conserva también el JPEG original para el PDF de respaldo; para ESC/POS se usa
// una versión monocromática raster de 360 puntos, ya convertida a bytes GS v 0.
const PROVEEDORA_LOGO_JPEG_DATA_URL='data:image/jpeg;base64,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';
const PROVEEDORA_LOGO_ESC_POS_BASE64='HXYwAC0AjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//////////////////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAf//////////////////////////////////gAAAAAAAAAAAAAAAAAAAAAAP/////////////////////////////////////8AAAAAAAAAAAAAAAAAAAB/////////////////////////////////////////gAAAAAAAAAAAAAAAAP///////////////////////////////////////////gAAAAAAAAAAAAAB//////////////////////////////////////////////4AAAAAAAAAAAB//////////////////4AAAAAAAAAAAAAf///////////////4AAAAAAAAAD///////////////gAAAAAAAAAAAAAAAAAAAAA/////////////gAAAAAAAD/////////////gAAAAAAAAAAAAAAAAAAAAAAAAAAB///////////gAAAAAA///////////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/////////8AAAAAP/////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD////////wAAAB////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///////8AAAP///////gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//////gAB//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////4AD/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD////+AP////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD////Af///4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH///g///5gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//x///DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//5//gDwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/5/+AG4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/7/wAGYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//AAMYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/+AAMYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAMYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAc4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AcYwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8A8YwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8A4YwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8Bw4wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8Dg5wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8HA5gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8HA5gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8OAxgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8MAzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8cAzAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8YAzAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/84A2BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8wA2DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8wA8H8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8wB8H8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/9wA4P8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/9gA4P8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/9gAwP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAD/9gB4f4f/4APr/AAAAf+AA8+AH+ef//B7//+D/+AAAAB/4AD7/wAAAA4AAAD/9gD4f4///Af//4AAB//gB//AP/////x////H//+AAAH/+AH///AAAA4AAAD/9gD4f4///wf//+AAD//wB//AP/////x////H///gAAP//AH///gAAA4AAAD/9wH4fw///4f///AAH//4B//AP/////x////H///4AAf//gH///wAAA8AAAD/8wO4fA///8f///gAP//8B//AP/////x////H///8AA///wD///4AAB8AAAD/8wc4/Af//+P///gAf//+A/+AH+P///w////D///+AB///wD///4AAB+AAAD/8c4w+AD/f+B/3/wAf4D+Af4AB+D///wH///Af///AD/gf4Af5/8AAD+AAAD/8fww0AD+H+B/B/wA/wB/AP8AB8D+ADwP4APAfwH/gD/AP8AfwP8AAD+AAAD/8PgxwAD+D+A/AfwA/gB/AH8AB8D+ADwH4AHAfwD/gH+AH8APwH8AAD/AAAD/8AAxgAD+B/A/AP4B/AA/gH8AD4D+ABwH4AHAfwA/wH8AD+APwD+AAH/AAAD/8ABzgAD8B/A/AP4B/AAfwH8AD4D+ABwH4ADgfwAfwH8AB+AfwD+AAH/AAAD/8ABzAAD8B/A/AP4D+AAfwD8ADwD+ABwH4ADgfwAf4P4AB+AfwD+AAH/gAAD/8ABnAAD8A/A/AP4D+AAPwD+AHwD+AAwH4ALAfwAP4P4AB/AfwD+AAP/gAAD/8ABuAAD8B/A/AP4D+AAPwD+AHwD+AGAH4AYAfwAP4P4AA/AfwD+AAP/gAAD/8AD8AAD8B/A/AP4D8AAP4B+AHgD+AGAH4AcAfwAH8fwAA/APwD+AAPfgAAD/8AD4AAD8B/B/AP4H8AAP4B+APgD+AHAH4AcAfwAH8fwAA/gPwD+AAffwAAD/8AH4AAD8B/B/Af4H8AAP4B/APgD+APAH4AcAfwAH8fwAA/gPwD+AAfPwAAD/8APgAAD8D/A/AfwH8AAH4B/APAD+APAH4A8AfwAH8fwAA/gPwH8AAePwAAD/8AfAAAD8H+A/A/wH8AAH4A/AfAD///AH//8AfwAH8fwAA/gPwP8AAeP4AAD/8B+AAAD8P+A/D/wH8AAH8A/gfAD///AH//8AfwAD8fwAA/gPw/8AA8P4AAD/8D8AAAD//+A///gH8AAH8A/geAD///AH//8AfwAD8fwAAfgP//4AA8H4AAD/8H4AAAD//8A///AH8AAH8AfgeAD///AH//8AfwAD8fwAAfgP//wAB8H8AAD/8P4AAAD//4A//+AH8AAH8Afw+AD///AH//8AfwAD8fwAAfgP//wAB8H8AAD/8PwAAAD//4A//8AH8AAH8Afw+AD///AH//8AfwAD8fwAA/gP//AAB4D8AAD/8PgAAAD//gA//4AH8AAH8APw8AD+A/AH8B8AfwAD8fwAA/gf/+AAD4D8AAD/8PAAAAD/+AA//8AH8AAH8AP58AD+APAH4AcAfwAH8fwAA/gf//AAD//+AAD/8OAAAAD+AAA/P8AH8AAH4AP58AD+AHAH4AcAfwAH8fwAA/gfz/AAD//+AAD/8AAAAAD8AAA/H+AD8AAP4AH54AD+AHAH4AcAfwAH8fwAA/gfx/gAD//+AAD/8AAAAAD8AAA/H+AD8AAP4AH54AD+AHAH4AcAfwAH8fwAA/gfx/gAH///AAD/8AAAAAD8AAA/D/AD8AAP4AH/4AD+AHAH4AMAfwAP8PwAA/gfw/wAH///AAD/8AAAAAD8AAA/D/gD+AAP4AD/4AD+AAIH4AAwfwAP4PwAB/gfw/4AH///AAD/8AAAAAD8AAA/B/gD+AAP4AD/wAD+AAMH4AAwfwAP4PwAB/Afwf4APgA/gAD/8AAAAAD8AAA/B/wD+AAfwAD/wAD+AAcH4AB4fwAf4P4AB/AfwP8APgA/gAD/8AAAAAD8AAA/A/wB+AAfwAD/wAD+AAcH4AB4fwAf4H4AB/APwP8APAA/gAD/8AAAAAD8AAA/A/4B/AA/wAB/gAD+AA8H4AB4fwA/wH8AD+APwH+AfAAfwAD/8AAAAAD8AAB/Af8A/AA/gAB/gAD+AA8H4AD4fwB/wH8AD+AfwH/AfAAfwAD/8AAAAAD8AAB/AP8A/gB/gAB/gAD+AB8H4AHwfwD/gD+AH+AfwD/g/AAfwAD/8AAAAAD+AAB/AP+A/wD/AAA/AAD+AH8P8AfwfwP/AD/AP8AfwD/g+AAP4AD/8AAAAAH/AAD/gH/Af8P/AAA/AAH///4P///w////AB/g/8A/4B/x+AAf4AD/8AAAAAf/wAP/4H/gP//+AAA/AAf///5////3///+AA///4D/+A///gB//AD/8AAAAA//wAf/8D/wH//8AAA+AA////5////n///8AA///wH//A///wB//AD/8AAAAA//4Af/8B/wD//4AAAeAA////5////n///wAAf//gH//Af//wB//AD/8AAAAA//4Af/8B/wB//wAAAeAA////x////n///gAAH//AD//Af//wB//AD/8AAAAAf/wAf/8A/wA//gAAAeAAf///x////n//8AAAD/+AD//AP//wB//AD/8AAAAAAAAAAAAAAAAH8AAAAMAAAAAAAAAAAAAAAAAAA/wAAAAAAAAAAACAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAAPCGgOfGAAfHxnxxDGPiD4wAAQ+CHjwcfvjAAgRj994hgwPHiQQgYAAD/8AAAPzGwf/fAAfn7/7/DOP2H74AA4/HHz8+f/vgBwxj//+xx4fv34Yw8AAD/8AAAPzHw//fAAf3//3/DOP2H74AA4/HH/9/f/vgBwxz//+zz4f//45x8AAD/8AAAM7Gw74YAAZ2HeHPDPM/HDQAA4zHGbNzmYNAAxzwzhnzzoY++4550AAD/8AAAMbGxw4YAAY+HGGDDPM+HDAAB8zPmfPhmcMAA5zwzhnzzgY+e455wAAD/8AAAMfGxw/cAAY/3H2D/fP2H7gAB8/NmfPhmfuAA5z4z9nz5wY+e9794AAD/8AAAMfGxwfOH4Y/7n+D/ZP2H7wfhs/Nn7/hmfvDw53Yz9+3Z4Y//97M4AAD/8AAAMfGxwfHH8Y/x32D/bv/H5w/js/fn79hmfnDx734z9+3Y4f/3/78cAAD/8AAAMbGxw4HH8Y+A2GDDfs+HA4/j+z/3z5hmcDjx/34zh834Yfv3/78MAAD/+AAAM7Gwx4HAAY2A+HPD/s+HA4AD+z/+7djmYDgB//8zhu38Yfu3//8cAAH//AAAP7u+//fAAf3733/D/v//7wADO/5+bN/GfvAB2/cz/m+d4YO/3/e8AAP//4AAPz+/f/+AAfn/n7/Dw/3//wAHH/4+fM/Gf/AB2+Mz/n+N4YOf/eH4AA/9/+AAPh8+OfcAAfn7n57Dw/z/7gADH+Q+bMeGfuAAm8Mx/n8NwYGazeG4AD/5//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/5///AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//4///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///wf///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///gH////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH////AD/////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD////+AA//////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/////4AAH///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//////gAAB/////////gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///////8AAAAH/////////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////gAAAAAf///////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/////////8AAAAAAA/////////////gAAAAAAAAAAAAAAAAAAAAAAAAAAH//////////+AAAAAAAAB///////////////8AAAAAAAAAAAAAAAAAAAAD/////////////gAAAAAAAAAB////////////////////cAAAAAAAAAD/////////////////gAAAAAAAAAAAA//////////////////////////////////////////////gAAAAAAAAAAAAAAH///////////////////////////////////////////gAAAAAAAAAAAAAAAAB////////////////////////////////////////+AAAAAAAAAAAAAAAAAAAAH/////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAP/////////////////////////////////+AAAAAAAAAAAAAAAAAAAAAAAAAAAD//////////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD////////////////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
function base64ToBytes(b64){const bin=atob(b64),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return u8}
const PROVEEDORA_LOGO_ESC_POS_BYTES=base64ToBytes(PROVEEDORA_LOGO_ESC_POS_BASE64);

let syncingPendingSalidas=false;
function pendingSalidasRead(){try{const a=JSON.parse(localStorage.getItem(SALIDAS_PENDING_KEY)||'[]');return Array.isArray(a)?a:[]}catch{return[]}}
function pendingSalidasWrite(a){try{localStorage.setItem(SALIDAS_PENDING_KEY,JSON.stringify(a));return true}catch(e){console.error('[SALIDAS PENDIENTES] No se pudo guardar localmente:',e);return false}}
function queueSalidaLocal(salida){const a=pendingSalidasRead().filter(x=>x?.folio!==salida.folio);a.push(salida);return pendingSalidasWrite(a)}
function removePendingSalida(folio){pendingSalidasWrite(pendingSalidasRead().filter(x=>x?.folio!==folio))}
function printerConfigRead(){try{return {...PRINTER_DEFAULTS,...JSON.parse(localStorage.getItem(PRINTER_CONFIG_KEY)||'{}'),paperMm:58,protocol:'ESC/POS'}}catch{return {...PRINTER_DEFAULTS}}}
function printerConfigWrite(cfg){const clean={...PRINTER_DEFAULTS,...cfg,paperMm:58,protocol:'ESC/POS'};localStorage.setItem(PRINTER_CONFIG_KEY,JSON.stringify(clean));return clean}
function asciiTicket(s){return String(s??'').replace(/Ñ/g,'N').replace(/ñ/g,'n').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E\n]/g,' ')}
function ticketLines(s,n=32){s=asciiTicket(s).replace(/\s+/g,' ').trim();if(!s)return[''];const out=[];while(s.length>n){let cut=s.lastIndexOf(' ',n);if(cut<10)cut=n;out.push(s.slice(0,cut).trim());s=s.slice(cut).trim()}out.push(s);return out}
function fitTicket(s,n=32){return ticketLines(s,n)[0]||''}
function centerTicket(s,n=32){s=asciiTicket(s).trim();if(s.length>=n)return s.slice(0,n);return ' '.repeat(Math.floor((n-s.length)/2))+s}
function buildEscPos58Bytes(salida,opts={}){
  const cfg={...printerConfigRead(),...opts,paperMm:58}; const cols=Math.max(24,Math.min(42,Number(cfg.charsPerLine)||32));
  const bytes=[];const push=(...a)=>bytes.push(...a);const text=t=>{for(const ch of asciiTicket(t))push(ch.charCodeAt(0)&255)};const lf=(t='')=>{text(t);push(10)};const rule=()=>lf('-'.repeat(cols));
  push(27,64);push(27,97,1);push(...PROVEEDORA_LOGO_ESC_POS_BYTES);lf('');push(27,69,1);lf('SALIDA ABARROTES PDD');push(27,69,0);lf('PROVSOFT');rule();push(27,97,0);push(27,77,0);
  ticketLines(`FOLIO: ${salida.folio}`,cols).forEach(lf);lf(`FECHA: ${salida.fechaCapturaTxt||salida.fechaCaptura||''}`);lf(`HORA: ${salida.horaLocal||''}`);ticketLines(`DESTINO: ${salida.destino||''}`,cols).forEach(lf);
  push(27,69,1);ticketLines(`ENTREGA: ${salida.entrega?.nombre||salida.entrega?.usuario||''}`,cols).forEach(lf);ticketLines(`RECIBE: ${salida.recibe||''}`,cols).forEach(lf);push(27,69,0);rule();push(27,69,1);lf('PARTIDAS');push(27,69,0);rule();
  for(const x of salida.partidas||[]){push(27,69,1);ticketLines(`${x.renglon}. ${x.descripcion}`,cols).forEach(lf);push(27,69,0);ticketLines(`COD: ${x.codigo}`,cols).forEach(lf);const cajas=x.cajasSalieron!=null&&x.cantidadPorCaja!=null?`${x.cajasSalieron} cj x ${x.cantidadPorCaja} = `:'';push(27,69,1);ticketLines(`${cajas}${x.cantidad} PZAS`,cols).forEach(lf);push(27,69,0);lf('')}
  rule();push(27,69,1);lf(`PARTIDAS: ${salida.totalPartidas}`);lf(`UNIDADES: ${salida.totalUnidades}`);push(27,69,0);rule();ticketLines(`ENTREGA: ${salida.entrega?.nombre||salida.entrega?.usuario||''}`,cols).forEach(lf);lf('');ticketLines(`RECIBE: ${salida.recibe||''}`,cols).forEach(lf);lf('');push(27,97,1);push(27,69,1);lf('*** SALIDA REGISTRADA ***');push(27,69,0);push(27,97,0);
  for(let i=0;i<Math.max(2,Math.min(8,Number(cfg.feedLines)||4));i++)lf(''); if(cfg.partialCut!==false)push(29,86,66,0); return new Uint8Array(bytes)
}
function buildEscPos58TextPreview(salida){
  const cols=printerConfigRead().charsPerLine||32,lines=[];const lf=t=>lines.push(asciiTicket(t||'')),rule=()=>lf('-'.repeat(cols));lf(centerTicket('[LOGO PROVEEDORA]',cols));lf(centerTicket('SALIDA ABARROTES PDD',cols));lf(centerTicket('PROVSOFT',cols));rule();ticketLines(`FOLIO: ${salida.folio}`,cols).forEach(lf);lf(`FECHA: ${salida.fechaCapturaTxt||salida.fechaCaptura||''}`);lf(`HORA: ${salida.horaLocal||''}`);ticketLines(`DESTINO: ${salida.destino||''}`,cols).forEach(lf);ticketLines(`ENTREGA: ${salida.entrega?.nombre||salida.entrega?.usuario||''}`,cols).forEach(lf);ticketLines(`RECIBE: ${salida.recibe||''}`,cols).forEach(lf);rule();lf('PARTIDAS');rule();for(const x of salida.partidas||[]){ticketLines(`${x.renglon}. ${x.descripcion}`,cols).forEach(lf);ticketLines(`COD: ${x.codigo}`,cols).forEach(lf);const cajas=x.cajasSalieron!=null&&x.cantidadPorCaja!=null?`${x.cajasSalieron} cj x ${x.cantidadPorCaja} = `:'';ticketLines(`${cajas}${x.cantidad} PZAS`,cols).forEach(lf);lf('')}rule();lf(`PARTIDAS: ${salida.totalPartidas}`);lf(`UNIDADES: ${salida.totalUnidades}`);rule();ticketLines(`ENTREGA: ${salida.entrega?.nombre||salida.entrega?.usuario||''}`,cols).forEach(lf);lf('');ticketLines(`RECIBE: ${salida.recibe||''}`,cols).forEach(lf);lf('');lf(centerTicket('*** SALIDA REGISTRADA ***',cols));return lines.join('\n')
}
function uint8ToBase64(u8){let bin='';const step=0x8000;for(let i=0;i<u8.length;i+=step)bin+=String.fromCharCode(...u8.subarray(i,i+step));return btoa(bin)}
function getNativePrinterBridge(){
  if(window.ProvsoftAndroidPrinter&&typeof window.ProvsoftAndroidPrinter.printBase64==='function')return{type:'javascript-interface',api:window.ProvsoftAndroidPrinter};
  const cap=window.Capacitor?.Plugins?.ProvsoftPrinter;if(cap&&typeof cap.print==='function')return{type:'capacitor',api:cap};return null
}
async function printSalida58(salida,{test=false}={}){
  const cfg=printerConfigRead(),bytes=buildEscPos58Bytes(salida,cfg),dataBase64=uint8ToBase64(bytes),bridge=getNativePrinterBridge();
  if(!bridge)return{ok:false,native:false,reason:'NO_NATIVE_BRIDGE',bytes:dataBase64,preview:buildEscPos58TextPreview(salida)};
  try{let result;if(bridge.type==='javascript-interface'){result=bridge.api.printBase64(dataBase64,JSON.stringify({paperMm:58,protocol:'ESC/POS',test,folio:salida.folio||'PRUEBA'}));if(result&&typeof result.then==='function')result=await result}else result=await bridge.api.print({dataBase64,paperMm:58,protocol:'ESC/POS',test,folio:salida.folio||'PRUEBA'});return{ok:result?.ok!==false,native:true,bridge:bridge.type,result}}catch(error){console.error('[IMPRESORA 58MM]',error);return{ok:false,native:true,bridge:bridge.type,reason:'PRINT_ERROR',error:String(error?.message||error)}}
}
function printerTestSalida(){const now=new Date();return{folio:'PRUEBA-58MM',fechaCapturaTxt:now.toLocaleDateString('es-MX'),horaLocal:now.toLocaleTimeString('es-MX'),destino:'PRUEBA DE IMPRESORA',entrega:{nombre:S.user?.nombre||S.user?.usuario||'PROVSOFT'},recibe:'PRUEBA',partidas:[{renglon:1,codigo:'7501234567890',descripcion:'PRODUCTO DE PRUEBA IMPRESION TERMICA 58 MM',cantidad:2,cajasSalieron:1,cantidadPorCaja:2},{renglon:2,codigo:'ABC-002',descripcion:'SEGUNDO PRODUCTO PARA VALIDAR CORTE DE LINEA',cantidad:3}],totalPartidas:2,totalUnidades:5}}
async function printerConfigModal(){
  const cfg=printerConfigRead(),bridge=getNativePrinterBridge();open(`<h2>Impresora térmica</h2><p><b>Perfil fijo:</b> 58 mm · ESC/POS</p><div class="review-note">La PWA ya genera el ticket ESC/POS de 58 mm con el logo de PROVEEDORA. La conexión Bluetooth directa se activará al instalar el puente nativo Android.</div><label>Caracteres por línea</label><select id="printerCols" class="field"><option value="32" ${Number(cfg.charsPerLine)===32?'selected':''}>32 (recomendado 58 mm)</option><option value="30" ${Number(cfg.charsPerLine)===30?'selected':''}>30</option><option value="42" ${Number(cfg.charsPerLine)===42?'selected':''}>42 (fuente compacta)</option></select><label><input id="printerAuto" type="checkbox" ${cfg.autoPrint!==false?'checked':''}> Imprimir automáticamente al finalizar salida</label><label><input id="printerCut" type="checkbox" ${cfg.partialCut!==false?'checked':''}> Enviar comando de corte parcial</label><p><small>Puente Android: <b>${bridge?'DETECTADO':'AÚN NO INSTALADO (PWA)'}</b></small></p><div class="final-actions"><button id="printerPreview" class="secondary">VER TICKET DE PRUEBA</button><button id="printerTest" class="primary">IMPRIMIR PRUEBA</button></div><button id="printerSave" class="primary sticky-modal-btn">GUARDAR CONFIGURACIÓN</button>`);
  const saveCfg=()=>printerConfigWrite({charsPerLine:Number($('printerCols').value)||32,autoPrint:$('printerAuto').checked,partialCut:$('printerCut').checked});
  $('printerSave').onclick=()=>{saveCfg();close();toast('Configuración 58 mm guardada')};$('printerPreview').onclick=()=>{saveCfg();const t=buildEscPos58TextPreview(printerTestSalida());open(`<h2>Vista previa 58 mm</h2><pre style="white-space:pre-wrap;font:14px/1.25 monospace;background:#f6f6f6;padding:14px;border-radius:12px;overflow:auto">${esc(t)}</pre><button id="x" class="secondary sticky-modal-btn">Cerrar</button>`);$('x').onclick=close};$('printerTest').onclick=async()=>{saveCfg();const r=await printSalida58(printerTestSalida(),{test:true});if(r.ok)return alert('Ticket de prueba enviado a la impresora.');if(!r.native)return alert('El ticket ESC/POS de 58 mm ya se genera correctamente.\n\nEn esta PWA todavía no existe el puente Android Bluetooth. Al convertirla a APK, este mismo botón imprimirá directamente.');alert('Android recibió la orden, pero la impresión falló: '+(r.error||r.reason||'error desconocido'))}
}
window.PROVSOFT_ESC_POS_58={buildBytes:buildEscPos58Bytes,buildPreview:buildEscPos58TextPreview,print:printSalida58,getConfig:printerConfigRead};

function openPdfWindowNow(){
  // Se abre DENTRO del toque de FINALIZAR para que Android/Chrome no lo bloquee.
  // El PDF real se coloca después, cuando jsPDF ya terminó de cargar/generar.
  const w=window.open('about:blank','_blank');
  if(w){
    try{
      w.document.open();
      w.document.write('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparando comprobante</title><style>body{font-family:system-ui;padding:24px;text-align:center}small{color:#666}</style></head><body><h3>Preparando comprobante PDF…</h3><small>Enseguida podrás usar Imprimir desde el visor.</small></body></html>');
      w.document.close();
    }catch{}
  }
  return w;
}
async function openSalidaPdfForPrint(salida,pdfWindow){
  try{
    const blob=makePdf(salida);
    const url=URL.createObjectURL(blob);
    if(pdfWindow && !pdfWindow.closed){
      pdfWindow.location.replace(url);
    }else{
      // Respaldo si el navegador cerró/bloqueó la ventana preparada.
      window.open(url,'_blank');
    }
    setTimeout(()=>URL.revokeObjectURL(url),5*60*1000);
    return true;
  }catch(e){
    console.error('[PDF IMPRESION]',e);
    if(pdfWindow && !pdfWindow.closed){
      try{
        pdfWindow.document.open();
        pdfWindow.document.write('<!doctype html><html><body style="font-family:system-ui;padding:24px"><h3>No se pudo generar el PDF.</h3><p>La salida quedó guardada localmente y seguirá intentando sincronizarse.</p></body></html>');
        pdfWindow.document.close();
      }catch{}
    }
    return false;
  }
}
async function syncPendingSalidas(){
  if(syncingPendingSalidas)return;const pendientes=pendingSalidasRead();if(!pendientes.length)return;
  syncingPendingSalidas=true;
  try{
    await ensureOnlineStack(15000);
    for(const salidaLocal of pendingSalidasRead()){
      try{
        const salidaFire={...salidaLocal,creadoEn:serverTimestamp()};
        await setDoc(doc(db,...R.salidas,salidaLocal.folio),salidaFire);
        removePendingSalida(salidaLocal.folio); // Firestore ya confirmo; auxiliares no bloquean la salida.
        // V30: el catálogo ya viene directamente de /productos activo=true; no se escribe catalogo_operativo.
        try{
          const pdfBlob=makePdf(salidaLocal),pdfName=`${salidaLocal.folio}.pdf`;
          const msg=`Salida registrada\n${salidaLocal.folio}\nFecha de captura: ${salidaLocal.fechaCapturaTxt||salidaLocal.fechaCaptura}\nEntrega: ${salidaLocal.entrega?.nombre||salidaLocal.entrega?.usuario||''}\nRecibe: ${salidaLocal.recibe}\nDestino: ${salidaLocal.destino}\n${salidaLocal.totalPartidas} partidas | ${salidaLocal.totalUnidades} unidades`;
          Promise.allSettled([telegramMessage(msg),telegramPdf(pdfBlob,pdfName,`Salida ${salidaLocal.folio}`)]).catch(()=>{});
        }catch(e){console.warn('[PDF/TELEGRAM]',e)}
        console.info('[SALIDA SINCRONIZADA]',salidaLocal.folio);
      }catch(e){console.warn('[SALIDA PENDIENTE] Se reintentara:',salidaLocal.folio,e);break}
    }
  }catch(e){console.warn('[SYNC SALIDAS] Firebase no disponible; se conserva la cola local.',e)}
  finally{syncingPendingSalidas=false}
}
window.addEventListener('online',()=>syncPendingSalidas());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncPendingSalidas()});



const FIXED_USER_DOC='juan-021939';
const ENTRY={photos:[],busy:false};
const isMobileDevice=()=>/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||matchMedia('(pointer:coarse)').matches;

async function loadFixedUser(force=false){
  const cached=await cacheGet('fixedUser');
  if(!force&&cacheFresh(cached,AUX_TTL_MS.fixedUser)&&cached?.value){S.user=cached.value}
  else{
    try{
      await ensureOnlineStack();
      const snap=await getDoc(doc(db,...R.users,FIXED_USER_DOC));
      if(!snap.exists())throw new Error(`No existe el usuario fijo ${FIXED_USER_DOC}`);
      const u=snap.data();if(u.activo===false)throw new Error('El usuario JUAN está inactivo.');
      S.user={id:snap.id,...u};await cachePut('fixedUser',S.user);
    }catch(e){console.warn('[USUARIO FIJO] usando respaldo local.',e);S.user=cached?.value||{id:FIXED_USER_DOC,usuario:'JUAN',nombre:'JUAN PEREZ',rol:'OPERADOR'}}
  }
  const name=S.user.nombre||S.user.usuario||'JUAN';
  $('sesionTxt').textContent=name;$('entryUserTxt').textContent=name;$('modeUser').textContent=`Usuario: ${name}`;
}

function showModeGate(){
  diag('PANTALLA','MENÚ ENTRADA/SALIDA');
  close();
  $('menu').classList.add('hidden');
  $('app').classList.add('hidden');
  $('entryApp').classList.add('hidden');
  $('modeGate').classList.remove('hidden');
}

async function enterSalida(){
  diag('ENTRAR SALIDA','inicio');
  $('modeGate').classList.add('hidden');
  showLoad('Preparando catálogo para salidas...');
  try{
    if(!S.masterReady||!S.inventoryReady)await Promise.all([loadActiveProducts(),loadInventory({boot:true})]);
    hideLoad();$('app').classList.remove('hidden');
    await askCaptureDate();
  }catch(e){console.error(e);hideLoad();alert('No fue posible preparar el módulo de salidas.');showModeGate()}
}

function resetEntry(){
  ENTRY.photos.forEach(x=>{try{URL.revokeObjectURL(x.preview)}catch{}});
  ENTRY.photos=[];ENTRY.busy=false;
  if($('entryPhotoInput'))$('entryPhotoInput').value='';
  renderEntryPhotos();
  if($('entryStatus')){$('entryStatus').textContent='';$('entryStatus').classList.remove('error')}
}

function enterEntrada(){
  diag('ENTRAR ENTRADA','inicio');
  $('modeGate').classList.add('hidden');$('app').classList.add('hidden');$('entryApp').classList.remove('hidden');
  resetEntry();
  const mobile=isMobileDevice(),input=$('entryPhotoInput');
  if(mobile){input.setAttribute('capture','environment');input.removeAttribute('multiple');$('entryPhotoBtn').textContent='📷 TOMAR FOTO';$('entryHelp').textContent='Toma una foto ahora. Puedes agregar más antes de guardar la entrada.'}
  else{input.removeAttribute('capture');input.setAttribute('multiple','');$('entryPhotoBtn').textContent='🖼️ SELECCIONAR FOTO(S)';$('entryHelp').textContent='Selecciona una o varias fotografías. Todas quedarán agrupadas en una sola entrada.'}
}

async function compressEntryImage(file){
  // Compatibilidad Android/Motorola: algunos WebView/Chrome no exponen createImageBitmap
  // correctamente para fotos tomadas desde <input capture>.
  let source,width,height,cleanup=()=>{};
  if(typeof createImageBitmap==='function'){
    try{
      const bitmap=await createImageBitmap(file);source=bitmap;width=bitmap.width;height=bitmap.height;cleanup=()=>bitmap.close?.();
    }catch(e){console.warn('[FOTO] createImageBitmap no disponible para esta imagen, usando fallback.',e)}
  }
  if(!source){
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(new Error('No se pudo leer la fotografía.'));x.src=url});
      source=img;width=img.naturalWidth||img.width;height=img.naturalHeight||img.height;
    }finally{cleanup=()=>URL.revokeObjectURL(url)}
  }
  try{
    const maxSide=1800,scale=Math.min(1,maxSide/Math.max(width,height));
    const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(source,0,0,w,h);
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo comprimir la imagen.')),'image/jpeg',.84));
  }finally{cleanup()}
}

async function addEntryFiles(files){
  if(ENTRY.busy)return;
  const list=[...files].filter(f=>String(f.type||'').startsWith('image/'));
  if(!list.length)return alert('Selecciona o toma una fotografía válida.');
  ENTRY.busy=true;$('entryPhotoBtn').disabled=true;$('entryStatus').textContent='Optimizando fotografía...';
  try{
    for(const f of list){
      const blob=await compressEntryImage(f),preview=URL.createObjectURL(blob);
      ENTRY.photos.push({blob,preview,originalName:f.name||'foto.jpg'});
    }
    renderEntryPhotos();$('entryStatus').textContent=`${ENTRY.photos.length} foto(s) lista(s) para guardar.`;
  }catch(e){console.error(e);$('entryStatus').textContent='No se pudo procesar la fotografía.';$('entryStatus').classList.add('error')}
  finally{ENTRY.busy=false;$('entryPhotoBtn').disabled=false;$('entryPhotoInput').value=''}
}

function renderEntryPhotos(){
  const box=$('entryPhotos');if(!box)return;
  if(!ENTRY.photos.length){box.innerHTML='<div class="empty">Aún no hay fotografías</div>';$('entrySave').disabled=true;return}
  box.innerHTML=ENTRY.photos.map((x,i)=>`<article class="entry-photo"><img src="${x.preview}" alt="Foto ${i+1} de la entrada"><footer><b>Foto ${i+1}</b><button type="button" data-entry-remove="${i}">QUITAR</button></footer></article>`).join('');
  box.querySelectorAll('[data-entry-remove]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.entryRemove),[x]=ENTRY.photos.splice(i,1);if(x)URL.revokeObjectURL(x.preview);renderEntryPhotos();$('entryStatus').textContent=ENTRY.photos.length?`${ENTRY.photos.length} foto(s) lista(s) para guardar.`:''});
  $('entrySave').disabled=false;
}

function localParts(d){return {y:d.getFullYear(),m:String(d.getMonth()+1).padStart(2,'0'),day:String(d.getDate()).padStart(2,'0'),hh:String(d.getHours()).padStart(2,'0'),mm:String(d.getMinutes()).padStart(2,'0'),ss:String(d.getSeconds()).padStart(2,'0')}}
async function saveEntry(){
  await ensureOnlineStack();
  diag('GUARDAR ENTRADA',`fotos=${ENTRY.photos.length} busy=${ENTRY.busy}`);
  if(ENTRY.busy||!ENTRY.photos.length)return;
  ENTRY.busy=true;$('entrySave').disabled=true;$('entryPhotoBtn').disabled=true;$('entryCancel').disabled=true;$('entryBack').disabled=true;
  const now=new Date(),t=localParts(now),stamp=`${t.y}${t.m}${t.day}_${t.hh}${t.mm}${t.ss}`,safeUser=String(S.user?.usuario||'JUAN').replace(/[^A-Z0-9_-]/gi,'').toUpperCase()||'JUAN';
  const entryId=`ENT-${stamp}-${safeUser}`;
  $('entryStatus').classList.remove('error');$('entryStatus').textContent=`Subiendo ${ENTRY.photos.length} foto(s)...`;
  const uploaded=[];
  try{
    for(let i=0;i<ENTRY.photos.length;i++){
      $('entryStatus').textContent=`Subiendo foto ${i+1} de ${ENTRY.photos.length}...`;
      const path=`fotobodega/abarrotespdd/${t.y}/${t.m}/${entryId}/foto_${String(i+1).padStart(2,'0')}.jpg`;
      const r=storageRef(storage,path);
      await uploadBytes(r,ENTRY.photos[i].blob,{contentType:'image/jpeg',customMetadata:{entradaId:entryId,usuario:safeUser}});
      const url=await getDownloadURL(r);
      uploaded.push({numero:i+1,storagePath:path,url,tamanoBytes:ENTRY.photos[i].blob.size});
    }
    await setDoc(doc(db,...R.entradasFoto,entryId),{
      entradaId:entryId,usuario:S.user?.usuario||'JUAN',usuarioId:S.user?.id||FIXED_USER_DOC,nombreUsuario:S.user?.nombre||'',
      fechaLocal:`${t.y}-${t.m}-${t.day}`,horaLocal:`${t.hh}:${t.mm}:${t.ss}`,fechaHoraLocal:`${t.y}-${t.m}-${t.day}T${t.hh}:${t.mm}:${t.ss}`,
      creadoEn:serverTimestamp(),cantidadFotos:uploaded.length,fotos:uploaded,tipo:'FOTO_BODEGA'
    });
    alert(`Entrada registrada correctamente\n${uploaded.length} foto(s) guardada(s)`);resetEntry();showModeGate();
  }catch(e){
    console.error('[ENTRADA FOTO]',e);
    const code=String(e?.code||'');
    let msg='No se pudo completar la entrada. Revisa conexión/permisos e intenta nuevamente.';
    if(code.includes('storage/unauthorized'))msg='Storage rechazó la subida por permisos.';
    else if(code.includes('permission-denied'))msg='Firestore rechazó el registro por permisos.';
    else if(code.includes('storage/unknown'))msg='Firebase Storage devolvió un error desconocido.';
    else if(code.includes('storage/retry-limit-exceeded'))msg='La subida tardó demasiado. Revisa la conexión e intenta nuevamente.';
    else if(code.includes('storage/canceled'))msg='La subida fue cancelada.';
    const detail=[code,e?.message].filter(Boolean).join(' — ');
    if(detail)msg+=`\n${detail}`;
    $('entryStatus').textContent=msg;$('entryStatus').classList.add('error');
  }finally{ENTRY.busy=false;$('entryPhotoBtn').disabled=false;$('entryCancel').disabled=false;$('entryBack').disabled=false;$('entrySave').disabled=!ENTRY.photos.length}
}

async function loadConfig(force=false){
  const cached=await cacheGet('config');
  if(!force&&cacheFresh(cached,AUX_TTL_MS.config)&&cached?.value){S.config={...S.config,...cached.value};return S.config}
  try{await ensureOnlineStack();const snap=await getDoc(doc(db,...R.cfg));if(snap.exists()){S.config={...S.config,...snap.data()};await cachePut('config',S.config)}}
  catch(e){console.warn('No se pudo leer configuración en línea:',e);if(cached?.value)S.config={...S.config,...cached.value}}
  return S.config;
}

async function saveConfig(){
  await ensureOnlineStack();await setDoc(doc(db,...R.cfg),{...S.config,actualizadoEn:serverTimestamp()},{merge:true})}

async function loadDestinos(force=false){
  const cached=await cacheGet('destinos');
  if(!force&&cacheFresh(cached,AUX_TTL_MS.config)&&Array.isArray(cached?.value)){
    S.destinos=cached.value;return S.destinos;
  }
  try{
    await ensureOnlineStack();
    const snap=await getDocs(collection(db,...R.destinos));
    const list=[];
    snap.forEach(item=>{
      const x=item.data()||{};
      if(x.activo===false)return;
      const nombre=String(x.nombre||item.id||'').trim();
      if(!nombre)return;
      list.push({id:item.id,nombre,direccion:String(x.direccion||'').trim(),colonia:String(x.colonia||'').trim(),ciudad:String(x.ciudad||'').trim(),estado:String(x.estado||'').trim(),codigo_postal:String(x.codigo_postal||x.codigoPostal||'').trim(),telefono:String(x.telefono||'').trim()});
    });
    list.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    S.destinos=list;await cachePut('destinos',list);
  }catch(e){
    console.warn('[DESTINOS] No se pudo consultar Firebase; usando respaldo local.',e);
    if(Array.isArray(cached?.value))S.destinos=cached.value;
  }
  return S.destinos;
}

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

async function loadEmployees(force=false){
  const cached=await cacheGet('employees');
  if(!force&&cacheFresh(cached,AUX_TTL_MS.employees)&&Array.isArray(cached?.value)){
    S.empleados=cached.value;return S.empleados;
  }
  try{
    await ensureOnlineStack();
    const snap=await getDocs(query(collection(db,...R.empleados),where('activo','==',true)));
    S.empleados=snap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>RECEIVER_BRANCHES.has(norm(e.sucursal))).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
    await cachePut('employees',S.empleados);return S.empleados;
  }catch(e){console.warn('[EMPLEADOS] usando respaldo local:',e);S.empleados=Array.isArray(cached?.value)?cached.value:[];if(S.empleados.length)return S.empleados;throw e}
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
async function askDestination(){
  open(`<h2>¿Hacia dónde va?</h2><p id="destStatus">Consultando destinos en Firebase...</p><div id="destinationCards" class="destination-cards"></div><button id="reloadDestinations" class="secondary" style="margin-top:12px">ACTUALIZAR DESTINOS</button>`);
  const paint=()=>{
    const box=$('destinationCards'),status=$('destStatus');if(!box)return;
    const list=S.destinos||[];
    status.textContent=list.length?'Selecciona el destino de la mercancía.':'No hay destinos activos configurados.';
    box.innerHTML=list.map((x,i)=>`<button type="button" class="destination-card" data-destination="${i}"><b>${esc(x.nombre)}</b></button>`).join('');
    [...box.querySelectorAll('.destination-card')].forEach(btn=>btn.onclick=async()=>{const x=list[Number(btn.dataset.destination)];if(!x)return;S.destino=x.nombre;S.destinoDetalle={...x};close();if(!S.inventoryReady)await loadInventory();else {$('scanInput').focus();toast(`Destino: ${x.nombre}`)}});
  };
  try{await loadDestinos(true)}catch(e){console.warn(e)}
  paint();
  $('reloadDestinations').onclick=async()=>{$('reloadDestinations').disabled=true;$('destStatus').textContent='Actualizando destinos...';await loadDestinos(true);paint();if($('reloadDestinations'))$('reloadDestinations').disabled=false};
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
  await ensureOnlineStack();
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
  await ensureOnlineStack();
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
  // V30: ya NO se construye el catálogo leyendo inventario físico ni movimientos.
  // El único catálogo operativo es /productos con activo=true, previamente cacheado.
  const boot=options.boot===true;
  if(!S.masterReady||!S.masterProducts.length){
    const ok=await loadActiveProducts();
    if(!ok)return false;
  }
  S.catalog=S.masterProducts.filter(p=>!S.blockedCodes.has(String(p.codigo))).map(p=>({...p}));
  rebuildCatalogIndex();
  S.inventoryReady=S.catalog.length>0;
  await cachePut('inventoryCatalog',{inventarioId:'PRODUCTOS_ACTIVOS',catalog:S.catalog});
  if(!boot){
    showLoad('Abriendo catálogo local...');
    $('loadingText').textContent=`Catálogo listo (${S.catalog.length.toLocaleString('es-MX')} productos activos).`;
    setTimeout(()=>{hideLoad();$('scanInput').focus()},250);
  }
  return S.inventoryReady;
}

async function loadBlockedCodes(force=false){
  const cached=await cacheGet('blockedCodes');
  const local=Array.isArray(cached?.value)?cached.value:[];S.blockedCodes=new Set(local.map(v=>String(v).trim()).filter(Boolean));
  if(!force&&cacheFresh(cached,AUX_TTL_MS.blockedCodes))return S.blockedCodes;
  try{await ensureOnlineStack();const snap=await getDocs(collection(db,...R.catalogoBloqueados));const all=new Set(S.blockedCodes);snap.forEach(d=>{const x=d.data()||{};if(x.activo!==false)all.add(String(x.codigo||d.id).trim())});S.blockedCodes=all;await cachePut('blockedCodes',[...all])}
  catch(e){console.info('[BLOQUEOS] Usando lista local.',e?.message||e)}
  return S.blockedCodes;
}

function applyMasterAsCatalog(){
  S.catalog=S.masterProducts.filter(p=>!S.blockedCodes.has(String(p.codigo))).map(p=>({...p}));
  rebuildCatalogIndex();
  S.inventoryReady=S.catalog.length>0;
}

async function persistCurrentCatalog(){
  await cachePut('masterProducts',S.masterProducts);
  applyMasterAsCatalog();
  await cachePut('inventoryCatalog',{inventarioId:'PRODUCTOS_ACTIVOS',catalog:S.catalog});
}

async function blockCatalogCode(code,motivo='DEPURACION'){
  code=String(code||'').trim();
  if(!code)throw new Error('Código vacío.');
  S.blockedCodes.add(code);
  await cachePut('blockedCodes',[...S.blockedCodes]);
  S.masterProducts=S.masterProducts.filter(p=>String(p.codigo)!==code && !(p.codigosEquivalentes||[]).includes(code));
  // No borramos el maestro remoto: sólo se bloquea en esta app hasta la depuración definitiva.
  applyMasterAsCatalog();
  await cachePut('masterProducts',S.masterProducts);
  await cachePut('inventoryCatalog',{inventarioId:'PRODUCTOS_ACTIVOS',catalog:S.catalog});
  try{
    await ensureOnlineStack();
    await setDoc(doc(db,...R.catalogoBloqueados,code),{
      codigo:code,motivo:String(motivo||'DEPURACION').trim(),activo:true,
      origen:'SALIDA_ABARROTES_PDD',creadoPor:S.user?.usuario||S.user?.nombre||'APP',actualizadoEn:serverTimestamp()
    },{merge:true});
  }catch(e){console.warn('[BLOQUEOS] Bloqueo local guardado; Firebase pendiente:',e)}
  return true;
}

function blockedCodesModal(){
  const rows=[...S.blockedCodes].sort().slice(-80).reverse();
  open(`<h2>Depurar catálogo</h2>
    <p class="catalog-extra-note">Captura códigos que ya no deben aparecer en esta app. Se bloquean de inmediato y quedan registrados para depurar después el catálogo maestro.</p>
    <label>Código a bloquear</label><input id="blockCode" class="field" inputmode="text" autocomplete="off" placeholder="Escanea o escribe el código">
    <label>Motivo</label><input id="blockReason" class="field" autocomplete="off" value="DEPURACION" placeholder="Motivo">
    <button id="saveBlockCode" class="primary" style="margin-top:12px">BLOQUEAR CÓDIGO</button>
    <div class="match-hint" style="margin-top:14px">Bloqueados locales: ${S.blockedCodes.size.toLocaleString('es-MX')}</div>
    <div class="results">${rows.length?rows.map(c=>`<div class="result"><b>${esc(c)}</b><small>BLOQUEADO EN LA APP</small></div>`).join(''):'<div class="noresult">Todavía no hay códigos bloqueados.</div>'}</div>
    <button id="closeBlockCodes" class="secondary">Cerrar</button>`);
  $('closeBlockCodes').onclick=close;
  $('saveBlockCode').onclick=async()=>{
    const code=$('blockCode').value.trim(),motivo=$('blockReason').value.trim();
    if(!code)return alert('Captura un código.');
    $('saveBlockCode').disabled=true;
    try{await blockCatalogCode(code,motivo);toast(`Código ${code} bloqueado`);blockedCodesModal()}catch(e){alert(e.message||'No se pudo bloquear.');$('saveBlockCode').disabled=false}
  };
  setTimeout(()=>$('blockCode')?.focus(),100);
}

async function syncCatalogDelta(options={}){
  if(catalogSyncPromise)return catalogSyncPromise;
  catalogSyncPromise=(async()=>{
    const meta=await cacheGet('offlineMeta');
    const since=Number(meta?.value?.deltaAt||meta?.value?.updatedAt||0);
    if(!since)return {updated:0};
    try{
      await ensureOnlineStack();
      // Margen de 2 s para evitar perder escrituras con la misma marca de tiempo.
      const qSince=Math.max(0,since-2000);
      const snap=await getDocs(query(collection(db,...R.productos),where('actualizadoEn','>',new Date(qSince))));
      const map=new Map(S.masterProducts.map(p=>[String(p.codigo),p]));
      let changed=0,maxServerMs=since;
      snap.forEach(d=>{
        const x=d.data()||{};const codigo=String(x.codigoBarra||x.codigo||d.id||'').trim();if(!codigo)return;
        const ts=x.actualizadoEn;const ms=typeof ts?.toMillis==='function'?ts.toMillis():(ts?.seconds?ts.seconds*1000:0);if(ms>maxServerMs)maxServerMs=ms;
        if(x.activo!==true){if(map.delete(codigo))changed++;return}
        const p={codigo,codigoBarra:codigo,descripcion:String(x.concepto||x.descripcion||'SIN DESCRIPCIÓN').trim(),concepto:String(x.concepto||x.descripcion||'SIN DESCRIPCIÓN').trim(),precioPublico:x.precioPublico??null,cantidadPorCaja:x.cantidadPorCaja??null,codigosEquivalentes:Array.isArray(x.codigosEquivalentes)?x.codigosEquivalentes.map(v=>String(v).trim()).filter(Boolean):[],activo:true,_raw:x};
        const prev=map.get(codigo);map.set(codigo,p);if(!prev||JSON.stringify(prev._raw||{})!==JSON.stringify(x))changed++;
      });
      if(changed){S.masterProducts=[...map.values()].sort((a,b)=>a.descripcion.localeCompare(b.descripcion,'es'));S.masterByCode.clear();S.productInfo.clear();for(const p of S.masterProducts){S.masterByCode.set(p.codigo,p);(p.codigosEquivalentes||[]).forEach(c=>S.masterByCode.set(c,p));S.productInfo.set(p.codigo,p._raw||{})}S.masterReady=true;await persistCurrentCatalog();toast(`${changed} cambio(s) de catálogo aplicados`)}
      await cachePut('offlineMeta',{...(meta?.value||{}),deltaAt:maxServerMs||Date.now(),lastDeltaCheckAt:Date.now()});
      return {updated:changed};
    }catch(e){console.info('[CATÁLOGO DELTA] No se pudo sincronizar:',e?.message||e);return {updated:0,error:e}}
  })().finally(()=>{catalogSyncPromise=null});
  return catalogSyncPromise;
}

function scheduleCatalogDelta(reason='version'){
  if(catalogDebounceTimer)clearTimeout(catalogDebounceTimer);
  catalogDebounceTimer=setTimeout(()=>{catalogDebounceTimer=null;syncCatalogDelta({reason})},CATALOG_DEBOUNCE_MS);
}

async function startCatalogVersionWatcher(){
  if(catalogVersionUnsubscribe||catalogWatcherStarting||!S.masterReady)return;
  catalogWatcherStarting=true;
  try{
    await ensureOnlineStack();
    let first=true;
    catalogVersionUnsubscribe=onSnapshot(doc(db,...R.catalogVersion),async snap=>{
      const data=snap.exists()?snap.data()||{}:{};
      const version=Number(data.version||0);const rec=await cacheGet('catalogVersion');const localVersion=Number(rec?.value?.version||0);
      if(first){first=false;await cachePut('catalogVersion',{version,seenAt:Date.now()});if(version>localVersion&&localVersion>0)scheduleCatalogDelta('version-start');return}
      if(version!==localVersion){await cachePut('catalogVersion',{version,seenAt:Date.now()});scheduleCatalogDelta('version-change')}
    },err=>{console.warn('[CATÁLOGO CENTINELA] listener detenido:',err?.message||err);catalogVersionUnsubscribe=null});
    console.info('[CATÁLOGO CENTINELA] escuchando un solo documento de versión.');
  }catch(e){console.info('[CATÁLOGO CENTINELA] no disponible:',e?.message||e)}
  finally{catalogWatcherStarting=false}
}

async function manualCatalogUpdate(){
  $('menu').classList.add('hidden');showLoad('Buscando cambios de catálogo...');
  try{
    const r=await syncCatalogDelta({reason:'manual'});
    await Promise.allSettled([loadBlockedCodes(true),loadEmployees(true),loadFixedUser(true)]);
    hideLoad();
    if(r?.error)alert('No fue posible revisar Firebase. Se conserva el catálogo local.');
    else alert(r.updated?`Catálogo actualizado.\nCambios aplicados: ${r.updated}`:'Catálogo actualizado.\nNo hay cambios pendientes.');
  }catch(e){hideLoad();alert('No fue posible actualizar en este momento. Se conserva el catálogo local.')}
}

async function loadActiveProducts(){
  await ensureOnlineStack();
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
    await cachePut('masterProducts',list);
    applyMasterAsCatalog();
    await cachePut('inventoryCatalog',{inventarioId:'PRODUCTOS_ACTIVOS',catalog:S.catalog});
    setBootStatus(`${S.catalog.length.toLocaleString('es-MX')} productos activos cargados...`);
    return true;
  }catch(e){
    console.warn('[PRODUCTOS] Sin red; intentando catálogo maestro offline:',e);
    const c=await cacheGet('masterProducts');
    const list=Array.isArray(c?.value)?c.value:[];
    S.masterProducts=list;S.masterByCode.clear();
    for(const p of list){S.masterByCode.set(p.codigo,p);(p.codigosEquivalentes||[]).forEach(code=>S.masterByCode.set(code,p));S.productInfo.set(p.codigo,p._raw||{})}
    S.masterReady=list.length>0;if(c?.updatedAt)S.offlineCatalogAt=c.updatedAt;
    if(S.masterReady){applyMasterAsCatalog();setBootStatus(`${S.catalog.length.toLocaleString('es-MX')} productos cargados desde respaldo offline.`);return true}
    return false;
  }
}

async function downloadOfflineCatalog(options={}){
  const startup=options.startup===true;
  $('menu').classList.add('hidden');
  showLoad('Preparando catálogo de productos...');
  try{await ensureOnlineStack(15000)}catch(e){
    console.warn('[RED] Servicios en línea no disponibles:',e);
    if(startup){setBootStatus('NO SE PUDO CONECTAR');$('bootHint').textContent='Los catálogos locales siguen protegidos. Reintenta con Wi‑Fi o datos móviles cuando haya respuesta.';$('catalogPrepareBtn').classList.remove('hidden');$('catalogRetryBtn').classList.remove('hidden');return false}
    hideLoad();alert('No fue posible conectar con Firebase en este momento. Intenta nuevamente.');return false;
  }
  showLoad('Descargando productos activos para uso offline...');
  $('catalogPrepareBtn')?.classList.add('hidden');$('catalogRetryBtn')?.classList.add('hidden');
  try{
    setBootStatus('1/3 Cargando bloqueos...');
    await loadBlockedCodes();
    setBootStatus('2/3 Descargando productos con activo = true...');
    const a=await loadActiveProducts();
    setBootStatus('3/3 Guardando configuración auxiliar...');
    await Promise.allSettled([loadEmployees(),loadFixedUser()]);
    const meta={updatedAt:Date.now(),deltaAt:Date.now(),masterCount:S.masterProducts.length,inventoryCount:S.catalog.length,inventarioId:'PRODUCTOS_ACTIVOS'};
    if(!(a&&meta.inventoryCount>0))throw new Error('La descarga quedó incompleta.');
    await cachePut('offlineMeta',meta);
    setBootStatus('Catálogo de productos listo para trabajar offline.');
    $('bootHint').textContent=`${meta.inventoryCount.toLocaleString('es-MX')} productos activos · ${S.blockedCodes.size.toLocaleString('es-MX')} bloqueados`;
    startCatalogVersionWatcher();
    if(startup){await new Promise(r=>setTimeout(r,350));hideLoad();showModeGate()}
    else{setTimeout(()=>hideLoad(),250);alert(`Catálogo offline actualizado correctamente.\n\nProductos activos disponibles: ${meta.inventoryCount.toLocaleString('es-MX')}\nCódigos bloqueados: ${S.blockedCodes.size.toLocaleString('es-MX')}`)}
    return true;
  }catch(e){
    console.error('[OFFLINE DOWNLOAD]',e);
    if(startup){setBootStatus('NO SE COMPLETÓ LA DESCARGA');$('bootHint').textContent='La aplicación permanecerá bloqueada hasta que ambos catálogos estén completos.';$('catalogPrepareBtn').classList.remove('hidden');$('catalogRetryBtn').classList.remove('hidden')}
    else{hideLoad();alert('No se pudo completar la descarga offline. Revisa la conexión e intenta nuevamente.')}
    return false;
  }
}





async function loadRequiredCatalogsFromCache(){
  const [master,blocks,meta]=await Promise.all([cacheGet('masterProducts'),cacheGet('blockedCodes'),cacheGet('offlineMeta')]);
  const masterList=Array.isArray(master?.value)?master.value:[];
  S.blockedCodes=new Set((Array.isArray(blocks?.value)?blocks.value:[]).map(String));
  if(!masterList.length)return {ready:false,masterCount:0,inventoryCount:0};
  S.masterProducts=masterList;S.masterByCode.clear();
  for(const p of masterList){S.masterByCode.set(p.codigo,p);(p.codigosEquivalentes||[]).forEach(code=>S.masterByCode.set(code,p));S.productInfo.set(p.codigo,p._raw||{})}
  S.masterReady=true;applyMasterAsCatalog();
  S.offlineCatalogAt=meta?.value?.updatedAt||master?.updatedAt||null;
  return {ready:S.inventoryReady,masterCount:masterList.length,inventoryCount:S.catalog.length,updatedAt:S.offlineCatalogAt};
}

async function enforceStartupCatalogProtection(){
  const state=await loadRequiredCatalogsFromCache();
  if(state.ready){
    setBootStatus('Catálogo offline verificado.');
    $('bootHint').textContent=`${state.inventoryCount.toLocaleString('es-MX')} productos activos disponibles · ${S.blockedCodes.size.toLocaleString('es-MX')} bloqueados · ${navigator.onLine?'RED DETECTADA':'ESTADO DE RED NO CONFIRMADO'}`;
    await new Promise(r=>setTimeout(r,350));hideLoad();showModeGate();return true;
  }
  setBootStatus('CATÁLOGOS REQUERIDOS');
  $('bootHint').textContent='Este equipo aún no tiene el catálogo de productos. Con Wi‑Fi o datos móviles, pulsa DESCARGAR para prepararlo.';
  $('catalogPrepareBtn').classList.remove('hidden');
  $('catalogRetryBtn').classList.remove('hidden');
  return false;
}

async function showOfflineInfo(){
  const m=await cacheGet('offlineMeta'),master=await cacheGet('masterProducts'),blocks=await cacheGet('blockedCodes');
  const mc=Array.isArray(master?.value)?master.value.length:0,bc=Array.isArray(blocks?.value)?blocks.value.length:0;
  alert(`CATÁLOGO OFFLINE

Productos descargados con activo=true: ${mc.toLocaleString('es-MX')}
Códigos bloqueados en la app: ${bc.toLocaleString('es-MX')}
Última descarga completa: ${cacheAgeText(m?.value?.updatedAt||m?.updatedAt)}
Sincronización incremental: cada 10 minutos mientras la app está abierta.`);
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
  container.innerHTML=rs.length?rs.map((p,i)=>`<div class="result" data-i="${i}"><b>${esc(p.descripcion)}</b><small>${esc(p.codigo)} · CATÁLOGO ACTIVO</small></div>`).join(''):'<div class="noresult">Sin coincidencias en productos activos</div>';
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
  await ensureOnlineStack();
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
  await ensureOnlineStack();
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
    <p class="catalog-extra-note">Busca directamente en el catálogo completo de productos activos.</p>
    <input id="masterQ" class="field" autocomplete="off" placeholder="Código, descripción o código equivalente">
    <div class="match-hint">Solo se muestran productos con activo = true.</div>
    <div id="masterRes" class="results master-results"><div class="noresult">Escribe al menos 2 caracteres.</div></div>
    <button id="masterClose" class="secondary">Cerrar</button>`);
  $('masterClose').onclick=close;
  const run=()=>{
    const q=$('masterQ').value.trim(),box=$('masterRes');
    if(q.length<2){box.innerHTML='<div class="noresult">Escribe al menos 2 caracteres.</div>';return}
    const rs=searchMasterProducts(q,60);
    box.innerHTML=rs.length?rs.map((p,i)=>`<div class="result master-result" data-i="${i}"><b>${esc(p.descripcion)}</b><small>${esc(p.codigo)} · $${Number(p.precioPublico||0).toFixed(2)} · ACTIVO</small></div>`).join(''):'<div class="noresult">Sin coincidencias en productos activos.</div>';
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
  diag('BOOT','inicio');
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

let salidaProcesando=false;
function bloquearGeneracionSalida(texto='GENERANDO SALIDA…'){
  let b=document.getElementById('salidaProcessingBlocker');
  if(!b){
    b=document.createElement('div');
    b.id='salidaProcessingBlocker';
    b.setAttribute('role','alert');
    b.setAttribute('aria-live','assertive');
    b.innerHTML=`<div style="width:min(88vw,430px);background:#fff;border-radius:24px;padding:28px 22px;text-align:center;box-shadow:0 24px 90px rgba(0,0,0,.35);border:1px solid #f1caca">
      <div style="width:54px;height:54px;border:6px solid #f2d3d3;border-top-color:#b91c1c;border-radius:50%;margin:0 auto 18px;animation:salidaSpin .8s linear infinite"></div>
      <div id="salidaProcessingTitle" style="font-size:22px;font-weight:900;color:#991b1b">${texto}</div>
      <div id="salidaProcessingSub" style="margin-top:9px;font-size:14px;color:#555;line-height:1.35">No vuelvas a presionar. Espera a que termine el proceso.</div>
    </div>`;
    Object.assign(b.style,{position:'fixed',inset:'0',zIndex:'2147483647',background:'rgba(255,255,255,.98)',display:'grid',placeItems:'center',padding:'18px',pointerEvents:'all',touchAction:'none',overscrollBehavior:'none'});
    document.body.appendChild(b);
    if(!document.getElementById('salidaProcessingStyle')){
      const st=document.createElement('style');st.id='salidaProcessingStyle';st.textContent='@keyframes salidaSpin{to{transform:rotate(360deg)}} body.salida-bloqueada{overflow:hidden!important;touch-action:none!important}';document.head.appendChild(st);
    }
  }
  document.body.classList.add('salida-bloqueada');
  const t=document.getElementById('salidaProcessingTitle');if(t)t.textContent=texto;
  // Fuerza layout inmediatamente para que Android pinte el bloqueo antes del trabajo pesado.
  void b.offsetHeight;
  return b;
}
function actualizarBloqueoSalida(texto,subtexto=''){
  const t=document.getElementById('salidaProcessingTitle');if(t)t.textContent=texto;
  const s=document.getElementById('salidaProcessingSub');if(s&&subtexto)s.textContent=subtexto;
}
function liberarBloqueoSalida(){
  document.body.classList.remove('salida-bloqueada');
  document.getElementById('salidaProcessingBlocker')?.remove();
}
async function pintarBloqueoSalida(){
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,40))));
}

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
    if(salidaProcesando)return;
    if(!has)return alert('Falta la firma de quien recibe.');

    // V26: PRIMERA ACCIÓN REAL = BLOQUEAR TODA LA APP.
    // El guardado, PDF, Firebase y Telegram empiezan DESPUÉS de que Android ya pintó este bloqueo.
    salidaProcesando=true;
    bloquearGeneracionSalida('GENERANDO SALIDA…');
    $('save').disabled=true;$('clear').disabled=true;$('btnRegresarCarritoFirma').disabled=true;
    c.style.pointerEvents='none';down=false;
    await pintarBloqueoSalida();

    let pdfBlob=null;
    try{
      const now=new Date();
      const usuarioFolio=String(S.user?.id||S.user?.usuario||'USR').replace(/[^a-zA-Z0-9]/g,'').slice(-6).toUpperCase()||'USR';
      const folio=`SABPDD-${now.toISOString().slice(0,10).replaceAll('-','')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}${String(now.getMilliseconds()).padStart(3,'0')}-${usuarioFolio}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
      const fechaCapturaTxt=(()=>{const [y,m,d]=S.fechaCaptura.split('-');return y&&m&&d?`${d}/${m}/${y}`:S.fechaCaptura})();
      const firmaData=c.toDataURL('image/png');
      const salida={folio,almacenId:'abarrotespdd',inventarioId:INVENTARIO_ID,fechaCaptura:S.fechaCaptura,fechaCapturaTxt,entrega:{usuarioId:S.user.id,usuario:S.user.usuario||'',nombre:S.user.nombre||'',rol:S.user.rol||'',rutaId:S.user.rutaId||''},recibe:S.recibe,recibeEmpleado:S.recibeEmpleado?{...S.recibeEmpleado}:null,destino:S.destino,destinoDetalle:S.destinoDetalle?{...S.destinoDetalle}:null,partidas:S.cart.map((x,i)=>({renglon:i+1,codigo:x.codigo,descripcion:x.descripcion,cantidad:x.cantidad,inventarioInicial:x.inventarioInicial,cantidadPorCaja:x.cantidadPorCaja??null,cajasSalieron:x.cajasSalieron??(Number(x.cantidadPorCaja)>0?Math.round((Number(x.cantidad)/Number(x.cantidadPorCaja)+Number.EPSILON)*1000)/1000:null),precioPublico:x.precioPublico??null,fueraInventario:x.fueraInventario===true})),totalPartidas:S.cart.length,totalUnidades:S.cart.reduce((a,x)=>a+Number(x.cantidad||0),0),firmaRecibe:firmaData,fechaLocal:now.toLocaleDateString('es-MX'),horaLocal:now.toLocaleTimeString('es-MX'),creadoEnLocal:now.toISOString()};

      actualizarBloqueoSalida('PROTEGIENDO SALIDA…','Guardando una copia local antes de continuar.');
      if(!queueSalidaLocal(salida))throw new Error('No fue posible proteger la salida en almacenamiento local.');
      await pintarBloqueoSalida();

      const printerCfg=printerConfigRead();
      let printResult={ok:false,native:false,reason:'AUTO_PRINT_DISABLED'};
      if(printerCfg.autoPrint!==false){
        actualizarBloqueoSalida('PREPARANDO TICKET 58 MM…','Generando comandos ESC/POS para la impresora térmica.');
        printResult=await printSalida58(salida);
        await pintarBloqueoSalida();
      }

      actualizarBloqueoSalida('GENERANDO PDF 58 MM…','Preparando comprobante térmico de respaldo.');
      // jsPDF forma parte del stack remoto. Si ya está cargado, esto es inmediato; si no, se carga ahora con el bloqueo visible.
      await ensureOnlineStack(15000);
      pdfBlob=makePdf(salida);
      downloadBlob(pdfBlob,`${folio}_58MM.pdf`);
      await pintarBloqueoSalida();

      actualizarBloqueoSalida('GRABANDO SALIDA…','Sincronizando con Firebase. No cierres la aplicación.');
      await syncPendingSalidas();
      const siguePendiente=pendingSalidasRead().some(x=>x?.folio===folio);

      actualizarBloqueoSalida('FINALIZANDO…','Terminando el comprobante y limpiando la captura.');
      await pintarBloqueoSalida();
      ro.disconnect();
      close();
      S.cart=[];S.last=[];render();S.recibe='';S.recibeEmpleado=null;S.destino='';S.destinoDetalle=null;S.fechaCaptura='';
      liberarBloqueoSalida();
      salidaProcesando=false;
      showModeGate();
      const estadoImpresion=printResult?.ok?'\nTicket 58 mm enviado a impresora':(printResult?.native?'\nImpresión 58 mm pendiente/revisar impresora':'\nTicket ESC/POS 58 mm preparado (PWA sin puente Android)');
      alert(siguePendiente
        ? `Salida protegida localmente
${folio}
PDF térmico 58 mm generado${estadoImpresion}
Firebase pendiente de sincronizar`
        : `Salida guardada correctamente
${folio}
PDF térmico 58 mm generado${estadoImpresion}`);
    }catch(e){
      console.error(e);
      liberarBloqueoSalida();
      salidaProcesando=false;
      c.style.pointerEvents='';
      $('save').disabled=false;$('clear').disabled=false;$('btnRegresarCarritoFirma').disabled=false;
      alert('No se pudo finalizar la salida. '+(e?.message||''));
    }
  };
}

$('menuBtn').onclick=()=>$('menu').classList.toggle('hidden');
$('cartBtn').onclick=()=>{$('menu').classList.add('hidden');cartModal()};
$('cameraBtn').onclick=()=>{$('menu').classList.add('hidden');cameraScanner()};
$('blockedCodesBtn').onclick=()=>{$('menu').classList.add('hidden');blockedCodesModal()};
$('printerConfigBtn').onclick=()=>{$('menu').classList.add('hidden');printerConfigModal()};
$('logoutBtn').textContent='↩ Menú Entrada / Salida';
$('logoutBtn').onclick=()=>{S.cart=[];S.last=[];S.recibe='';S.recibeEmpleado=null;S.destino='';S.destinoDetalle=null;S.fechaCaptura='';render();showModeGate()};
$('finishBtn').onclick=reviewBeforeFinish;
$('scanInput').addEventListener('input',quickSearch);
$('scanInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchFromMain()}};

document.addEventListener('click',e=>{if(!e.target.closest('.capture'))clearQuickResults()});

$('modeEntrada').onclick=()=>{diag('BOTÓN ENTRADA','onclick');enterEntrada()};
$('modeSalida').onclick=()=>{diag('BOTÓN SALIDA','onclick');enterSalida()};
$('entryPhotoBtn').onclick=()=>{
  diag('BOTÓN FOTO','onclick');
  // Debe ejecutarse directamente dentro del gesto del usuario para Android/Chrome.
  const input=$('entryPhotoInput');
  try{diag('FOTO PICKER',typeof input.showPicker==='function'?'showPicker':'input.click');if(typeof input.showPicker==='function')input.showPicker();else input.click()}catch(e){diag('FOTO PICKER ERROR',e.message);console.warn('[FOTO] showPicker fallback',e);input.click()}
};
$('entryPhotoInput').addEventListener('change',e=>{diag('INPUT FOTO CHANGE',`archivos=${e.target.files?.length||0}`);addEntryFiles(e.target.files)});
$('entrySave').onclick=()=>{diag('BOTÓN GUARDAR ENTRADA','onclick');saveEntry()};
$('entryCancel').onclick=()=>{diag('BOTÓN CANCELAR ENTRADA','onclick');if(ENTRY.photos.length&&!confirm('¿Cancelar esta entrada? Las fotos capturadas no se guardarán.'))return;resetEntry();showModeGate()};
$('entryBack').onclick=$('entryCancel').onclick;

$('catalogPrepareBtn').onclick=()=>downloadOfflineCatalog({startup:true});
$('catalogRetryBtn').onclick=async()=>{
  $('catalogPrepareBtn').classList.add('hidden');$('catalogRetryBtn').classList.add('hidden');
  setBootStatus('Revisando catálogos...');setConnectionBadge();
  await enforceStartupCatalogProtection();
};
// V32: al volver a primer plano sólo se asegura que siga activo el listener centinela; no consulta /productos.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>startCatalogVersionWatcher(),700)});

(async()=>{
  $('app').classList.add('hidden');$('entryApp').classList.add('hidden');$('modeGate').classList.add('hidden');showLoad('Iniciando aplicación...');
  try{
    setConnectionBadge();
    await startupPwaInstallStep();
    setBootStatus('Verificando catálogos disponibles en este equipo...');
    $('bootHint').textContent='Comprobando preparación para trabajar con o sin internet.';
    // Arranque 100% local: no esperamos Firebase ni una prueba de red.
    const userCache=await cacheGet('fixedUser');
    S.user=userCache?.value||{id:FIXED_USER_DOC,usuario:'JUAN',nombre:'JUAN PEREZ',rol:'OPERADOR'};
    const name=S.user.nombre||S.user.usuario||'JUAN';
    $('sesionTxt').textContent=name;$('entryUserTxt').textContent=name;$('modeUser').textContent=`Usuario: ${name}`;
    diag('BOOT','estado local cargado');
    const catalogsReady=await enforceStartupCatalogProtection();
    if(catalogsReady){startCatalogVersionWatcher()}
    if(pendingSalidasRead().length)setTimeout(()=>syncPendingSalidas(),500);
  }catch(e){console.error(e);setBootStatus(e.message||'No fue posible iniciar la aplicación.');$('bootHint').textContent='Revisa la conexión y vuelve a intentarlo.';$('catalogRetryBtn').classList.remove('hidden')}
})();
