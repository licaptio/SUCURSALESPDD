import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, doc, getDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, CATALOG } from "./firebase-config.js";

const els = {
  status: document.querySelector('#statusPanel'), categoryView: document.querySelector('#categoryView'), productView: document.querySelector('#productView'),
  categoryGrid: document.querySelector('#categoryGrid'), categoryCount: document.querySelector('#categoryCount'), productGrid: document.querySelector('#productGrid'),
  productCount: document.querySelector('#productCount'), currentCategoryLabel: document.querySelector('#currentCategoryLabel'), productHeading: document.querySelector('#productHeading'),
  search: document.querySelector('#searchInput'), clearSearch: document.querySelector('#clearSearch'), back: document.querySelector('#backButton'), home: document.querySelector('#homeButton'), reload: document.querySelector('#reloadButton'),
  emptyProducts: document.querySelector('#emptyProducts'), modal: document.querySelector('#productModal'), modalClose: document.querySelector('#modalClose'), modalPrev: document.querySelector('#modalPrev'), modalNext: document.querySelector('#modalNext'),
  modalImage: document.querySelector('#modalImage'), modalImageFallback: document.querySelector('#modalImageFallback'), modalThumbs: document.querySelector('#modalThumbs'), modalConcept: document.querySelector('#modalConcept'), modalCategory: document.querySelector('#modalCategory'),
  modalPrice: document.querySelector('#modalPrice'), modalPriceTiers: document.querySelector('#modalPriceTiers'), modalBrand: document.querySelector('#modalBrand'), modalDepartment: document.querySelector('#modalDepartment'), modalSubcategory: document.querySelector('#modalSubcategory'), modalCode: document.querySelector('#modalCode'), modalIva: document.querySelector('#modalIva')
};

let db = null;
let products = [];
let visibleProducts = [];
let currentSubcategory = null;
let modalIndex = -1;
let unsubscribeCatalog = null;
let catalogRenderTimer = null;
let modalPhotoUrls = [];
let modalPhotoIndex = 0;
let modalPhotoTimer = null;
const catalogById = new Map();
const photoCache = new Map();

const normalize = (value='') => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const money = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(value)) : 'Consultar';
const cleanText = value => String(value ?? '').trim();
const getCode = p => cleanText(p.codigoBarra || p.codigo || p.id);
const isActive = p => p?.[CATALOG.activeField] === true;
const isReposteria = p => p?.[CATALOG.sectionFlagField] === true;
const getSubcategory = p => cleanText(p?.[CATALOG.subcategoryField] || 'SIN CLASIFICAR').toUpperCase();

function showStatus(message, type='info') {
  els.status.textContent = message;
  els.status.className = `status-panel ${type === 'error' ? 'error' : ''}`;
}
function hideStatus(){ els.status.className = 'status-panel hidden'; }
function firebaseConfigured(){ return firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('PEGA_AQUI'); }

async function boot(){
  renderCategorySkeleton();
  if (!firebaseConfigured()) {
    products = demoProducts();
    showStatus('Modo demostración: falta pegar la configuración web de Firebase en assets/firebase-config.js. La interfaz ya está lista.', 'info');
    renderCategories();
    return;
  }
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    await loadCatalog();
    hideStatus();
  } catch (err) {
    console.error(err);
    products = demoProducts();
    showStatus(`No fue posible conectar con Firebase. Se muestra el modo demostración. ${err?.message || ''}`, 'error');
    renderCategories();
  }
}

function loadCatalog(){
  showStatus('Conectando catálogo de Repostería en tiempo real…');
  const ref = collection(db, CATALOG.productsCollection);
  const catalogQuery = query(ref, where(CATALOG.sectionFlagField, '==', true));

  // Un solo listener permanente: Firestore entrega el catálogo inicial y después
  // únicamente los documentos que cambian. No hacemos polling ni recargas periódicas.
  if (unsubscribeCatalog) unsubscribeCatalog();

  return new Promise((resolve, reject) => {
    let firstSnapshot = true;

    unsubscribeCatalog = onSnapshot(catalogQuery, { includeMetadataChanges: false }, snap => {
      for (const change of snap.docChanges()) {
        const id = change.doc.id;
        if (change.type === 'removed') {
          catalogById.delete(id);
          photoCache.delete(id);
          continue;
        }

        const product = { id, ...change.doc.data() };
        if (isActive(product) && isReposteria(product)) catalogById.set(id, product);
        else catalogById.delete(id);

        // Si cambia un producto, su metadata de fotos se volverá a consultar
        // solamente cuando esa tarjeta/modal la necesite.
        const code = getCode(product);
        if (code) photoCache.delete(code);
      }

      scheduleCatalogRender();

      if (firstSnapshot) {
        firstSnapshot = false;
        hideStatus();
        console.info(`✅ Catálogo en tiempo real: ${catalogById.size} productos activos de Repostería.`);
        resolve();
      }
    }, err => {
      console.error('Listener Firestore catálogo:', err);
      showStatus(`Se perdió la escucha del catálogo. Firebase intentará reconectar. ${err?.message || ''}`, 'error');
      if (firstSnapshot) {
        firstSnapshot = false;
        reject(err);
      }
    });
  });
}

