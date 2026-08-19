const users = {
    "talos blackagency": "001",
    "noelle blackagency": "002",
};

const userProfiles = {
    "talos blackagency": { name: "Talos Blackagency", role: "ผู้อำนวยการแพทย์", avatar: "talos.jpg", isAdmin: true, canViewMonitoring: true, desc: "ควบคุมและตรวจสอบทีมเวร" },
    "noelle blackagency": { name: "Noelle Blackagency", role: "รอง.ผู้อำนวยการ", avatar: "noeele.jpg", isAdmin: false, canViewMonitoring: false, desc: "สนับสนุนงานประสานงาน" }
};

const manualUrl = "https://docs.google.com/spreadsheets/d/1vGjzD5YZiiBs65yBodjtxsoUPQVr_EMMnfqRXWbOZrI/edit?gid=749978115#gid=749978115";
const rulesUrl = "https://sites.google.com/bic.ac.th/mediclightcity/%E0%B8%84%E0%B8%93%E0%B8%AA%E0%B8%A1%E0%B8%9A%E0%B8%95%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%80%E0%B8%9B%E0%B8%99%E0%B9%81%E0%B8%9E%E0%B8%97%E0%B8%A2";

// ============================================================
// DATA LAYER — ข้อมูลทั้งหมดอยู่บนฐานข้อมูล Neon (ใช้ร่วมกันทุกคน)
// หน้าเว็บดึงข้อมูลผ่าน /api/shift และ /api/fund (Vercel Functions)
// ============================================================
let shiftLog = {};
let currentUser = null;
let historyViewUser = null;
let realtimeInterval = null;
let elapsedInterval = null;
let loginBgIndex = 0;
let loginBgInterval = null;
let centralFund = null;
let stockItems = [];
let stockOffline = false;
const STOCK_LOCAL_KEY = 'medicStockItems';

function getDefaultFundState() {
    return {
        balance: 70000,
        allocations: {
            cash: 40000,
            deposit: 20000,
            reserve: 10000
        },
        history: []
    };
}

centralFund = getDefaultFundState();

