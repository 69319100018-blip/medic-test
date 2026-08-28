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
let stockWithdrawals = [];
let vehicles = [];
let vehicleOffline = false;
const STOCK_LOCAL_KEY = 'medicStockItems';
const STOCK_WITHDRAWALS_LOCAL_KEY = 'medicStockWithdrawals';
const VEHICLE_LOCAL_KEY = 'medicVehicles';

function getDefaultFundState() {
    return {
        balance: 70000,
        allocations: {
            cash: 40000,
            deposit: 20000,
            reserve: 10000
        },
        totals: { income: 0, expense: 0 },
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

// ดึงข้อมูลทะเบียนรถ — ถ้าไม่มี API จะใช้ข้อมูลในเครื่องแทน
async function loadVehicleData() {
    try {
        const data = await apiGet('/api/vehicle');
        vehicles = Array.isArray(data) ? data : [];
        vehicleOffline = false;
    } catch (err) {
        vehicleOffline = true;
        try {
            vehicles = JSON.parse(localStorage.getItem(VEHICLE_LOCAL_KEY) || '[]');
        } catch (e) {
            vehicles = [];
        }
    }
}

function saveVehicleLocal() {
    localStorage.setItem(VEHICLE_LOCAL_KEY, JSON.stringify(vehicles));
}

// ประวัติการเบิกอุปกรณ์ — เฉพาะแอดมิน/ผอ. เท่านั้นที่โหลด/เห็นได้
async function loadStockWithdrawals() {
    if (!canViewMonitoring(currentUser)) return;
    try {
        stockWithdrawals = await apiGet(`/api/stock?view=withdrawals&username=${encodeURIComponent(currentUser)}`);
        if (!Array.isArray(stockWithdrawals)) stockWithdrawals = [];
    } catch (err) {
        console.error('loadStockWithdrawals error:', err);
        try {
            stockWithdrawals = JSON.parse(localStorage.getItem(STOCK_WITHDRAWALS_LOCAL_KEY) || '[]');
        } catch (e) {
            stockWithdrawals = [];
        }
    }
}

function saveStockWithdrawalsLocal() {
    localStorage.setItem(STOCK_WITHDRAWALS_LOCAL_KEY, JSON.stringify(stockWithdrawals));
}

function renderStockWithdrawals() {
    const list = document.getElementById('stockHistoryList');
    const summary = document.getElementById('stockHistorySummary');
    if (!list) return;
    if (summary) summary.textContent = `ทั้งหมด ${stockWithdrawals.length} รายการ`;

    if (!stockWithdrawals.length) {
        list.innerHTML = '<div class="log-item"><strong>ยังไม่มีประวัติการเบิก</strong><span>รายการเบิกอุปกรณ์จะแสดงที่นี่</span></div>';
        return;
    }

    list.innerHTML = stockWithdrawals.map((w) => {
        const totalPrice = (Number(w.price) || 0) * (Number(w.quantity) || 0);
        return `
        <div class="fund-history-item">
            <div>
                <strong>${escapeHtml(w.itemName)}</strong>
                <span>ผู้เบิก: ${escapeHtml(w.requester)} • บันทึกโดย ${escapeHtml(userProfiles[w.username]?.name || w.username || 'ไม่ระบุ')}</span>
            </div>
            <div class="fund-history-meta">
                <strong>−${Number(w.quantity).toLocaleString('th-TH')} ชิ้น</strong>
                <span>${w.date} ${w.time}${w.price ? ` • ${Number(w.price).toLocaleString('th-TH')} บาท/ชิ้น (รวม ${totalPrice.toLocaleString('th-TH')} บาท)` : ''}</span>
            </div>
        </div>`;
    }).join('');
    staggerChildren(list);
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

/* ---------- Login video background + mouse focus ---------- */
const loginVideoPlaylist = [
    'assets/bg1-h264.mp4',
    'assets/bg3-h264.mp4',
    'assets/bg2.mp4'  // ยังเป็น HEVC — เบราว์เซอร์ที่รองรับจะเล่นได้
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

function isAdmin(username) {
    return userProfiles[username]?.isAdmin === true;
}

function canManageStock(username) {
    const profile = userProfiles[username];
    if (!profile) return false;
    // เฉพาะแอดมิน และ ผู้อำนวยการ (ไม่ใช่รองผอ.) เท่านั้นที่จัดการสต็อกได้
    if (profile.isAdmin) return true;
    const role = (profile.role || '').toLowerCase();
    return role.includes('ผู้อำนวยการ') && !role.includes('รอง');
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

    const incomeEl = document.getElementById('fundIncomeTotal');
    const expenseEl = document.getElementById('fundExpenseTotal');
    const income = Number(centralFund.totals?.income) || 0;
    const expense = Number(centralFund.totals?.expense) || 0;
    if (incomeEl) animateMoneyText(incomeEl, income, (v) => `${v.toLocaleString('th-TH')} บาท`);
    if (expenseEl) animateMoneyText(expenseEl, expense, (v) => `${v.toLocaleString('th-TH')} บาท`);

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
        console.error('promptAdjustStock error:', err);
        showAlert('ทำรายการไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// เพิ่มเงินฝาก/เงินสำรอง — เฉพาะแอดมิน/ผอ. เท่านั้น
async function handleFundAdminAdd(target) {
    if (!isAdmin(currentUser)) return;
    const amountInput = document.getElementById('fundAdminAmountInput');
    const noteInput = document.getElementById('fundAdminNoteInput');
    const amount = Number(amountInput?.value);
    if (!amountInput || !Number.isFinite(amount) || amount <= 0) {
        showAlert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกจำนวนเงินที่มากกว่า 0', 'warning');
        return;
    }

    const action = target === 'deposit' ? 'add_deposit' : 'add_reserve';
    const btn = document.getElementById(target === 'deposit' ? 'btnFundAddDeposit' : 'btnFundAddReserve');
    if (btn) btn.disabled = true;
    try {
        await apiPost('/api/fund', {
            action,
            amount,
            note: noteInput?.value.trim() || '',
            username: currentUser
        });
        await loadAllData();
        renderCentralFund();
        amountInput.value = '';
        noteInput.value = '';
        celebrate({ particleCount: 70, spread: 65, origin: { y: 0.6 }, colors: ['#fbbf24', '#f59e0b', '#22c55e'] });
        showAlert('เพิ่มเงินสำเร็จ', `เพิ่ม${target === 'deposit' ? 'เงินฝาก' : 'เงินสำรอง'} ${amount.toLocaleString('th-TH')} บาท เรียบร้อย`, 'success');
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
    // ถ้ามีการตั้งสถานะด้วยตนเอง (เฉพาะแอดมิน/ผอ./รองผอ.)
    const manual = item.manualStatus;
    if (manual && manual !== 'auto') {
        const map = {
            'ready':   { key: 'ok',      label: 'พร้อมใช้งาน', missing: 0 },
            'ordered': { key: 'ordered', label: 'สั่งซื้อแล้ว', missing: 0 },
            'waiting': { key: 'waiting', label: 'รอรับของ',    missing: 0 },
            'damaged': { key: 'damaged', label: 'ชำรุด',        missing: 0 }
        };
        if (map[manual]) return map[manual];
    }
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

    const isManager = canManageStock(currentUser);
    list.innerHTML = stockItems.map((item, i) => {
        const s = statuses[i];
        const addedByName = userProfiles[item.addedBy]?.name || item.addedBy || 'ไม่ระบุ';
        return `
        <div class="stock-item">
            <div class="stock-item-head">
                <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    ${isManager ? `<span class="stock-meta">👤 เพิ่มโดย ${escapeHtml(addedByName)}${item.date ? ` • ${item.date} ${item.time || ''}` : ''}</span>` : ''}
                </div>
                <span class="badge stock-${s.key}">${s.label}</span>
            </div>
            <div class="stock-item-body">
                <span>คงเหลือ <strong>${Number(item.quantity).toLocaleString('th-TH')}</strong> / ขั้นต่ำ ${Number(item.minQuantity).toLocaleString('th-TH')} ชิ้น</span>
                ${isManager ? `<span>แหล่งที่มา: ${escapeHtml(item.source || 'ไม่ระบุ')}</span>` : ''}
                ${s.missing > 0
                    ? `<span class="stock-missing">⚠️ ขาดอีก ${s.missing.toLocaleString('th-TH')} ชิ้น</span>`
                    : '<span class="stock-ok">✔ สต็อกเพียงพอ</span>'}
            </div>
            <div class="stock-item-actions">
                ${isManager ? `<button class="btn btn-secondary btn-small stock-adjust" data-id="${item.id}" data-delta="1" type="button">＋ เติมสต็อก</button>` : ''}
                <button class="btn btn-secondary btn-small stock-adjust" data-id="${item.id}" data-delta="-1" type="button" ${Number(item.quantity) <= 0 ? 'disabled' : ''}>− ใช้/เบิก</button>
                ${isManager ? `<button class="btn btn-danger btn-small stock-remove" data-id="${item.id}" type="button">ลบ</button>` : ''}
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.stock-adjust').forEach((btn) => {
        btn.addEventListener('click', () => promptAdjustStock(btn.dataset.id, Number(btn.dataset.delta)));
    });
    list.querySelectorAll('.stock-remove').forEach((btn) => {
        btn.addEventListener('click', () => confirmRemoveStock(btn.dataset.id));
    });
    list.querySelectorAll('.stock-status-select').forEach((sel) => {
        sel.addEventListener('change', (e) => handleStockStatusChange(e.target.dataset.id, e.target.value));
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
                manualStatus: 'auto',
                date: now.toLocaleDateString('th-TH'),
                time: now.toLocaleTimeString('th-TH', { hour12: false })
            });
            saveStockLocal();
        } else {
            await apiPost('/api/stock', { action: 'add', name, quantity, minQuantity, source, username: currentUser, manualStatus: 'auto' });
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

// เติม/เบิกสต็อก — เติมถามแค่จำนวน / เบิกต้องระบุ "ผู้เบิก" + จำนวนเสมอ
async function promptAdjustStock(id, direction) {
    const item = stockItems.find((s) => String(s.id) === String(id));
    if (!item) return;
    const isAdd = direction > 0;
    let amount = 1;
    let requester = '';
    let price = 0;

    if (isAdd) {
        // เติมสต็อก — ถามแค่จำนวนเหมือนเดิม
        if (window.Swal) {
            const result = await Swal.fire({
                title: `เติมสต็อก "${item.name}"`,
                input: 'number',
                inputValue: 1,
                inputAttributes: { min: 1, step: 1 },
                showCancelButton: true,
                confirmButtonText: 'เติมสต็อก',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#16a34a'
            });
            if (!result.isConfirmed) return;
            amount = Math.floor(Number(result.value));
        } else {
            const raw = prompt('จำนวนที่เติม (ชิ้น):', '1');
            if (raw === null) return;
            amount = Math.floor(Number(raw));
        }
    } else {
        // ใช้/เบิก — ต้องกรอกชื่อผู้เบิกด้วยเสมอ เพื่อให้แอดมิน/ผอ. ตรวจสอบย้อนหลังได้
        if (window.Swal) {
            const result = await Swal.fire({
                title: `ใช้/เบิก "${item.name}"`,
                html: `
                    <div style="text-align:left; display:grid; gap:10px;">
                        <label style="display:grid; gap:4px; font-size:14px;">
                            ชื่อผู้เบิก
                            <input id="swalRequesterInput" class="swal2-input" style="margin:0;" placeholder="ชื่อผู้เบิกอุปกรณ์" autocomplete="off">
                        </label>
                        <label style="display:grid; gap:4px; font-size:14px;">
                            จำนวนที่เบิก (ชิ้น)
                            <input id="swalAmountInput" type="number" class="swal2-input" style="margin:0;" min="1" step="1" value="1">
                        </label>
                        <label style="display:grid; gap:4px; font-size:14px;">
                            ราคาต่อชิ้น (บาท)
                            <input id="swalPriceInput" type="number" class="swal2-input" style="margin:0;" min="0" step="1" placeholder="ระบุราคาต่อชิ้น" value="0">
                        </label>
                    </div>`,
                showCancelButton: true,
                confirmButtonText: 'เบิกออก',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#dc2626',
                focusConfirm: false,
                preConfirm: () => {
                    const requesterVal = document.getElementById('swalRequesterInput')?.value.trim();
                    const amountVal = Math.floor(Number(document.getElementById('swalAmountInput')?.value));
                    const priceVal = Math.floor(Number(document.getElementById('swalPriceInput')?.value)) || 0;
                    if (!requesterVal) {
                        Swal.showValidationMessage('กรุณากรอกชื่อผู้เบิก');
                        return false;
                    }
                    if (!Number.isFinite(amountVal) || amountVal <= 0) {
                        Swal.showValidationMessage('กรุณาระบุจำนวนมากกว่า 0');
                        return false;
                    }
                    if (priceVal < 0) {
                        Swal.showValidationMessage('ราคาต้องไม่ติดลบ');
                        return false;
                    }
                    return { requesterVal, amountVal, priceVal };
                }
            });
            if (!result.isConfirmed) return;
            requester = result.value.requesterVal;
            amount = result.value.amountVal;
            price = result.value.priceVal;
        } else {
            const nameRaw = prompt('ชื่อผู้เบิกอุปกรณ์:', '');
            if (nameRaw === null) return;
            requester = nameRaw.trim();
            if (!requester) {
                showAlert('ข้อมูลไม่ครบ', 'กรุณาระบุชื่อผู้เบิก', 'warning');
                return;
            }
            const raw = prompt('จำนวนที่เบิก (ชิ้น):', '1');
            if (raw === null) return;
            amount = Math.floor(Number(raw));
            const priceRaw = prompt('ราคาต่อชิ้น (บาท):', '0');
            if (priceRaw === null) return;
            price = Math.floor(Number(priceRaw)) || 0;
        }
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
            if (!isAdd) {
                const now = new Date();
                stockWithdrawals.unshift({
                    itemId: item.id,
                    itemName: item.name,
                    requester,
                    username: currentUser,
                    quantity: amount,
                    price,
                    date: now.toLocaleDateString('th-TH'),
                    time: now.toLocaleTimeString('th-TH', { hour12: false })
                });
                saveStockWithdrawalsLocal();
            }
        } else {
            await apiPost('/api/stock', { action: 'adjust', id: item.id, delta, requester, price, username: currentUser });
            await loadStockData();
            if (!isAdd && canViewMonitoring(currentUser)) await loadStockWithdrawals();
        }
        renderStock();
        if (!isAdd && canViewMonitoring(currentUser)) renderStockWithdrawals();
        showAlert(
            isAdd ? 'เติมสต็อกแล้ว' : 'เบิกอุปกรณ์แล้ว',
            isAdd ? `${item.name} +${amount} ชิ้น` : `${item.name} −${amount} ชิ้น • ผู้เบิก: ${escapeHtml(requester)}`,
            'success'
        );
    } catch (err) {
        showAlert('ทำรายการไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    }
}

async function handleStockStatusChange(id, newStatus) {
    const item = stockItems.find((s) => String(s.id) === String(id));
    if (!item) return;
    item.manualStatus = newStatus;
    if (stockOffline) {
        saveStockLocal();
    } else {
        try {
            await apiPost('/api/stock', { action: 'set_status', id: item.id, status: newStatus, username: currentUser });
        } catch (err) {
            // ถ้า API ยังไม่รองรับ เก็บ local สำรอง
            saveStockLocal();
        }
    }
    renderStock();
    const statusLabel = { auto: 'อัตโนมัติ', ready: 'พร้อมใช้งาน', ordered: 'สั่งซื้อแล้ว', waiting: 'รอรับของ', damaged: 'ชำรุด' };
    showAlert('อัปเดตสถานะแล้ว', `${escapeHtml(item.name)} → ${statusLabel[newStatus] || newStatus}`, 'success');
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

// ============================================================
// VEHICLE — ระบบทะเบียนรถ
// ทุกคนเพิ่ม/ดูรถของตัวเองได้ แอดมิน/ผอ. ดูของทุกคนได้ในการ์ดแยก
// ============================================================
function vehicleItemHtml(v, { showOwner } = {}) {
    const ownerName = userProfiles[v.username]?.name || v.username || 'ไม่ระบุ';
    const canRemove = v.username === currentUser || isAdmin(currentUser);
    return `
        <div class="stock-item">
            <div class="stock-item-head">
                <div>
                    <strong>${escapeHtml((v.plate || '').toUpperCase())}</strong>
                    <span class="stock-meta">${escapeHtml(v.model)}${showOwner ? ` • เจ้าของ: ${escapeHtml(ownerName)}` : ''}${v.date ? ` • เพิ่มเมื่อ ${v.date} ${v.time || ''}` : ''}</span>
                </div>
            </div>
            ${canRemove ? `
            <div class="stock-item-actions">
                <button class="btn btn-danger btn-small vehicle-remove" data-id="${v.id}" type="button">ลบ</button>
            </div>` : ''}
        </div>`;
}

function renderVehicles() {
    const ownerLabel = document.getElementById('vehicleOwnerLabel');
    if (ownerLabel) ownerLabel.textContent = userProfiles[currentUser]?.name || currentUser || '-';

    const myVehicles = vehicles.filter((v) => v.username === currentUser);
    const summaryPill = document.getElementById('vehicleSummaryPill');
    if (summaryPill) summaryPill.textContent = `ทั้งหมด ${myVehicles.length} คัน`;

    const myList = document.getElementById('vehicleMyList');
    if (myList) {
        myList.innerHTML = myVehicles.length
            ? myVehicles.map((v) => vehicleItemHtml(v, { showOwner: false })).join('')
            : '<div class="log-item"><strong>ยังไม่มีรถของคุณ</strong><span>เพิ่มทะเบียนรถคันแรกจากฟอร์มด้านบน</span></div>';
        myList.querySelectorAll('.vehicle-remove').forEach((btn) => {
            btn.addEventListener('click', () => confirmRemoveVehicle(btn.dataset.id));
        });
    }

    const adminWrap = document.getElementById('vehicleAdminWrap');
    const allList = document.getElementById('vehicleAllList');
    if (adminWrap && allList) {
        const canSeeAll = canViewMonitoring(currentUser) || isAdmin(currentUser);
        adminWrap.classList.toggle('hidden', !canSeeAll);
        if (canSeeAll) {
            allList.innerHTML = vehicles.length
                ? vehicles.map((v) => vehicleItemHtml(v, { showOwner: true })).join('')
                : '<div class="log-item"><strong>ยังไม่มีรถในระบบ</strong><span>ยังไม่มีใครเพิ่มทะเบียนรถ</span></div>';
            allList.querySelectorAll('.vehicle-remove').forEach((btn) => {
                btn.addEventListener('click', () => confirmRemoveVehicle(btn.dataset.id));
            });
        }
    }
    staggerChildren(myList);
}

// เพิ่มทะเบียนรถ — ผูกกับบัญชีที่ล็อกอินอัตโนมัติ
async function handleAddVehicle() {
    const plateInput = document.getElementById('vehiclePlateInput');
    const modelInput = document.getElementById('vehicleModelInput');
    const plate = plateInput?.value.trim();
    const model = modelInput?.value.trim();
    if (!plate || !model) {
        showAlert('ข้อมูลไม่ครบ', 'กรุณากรอกเลขทะเบียนและรุ่นรถให้ครบ', 'warning');
        if (!plate) { plateInput?.classList.add('input-error'); setTimeout(() => plateInput?.classList.remove('input-error'), 700); }
        if (!model) { modelInput?.classList.add('input-error'); setTimeout(() => modelInput?.classList.remove('input-error'), 700); }
        return;
    }

    const btn = document.getElementById('btnAddVehicle');
    if (btn) btn.disabled = true;
    try {
        if (vehicleOffline) {
            const now = new Date();
            vehicles.unshift({
                id: Date.now(),
                username: currentUser,
                plate,
                model,
                date: now.toLocaleDateString('th-TH'),
                time: now.toLocaleTimeString('th-TH', { hour12: false })
            });
            saveVehicleLocal();
        } else {
            await apiPost('/api/vehicle', { action: 'add', username: currentUser, plate, model });
            await loadVehicleData();
        }
        renderVehicles();
        plateInput.value = '';
        modelInput.value = '';
        celebrate({ particleCount: 70, spread: 65, origin: { y: 0.6 }, colors: ['#2563eb', '#16a34a', '#fbbf24'] });
        showAlert('เพิ่มรถสำเร็จ', `${plate.toUpperCase()} • ${model}`, 'success');
    } catch (err) {
        showAlert('เพิ่มรถไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้ง', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function confirmRemoveVehicle(id) {
    const item = vehicles.find((v) => String(v.id) === String(id));
    if (!item) return;
    if (item.username !== currentUser && !isAdmin(currentUser)) {
        showAlert('ไม่มีสิทธิ์', 'ลบได้เฉพาะรถของตัวเอง หรือแอดมิน/ผอ. เท่านั้น', 'warning');
        return;
    }
    let confirmed = true;
    if (window.Swal) {
        const result = await Swal.fire({
            title: 'ลบรายการนี้?',
            text: `"${item.plate.toUpperCase()}" จะถูกลบออกจากทะเบียนรถ`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ลบรายการ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#dc2626'
        });
        confirmed = result.isConfirmed;
    } else {
        confirmed = confirm(`ลบ "${item.plate.toUpperCase()}" ออกจากทะเบียนรถ?`);
    }
    if (!confirmed) return;
    try {
        if (vehicleOffline) {
            vehicles = vehicles.filter((v) => String(v.id) !== String(id));
            saveVehicleLocal();
        } else {
            await apiPost('/api/vehicle', { action: 'remove', id: item.id, username: currentUser });
            await loadVehicleData();
        }
        renderVehicles();
        showAlert('ลบรายการแล้ว', `${item.plate.toUpperCase()} ถูกลบออกจากทะเบียนรถ`, 'success');
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
    statusLabel.style.color = currentCheckIn ? '#16a34a' : '';
    const statusDot = document.getElementById('avatarStatusDot');
    if (statusDot) {
        statusDot.classList.toggle('on-duty', !!currentCheckIn);
    }
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
    if ((target === 'adminSection' || target === 'stockHistorySection') && !canViewMonitoring(currentUser)) {
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
    if (target === 'stockHistorySection') {
        loadStockWithdrawals().then(renderStockWithdrawals);
    }
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
    document.getElementById('btnFundAddDeposit')?.addEventListener('click', () => handleFundAdminAdd('deposit'));
    document.getElementById('btnFundAddReserve')?.addEventListener('click', () => handleFundAdminAdd('reserve'));
    document.getElementById('btnAddStock')?.addEventListener('click', handleAddStock);
    document.getElementById('btnAddVehicle')?.addEventListener('click', handleAddVehicle);
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
    await loadVehicleData();

    renderProfile();
    renderHistoryControls();
    renderLog();
    renderTeamStatus();
    renderForceOut();
    renderCentralFund();
    renderStock();
    renderVehicles();
    updateActionButtons();
    if (!canViewMonitoring(currentUser)) {
        document.getElementById('adminSection')?.classList.add('hidden');
        document.getElementById('stockHistorySection')?.classList.add('hidden');
        document.querySelectorAll('.nav-link').forEach((link) => {
            if (link.dataset.target === 'adminSection' || link.dataset.target === 'stockHistorySection') {
                link.classList.add('hidden');
            }
        });
    } else {
        await loadStockWithdrawals();
        renderStockWithdrawals();
    }
    document.getElementById('fundAdminCard')?.classList.toggle('hidden', !isAdmin(currentUser));
    document.getElementById('stockAddFormWrap')?.classList.toggle('hidden', !canManageStock(currentUser));

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
            // อัปเดตประวัติการเบิกแบบเรียลไทม์ — เฉพาะแอดมิน/ผอ.
            if (canViewMonitoring(currentUser)) {
                try {
                    const updatedWithdrawals = await apiGet(`/api/stock?view=withdrawals&username=${encodeURIComponent(currentUser)}`);
                    if (JSON.stringify(updatedWithdrawals) !== JSON.stringify(stockWithdrawals)) {
                        stockWithdrawals = Array.isArray(updatedWithdrawals) ? updatedWithdrawals : [];
                        renderStockWithdrawals();
                    }
                } catch (err) {
                    // ข้ามไปรอรอบถัดไป
                }
            }
        }
        // อัปเดตทะเบียนรถแบบเรียลไทม์ (ถ้ามี API ให้ใช้)
        if (!vehicleOffline) {
            try {
                const updatedVehicles = await apiGet('/api/vehicle');
                if (JSON.stringify(updatedVehicles) !== JSON.stringify(vehicles)) {
                    vehicles = Array.isArray(updatedVehicles) ? updatedVehicles : [];
                    renderVehicles();
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
    const page = document.getElementById('loginPage') || document.querySelector('.login-page');
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
        initLoginVideo();
        initLoginFocus();
        const yearEl = document.getElementById('year');
        if (yearEl) yearEl.textContent = new Date().getFullYear();
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

/* ---------- Login: video playlist + mouse-proximity focus ---------- */
function initLoginVideo() {
    const playlist = loginVideoPlaylist;
    const video = document.getElementById('bgVideo');
    const btnPlay = document.getElementById('bgPlayPause');
    const iconPlay = document.getElementById('bgPlayIcon');
    const pickBtns = document.querySelectorAll('.bg-pick');
    if (!video || !playlist.length) return;

    const STORAGE_KEY = 'medic_login_bg_index';
    let index = 0;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== null) index = Math.min(parseInt(saved, 10) || 0, playlist.length - 1);
    } catch (_) {}
    let userPaused = false;

    function updatePickUI() {
        pickBtns.forEach((btn) => {
            btn.classList.toggle('active', parseInt(btn.dataset.bg, 10) === index);
        });
    }

    function loadAndPlay(i) {
        index = ((i % playlist.length) + playlist.length) % playlist.length;
        try { localStorage.setItem(STORAGE_KEY, String(index)); } catch (_) {}
        video.src = playlist[index];
        video.load();
        updatePickUI();
        if (!userPaused) {
            const p = video.play();
            if (p && p.catch) p.catch(() => {});
        }
    }

    function togglePlay() {
        if (video.paused) {
            userPaused = false;
            video.play().catch(() => {});
            if (iconPlay) iconPlay.className = 'bi bi-pause-fill';
        } else {
            userPaused = true;
            video.pause();
            if (iconPlay) iconPlay.className = 'bi bi-play-fill';
        }
    }

    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    video.addEventListener('ended', () => {
        loadAndPlay(index + 1);
    });

    if (btnPlay) btnPlay.addEventListener('click', togglePlay);
    pickBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            userPaused = false;
            loadAndPlay(parseInt(btn.dataset.bg, 10));
            if (iconPlay) iconPlay.className = 'bi bi-pause-fill';
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea')) return;
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlay();
        } else if (e.key === '1' || e.key === '2' || e.key === '3') {
            userPaused = false;
            loadAndPlay(parseInt(e.key, 10) - 1);
            if (iconPlay) iconPlay.className = 'bi bi-pause-fill';
        }
    });

    loadAndPlay(index);
}

function initLoginFocus() {
    const page = document.getElementById('loginPage') || document.querySelector('.login-page');
    const card = document.getElementById('loginCard') || document.querySelector('.login-card');
    const bgPanel = document.getElementById('bgControls');
    if (!page || !card) return;

    // ปิดเอฟเฟกต์บนมือถือ / touch / reduced-motion
    const mqMobile = window.matchMedia('(max-width: 900px)');
    const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mqMobile.matches || mqReduce.matches) {
        page.style.setProperty('--focus', '1');
        return;
    }

    let target = 0;   // เริ่มหายสนิท รอเมาส์
    let current = 0;
    let focused = false;
    let raf = null;

    // รัศมี "ใกล้" กว้างขึ้น เพื่อให้พิมพ์/กดฟอร์มได้สบาย
    const NEAR_RADIUS = 160;
    const FAR_RADIUS = 420;

    function clamp(v, a, b) {
        return Math.max(a, Math.min(b, v));
    }

    function distanceToEl(el, mx, my) {
        if (!el) return Infinity;
        const r = el.getBoundingClientRect();
        const cx = clamp(mx, r.left, r.right);
        const cy = clamp(my, r.top, r.bottom);
        const dx = mx - cx;
        const dy = my - cy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function setTargetFromMouse(mx, my) {
        // กำลังโฟกัสช่องกรอก / ปุ่ม → บังคับชัดเต็มที่
        if (focused) {
            target = 1;
            return;
        }
        const d = Math.min(distanceToEl(card, mx, my), distanceToEl(bgPanel, mx, my));
        if (d <= NEAR_RADIUS) {
            target = 1;
        } else if (d >= FAR_RADIUS) {
            target = 0; // หายสนิท → พื้นหลังสว่างสุด
        } else {
            const t = (d - NEAR_RADIUS) / (FAR_RADIUS - NEAR_RADIUS);
            target = Math.pow(1 - t, 1.6);
        }
    }

    function tick() {
        current += (target - current) * 0.16;
        if (Math.abs(target - current) < 0.001) current = target;
        page.style.setProperty('--focus', current.toFixed(4));
        const near = current > 0.65;
        const faded = current < 0.04;
        card.classList.toggle('is-near', near);
        card.classList.toggle('is-faded', faded);
        page.classList.toggle('ui-hidden', current < 0.06);
        // เมื่อยังมองเห็นพอสมควร ให้คลิกได้เสมอ
        if (!faded) {
            card.style.pointerEvents = 'auto';
        }
        if (Math.abs(target - current) > 0.001) {
            raf = requestAnimationFrame(tick);
        } else {
            raf = null;
        }
    }

    function requestTick() {
        if (!raf) raf = requestAnimationFrame(tick);
    }

    document.addEventListener('mousemove', (e) => {
        setTargetFromMouse(e.clientX, e.clientY);
        requestTick();
    }, { passive: true });

    // คลิกที่การ์ด → โชว์ชัดทันที (กันคลิกไม่ติดตอนกำลังจาง)
    card.addEventListener('pointerdown', () => {
        focused = true;
        target = 1;
        requestTick();
    });

    const inputs = card.querySelectorAll('input, button');
    inputs.forEach((el) => {
        el.addEventListener('focus', () => {
            focused = true;
            target = 1;
            requestTick();
        });
        el.addEventListener('blur', () => {
            // delay เล็กน้อย เผื่อคลิกปุ่ม submit
            setTimeout(() => {
                if (!card.contains(document.activeElement)) {
                    focused = false;
                }
            }, 120);
        });
    });

    // เริ่มหายสนิท — พื้นหลังสว่างชัด
    page.style.setProperty('--focus', '0');
    current = 0;
    target = 0;
    card.classList.add('is-faded');
    page.classList.add('ui-hidden');
}

function initTilt() {
    // kept as no-op for compatibility; focus effect replaces tilt
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
/* ============================================================
   MUSIC PLAYER — เล่นไฟล์/โฟลเดอร์เพลงจากเครื่อง
   ============================================================ */
(function initMusicPlayer() {
    var player = document.getElementById('musicPlayer');
    if (!player) return;

    var audio = document.getElementById('musicAudio');
    var titleEl = document.getElementById('musicTitle');
    var subEl = document.getElementById('musicSubtitle');
    var artEl = document.getElementById('musicArt');
    var playBtn = document.getElementById('musicPlay');
    var playIcon = document.getElementById('musicPlayIcon');
    var prevBtn = document.getElementById('musicPrev');
    var nextBtn = document.getElementById('musicNext');
    var seek = document.getElementById('musicSeek');
    var curTime = document.getElementById('musicCurrent');
    var durTime = document.getElementById('musicDuration');
    var vol = document.getElementById('musicVolume');
    var volIcon = document.getElementById('musicVolIcon');
    var fileInput = document.getElementById('musicFileInput');
    var folderInput = document.getElementById('musicFolderInput');
    var pickFilesBtn = document.getElementById('musicPickFiles');
    var pickFolderBtn = document.getElementById('musicPickFolder');
    var playlistBtn = document.getElementById('musicPlaylistBtn');
    var playlistPanel = document.getElementById('musicPlaylistPanel');
    var playlistEl = document.getElementById('musicPlaylist');
    var playlistEmpty = document.getElementById('musicPlaylistEmpty');
    var playlistClose = document.getElementById('musicPlaylistClose');
    var shuffleBtn = document.getElementById('musicShuffleBtn');

    var tracks = []; // { name, url, file }
    var index = -1;
    var seeking = false;
    // โหมดเล่น: order | repeat-all | repeat-one | shuffle
    var playMode = 'order';
    var PLAY_MODES = ['order', 'repeat-all', 'repeat-one', 'shuffle'];
    var PLAY_MODE_META = {
        order:       { icon: 'bi-arrow-right',   title: 'เล่นตามลำดับ',     active: false },
        'repeat-all':{ icon: 'bi-repeat',        title: 'วนทั้งเพลย์ลิสต์',  active: true  },
        'repeat-one':{ icon: 'bi-repeat-1',      title: 'วนเพลงเดียว',      active: true  },
        shuffle:     { icon: 'bi-shuffle',       title: 'สุ่มเพลง',         active: true  }
    };
    var collapsed = false;

    var AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus)$/i;

    // —— Drag + Collapse ——
    var dragHandle = document.getElementById('musicDragHandle');
    var collapseBtn = document.getElementById('musicCollapseBtn');
    var collapseIcon = document.getElementById('musicCollapseIcon');
    var STORAGE_KEY = 'musicPlayerPos';

    // state สำหรับ parallax (rotateX/Y) — ใช้ร่วมกับ drag scale/tilt
    var paraRX = 0, paraRY = 0;
    var PARA_MAX = 7; // องศาสูงสุด
    var dragging = false;

    function applyPosition(left, top, scale, tilt) {
        if (left == null || top == null) return;
        player.style.left = left + 'px';
        player.style.top = top + 'px';
        player.style.bottom = 'auto';
        player.style.right = 'auto';
        var s = scale != null ? scale : 1;
        var r = tilt != null ? tilt : 0;
        player.style.transformOrigin = '50% 50%';
        // รวม drag scale/tilt + parallax 3D
        var parts = [];
        if (s !== 1) parts.push('scale(' + s + ')');
        if (r !== 0) parts.push('rotate(' + r + 'deg)');
        if (paraRX !== 0 || paraRY !== 0) {
            parts.push('perspective(900px) rotateX(' + paraRX + 'deg) rotateY(' + paraRY + 'deg)');
        }
        player.style.transform = parts.length ? parts.join(' ') : 'none';
    }

    function setParallaxLayers(nx, ny) {
        // nx, ny ในช่วง -1..1 — ชั้นใกล้เลื่อนมาก / ชั้นไกลเลื่อนน้อย
        var set = function (name, depth) {
            player.style.setProperty('--px-' + name + '-x', (nx * depth) + 'px');
            player.style.setProperty('--px-' + name + '-y', (ny * depth) + 'px');
        };
        set('art', 10);
        set('info', 6);
        set('ctrl', 8);
        set('prog', 4);
        set('local', 5);
    }

    function clearParallaxLayers() {
        ['art', 'info', 'ctrl', 'prog', 'local'].forEach(function (name) {
            player.style.setProperty('--px-' + name + '-x', '0px');
            player.style.setProperty('--px-' + name + '-y', '0px');
        });
    }

    function updateParallaxFromEvent(e) {
        if (dragging) return;
        var rect = player.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var nx = (e.clientX - cx) / (rect.width / 2);
        var ny = (e.clientY - cy) / (rect.height / 2);
        nx = Math.max(-1, Math.min(1, nx));
        ny = Math.max(-1, Math.min(1, ny));
        // เอียง: เมาส์ขวา → หมุน Y บวก, เมาส์ล่าง → หมุน X ลบ (ธรรมชาติ)
        paraRY = nx * PARA_MAX;
        paraRX = -ny * PARA_MAX;
        player.classList.add('is-parallax');
        setParallaxLayers(nx, ny);
        // อัปเดต transform โดยคง left/top ปัจจุบัน
        var curL = parseFloat(player.style.left);
        var curT = parseFloat(player.style.top);
        if (!isNaN(curL) && !isNaN(curT)) {
            applyPosition(curL, curT, 1, 0);
        } else {
            // ยังอยู่ตำแหน่งกลางเริ่มต้น (translateX -50%)
            player.style.transformOrigin = '50% 50%';
            player.style.transform =
                'translateX(-50%) perspective(900px) rotateX(' + paraRX + 'deg) rotateY(' + paraRY + 'deg)';
        }
    }

    function resetParallax() {
        if (dragging) return;
        paraRX = 0;
        paraRY = 0;
        player.classList.remove('is-parallax');
        clearParallaxLayers();
        var curL = parseFloat(player.style.left);
        var curT = parseFloat(player.style.top);
        if (!isNaN(curL) && !isNaN(curT)) {
            applyPosition(curL, curT, 1, 0);
        } else {
            player.style.transform = 'translateX(-50%)';
        }
    }

    function clampPos(left, top) {
        var rect = player.getBoundingClientRect();
        var maxL = Math.max(0, window.innerWidth - rect.width);
        var maxT = Math.max(0, window.innerHeight - rect.height);
        return {
            left: Math.min(Math.max(0, left), maxL),
            top: Math.min(Math.max(0, top), maxT)
        };
    }

    function savePos() {
        try {
            var rect = player.getBoundingClientRect();
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                left: rect.left,
                top: rect.top,
                collapsed: collapsed
            }));
        } catch (e) {}
    }

    function restorePos() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var data = JSON.parse(raw);
            if (data.collapsed) {
                collapsed = true;
                player.classList.add('is-collapsed');
                if (collapseIcon) collapseIcon.className = 'bi bi-chevron-up';
                if (collapseBtn) collapseBtn.title = 'ขยาย';
            }
            if (typeof data.left === 'number' && typeof data.top === 'number') {
                // wait a frame so collapsed size is applied
                requestAnimationFrame(function () {
                    var p = clampPos(data.left, data.top);
                    applyPosition(p.left, p.top);
                });
            }
        } catch (e) {}
    }

    if (collapseBtn) {
        collapseBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            collapsed = !collapsed;
            player.classList.toggle('is-collapsed', collapsed);
            if (collapseIcon) {
                collapseIcon.className = collapsed ? 'bi bi-chevron-up' : 'bi bi-chevron-down';
            }
            collapseBtn.title = collapsed ? 'ขยาย' : 'หดย่อ';
            // keep inside viewport after size change
            requestAnimationFrame(function () {
                var rect = player.getBoundingClientRect();
                var p = clampPos(rect.left, rect.top);
                applyPosition(p.left, p.top);
                savePos();
            });
        });
    }

    if (dragHandle) {
        var startX = 0, startY = 0, origL = 0, origT = 0;
        var lastX = 0, lastY = 0, velX = 0, velY = 0;
        var DRAG_SCALE = 1.04;
        var MAX_TILT = 2.8;

        function startDrag(clientX, clientY) {
            dragging = true;
            // ปิด parallax ตอนลาก
            paraRX = 0;
            paraRY = 0;
            player.classList.remove('is-parallax', 'is-releasing');
            clearParallaxLayers();
            player.classList.add('is-dragging');
            var rect = player.getBoundingClientRect();
            // แปลงจาก CSS transform (center) เป็นตำแหน่ง absolute ทันที
            applyPosition(rect.left, rect.top, DRAG_SCALE, 0);
            startX = clientX;
            startY = clientY;
            lastX = clientX;
            lastY = clientY;
            velX = 0;
            velY = 0;
            origL = rect.left;
            origT = rect.top;
        }

        dragHandle.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            startDrag(e.clientX, e.clientY);
        });

        // touch support
        dragHandle.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) return;
            var t = e.touches[0];
            startDrag(t.clientX, t.clientY);
        }, { passive: true });

        function onMove(clientX, clientY) {
            if (!dragging) return;
            var dx = clientX - startX;
            var dy = clientY - startY;
            // ความเร็วแบบ smooth สำหรับการเอียง (ลดการกระตุก)
            var rawVx = clientX - lastX;
            var rawVy = clientY - lastY;
            velX = velX * 0.55 + rawVx * 0.45;
            velY = velY * 0.55 + rawVy * 0.45;
            lastX = clientX;
            lastY = clientY;
            // เอียงตามทิศทางลาก (แนวนอนหลัก + แนวตั้งเล็กน้อย)
            var tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, velX * 0.42 + velY * 0.1));
            var p = clampPos(origL + dx, origT + dy);
            applyPosition(p.left, p.top, DRAG_SCALE, tilt);
        }

        function onEnd() {
            if (!dragging) return;
            dragging = false;
            player.classList.remove('is-dragging');
            player.classList.add('is-releasing');
            // คืน scale/tilt กลับปกติแบบนุ่มนวล
            var rect = player.getBoundingClientRect();
            // คำนวณตำแหน่งจริงหลัง scale (getBoundingClientRect รวม scale แล้ว)
            // ใช้ left/top ที่ตั้งไว้แล้ว + transform กลับ
            var curL = parseFloat(player.style.left) || rect.left;
            var curT = parseFloat(player.style.top) || rect.top;
            applyPosition(curL, curT, 1, 0);
            setTimeout(function () {
                player.classList.remove('is-releasing');
            }, 300);
            savePos();
        }

        window.addEventListener('mousemove', function (e) {
            onMove(e.clientX, e.clientY);
        });
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', function (e) {
            if (!dragging || e.touches.length !== 1) return;
            e.preventDefault();
            onMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);
    }

    // —— Parallax 3D เมื่อชี้เมาส์บนแผง (ปิดตอนลาก) ——
    player.addEventListener('mousemove', function (e) {
        if (dragging) return;
        updateParallaxFromEvent(e);
    });
    player.addEventListener('mouseleave', function () {
        if (dragging) return;
        // รีเซ็ตนุ่ม ๆ
        player.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease';
        resetParallax();
        setTimeout(function () {
            if (!dragging) player.style.transition = '';
        }, 360);
    });

    // keep inside viewport on resize
    window.addEventListener('resize', function () {
        if (!player.style.left || player.style.left === '') return;
        var rect = player.getBoundingClientRect();
        var p = clampPos(rect.left, rect.top);
        applyPosition(p.left, p.top);
        savePos();
    });

    restorePos();

    function fmt(sec) {
        if (!isFinite(sec) || sec < 0) return '0:00';
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    function setPlayingUI(playing) {
        if (playIcon) playIcon.className = playing ? 'bi bi-pause-fill' : 'bi bi-play-fill';
    }

    function enableControls(on) {
        [playBtn, prevBtn, nextBtn, seek].forEach(function (el) {
            if (el) el.disabled = !on;
        });
    }

    function revokeAll() {
        tracks.forEach(function (t) {
            try { URL.revokeObjectURL(t.url); } catch (e) {}
        });
    }

    function isAudioFile(file) {
        if (!file) return false;
        if (file.type && file.type.indexOf('audio/') === 0) return true;
        return AUDIO_EXT.test(file.name || '');
    }

    function addFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []).filter(isAudioFile);
        if (!files.length) {
            if (typeof showAlert === 'function') {
                showAlert('ไม่พบไฟล์เสียง', 'รองรับ .mp3 .wav .ogg .m4a .flac .aac', 'warning');
            }
            return;
        }
        // เรียงชื่อ
        files.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '', 'th', { sensitivity: 'base' });
        });

        var startLen = tracks.length;
        files.forEach(function (f) {
            tracks.push({
                name: f.name.replace(AUDIO_EXT, ''),
                fileName: f.name,
                url: URL.createObjectURL(f),
                file: f
            });
        });

        renderPlaylist();
        enableControls(true);

        // ถ้ายังไม่ได้อยู่เพลงไหน ให้เล่นตัวแรกที่เพิ่งเพิ่ม
        if (index < 0) {
            playAt(startLen);
        } else {
            subEl.textContent = tracks.length + ' เพลงในรายการ';
        }
    }

    function playAt(i) {
        if (i < 0 || i >= tracks.length) return;
        index = i;
        var t = tracks[index];
        audio.src = t.url;
        audio.volume = parseFloat(vol.value) || 0.8;
        titleEl.textContent = t.name;
        subEl.textContent = (index + 1) + ' / ' + tracks.length + ' — ' + (t.fileName || '');
        artEl.innerHTML = '<i class="bi bi-music-note-beamed"></i>';
        enableControls(true);
        highlightPlaylist();
        var p = audio.play();
        if (p && p.catch) {
            p.catch(function () { setPlayingUI(false); });
        }
        setPlayingUI(true);
    }

    function playNext(fromEnded) {
        if (!tracks.length) return;
        if (playMode === 'repeat-one' && fromEnded) {
            audio.currentTime = 0;
            audio.play().catch(function () {});
            setPlayingUI(true);
            return;
        }
        if (playMode === 'shuffle' && tracks.length > 1) {
            var n;
            do { n = Math.floor(Math.random() * tracks.length); } while (n === index);
            playAt(n);
            return;
        }
        // order / repeat-all
        var next = index + 1;
        if (next >= tracks.length) {
            if (playMode === 'repeat-all' || !fromEnded) {
                playAt(0);
            } else {
                // โหมดลำดับ — จบเพลย์ลิสต์แล้วหยุด
                setPlayingUI(false);
                seek.value = 0;
                curTime.textContent = '0:00';
            }
        } else {
            playAt(next);
        }
    }

    function playPrev() {
        if (!tracks.length) return;
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }
        if (playMode === 'shuffle' && tracks.length > 1) {
            var n;
            do { n = Math.floor(Math.random() * tracks.length); } while (n === index);
            playAt(n);
            return;
        }
        playAt((index - 1 + tracks.length) % tracks.length);
    }

    function applyPlayModeUI() {
        if (!shuffleBtn) return;
        var meta = PLAY_MODE_META[playMode] || PLAY_MODE_META.order;
        var icon = shuffleBtn.querySelector('i');
        if (icon) icon.className = 'bi ' + meta.icon;
        shuffleBtn.title = meta.title;
        shuffleBtn.classList.toggle('is-active', !!meta.active);
        shuffleBtn.setAttribute('data-mode', playMode);
    }

    function renderPlaylist() {
        if (!playlistEl) return;
        playlistEl.innerHTML = '';
        if (playlistEmpty) {
            playlistEmpty.hidden = tracks.length > 0;
        }
        tracks.forEach(function (t, i) {
            var li = document.createElement('li');
            li.className = 'music-playlist-item' + (i === index ? ' active' : '');
            li.innerHTML =
                '<span class="music-pl-idx">' + (i + 1) + '</span>' +
                '<span class="music-pl-name"></span>' +
                '<button type="button" class="music-pl-remove" title="ลบ" data-remove="' + i + '">&times;</button>';
            li.querySelector('.music-pl-name').textContent = t.name;
            li.addEventListener('click', function (e) {
                if (e.target.closest('[data-remove]')) return;
                playAt(i);
            });
            var rm = li.querySelector('[data-remove]');
            if (rm) {
                rm.addEventListener('click', function (e) {
                    e.stopPropagation();
                    removeAt(i);
                });
            }
            playlistEl.appendChild(li);
        });
    }

    function highlightPlaylist() {
        if (!playlistEl) return;
        var items = playlistEl.querySelectorAll('.music-playlist-item');
        items.forEach(function (el, i) {
            el.classList.toggle('active', i === index);
        });
    }

    function removeAt(i) {
        if (i < 0 || i >= tracks.length) return;
        try { URL.revokeObjectURL(tracks[i].url); } catch (e) {}
        tracks.splice(i, 1);
        if (!tracks.length) {
            index = -1;
            audio.pause();
            audio.removeAttribute('src');
            titleEl.textContent = 'ยังไม่มีเพลง';
            subEl.textContent = 'เลือกไฟล์หรือโฟลเดอร์เพลงจากเครื่อง';
            enableControls(false);
            setPlayingUI(false);
            seek.value = 0;
            curTime.textContent = '0:00';
            durTime.textContent = '0:00';
        } else {
            if (index === i) {
                playAt(Math.min(i, tracks.length - 1));
            } else if (index > i) {
                index -= 1;
            }
        }
        renderPlaylist();
    }

    // —— UI events ——
    if (pickFilesBtn && fileInput) {
        pickFilesBtn.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function () {
            if (fileInput.files && fileInput.files.length) addFiles(fileInput.files);
            fileInput.value = '';
        });
    }
    if (pickFolderBtn && folderInput) {
        pickFolderBtn.addEventListener('click', function () { folderInput.click(); });
        folderInput.addEventListener('change', function () {
            if (folderInput.files && folderInput.files.length) addFiles(folderInput.files);
            folderInput.value = '';
        });
    }

    if (playlistBtn && playlistPanel) {
        playlistBtn.addEventListener('click', function () {
            playlistPanel.hidden = !playlistPanel.hidden;
            if (!playlistPanel.hidden) renderPlaylist();
        });
    }
    if (playlistClose && playlistPanel) {
        playlistClose.addEventListener('click', function () {
            playlistPanel.hidden = true;
        });
    }

    if (shuffleBtn) {
        applyPlayModeUI();
        shuffleBtn.addEventListener('click', function () {
            var i = PLAY_MODES.indexOf(playMode);
            playMode = PLAY_MODES[(i + 1) % PLAY_MODES.length];
            applyPlayModeUI();
        });
    }

    playBtn.addEventListener('click', function () {
        if (!tracks.length) return;
        if (audio.paused) {
            audio.play().catch(function () {});
            setPlayingUI(true);
        } else {
            audio.pause();
            setPlayingUI(false);
        }
    });

    prevBtn.addEventListener('click', playPrev);
    nextBtn.addEventListener('click', playNext);

    seek.addEventListener('input', function () { seeking = true; });
    seek.addEventListener('change', function () {
        if (audio.duration) {
            audio.currentTime = (parseFloat(seek.value) / 100) * audio.duration;
        }
        seeking = false;
    });

    audio.addEventListener('timeupdate', function () {
        if (seeking) return;
        curTime.textContent = fmt(audio.currentTime);
        if (audio.duration) {
            durTime.textContent = fmt(audio.duration);
            seek.value = String((audio.currentTime / audio.duration) * 100);
        }
    });
    audio.addEventListener('play', function () { setPlayingUI(true); });
    audio.addEventListener('pause', function () { setPlayingUI(false); });
    audio.addEventListener('ended', function () { playNext(true); });
    audio.addEventListener('error', function () {
        subEl.textContent = 'เล่นไฟล์นี้ไม่ได้ — ข้ามไปเพลงถัดไป';
        setTimeout(playNext, 600);
    });

    vol.addEventListener('input', function () {
        var v = parseFloat(vol.value) || 0;
        audio.volume = v;
        if (volIcon) {
            volIcon.className = v === 0 ? 'bi bi-volume-mute-fill'
                : v < 0.4 ? 'bi bi-volume-down-fill' : 'bi bi-volume-up-fill';
        }
    });

    // ล้าง object URLs ตอนปิดหน้า
    window.addEventListener('beforeunload', revokeAll);
})();