function scheduleCatalogRender(){
  // Agrupa ráfagas de cambios para no reconstruir la interfaz varias veces seguidas.
  clearTimeout(catalogRenderTimer);
  catalogRenderTimer = setTimeout(() => {
    products = [...catalogById.values()];
    products.sort((a,b) => cleanText(a.concepto).localeCompare(cleanText(b.concepto), 'es', {sensitivity:'base'}));

    if (currentSubcategory !== null) {
      renderProducts();
      if (!els.modal.classList.contains('hidden') && modalIndex >= 0 && visibleProducts.length) {
        modalIndex = Math.min(modalIndex, visibleProducts.length - 1);
      }
    } else {
      renderCategories();
    }
  }, 120);
}

function renderCategorySkeleton(){
  els.categoryGrid.innerHTML = Array.from({length:8},()=>'<div class="loading-card"></div>').join('');
}

function groupCategories(){
  const map = new Map();
  for (const p of products) {
    const key = getSubcategory(p);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0],'es'));
}

function renderCategories(){
  currentSubcategory = null;
  els.productView.classList.add('hidden');
  els.categoryView.classList.remove('hidden');
  els.search.placeholder = 'Buscar por producto, código, marca o equivalente';
  const groups = groupCategories();
  els.categoryCount.textContent = `${groups.length} subcategorías`;
  els.categoryGrid.innerHTML = '';
  for (const [name,count] of groups) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className='category-card';
    btn.innerHTML = `<span class="category-icon">›</span><span><div class="category-name">${escapeHtml(name)}</div><div class="category-meta">${count} ${count===1?'producto':'productos'}</div></span>`;
    btn.addEventListener('click',()=>openCategory(name));
    els.categoryGrid.appendChild(btn);
  }
}

function openCategory(name){
  currentSubcategory = name;
  els.categoryView.classList.add('hidden');
  els.productView.classList.remove('hidden');
  els.currentCategoryLabel.textContent = name;
  els.productHeading.textContent = name;
  els.search.value = '';
  els.search.placeholder = `Buscar dentro de ${name}`;
  renderProducts();
  window.scrollTo({top:0,behavior:'smooth'});
}

function searchMatches(p, term){
  if (!term) return true;
  const haystack = [p.concepto, p.codigoBarra, p.codigo, p.marca, ...(Array.isArray(p.codigosEquivalentes) ? p.codigosEquivalentes : [])].map(normalize).join(' | ');
  return haystack.includes(normalize(term));
}

function renderProducts(){
  const term = els.search.value.trim();
  visibleProducts = products.filter(p => (!currentSubcategory || getSubcategory(p) === currentSubcategory) && searchMatches(p,term));
  els.productCount.textContent = `${visibleProducts.length} ${visibleProducts.length===1?'producto':'productos'}`;
  els.productGrid.innerHTML='';
  els.emptyProducts.classList.toggle('hidden', visibleProducts.length !== 0);
  visibleProducts.forEach((p,index)=>els.productGrid.appendChild(makeProductCard(p,index)));
}

function makeProductCard(p,index){
  const card = document.createElement('article'); card.className='product-card';
  const btn = document.createElement('button'); btn.type='button'; btn.className='product-card-button';
  btn.innerHTML = `<div class="product-image-wrap"><img class="product-image hidden" alt="${escapeHtml(cleanText(p.concepto))}" loading="lazy"><div class="image-fallback">CARGANDO FOTO</div></div><div class="product-card-body"><p class="product-price">${money(p.precioPublico)}</p><p class="product-concept">${escapeHtml(cleanText(p.concepto) || 'SIN DESCRIPCIÓN')}</p>${p.marca ? `<div class="product-brand">${escapeHtml(cleanText(p.marca))}</div>` : ''}</div>`;
  const img = btn.querySelector('img'); const fallback = btn.querySelector('.image-fallback');
  loadPhotos(p).then(urls=>{
    if (urls[0]) { img.src=urls[0]; img.classList.remove('hidden'); fallback.classList.add('hidden'); }
    else { fallback.textContent='SIN FOTO'; }
  });
  btn.addEventListener('click',()=>openModal(index));
  card.appendChild(btn); return card;
}

