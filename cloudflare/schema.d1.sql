-- =============================================================================
-- DOME Pos — Cloudflare D1 Serverless SQL Schema (มาตรฐาน _g.d + IRON RULE 20)
-- เก็บค่าเงินเป็น TEXT (Fixed-Point Decimal 2 ตำแหน่ง) ห้ามคำนวณด้วย Float
-- =============================================================================

CREATE TABLE IF NOT EXISTS posconfig (
  roworder INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL DEFAULT 'DOME Pos · ร้านกาแฟ เบียร์ คาเฟ่ย์',
  branch_code TEXT NOT NULL DEFAULT '00000',
  branch_name TEXT NOT NULL DEFAULT 'สาขาหลัก (เจ้าของคนเดียว)',
  tax_id TEXT NOT NULL DEFAULT '0105567000001',
  pos_id TEXT NOT NULL DEFAULT 'POS-01',
  vat_type INTEGER NOT NULL DEFAULT 1,
  vat_rate TEXT NOT NULL DEFAULT '7.00',
  receipt_header TEXT NOT NULL DEFAULT 'DOME Pos Cafe & Craft Beer',
  receipt_footer TEXT NOT NULL DEFAULT 'ขอบคุณที่อุดหนุนครับ · โอกาสหน้าเชิญใหม่',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pos_id (
  code TEXT PRIMARY KEY,
  name_1 TEXT NOT NULL,
  branch_code TEXT NOT NULL DEFAULT '00000',
  warehouse_code TEXT NOT NULL DEFAULT 'WH-01',
  shelf_code TEXT NOT NULL DEFAULT 'SH-01',
  doc_format TEXT NOT NULL DEFAULT 'POS-@YY@MM-@#####',
  slip_header TEXT NOT NULL DEFAULT 'DOME Pos',
  slip_footer TEXT NOT NULL DEFAULT 'Thank You!',
  status INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS erp_thai_qr_config (
  roworder INTEGER PRIMARY KEY AUTOINCREMENT,
  promptpay_id TEXT NOT NULL DEFAULT '0812345678',
  account_name TEXT NOT NULL DEFAULT 'DOME POS CAFE',
  bank_code TEXT NOT NULL DEFAULT '014',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos_point_condition (
  roworder INTEGER PRIMARY KEY AUTOINCREMENT,
  baht_per_point TEXT NOT NULL DEFAULT '100.00',
  point_per_redeem TEXT NOT NULL DEFAULT '10.00',
  discount_per_redeem TEXT NOT NULL DEFAULT '10.00',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos_promotions (
  code TEXT PRIMARY KEY,
  name_1 TEXT NOT NULL,
  promo_type INTEGER NOT NULL DEFAULT 1,
  discount_value TEXT NOT NULL DEFAULT '0.00',
  min_amount TEXT NOT NULL DEFAULT '0.00',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos_member_groups (
  code TEXT PRIMARY KEY,
  name_1 TEXT NOT NULL,
  discount_percent TEXT NOT NULL DEFAULT '0.00'
);

CREATE TABLE IF NOT EXISTS ic_inventory (
  code TEXT PRIMARY KEY,
  name_1 TEXT NOT NULL,
  name_eng_1 TEXT NOT NULL DEFAULT '',
  unit_standard TEXT NOT NULL DEFAULT 'แก้ว',
  unit_cost TEXT NOT NULL DEFAULT 'แก้ว',
  group_main TEXT NOT NULL DEFAULT 'COFFEE',
  item_type INTEGER NOT NULL DEFAULT 0,
  tax_type INTEGER NOT NULL DEFAULT 0,
  average_cost TEXT NOT NULL DEFAULT '0.00',
  balance_qty TEXT NOT NULL DEFAULT '100.00',
  balance_amount TEXT NOT NULL DEFAULT '0.00',
  image_url TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ic_inventory_barcode (
  barcode TEXT PRIMARY KEY,
  ic_code TEXT NOT NULL,
  unit_code TEXT NOT NULL DEFAULT 'แก้ว',
  description TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '0.00',
  price_2 TEXT NOT NULL DEFAULT '0.00',
  price_member TEXT NOT NULL DEFAULT '0.00'
);

CREATE TABLE IF NOT EXISTS pos_period (
  period_guid TEXT PRIMARY KEY,
  pos_id TEXT NOT NULL DEFAULT 'POS-01',
  cashier_code TEXT NOT NULL DEFAULT 'OWNER',
  open_time TEXT NOT NULL DEFAULT (datetime('now')),
  close_time TEXT NOT NULL DEFAULT '',
  float_amount TEXT NOT NULL DEFAULT '0.00',
  cash_counted TEXT NOT NULL DEFAULT '0.00',
  status INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS poscashiersettle (
  roworder INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,
  doc_date TEXT NOT NULL,
  doc_time TEXT NOT NULL,
  pos_id TEXT NOT NULL DEFAULT 'POS-01',
  cashier_code TEXT NOT NULL DEFAULT 'OWNER',
  trans_type INTEGER NOT NULL DEFAULT 1,
  amount TEXT NOT NULL DEFAULT '0.00',
  remark TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pos_bill_inbox (
  bill_guid TEXT PRIMARY KEY,
  pos_id TEXT NOT NULL DEFAULT 'POS-01',
  doc_no TEXT NOT NULL,
  doc_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSED',
  error_msg TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ic_trans (
  doc_no TEXT PRIMARY KEY,
  doc_date TEXT NOT NULL,
  doc_time TEXT NOT NULL DEFAULT '00:00',
  trans_flag INTEGER NOT NULL DEFAULT 44,
  cust_code TEXT NOT NULL DEFAULT 'WALKIN',
  cashier_code TEXT NOT NULL DEFAULT 'OWNER',
  pos_id TEXT NOT NULL DEFAULT 'POS-01',
  total_value TEXT NOT NULL DEFAULT '0.00',
  total_discount TEXT NOT NULL DEFAULT '0.00',
  total_before_vat TEXT NOT NULL DEFAULT '0.00',
  total_vat_value TEXT NOT NULL DEFAULT '0.00',
  total_amount TEXT NOT NULL DEFAULT '0.00',
  is_cancel INTEGER NOT NULL DEFAULT 0,
  remark TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ic_trans_detail (
  roworder INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,
  doc_date TEXT NOT NULL,
  trans_flag INTEGER NOT NULL DEFAULT 44,
  line_number INTEGER NOT NULL DEFAULT 1,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  unit_code TEXT NOT NULL DEFAULT 'แก้ว',
  qty TEXT NOT NULL DEFAULT '1.00',
  price TEXT NOT NULL DEFAULT '0.00',
  discount_amount TEXT NOT NULL DEFAULT '0.00',
  sum_amount TEXT NOT NULL DEFAULT '0.00'
);

CREATE TABLE IF NOT EXISTS cb_trans (
  doc_no TEXT PRIMARY KEY,
  doc_date TEXT NOT NULL,
  trans_flag INTEGER NOT NULL DEFAULT 44,
  total_amount TEXT NOT NULL DEFAULT '0.00',
  cash_amount TEXT NOT NULL DEFAULT '0.00',
  transfer_amount TEXT NOT NULL DEFAULT '0.00',
  card_amount TEXT NOT NULL DEFAULT '0.00',
  wallet_amount TEXT NOT NULL DEFAULT '0.00',
  payment_method TEXT NOT NULL DEFAULT 'CASH'
);

CREATE TABLE IF NOT EXISTS gl_journal (
  doc_no TEXT PRIMARY KEY,
  doc_date TEXT NOT NULL,
  book_code TEXT NOT NULL DEFAULT 'POS',
  description TEXT NOT NULL DEFAULT '',
  total_debit TEXT NOT NULL DEFAULT '0.00',
  total_credit TEXT NOT NULL DEFAULT '0.00'
);

CREATE TABLE IF NOT EXISTS gl_journal_detail (
  roworder INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,
  doc_date TEXT NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  debit TEXT NOT NULL DEFAULT '0.00',
  credit TEXT NOT NULL DEFAULT '0.00'
);

CREATE TABLE IF NOT EXISTS pos_media_r2 (
  image_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/webp',
  public_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed ข้อมูลเริ่มต้นสำหรับเจ้าของคนเดียว
INSERT OR IGNORE INTO posconfig (roworder, company_name, pos_id, vat_rate)
VALUES (1, 'DOME Pos · ร้านกาแฟ เบียร์ คาเฟ่ย์', 'POS-01', '7.00');

INSERT OR IGNORE INTO pos_id (code, name_1, branch_code, warehouse_code, shelf_code)
VALUES ('POS-01', 'เครื่องขายหน้าร้านหลัก (เจ้าของคนเดียว)', '00000', 'WH-01', 'SH-01');

INSERT OR IGNORE INTO erp_thai_qr_config (roworder, promptpay_id, account_name)
VALUES (1, '0812345678', 'DOME POS CAFE');

INSERT OR IGNORE INTO pos_point_condition (roworder, baht_per_point, point_per_redeem, discount_per_redeem)
VALUES (1, '100.00', '10.00', '10.00');

INSERT OR IGNORE INTO pos_promotions (code, name_1, promo_type, discount_value, min_amount)
VALUES ('PROMO-CAFE-10', 'ส่วนลดคนรักกาแฟ 10 บาท', 1, '10.00', '100.00');

INSERT OR IGNORE INTO pos_member_groups (code, name_1, discount_percent)
VALUES ('GENERAL', 'ลูกค้าทั่วไป', '0.00'), ('VIP', 'ลูกค้าประจำ DOME VIP', '5.00');
