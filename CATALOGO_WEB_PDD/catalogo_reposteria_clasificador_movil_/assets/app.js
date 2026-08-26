const FIREBASE_CONFIG = window.PROVSOFT_FIREBASE_CONFIG ?? null;
const PRODUCT_COLLECTION = window.PROVSOFT_PRODUCT_COLLECTION || 'productos';
const CONFIG_DOC_PATH = window.PROVSOFT_CONFIG_DOC_PATH || ['CLIENTES','PDD031204KL5','CONFIGURACION','CATALOGOWEB'];
const DEFAULT_SUBCATEGORIES = Array.isArray(window.PROVSOFT_DEFAULT_SUBCATEGORIES) ? window.PROVSOFT_DEFAULT_SUBCATEGORIES : ['HARINAS','CHAROLAS','CONTENEDORES'];
import { initializeApp, getApps, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc, updateDoc, deleteField } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = id => document.getElementById(id);
const state = { db:null, products:[], subcats:[...DEFAULT_SUBCATEGORIES], selected:null, selectedSubcat:'', scanner:null, scanning:false };
let bootTimer = null;

const normalize = value => String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const open = id => $(id).classList.add('open');
const close = id => $(id).classList.remove('open');
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

function setBoot(percent, message, detail=''){
  $('bootProgress').style.width = Math.max(5,Math.min(100,percent))+'%';
  $('bootMessage').textContent = message;
  $('bootDetail').textContent = detail || 'No cierres esta pantalla.';
}
function setBootError(message){
  setBoot(100,'No se pudo preparar el catálogo',message);
  show('bootRetry');
}
function configFromStorage(){
  if(FIREBASE_CONFIG) return FIREBASE_CONFIG;
  try { return JSON.parse(localStorage.getItem('provsoftFirebaseConfig') || 'null'); } catch { return null; }
}
async function connectFirebase(){
  const cfg = configFromStorage();
  if(!cfg){ close('bootOverlay'); open('configModal'); return false; }
  setBoot(20,'Conectando con Firebase…','Validando configuración.');
  try{
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    state.db = getFirestore(app);
    return true;
  }catch(err){
    console.error(err); setBootError('Revisa la configuración de Firebase.'); return false;
  }
}
function configDocRef(){ return doc(state.db, ...CONFIG_DOC_PATH); }
async function loadRemoteConfig(){
  setBoot(38,'Cargando configuración…','Leyendo CATALOGOWEB.');
  const snap = await getDoc(configDocRef());
  if(snap.exists()){
    const d = snap.data();
    const remote = Array.isArray(d.subclasificaciones) ? d.subclasificaciones : Array.isArray(d.reposteriaSubclasificaciones) ? d.reposteriaSubclasificaciones : [];
    if(remote.length) state.subcats = [...new Set(remote.map(normalize).filter(Boolean))];
  }else{
    await setDoc(configDocRef(), {catalogo:'REPOSTERIA',subclasificaciones:state.subcats,actualizadoEn:new Date().toISOString()},{merge:true});
  }
}
async function loadCatalog(){
  hide('bootRetry'); open('bootOverlay'); $('app').setAttribute('aria-hidden','true');
  setBoot(10,'Preparando catálogo…','Iniciando.');
  try{
    if(!state.db && !(await connectFirebase())) return;
    await loadRemoteConfig();
    setBoot(56,'Descargando productos activos…','Consultando /productos con activo = true.');
    const q = query(collection(state.db,PRODUCT_COLLECTION), where('activo','==',true));
    const snap = await getDocs(q);
    setBoot(82,'Organizando información…',`${snap.size} productos encontrados.`);
    state.products = snap.docs.map(d=>({id:d.id,...d.data()}));
    state.products.sort((a,b)=>normalize(a.concepto).localeCompare(normalize(b.concepto)));
    $('productCount').textContent = state.products.length.toLocaleString('es-MX');
    $('subcatCount').textContent = state.subcats.length;
    setBoot(100,'Catálogo listo','Ya puedes clasificar artículos.');
    clearTimeout(bootTimer);
    bootTimer = setTimeout(()=>{ close('bootOverlay'); $('app').setAttribute('aria-hidden','false'); $('searchInput').focus(); },450);
  }catch(err){ console.error(err); setBootError(err.message || 'Error desconocido.'); }
}