async function loadPhotos(p){
  const code = getCode(p);
  if (!code) return [];
  if (photoCache.has(code)) return photoCache.get(code);
  if (Array.isArray(p.urlsFotos) && p.urlsFotos.length) { photoCache.set(code,p.urlsFotos); return p.urlsFotos; }
  if (!db) {
    const demo = Array.isArray(p.__demoFotos) ? p.__demoFotos : [];
    photoCache.set(code,demo); return demo;
  }
  try {
    const snap = await getDoc(doc(db, CATALOG.photoMetaCollection, code));
    const urls = snap.exists() && Array.isArray(snap.data().urlsFotos) ? snap.data().urlsFotos.filter(Boolean) : [];
    photoCache.set(code, urls); return urls;
  } catch (e) {
    console.warn('Fotos', code, e); photoCache.set(code, []); return [];
  }
}

async function openModal(index){
  if (!visibleProducts.length) return;
  modalIndex = (index + visibleProducts.length) % visibleProducts.length;
  const p = visibleProducts[modalIndex];
  els.modal.classList.remove('hidden'); document.body.style.overflow='hidden';
  els.modalConcept.textContent = cleanText(p.concepto) || 'SIN DESCRIPCIÓN';
  els.modalCategory.textContent = `REPOSTERÍA · ${getSubcategory(p)}`;
  els.modalPrice.textContent = money(p.precioPublico);
  els.modalBrand.textContent = cleanText(p.marca) || '—';
  els.modalDepartment.textContent = cleanText(p.departamento) || '—';
  els.modalSubcategory.textContent = getSubcategory(p);
  els.modalCode.textContent = getCode(p) || '—';
  els.modalIva.textContent = formatIva(p.ivaTasa);
  renderTiers(p);
  renderModalPhotos([]);
  const urls = await loadPhotos(p);
  if (p === visibleProducts[modalIndex]) renderModalPhotos(urls);
}

function formatIva(v){
  const n=Number(v); if (!Number.isFinite(n)) return '—';
  return `${(n<=1?n*100:n).toLocaleString('es-MX',{maximumFractionDigits:2})}%`;
}
function renderTiers(p){
  const rows=[];
  if (Number.isFinite(Number(p.medioMayoreo))) rows.push(['Medio mayoreo', money(p.medioMayoreo)]);
  if (Number.isFinite(Number(p.mayoreo))) rows.push(['Mayoreo', money(p.mayoreo)]);
  if (Array.isArray(p.preciosPorCantidad)) {
    [...p.preciosPorCantidad].sort((a,b)=>Number(a.cantidadMinima)-Number(b.cantidadMinima)).forEach(r=>{
      if (!r) return;
      const left = `${r.cantidadMinima ?? ''} piezas`;
      const right = Number.isFinite(Number(r.precioTotal)) ? `${money(r.precioTotal)} total` : money(r.precioUnitario);
      rows.push([left,right]);
    });
  }
  els.modalPriceTiers.innerHTML = rows.map(([a,b])=>`<div class="tier-row"><span>${escapeHtml(a)}</span><strong>${escapeHtml(b)}</strong></div>`).join('');
}
function renderModalPhotos(urls){
  stopModalPhotoTimer();
  modalPhotoUrls = Array.isArray(urls) ? urls.filter(Boolean) : [];
  modalPhotoIndex = 0;
  els.modalThumbs.innerHTML='';

  if (!modalPhotoUrls.length) {
    els.modalImage.removeAttribute('src');
    els.modalImage.classList.add('hidden');
    els.modalImageFallback.classList.remove('hidden');
    els.modalImageFallback.textContent='SIN FOTO';
    return;
  }

  els.modalImageFallback.classList.add('hidden');
  els.modalImage.classList.remove('hidden');

  modalPhotoUrls.forEach((url,i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className=`modal-thumb ${i===0?'active':''}`;
    b.innerHTML=`<img src="${escapeAttr(url)}" alt="Foto ${i+1}">`;
    b.addEventListener('click',()=>{
      showModalPhoto(i);
      restartModalPhotoTimer();
    });
    els.modalThumbs.appendChild(b);
  });

  showModalPhoto(0);
  startModalPhotoTimer();
}

function showModalPhoto(index){
  if (!modalPhotoUrls.length) return;
  modalPhotoIndex = (index + modalPhotoUrls.length) % modalPhotoUrls.length;
  els.modalImage.src = modalPhotoUrls[modalPhotoIndex];
  els.modalImage.alt = `Foto ${modalPhotoIndex + 1} de ${modalPhotoUrls.length}`;
  els.modalThumbs.querySelectorAll('.modal-thumb').forEach((thumb,i)=>thumb.classList.toggle('active', i === modalPhotoIndex));
}

