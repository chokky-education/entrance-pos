# CLAUDE.md — DOME Pos (`d:\domepos`)

@~/.agents/AGENTS.md

## 1. ภาพรวมโปรเจกต์ (Project Overview)
- **DOME Pos (`d:\domepos`)** คือระบบขายหน้าร้านกาแฟ เบียร์ และคาเฟ่ย์ ขนาดกะทัดรัด (Mini & Standalone) ออกแบบมาสำหรับ **เจ้าของร้านคนเดียว ทำงานคนเดียว (Solo Owner)** เปิดเข้าหน้าเว็บ `/` แล้วพร้อมขายทันทีโดยไม่มีหน้าล็อกอินกั้น
- **แยกอิสระจาก `d:\smlaiaccount` 100%** (ห้ามแก้ไขไฟล์ใน `d:\smlaiaccount` หรือเชื่อมต่อฐานข้อมูล `smldemo` เด็ดขาด)

## 2. พอร์ตและบริการที่รันอยู่ (Ports & Services)
- **Frontend (`d:\domepos\frontend`)**: Next.js 15 รันที่ `http://localhost:3005` (`npm run dev`)
- **Backend (`d:\domepos\backend`)**: Go 1.24 (`domepos-api.exe`) รันที่ `http://127.0.0.1:8085`
- **UAT (`d:\domepos\uat`)**: UAT Runner & Dashboard รันที่ `http://localhost:3056` (`npm run dev`)
- **Database**: PostgreSQL ฐานข้อมูลชื่อ **`domepos`** + เชื่อมต่อ **Cloudflare D1** (SQL Database) และ **Cloudflare R2** (Object Storage เก็บรูปสินค้าทั้งหมด) แบบ **Realtime SSE + Auto Sync ทุก 30 วินาที**

## 3. โครงสร้างไฟล์สำคัญ (Key Files)
- **Frontend (`d:\domepos\frontend`)**:
  - `src/app/page.tsx`: หน้าแรกเปิดเข้า `DomePosScreen` ทันที
  - `src/components/DomePosScreen.tsx`: หน้าจอหลัก POS 5 แท็บ (`1. ขายหน้าร้าน (POS)`, `2. ผังโต๊ะ & บาร์`, `3. จอคิวบาริสต้า (KDS)`, `4. รายงาน & ปิดกะ`, `5. จัดการสินค้า & Cloudflare`) ใช้ธีมพรีเมียม Espresso + Terracotta (`#B5651D`) พื้นครีม จาก design system กลาง `src/app/globals.css` (คลาส `dp-*`), แอนิเมชันกดสินค้าเด้ง `+1 ⚡`, เสียงสังเคราะห์ Web Audio, ตัวเลือกความหวาน/ท็อปปิ้งประจำตัวสินค้า และระบบ **Auto Sync ทุก 30 วินาที** + **Cloudflare Realtime SSE**
  - `src/components/DomePosManagePanel.tsx`: แผงจัดการสินค้า (เพิ่ม/แก้ไขชื่อ ราคา หมวดหมู่ รูปภาพ ลบสินค้า) และหน้าตั้งค่าบัญชี Cloudflare ของผู้ใช้ (`Account ID`, `API Token`, `D1 Database ID`, `R2 Bucket Name`) พร้อมปุ่ม `Auto Sync ทุก 30 วินาที` (`data-testid="pos-cf-autosync-30s-btn"`) และปุ่ม `บันทึก & ซิงค์ข้อมูลทั้งหมดขึ้น Cloudflare ทันที` (`data-testid="pos-cf-save-sync-btn"`)
  - `src/app/api/pos/[...path]/route.ts`: API Proxy เชื่อมต่อไปยัง Go Backend (`:8085`) รองรับทั้ง JSON, รูปภาพ R2, และ `text/event-stream` (SSE Realtime)
  - `src/app/api/process/wallet/[action]/route.ts`: ระบบสะสมแต้ม ThaiFi Custody Wallet (ซื้อครบทุก 100 บาท รับ 1 Point)
  - `src/lib/numeric.ts`: BigInt Fixed-Point Decimal Engine (IRON RULE 20 ห้ามใช้ `float` คำนวณเงิน)
  - `public/logo.png` และ `public/products/*.jpg`: โลโก้ระบบและรูปภาพสินค้าสตูดิโอครบทั้ง 19 เมนูหลัก
- **Backend (`d:\domepos\backend`)**:
  - `cmd/api/main.go`: จุดเริ่มรันเซิร์ฟเวอร์พอร์ต `8085`
  - `internal/pos/store.go`: สร้างฐานข้อมูล `domepos` อัตโนมัติ + Migrate 24 ตารางมาตรฐาน (`posconfig`, `pos_id`, `ic_inventory`, `ic_inventory_barcode`, `ic_trans`, `ic_trans_detail`, `cb_trans`, `gl_journal`, `gl_journal_detail`, `pos_bill_inbox`, `pos_period`, `poscashiersettle` ฯลฯ)
  - `internal/pos/actions.go`: คำนวณเงิน/ภาษี/ลงบัญชี GL ด้วย `*big.Rat` (`internal/money/rat.go`) + Dual-write ขึ้น Cloudflare D1
  - `internal/pos/handler.go`: REST API `/api/v1/pos/*` (`bootstrap`, `sync`, `restore`, `bills`, `shift`, `config`, `devices`, `image`, `media`, `cloudflare/setup`, `cloudflare/stream`)
  - `internal/pos/realtime.go`: ระบบ `RealtimeHub` ส่ง Server-Sent Events (`GET /api/v1/pos/cloudflare/stream?mode=sse`) และ Loop **Auto Sync ทุก 30 วินาที** (`StartRealtimeLoop`)
  - `internal/cloudflare/d1.go` & `internal/cloudflare/r2.go`: Client เชื่อมต่อ Cloudflare D1 REST API v4 และ Cloudflare R2 (AWS Signature V4)
- **Cloudflare Edge Stack (`d:\domepos\cloudflare`)**:
  - `wrangler.toml`, `schema.d1.sql`, `src/worker.ts`: โค้ดสำหรับ Deploy ขึ้น Cloudflare Workers + D1 + R2 + KV + Queues + Durable Objects KDS
- **UAT (`d:\domepos\uat`)**:
  - `uat-scripts/pos-e2e-api-db-gl-report.json` (17 ขั้นตอน)
  - `uat-scripts/pos-data-reconcile-and-promo-audit.json` (8 ขั้นตอน)
  - `uat-scripts/pos-starter-cafe-beer-ui-e2e.json` (34 ขั้นตอน)

## 4. คำสั่งตรวจสอบและรันทดสอบ (Verification Commands)
```powershell
# 1. ทดสอบและ Build Go Backend
cd d:\domepos\backend
go test ./...
go build -o domepos-api.exe ./cmd/api

# 2. ตรวจ TypeScript ของ Frontend
cd d:\domepos\frontend
npx tsc --noEmit

# 3. รัน UAT E2E ทั้ง 3 ชุด (ต้องผ่าน 100% 0 failed)
cd d:\domepos\uat
node runner/run.mjs --script uat-scripts/pos-e2e-api-db-gl-report.json --out runs/verify-api --base http://localhost:3005
node runner/run.mjs --script uat-scripts/pos-data-reconcile-and-promo-audit.json --out runs/verify-data --base http://localhost:3005
node runner/run.mjs --script uat-scripts/pos-starter-cafe-beer-ui-e2e.json --out runs/verify-ui --base http://localhost:3005
```