function searchable(p){
  return normalize([p.codigoBarra,p.id,p.concepto,p.marca,p.departamento,p.departamento_id,p.claveSat,...(Array.isArray(p.codigosEquivalentes)?p.codigosEquivalentes:[])].join(' '));
}
function compact(value){
  return normalize(value).replace(/[^A-Z0-9]/g,'');
}
function tokens(value){
  return normalize(value).replace(/[-_/.,]+/g,' ').split(/\s+/).filter(Boolean);
}
function exactProduct(code){
  const c=normalize(code);
  const cc=compact(code);
  return state.products.find(p=>{
    const vals=[p.codigoBarra,p.id,...(Array.isArray(p.codigosEquivalentes)?p.codigosEquivalentes:[])];
    return vals.some(v=>normalize(v)===c || (cc && compact(v)===cc));
  });
}
function scoreProduct(p, term){
  const phrase=normalize(term);
  const phraseCompact=compact(term);
  const words=tokens(term);
  if(!phrase || !words.length) return -1;

  const fields=[
    {v:p.codigoBarra||'',w:9},
    {v:p.id||'',w:8},
    {v:p.concepto||'',w:7},
    {v:p.marca||'',w:5},
    {v:p.departamento||'',w:3},
    {v:p.departamento_id||'',w:2},
    {v:p.claveSat||'',w:1},
    ...((Array.isArray(p.codigosEquivalentes)?p.codigosEquivalentes:[]).map(v=>({v,w:8})))
  ].map(f=>({...f,n:normalize(f.v),c:compact(f.v)}));

  let score=0;
  let matchedWords=0;

  for(const f of fields){
    if(f.n===phrase) score+=160*f.w;
    else if(f.n.startsWith(phrase)) score+=55*f.w;
    else if(f.n.includes(phrase)) score+=32*f.w;
    if(phraseCompact && f.c===phraseCompact) score+=140*f.w;
    else if(phraseCompact && f.c.includes(phraseCompact)) score+=26*f.w;
  }

  for(const word of words){
    const wc=compact(word);
    let best=0;
    for(const f of fields){
      if(f.n===word) best=Math.max(best,24*f.w);
      else if(f.n.startsWith(word)) best=Math.max(best,15*f.w);
      else if(f.n.includes(word)) best=Math.max(best,10*f.w);
      if(wc && f.c.includes(wc)) best=Math.max(best,9*f.w);
    }
    if(best>0){ matchedWords++; score+=best; }
  }

  if(matchedWords===words.length) score+=120+(words.length*20);
  else if(matchedWords>0) score+=matchedWords*12;
  else return -1;

  // Favorece coincidencias con los mismos términos aunque el usuario cambie orden o guiones.
  const hayTokens=new Set(tokens(searchable(p)));
  const overlap=words.filter(w=>hayTokens.has(w)).length;
  score+=overlap*18;

  return score;
}
function searchProducts(term){
  const t=normalize(term);
  if(!t) return [];
  const exact=exactProduct(t);
  if(exact) return [exact];
  return state.products
    .map(p=>({p,score:scoreProduct(p,t)}))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score || normalize(a.p.concepto).localeCompare(normalize(b.p.concepto)))
    .slice(0,100)
    .map(x=>x.p);
}
function renderResults(rows,term){
  $('resultMeta').textContent = rows.length ? `${rows.length} coincidencia${rows.length===1?'':'s'} para “${term}”` : `Sin coincidencias para “${term}”`;
  if(!rows.length){
    $('resultsList').innerHTML='<div class="inline-error">No encontré productos activos con esa búsqueda.</div>';
  }else{
    $('resultsList').innerHTML = rows.map(p=>`<button class="result-item" type="button" data-id="${escapeHtml(p.id)}"><div class="r-code">${escapeHtml(p.codigoBarra||p.id)}</div><div class="r-name">${escapeHtml(p.concepto||'(Sin concepto)')}</div><div class="r-meta">${escapeHtml(p.departamento||'Sin departamento')} · ${escapeHtml(p.marca||'Sin marca')}</div>${p.catalogoReposteria===true?`<span class="r-tag">YA CLASIFICADO${p.reposteriaSubclasificacion?' · '+escapeHtml(p.reposteriaSubclasificacion):''}</span>`:''}</button>`).join('');
    $('resultsList').querySelectorAll('.result-item').forEach(btn=>btn.addEventListener('click',()=>selectProduct(btn.dataset.id)));
  }
  open('resultsModal');
}
function performSearch(termOverride=null, {directExact=false}={}){
  const term=String(termOverride ?? $('searchInput').value).trim();
  if(!term) return;
  const rows=searchProducts(term);
  if(directExact && rows.length===1 && exactProduct(term)){ selectProduct(rows[0].id); return; }
  renderResults(rows,term);
}

