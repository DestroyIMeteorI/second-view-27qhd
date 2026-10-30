'use strict';

/* ---------- 基礎工具 ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '待確認').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = p => typeof p === 'number' ? `NT$${p.toLocaleString('zh-TW')}` : '價格待確認';
const priceHTML = p => typeof p === 'number' ? `<small>NT$</small>${p.toLocaleString('zh-TW')}` : '待確認';
const safeUrl = u => /^https:\/\//.test(u || '') ? u : '#';
const link = (u, t) => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(t)} ↗</a>`;
const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

const productById = new Map(PRODUCTS.map(p => [p.id, p]));
const NEW_NOTE_BATCHES = new Set(['2026-10-30-backread', '2026-10-30-picks', '2026-10-30-forums', '2026-10-30-hidden']);
const COMPARE_KEY = 'display-notes-compare';
const VIEW_KEY = 'display-notes-density';
const MAX_COMPARE = 3;
const NOTE_STEP = 6;

const stockLabels = { available: '查核時可下單', out: '缺貨／候補', verify: '庫存／價格待確認', promotion: '活動庫存待確認', snapshot: '庫存以通路為準' };
const shortlistCount = PRODUCTS.filter(p => p.shortlist).length;
const pickByProduct = new Map(PICKS.map(pick => [pick.id, pick]));

/* ---------- 狀態 ---------- */
const selected = new Set();
const expanded = new Set();
let noteMode = 'new';
let notesLimit = NOTE_STEP;
let noticeTimer;
let highlightTimer;

try {
  const saved = JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
  if (Array.isArray(saved)) saved.filter(id => productById.has(id)).slice(0, MAX_COMPARE).forEach(id => selected.add(id));
} catch {}

/* ---------- 頁面文案與資料單一來源 ---------- */
function bindPageData() {
  const [pageNewest, pageOldest] = (RESEARCH.pages.match(/\d+/g) || []).map(Number);
  const written = RESEARCH.writtenBack.split('-');
  const values = {
    products: PRODUCTS.length,
    notes: FORUMS.length,
    shortlist: shortlistCount,
    newNotes: FORUMS.filter(f => NEW_NOTE_BATCHES.has(f.batch)).length,
    addedProducts: RESEARCH.addedProducts,
    pageNewest,
    pageOldest,
    pagesRead: pageNewest - pageOldest + 1,
    posts: RESEARCH.posts,
    visibleComments: RESEARCH.visibleComments,
    expandedComments: RESEARCH.expandedComments,
    commentsFrom: RESEARCH.commentsFrom,
    otherPages: RESEARCH.otherPages,
    fullDate: written.join('.'),
    shortDate: written.slice(1).join('.'),
    reviewDate: RESEARCH.recommendationReview.date,
    reviewScope: RESEARCH.recommendationReview.scope,
  };
  document.querySelectorAll('[data-bind]').forEach(node => { node.textContent = values[node.dataset.bind]; });
  document.querySelectorAll('[data-price]').forEach(node => {
    const p = productById.get(node.dataset.price);
    if (p && typeof p.price === 'number') node.textContent = p.price.toLocaleString('zh-TW');
  });
}

