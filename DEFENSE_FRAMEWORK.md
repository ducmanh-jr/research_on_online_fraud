# BÁO CÁO NGHIÊN CỨU & KHUNG GIẢI PHÁP PHÒNG THỦ TOÀN DIỆN (DEFENSIVE SECURITY FRAMEWORK)
> **Dự án Nghiên cứu Phòng chống Lừa đảo Online & Mã độc Di động**  
> *Phân tích Chuyên sâu & Giải pháp Bào vệ cho 3 Cấp độ Tấn công (Rank 1, Rank 2, Rank 3)*

---

## 1. TỔNG QUAN HỆ THỐNG & CHUỖI TẤN CÔNG (ATTACK KILL CHAIN ANALYSIS)

Qua quá trình rà soát toàn bộ cấu trúc dự án:
- **Rank 1 (`rank1_Phishing_Link`):** Kỹ nghệ xã hội (Social Engineering), Thu thập thông tin đăng nhập (Credential Harvesting) và Tấn công chuyển tiếp xác thực thời gian thực AiTM (Adversary-in-the-Middle) qua WebSocket & Cloudflare Tunnel.
- **Rank 2 (`rank2_PDF_Phishing`):** Phishing nhúng trong tài liệu PDF (Hóa đơn EVN, Phiếu lương, Cảnh báo VCB), kết hợp Tracking Pixel và QR Code để qua mặt bộ lọc email (Secure Email Gateway).
- **Rank 3 (`rank3_Mobile_RAT`):** Mã độc di động (Remote Access Trojan) lạm dụng **Quyền Trợ Năng (Accessibility Services)**, **Màn hình phủ giả mạo (Dynamic Overlay Attacks)**, và **Đọc lén SMS OTP 2FA**.

---

## 2. KHUNG GIẢI PHÁP PHÒNG THỦ RANK 1: CHỐNG PHISHING LINK & AiTM

### 2.1 Cơ chế Tấn công & Điểm Yếu
Kẻ tấn công sử dụng các trang web giả mạo chính xác (pixel-perfect) và proxy AiTM để đứng giữa nạn nhân và máy chủ thật. Mật khẩu và mã OTP 2FA dạng SMS/TOTP nhập vào trang giả sẽ bị kẻ tấn công lấy và chuyển tiếp ngay lập tức đến máy chủ thật để chiếm phiên (Session Cookie).

### 2.2 Giải pháp Phòng thủ Kỹ thuật (Technical Countermeasures)

#### A. Triển khai Xác thực Chống Phishing (Phishing-Resistant Authentication - FIDO2 / WebAuthn)
- **Cơ chế:** Khác với OTP tin nhắn hoặc Google Authenticator, FIDO2/WebAuthn gắn liền chữ ký số với tên miền trình duyệt (Origin-Bound).
- **Kết quả phòng thủ:** Dù nạn nhân truy cập vào link giả mạo (`trycloudflare.com` hay `login-facebook.security-check.com`), trình duyệt sẽ **tự động từ chối** gửi thông tin xác thực FIDO2 vì domain không trùng khớp với domain gốc.

```javascript
// Ví dụ Mã nguồn Kỹ thuật: Xác thực WebAuthn (FIDO2) chống Phishing trên Client
async function authenticatePhishingResistant() {
    const publicKeyCredentialRequestOptions = {
        challenge: new Uint8Array([/* Challenge từ Server */]),
        timeout: 60000,
        rpId: "your-bank.com", // Trình duyệt kiểm tra ngặt nghèo Domain gốc
        userVerification: "required"
    };

    try {
        // Trình duyệt sẽ CHẶN nỗ lực xác thực nếu domain hiện tại khác your-bank.com (ví dụ: aitm-proxy.com)
        const assertion = await navigator.credentials.get({
            publicKey: publicKeyCredentialRequestOptions
        });
        console.log("Xác thực FIDO2 thành công - Kháng 100% AiTM Phishing");
    } catch (err) {
        console.error("Xác thực thất bại do lệch Tên miền (Domain Mismatch) hoặc hủy bỏ", err);
    }
}
```

#### B. Thiết lập Chính sách Bảo mật Tiêu chuẩn (DNS & HTTP Headers)
1. **DMARC, DKIM, SPF (Cho Email):** Chống giả mạo tên miền thương hiệu trong email gửi nạn nhân.
2. **Content Security Policy (CSP) & HSTS:** 
   ```http
   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   Content-Security-Policy: default-src 'self'; script-src 'self' https://trusted-cdn.com;
   ```