let liveSearchTimer=null;
function queueLiveSearch(source){
  clearTimeout(liveSearchTimer);
  const term=source.value.trim();
  if(source.id==='searchInput' && term.length<2){
    if($('resultsModal').classList.contains('open')) close('resultsModal');
    return;
  }
  if(source.id==='modalSearchInput' && !term){
    $('resultsList').innerHTML='';
    $('resultMeta').textContent='Escribe para ver sugerencias.';
    return;
  }
  liveSearchTimer=setTimeout(()=>{
    if(source.id==='searchInput'){
      $('modalSearchInput').value=term;
      performSearch(term);
      setTimeout(()=>{
        const input=$('modalSearchInput');
        input.focus();
        input.setSelectionRange(input.value.length,input.value.length);
      },40);
    }else{
      $('searchInput').value=term;
      performSearch(term);
    }
  },120);
}
function selectProduct(id){
  const p=state.products.find(x=>x.id===id); if(!p) return;
  state.selected=p; state.selectedSubcat=normalize(p.reposteriaSubclasificacion||'');
  close('resultsModal');
  $('selectedCode').textContent='Código: '+(p.codigoBarra||p.id);
  $('selectedName').textContent=p.concepto||'(Sin concepto)';
  const precio=Number(p.precioPublico);
  $('selectedPrice').textContent=Number.isFinite(precio) ? precio.toLocaleString('es-MX',{style:'currency',currency:'MXN'}) : 'Sin precio';
  $('selectedPrice').classList.toggle('price-missing', !Number.isFinite(precio));
  $('selectedDept').textContent=[p.departamento,p.marca].filter(Boolean).join(' · ');
  renderSubcats(); hide('saveError');
  open('classifyModal');
}
function renderSubcats(){
  const current=state.selectedSubcat;
  if(current && !state.subcats.includes(current)) state.subcats.push(current);
  state.subcats.sort((a,b)=>a.localeCompare(b));
  $('subcatGrid').innerHTML=state.subcats.map(s=>`<button class="subcat-btn ${current===s?'selected':''}" type="button" data-value="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');
  $('subcatGrid').querySelectorAll('.subcat-btn').forEach(btn=>btn.addEventListener('click',()=>{state.selectedSubcat=btn.dataset.value;renderSubcats();$('saveClassBtn').disabled=false;}));
  $('saveClassBtn').disabled=!current;
}
async function saveClassification(){
  if(!state.selected || !state.selectedSubcat || !state.db) return;
  $('saveClassBtn').disabled=true; hide('saveError');
  try{
    const patch={catalogoReposteria:true,reposteriaSubclasificacion:state.selectedSubcat,reposteriaActualizadoEn:new Date().toISOString()};
    await updateDoc(doc(state.db,PRODUCT_COLLECTION,state.selected.id),patch);
    Object.assign(state.selected,patch);
    const msg=`✓ ${state.selected.codigoBarra||state.selected.id} · ${state.selectedSubcat}`;
    $('lastSaved').textContent='Guardado: '+msg; show('lastSaved');
    close('classifyModal'); resetCapture();
  }catch(err){
    $('saveError').textContent='No se pudo guardar: '+(err.message||err); show('saveError'); $('saveClassBtn').disabled=false;
  }
}
function resetCapture(){
  state.selected=null; state.selectedSubcat=''; $('searchInput').value=''; $('modalSearchInput').value='';
  clearTimeout(liveSearchTimer);
  setTimeout(()=>$('searchInput').focus(),120);
}

function renderSubcatAdmin(){
  state.subcats=[...new Set(state.subcats.map(normalize).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  $('subcatCount').textContent=state.subcats.length;
  if(!state.subcats.length){
    $('subcatAdminList').innerHTML='<div class="subcat-empty">Todavía no hay subclasificaciones. Crea la primera arriba.</div>';
    return;
  }
  $('subcatAdminList').innerHTML=state.subcats.map(s=>`<div class="subcat-admin-item"><div class="subcat-admin-name">${escapeHtml(s)}</div><button class="subcat-delete-btn" type="button" data-value="${escapeHtml(s)}">Eliminar</button></div>`).join('');
  $('subcatAdminList').querySelectorAll('.subcat-delete-btn').forEach(btn=>btn.addEventListener('click',()=>deleteSubcategory(btn.dataset.value)));
}
async function persistSubcategories(){
  if(!state.db) throw new Error('Firebase no está conectado.');
  await setDoc(configDocRef(),{catalogo:'REPOSTERIA',subclasificaciones:state.subcats,actualizadoEn:new Date().toISOString()},{merge:true});
  $('subcatCount').textContent=state.subcats.length;
}
async function addSubcategory(raw){
  hide('subcatAdminError');
  const value=normalize(raw);
  if(!value){ $('subcatAdminError').textContent='Escribe el nombre de la subclasificación.'; show('subcatAdminError'); return; }
  if(state.subcats.includes(value)){ $('subcatAdminError').textContent='Esa subclasificación ya existe.'; show('subcatAdminError'); return; }
  state.subcats.push(value);
  try{
    await persistSubcategories();
    $('newSubcatInput').value='';
    renderSubcatAdmin();
    if($('classifyModal').classList.contains('open')) renderSubcats();
  }catch(err){
    state.subcats=state.subcats.filter(x=>x!==value);
    $('subcatAdminError').textContent='No se pudo guardar: '+(err.message||err); show('subcatAdminError');
  }
}
async function deleteSubcategory(value){
  hide('subcatAdminError');
  const previous=[...state.subcats];
  state.subcats=state.subcats.filter(x=>x!==value);
  try{
    await persistSubcategories();
    if(state.selectedSubcat===value) state.selectedSubcat='';
    renderSubcatAdmin();
    if($('classifyModal').classList.contains('open')) renderSubcats();
  }catch(err){
    state.subcats=previous; renderSubcatAdmin();
    $('subcatAdminError').textContent='No se pudo eliminar: '+(err.message||err); show('subcatAdminError');
  }
}
function openSubcatManager(){
  close('menuModal'); hide('subcatAdminError'); renderSubcatAdmin(); open('subcatsModal');
  setTimeout(()=>$('newSubcatInput').focus(),80);
}

function classifiedRows(term=''){
  const t=normalize(term);
  return state.products
    .filter(p=>p.catalogoReposteria===true)
    .filter(p=>!t || normalize([p.codigoBarra,p.id,p.concepto,p.reposteriaSubclasificacion,p.departamento,p.marca].join(' ')).includes(t))
    .sort((a,b)=>normalize(a.reposteriaSubclasificacion).localeCompare(normalize(b.reposteriaSubclasificacion)) || normalize(a.concepto).localeCompare(normalize(b.concepto)));
}
function renderClassifiedViewer(){
  hide('classifiedError');
  const term=$('classifiedSearch').value.trim();
  const rows=classifiedRows(term);
  const total=state.products.filter(p=>p.catalogoReposteria===true).length;
  $('classifiedMeta').textContent=term ? `${rows.length} de ${total} clasificados` : `${total} producto${total===1?'':'s'} clasificado${total===1?'':'s'}`;
  if(!rows.length){
    $('classifiedList').innerHTML='<div class="subcat-empty">No hay productos clasificados con ese filtro.</div>';
    return;
  }
  $('classifiedList').innerHTML=rows.map(p=>{
    const precio=Number(p.precioPublico);
    const precioTxt=Number.isFinite(precio)?precio.toLocaleString('es-MX',{style:'currency',currency:'MXN'}):'Sin precio';
    return `<article class="classified-item">
      <div class="classified-section">${escapeHtml(p.reposteriaSubclasificacion||'SIN SECCIÓN')}</div>
      <div class="classified-code">Código: ${escapeHtml(p.codigoBarra||p.id)}</div>
      <div class="classified-name">${escapeHtml(p.concepto||'(Sin concepto)')}</div>
      <div class="classified-price">Precio público: <b>${escapeHtml(precioTxt)}</b></div>
      <div class="classified-actions">
        <button class="classified-change" type="button" data-id="${escapeHtml(p.id)}">Cambiar sección</button>
        <button class="classified-remove" type="button" data-id="${escapeHtml(p.id)}">Quitar</button>
      </div>
    </article>`;
  }).join('');
  $('classifiedList').querySelectorAll('.classified-change').forEach(btn=>btn.addEventListener('click',()=>{
    close('classifiedModal');
    selectProduct(btn.dataset.id);
  }));
  $('classifiedList').querySelectorAll('.classified-remove').forEach(btn=>btn.addEventListener('click',()=>removeClassification(btn.dataset.id)));
}
async function removeClassification(id){
  const p=state.products.find(x=>x.id===id);
  if(!p || !state.db) return;
  const nombre=p.concepto||p.codigoBarra||p.id;
  if(!confirm(`¿Quitar “${nombre}” del catálogo de repostería?`)) return;
  hide('classifiedError');
  try{
    await updateDoc(doc(state.db,PRODUCT_COLLECTION,p.id),{
      catalogoReposteria:false,
      reposteriaSubclasificacion:deleteField(),
      reposteriaActualizadoEn:new Date().toISOString()
    });
    p.catalogoReposteria=false;
    delete p.reposteriaSubclasificacion;
    p.reposteriaActualizadoEn=new Date().toISOString();
    renderClassifiedViewer();
  }catch(err){
    $('classifiedError').textContent='No se pudo quitar la clasificación: '+(err.message||err);
    show('classifiedError');
  }
}
function openClassifiedViewer(){
  close('menuModal');
  $('classifiedSearch').value='';
  renderClassifiedViewer();
  open('classifiedModal');
  setTimeout(()=>$('classifiedSearch').focus(),80);
}

async function stopScanner(){
  if(state.scanner && state.scanning){
    try{await state.scanner.stop();}catch{}
    try{await state.scanner.clear();}catch{}
  }
  state.scanning=false;
}
async function startScanner(){
  hide('scannerError'); open('scannerModal');
  if(typeof Html5Qrcode==='undefined'){
    $('scannerError').textContent='No cargó el lector de códigos. Usa la búsqueda manual.'; show('scannerError'); return;
  }
  try{
    state.scanner=state.scanner||new Html5Qrcode('reader');
    const formats=['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','ITF'].map(k=>Html5QrcodeSupportedFormats[k]).filter(Boolean);
    await state.scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:280,height:150},formatsToSupport:formats},async text=>{
      await stopScanner(); close('scannerModal');
      const p=exactProduct(text);
      if(p){ $('searchInput').value=text; selectProduct(p.id); }
      else { $('searchInput').value=text; renderResults([],text); }
    },()=>{});
    state.scanning=true;
  }catch(err){
    console.error(err); $('scannerError').textContent='No pude abrir la cámara. En algunos celulares la cámara requiere HTTPS. Puedes usar un escáner Bluetooth/USB o la búsqueda manual.'; show('scannerError');
  }
}

$('searchForm').addEventListener('submit',e=>{e.preventDefault();});
$('searchInput').addEventListener('input',e=>queueLiveSearch(e.currentTarget));
$('modalSearchInput').addEventListener('input',e=>queueLiveSearch(e.currentTarget));
$('scanBtn').addEventListener('click',startScanner);
$('closeScannerBtn').addEventListener('click',async()=>{await stopScanner();close('scannerModal');});
$('closeResultsBtn').addEventListener('click',()=>{close('resultsModal');$('searchInput').value=$('modalSearchInput').value;$('searchInput').focus();});
$('closeClassifyBtn').addEventListener('click',()=>{close('classifyModal');resetCapture();});
$('saveClassBtn').addEventListener('click',saveClassification);
$('menuBtn').addEventListener('click',()=>open('menuModal'));
$('closeMenuBtn').addEventListener('click',()=>close('menuModal'));
$('closeMenuBottomBtn').addEventListener('click',()=>close('menuModal'));
$('classifiedViewerBtn').addEventListener('click',openClassifiedViewer);
$('manageSubcatsBtn').addEventListener('click',openSubcatManager);
$('closeClassifiedBtn').addEventListener('click',()=>close('classifiedModal'));
$('classifiedSearch').addEventListener('input',renderClassifiedViewer);
$('closeSubcatsBtn').addEventListener('click',()=>close('subcatsModal'));
$('subcatForm').addEventListener('submit',e=>{e.preventDefault();addSubcategory($('newSubcatInput').value);});
$('reloadCatalogBtn').addEventListener('click',()=>{close('menuModal');loadCatalog();});
$('changeConfigBtn').addEventListener('click',()=>{close('menuModal');$('firebaseConfig').value=localStorage.getItem('provsoftFirebaseConfig')||'';open('configModal');});
$('bootRetry').addEventListener('click',loadCatalog);
$('saveConfigBtn').addEventListener('click',async()=>{
  hide('configError');
  try{
    const cfg=JSON.parse($('firebaseConfig').value.trim());
    if(!cfg.apiKey||!cfg.projectId) throw new Error('Faltan apiKey o projectId.');
    localStorage.setItem('provsoftFirebaseConfig',JSON.stringify(cfg));
    for(const app of getApps()) try{await deleteApp(app);}catch{}
    state.db=null; close('configModal'); open('bootOverlay'); loadCatalog();
  }catch(err){$('configError').textContent='Configuración inválida: '+(err.message||err);show('configError');}
});

loadCatalog();
