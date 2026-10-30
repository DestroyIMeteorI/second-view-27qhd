'use strict';

/* ---------- 基礎工具 ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = p => typeof p === 'number' ? `NT$${p.toLocaleString('zh-TW')}` : '—';
const priceHTML = p => typeof p === 'number' ? `<small>NT$</small>${p.toLocaleString('zh-TW')}` : '—';
const safeUrl = u => /^https:\/\//.test(u || '') ? u : '#';
const link = (u, t) => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(t)}</a>`;
const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

const productById = new Map(PRODUCTS.map(p => [p.id, p]));
const NEW_NOTE_BATCHES = new Set(['2026-10-30-backread', '2026-10-30-picks', '2026-10-30-forums', '2026-10-30-hidden', '2026-10-30-top']);
const COMPARE_KEY = 'display-notes-compare';
const VIEW_KEY = 'display-notes-density';
const MAX_COMPARE = 3;
const NOTE_STEP = 6;

const stockLabels = { available: '可購買', out: '缺貨' };
const shortlistCount = PRODUCTS.filter(p => p.shortlist).length;
const pickByProduct = new Map(PICKS.map(pick => [pick.id, pick]));

/* ---------- 規格判讀：所有用途判斷都由下列明確規則得出，不計分、不排名 ---------- */
const isOled = p => p.panel.includes('OLED');
const isMini = p => p.panel.includes('Mini LED');
const isVa = p => /\bVA\b/.test(p.panel);
const specOf = p => p.spec || {};
const hasVrr = p => Boolean(specOf(p).vrr) && specOf(p).vrr !== '無';
const hasSpeakers = p => Boolean(specOf(p).speakers) && specOf(p).speakers !== '無';
const usbcWatts = p => specOf(p).usbcWatts ?? null;
const panelKind = p => {
  if (isMini(p)) return isVa(p) ? 'mini-va' : 'mini-ips';
  if (p.panel.includes('QD-OLED')) return 'qd-oled';
  if (isOled(p)) return 'woled';
  return p.panel.includes('IPS Black') ? 'ips-black' : 'ips';
};

const FIT = {
  good: { mark: '◎', text: '適合' },
  ok: { mark: '○', text: '可用' },
  no: { mark: '－', text: '不優先' },
  unknown: { mark: '？', text: '未查得' },
};
const USES = {
  office: {
    label: '文書', name: '文書與網頁',
    look: ['文字：IPS 類最穩，OLED 文字邊緣有色邊', '亮度：SDR 300 nits 起，亮室 350 nits 以上', '支架：可升降；看長文件再加直立', '顯示：長時間靜態畫面，OLED 有烙印風險'],
    rule: '非 OLED、非 VA、SDR 300 nits 以上且可升降為「適合」；其餘非 OLED 為「可用」；OLED 為「不優先」。',
    fit(p) {
      if (isOled(p)) return ['no', 'OLED 靜態畫面有烙印風險，文字邊緣較不銳利'];
      const nits = specOf(p).sdrNits;
      if (isVa(p)) return ['ok', 'VA 可視角較窄，側看顏色會偏移'];
      if (!p.height) return ['ok', '面板合適，但支架無法升降'];
      if (nits === null || nits === undefined) return ['ok', '未查得 SDR 亮度'];
      if (nits < 300) return ['ok', `SDR ${nits} nits，亮室偏暗`];
      return ['good', `非 OLED、SDR ${nits} nits、可升降`];
    },
  },
  media: {
    label: '影音', name: '影音與 HDR',
    look: ['黑位：OLED 優於 Mini LED，再優於一般 IPS', 'HDR：要有控光；DisplayHDR 400 差異不大', '環境：亮室 OLED 黑色會浮起，Mini LED 較亮', '音訊：內建喇叭多為 2–5W，僅供應急'],
    rule: 'OLED 或 Mini LED 為「適合」；IPS Black 或色域達 90% DCI-P3 為「可用」；其餘一般 IPS 為「不優先」。',
    fit(p) {
      if (isOled(p)) return ['good', '自發光，黑位最深、無光暈'];
      if (isMini(p)) return ['good', specOf(p).dimmingZones ? `${specOf(p).dimmingZones} 區 Mini LED 控光` : 'Mini LED 控光'];
      if (p.panel.includes('IPS Black')) return ['ok', 'IPS Black 對比高於一般 IPS，但無局部控光'];
      const p3 = Number((specOf(p).gamut || '').match(/(\d+)%\s*(?:DCI-)?P3/)?.[1] || 0);
      if (p3 >= 90) return ['ok', `${p3}% DCI-P3 廣色域，但無局部控光`];
      return ['no', '一般 IPS 暗房黑色偏灰，HDR 效果有限'];
    },
  },
  fps: {
    label: '競技', name: '競技遊戲',
    look: ['更新率：240Hz 起，顯示卡幀率要跟得上', '反應：OLED 最快，IPS 次之', '同步：G-SYNC Compatible 或 FreeSync', '接口：最高更新率多半要用 DP'],
    rule: '240Hz 以上且支援 VRR 為「適合」；165–239Hz 且支援 VRR 為「可用」；低於 165Hz 或無 VRR 為「不優先」。',
    fit(p) {
      if (p.hz < 165) return ['no', `${p.hz}Hz，低於競技常見門檻`];
      if (!hasVrr(p)) return specOf(p).vrr === '無' ? ['no', '無 VRR，幀率波動時易撕裂'] : ['unknown', '未查得 VRR 支援'];
      return [p.hz >= 240 ? 'good' : 'ok', `${p.hz}Hz，支援 VRR`];
    },
  },
  single: {
    label: '單機', name: '單機大作',
    look: ['畫質：OLED、Mini LED 的差異最明顯', '更新率：144Hz 起即足夠', '同步：幀率波動大，需 VRR', '顯示卡：QHD 高畫質設定吃效能'],
    rule: 'OLED 或 Mini LED、144Hz 以上且支援 VRR 為「適合」；其他 120Hz 以上且支援 VRR 為「可用」；其餘為「不優先」。',
    fit(p) {
      if (p.hz < 120) return ['no', `${p.hz}Hz，動態較不流暢`];
      if (!hasVrr(p)) return specOf(p).vrr === '無' ? ['no', '無 VRR，幀率波動時易撕裂'] : ['unknown', '未查得 VRR 支援'];
      if ((isOled(p) || isMini(p)) && p.hz >= 144) return ['good', `${isOled(p) ? 'OLED' : 'Mini LED'} ${p.hz}Hz，支援 VRR`];
      return ['ok', `${p.hz}Hz，支援 VRR`];
    },
  },
  console: {
    label: '主機', name: 'PS5／Switch 2',
    look: ['HDMI 上限：至少 120Hz，常見 144Hz', 'HDMI 2.1：PS5 主機要用 VRR 時最穩', 'Switch 2：TV 模式 1440p 最高 120 fps', '音訊：沒有喇叭時要有耳機孔'],
    rule: 'HDMI 2.1 為「適合」；HDMI 2.0 為「可用」（主機相容性因機種而異）；HDMI 1.4 或官方上限低於 120Hz 為「不優先」。',
    fit(p) {
      const { hdmiMaxHz, hdmiVersion } = specOf(p);
      const version = String(hdmiVersion || '');
      const limit = hdmiMaxHz ? `，1440p 達 ${hdmiMaxHz}Hz` : '，原廠未分列各埠上限';
      if (p.hz < 120) return ['no', `最高 ${p.hz}Hz，主機無法跑 120Hz`];
      if (hdmiMaxHz && hdmiMaxHz < 120) return ['no', `HDMI 最高 ${hdmiMaxHz}Hz，主機無法跑 120Hz`];
      if (version.startsWith('1.4')) return ['no', 'HDMI 1.4，主機無法跑 1440p 120Hz'];
      if (version.startsWith('2.1')) return ['good', `HDMI 2.1${limit}`];
      if (version.startsWith('2.0')) return ['ok', `HDMI ${version}${limit}`];
      return ['unknown', '未查得 HDMI 版本'];
    },
  },
  laptop: {
    label: '筆電', name: '筆電單線',
    look: ['USB-C：要同時支援影像輸入與供電', '瓦數：輕薄筆電 65W 起；高效能筆電 90W 以上', '擴充：Hub、KVM 讓鍵鼠跟著切換', '注意：僅 15W 以下只算補電'],
    rule: 'USB-C 影像＋65W 以上為「適合」；有影像但瓦數較低或未列為「可用」；沒有影像輸入為「不優先」。',
    fit(p) {
      if (!p.usbcVideo) return ['no', '沒有 USB-C 影像輸入'];
      const watts = usbcWatts(p);
      if (watts === null) return ['ok', '有影像，原廠未列供電瓦數'];
      if (watts >= 65) return ['good', `USB-C 影像＋${watts}W`];
      return ['ok', `USB-C 影像＋${watts}W，僅能補電`];
    },
  },
};
const useFit = (p, use) => USES[use].fit(p);
const goodUses = p => Object.keys(USES).filter(use => useFit(p, use)[0] === 'good');
function fitRow(p) {
  return `<ul class="fit-row">${Object.entries(USES).map(([use, def]) => {
    const [level, why] = useFit(p, use);
    return `<li class="fit fit-${level}" title="${esc(why)}"><span class="fit-mark" aria-hidden="true">${FIT[level].mark}</span>${esc(def.label)}<span class="sr-only">：${FIT[level].text}，${esc(why)}</span></li>`;
  }).join('')}</ul>`;
}

