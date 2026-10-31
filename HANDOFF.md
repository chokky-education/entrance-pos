# DOME Pos — Handoff Document สำหรับ Claude Code (`d:\domepos`)

## 1. สถานะปัจจุบัน (Current Status)
- แยกโปรเจกต์ `d:\domepos` ออกจาก `d:\smlaiaccount` 100% แล้ว (ใช้ฐานข้อมูล PostgreSQL ชื่อ `domepos` และเชื่อม Cloudflare D1 + R2)
- บริการทั้งหมดกำลังรันอยู่พร้อมใช้งาน:
  - **Frontend**: `http://localhost:3005/`
  - **Backend API**: `http://127.0.0.1:8085/`
  - **UAT Dashboard**: `http://localhost:3056/`
- ผลรัน UAT ล่าสุดผ่าน 100% ทั้ง 3 ชุด:
  1. `pos-e2e-api-db-gl-report.json`: **17/17 passed**
  2. `pos-data-reconcile-and-promo-audit.json`: **8/8 passed**
  3. `pos-starter-cafe-beer-ui-e2e.json`: **34/34 passed (`failed: 0`, `issues: 0`)**

## 2. ฟีเจอร์ที่ทำเสร็จแล้วทั้งหมด
1. **โหมดเจ้าของคนเดียว ทำงานคนเดียว (Solo Owner UX)**:
   - เปิด `http://localhost:3005/` เข้าหน้าขาย POS ทันทีไม่ต้องผ่านหน้าล็อกอิน
   - มีปุ่มขายด่วนเงินสดพอดี 1-Click, พักบิลเข้าโต๊ะ/บาร์, จอคิวบาริสต้า KDS พร้อมเรียกคิวด้วยเสียงภาษาไทย (TTS), และรายงานสรุปยอดกะ (Z-Report)
2. **Layout & Animation (ธีมพรีเมียม Espresso + Terracotta)**:
   - Design system กลางอยู่ใน `frontend/src/app/globals.css` (คลาส `dp-*` + ตัวแปร `--dp-*`): ปุ่ม/ชิป/ช่องกรอก/การ์ด/modal และแอนิเมชัน (`dp-enter`, `dp-stagger`, `dp-pop`, `dp-bump`, `dp-modal` ฯลฯ) รองรับ `prefers-reduced-motion`
   - แถบหัวเรื่องโทน Espresso ไล่สี (`dp-header`) แท็บกระจก (`dp-tab`) พร้อมโลโก้ `/logo.png` (`data-testid="dome-pos-logo"`)
   - พื้นหลังครีม (`dp-app`) การ์ดสีขาว แบ่งฝั่งซ้าย 58% (รายการสินค้า) และฝั่งขวา 42% เต็มความสูง (`CartPanel`)
   - ความสูงการ์ดสินค้าทุกหมวดหมู่ถูกคุมด้วย `content-start items-start auto-rows-max` ให้กะทัดรัดเท่ากับหน้าแรก (`ทั้งหมด`) เสมอ ไม่ยืดสูงเมื่อมีรายการน้อย
   - คลิกการ์ดสินค้ามีแอนิเมชันเด้ง + ขอบเรืองแสงสีเขียว Emerald (`#10B981`) + ป้ายลอย `+1 ⚡` + เสียงสังเคราะห์ Web Audio (`scan`, `confirm`, `delete`, `chaching`)
3. **รูปสินค้าครบทุกเมนู & ตัวเลือกเฉพาะที่ตัวสินค้า (Item-Specific Options)**:
   - สินค้าทั้ง 19 เมนูมีรูปภาพจริงใน `frontend/public/products/<CODE>.jpg` แสดงทั้งบนการ์ดสินค้า ในตะกร้า และในหน้าจัดการสินค้า
   - ย้ายตัวเลือก (`ความหวาน 0%-100%` และ `ตัวเลือกเสริม/ท็อปปิ้ง`) ไปไว้ในการ์ดของสินค้านั้นๆ โดยตรง และแก้ไขในแถวตะกร้าได้รายแก้ว (ไม่มีแถบตัวเลือกลอยด้านบนสุดของหน้าจอ)
4. **ระบบจัดการสินค้า & เชื่อมต่อ Cloudflare แบบ Realtime + Auto Sync ทุก 30 วินาที**:
   - แท็บ `5. จัดการสินค้า & Cloudflare` (`src/components/DomePosManagePanel.tsx`) ให้ผู้ใช้แก้ไขชื่อเมนู ราคา หมวดหมู่ หน่วยนับ อัปโหลดรูปใหม่ หรือเพิ่ม/ลบสินค้าได้ทันที
   - มีหน้ากรอกรหัสเชื่อมต่อบัญชี Cloudflare ของผู้ใช้เอง (`Account ID`, `API Token`, `D1 Database ID`, `R2 Bucket Name`) พร้อมลิงก์สมัคร Cloudflare
   - เชื่อมต่อ **Realtime SSE (`/api/pos/cloudflare/stream?mode=sse`)** และมีระบบ **Auto Sync ทุก 30 วินาที** (พร้อมเวลานับถอยหลังสด `อีก Xs · รอบที่ N` ทั้งบนแถบหัวเรื่องและปุ่ม `data-testid="pos-cf-autosync-30s-btn"` ข้างปุ่ม `บันทึก & ซิงค์ข้อมูลทั้งหมดขึ้น Cloudflare ทันที`)

## 3. Production Deploy (`https://domepos.mysmebox.com`)
- เซิร์ฟเวอร์เดียวกับ domecard/mysmebox — SSH ด้วย key เท่านั้น (ที่อยู่/บัญชีเซิร์ฟเวอร์ไม่เก็บใน repo นี้ เพราะ repo เป็น public)
- โครงสร้าง: `/opt/domepos/backend/domepos-api` (Go binary, `GOOS=linux GOARCH=amd64 CGO_ENABLED=0`) + `/opt/domepos/frontend` (Next.js `output: "standalone"` build บนเซิร์ฟเวอร์ รันจาก `.next/standalone/server.js`)
- systemd: `domepos-api` (:8085) และ `domepos-web` (127.0.0.1:3005) รันด้วย user `domepos`; Caddy (`/etc/caddy/Caddyfile` block `domepos.mysmebox.com`) → `127.0.0.1:3005` โดยไม่บีบอัด path SSE `/api/pos/cloudflare/stream`
- ฐานข้อมูล: database `domepos` + role `domepos` ใน container `sml_postgresql` (ไม่แตะ `smldemo`); รหัสอยู่ใน `/opt/domepos/backend/.env.local` (chmod 600) เท่านั้น
- Redeploy: build binary/แพ็ก `frontend` (ไม่รวม `node_modules`, `.next`, `.env*`) → อัปโหลด → `npm ci && npm run build` → copy `public` + `.next/static` เข้า `.next/standalone` → `systemctl restart domepos-api domepos-web`