3. **Phân tích Entropy URL & Phát hiện Tên miền Giả mạo (Brand Monitoring):** Giám sát Certificate Transparency Logs để phát hiện tên miền mạo danh vừa đăng ký SSL cấp tốc.

---

## 3. KHUNG GIẢI PHÁP PHÒNG THỦ RANK 2: BẢO VỆ TÀI LIỆU PDF & EMAIL GATEWAY

### 3.1 Cơ chế Tấn công & Điểm Yếu
File PDF đóng vai trò là "Bức bình phong" qua mặt bộ lọc Spam/Email Gateway vì không chứa mã độc thực thi trực tiếp, mà ẩn chứa:
- Liên kết rút gọn / Hyperlink điều hướng đến trang Rank 1.
- Mã QR Code lừa nạn nhân dùng điện thoại quét (Quishing - QR Phishing).
- Tracking Pixel dạng Remote Image (`/Subtype /Form`, `/URI`) phát hiện thời điểm nạn nhân đọc file.

### 3.2 Giải pháp Phòng thủ Kỹ thuật

#### A. Quy tắc YARA kiểm tra Tệp PDF Độc hại & Phishing
Thêm các quy tắc YARA vào hệ thống Secure Email Gateway (SEG) hoặc phần mềm Diệt Virus máy trạm:

```yara
rule PDF_Phishing_Tracking_URI {
    meta:
        description = "Phát hiện file PDF chứa liên kết Phishing hoặc Tracking Pixel"
        author = "Defensive Security Team"
        severity = "HIGH"
    strings:
        $header = "%PDF-"
        $uri = "/URI (" ascii
        $action = "/S /URI" ascii
        $js = "/JavaScript" ascii wide
        $launch = "/Launch" ascii wide
    condition:
        $header at 0 and ($uri or $action) and ($js or $launch)
}
```

#### B. Cấu hình Vô hiệu hóa Tự động Tải Ảnh Ngoại vi & URL trong PDF Reader
1. **Cấu hình Acrobat / Reader Sandbox (Protected Mode):** Bật môi trường cô lập tuyệt đối.
2. **Vô hiệu hóa mở URL tự động:** Yêu cầu xác nhận cảnh báo trước khi mở bất kỳ đường dẫn bên ngoài nào từ tập tin PDF.
3. **Chuyển đổi PDF sang dạng Ảnh tĩnh (PDF Sanitization / CDR - Content Disarm and Reconstruction):** Email Gateway tự động loại bỏ toàn bộ JavaScript, Hyperlink, Form Actions và chuyển PDF về dạng định dạng hiển thị thuần túy trước khi chuyển cho người dùng.

---

## 4. KHUNG GIẢI PHÁP PHÒNG THỦ RANK 3: CHỐNG MOBILE RAT, OVERLAY & ACCESSIBILITY SERVICE

### 4.1 Cơ chế Tấn công & Điểm Yếu
Đây là cấp độ nguy hiểm nhất. Nạn nhân tải ứng dụng `.apk` giả mạo (`eTax Mobile`, `VNeID`) và bị lừa cấp **Quyền Trợ Năng (Accessibility Service)**. Từ đó mã độc có quyền:
- Lắng nghe sự kiện bàn phím (Keylogging).
- Phủ màn hình đăng nhập giả mạo đè lên app ngân hàng thật (Dynamic Banking Overlay).
- Tự động đọc và xóa tin nhắn SMS OTP mà người dùng không hay biết.

### 4.2 Giải pháp Phòng thủ Kỹ thuật Dành cho Ứng dụng Ngân hàng (RASP - Runtime Application Self-Protection)

#### A. Module Phát hiện Quyền Trợ Năng Độc hại (Accessibility Abuse Detector in Android/Kotlin)
Ứng dụng ngân hàng phải tự phát hiện xem có ứng dụng thứ ba nghi vấn nào đang bật `AccessibilityService` hay không, nếu có thì lập tức tạm dừng phiên giao dịch.

