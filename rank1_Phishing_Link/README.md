# 🔬 Phishing Research Lab v2.0

> **⚠️ CHỈ DÙNG CHO MỤC ĐÍCH NGHIÊN CỨU BẢO MẬT**

## Tổng quan
Dự án nghiên cứu cơ chế lừa đảo Phishing Link - mô phỏng cách hacker thu thập thông tin đăng nhập qua trang giả mạo.

## Tính năng
- 📘 **Trang giả Facebook** - pixel-perfect, responsive mobile
- 📧 **Trang giả Google** - 2-step (email → password) giống Google thật
- ⌨️ **Keylogger realtime** - ghi từng phím gõ trước khi nạn nhân submit
- 📊 **Dashboard premium** - xem/phân tích dữ liệu realtime
- ☁️ **Cloudflare Tunnel** - tự động tạo link public, KHÔNG CẦN cùng WiFi
- 📥 **Export data** - xuất dữ liệu JSON

## Cách chạy

```bash
# 1. Cài dependencies (chỉ lần đầu)
npm install

# 2. Chạy server
npm start
```

## Cách thức hoạt động

```
📱 Điện thoại (4G/WiFi bất kỳ)
        ↓
   Truy cập link *.trycloudflare.com
        ↓
☁️ Cloudflare Tunnel (chuyển tiếp)
        ↓
💻 Laptop bạn (localhost:3000)
        ↓
📁 Lưu vào harvested_data.json + keylog_data.json
```

## Cấu trúc project

```
rank1_Phishing_Link/
├── server.js                    # Server Express + Cloudflare Tunnel
├── harvested_data.json          # Dữ liệu credentials thu hoạch
├── keylog_data.json             # Dữ liệu keylogger
├── package.json
└── public/
    ├── phishing/
    │   ├── facebook.html        # Trang giả Facebook
    │   ├── fb-style.css
    │   ├── fb-script.js
    │   ├── google.html          # Trang giả Google  
    │   ├── gg-style.css
    │   └── gg-script.js
    └── dashboard/
        ├── index.html           # Dashboard nghiên cứu
        ├── dashboard-style.css
        └── dashboard-script.js
```
