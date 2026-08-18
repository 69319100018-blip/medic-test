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

let shiftLog = JSON.parse(localStorage.getItem('shiftLog')) || {};
let currentUser = null;
let historyViewUser = null;
let realtimeInterval = null;
let elapsedInterval = null;
let loginBgIndex = 0;
let loginBgInterval = null;
let centralFund = null;

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

function loadCentralFund() {
    const stored = JSON.parse(localStorage.getItem('centralFund') || 'null');
    if (!stored) return getDefaultFundState();
    return {
        balance: Number(stored.balance) || 0,
        allocations: {
            cash: Number(stored.allocations?.cash) || 0,
            deposit: Number(stored.allocations?.deposit) || 0,
            reserve: Number(stored.allocations?.reserve) || 0
        },
        history: Array.isArray(stored.history) ? stored.history : []
    };
}

centralFund = loadCentralFund();

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

function saveShiftLog() {
    localStorage.setItem('shiftLog', JSON.stringify(shiftLog));
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

function saveCentralFund() {
    localStorage.setItem('centralFund', JSON.stringify(centralFund));
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
    const activeItems = items.filter((item) => item.value > 0);

    animateMoneyText(balanceSummary, centralFund.balance, (v) => `ยอดรวม ${v.toLocaleString('th-TH')} บาท`);
    animateMoneyText(totalValue, centralFund.balance, (v) => `${v.toLocaleString('th-TH')} บาท`);
    chart.classList.remove('bump');
    void chart.offsetWidth;
    chart.classList.add('bump');
    setTimeout(() => chart.classList.remove('bump'), 600);

    if (!activeItems.length || total <= 0) {
        chart.style.background = 'conic-gradient(#e2e8f0 0deg 360deg)';
    } else {
        let startAngle = 0;
        const segments = activeItems.map((item) => {
            const endAngle = startAngle + (item.value / total) * 360;
            const segment = `${item.color} ${startAngle}deg ${endAngle}deg`;
            startAngle = endAngle;
            return segment;
        });
        chart.style.background = `conic-gradient(${segments.join(', ')})`;
    }

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
                <span>${entry.note || 'ไม่มีหมายเหตุ'}</span>
            </div>
            <div class="fund-history-meta">
                <strong>${entry.amount.toLocaleString('th-TH')} บาท</strong>
                <span>${entry.date} ${entry.time}</span>
            </div>
        </div>
    `).join('');
}

function handleFundTransaction(type) {
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

    const now = new Date();
    const entry = {
        type: type === 'deposit' ? 'ฝากเงิน' : 'ถอนเงิน',
        amount,
        note: noteInput?.value.trim() || 'ไม่มีหมายเหตุ',
        date: now.toLocaleDateString('th-TH'),
        time: now.toLocaleTimeString('th-TH', { hour12: false })
    };

    if (type === 'deposit') {
        centralFund.balance += amount;
        centralFund.allocations.cash += amount;
    } else {
        centralFund.balance -= amount;
        centralFund.allocations.cash -= amount;
    }

    centralFund.history.unshift(entry);
    saveCentralFund();
    renderCentralFund();
    amountInput.value = '';
    noteInput.value = '';
    celebrate({ particleCount: 70, spread: 65, origin: { y: 0.6 }, colors: ['#fbbf24', '#f59e0b', '#22c55e'] });
    showAlert(`${entry.type}สำเร็จ`, `${entry.type}จำนวน ${amount.toLocaleString('th-TH')} บาท เรียบร้อย`, 'success');
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
            const checkIn = getOpenCheckIn(username);
            if (checkIn) confirmForceOut(username, checkIn);
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
        card.querySelector('.force-logout').addEventListener('click', () => confirmForceOut(username, checkIn));
        panel.appendChild(card);
    });
    if (!hasActive) {
        panel.innerHTML = '<div class="forceout-card"><strong>ไม่มีผู้ใช้งานที่ต้องออกเวร</strong><span>พนักงานทุกคนได้ออกเวรแล้วหรือยังไม่ได้เข้าเวร</span></div>';
    }
    staggerChildren(panel);
}

function confirmForceOut(username, checkInLog) {
    if (!window.Swal) {
        if (!confirm(`ยืนยันการออกเวรบังคับให้ ${userProfiles[username].name}?`)) return;
    }
    const finish = new Date();
    const diff = Math.floor((finish - new Date(checkInLog.datetime)) / 60000);
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    const durationText = hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
    checkInLog.duration = durationText;
    checkInLog.outTime = finish.toLocaleTimeString('th-TH', { hour12: false });
    const exitLog = { type: 'ออกเวร', time: finish.toLocaleTimeString('th-TH', { hour12: false }), date: finish.toLocaleDateString('th-TH'), duration: durationText, isForced: true };
    shiftLog[username] = shiftLog[username] || [];
    shiftLog[username].push(exitLog);
    saveShiftLog();
    renderTeamStatus();
    renderForceOut();
    if (currentUser === username) {
        renderProfile();
        renderLog();
        updateActionButtons();
    }
    showAlert('ออกเวรสำเร็จ', `${userProfiles[username].name} ถูกออกเวรเรียบร้อยแล้ว`, 'success');
}

function handleCheckIn() {
    const now = new Date();
    const entry = { type: 'เข้าเวร', time: now.toLocaleTimeString('th-TH', { hour12: false }), datetime: now.toISOString(), date: now.toLocaleDateString('th-TH') };
    shiftLog[currentUser] = shiftLog[currentUser] || [];
    shiftLog[currentUser].push(entry);
    saveShiftLog();
    updateActionButtons();
    renderProfile();
    renderLog();
    renderTeamStatus();
    renderForceOut();
    celebrate({ particleCount: 110, spread: 80, origin: { y: 0.65 }, colors: ['#22c55e', '#2563eb', '#a78bfa', '#fbbf24'] });
    showAlert('เข้าเวรสำเร็จ', `${userProfiles[currentUser].name} เข้าเวรเรียบร้อย`, 'success');
}

function handleCheckOut() {
    const logs = shiftLog[currentUser] || [];
    const active = logs.slice().reverse().find((log) => log.type === 'เข้าเวร' && !log.duration);
    const now = new Date();
    let durationText = 'ไม่พบเวลาเข้าเวร';
    if (active) {
        const diff = Math.floor((now - new Date(active.datetime)) / 60000);
        const hours = Math.floor(diff / 60);
        const minutes = diff % 60;
        durationText = hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
        active.duration = durationText;
        active.outTime = now.toLocaleTimeString('th-TH', { hour12: false });
    }
    const exitLog = { type: 'ออกเวร', time: now.toLocaleTimeString('th-TH', { hour12: false }), date: now.toLocaleDateString('th-TH'), duration: durationText };
    shiftLog[currentUser].push(exitLog);
    saveShiftLog();
    updateActionButtons();
    renderProfile();
    renderLog();
    renderTeamStatus();
    renderForceOut();
    celebrate({ particleCount: 60, spread: 60, origin: { y: 0.65 }, colors: ['#f87171', '#fb923c', '#fbbf24'] });
    showAlert('ออกเวรสำเร็จ', `${userProfiles[currentUser].name} ออกเวรเรียบร้อย (${durationText})`, 'success');
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
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        sessionStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
    });
    document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', handleMenuSwitch));
    document.querySelectorAll('.tab-btn').forEach((tab) => tab.addEventListener('click', handleTabSwitch));
}

function initDashboard() {
    currentUser = sessionStorage.getItem('loggedInUser');
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }
    startClock();
    bindDashboardEvents();
    renderProfile();
    renderHistoryControls();
    renderLog();
    renderTeamStatus();
    renderForceOut();
    renderCentralFund();
    updateActionButtons();
    if (!canViewMonitoring(currentUser)) {
        document.getElementById('adminSection')?.classList.add('hidden');
        document.querySelectorAll('.nav-link').forEach((link) => {
            if (link.dataset.target === 'adminSection') link.classList.add('hidden');
        });
    }
    realtimeInterval = setInterval(() => {
        const updated = JSON.parse(localStorage.getItem('shiftLog')) || {};
        if (JSON.stringify(updated) !== JSON.stringify(shiftLog)) {
            shiftLog = updated;
            renderProfile();
            renderLog();
            renderTeamStatus();
            renderForceOut();
            updateActionButtons();
        }
    }, 2000);
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
