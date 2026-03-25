## Titan AI Hub

Dashboard + API สำหรับสรุปสภาวะตลาดคริปโต และใช้งาน AI Chat (เฟสนี้บังคับ owner login)

### Features
- Market Overview (fear & greed, dominance, market bias)
- Coin Focus + Real Flow (Binance futures positioning/pressure/basis)
- Alerts และ System Health
- AI Chat วิเคราะห์จาก snapshot

### Deploy (Render)
1. ตั้งค่า Environment Variables ตามไฟล์ `.env.example`
2. Deploy แอป และรัน `npm start`

### Local development
1. ติดตั้ง dependency: `npm install`
2. ตั้งค่า environment: ทำไฟล์ `.env` (อ้างอิง `.env.example`)
3. รัน: `npm start`

### Endpoint ที่ UI เรียก
UI เรียกผ่าน `/api/*` (same-origin) ดังนั้นควรให้ frontend และ backend อยู่ที่โดเมนเดียวกันใน Render