async function apiGet(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${res.status})`);
    return res.json();
}

async function apiPost(path, body) {
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `บันทึกไม่สำเร็จ (${res.status})`);
    return data;
}

// ดึงข้อมูลเวร + เงินกองกลางล่าสุดจากฐานข้อมูล
async function loadAllData() {
    const [log, fund] = await Promise.all([apiGet('/api/shift'), apiGet('/api/fund')]);
    shiftLog = log || {};
    centralFund = fund || getDefaultFundState();
}

// ดึงข้อมูลสต็อก — ถ้าไม่มี API (เช่นเปิดไฟล์ตรง ๆ) จะใช้ข้อมูลในเครื่องแทน
async function loadStockData() {
    try {
        const data = await apiGet('/api/stock');
        stockItems = Array.isArray(data) ? data : [];
        stockOffline = false;
    } catch (err) {
        stockOffline = true;
        try {
            stockItems = JSON.parse(localStorage.getItem(STOCK_LOCAL_KEY) || '[]');
        } catch (e) {
            stockItems = [];
        }
    }
}

function saveStockLocal() {
    localStorage.setItem(STOCK_LOCAL_KEY, JSON.stringify(stockItems));
}

function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function refreshShiftViews() {
    renderProfile();
    renderLog();
    renderTeamStatus();
    renderForceOut();
    updateActionButtons();
}

const loginBackgroundImages = [
    'IMG_4433.jpg',
    'talos.jpg',
    'noeele.jpg',
    'yuri.png',
    'jas.png',
    'zenzey.png'
];

function formatElapsed(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function nowTime() {
    return new Date().toLocaleTimeString('th-TH', { hour12: false });
}

function todayDate() {
    return new Date().toLocaleDateString('th-TH');
}

function getTodayLogs(username) {
    const logs = shiftLog[username] || [];
    return logs.filter((item) => {
        const logDate = new Date(item.datetime || item.date);
        return logDate.toLocaleDateString('th-TH') === todayDate();
    });
}

function getOpenCheckIn(username) {
    return getTodayLogs(username).slice().reverse().find((log) => log.type === 'เข้าเวร' && !log.duration);
}

let activeLoginBackgrounds = [];

function setLoginBackground(index) {
    const element = document.getElementById('loginBackground');
    if (!element || !activeLoginBackgrounds.length) return;
    element.classList.remove('visible');
    setTimeout(() => {
        element.style.backgroundImage = `linear-gradient(180deg, rgba(7,20,46,0.46), rgba(7,20,46,0.30)), url(${activeLoginBackgrounds[index]})`;
        element.classList.add('visible');
        document.body.classList.add('has-bg');
    }, 120);
}

function cycleLoginBackground() {
    if (loginBgInterval) clearInterval(loginBgInterval);
    const element = document.getElementById('loginBackground');
    if (!element) return;
    // โหลดเฉพาะรูปที่มีอยู่จริง กันพื้นหลังเสียตอนสไลด์
    let pending = loginBackgroundImages.length;
    activeLoginBackgrounds = [];
    loginBackgroundImages.forEach((src) => {
        const probe = new Image();
        probe.onload = () => { activeLoginBackgrounds.push(src); if (--pending === 0) startCycle(); };
        probe.onerror = () => { if (--pending === 0) startCycle(); };
        probe.src = src;
    });
    function startCycle() {
        if (!activeLoginBackgrounds.length) return;
        loginBgIndex = 0;
        setLoginBackground(loginBgIndex);
        loginBgInterval = setInterval(() => {
            loginBgIndex = (loginBgIndex + 1) % activeLoginBackgrounds.length;
            setLoginBackground(loginBgIndex);
        }, 3500);
    }
}

function renderHistoryControls() {
    const historySection = document.getElementById('historySection');
    if (!historySection) return;
    const existing = document.getElementById('historySelectorContainer');
    if (existing) existing.remove();
    if (!canViewMonitoring(currentUser)) {
        historyViewUser = currentUser;
        return;
    }
    const container = document.createElement('div');
    container.id = 'historySelectorContainer';
    container.className = 'history-filter';
    container.innerHTML = `
        <label for="historySelect">เลือกผู้ใช้งานเพื่อดูประวัติ</label>
        <select id="historySelect"></select>
        <span class="history-highlight">กำลังดู: <strong id="historyLabel"></strong></span>
    `;
    historySection.insertBefore(container, historySection.querySelector('.panel-header').nextSibling);
    const select = container.querySelector('select');
    const label = container.querySelector('#historyLabel');
    Object.keys(users).forEach((username) => {
        const profile = userProfiles[username];
        if (!profile) return;
        const option = document.createElement('option');
        option.value = username;
        option.textContent = `${profile.name} • ${profile.role}`;
        select.appendChild(option);
    });
    historyViewUser = historyViewUser || currentUser;
    select.value = historyViewUser;
    label.textContent = userProfiles[historyViewUser]?.name || 'ไม่ระบุ';
    select.addEventListener('change', (event) => {
        historyViewUser = event.target.value;
        label.textContent = userProfiles[historyViewUser]?.name || 'ไม่ระบุ';
        renderLog();
    });
}

function getHistoryTarget() {
    return historyViewUser || currentUser;
}

function updateCurrentTime() {
    const currentTime = document.getElementById('currentTime');
    if (currentTime) currentTime.textContent = nowTime();
}

function startClock() {
    if (elapsedInterval) clearInterval(elapsedInterval);
    updateCurrentTime();
    elapsedInterval = setInterval(updateCurrentTime, 1000);
}

function canViewMonitoring(username) {
    return userProfiles[username]?.canViewMonitoring === true;
}

const Toast = window.Swal ? Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2200,
    timerProgressBar: true,
    showClass: { popup: 'toast-in' },
    hideClass: { popup: 'toast-out' },
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
}) : null;

function showAlert(title, text, icon = 'info') {
    if (window.Swal) {
        if (icon === 'success' && Toast) {
            Toast.fire({ icon, title, text });
            return;
        }
        Swal.fire({
            title,
            text,
            icon,
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#2563eb',
            showClass: { popup: 'pop-in' },
            hideClass: { popup: 'pop-out' }
        });
        return;
    }
    alert(`${title}\n${text}`);
}

function updateActionButtons() {
    const btnIn = document.getElementById('btnCheckIn');
    const btnOut = document.getElementById('btnCheckOut');
    const status = getOpenCheckIn(currentUser);
    if (!btnIn || !btnOut) return;
    btnIn.disabled = Boolean(status);
    btnOut.disabled = !Boolean(status);
    btnIn.classList.toggle('cta-glow', !btnIn.disabled);
    btnOut.classList.toggle('cta-glow', !btnOut.disabled);
}

function renderCentralFund() {
    const balanceSummary = document.getElementById('fundBalanceSummary');
    const chart = document.getElementById('fundChart');
    const legend = document.getElementById('fundChartLegend');
    const totalValue = document.getElementById('fundTotalValue');
    const summaryList = document.getElementById('fundSummaryList');
    const historyList = document.getElementById('fundHistoryList');
    if (!balanceSummary || !chart || !legend || !totalValue || !summaryList || !historyList) return;

    const items = [
        { label: 'เงินสด', value: Number(centralFund.allocations?.cash) || 0, color: '#2563eb' },
        { label: 'เงินฝาก', value: Number(centralFund.allocations?.deposit) || 0, color: '#16a34a' },
        { label: 'สำรอง', value: Number(centralFund.allocations?.reserve) || 0, color: '#f59e0b' }
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    const maxValue = Math.max(...items.map((item) => item.value), 1);

    animateMoneyText(balanceSummary, centralFund.balance, (v) => `ยอดรวม ${v.toLocaleString('th-TH')} บาท`);
    animateMoneyText(totalValue, centralFund.balance, (v) => `${v.toLocaleString('th-TH')} บาท`);
    chart.classList.remove('bump');
    void chart.offsetWidth;
    chart.classList.add('bump');
    setTimeout(() => chart.classList.remove('bump'), 600);

    // แผนภูมิแท่ง — ความสูงเทียบกับยอดสูงสุด เห็นสัดส่วนแต่ละประเภทชัดเจน
    chart.innerHTML = items.map((item) => {
        const heightPct = item.value > 0 ? Math.max(4, Math.round((item.value / maxValue) * 100)) : 0;
        return `
        <div class="fund-bar-col">
            <span class="fund-bar-value">${item.value.toLocaleString('th-TH')}</span>
            <div class="fund-bar-track">
                <div class="fund-bar-fill" style="height:${heightPct}%; background:linear-gradient(180deg, ${item.color}, ${item.color}99);"></div>
            </div>
            <span class="fund-bar-label">${item.label}</span>
        </div>`;
    }).join('');

    legend.innerHTML = items.map((item) => `
        <div class="fund-legend-item">
            <span class="fund-dot" style="background:${item.color}"></span>
            <div>
                <strong>${item.label}</strong>
                <small>${item.value.toLocaleString('th-TH')} บาท</small>
            </div>
        </div>
    `).join('');

    summaryList.innerHTML = items.map((item) => `
        <div class="fund-summary-row">
            <span>${item.label}</span>
            <strong>${item.value.toLocaleString('th-TH')} บาท</strong>
        </div>
    `).join('');

    if (!centralFund.history.length) {
        historyList.innerHTML = '<div class="fund-history-empty">ยังไม่มีรายการฝาก/ถอน</div>';
        return;
    }

    historyList.innerHTML = centralFund.history.slice(0, 6).map((entry) => `
        <div class="fund-history-item">
            <div>
                <strong>${entry.type}</strong>
                <span>${entry.username ? `${userProfiles[entry.username]?.name || entry.username} • ` : ''}${entry.note || 'ไม่มีหมายเหตุ'}</span>
            </div>
            <div class="fund-history-meta">
                <strong>${Number(entry.amount).toLocaleString('th-TH')} บาท</strong>
                <span>${entry.date} ${entry.time}</span>
            </div>
        </div>
    `).join('');
}

// ฝาก/ถอนเงินกองกลาง — บันทึกลงฐานข้อมูลกลาง ทุกคนเห็นอัพเดท
async function handleFundTransaction(type) {
    const amountInput = document.getElementById('fundAmountInput');
    const noteInput = document.getElementById('fundNoteInput');
    const amount = Number(amountInput?.value);
    if (!amountInput || !Number.isFinite(amount) || amount <= 0) {
        showAlert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกจำนวนเงินที่มากกว่า 0', 'warning');
        return;
    }
    if (type === 'withdraw' && amount > centralFund.balance) {
        showAlert('ยอดเงินไม่เพียงพอ', 'จำนวนเงินถอนเกินยอดคงเหลือในกองกลาง', 'error');
        return;
    }

    const btn = document.getElementById(type === 'deposit' ? 'btnFundDeposit' : 'btnFundWithdraw');
    if (btn) btn.disabled = true;
    try {
        await apiPost('/api/fund', {
            action: type,
            amount,
            note: noteInput?.value.trim() || '',
            username: currentUser
        });
        await loadAllData();
        renderCentralFund();
        amountInput.value = '';
        noteInput.value = '';
        celebrate({ particleCount: 70, spread: 65, origin: { y: 0.6 }, colors: ['#fbbf24', '#f59e0b', '#22c55e'] });
        showAlert(`${type === 'deposit' ? 'ฝากเงิน' : 'ถอนเงิน'}สำเร็จ`, `จำนวน ${amount.toLocaleString('th-TH')} บาท เรียบร้อย`, 'success');
    } catch (err) {
        showAlert('ทำรายการไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// STOCK — ระบบสต็อกอุปกรณ์
// สถานะคำนวณอัตโนมัติจาก จำนวนคงเหลือ เทียบกับ จำนวนขั้นต่ำ
// ============================================================
function getStockStatus(item) {
    const qty = Number(item.quantity) || 0;
    const min = Number(item.minQuantity) || 0;
    const missing = Math.max(0, min - qty);
    if (qty <= 0) return { key: 'out', label: 'ขาดสต็อก', missing };
    if (qty < min) return { key: 'low', label: 'ใกล้หมด', missing };
    return { key: 'ok', label: 'พร้อมใช้งาน', missing: 0 };
}

function renderStock() {
    const list = document.getElementById('stockList');
    if (!list) return;
    const addedByLabel = document.getElementById('stockAddedByLabel');
    if (addedByLabel) addedByLabel.textContent = userProfiles[currentUser]?.name || currentUser || '-';

    const statuses = stockItems.map(getStockStatus);
    const lowCount = statuses.filter((s) => s.key === 'low').length;
    const outCount = statuses.filter((s) => s.key === 'out').length;
    const missingTotal = statuses.reduce((sum, s) => sum + s.missing, 0);

    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setText('stockStatTotal', stockItems.length);
    setText('stockStatLow', lowCount);
    setText('stockStatOut', outCount);
    setText('stockStatMissing', `${missingTotal.toLocaleString('th-TH')} ชิ้น`);
    setText('stockSummaryPill', `ทั้งหมด ${stockItems.length} รายการ • ขาด ${missingTotal.toLocaleString('th-TH')} ชิ้น`);

    if (!stockItems.length) {
        list.innerHTML = '<div class="log-item"><strong>ยังไม่มีรายการสต็อก</strong><span>เริ่มเพิ่มอุปกรณ์ชิ้นแรกจากฟอร์มด้านบน</span></div>';
        return;
    }

    list.innerHTML = stockItems.map((item, i) => {
        const s = statuses[i];
        const addedByName = userProfiles[item.addedBy]?.name || item.addedBy || 'ไม่ระบุ';
        return `
        <div class="stock-item">
            <div class="stock-item-head">
                <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <span class="stock-meta">👤 เพิ่มโดย ${escapeHtml(addedByName)}${item.date ? ` • ${item.date} ${item.time || ''}` : ''}</span>
                </div>
                <span class="badge stock-${s.key}">${s.label}</span>
            </div>
            <div class="stock-item-body">
                <span>คงเหลือ <strong>${Number(item.quantity).toLocaleString('th-TH')}</strong> / ขั้นต่ำ ${Number(item.minQuantity).toLocaleString('th-TH')} ชิ้น</span>
                <span>แหล่งที่มา: ${escapeHtml(item.source || 'ไม่ระบุ')}</span>
                ${s.missing > 0
                    ? `<span class="stock-missing">⚠️ ขาดอีก ${s.missing.toLocaleString('th-TH')} ชิ้น</span>`
                    : '<span class="stock-ok">✔ สต็อกเพียงพอ</span>'}
            </div>
            <div class="stock-item-actions">
                <button class="btn btn-secondary btn-small stock-adjust" data-id="${item.id}" data-delta="1" type="button">＋ เติมสต็อก</button>
                <button class="btn btn-secondary btn-small stock-adjust" data-id="${item.id}" data-delta="-1" type="button" ${Number(item.quantity) <= 0 ? 'disabled' : ''}>− ใช้/เบิก</button>
                <button class="btn btn-danger btn-small stock-remove" data-id="${item.id}" type="button">ลบ</button>
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.stock-adjust').forEach((btn) => {
        btn.addEventListener('click', () => promptAdjustStock(btn.dataset.id, Number(btn.dataset.delta)));
    });
    list.querySelectorAll('.stock-remove').forEach((btn) => {
        btn.addEventListener('click', () => confirmRemoveStock(btn.dataset.id));
    });
    staggerChildren(list);
}

