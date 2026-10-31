# DOME Pos — Project AI Rules (`d:\domepos`)

## 1. ขอบเขตของโปรเจกต์ (Scope & Isolation)
- **DOME Pos (`d:\domepos`)** คือระบบขายหน้าร้านกาแฟ เบียร์ และคาเฟ่ย์ ขนาดกะทัดรัด (Mini & Standalone) ออกแบบมาสำหรับ **เจ้าของร้านคนเดียว ทำงานคนเดียว (Solo Owner)** เปิดเข้าหน้าเว็บแล้วพร้อมขายทันทีโดยไม่ต้องผ่านหน้าล็อกอินหรือเลือกบริษัทซับซ้อน
- **แยกอิสระจาก `d:\smlaiaccount` 100%**:
  - **Frontend (`d:\domepos\frontend`)**: รันที่พอร์ต `3005` (`http://localhost:3005`)
  - **Backend (`d:\domepos\backend`)**: รันที่พอร์ต `8085` (`http://localhost:8085`)
  - **UAT (`d:\domepos\uat`)**: รันที่พอร์ต `3056` (`http://localhost:3056`)
  - **Database**: ใช้ฐานข้อมูล PostgreSQL ชื่อ **`domepos`** (และ `uat_domepos` สำหรับทดสอบ) ห้ามเชื่อมต่อหรือแก้ไขฐานข้อมูล `smldemo` ของ `smlaiaccount` เด็ดขาด

## 2. กฎเหล็กด้านตัวเลขบัญชีและการเงิน (IRON RULE 20)
- ห้ามใช้ `float` / `double` / `parseFloat` / `Number()` ในการคำนวณเงิน ส่วนลด หรือภาษีเด็ดขาด
- ฝั่ง Frontend ใช้ BigInt Fixed-Point Decimal Engine (`frontend/src/lib/numeric.ts`)
- ฝั่ง Backend ใช้ `math/big.Rat` และเก็บลง PostgreSQL ด้วยชนิด `NUMERIC(18,2)`
- ชื่อตารางและคอลัมน์ในฐานข้อมูล `domepos` ยึดตามมาตรฐาน `_g.d` (`ic_inventory`, `ic_trans`, `ic_trans_detail`, `cb_trans`, `gl_journal`, `gl_journal_detail`, `pos_bill_inbox`, `pos_period`, `poscashiersettle`) เพื่อให้โครงสร้างข้อมูลเป็นมาตรฐานเดียวกัน

## 3. กฎเหล็กด้าน UI (Baseline-First & Solo-Owner UX)
- ตัวหนังสือ ปุ่ม ช่องกรอก ไอคอน และ Badge ในแถวเดียวกันต้องอยู่ระนาบ Baseline และกึ่งกลางแนวนอนเดียวกันเป๊ะ (`items-center`)
- ข้อความทุกส่วนบนหน้าจอเป็นภาษาไทยที่เข้าใจง่ายสำหรับเจ้าของร้านคนเดียว