/* 優缺點由規格欄位推導，每一條都對得回規格表；研究回報另列於「回報與限制」。 */
function strengthsOf(p) {
  const s = specOf(p);
  const out = [];
  if (isOled(p)) out.push('黑位最深、無光暈，動態反應快');
  if (isMini(p)) out.push(`${s.dimmingZones ? `${s.dimmingZones} 區 ` : ''}Mini LED 控光，無 OLED 烙印風險`);
  if (p.panel.includes('IPS Black')) out.push('IPS Black 對比 2000:1，高於一般 IPS');
  if (!isOled(p) && !isVa(p)) out.push('文字清晰，無烙印風險');
  if (p.hz >= 240) out.push(`${p.hz}Hz 高更新率`);
  if (p.height && p.pivot) out.push('原廠支架可升降、可直立');
  if (usbcWatts(p) >= 65) out.push(`USB-C 單線影像＋${usbcWatts(p)}W`);
  if (s.sdrNits >= 400) out.push(`SDR ${s.sdrNits} nits，亮室較有餘裕`);
  if (s.burnIn === true) out.push('保固明列涵蓋烙印');
  if (useFit(p, 'console')[0] === 'good') out.push('HDMI 2.1，主機連接較完整');
  if (s.kvm) out.push('內建 KVM');
  if (hasSpeakers(p)) out.push(`內建喇叭 ${s.speakers}`);
  if (s.usbHub && s.usbHub !== '無') out.push(`USB Hub（${s.usbHub}）`);
  return out;
}
function weaknessesOf(p) {
  const s = specOf(p);
  const out = [];
  if (isOled(p)) out.push('長時間靜態畫面有烙印風險');
  if (p.panel.includes('QD-OLED')) out.push('亮室黑色偏紫，文字邊緣有色邊');
  else if (isOled(p)) out.push('全白畫面亮度較低，文字邊緣較不銳利');
  if (isMini(p)) out.push('亮物周圍可能出現光暈');
  if (isVa(p)) out.push('VA 可視角窄');
  if (panelKind(p) === 'ips' || panelKind(p) === 'ips-black') out.push(panelKind(p) === 'ips' ? '暗房黑色偏灰，HDR 效果有限' : '無局部控光，HDR 效果有限');
  if (!p.height) out.push('支架不可升降，需要時得另購螢幕臂');
  else if (!p.pivot) out.push('支架不可直立');
  if (!p.usbcVideo) out.push('沒有 USB-C 影像輸入');
  else if (usbcWatts(p) === null) out.push('USB-C 未列供電瓦數');
  else if (usbcWatts(p) < 65) out.push(`USB-C 僅 ${usbcWatts(p)}W，不足以供筆電主力充電`);
  if (s.speakers === '無') out.push('沒有內建喇叭');
  if (s.sdrNits !== null && s.sdrNits !== undefined && s.sdrNits < 300) out.push(`SDR ${s.sdrNits} nits，亮室偏暗`);
  if (s.hdmiMaxHz && s.dpMaxHz && s.hdmiMaxHz < s.dpMaxHz) out.push(`HDMI 上限 ${s.hdmiMaxHz}Hz，${s.dpMaxHz}Hz 要用 DP`);
  if (s.surface === '鏡面') out.push('鏡面會映出環境光');
  if (s.vrr === '無') out.push('不支援 VRR');
  if (s.power === '外接') out.push('外接變壓器');
  return out;
}

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
function stockText(p) { return stockLabels[p.stockStatus] || '—'; }
function stockBadge(p) {
  return `<span class="badge ${p.stockStatus === 'out' ? 'stock-out' : 'stock-ok'}">${stockText(p)}</span>`;
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
const NO_FILTERS = { q: '', budget: 'all', panel: 'all', use: 'all', stand: false, usbc: false, usbc65: false, speaker: false, hdmi21: false, internalPower: false, picked: false, fps: false, hdr: false, kind: 'all' };
const PRESETS = {
  all: {},
  shortlist: { picked: true },
  value: { budget: '6000', stand: true },
  fps: { fps: true },
  hdr: { hdr: true },
  office: { use: 'office' },
  console: { use: 'console' },
  laptop: { use: 'laptop' },
};
let extraFilters = { fps: false, hdr: false, kind: 'all' };

function readFilters() {
  return {
    q: $('search').value.trim(),
    budget: $('budget').value,
    panel: $('panel').value,
    use: $('use-filter').value,
    stand: $('stand').checked,
    usbc: $('usbc').checked,
    usbc65: $('usbc65').checked,
    speaker: $('speaker').checked,
    hdmi21: $('hdmi21').checked,
    internalPower: $('internal-power').checked,
    picked: $('only-picked').checked,
    ...extraFilters,
  };
}
function writeFilters(f) {
  $('search').value = f.q;
  $('budget').value = f.budget;
  $('panel').value = f.panel;
  $('use-filter').value = f.use;
  $('stand').checked = f.stand;
  $('usbc').checked = f.usbc;
  $('usbc65').checked = f.usbc65;
  $('speaker').checked = f.speaker;
  $('hdmi21').checked = f.hdmi21;
  $('internal-power').checked = f.internalPower;
  $('only-picked').checked = f.picked;
  extraFilters = { fps: f.fps, hdr: f.hdr, kind: f.kind };
}
function matchesFilters(p, f) {
  if (f.q && !matchesSearch(p, f.q)) return false;
  if (f.budget !== 'all') {
    if (p.price === null) return false;
    if (f.budget === 'premium' ? p.price < 12000 : p.price > Number(f.budget)) return false;
  }
  if (f.panel !== 'all') {
    const fits = f.panel === 'IPS' ? p.panel.includes('IPS') && !p.panel.includes('Mini LED') : p.panel.includes(f.panel);
    if (!fits) return false;
  }
  if (f.use !== 'all' && useFit(p, f.use)[0] !== 'good') return false;
  if (f.kind !== 'all' && panelKind(p) !== f.kind) return false;
  if (f.stand && !(p.height && p.pivot)) return false;
  if (f.usbc && !p.usbcVideo) return false;
  if (f.usbc65 && !(usbcWatts(p) >= 65)) return false;
  if (f.speaker && !hasSpeakers(p)) return false;
  if (f.hdmi21 && !String(specOf(p).hdmiVersion).startsWith('2.1')) return false;
  if (f.internalPower && specOf(p).power !== '內建') return false;
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
  if (f.use !== 'all') out.push({ key: 'use', label: `適合${USES[f.use].name}` });
  if (f.kind !== 'all') out.push({ key: 'kind', label: PANELS.find(row => row.kind === f.kind).name });
  if (f.stand) out.push({ key: 'stand', label: '可升降＋直立' });
  if (f.usbc) out.push({ key: 'usbc', label: 'USB-C 影像' });
  if (f.usbc65) out.push({ key: 'usbc65', label: 'USB-C 65W 以上' });
  if (f.speaker) out.push({ key: 'speaker', label: '有喇叭' });
  if (f.hdmi21) out.push({ key: 'hdmi21', label: 'HDMI 2.1' });
  if (f.internalPower) out.push({ key: 'internalPower', label: '內建電源' });
  if (f.picked) out.push({ key: 'picked', label: `重點候選 ${shortlistCount} 款` });
  if (f.fps) out.push({ key: 'fps', label: '240Hz 以上' });
  if (f.hdr) out.push({ key: 'hdr', label: 'Mini LED / OLED' });
  return out;
}
/* 快捷按鈕反映實際條件：條件都成立才亮起；「全部候選」只在完全沒有條件時亮起。 */
function presetIsActive(name, f, conditions) {
  if (name === 'all') return !conditions.length;
  return Object.entries(PRESETS[name]).every(([key, value]) => f[key] === value);
}

/* ---------- 官方產品圖：圖片版權屬各品牌，來源頁列在頁尾。全部收錄型號皆有官方圖；缺圖的型號不放圖。 ---------- */
const PRODUCT_IMAGES = {
  'asus-xg27acs': { name: 'ASUS ROG Strix XG27ACS-W（白色款）', page: 'https://rog.asus.com/tw/monitors/27-to-31-5-inches/rog-strix-xg27acs-w/', credit: 'ASUS' },
  'dell-s2725dc': { name: 'Dell S2725DC', page: 'https://www.dell.com/zh-tw/shop/monitors/apd/dell-27-plus-qhd-usb-c-顯示器-s2725dc/s2725dc/-', credit: 'Dell' },
  'dell-s2725dsm': { name: 'Dell S2725DSM', page: 'https://www.dell.com/zh-tw/shop/monitors/apd/dell-27-plus-qhd-monitor-s2725dsm/s2725dsm/-' },
  'gigabyte-mo27q28g': { name: 'GIGABYTE MO27Q28G', page: 'https://www.gigabyte.com/tw/Monitor/MO27Q28G', credit: 'GIGABYTE' },
  'msi-mpg-271qr-qd-oled-x50': { name: 'MSI MPG 271QR QD-OLED X50', page: 'https://tw.msi.com/Monitor/MPG-271QR-QD-OLED-X50', credit: 'MSI' },
  'xiaomi-gpro27qi2026': { name: 'Xiaomi G Pro 27Qi 2026', page: 'https://www.mi.com/tw/product/xiaomi-mini-led-gaming-monitor-g-pro-27qi/', credit: '小米' },
  'benq-ew270q': { name: 'BenQ EW270Q', page: 'https://www.benq.com/zh-tw/monitor/home/ew270q.html', credit: 'BenQ' },
  'asus-rog-swift-oled-pg27aqwp-w': { name: 'ASUS ROG Swift OLED PG27AQWP-W', page: 'https://rog.asus.com/tw/monitors/27-to-31-5-inches/rog-swift-oled-pg27aqwp-w/' },
  'asus-rog-xg27aqdmgr': { name: 'ASUS ROG XG27AQDMGR', page: 'https://rog.asus.com/tw/monitors/27-to-31-5-inches/rog-strix-oled-xg27aqdmg-gen2-xg27aqdmgr/' },
  'asus-xg27acmes': { name: 'ASUS ROG Strix XG27ACMES', page: 'https://rog.asus.com/tw/monitors/27-to-31-5-inches/rog-strix-xg27acmes/' },
  'asus-proart-pa278qgv': { name: 'ASUS ProArt PA278QGV', page: 'https://www.asus.com/tw/displays-desktops/monitors/proart/proart-display-pa278qv-gen2-pa278qgv/' },
  'asus-vg27aql5a': { name: 'ASUS TUF Gaming VG27AQL5A', page: 'https://www.asus.com/tw/displays-desktops/monitors/tuf-gaming/tuf-gaming-vg27aql5a/' },
  'asus-vg27aq5a': { name: 'ASUS TUF Gaming VG27AQ5A', page: 'https://www.asus.com/tw/displays-desktops/monitors/tuf-gaming/tuf-gaming-vg27aq5a/' },
  'lg-ultragear-27gx790b-b': { name: 'LG UltraGear 27GX790B-B', page: 'https://www.lg.com/tw/monitors/ultragear-gaming/27gx790b-b/', credit: 'LG' },
  'samsung-odyssey-oled-g6-g60sf-s27fg602sc': { name: 'Samsung Odyssey OLED G6 G60SF', page: 'https://www.samsung.com/tw/monitors/gaming/odyssey-oled-g6-g60sf-27-inch-500hz-oled-qhd-ls27fg602scxzw/', credit: 'Samsung' },
  'dell-u2724de': { name: 'Dell U2724DE', page: 'https://www.dell.com/zh-tw/shop/monitors/apd/dell-ultrasharp-27-thunderbolt-hub-顯示器-u2724de/u2724de_withstnd_mon/-' },
  'dell-u2724d': { name: 'Dell U2724D', page: 'https://www.dell.com/zh-tw/shop/monitors/apd/dell-ultrasharp-27-顯示器-u2724d/u2724d_monitor/-' },
  'dell-aw2726dm': { name: 'Alienware AW2726DM', page: 'https://www.dell.com/zh-tw/shop/monitors/apd/alienware-27-240hz-qdoled-gaming-monitor-aw2726dm/aw2726dm/-' },
  'benq-pd2706qn': { name: 'BenQ PD2706QN', page: 'https://www.benq.com/zh-tw/monitor/creative-pro/pd2706qn.html' },
  'benq-ex271qm': { name: 'BenQ MOBIUZ EX271QM', page: 'https://www.benq.com/zh-tw/monitor/gaming/ex271qm.html' },
  'benq-ex271qp': { name: 'BenQ MOBIUZ EX271QP', page: 'https://www.benq.com/zh-tw/monitor/gaming/ex271qp.html' },
  'benq-gw2790q': { name: 'BenQ GW2790Q', page: 'https://www.benq.com/zh-tw/monitor/home/gw2790q.html' },
  'aoc-q27g40zdf': { name: 'AOC Q27G40ZDF', page: 'https://www.aoc.com/tw/gaming/monitors/q27g40zdf', credit: 'AOC' },
  'aoc-q27g40xmn': { name: 'AOC Q27G40XMN', page: 'https://www.aoc.com/tw/gaming/monitors/q27g40xmn_96' },
  'aoc-q27g42ze': { name: 'AOC Q27G42ZE/96', page: 'https://www.aoc.com/tw/gaming/monitors/q27g42ze_96' },
  'aoc-q27b30e': { name: 'AOC Q27B30E/96', page: 'https://www.aoc.com/tw/monitors/q27b30e' },
  'viewsonic-vp2766-2k': { name: 'ViewSonic ColorPro VP2766-2K', page: 'https://www.viewsonic.com/tw/products/lcd/VP2766-2K', credit: 'ViewSonic' },
  'viewsonic-xg2735-2k': { name: 'ViewSonic XG2735-2K', page: 'https://www.viewsonic.com/tw/products/lcd/XG2735-2K' },
  'msi-mag-274qrf-qd-e2': { name: 'MSI MAG 274QRF QD E2', page: 'https://tw.msi.com/Monitor/MAG-274QRF-QD-E2' },
  'msi-mag274qrfwe20': { name: 'MSI MAG 274QRFW E20', page: 'https://tw.msi.com/Monitor/MAG-274QRFW-E20' },
  'msi-mag274qpfe20': { name: 'MSI MAG 274QPF E20', page: 'https://tw.msi.com/Monitor/MAG-274QPF-E20' },
  'msi-mag275qfe21': { name: 'MSI MAG 275QF E21', page: 'https://tw.msi.com/Monitor/MAG-275QF-E21' },
  'msi-promp275qe14': { name: 'MSI PRO MP275Q E14', page: 'https://tw.msi.com/Business-Productivity-Monitor/PRO-MP275Q-E14' },
  'gigabyte-g27q20': { name: 'GIGABYTE G27Q20', page: 'https://www.gigabyte.com/tw/Monitor/G27Q20' },
  'gigabyte-g27q20t': { name: 'GIGABYTE G27Q20T', page: 'https://www.gigabyte.com/tw/Monitor/G27Q20T' },
  'xiaomi-a27qi2026': { name: 'Xiaomi A27Qi 2026', page: 'https://www.mi.com/tw/product/xiaomi-2k-monitor-a27qi-2026/' },
  'lenovo-legion27q10': { name: 'Lenovo Legion 27Q-10', page: 'https://www.lenovo.com/tw/zh/p/accessories-and-software/monitors/gaming/68c6gac4tw', credit: 'Lenovo' },
  'philips-27m2n2500nf': { name: 'Philips Evnia 27M2N2500NF/96', page: 'https://www.evnia.philips/tw/monitors/27m2n2500nf_96', credit: 'Philips' },
  'acer-xv272ux2': { name: 'Acer Nitro XV272U X2', page: 'https://store.acer.com/zh-tw/xv272u-x2', credit: 'Acer' },
  'acer-xv272ux1': { name: 'Acer Nitro XV272U X1', page: 'https://store.acer.com/en-in/acer-nitro-xv272u-x1-27-inch-wqhd-2560-1440-ips-gaming-monitor-200hz-refresh-rate-0-5ms-gtg-amd-freesync-premium-hdr400-2-hdmi-dp-ergostand-2w-2-stereo-speakers-dci-p3-90-black' },
  'acer-sa272up1': { name: 'Acer SA272U P1', page: 'https://store.acer.com/zh-tw/sa272u-p1' },
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
        ${productShot(p.id, 'thumb')}
        <div class="title-text">
          <div class="model-brand"><span class="row-num">${String(i + 1).padStart(2, '0')}</span>${esc(p.brand)}${p.newInBatch ? '<span class="new-tag">新增</span>' : ''}</div>
          <h3>${esc(p.model)}</h3>
        </div>
      </div>
      <div class="price-col">
        <div class="price">${priceHTML(p.price)}</div>
        <div class="price-date"><span>${esc(p.priceCheckedDate)}</span> 查核</div>
      </div>
    </div>
    <div class="badges">${pickByProduct.has(p.id) ? `<span class="badge tier-badge${pickByProduct.get(p.id).tier === 'top' ? ' tier-badge-top' : ''}">${esc(pickByProduct.get(p.id).tierLabel)}推薦</span>` : p.shortlist ? '<span class="badge pick-badge">重點候選</span>' : ''}${stockBadge(p)}${p.caution ? `<span class="badge warning">${esc(p.caution)}</span>` : ''}</div>
    <div class="spec-chips">
      <div><span>面板 / 更新率</span><strong>${esc(compactPanel(p))} · ${p.hz ?? '—'}Hz</strong></div>
      <div><span>原廠支架</span><strong>${esc(compactStand(p))}</strong></div>
      <div><span>USB-C 影像 / 供電</span><strong>${esc(compactUsb(p))}</strong></div>
      <div><span>適合用途</span><strong class="use-list">${goodUses(p).map(use => `<span>${esc(USES[use].label)}</span>`).join('・') || '—'}</strong></div>
    </div>
    <p class="verdict">${esc(p.verdict)}</p>
    <div class="product-actions">
      <label class="compare-label"><input type="checkbox" data-compare="${p.id}" ${isSelected ? 'checked' : ''}><span class="sr-only">加入</span>比較<span class="sr-only">：${esc(p.model)}</span></label>
      <button type="button" class="detail-toggle" data-detail="${p.id}" aria-expanded="${open}" aria-controls="detail-${p.id}" aria-label="${esc(p.model)} 的詳情">${open ? '收起' : '詳情'}</button>
    </div>
    <div class="product-detail" id="detail-${p.id}" ${open ? '' : 'hidden'}>
      <div class="detail-main">
        <h4 class="detail-verdict">選購判斷</h4><p class="detail-verdict">${esc(p.verdict)}</p>
        <h4>用途判斷</h4>${fitRow(p)}
        <div class="pros-cons">
          <div><h4>優點</h4><ul>${strengthsOf(p).map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
          <div><h4>缺點</h4><ul>${weaknessesOf(p).map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
        </div>
        <h4>回報與限制</h4><p>${esc(p.cons)}</p>
        <h4>研究摘要</h4><p>${esc(p.pros)}</p>
        <h4>售價與通路</h4><p>${esc(p.priceType)}。${esc(p.priceNote)} ${link(p.buyUrl, `前往${p.buyChannel}商品頁`)}</p>
        <h4>資料範圍</h4><p>${esc(p.evidenceNote || '規格依原廠與通路公開資料；未進行購機實測或拆解，不推定內部用料與故障率。')}</p>
      </div>
      <div class="detail-side">
        ${productShot(p.id, 'detail-shot')}
        ${SPEC_GROUPS.filter(group => group.detail).map(group => `<h4 class="spec-group-title">${esc(group.title)}</h4>
        <dl class="detail-spec">${group.rows.filter(([, fn]) => !['—', '未查得'].includes(fn(p))).map(([label, fn]) => `<dt>${label}</dt><dd>${esc(fn(p))}</dd>`).join('')}</dl>`).join('')}
        <div class="source-links">${sourceLinks(p)}${specOf(p).specSource ? link(specOf(p).specSource, '規格來源') : ''}</div>
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
  const buttons = relaxations.map(c => `<button type="button" class="relax" data-clear="${c.key}">移除「${esc(c.label)}」，顯示 ${c.count} 款</button>`).join('');
  return `<div class="empty"><b>目前條件下沒有符合的型號。</b><p>可放寬下列條件，或重設全部條件。</p><div class="empty-actions">${buttons}<button type="button" class="primary-small" data-reset>重設全部條件</button></div></div>`;
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
function showInCatalog(filters) {
  writeFilters({ ...NO_FILTERS, ...filters });
  $('sort').value = 'desc';
  render();
  document.querySelector('.results-bar').scrollIntoView({ behavior: motion() });
  focusResults();
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
  button.textContent = open ? '收起' : '詳情';
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
    tell('已清除篩選條件以顯示此型號。');
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
const standOf = p => p.height && p.pivot ? '可升降直立' : compactStand(p);

function compareButton(id) {
  const on = selected.has(id);
  return `<button type="button" class="ghost" data-pick-compare="${id}" aria-pressed="${on}">${on ? '已加入比較' : '加入比較'}<span class="sr-only">：${esc(productById.get(id).model)}</span></button>`;
}
function evidenceLine(e) {
  const source = e.url ? ` <a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">原文</a>` : '';
  return `<b>${esc(e.kind)}</b>　${esc(e.text)}${source}`;
}
/* 同一列的推薦卡列高相連，一起展開才能並排比對，也不會留下大片空白。 */
function syncTierDetails(e) {
  const tier = e.target.closest('.tier');
  document.querySelectorAll('#tiers .tier').forEach(other => {
    const more = other.querySelector('.tier-more');
    if (other.offsetTop === tier.offsetTop && more.open !== e.target.open) more.open = e.target.open;
  });
}
function renderPicks() {
  $('tier-nav').innerHTML = PICKS.map(pick => `<a href="#tier-${pick.tier}" data-tier="${pick.tier}"><span>${esc(pick.tierLabel)}</span><strong>${money(productById.get(pick.id).price)}</strong></a>`).join('');
  $('tiers').innerHTML = PICKS.map(pick => {
    const p = productById.get(pick.id);
    const alt = productById.get(pick.alt.id);
    return `<article class="tier tier-${pick.tier}" id="tier-${pick.tier}">
      ${pick.flag ? `<span class="tier-flag">${esc(pick.flag)}</span>` : ''}
      ${productShot(p.id, 'tier-shot', true)}
      <div class="tier-body">
        <div class="tier-kicker">${esc(pick.tierLabel)}・${esc(pick.label)}</div>
        <h3>${esc(fullName(p))}</h3>
        <div class="tier-price"><span class="num">${money(p.price)}</span>${stockBadge(p)}</div>
        <p class="tier-date">${link(p.buyUrl, p.priceType)}｜<span>${esc(p.priceCheckedDate)} 查核</span></p>
        <p class="tier-reason">${esc(pick.headline)}</p>
        <ul class="tier-facts">
          <li>${esc(compactPanel(p))} ${p.hz}Hz</li>
          <li>${esc(standOf(p))}</li>
          <li>USB-C ${esc(compactUsb(p))}</li>
          <li>保固 ${esc(pick.warrantyShort)}</li>
        </ul>
        <p class="tier-watch">留意事項：${esc(pick.watchShort)}</p>
        <div class="tier-actions">
          <a class="primary" href="#product-${p.id}" data-jump="${p.id}">完整規格</a>
          ${compareButton(p.id)}
        </div>
        <details class="tier-more">
          <summary>實測、回報與替代型號 <span aria-hidden="true">＋</span></summary>
          <div class="tier-block">
            ${pick.evidence.map(e => `<p class="ev">${evidenceLine(e)}</p>`).join('')}
            <p class="ev"><b>保固</b>　${esc(pick.warranty)}</p>
            <p class="ev"><b>留意事項</b>　${esc(pick.watch)}</p>
            <p class="ev"><b>相較 XG27AQMR</b>　${esc(pick.upgrade)}</p>
          </div>
          <div class="tier-alt">
            <b>${esc(pick.alt.when)}：</b><a href="#product-${alt.id}" data-jump="${alt.id}">${esc(fullName(alt))}</a>，${money(alt.price)}（${esc(stockText(alt))}｜${esc(alt.priceCheckedDate)} 查核）
            <p>${esc(pick.alt.note)}</p>
          </div>
        </details>
      </div>
    </article>`;
  }).join('');
}

/* ---------- 依用途選購：用途＋預算對照表，理由逐條寫明，不計分 ---------- */
const BUDGETS = { low: 6000, mid: 9000, high: 12000, top: 24000 };
const USE_PICKS = {
  office: {
    low: ['asus-proart-pa278qgv', 'IPS、130mm 升降與直立、四孔 USB Hub，原廠校色 ΔE<2。'],
    mid: ['dell-s2725dsm', 'Dell 3 年先行更換，144Hz、3W×2 喇叭；用不到 USB-C 可比 S2725DC 省錢。'],
    high: ['benq-pd2706qn', 'Nano Matte 霧面、90W USB-C 與 KVM；100Hz，不適合高速遊戲。'],
    top: ['dell-u2724d', 'IPS Black 對比 2000:1、150mm 升降；文書用途再往上的效益有限。'],
  },
  media: {
    low: ['benq-ew270q', 'NT$6,000 以內未收錄 OLED、Mini LED；此款 5W×2 喇叭最實用，但 HDR 效果有限。'],
    mid: ['xiaomi-gpro27qi2026', '1152 區 Mini LED、DisplayHDR 1000，支架完整，亮室也看得清楚。'],
    high: ['gigabyte-mo27q28g', 'WOLED 黑位與對比差異最大，3 年保固含烙印；不適合長時間靜態畫面。'],
    top: ['msi-mpg-271qr-qd-oled-x50', 'QD-OLED 色彩鮮豔，3 年防烙印保固；亮室黑色偏紫，建議控制環境光。'],
  },
  fps: {
    low: ['lenovo-legion27q10', '240Hz 與完整支架，G-SYNC Compatible／FreeSync Premium；已有螢幕臂可比較 AOC Q27G42ZE。'],
    mid: ['benq-ex271qm', '320Hz IPS 且可升降；長期心得仍不足，到貨後請先連續測試。'],
    high: ['gigabyte-mo27q28g', '280Hz OLED，動態反應明顯優於 IPS；競技玩家的最大升級在此。'],
    top: ['samsung-odyssey-oled-g6-g60sf-s27fg602sc', '500Hz QD-OLED 控制在兩萬元內，保固含烙印；需要頂級顯示卡才跑得滿。'],
  },
  single: {
    low: ['asus-xg27acs', 'NT$6,000 以內未收錄 OLED、Mini LED；此款 180Hz 且實測資料最齊，但黑位普通；有 DP 白線回報，到貨先連續測試。'],
    mid: ['xiaomi-gpro27qi2026', '180Hz 搭 1152 區 Mini LED，HDR 大作提升明顯，無烙印風險。'],
    high: ['gigabyte-mo27q28g', 'OLED 畫質加 280Hz，大作與快節奏遊戲都能兼顧。'],
    top: ['asus-rog-xg27aqdmgr', '單機遊戲用不到 500Hz，240Hz WOLED 即足夠，3 年保固含烙印；鏡面需留意倒影。'],
  },
  console: {
    low: ['lenovo-legion27q10', 'HDMI 2.1 TMDS×2、完整支架；沒有喇叭，主機音訊需接耳機孔。'],
    mid: ['benq-ex271qm', 'HDMI 2.1×2 與 2.5W×2 喇叭，主機接上即可出聲。'],
    high: ['gigabyte-mo27q28g', 'HDMI 2.1×2 與 5W×2 喇叭，OLED 畫質對主機大作差異明顯。'],
    top: ['msi-mpg-271qr-qd-oled-x50', 'HDMI 2.1×2 與 KVM，可在主機與電腦間切換；沒有喇叭，音訊需接耳機孔。'],
  },
  laptop: {
    low: ['benq-ew270q', 'USB-C 影像＋65W，NT$6,000 以內少見；支架不可升降、不可直立。'],
    mid: ['dell-s2725dc', 'USB-C 影像＋65W、完整支架、Dell 3 年先行更換。'],
    high: ['benq-pd2706qn', 'USB-C 90W、KVM 與霧面面板，高效能筆電較夠用；100Hz，不適合高速遊戲。'],
    top: ['dell-u2724de', 'Thunderbolt 4 90W、2.5GbE 與 KVM；遊戲取向改看 98W 的 MSI MPG 271QR QD-OLED X50。'],
  },
};
function renderDecide() {
  const form = $('decide-form').elements;
  const use = form.use.value;
  const budget = form.budget.value;
  const [id, why] = USE_PICKS[use][budget];
  const p = productById.get(id);
  const def = USES[use];
  const [level, fitWhy] = useFit(p, use);
  const within = PRODUCTS.filter(x => useFit(x, use)[0] === 'good' && x.price <= BUDGETS[budget]).length;
  const all = PRODUCTS.filter(x => useFit(x, use)[0] === 'good').length;
  $('decide-result').innerHTML = `${productShot(p.id, 'decide-shot')}
    <div class="decide-body">
      <div class="decide-kicker">${esc(def.name)}・建議型號</div>
      <h3>${esc(fullName(p))}</h3>
      <div class="num">${money(p.price)}</div>
      <div class="decide-price-note">${link(p.buyUrl, p.priceType)}｜${esc(stockText(p))}｜<span>${esc(p.priceCheckedDate)} 查核</span></div>
      <p class="decide-why">${esc(why)}</p>
      <p class="decide-fit fit-${level}"><span aria-hidden="true">${FIT[level].mark}</span> ${FIT[level].text}：${esc(fitWhy)}</p>
      <div class="decide-actions">
        <a class="ghost" href="#product-${p.id}" data-jump="${p.id}">完整規格</a>
        ${compareButton(p.id)}
      </div>
    </div>`;
  $('use-brief').innerHTML = `<div>
      <h3>${esc(def.name)}的選購重點</h3>
      <ul>${def.look.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
    </div>
    <div>
      <h3>判斷規則</h3>
      <p>${esc(def.rule)}</p>
      <button type="button" class="ghost use-all" data-apply-use="${use}" data-apply-budget="${within ? budget : ''}">${within ? `查看預算內適合的 ${within} 款（全部 ${all} 款）` : `此預算未收錄「適合」機種，查看全部 ${all} 款`}</button>
    </div>`;
}

/* ---------- 面板優缺點：面板通則，個別機種以各款規格與實測為準 ---------- */
const PANELS = [
  { kind: 'ips', name: '一般 IPS', sub: '含 Fast IPS、Rapid IPS', office: '◎', media: '－', game: '○', plus: '文字清楚、亮度穩定、無烙印風險，價格帶最廣', minus: '對比約 1000:1，暗房黑色偏灰，HDR 效果有限' },
  { kind: 'ips-black', name: 'IPS Black', sub: '高對比 IPS', office: '◎', media: '○', game: '－', plus: '對比 2000:1，黑位優於一般 IPS，保有 IPS 的文字與可視角', minus: '價格較高；本站收錄機種皆為 120Hz，無局部控光' },
  { kind: 'mini-ips', name: 'IPS Mini LED', sub: '局部控光背光', office: '◎', media: '◎', game: '○', plus: '可維持高亮度，亮室表現好；HDR 明顯，無烙印風險', minus: '亮物周圍可能有光暈；控光品質因機種差異大' },
  { kind: 'mini-va', name: 'VA Mini LED', sub: '局部控光背光', office: '○', media: '◎', game: '○', plus: '原生對比高、暗部較黑，價格較低', minus: '可視角窄，暗色快速移動可能拖影，光暈較 IPS 版明顯' },
  { kind: 'woled', name: 'WOLED', sub: '含 Tandem、Primary RGB', office: '－', media: '◎', game: '◎', plus: '自發光、無光暈、反應極快；新世代亮度明顯提升', minus: '長時間靜態畫面有烙印風險；文字邊緣較不銳利，全白亮度較低' },
  { kind: 'qd-oled', name: 'QD-OLED', sub: '量子點 OLED', office: '－', media: '◎', game: '◎', plus: '自發光、色彩鮮豔、反應極快', minus: '亮室黑色偏紫，文字有色邊，同樣有烙印風險；部分機種為低亮度版' },
];
function renderPanels() {
  const countOf = kind => PRODUCTS.filter(p => panelKind(p) === kind).length;
  $('panel-table').innerHTML = `<thead><tr><th scope="col">面板</th><th scope="col">文書</th><th scope="col">影音</th><th scope="col">遊戲</th><th scope="col">優點</th><th scope="col">代價</th><th scope="col">收錄</th></tr></thead>
    <tbody>${PANELS.map(row => `<tr>
      <th scope="row">${esc(row.name)}<small>${esc(row.sub)}</small></th>
      <td data-label="文書" class="mark">${row.office}</td>
      <td data-label="影音" class="mark">${row.media}</td>
      <td data-label="遊戲" class="mark">${row.game}</td>
      <td data-label="優點">${esc(row.plus)}</td>
      <td data-label="代價">${esc(row.minus)}</td>
      <td data-label="收錄"><button type="button" class="link-button" data-apply-kind="${row.kind}">看 ${countOf(row.kind)} 款</button></td>
    </tr>`).join('')}</tbody>`;
}

/* ---------- 規格怎麼看：數量由資料計算 ---------- */
const GUIDE_ROWS = [
  { name: '更新率', why: '越高越流暢，但顯示卡幀率跟不上就看不到差異。', how: '文書 100Hz 起；一般遊戲 165–210Hz；競技 240Hz 以上。', count: p => p.hz >= 240, unit: '款 240Hz 以上', apply: { fps: true } },
  { name: '接口上限', why: '標示的最高更新率，常只有 DP 能達到。', how: '電腦走 DP；主機只能走 HDMI，要看 HDMI 上限。', count: p => specOf(p).hdmiMaxHz && specOf(p).dpMaxHz && specOf(p).hdmiMaxHz < specOf(p).dpMaxHz, unit: '款 HDMI 上限低於 DP' },
  { name: '亮度', why: '明亮房間要靠 SDR 亮度壓過反光；HDR 峰值只反映小面積。', how: '看 SDR 典型值：300 nits 起，亮室 350 nits 以上。', count: p => specOf(p).sdrNits >= 350, unit: '款 SDR 350 nits 以上' },
  { name: 'HDR', why: 'DisplayHDR 400 沒有局部控光，觀感差異不大。', how: '要明顯 HDR 就選 OLED 或 Mini LED；Mini LED 再看分區數。', count: p => isOled(p) || isMini(p), unit: '款 OLED／Mini LED', apply: { hdr: true } },
  { name: '支架與 VESA', why: '僅俯仰的機種要另購螢幕臂才能調高度，總價要一起算。', how: '直放或常調高度選完整支架；已有螢幕臂選省錢款，注意 VESA 75 或 100。', count: p => p.height && p.pivot, unit: '款可升降＋直立', apply: { stand: true } },
  { name: 'USB-C', why: '有影像不代表能幫筆電充電。', how: '筆電單線看 65W 以上；7.5–18W 只算補電。', count: p => usbcWatts(p) >= 65, unit: '款影像＋65W 以上', apply: { usbc65: true } },
  { name: '文字清晰', why: '27 吋 QHD 約 109 PPI，細緻度都相同，差別在面板。', how: 'IPS 類文字最穩；OLED 子像素排列造成文字邊緣較不銳利。', count: p => useFit(p, 'office')[0] === 'good', unit: '款適合文書', apply: { use: 'office' } },
  { name: '螢幕表面', why: '鏡面黑位通透但會映出環境，霧面較不反光。', how: '有窗戶或頂燈直射時選霧面。', count: p => specOf(p).surface === '鏡面', unit: '款鏡面' },
  { name: '保固', why: '年限相同，條款可能差很多。', how: '看烙印是否納保、亮點政策、到府收送或先行更換。', count: p => specOf(p).burnIn === true, unit: '款 OLED 明列烙印保固' },
  { name: '喇叭與電源', why: '主機與追劇要有音訊出口；外接變壓器較佔空間。', how: '內建喇叭僅供應急；無喇叭時確認耳機孔。', count: hasSpeakers, unit: '款有內建喇叭', apply: { speaker: true } },
];
function renderGuide() {
  $('guide-table').innerHTML = `<thead><tr><th scope="col">規格</th><th scope="col">為什麼重要</th><th scope="col">怎麼判斷</th><th scope="col">本站收錄</th></tr></thead>
    <tbody>${GUIDE_ROWS.map((row, i) => {
      const n = PRODUCTS.filter(row.count).length;
      return `<tr>
        <th scope="row">${esc(row.name)}</th>
        <td data-label="為什麼重要">${esc(row.why)}</td>
        <td data-label="怎麼判斷">${esc(row.how)}</td>
        <td data-label="本站收錄">${row.apply ? `<button type="button" class="link-button" data-apply-guide="${i}">${n} ${esc(row.unit)}</button>` : `<span class="guide-count">${n} ${esc(row.unit)}</span>`}</td>
      </tr>`;
    }).join('')}</tbody>`;
}

function renderImageCredit() {
  const credits = Object.values(PRODUCT_IMAGES).filter(image => image.credit);
  $('image-credit').innerHTML = `產品圖片取自品牌官網，版權屬各品牌：${credits.map(image => link(image.page, image.credit)).join('、')}`;
}

/* ---------- 與現有機種比較 ---------- */
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
const speakersOf = p => shown(specOf(p).speakers);
const versusRows = [
  ['售價', () => '現有機種', p => money(p.price)],
  ['面板', c => `${c.panel} ${c.hz}`, p => `${compactPanel(p)} ${p.hz}Hz`],
  ['支架', c => c.stand, standOf],
  ['USB-C', () => '規格頁未列', compactUsb],
  ['適合用途', () => '—', p => goodUses(p).map(use => USES[use].label).join('・') || '—'],
  ['喇叭', c => c.speakers, speakersOf],
  ['保固', c => c.warranty, (p, pick) => pick.warrantyShort],
  ['升級效益', () => '—', (p, pick) => pick.upgradeShort],
];
function renderVersus() {
  const picks = PICKS.map(pick => [productById.get(pick.id), pick]);
  $('versus-table').style.setProperty('--cols', picks.length + 1);
  $('versus-table').innerHTML = `<thead><tr><th scope="col">項目</th>
      <th scope="col" class="is-current">${productShot('xg27aqmr', 'th-shot')}<small>現有機種</small><span class="th-model">${esc(CURRENT_MONITOR.name)}</span></th>
      ${picks.map(([p, pick]) => `<th scope="col" data-tier="${pick.tier}">${productShot(p.id, 'th-shot')}<small>${esc(pick.tierLabel)}</small><span class="th-model">${esc(p.model)}</span></th>`).join('')}
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
    tell(`最多比較 ${MAX_COMPARE} 款，請先移除一款。`);
    return false;
  }
  if (on) selected.add(id); else selected.delete(id);
  updateCompare();
  return true;
}
const shown = v => v === null || v === undefined || v === '' ? '未查得' : v;
const yesNo = v => v === true ? '有' : v === false ? '無' : '未查得';
const listedOnly = v => v === true ? '有' : '原廠未列';
const burnInText = p => !isOled(p) ? '非 OLED，不適用' : specOf(p).burnIn === true ? '保固明列涵蓋' : '未查得條款';
/* best：只在客觀數值上標示最佳，不做綜合評比。 */
const SPEC_GROUPS = [
  { title: '價格與購買', rows: [
    ['售價', p => money(p.price), { best: 'min', value: p => p.price }],
    ['查核日期', p => p.priceCheckedDate],
    ['購買狀態', stockText],
    ['售價通路', p => p.priceType],
    ['通路說明', p => p.priceNote],
  ] },
  { title: '用途判斷', rows: Object.entries(USES).map(([use, def]) => [def.name, p => {
    const [level, why] = useFit(p, use);
    return `${FIT[level].mark} ${FIT[level].text}：${why}`;
  }]) },
  { title: '畫面', detail: true, rows: [
    ['面板', p => p.panel],
    ['解析度', () => '2560 × 1440 · 平面'],
    ['可視對角線', p => /26\.5/.test(`${p.category} ${p.evidenceNote || ''}`) ? '約 26.5 吋' : '27 型級距'],
    ['螢幕表面', p => shown(specOf(p).surface)],
    ['SDR 亮度', p => specOf(p).sdrNits ? `${specOf(p).sdrNits} nits` : '未查得', { best: 'max', value: p => specOf(p).sdrNits }],
    ['亮度說明', p => p.brightness],
    ['對比', p => shown(specOf(p).contrast).replace(/^\d+/, n => Number(n).toLocaleString('en-US'))],
    ['色域', p => shown(specOf(p).gamut)],
    ['色深', p => shown(specOf(p).colorDepth)],
    ['HDR 認證', p => shown(specOf(p).hdrCert)],
    ['控光分區', p => isMini(p) ? shown(specOf(p).dimmingZones) : isOled(p) ? '逐像素自發光' : '無局部控光'],
  ] },
  { title: '遊戲', detail: true, rows: [
    ['更新率', p => `${p.hz ?? '—'}Hz`, { best: 'max', value: p => p.hz }],
    ['DP', p => `${shown(specOf(p).dpVersion)}${specOf(p).dpMaxHz ? `・最高 ${specOf(p).dpMaxHz}Hz` : ''}`],
    ['HDMI', p => `${shown(specOf(p).hdmiVersion)}${specOf(p).hdmiMaxHz ? `・最高 ${specOf(p).hdmiMaxHz}Hz` : ''}`],
    ['VRR', p => shown(specOf(p).vrr)],
    ['規格備註', p => specOf(p).caveat || '—'],
    ['遊戲連接與同步', p => p.gaming || '未取得完整動態實測；各輸入埠上限與 VRR 相容性見原廠手冊。'],
  ] },
  { title: '連接', detail: true, rows: [
    ['USB-C', p => p.usbc],
    ['USB-C 供電', p => usbcWatts(p) ? `${usbcWatts(p)}W` : p.usbcVideo ? '未列' : '無影像輸入', { best: 'max', value: usbcWatts }],
    ['接口', p => p.ports],
    ['USB Hub', p => shown(specOf(p).usbHub)],
    ['KVM', p => listedOnly(specOf(p).kvm)],
    ['耳機孔', p => yesNo(specOf(p).headphone)],
    ['喇叭', p => shown(specOf(p).speakers)],
  ] },
  { title: '支架與擺放', detail: true, rows: [
    ['支架', p => p.stand],
    ['VESA', p => p.vesa],
    ['含底座尺寸', p => shown(specOf(p).sizeWithStand)],
    ['含底座重量', p => specOf(p).weightKg ? `${specOf(p).weightKg} kg` : '未查得'],
    ['電源', p => shown(specOf(p).power)],
  ] },
  { title: '保固與風險', detail: true, rows: [
    ['保固', p => p.warranty],
    ['烙印保固', burnInText],
    ['已知回報', p => p.caution || '本研究未列重點回報'],
  ] },
  { title: '綜合判斷', rows: [
    ['選購判斷', p => p.verdict],
    ['主要限制', p => p.cons],
  ] },
];
const compareRowCount = SPEC_GROUPS.reduce((n, group) => n + group.rows.length, 0);
function bestSet(items, opt) {
  if (!opt || items.length < 2) return new Set();
  const values = items.map(opt.value).filter(v => typeof v === 'number' && v > 0);
  if (values.length < 2 || new Set(values).size < 2) return new Set();
  const target = opt.best === 'min' ? Math.min(...values) : Math.max(...values);
  return new Set(items.filter(p => opt.value(p) === target).map(p => p.id));
}
function renderComparison() {
  const items = [...selected].map(id => productById.get(id));
  const comparable = items.length > 1;
  const onlyDiff = $('differences').checked && comparable;
  let visible = 0;
  const body = SPEC_GROUPS.map(group => {
    const rows = group.rows.filter(([, fn]) => !onlyDiff || new Set(items.map(fn)).size > 1);
    if (!rows.length) return '';
    visible += rows.length;
    return `<tr class="group-row"><th scope="rowgroup" colspan="${items.length + 1}"><span>${esc(group.title)}</span></th></tr>
      ${rows.map(([label, fn, opt]) => {
        const best = bestSet(items, opt);
        return `<tr><th scope="row">${label}</th>${items.map(p => `<td${best.has(p.id) ? ' class="is-best"' : ''}>${esc(fn(p))}${best.has(p.id) ? ` <span class="best-tag">${opt.best === 'min' ? '最低' : '最高'}</span>` : ''}</td>`).join('')}</tr>`;
      }).join('')}`;
  }).join('');

  $('differences').disabled = !comparable;
  $('compare-status').textContent = !comparable
    ? '請再選擇一款以檢視差異。'
    : onlyDiff
      ? `已隱藏 ${compareRowCount - visible} 個相同項目。`
      : '依原廠與通路公開資料比較；標示「最高／最低」僅限可量化項目。';

  $('compare-content').innerHTML = `<div class="table-frame"><div class="table-scroll" tabindex="0" role="region" aria-label="可水平捲動的螢幕規格比較表"><table style="--cols:${items.length}">
    <thead><tr><th scope="col">比較項目</th>${items.map(p => `<th scope="col">${productShot(p.id, 'th-shot')}<small>${esc(p.brand)}</small><span class="th-model">${esc(p.model)}</span><button type="button" class="th-remove" data-table-remove="${p.id}" aria-label="從比較移除 ${esc(p.model)}">移除</button></th>`).join('')}</tr></thead>
    <tbody>
      ${body}
      <tr><th scope="row">查核來源</th>${items.map(p => `<td>${sourceLinks(p)}${specOf(p).specSource ? link(specOf(p).specSource, '規格來源') : ''}</td>`).join('')}</tr>
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
  $('versus-hint').textContent = `現有機種已達 300Hz，升級感主要來自面板，而非更新率。「—」表示未核對項目。${overflow ? '可左右捲動。' : ''}`;
}
function openComparison() {
  if (!selected.size) return;
  $('compare-dialog').showModal();
  renderComparison();
}

/* ---------- 研究紀錄 ---------- */
function renderForums() {
  const platform = $('note-platform').value;
  const list = FORUMS
    .filter(f => noteMode === 'all' || NEW_NOTE_BATCHES.has(f.batch))
    .filter(f => platform === 'all' || (platform === 'other' ? !/巴哈|PTT|Reddit|Mobile01/i.test(f.platform) : f.platform.includes(platform)));
  const shown = list.slice(0, notesLimit);
  $('note-results').textContent = `顯示 ${shown.length} / ${list.length} 則${noteMode === 'new' ? '最新' : '研究'}紀錄`;
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
    : `<div class="empty"><b>此範圍沒有紀錄。</b><p>最新紀錄以巴哈姆特回讀為主；PTT 等來源請切換至「全部紀錄」。</p><div class="empty-actions"><button type="button" class="primary-small" data-all-notes>${noteMode === 'new' ? '查看全部紀錄' : '顯示所有來源'}</button></div></div>`;
  $('more-notes').hidden = shown.length >= list.length;
  $('more-notes').textContent = `再顯示 ${Math.min(NOTE_STEP, list.length - shown.length)} 則`;
  document.querySelectorAll('[data-notes]').forEach(btn => {
    const active = btn.dataset.notes === noteMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

/* ---------- 事件 ---------- */
for (const id of ['budget', 'panel', 'use-filter', 'sort', 'stand', 'usbc', 'usbc65', 'speaker', 'hdmi21', 'internal-power', 'only-picked']) $(id).addEventListener('change', render);
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

/* 導覽標示目前閱讀的區塊；回到頁首時清除。 */
const navLinks = [...document.querySelectorAll('.top nav a')];
if ('IntersectionObserver' in window) {
  const spy = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach(entry => {
      navLinks.forEach(a => {
        if (a.hash === `#${entry.target.id}`) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  [$('top'), ...navLinks.map(a => $(a.hash.slice(1)))].forEach(node => spy.observe(node));
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
$('tiers').addEventListener('toggle', syncTierDetails, true);
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
  const useAll = e.target.closest('[data-apply-use]');
  if (useAll) showInCatalog({ use: useAll.dataset.applyUse, budget: useAll.dataset.applyBudget ? String(BUDGETS[useAll.dataset.applyBudget]) : 'all' });
  const kind = e.target.closest('[data-apply-kind]');
  if (kind) showInCatalog({ kind: kind.dataset.applyKind });
  const guide = e.target.closest('[data-apply-guide]');
  if (guide) showInCatalog(GUIDE_ROWS[guide.dataset.applyGuide].apply);
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
renderPanels();
renderGuide();
renderVersus();
renderForums();
render();
updateCompare();
syncVersusCue();
try { setView(localStorage.getItem(VIEW_KEY) === 'full' ? 'full' : 'compact'); } catch { setView('compact'); }
jumpFromHash({ updateHash: false });