// เพิ่มสต็อก — บันทึกชื่อผู้เพิ่มจากบัญชีที่ล็อกอินอัตโนมัติ
async function handleAddStock() {
    const nameInput = document.getElementById('stockNameInput');
    const qtyInput = document.getElementById('stockQtyInput');
    const minInput = document.getElementById('stockMinInput');
    const sourceInput = document.getElementById('stockSourceInput');
    const name = nameInput?.value.trim();
    const quantity = Math.max(0, Math.floor(Number(qtyInput?.value) || 0));
    const minQuantity = Math.max(0, Math.floor(Number(minInput?.value) || 0));
    const source = sourceInput?.value.trim() || '';
    if (!name) {
        showAlert('ข้อมูลไม่ครบ', 'กรุณากรอกชื่ออุปกรณ์', 'warning');
        nameInput?.classList.add('input-error');
        setTimeout(() => nameInput?.classList.remove('input-error'), 700);
        return;
    }

    const btn = document.getElementById('btnAddStock');
    if (btn) btn.disabled = true;
    try {
        if (stockOffline) {
            const now = new Date();
            stockItems.unshift({
                id: Date.now(),
                name,
                quantity,
                minQuantity,
                source: source || 'ไม่ระบุแหล่งที่มา',
                addedBy: currentUser,
                date: now.toLocaleDateString('th-TH'),
                time: now.toLocaleTimeString('th-TH', { hour12: false })
            });
            saveStockLocal();
        } else {
            await apiPost('/api/stock', { action: 'add', name, quantity, minQuantity, source, username: currentUser });
            await loadStockData();
        }
        renderStock();
        nameInput.value = '';
        qtyInput.value = '';
        minInput.value = '';
        sourceInput.value = '';
        celebrate({ particleCount: 70, spread: 65, origin: { y: 0.6 }, colors: ['#2563eb', '#22c55e', '#fbbf24'] });
        showAlert('เพิ่มสต็อกสำเร็จ', `${name} จำนวน ${quantity.toLocaleString('th-TH')} ชิ้น เรียบร้อย`, 'success');
    } catch (err) {
        showAlert('เพิ่มสต็อกไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// เติม/เบิกสต็อก — ถามจำนวนก่อนปรับ
async function promptAdjustStock(id, direction) {
    const item = stockItems.find((s) => String(s.id) === String(id));
    if (!item) return;
    const isAdd = direction > 0;
    let amount = 1;
    if (window.Swal) {
        const result = await Swal.fire({
            title: isAdd ? `เติมสต็อก "${item.name}"` : `ใช้/เบิก "${item.name}"`,
            input: 'number',
            inputValue: 1,
            inputAttributes: { min: 1, step: 1 },
            showCancelButton: true,
            confirmButtonText: isAdd ? 'เติมสต็อก' : 'เบิกออก',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: isAdd ? '#16a34a' : '#dc2626'
        });
        if (!result.isConfirmed) return;
        amount = Math.floor(Number(result.value));
    } else {
        const raw = prompt(isAdd ? 'จำนวนที่เติม (ชิ้น):' : 'จำนวนที่เบิก (ชิ้น):', '1');
        if (raw === null) return;
        amount = Math.floor(Number(raw));
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        showAlert('จำนวนไม่ถูกต้อง', 'กรุณาระบุจำนวนมากกว่า 0', 'warning');
        return;
    }
    if (!isAdd && amount > Number(item.quantity)) {
        showAlert('สต็อกไม่พอ', `คงเหลือเพียง ${item.quantity} ชิ้น`, 'error');
        return;
    }
    const delta = isAdd ? amount : -amount;
    try {
        if (stockOffline) {
            item.quantity = Math.max(0, Number(item.quantity) + delta);
            saveStockLocal();
        } else {
            await apiPost('/api/stock', { action: 'adjust', id: item.id, delta });
            await loadStockData();
        }
        renderStock();
        showAlert(isAdd ? 'เติมสต็อกแล้ว' : 'เบิกอุปกรณ์แล้ว', `${item.name} ${isAdd ? '+' : '−'}${amount} ชิ้น`, 'success');
    } catch (err) {
        showAlert('ทำรายการไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    }
}

async function confirmRemoveStock(id) {
    const item = stockItems.find((s) => String(s.id) === String(id));
    if (!item) return;
    let confirmed = true;
    if (window.Swal) {
        const result = await Swal.fire({
            title: 'ลบรายการนี้?',
            text: `"${item.name}" จะถูกลบออกจากสต็อก`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ลบรายการ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#dc2626'
        });
        confirmed = result.isConfirmed;
    } else {
        confirmed = confirm(`ลบ "${item.name}" ออกจากสต็อก?`);
    }
    if (!confirmed) return;
    try {
        if (stockOffline) {
            stockItems = stockItems.filter((s) => String(s.id) !== String(id));
            saveStockLocal();
        } else {
            await apiPost('/api/stock', { action: 'remove', id: item.id });
            await loadStockData();
        }
        renderStock();
        showAlert('ลบรายการแล้ว', `${item.name} ถูกลบออกจากสต็อก`, 'success');
    } catch (err) {
        showAlert('ลบไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    }
}

function renderProfile() {
    const profile = userProfiles[currentUser];
    if (!profile) return;
    document.getElementById('profileName').textContent = profile.name;
    document.getElementById('profileRole').textContent = profile.role;
    document.getElementById('userAvatar').src = profile.avatar || 'IMG_4436.png';
    document.getElementById('userAvatar').alt = `${profile.name} avatar`;
    const statusLabel = document.getElementById('userStatus');
    const currentCheckIn = getOpenCheckIn(currentUser);
    statusLabel.textContent = currentCheckIn ? 'อยู่ในเวร' : 'ยังไม่เข้าเวร';
}

function renderLog() {
    const list = document.getElementById('logList');
    const currentDate = document.getElementById('currentDate');
    const historyLabel = document.getElementById('historyLabel');
    if (!list || !currentDate) return;
    const targetUser = getHistoryTarget();
    list.innerHTML = '';
    currentDate.textContent = todayDate();
    if (historyLabel) {
        historyLabel.textContent = userProfiles[targetUser]?.name || 'ไม่ระบุ';
    }
    const logs = (shiftLog[targetUser] || []).slice().reverse();
    if (!logs.length) {
        list.innerHTML = '<div class="log-item"><strong>ยังไม่มีบันทึก</strong><span>เริ่มต้นด้วยการเข้าเวรครั้งแรก</span></div>';
        staggerChildren(list);
        return;
    }
    logs.forEach((log) => {
        const card = document.createElement('div');
        card.className = 'log-item';
        if (log.type === 'เข้าเวร') {
            card.innerHTML = `<strong>✅ เข้าเวร</strong><span>${log.date} เวลา ${log.time}</span>`;
        } else {
            const forced = log.isForced ? ' (บังคับ)' : '';
            card.innerHTML = `<strong>🚪 ออกเวร</strong><span>${log.date} เวลา ${log.time} ${log.duration ? `(${log.duration})` : ''}${forced}</span>`;
        }
        list.appendChild(card);
    });
    staggerChildren(list);
}

function renderTeamStatus() {
    const panel = document.getElementById('statusPanel');
    if (!panel) return;
    panel.innerHTML = '';
    panel.className = 'status-panel';

    Object.keys(users).forEach((username) => {
        const profile = userProfiles[username];
        if (!profile) return;
        const checkIn = getOpenCheckIn(username);
        const elapsed = checkIn ? formatElapsed(Math.floor((new Date() - new Date(checkIn.datetime)) / 1000)) : null;
        const card = document.createElement('div');
        card.className = 'status-card';
        card.innerHTML = `
            <div class="status-row">
                <div>
                    <strong>${profile.name}</strong>
                    <span>${profile.role}</span>
                </div>
                <span class="badge ${checkIn ? 'in' : 'out'}">${checkIn ? 'เข้าแล้ว' : 'ยังไม่เข้า'}</span>
            </div>
            ${checkIn ? `<span>เข้าเวรเมื่อ ${new Date(checkIn.datetime).toLocaleTimeString('th-TH', { hour12: false })} | ทำงาน ${elapsed}</span>` : ''}
            <div class="status-row" style="margin-top: 12px; gap: 10px;">
                <button class="btn btn-secondary btn-small view-history" data-user="${username}" type="button">ดูประวัติ</button>
                ${checkIn ? `<button class="btn btn-danger btn-small force-logout" data-user="${username}" type="button">ออกเวร</button>` : ''}
            </div>
        `;
        panel.appendChild(card);
    });

    // Bind buttons inside the panel
    panel.querySelectorAll('.view-history').forEach((button) => {
        button.addEventListener('click', (event) => {
            const username = event.currentTarget.dataset.user;
            openUserHistory(username);
        });
    });
    panel.querySelectorAll('.force-logout').forEach((button) => {
        button.addEventListener('click', (event) => {
            const username = event.currentTarget.dataset.user;
            confirmForceOut(username);
        });
    });
    staggerChildren(panel);
}

function renderForceOut() {
    const panel = document.getElementById('forceOutPanel');
    if (!panel) return;
    panel.innerHTML = '';
    let hasActive = false;
    Object.keys(users).forEach((username) => {
        const profile = userProfiles[username];
        const checkIn = getOpenCheckIn(username);
        if (!checkIn) return;
        hasActive = true;
        const card = document.createElement('div');
        card.className = 'forceout-card';
        card.innerHTML = `
            <div class="status-row">
                <div>
                    <strong>${profile.name}</strong>
                    <span>เข้าเวร ${checkIn.date} เวลา ${new Date(checkIn.datetime).toLocaleTimeString('th-TH', { hour12: false })}</span>
                </div>
                <button class="btn btn-danger force-logout" data-user="${username}">ออกเวร</button>
            </div>
        `;
        card.querySelector('.force-logout').addEventListener('click', () => confirmForceOut(username));
        panel.appendChild(card);
    });
    if (!hasActive) {
        panel.innerHTML = '<div class="forceout-card"><strong>ไม่มีผู้ใช้งานที่ต้องออกเวร</strong><span>พนักงานทุกคนได้ออกเวรแล้วหรือยังไม่ได้เข้าเวร</span></div>';
    }
    staggerChildren(panel);
}

// บังคับออกเวร — บันทึกลงฐานข้อมูลกลาง
async function confirmForceOut(username) {
    try {
        await apiPost('/api/shift', { action: 'forceout', username });
        await loadAllData();
        refreshShiftViews();
        renderCentralFund();
        showAlert('ออกเวรสำเร็จ', `${userProfiles[username].name} ถูกออกเวรเรียบร้อยแล้ว`, 'success');
    } catch (err) {
        showAlert('ทำรายการไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    }
}

// เข้าเวร — บันทึกลงฐานข้อมูลกลาง
async function handleCheckIn() {
    const btn = document.getElementById('btnCheckIn');
    if (btn) btn.disabled = true;
    try {
        await apiPost('/api/shift', { action: 'checkin', username: currentUser });
        await loadAllData();
        refreshShiftViews();
        celebrate({ particleCount: 110, spread: 80, origin: { y: 0.65 }, colors: ['#22c55e', '#2563eb', '#a78bfa', '#fbbf24'] });
        showAlert('เข้าเวรสำเร็จ', `${userProfiles[currentUser].name} เข้าเวรเรียบร้อย`, 'success');
    } catch (err) {
        showAlert('เข้าเวรไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    } finally {
        updateActionButtons();
    }
}

// ออกเวร — บันทึกลงฐานข้อมูลกลาง
async function handleCheckOut() {
    const btn = document.getElementById('btnCheckOut');
    if (btn) btn.disabled = true;
    try {
        const result = await apiPost('/api/shift', { action: 'checkout', username: currentUser });
        await loadAllData();
        refreshShiftViews();
        celebrate({ particleCount: 60, spread: 60, origin: { y: 0.65 }, colors: ['#f87171', '#fb923c', '#fbbf24'] });
        showAlert('ออกเวรสำเร็จ', `${userProfiles[currentUser].name} ออกเวรเรียบร้อย (${result.duration || ''})`, 'success');
    } catch (err) {
        showAlert('ออกเวรไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    } finally {
        updateActionButtons();
    }
}

function openUserHistory(username) {
    if (!canViewMonitoring(currentUser)) {
        showAlert('ไม่มีสิทธิ์เข้าถึง', 'เฉพาะผู้ใช้ที่มีสิทธิ์เท่านั้น', 'warning');
        return;
    }
    historyViewUser = username;
    const select = document.getElementById('historySelect');
    if (select) select.value = username;
    const label = document.getElementById('historyLabel');
    if (label) label.textContent = userProfiles[username]?.name || 'ไม่ระบุ';
    renderLog();
    document.querySelectorAll('.nav-link').forEach((btn) => btn.classList.toggle('active', btn.dataset.target === 'historySection'));
    document.querySelectorAll('main section').forEach((section) => section.classList.toggle('hidden', section.id !== 'historySection'));
    playSectionEnter(document.getElementById('historySection'));
}

function handleMenuSwitch(event) {
    const target = event.currentTarget.dataset.target;
    if (!target) return;
    if (target === 'adminSection' && !canViewMonitoring(currentUser)) {
        showAlert('ไม่มีสิทธิ์เข้าถึง', 'เฉพาะผู้ใช้ที่มีสิทธิ์เท่านั้น', 'warning');
        return;
    }
    document.querySelectorAll('.nav-link').forEach((btn) => btn.classList.toggle('active', btn.dataset.target === target));
    document.querySelectorAll('main section').forEach((section) => {
        if (section.id === target) {
            section.classList.remove('hidden');
            playSectionEnter(section);
        } else {
            section.classList.add('hidden');
        }
    });
}

function handleTabSwitch(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode) return;
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
    document.getElementById('statusPanel').classList.toggle('hidden', mode !== 'status');
    document.getElementById('forceOutPanel').classList.toggle('hidden', mode !== 'forceout');
    playSectionEnter(document.getElementById(mode === 'status' ? 'statusPanel' : 'forceOutPanel'));
}

function bindDashboardEvents() {
    document.getElementById('btnCheckIn')?.addEventListener('click', handleCheckIn);
    document.getElementById('btnCheckOut')?.addEventListener('click', handleCheckOut);
    document.getElementById('btnManual')?.addEventListener('click', () => window.open(manualUrl, '_blank'));
    document.getElementById('btnRules')?.addEventListener('click', () => window.open(rulesUrl, '_blank'));
    document.getElementById('btnFundDeposit')?.addEventListener('click', () => handleFundTransaction('deposit'));
    document.getElementById('btnFundWithdraw')?.addEventListener('click', () => handleFundTransaction('withdraw'));
    document.getElementById('btnAddStock')?.addEventListener('click', handleAddStock);
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        sessionStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
    });
    document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', handleMenuSwitch));
    document.querySelectorAll('.tab-btn').forEach((tab) => tab.addEventListener('click', handleTabSwitch));
}

async function initDashboard() {
    currentUser = sessionStorage.getItem('loggedInUser');
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }
    startClock();
    bindDashboardEvents();

    // โหลดข้อมูลล่าสุดจากฐานข้อมูลกลางก่อนแสดงผล
    try {
        await loadAllData();
    } catch (err) {
        showAlert('เชื่อมต่อฐานข้อมูลไม่สำเร็จ', 'กรุณารีเฟรชหน้าเว็บอีกครั้ง', 'error');
    }
    await loadStockData();

    renderProfile();
    renderHistoryControls();
    renderLog();
    renderTeamStatus();
    renderForceOut();
    renderCentralFund();
    renderStock();
    updateActionButtons();
    if (!canViewMonitoring(currentUser)) {
        document.getElementById('adminSection')?.classList.add('hidden');
        document.querySelectorAll('.nav-link').forEach((link) => {
            if (link.dataset.target === 'adminSection') link.classList.add('hidden');
        });
    }

    // ดึงข้อมูลใหม่ทุก 3 วินาที — คนอื่นเข้าเวร/ฝากเงิน เราจะเห็นอัตโนมัติ
    realtimeInterval = setInterval(async () => {
        try {
            const [updatedLog, updatedFund] = await Promise.all([apiGet('/api/shift'), apiGet('/api/fund')]);
            if (JSON.stringify(updatedLog) !== JSON.stringify(shiftLog)) {
                shiftLog = updatedLog;
                refreshShiftViews();
            }
            if (JSON.stringify(updatedFund) !== JSON.stringify(centralFund)) {
                centralFund = updatedFund;
                renderCentralFund();
            }
        } catch (err) {
            // เน็ตสะดุดชั่วคราว — ข้ามไปรอรอบถัดไป
        }
        // อัปเดตสต็อกแบบเรียลไทม์ (ถ้ามี API ให้ใช้)
        if (!stockOffline) {
            try {
                const updatedStock = await apiGet('/api/stock');
                if (JSON.stringify(updatedStock) !== JSON.stringify(stockItems)) {
                    stockItems = Array.isArray(updatedStock) ? updatedStock : [];
                    renderStock();
                }
            } catch (err) {
                // ข้ามไปรอรอบถัดไป
            }
        }
    }, 3000);
}

function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const btn = document.getElementById('btnLogin');
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    if (users[username] && users[username] === password) {
        sessionStorage.setItem('loggedInUser', username);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> กำลังเข้าสู่ระบบ...';
        }
        celebrate({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#22c55e', '#2563eb', '#a78bfa'] });
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 900);
        return;
    }
    const page = document.querySelector('.page-login');
    page?.classList.add('shake');
    setTimeout(() => page?.classList.remove('shake'), 500);
    [usernameInput, passwordInput].forEach((input) => {
        input.classList.add('input-error');
        setTimeout(() => input.classList.remove('input-error'), 700);
    });
    showAlert('เข้าสู่ระบบไม่สำเร็จ', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'error');
    passwordInput.value = '';
}

function initPage() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        cycleLoginBackground();
        initTilt();
        return;
    }
    if (document.querySelector('.page-dashboard')) {
        initDashboard();
        initEntrance();
    }
}

window.addEventListener('DOMContentLoaded', initPage);
window.addEventListener('beforeunload', () => {
    if (elapsedInterval) clearInterval(elapsedInterval);
    if (realtimeInterval) clearInterval(realtimeInterval);
    if (loginBgInterval) clearInterval(loginBgInterval);
});

/* ============================================================
   MODERN FX — ระบบลูกเล่นทันสมัย
   ============================================================ */

// Confetti ฉลอง (ปลอดภัยถ้า CDN โหลดไม่สำเร็จ)
function celebrate(options) {
    if (window.confetti) {
        confetti(Object.assign({ zIndex: 9999, disableForReducedMotion: true }, options));
    }
}

// ตัวเลขเงินนับขึ้น/ลงแบบไหลลื่น
function animateMoneyText(el, target, format) {
    if (!el) return;
    const from = Number(el.dataset.val || 0);
    el.dataset.val = target;
    const duration = 700;
    const start = performance.now();
    function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = format(Math.round(from + (target - from) * eased));
        if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// รายการทยอยเด้งเข้าทีละใบ
function staggerChildren(container) {
    if (!container) return;
    Array.from(container.children).forEach((child, i) => {
        child.classList.remove('animate-in');
        child.style.animationDelay = `${Math.min(i * 70, 420)}ms`;
        child.classList.add('animate-in');
        child.addEventListener('animationend', () => {
            child.classList.remove('animate-in');
            child.style.animationDelay = '';
        }, { once: true });
    });
}

// อนิเมชันตอนสลับ section / แท็บ
function playSectionEnter(element) {
    if (!element) return;
    element.classList.remove('section-enter');
    void element.offsetWidth;
    element.classList.add('section-enter');
    element.addEventListener('animationend', () => element.classList.remove('section-enter'), { once: true });
}

// การ์ดล็อกอินเอียง 3D ตามเมาส์
function initTilt() {
    const card = document.querySelector('.page-login .card-form');
    const wrap = document.querySelector('.page-login .hero-card');
    if (!card || !wrap) return;
    wrap.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(950px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
    });
    wrap.addEventListener('mouseleave', () => {
        card.style.transform = '';
    });
}

// อนิเมชันเข้าครั้งแรกของหน้าแดชบอร์ด
function initEntrance() {
    const items = document.querySelectorAll('.topbar, .dashboard-nav .nav-link, .dashboard-grid > section');
    items.forEach((el, i) => {
        el.classList.add('reveal');
        el.style.animationDelay = `${Math.min(i * 60, 420)}ms`;
    });
}

// Ripple กระจายจากจุดที่กด บนปุ่มทุกปุ่มในระบบ
document.addEventListener('click', (event) => {
    const target = event.target.closest('button, .nav-link, .tab-btn');
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.1;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    setTimeout(() => ripple.remove(), 680);
});