```kotlin
// Mã nguồn Kỹ thuật Phòng thủ trên Android SDK Ngân hàng
import android.content.Context
import android.provider.Settings
import android.text.TextUtils

class AntiRatSecurityManager(private val context: Context) {

    fun isSuspiciousAccessibilityEnabled(): Boolean {
        val accessibilityEnabled = Settings.Secure.getInt(
            context.contentResolver,
            Settings.Secure.ACCESSIBILITY_ENABLED, 0
        )
        
        if (accessibilityEnabled == 1) {
            val settingValue = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )
            if (!TextUtils.isEmpty(settingValue)) {
                // Kiểm tra xem danh sách dịch vụ bật Accessibility có chứa ứng dụng ngoài hệ thống không
                val services = settingValue.split(":")
                for (service in services) {
                    if (!isTrustedSystemService(service)) {
                        // Phát hiện mã độc độc hại đang lạm dụng quyền Trợ Năng!
                        return true
                    }
                }
            }
        }
        return false
    }

    private fun isTrustedSystemService(serviceName: String): Boolean {
        // Chỉ chấp nhận dịch vụ trợ năng chính thức của hệ điều hành (Google TalkBack, System Access)
        return serviceName.contains("com.google.android.marvin.talkback") ||
               serviceName.contains("com.android.talkback")
    }
}
```

#### B. Phân tích & Ngăn chặn Tấn công Vẽ đè Màn hình (Anti-Overlay Protection)
Trong mã nguồn Android Banking UI (`Activity`), bật cờ ngăn chặn toàn bộ cửa sổ phủ từ bên ngoài:

```java
// Bật cờ chống vẽ đè màn hình (System Alert Window / Window Overlay)
@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    
    // Chống chụp màn hình & Chống ghi màn hình ngầm
    getWindow().setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
    );
    
    // Ngăn chặn các view đè bị che mờ hoặc giả mạo sự kiện chạm (Filter Touches When Obscured)
    View rootView = findViewById(android.R.id.content);
    rootView.setFilterTouchesWhenObscured(true);
}
```

#### C. Thay thế SMS OTP bằng Sinh trắc học Phần cứng (Hardware Biometric Auth / Smart OTP)
1. **Loại bỏ SMS OTP:** SMS không mã hóa và dễ bị RAT chặn đọc tin nhắn qua quyền `RECEIVE_SMS` hoặc `ACCESSIBILITY`.
2. **Khuyên dùng FIDO2 Biometrics / Android Keystore & Secure Enclave:**
   - Mã khóa riêng (Private Key) được lưu giữ trong chip phần cứng an toàn (TPM / Secure Element / StrongBox).
   - Mọi thao tác ký chuyển tiền yêu cầu xác thực vân tay/khuôn mặt cứng. Mã độc RAT hoàn toàn **KHÔNG THỂ** giả mạo chữ ký sinh trắc học phần cứng này.

---

## 5. BẢNG TỔNG HỢP SO SÁNH MA TRẬN PHÒNG THỦ (DEFENSE MATRIX)

| Tấn công (Rank) | Kỹ thuật Tấn công Chính | Thiệt hại Tối đa | Giải pháp Phòng thủ Cốt lõi (Mitigation) |
|---|---|---|---|
| **Rank 1 (Phishing Link & AiTM)** | Giả mạo giao diện, Proxy chuyển tiếp OTP thời gian thực qua Cloudflare Tunnel | Chiếm tài khoản Facebook/Google, Chuyển tiền qua OTP vừa nhập | **FIDO2/WebAuthn**, Domain Isolation, CSP Header, DMARC/SPF |
| **Rank 2 (PDF Phishing)** | Nhúng Link lừa đảo, Tracking Pixel, QR Code trong file PDF | Dẫn dụ nạn nhân sang bẫy Rank 1, Qua mặt email gateway | **PDF Sanitization (CDR)**, YARA Rules scanning, Protected Sandbox Mode |
| **Rank 3 (Mobile RAT)** | Lạm dụng Quyền Trợ Năng, Dynamic Banking Overlay, SMS OTP Sniffer | Chiếm toàn bộ điện thoại Android, tự động rút tiền ngầm | **RASP SDK (Detect Accessibility)**, Anti-Overlay `FLAG_SECURE`, **Biometrics Secure Enclave** |

---

## 6. KHUYẾN NGHỊ VẬN HÀNH & KẾ HOẠCH NGHĨÊN CỨU TIẾP THEO

1. **Đối với Doanh nghiệp & Ngân hàng:**
   - Tích hợp Module RASP (Kiểm tra môi trường thiết bị: Root check, Accessibility check, Hooking framework check like Frida/Xposed) vào ứng dụng mobile.
   - Thường xuyên cập nhật danh sách đen IP và Domain độc hại từ dữ liệu Threat Intelligence.

2. **Đối với Người dùng Cá nhân:**
   - Cài đặt nguyên tắc "Không cấp quyền Trợ Năng (Accessibility)" cho bất kỳ ứng dụng nào tải từ file APK bên ngoài Google Play Store.
   - Luôn bật Google Play Protect và chế độ **Restricted Settings** (Cài đặt bị hạn chế) trên Android 14/15.