function nextModalPhoto(){
  if (modalPhotoUrls.length > 1) showModalPhoto(modalPhotoIndex + 1);
}

function startModalPhotoTimer(){
  stopModalPhotoTimer();
  if (modalPhotoUrls.length > 1 && !els.modal.classList.contains('hidden')) {
    modalPhotoTimer = setInterval(nextModalPhoto, 3000);
  }
}

function stopModalPhotoTimer(){
  if (modalPhotoTimer) { clearInterval(modalPhotoTimer); modalPhotoTimer = null; }
}

function restartModalPhotoTimer(){
  startModalPhotoTimer();
}

function closeModal(){
  stopModalPhotoTimer();
  modalPhotoUrls = [];
  modalPhotoIndex = 0;
  els.modal.classList.add('hidden');
  document.body.style.overflow='';
}
function changeModal(delta){ if (visibleProducts.length) openModal(modalIndex + delta); }

els.back.addEventListener('click',()=>{ els.search.value=''; renderCategories(); });
els.home.addEventListener('click',()=>{ els.search.value=''; renderCategories(); window.scrollTo({top:0,behavior:'smooth'}); });
els.reload.addEventListener('click',()=>location.reload());
els.clearSearch.addEventListener('click',()=>{ els.search.value=''; if(currentSubcategory) renderProducts(); else renderCategories(); els.search.focus(); });
els.search.addEventListener('input',()=>{
  if (currentSubcategory) renderProducts();
  else if (els.search.value.trim()) {
    // Búsqueda global desde inicio: muestra resultados como catálogo temporal.
    els.categoryView.classList.add('hidden'); els.productView.classList.remove('hidden'); currentSubcategory=''; els.currentCategoryLabel.textContent='BÚSQUEDA'; els.productHeading.textContent='Resultados'; renderProducts();
  } else renderCategories();
});
els.modalImage.addEventListener('click',()=>{ nextModalPhoto(); restartModalPhotoTimer(); });
els.modalClose.addEventListener('click',closeModal); els.modalPrev.addEventListener('click',()=>changeModal(-1)); els.modalNext.addEventListener('click',()=>changeModal(1));
els.modal.addEventListener('click',e=>{ if(e.target===els.modal) closeModal(); });
window.addEventListener('keydown',e=>{ if(els.modal.classList.contains('hidden')) return; if(e.key==='Escape') closeModal(); if(e.key==='ArrowLeft') changeModal(-1); if(e.key==='ArrowRight') changeModal(1); });

let touchX=null;
els.modal.addEventListener('touchstart',e=>{ touchX=e.changedTouches?.[0]?.clientX ?? null; },{passive:true});
els.modal.addEventListener('touchend',e=>{ if(touchX==null) return; const dx=(e.changedTouches?.[0]?.clientX ?? touchX)-touchX; touchX=null; if(Math.abs(dx)>70) changeModal(dx<0?1:-1); },{passive:true});

function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(s){ return escapeHtml(s); }
function demoProducts(){
  return [
    { id:'1299', activo:true, catalogoReposteria:true, codigoBarra:'1299', concepto:'CHAROLA CRISTAL INIX 1414 PZA MX120', precioPublico:4, medioMayoreo:3.2, mayoreo:2.9, marca:'INIX', departamento:'DESECHABLES', ivaTasa:.16, reposteriaSubclasificacion:'CHAROLAS', preciosPorCantidad:[{cantidadMinima:25,precioUnitario:3.2,precioTotal:80},{cantidadMinima:50,precioUnitario:2.9,precioTotal:145}] },
    { id:'demo2', activo:true, catalogoReposteria:true, codigoBarra:'DEMO002', concepto:'MOLDE DEMOSTRACIÓN', precioPublico:18.5, marca:'EJEMPLO', departamento:'DESECHABLES', ivaTasa:.16, reposteriaSubclasificacion:'MOLDES' },
    { id:'demo3', activo:true, catalogoReposteria:true, codigoBarra:'DEMO003', concepto:'BASE PARA PASTEL DEMOSTRACIÓN', precioPublico:22, marca:'EJEMPLO', departamento:'DESECHABLES', ivaTasa:.16, reposteriaSubclasificacion:'BASES' },
    { id:'demo4', activo:true, catalogoReposteria:true, codigoBarra:'DEMO004', concepto:'CAJA PARA PASTEL DEMOSTRACIÓN', precioPublico:35, marca:'EJEMPLO', departamento:'DESECHABLES', ivaTasa:.16, reposteriaSubclasificacion:'CAJAS' }
  ];
}

boot();
