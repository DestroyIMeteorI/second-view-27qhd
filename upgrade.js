'use strict';

(() => {
  const data = JSON.parse(document.getElementById('oled-data').textContent);
  const form = document.getElementById('upgrade-form');
  const result = document.getElementById('upgrade-result');
  const currency = value => `NT$${value.toLocaleString('zh-TW')}`;
  const model = id => data.models.find(item => item.id === id);
  const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function recommend() {
    const { upBudget, upPriority, upSize, upGpu } = form.elements;
    const budget = Number(upBudget.value);
    const priority = upPriority.value;
    const size = upSize.value;
    let id = 'xg27uqdms';
    let title = '先選約 2 萬元的 4K 240Hz';
    let reason = 'XG27UQDMS 與 MAG 272UP X24 已具備這次最重要的 4K、OLED 黑階與 240Hz。單接桌機偏向 XG27UQDMS；需要 USB-C 影像則選 MAG X24。';
    let linkTarget = '#oled-comparison';
    if (priority === 'office') {
      id = null;
      title = '保留 IPS 做長時間工作，先不用為副螢幕攻頂';
      reason = '如果大部分時間都是試算表、程式碼與固定視窗，先讓 XG27AQMR 繼續當主螢幕，從原 QHD 型錄補一台 IPS 副螢幕。確定會常用 OLED 玩遊戲，再考慮升級。';
      linkTarget = '#picks';
    } else if (priority === 'fps') {
      id = null;
      title = '競技優先：先比較 QHD 480–540Hz OLED';
      reason = '已有 QHD 300Hz，單為更新率改買 4K 240Hz 不對題。若能穩定輸出數百 fps，可比較 PG27AQWP-W 的 QHD 540Hz；預算較低可回看原 QHD OLED 型錄。旗艦 4K 的 FHD 480Hz 是另一種解析度取捨。';
      linkTarget = 'oled-market.html#catalog';
    } else if (upGpu.value === 'qhd') {
      id = null;
      title = '先確認 4K 實際幀率，再分配螢幕預算';
      reason = '如果現在跑 1440p 都接近效能極限，4K 的 2.25 倍像素會增加負擔。可先買 QHD OLED，或保留升級顯卡的預算；不保證開升頻後就能跑滿 240Hz。';
      linkTarget = '#setup-check';
    } else if (size === '32') {
      if (budget >= model('pg32ucwm').price) {
        id = 'pg32ucwm';
        title = '桌面放得下，再選 PG32UCWM';
        reason = '適合單機大作與影音。相較 27 型旗艦多約 NT$3,000，主要換更大畫面；不是更細緻的 4K。原價屋列售 NT$37,888，現貨仍需詢問。';
      } else {
        id = null;
        title = '32 型 4K 240Hz，也有約 2 萬元的選項';
        linkTarget = 'oled-market.html#catalog';
        reason = '可比較 X32 X2／MO32U2（原價屋各 18,888 元）、XG32UQDMS（19,888 元）、MPG 321URX（20,888 元）。先看新完整表的世代、供貨與論壇紀錄，再決定是否加價到 RGB 旗艦。';
      }
    } else if (priority === 'flagship' && budget >= model('pg27ucwm').price) {
      id = 'pg27ucwm';
      title = '想買最新一代完整旗艦，選 PG27UCWM';
      reason = 'Tandem RGB 排列、4K 240Hz／FHD 480Hz、DP 2.1a UHBR20、USB-C 90W 與 KVM，升級項目明確。相較約 2 萬元方案多花約 1.5 萬，前提是你會用到這些功能。';
    } else if (priority === 'dock' && budget >= model('mpg272urx').price) {
      id = 'mpg272urx';
      title = '需要桌機＋筆電共用，選 MPG 272URX';
      reason = 'USB-C 98W、KVM 與 DP 2.1a UHBR20 是加價的核心。比 MAG X24 多 NT$4,988，不需要這些接口就省下來。';
    } else if (priority === 'dock') {
      id = null;
      title = '約 2 萬元候選無法同時提供筆電高瓦數供電與 KVM';
      reason = 'MAG X24 的 USB-C 只有 15W，且無 KVM；XG27UQDMS 無 USB-C 影像。可用原充電器與外接切換設備，或把預算提高到 MPG 272URX 的 NT$24,888。';
    }
    const chosen = id ? model(id) : null;
    const gpuNote = upGpu.value === 'unknown'
      ? '顯卡尚未確認：以上為條件式建議。先用常玩遊戲、期望畫質與實際幀率確認 4K 負擔。'
      : upGpu.value === 'ready'
        ? '你選擇了「4K 效能已確認」。240Hz 是螢幕上限，並非每款遊戲都要或都能跑到 240 fps。'
        : '這裡沒有預測特定顯卡的 fps，也不以像素倍率推算實際掉幀比例。';
    result.innerHTML = `<p class="up-kicker">依你試選的條件</p><h3>${escapeHTML(title)}</h3><p>${escapeHTML(reason)}</p>${chosen ? `<p class="up-result-model">${escapeHTML(chosen.name)} <strong>${currency(chosen.price)}</strong></p>` : ''}<p class="up-condition">${escapeHTML(gpuNote)}</p><a class="up-text-link" href="${chosen ? '#oled-'+chosen.id : linkTarget}">${chosen ? '查看型號與來源' : '查看對應選項'} <span aria-hidden="true">↗</span></a>`;
  }
  form.addEventListener('change', recommend);
  recommend();

  const table = document.getElementById('oled-model-body');
  const filters = document.getElementById('oled-filters');
  let selectedSize = 'all';
  function renderTable() {
    const direction = document.getElementById('oled-sort').value === 'asc' ? 1 : -1;
    const rows = [...table.rows].sort((a,b) => direction * (Number(a.dataset.price)-Number(b.dataset.price)));
    let visible = 0;
    rows.forEach(row => {
      row.hidden = selectedSize !== 'all' && row.dataset.size !== selectedSize;
      if (!row.hidden) visible++;
      table.appendChild(row);
    });
    document.getElementById('oled-count').textContent = `${visible} 款候選・價格${direction === 1 ? '低 → 高' : '高 → 低'}`;
  }
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-oled-size]');
    if (!button) return;
    selectedSize = button.dataset.oledSize;
    filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderTable();
  });
  document.getElementById('oled-sort').addEventListener('change', renderTable);
  // A recommendation deep link must remain visible after a size filter.
  function revealHash() {
    const row = document.getElementById(location.hash.slice(1));
    if (!row || !row.matches('#oled-model-body tr')) return;
    if (row.hidden) {
      selectedSize = 'all';
      filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.oledSize === 'all')));
      renderTable();
      row.scrollIntoView({block:'center'});
    }
  }
  window.addEventListener('hashchange', revealHash);
  renderTable();
  revealHash();

  const sizeButtons = document.querySelectorAll('[data-desk-size]');
  sizeButtons.forEach(button => button.addEventListener('click', () => {
    const large = button.dataset.deskSize === '32';
    sizeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.getElementById('desk-diagram').classList.toggle('up-desk-large', large);
    document.getElementById('desk-new-size').textContent = large ? '31.5 吋・4K OLED' : '26.5 吋・4K OLED';
    document.getElementById('desk-ppi').textContent = large ? '約 140 PPI' : '約 166 PPI';
    document.getElementById('desk-note').textContent = large
      ? '32 型：更大畫面、約 140 PPI。PG32UCWM 機身寬 71.45cm；先量桌面與實際觀看距離。Windows 縮放可由 125–150% 試起。'
      : '27 型：尺寸接近原螢幕、約 166 PPI。PG27UCWM 機身寬 60.6cm；雙螢幕較容易並排。Windows 縮放可由 150% 試起。';
  }));
})();