/* ---------- 顯示格式 ---------- */
function stockText(p) { return stockLabels[p.stockStatus] || stockLabels.snapshot; }
function stockBadge(p) {
  const tone = p.stockStatus === 'out' ? 'stock-out' : ['verify', 'promotion'].includes(p.stockStatus) ? 'warning' : '';
  return `<span class="badge ${tone}">${stockText(p)}</span>`;
}
function sourceLinks(p) { return (p.sources || []).map(s => link(s.url, s.label)).join(''); }
function compactPanel(p) {
  if (p.panel.includes('Mini LED')) return p.panel.includes('IPS') ? 'IPS · Mini LED' : 'Mini LED';
  if (p.panel.includes('WOLED')) return 'WOLED';
  if (p.panel.includes('QD-OLED')) return 'QD-OLED';
  if (p.panel.includes('OLED')) return 'OLED';
  if (p.panel.includes('IPS Black')) return 'IPS Black';
  return p.panel.replace(/／.*|\/.*|（.*|\(.*$/g, '').trim();
}
function compactUsb(p) {
  if (!p.usbcVideo) return '無影像輸入';
  const watts = p.usbc.match(/\d+(?:\.\d+)?\s*W/i)?.[0] || '';
  return `影像${watts ? '＋' + watts : ''}`;
}
function compactStand(p) {
  if (p.height && p.pivot) return '可升降＋直立';
  if (p.height) return '可升降';
  return p.stand.includes('無') ? '固定高度' : p.stand.split('；')[0].split('／')[0];
}

/* ---------- 搜尋 ---------- */
const brandAliases = { ASUS: '華碩', Acer: '宏碁 宏基', MSI: '微星', BenQ: '明基', GIGABYTE: '技嘉', Samsung: '三星', Dell: '戴爾', LG: '樂金', AOC: '艾德蒙', ViewSonic: '優派', Xiaomi: '小米', Lenovo: '聯想', Philips: '飛利浦' };
const normalize = s => s.toLowerCase().replace(/[\s\-_/／·・.]+/g, '');
const searchIndex = new Map(PRODUCTS.map(p => [p.id, normalize(`${p.brand} ${brandAliases[p.brand] || ''} ${p.model} ${p.panel} ${p.hz}hz`)]));
function matchesSearch(p, q) {
  const tokens = q.split(/\s+/).map(normalize).filter(Boolean);
  const text = searchIndex.get(p.id);
  return tokens.every(token => text.includes(token));
}

/* ---------- 篩選 ---------- */
const NO_FILTERS = { q: '', budget: 'all', panel: 'all', stand: false, usbc: false, picked: false, fps: false, hdr: false };
const PRESETS = {
  all: {},
  shortlist: { picked: true },
  value: { budget: '6000', stand: true },
  fps: { fps: true },
  hdr: { hdr: true },
};
let extraFilters = { fps: false, hdr: false };

function readFilters() {
  return {
    q: $('search').value.trim(),
    budget: $('budget').value,
    panel: $('panel').value,
    stand: $('stand').checked,
    usbc: $('usbc').checked,
    picked: $('only-picked').checked,
    ...extraFilters,
  };
}
function writeFilters(f) {
  $('search').value = f.q;
  $('budget').value = f.budget;
  $('panel').value = f.panel;
  $('stand').checked = f.stand;
  $('usbc').checked = f.usbc;
  $('only-picked').checked = f.picked;
  extraFilters = { fps: f.fps, hdr: f.hdr };
}
function matchesFilters(p, f) {
  if (f.q && !matchesSearch(p, f.q)) return false;
  if (f.budget !== 'all') {
    if (p.price === null) return false;
    if (f.budget === 'premium' ? p.price < 10000 : p.price > Number(f.budget)) return false;
  }
  if (f.panel !== 'all') {
    const fits = f.panel === 'IPS' ? p.panel.includes('IPS') && !p.panel.includes('Mini LED') : p.panel.includes(f.panel);
    if (!fits) return false;
  }
  if (f.stand && !(p.height && p.pivot)) return false;
  if (f.usbc && !p.usbcVideo) return false;
  if (f.picked && !p.shortlist) return false;
  if (f.fps && p.hz < 240) return false;
  if (f.hdr && !/Mini LED|OLED/.test(p.panel)) return false;
  return true;
}
function sortProducts(list) {
  const sort = $('sort').value;
  return list.sort((a, b) => {
    if (sort === 'hz') return (b.hz || 0) - (a.hz || 0) || (b.price || 0) - (a.price || 0);
    if (a.price === null) return b.price === null ? 0 : 1;
    if (b.price === null) return -1;
    return sort === 'asc' ? a.price - b.price : b.price - a.price;
  });
}
function activeConditions(f) {
  const out = [];
  if (f.q) out.push({ key: 'q', label: `搜尋：${f.q}` });
  if (f.budget !== 'all') out.push({ key: 'budget', label: $('budget').selectedOptions[0].textContent });
  if (f.panel !== 'all') out.push({ key: 'panel', label: $('panel').selectedOptions[0].textContent });
  if (f.stand) out.push({ key: 'stand', label: '可升降＋直立' });
  if (f.usbc) out.push({ key: 'usbc', label: 'USB-C 影像' });
  if (f.picked) out.push({ key: 'picked', label: `本輪 ${shortlistCount} 款` });
  if (f.fps) out.push({ key: 'fps', label: '240Hz 起' });
  if (f.hdr) out.push({ key: 'hdr', label: 'Mini LED / OLED' });
  return out;
}
/* 快捷按鈕反映實際條件：條件都成立才亮起；「全部候選」只在完全沒有條件時亮起。 */
function presetIsActive(name, f, conditions) {
  if (name === 'all') return !conditions.length;
  return Object.entries(PRESETS[name]).every(([key, value]) => f[key] === value);
}

/* ---------- 官方產品圖：圖片版權屬各品牌，來源頁列在頁尾。沒有官方圖的型號就不放圖。 ---------- */
const PRODUCT_IMAGES = {
  'asus-xg27acs': { name: 'ASUS ROG Strix XG27ACS-W（白色款）', page: 'https://rog.asus.com/tw/monitors/27-to-31-5-inches/rog-strix-xg27acs-w/', credit: 'ASUS' },
  'dell-s2725dc': { name: 'Dell S2725DC', page: 'https://www.dell.com/zh-tw/shop/monitors/apd/dell-27-plus-qhd-usb-c-顯示器-s2725dc/s2725dc/-', credit: 'Dell' },
  'dell-s2725dsm': { name: 'Dell S2725DSM', page: 'https://www.dell.com/zh-tw/shop/monitors/apd/dell-27-plus-qhd-monitor-s2725dsm/s2725dsm/-' },
  'gigabyte-mo27q28g': { name: 'GIGABYTE MO27Q28G', page: 'https://www.gigabyte.com/tw/Monitor/MO27Q28G', credit: 'GIGABYTE' },
  'xiaomi-gpro27qi2026': { name: 'Xiaomi G Pro 27Qi 2026', page: 'https://www.mi.com/tw/product/xiaomi-mini-led-gaming-monitor-g-pro-27qi/', credit: '小米' },
  'benq-ew270q': { name: 'BenQ EW270Q', page: 'https://www.benq.com/zh-tw/monitor/home/ew270q.html', credit: 'BenQ' },
  'xg27aqmr': { name: 'ASUS ROG Strix XG27AQMR', page: 'https://rog.asus.com/monitors/27-to-31-5-inches/rog-strix-xg27aqmr/' },
};
function productShot(id, className = '', eager = false) {
  const image = PRODUCT_IMAGES[id];
  if (!image) return '';
  return `<div class="shot ${className}"><img src="images/${id}.webp" width="900" height="675" alt="${esc(image.name)} 官方產品圖" ${eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}></div>`;
}

/* ---------- 產品清單 ---------- */
function productCard(p, i) {
  const open = expanded.has(p.id);
  const isSelected = selected.has(p.id);
  return `<article class="product ${isSelected ? 'selected' : ''}" id="product-${p.id}">
    <div class="product-header">
      <div class="product-title">
        <div class="model-brand"><span class="row-num">${String(i + 1).padStart(2, '0')}</span>${esc(p.brand)}${p.newInBatch ? '<span class="new-tag">NEW</span>' : ''}</div>
        <h3>${esc(p.model)}</h3>
      </div>
      <div class="price-col">
        <div class="price">${priceHTML(p.price)}</div>
        <div class="price-date">查核 <span>${esc(p.priceCheckedDate)}</span></div>
      </div>
    </div>
    <div class="badges">${pickByProduct.has(p.id) ? `<span class="badge tier-badge">${esc(pickByProduct.get(p.id).tierLabel)}推薦</span>` : p.shortlist ? '<span class="badge pick-badge">本輪重點</span>' : ''}${stockBadge(p)}${p.caution ? `<span class="badge warning">${esc(p.caution)}</span>` : ''}</div>
    <div class="spec-chips">
      <div><span>面板 / 更新率</span><strong>${esc(compactPanel(p))} · ${p.hz ?? '—'}Hz</strong></div>
      <div><span>原廠支架</span><strong>${esc(compactStand(p))}</strong></div>
      <div><span>USB-C 影像 / 供電</span><strong>${esc(compactUsb(p))}</strong></div>
    </div>
    <p class="verdict">${esc(p.verdict)}</p>
    <div class="product-actions">
      <label class="compare-label"><input type="checkbox" data-compare="${p.id}" ${isSelected ? 'checked' : ''}><span class="sr-only">加入</span>比較<span class="sr-only">：${esc(p.model)}</span></label>
      <button type="button" class="detail-toggle" data-detail="${p.id}" aria-expanded="${open}" aria-controls="detail-${p.id}" aria-label="${esc(p.model)} 的詳情">${open ? '收起 −' : '詳情 ＋'}</button>
    </div>
    <div class="product-detail" id="detail-${p.id}" ${open ? '' : 'hidden'}>
      <div class="detail-main">
        <h4 class="detail-verdict">選購判斷</h4><p class="detail-verdict">${esc(p.verdict)}</p>
        <h4>值得考慮的原因</h4><p>${esc(p.pros)}</p>
        <h4>購買前的取捨</h4><p>${esc(p.cons)}</p>
        ${p.gaming ? `<h4>遊戲連接與同步</h4><p>${esc(p.gaming)}</p>` : ''}
        <h4>價格與庫存</h4><p>${esc(p.priceType)}。${esc(p.priceNote)}</p>
        <h4>證據限制</h4><p>${esc(p.evidenceNote || '規格依原廠／通路揭露；未自行購機或拆解，無法推定內部用料與故障率。')}</p>
      </div>
      <div class="detail-side">
        ${productShot(p.id, 'detail-shot')}
        <dl class="detail-spec">
          <dt>亮度</dt><dd>${esc(p.brightness)}</dd>
          <dt>支架</dt><dd>${esc(p.stand)}</dd>
          <dt>USB-C</dt><dd>${esc(p.usbc)}</dd>
          <dt>接口</dt><dd>${esc(p.ports)}</dd>
          <dt>VESA</dt><dd>${esc(p.vesa)}</dd>
          <dt>台灣保固</dt><dd>${esc(p.warranty)}</dd>
        </dl>
        <div class="source-links">${sourceLinks(p)}</div>
      </div>
    </div>
  </article>`;
}
function emptyState(f, conditions) {
  const relaxations = conditions
    .map(c => ({ ...c, count: PRODUCTS.filter(p => matchesFilters(p, { ...f, [c.key]: NO_FILTERS[c.key] })).length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const buttons = relaxations.map(c => `<button type="button" class="relax" data-clear="${c.key}">拿掉「${esc(c.label)}」，看 ${c.count} 款</button>`).join('');
  return `<div class="empty"><b>這組條件，暫時沒有符合的型號。</b><p>可以放寬下列條件，或全部重設再看看。</p><div class="empty-actions">${buttons}<button type="button" class="primary-small" data-reset>重設全部條件</button></div></div>`;
}
function render() {
  const f = readFilters();
  const conditions = activeConditions(f);
  const list = sortProducts(PRODUCTS.filter(p => matchesFilters(p, f)));

  $('results').innerHTML = `<strong>${list.length}</strong> / ${PRODUCTS.length} 款<span class="results-sort">・${esc($('sort').selectedOptions[0].textContent)}</span>`;
  $('active-filters').innerHTML = conditions.map(c => `<button type="button" data-clear="${c.key}" aria-label="移除條件：${esc(c.label)}">${esc(c.label)} <span aria-hidden="true">×</span></button>`).join('');

  const hiddenCount = conditions.filter(c => c.key !== 'q').length;
  const isOpen = $('filter-options').classList.contains('open');
  $('filter-toggle').innerHTML = `篩選條件${hiddenCount ? ` · ${hiddenCount}` : ''} <span aria-hidden="true">${isOpen ? '−' : '＋'}</span>`;

  $('product-list').innerHTML = list.length ? list.map(productCard).join('') : emptyState(f, conditions);

  document.querySelectorAll('[data-scenario]').forEach(btn => {
    const active = presetIsActive(btn.dataset.scenario, f, conditions);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}
function focusResults() { $('results').focus({ preventScroll: true }); }
function resetAll() {
  writeFilters(NO_FILTERS);
  $('sort').value = 'desc';
  render();
}
function clearCondition(key) {
  writeFilters({ ...readFilters(), [key]: NO_FILTERS[key] });
  render();
}
function selectPreset(name) {
  writeFilters({ ...NO_FILTERS, ...PRESETS[name] });
  render();
}
function setFilterPanel(open) {
  $('filter-options').classList.toggle('open', open);
  $('filter-toggle').setAttribute('aria-expanded', String(open));
  $('filter-toggle').querySelector('span').textContent = open ? '−' : '＋';
}
function setDetail(id, open) {
  const button = document.querySelector(`[data-detail="${CSS.escape(id)}"]`);
  if (open) expanded.add(id); else expanded.delete(id);
  if (!button) return;
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? '收起 −' : '詳情 ＋';
  $(`detail-${id}`).hidden = !open;
}
function setView(view) {
  $('product-list').classList.toggle('compact', view === 'compact');
  $('list-head').hidden = view !== 'compact';
  document.querySelectorAll('[data-view]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.view === view)));
  try { localStorage.setItem(VIEW_KEY, view); } catch {}
}
function jumpToProduct(id, { updateHash = true } = {}) {
  let node = $(`product-${id}`);
  if (!node) {
    writeFilters(NO_FILTERS);
    render();
    tell('已清除篩選條件，以顯示這款。');
    node = $(`product-${id}`);
  }
  if (!node) return;
  setDetail(id, true);
  node.scrollIntoView({ behavior: motion() });
  document.querySelectorAll('.product.highlight').forEach(n => n.classList.remove('highlight'));
  node.classList.add('highlight');
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => node.classList.remove('highlight'), 2500);
  node.querySelector('[data-detail]').focus({ preventScroll: true });
  if (updateHash) history.replaceState(null, '', `#product-${id}`);
}

/* ---------- 推薦 ---------- */
const fullName = p => `${p.brand} ${p.model}`;
const isOled = p => p.panel.includes('OLED');
const standOf = p => p.height && p.pivot ? '可升降直立' : compactStand(p);

function compareButton(id) {
  const on = selected.has(id);
  return `<button type="button" class="ghost" data-pick-compare="${id}" aria-pressed="${on}">${on ? '已加入比較' : '加入比較'}<span class="sr-only">：${esc(productById.get(id).model)}</span></button>`;
}
function evidenceLine(e) {
  const source = e.url ? ` <a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">原文 ↗</a>` : '';
  return `<b>${esc(e.kind)}</b>　${esc(e.text)}${source}`;
}
function renderPicks() {
  $('tiers').innerHTML = PICKS.map(pick => {
    const p = productById.get(pick.id);
    const alt = productById.get(pick.alt.id);
    return `<article class="tier" id="tier-${pick.tier}">
      ${productShot(p.id, 'tier-shot', true)}
      <div class="tier-body">
        <div class="tier-kicker">${esc(pick.tierLabel)}・${esc(pick.label)}</div>
        <h3>${esc(fullName(p))}</h3>
        <div class="tier-price"><span class="num">${money(p.price)}</span>${stockBadge(p)}</div>
        <p class="tier-date">${esc(p.priceType)}｜<span>查核 ${esc(p.priceCheckedDate)}</span></p>
        <p class="tier-reason">${esc(pick.headline)}</p>
        <ul class="tier-facts">
          <li>${esc(compactPanel(p))} ${p.hz}Hz</li>
          <li>${esc(standOf(p))}</li>
          <li>USB-C ${esc(compactUsb(p))}</li>
          <li>保固 ${esc(pick.warrantyShort)}</li>
        </ul>
        <p class="tier-watch">注意：${esc(pick.watchShort)}</p>
        <div class="tier-actions">
          <a class="primary" href="#product-${p.id}" data-jump="${p.id}">全部規格 <span aria-hidden="true">↓</span></a>
          ${compareButton(p.id)}
        </div>
        <details class="tier-more">
          <summary>實測、回報與備選 <span aria-hidden="true">＋</span></summary>
          <div class="tier-block">
            ${pick.evidence.map(e => `<p class="ev">${evidenceLine(e)}</p>`).join('')}
            <p class="ev"><b>保固</b>　${esc(pick.warranty)}</p>
            <p class="ev"><b>要注意</b>　${esc(pick.watch)}</p>
            <p class="ev"><b>和 XG27AQMR 比</b>　${esc(pick.upgrade)}</p>
          </div>
          <div class="tier-alt">
            <b>${esc(pick.alt.when)}</b> → <a href="#product-${alt.id}" data-jump="${alt.id}">${esc(fullName(alt))}</a>，${money(alt.price)}（${esc(stockText(alt))}｜查核 ${esc(alt.priceCheckedDate)}）
            <p>${esc(pick.alt.note)}</p>
          </div>
        </details>
      </div>
    </article>`;
  }).join('');
}

/* ---------- 三題選擇：寫死的對照規則，不計分 ---------- */
function adviceFor(budget, use, laptop) {
  if (budget === 'low') {
    if (laptop === 'yes') return ['benq-ew270q', '6 千內少數有 USB-C 65W。支架不能升降、不能直立。'];
    if (use === 'media') return ['asus-xg27acs', '6 千內沒有真正的 HDR；想要畫質要加預算。'];
    return ['asus-xg27acs', '支架完整、資料最齊。DP 白線回報多，到貨先測。'];
  }
  if (use === 'media' && budget === 'high') {
    return ['gigabyte-mo27q28g', `OLED 差異最大，建議當主螢幕。${laptop === 'yes' ? 'USB-C 預設 18W，筆電供電要開 Smart PD 再確認。' : ''}`];
  }
  if (use === 'media' && laptop === 'no') return ['xiaomi-gpro27qi2026', 'Mini LED＋完整支架。台灣保固未核實，下單前先問。'];
  if (laptop === 'yes') return ['dell-s2725dc', use === 'media' ? '強項是一條線和保固，不是畫質。' : '一條線接畫面和供電，保固省事。'];
  return ['dell-s2725dsm', '少了 USB-C 省 1,000 元；本身沒找到獨立實測。'];
}
function renderDecide() {
  const form = $('decide-form').elements;
  const [id, why] = adviceFor(form.budget.value, form.use.value, form.laptop.value);
  const p = productById.get(id);
  $('decide-result').innerHTML = `${productShot(p.id, 'decide-shot')}
    <div class="decide-body">
      <div class="decide-kicker">建議看這台</div>
      <h3>${esc(fullName(p))}</h3>
      <div class="num">${money(p.price)}</div>
      <div class="decide-price-note">${esc(stockText(p))}｜查核 ${esc(p.priceCheckedDate)}</div>
      <p class="decide-why">${esc(why)}</p>
      <div class="decide-actions">
        <a class="ghost" href="#product-${p.id}" data-jump="${p.id}">全部規格</a>
        ${compareButton(p.id)}
      </div>
    </div>`;
}

function renderImageCredit() {
  const credits = Object.values(PRODUCT_IMAGES).filter(image => image.credit);
  $('image-credit').innerHTML = `產品圖來自品牌官網，版權屬各品牌：${credits.map(image => link(image.page, image.credit)).join('、')}`;
}

/* ---------- 和現有螢幕並排 ---------- */
/* XG27AQMR 不是候選，所以不放進研究資料；規格依 ASUS 規格頁，沒核對的項目寫「—」。 */
const CURRENT_MONITOR = {
  name: 'ROG Strix XG27AQMR',
  source: 'https://rog.asus.com/monitors/27-to-31-5-inches/rog-strix-xg27aqmr/spec',
  panel: 'Fast IPS',
  hz: '300Hz',
  brightness: 'SDR 350 nits；DisplayHDR 600',
  stand: '—',
  usbc: '規格頁未列 USB-C 影像',
  speakers: '無',
  warranty: '—',
};
const speakersOf = p => p.ports.match(/\d+W×\d喇叭/)?.[0].replace('喇叭', '') || '無';
const versusRows = [
  ['價格', () => '已持有', p => money(p.price)],
  ['面板', c => `${c.panel} ${c.hz}`, p => `${compactPanel(p)} ${p.hz}Hz`],
  ['支架', c => c.stand, standOf],
  ['USB-C', () => '規格頁未列', compactUsb],
  ['喇叭', c => c.speakers, speakersOf],
  ['保固', c => c.warranty, (p, pick) => pick.warrantyShort],
  ['升級感', () => '—', (p, pick) => pick.upgradeShort],
];
function renderVersus() {
  const picks = PICKS.map(pick => [productById.get(pick.id), pick]);
  $('versus-table').style.setProperty('--cols', picks.length + 1);
  $('versus-table').innerHTML = `<thead><tr><th scope="col">項目</th>
      <th scope="col" class="is-current">${productShot('xg27aqmr', 'th-shot')}<small>現有</small><span class="th-model">${esc(CURRENT_MONITOR.name)}</span></th>
      ${picks.map(([p, pick]) => `<th scope="col">${productShot(p.id, 'th-shot')}<small>${esc(pick.tierLabel)}</small><span class="th-model">${esc(p.model)}</span></th>`).join('')}
    </tr></thead>
    <tbody>
      ${versusRows.map(([label, current, other]) => `<tr><th scope="row">${label}</th><td class="is-current">${esc(current(CURRENT_MONITOR))}</td>${picks.map(([p, pick]) => `<td>${esc(other(p, pick))}</td>`).join('')}</tr>`).join('')}
      <tr><th scope="row">來源</th><td class="is-current">${link(CURRENT_MONITOR.source, 'ASUS 規格頁')}</td>${picks.map(([p]) => `<td><a href="#product-${p.id}" data-jump="${p.id}">完整規格與來源</a></td>`).join('')}</tr>
    </tbody>`;
}

/* ---------- 提示 ---------- */
function tell(message) {
  const notice = $('notice');
  notice.textContent = '';
  notice.classList.add('visible');
  setTimeout(() => { notice.textContent = message; }, 20);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3500);
}

/* ---------- 比較 ---------- */
function updateCompare() {
  try { localStorage.setItem(COMPARE_KEY, JSON.stringify([...selected])); } catch {}
  $('compare-bar').hidden = !selected.size;
  $('compare-count').textContent = `已選 ${selected.size} / ${MAX_COMPARE} 款`;
  $('compare-items').innerHTML = [...selected].map(id => {
    const p = productById.get(id);
    return `<div class="compare-chip"><span title="${esc(p.model)}">${esc(p.model)}</span><button type="button" data-remove="${id}" aria-label="移除 ${esc(p.model)}">×</button></div>`;
  }).join('');
  document.querySelectorAll('[data-compare]').forEach(input => {
    input.checked = selected.has(input.dataset.compare);
    input.closest('.product').classList.toggle('selected', input.checked);
  });
  document.querySelectorAll('[data-pick-compare]').forEach(button => {
    const id = button.dataset.pickCompare;
    const on = selected.has(id);
    button.setAttribute('aria-pressed', String(on));
    button.firstChild.textContent = on ? '已加入比較' : '加入比較';
  });
}
function setCompared(id, on) {
  if (on && !selected.has(id) && selected.size >= MAX_COMPARE) {
    tell(`最多比較 ${MAX_COMPARE} 款，請先從下方移除一款。`);
    return false;
  }
  if (on) selected.add(id); else selected.delete(id);
  updateCompare();
  return true;
}
const compareFields = [
  ['公開標價', p => money(p.price)],
  ['價格查核日', p => p.priceCheckedDate],
  ['查核時庫存', stockText],
  ['價格說明', p => p.priceNote],
  ['面板', p => p.panel],
  ['解析度', () => '2560 × 1440 · 平面'],
  ['更新率', p => `${p.hz ?? '—'}Hz`],
  ['遊戲連接與同步', p => p.gaming || '各輸入埠上限與VRR相容性請核對原廠手冊；未補查完整動態實測。'],
  ['亮度', p => p.brightness],
  ['支架', p => p.stand],
  ['USB-C', p => p.usbc],
  ['接口', p => p.ports],
  ['VESA', p => p.vesa],
  ['保固', p => p.warranty],
  ['選購判斷', p => p.verdict],
  ['主要限制', p => p.cons],
];
function renderComparison() {
  const items = [...selected].map(id => productById.get(id));
  const comparable = items.length > 1;
  const onlyDiff = $('differences').checked && comparable;
  const rows = compareFields.filter(([, fn]) => !onlyDiff || new Set(items.map(fn)).size > 1);

  $('differences').disabled = !comparable;
  $('compare-status').textContent = !comparable
    ? '再選一款才能看差異；價格、庫存不是即時資料。'
    : onlyDiff
      ? `已隱藏 ${compareFields.length - rows.length} 個相同項目；價格、庫存不是即時資料。`
      : '依公開規格比較；價格、庫存不是即時資料。';

  $('compare-content').innerHTML = `<div class="table-frame"><div class="table-scroll" tabindex="0" role="region" aria-label="可水平捲動的螢幕規格比較表"><table style="--cols:${items.length}">
    <thead><tr><th scope="col">比較項目</th>${items.map(p => `<th scope="col"><small>${esc(p.brand)}</small><span class="th-model">${esc(p.model)}</span><button type="button" class="th-remove" data-table-remove="${p.id}" aria-label="從比較移除 ${esc(p.model)}">移除</button></th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map(([label, fn]) => `<tr><th scope="row">${label}</th>${items.map(p => `<td>${esc(fn(p))}</td>`).join('')}</tr>`).join('')}
      <tr><th scope="row">查核來源</th>${items.map(p => `<td>${sourceLinks(p)}</td>`).join('')}</tr>
    </tbody></table></div></div>`;
  $('compare-content').querySelector('.table-scroll').addEventListener('scroll', updateScrollCue, { passive: true });
  updateScrollCue();
}
function syncScrollEdges(scroller) {
  const overflow = scroller.scrollWidth > scroller.clientWidth + 2;
  const frame = scroller.parentElement;
  frame.classList.toggle('can-left', overflow && scroller.scrollLeft > 2);
  frame.classList.toggle('can-right', overflow && scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2);
  return overflow;
}
function updateScrollCue() {
  const scroller = $('compare-content').querySelector('.table-scroll');
  if (scroller) $('scroll-hint').hidden = !syncScrollEdges(scroller);
  syncVersusCue();
}
function syncVersusCue() {
  const overflow = syncScrollEdges($('versus-scroll'));
  $('versus-hint').textContent = `「—」＝未核對。${overflow ? '可左右滑動。' : ''}`;
}
function openComparison() {
  if (!selected.size) return;
  $('compare-dialog').showModal();
  renderComparison();
}

/* ---------- 研究筆記 ---------- */
function renderForums() {
  const platform = $('note-platform').value;
  const list = FORUMS
    .filter(f => noteMode === 'all' || NEW_NOTE_BATCHES.has(f.batch))
    .filter(f => platform === 'all' || (platform === 'other' ? !/巴哈|PTT|Reddit|Mobile01/i.test(f.platform) : f.platform.includes(platform)));
  const shown = list.slice(0, notesLimit);
  $('note-results').textContent = `顯示 ${shown.length} / ${list.length} 則${noteMode === 'new' ? '本輪新增' : '研究'}筆記`;
  $('forum-list').innerHTML = shown.length
    ? shown.map(f => `<article class="forum" tabindex="-1">
        <div class="forum-meta"><span>${esc(f.platform)}</span><time>${esc(f.date)}</time></div>
        <h3>${esc(f.title)}</h3>
        <span class="evidence-kind">${esc(f.kind || '討論／心得')}</span>
        <details class="forum-more">
          <summary>摘要與限制 <span aria-hidden="true">＋</span></summary>
          <p>${esc(f.summary)}</p>
          <p class="limitation">${esc(f.limit)}</p>
        </details>
        ${link(f.url, '閱讀原文')}
      </article>`).join('')
    : `<div class="empty"><b>這個範圍沒有筆記。</b><p>本輪新增以巴哈回讀為主；PTT 等來源可切換「全部筆記」。</p><div class="empty-actions"><button type="button" class="primary-small" data-all-notes>${noteMode === 'new' ? '查看全部筆記' : '顯示所有來源'}</button></div></div>`;
  $('more-notes').hidden = shown.length >= list.length;
  $('more-notes').textContent = `再看 ${Math.min(NOTE_STEP, list.length - shown.length)} 則筆記 ↓`;
  document.querySelectorAll('[data-notes]').forEach(btn => {
    const active = btn.dataset.notes === noteMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

/* ---------- 事件 ---------- */
for (const id of ['budget', 'panel', 'sort', 'stand', 'usbc', 'only-picked']) $(id).addEventListener('change', render);
$('search').addEventListener('input', render);
$('search').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('reset').addEventListener('click', resetAll);
$('filter-toggle').addEventListener('click', () => setFilterPanel(!$('filter-options').classList.contains('open')));

$('back-to-filters').addEventListener('click', () => {
  const toggle = $('filter-toggle');
  const collapsible = toggle.offsetParent !== null;
  if (collapsible) setFilterPanel(true);
  document.querySelector('.scenario-row').scrollIntoView({ behavior: motion() });
  (collapsible ? toggle : $('search')).focus({ preventScroll: true });
});
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => { $('back-to-filters').hidden = entry.isIntersecting; }, { rootMargin: '-80px 0px 0px 0px' }).observe($('filter-box'));
}

$('active-filters').addEventListener('click', e => {
  const button = e.target.closest('[data-clear]');
  if (!button) return;
  const index = [...e.currentTarget.children].indexOf(button);
  clearCondition(button.dataset.clear);
  const chips = e.currentTarget.children;
  (chips[index] || chips[chips.length - 1] || $('results')).focus({ preventScroll: true });
});

$('product-list').addEventListener('change', e => {
  const id = e.target.dataset.compare;
  if (!id || !productById.has(id)) return;
  if (!setCompared(id, e.target.checked)) e.target.checked = false;
});
$('product-list').addEventListener('click', e => {
  const detail = e.target.closest('[data-detail]');
  if (detail) setDetail(detail.dataset.detail, detail.getAttribute('aria-expanded') !== 'true');
  if (e.target.closest('[data-reset]')) { resetAll(); focusResults(); }
  const relax = e.target.closest('[data-clear]');
  if (relax) { clearCondition(relax.dataset.clear); focusResults(); }
});

$('compare-items').addEventListener('click', e => {
  const button = e.target.closest('[data-remove]');
  if (!button) return;
  const index = [...selected].indexOf(button.dataset.remove);
  selected.delete(button.dataset.remove);
  updateCompare();
  const remaining = $('compare-items').querySelectorAll('[data-remove]');
  (remaining[index] || remaining[remaining.length - 1] || $('results')).focus({ preventScroll: true });
});
$('clear-compare').addEventListener('click', () => {
  selected.clear();
  updateCompare();
  tell('已清空比較清單。');
  focusResults();
});
$('show-compare').addEventListener('click', openComparison);
$('close-compare').addEventListener('click', () => $('compare-dialog').close());
$('differences').addEventListener('change', renderComparison);
$('compare-content').addEventListener('click', e => {
  const button = e.target.closest('[data-table-remove]');
  if (!button) return;
  const index = [...selected].indexOf(button.dataset.tableRemove);
  selected.delete(button.dataset.tableRemove);
  updateCompare();
  if (!selected.size) {
    $('compare-dialog').close();
    focusResults();
    return;
  }
  renderComparison();
  const remaining = $('compare-content').querySelectorAll('[data-table-remove]');
  (remaining[index] || remaining[remaining.length - 1]).focus();
});
$('compare-dialog').addEventListener('click', e => {
  if (e.target !== $('compare-dialog')) return;
  const r = e.target.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
});
window.addEventListener('resize', updateScrollCue);
$('versus-scroll').addEventListener('scroll', syncVersusCue, { passive: true });
$('decide-form').addEventListener('change', () => { renderDecide(); });
$('decide-form').addEventListener('submit', e => e.preventDefault());

$('note-platform').addEventListener('change', () => { notesLimit = NOTE_STEP; renderForums(); });
$('more-notes').addEventListener('click', () => {
  const firstNew = notesLimit;
  notesLimit += NOTE_STEP;
  renderForums();
  $('forum-list').children[firstNew]?.focus({ preventScroll: true });
});
$('forum-list').addEventListener('click', e => {
  if (!e.target.closest('[data-all-notes]')) return;
  if (noteMode === 'new') noteMode = 'all'; else $('note-platform').value = 'all';
  notesLimit = NOTE_STEP;
  renderForums();
  $('note-results').focus({ preventScroll: true });
});

document.addEventListener('click', e => {
  const scenario = e.target.closest('[data-scenario]');
  if (scenario) selectPreset(scenario.dataset.scenario);
  const view = e.target.closest('[data-view]');
  if (view) setView(view.dataset.view);
  const pickCompare = e.target.closest('[data-pick-compare]');
  if (pickCompare) setCompared(pickCompare.dataset.pickCompare, !selected.has(pickCompare.dataset.pickCompare));
  const noteButton = e.target.closest('[data-notes]');
  if (noteButton) { noteMode = noteButton.dataset.notes; notesLimit = NOTE_STEP; renderForums(); }
  const jump = e.target.closest('[data-jump]');
  if (jump) { e.preventDefault(); jumpToProduct(jump.dataset.jump); }
});

/* 比較列的實際高度給頁尾留白、捲動定位與提示位置使用，避免遮住內容。 */
const barObserver = new ResizeObserver(([entry]) => {
  const h = entry.target.hidden ? 0 : Math.ceil(entry.target.getBoundingClientRect().height) + 24;
  document.documentElement.style.setProperty('--bar-h', `${h}px`);
});
barObserver.observe($('compare-bar'));

function jumpFromHash(options) {
  const id = location.hash.startsWith('#product-') ? decodeURIComponent(location.hash.slice(9)) : '';
  if (productById.has(id)) jumpToProduct(id, options);
}
window.addEventListener('hashchange', () => jumpFromHash({ updateHash: false }));

/* ---------- 啟動 ---------- */
bindPageData();
renderImageCredit();
renderPicks();
renderDecide();
renderVersus();
renderForums();
render();
updateCompare();
syncVersusCue();
try { setView(localStorage.getItem(VIEW_KEY) === 'full' ? 'full' : 'compact'); } catch { setView('compact'); }
jumpFromHash({ updateHash: false });
