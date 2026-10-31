-- Cloudflare D1 Schema for DOME Pos (domepos)
-- มาตรฐานตารางและคอลัมน์ _g.d (SML / BC Compatible) + Exact Decimal Text/Numeric

CREATE TABLE IF NOT EXISTS posconfig (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    pos_config_number TEXT UNIQUE NOT NULL,
    shop_name TEXT NOT NULL DEFAULT 'DOME Pos Cafe & Craft Beer',
    branch_name TEXT NOT NULL DEFAULT 'สาขาหลัก (00000)',
    tax_id TEXT NOT NULL DEFAULT '0105566000001',
    pos_terminal_no TEXT NOT NULL DEFAULT 'POS-TERM-01',
    cust_code_default TEXT NOT NULL DEFAULT 'WALKIN',
    is_member INTEGER NOT NULL DEFAULT 1,
    member_discount NUMERIC(18,2) NOT NULL DEFAULT 5.00,
    max_pos_money NUMERIC(18,2) NOT NULL DEFAULT 50000.00,
    round_change_decimal INTEGER NOT NULL DEFAULT 0,
    format_round INTEGER NOT NULL DEFAULT 0,
    vat_type INTEGER NOT NULL DEFAULT 1,
    vat_rate NUMERIC(18,2) NOT NULL DEFAULT 7.00,
    service_charge_rate NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    pos_header TEXT NOT NULL DEFAULT 'ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ (ABB)',
    pos_footer TEXT NOT NULL DEFAULT 'ขอบคุณที่แวะมาดื่มกาแฟและคราฟต์เบียร์ที่ DOME Pos',
    pos_bill_type INTEGER NOT NULL DEFAULT 0,
    pos_change_price_config INTEGER NOT NULL DEFAULT 1,
    pos_change_discount_config INTEGER NOT NULL DEFAULT 1,
    pos_cancel_bill INTEGER NOT NULL DEFAULT 1,
    show_tax_detail INTEGER NOT NULL DEFAULT 1,
    barcode_picture INTEGER NOT NULL DEFAULT 1,
    check_float_money INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_id (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    machinecode TEXT UNIQUE NOT NULL,
    pos_id TEXT NOT NULL DEFAULT 'POS-01',
    machine_name TEXT NOT NULL DEFAULT 'เคาน์เตอร์หลัก (เจ้าของร้าน DOME Pos)',
    status INTEGER NOT NULL DEFAULT 1,
    pos_config_number TEXT NOT NULL DEFAULT 'POS-CFG-01',
    price_number INTEGER NOT NULL DEFAULT 1,
    doc_format TEXT NOT NULL DEFAULT 'ABB1-@YY@MM-#####',
    doc_format_vat_full TEXT NOT NULL DEFAULT 'TAX1-@YY@MM-#####',
    doc_format_cancel TEXT NOT NULL DEFAULT 'CNM1-@YY@MM-#####',
    doc_format_fillmoney TEXT NOT NULL DEFAULT 'RCV1-@YY@MM-#####',
    doc_format_cashiersettle TEXT NOT NULL DEFAULT 'SND1-@YY@MM-#####',
    pos_ic_wht TEXT NOT NULL DEFAULT 'MMA01',
    pos_ic_shelf TEXT NOT NULL DEFAULT 'SH-01',
    pos_type_invoice INTEGER NOT NULL DEFAULT 0,
    pos_save_e_journal INTEGER NOT NULL DEFAULT 1,
    slip_number TEXT NOT NULL DEFAULT 'SLIP-80MM',
    doc_running_inv TEXT NOT NULL DEFAULT 'ABB',
    doc_format_code TEXT NOT NULL DEFAULT 'ABB',
    branch_code TEXT NOT NULL DEFAULT '00000',
    department_code TEXT NOT NULL DEFAULT 'CAFE',
    use_credit_sale INTEGER NOT NULL DEFAULT 1,
    printer_name TEXT NOT NULL DEFAULT 'EPSON TM-T82III (80mm Auto-Cut)',
    customer_display TEXT NOT NULL DEFAULT 'จอแสดงราคาฝั่งลูกค้า + QR Display',
    cash_drawer_enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS erp_thai_qr_config (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    pos_id TEXT UNIQUE NOT NULL DEFAULT 'ALL',
    promp_pay_telephone_number TEXT NOT NULL DEFAULT '0812345678',
    promp_pay_wallet_id TEXT NOT NULL DEFAULT '',
    merchant_name TEXT NOT NULL DEFAULT 'DOME POS CAFE',
    company_biller_id TEXT NOT NULL DEFAULT '',
    company_terminal_id TEXT NOT NULL DEFAULT 'TERM-01',
    company_store_id TEXT NOT NULL DEFAULT 'DOME-01',
    config_type INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pos_point_condition (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    condition_code TEXT UNIQUE NOT NULL DEFAULT 'POINT-STD',
    baht_per_point NUMERIC(18,2) NOT NULL DEFAULT 100.00,
    points_per_baht_redeem NUMERIC(18,2) NOT NULL DEFAULT 1.00,
    min_redeem_points NUMERIC(18,2) NOT NULL DEFAULT 10.00,
    birth_month_multiplier NUMERIC(18,2) NOT NULL DEFAULT 2.00,
    birth_day_multiplier NUMERIC(18,2) NOT NULL DEFAULT 3.00,
    birth_month_use INTEGER NOT NULL DEFAULT 1,
    birth_day_use INTEGER NOT NULL DEFAULT 1,
    vip_tier_silver_min NUMERIC(18,2) NOT NULL DEFAULT 500.00,
    vip_tier_gold_min NUMERIC(18,2) NOT NULL DEFAULT 2000.00,
    vip_tier_platinum_min NUMERIC(18,2) NOT NULL DEFAULT 5000.00
);

CREATE TABLE IF NOT EXISTS pos_promotions (
    promo_code TEXT PRIMARY KEY,
    promo_name TEXT NOT NULL,
    promo_type TEXT NOT NULL DEFAULT 'STEP_SPEND',
    promo_type_code INTEGER NOT NULL DEFAULT 7,
    description TEXT NOT NULL DEFAULT '',
    target_barcode TEXT NOT NULL DEFAULT '',
    min_qty NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    min_spend NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    discount_pct NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    discount_text TEXT NOT NULL DEFAULT '',
    free_qty NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    unit_stand NUMERIC(18,2) NOT NULL DEFAULT 1.00,
    unit_divide NUMERIC(18,2) NOT NULL DEFAULT 1.00,
    strict_unit_ratio INTEGER NOT NULL DEFAULT 1,
    allow_mix_match INTEGER NOT NULL DEFAULT 1,
    auto_add_free_item INTEGER NOT NULL DEFAULT 1,
    max_qty_per_bill NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    customer_only INTEGER NOT NULL DEFAULT 0,
    date_begin TEXT NOT NULL DEFAULT '2026-01-01',
    date_end TEXT NOT NULL DEFAULT '2030-12-31',
    time_start TEXT NOT NULL DEFAULT '00:00',
    time_end TEXT NOT NULL DEFAULT '23:59',
    day_filter TEXT NOT NULL DEFAULT 'ALL',
    items_include_json TEXT NOT NULL DEFAULT '{}',
    reward_item_code TEXT NOT NULL DEFAULT '',
    reward_item_name TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS coupon_list (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    balance_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    last_status INTEGER NOT NULL DEFAULT 0,
    date TEXT,
    date_expire TEXT,
    remark TEXT NOT NULL DEFAULT '',
    coupon_type INTEGER NOT NULL DEFAULT 0,
    single_use INTEGER NOT NULL DEFAULT 1,
    cust_code TEXT NOT NULL DEFAULT '',
    coupon_group TEXT NOT NULL DEFAULT 'DOME-PROMO'
);

CREATE TABLE IF NOT EXISTS pos_member_groups (
    group_code TEXT PRIMARY KEY,
    group_name TEXT NOT NULL,
    group_type TEXT NOT NULL DEFAULT 'CAFE_MEMBER',
    primary_member_code TEXT NOT NULL DEFAULT 'WALKIN',
    tier_level TEXT NOT NULL DEFAULT 'GOLD',
    discount_pct NUMERIC(18,2) NOT NULL DEFAULT 5.00,
    pool_points INTEGER NOT NULL DEFAULT 1,
    shared_points NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    member_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos_temp_members (
    telephone TEXT PRIMARY KEY,
    temp_name TEXT NOT NULL DEFAULT '',
    source_terminal_id TEXT NOT NULL DEFAULT 'POS-01',
    bill_count INTEGER NOT NULL DEFAULT 1,
    total_spend NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    pending_points NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'PENDING',
    target_member_code TEXT NOT NULL DEFAULT '',
    target_group_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_period (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    period_guid TEXT UNIQUE NOT NULL,
    machine_code TEXT NOT NULL DEFAULT 'POS-01',
    begin_date TEXT,
    begin_time TEXT NOT NULL DEFAULT '',
    end_date TEXT,
    end_time TEXT NOT NULL DEFAULT '',
    status INTEGER NOT NULL DEFAULT 1,
    period_status INTEGER NOT NULL DEFAULT 0,
    begin_user_code TEXT NOT NULL DEFAULT 'OWNER-01',
    end_user_code TEXT NOT NULL DEFAULT '',
    float_amount NUMERIC(18,2) NOT NULL DEFAULT 2000.00
);

CREATE TABLE IF NOT EXISTS poscashiersettle (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    docno TEXT UNIQUE NOT NULL,
    docdate TEXT,
    doc_time TEXT NOT NULL DEFAULT '',
    cashiercode TEXT NOT NULL DEFAULT 'OWNER-01',
    machinecode TEXT NOT NULL DEFAULT 'POS-01',
    pos_id TEXT NOT NULL DEFAULT 'POS-01',
    cashamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    creditcardamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    coupongamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    chqamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    transferamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    trans_type INTEGER NOT NULL DEFAULT 1,
    remark TEXT NOT NULL DEFAULT '',
    total_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_cancel NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_in NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_out NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    branch_code TEXT NOT NULL DEFAULT '00000'
);

CREATE TABLE IF NOT EXISTS pos_bill_inbox (
    bill_guid TEXT PRIMARY KEY,
    machine_code TEXT NOT NULL DEFAULT 'POS-01',
    doc_no TEXT UNIQUE NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'PROCESSED',
    status_code INTEGER NOT NULL DEFAULT 1,
    error TEXT NOT NULL DEFAULT '',
    processed_at TEXT,
    earned_points NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    cancelled_at TEXT,
    cancel_reason TEXT NOT NULL DEFAULT '',
    cancelled_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pos_sync_change (
    entity TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    xid INTEGER NOT NULL DEFAULT 1,
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entity, entity_key)
);

CREATE TABLE IF NOT EXISTS pos_stock_queue (
    item_code TEXT PRIMARY KEY,
    queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ic_unit (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name_1 TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ic_inventory (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name_1 TEXT NOT NULL DEFAULT '',
    name_eng_1 TEXT NOT NULL DEFAULT '',
    unit_standard TEXT NOT NULL DEFAULT 'แก้ว',
    unit_cost TEXT NOT NULL DEFAULT 'แก้ว',
    group_main TEXT NOT NULL DEFAULT 'COFFEE',
    item_type INTEGER NOT NULL DEFAULT 0,
    tax_type INTEGER NOT NULL DEFAULT 0,
    unit_type INTEGER NOT NULL DEFAULT 0,
    status INTEGER NOT NULL DEFAULT 1,
    balance_qty NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    average_cost NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    image_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ic_unit_use (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    ic_code TEXT NOT NULL,
    code TEXT NOT NULL,
    stand_value NUMERIC(18,2) NOT NULL DEFAULT 1.00,
    divide_value NUMERIC(18,2) NOT NULL DEFAULT 1.00,
    ratio NUMERIC(18,2) NOT NULL DEFAULT 1.00,
    row_order INTEGER NOT NULL DEFAULT 1,
    status INTEGER NOT NULL DEFAULT 1,
    UNIQUE(ic_code, code)
);

CREATE TABLE IF NOT EXISTS ic_inventory_barcode (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    ic_code TEXT NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    unit_code TEXT NOT NULL DEFAULT 'แก้ว',
    price NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    price_2 NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    price_member NUMERIC(18,2) NOT NULL DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS ar_customer (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name_1 TEXT NOT NULL DEFAULT '',
    telephone TEXT NOT NULL DEFAULT '',
    tax_id TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    point_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    ar_tier_code TEXT NOT NULL DEFAULT 'MEMBER',
    price_level INTEGER NOT NULL DEFAULT 1,
    status INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ic_trans (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    trans_type INTEGER NOT NULL DEFAULT 2,
    trans_flag INTEGER NOT NULL DEFAULT 44,
    doc_date TEXT NOT NULL,
    doc_no TEXT NOT NULL,
    doc_time TEXT NOT NULL DEFAULT '',
    cust_code TEXT NOT NULL DEFAULT 'WALKIN',
    branch_code TEXT NOT NULL DEFAULT '00000',
    department_code TEXT NOT NULL DEFAULT 'CAFE',
    inquiry_type INTEGER NOT NULL DEFAULT 1,
    vat_type INTEGER NOT NULL DEFAULT 1,
    vat_rate NUMERIC(18,2) NOT NULL DEFAULT 7.00,
    total_value NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_discount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_before_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_vat_value NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_after_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_except_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    is_pos INTEGER NOT NULL DEFAULT 1,
    pos_id TEXT NOT NULL DEFAULT 'POS-01',
    cashier_code TEXT NOT NULL DEFAULT 'OWNER-01',
    payment_method TEXT NOT NULL DEFAULT 'CASH',
    sum_point NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    last_status INTEGER NOT NULL DEFAULT 0,
    is_cancel INTEGER NOT NULL DEFAULT 0,
    doc_ref TEXT NOT NULL DEFAULT '',
    doc_ref_date TEXT,
    remark TEXT NOT NULL DEFAULT '',
    UNIQUE(doc_no, trans_flag)
);

CREATE TABLE IF NOT EXISTS ic_trans_detail (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    trans_type INTEGER NOT NULL DEFAULT 2,
    trans_flag INTEGER NOT NULL DEFAULT 44,
    doc_date TEXT NOT NULL,
    doc_no TEXT NOT NULL,
    doc_time TEXT NOT NULL DEFAULT '',
    line_number INTEGER NOT NULL DEFAULT 1,
    calc_flag INTEGER NOT NULL DEFAULT -1,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL DEFAULT '',
    barcode TEXT NOT NULL DEFAULT '',
    unit_code TEXT NOT NULL DEFAULT 'แก้ว',
    wh_code TEXT NOT NULL DEFAULT 'MMA01',
    shelf_code TEXT NOT NULL DEFAULT 'SH-01',
    qty NUMERIC(18,2) NOT NULL DEFAULT 1.00,
    stand_value NUMERIC(18,2) NOT NULL DEFAULT 1.00,
    divide_value NUMERIC(18,2) NOT NULL DEFAULT 1.00,
    price NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    price_exclude_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    discount TEXT NOT NULL DEFAULT '0.00',
    discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    sum_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    sum_amount_exclude_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    vat_value NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    tax_type INTEGER NOT NULL DEFAULT 0,
    vat_type INTEGER NOT NULL DEFAULT 1,
    item_type INTEGER NOT NULL DEFAULT 0,
    is_pos INTEGER NOT NULL DEFAULT 1,
    last_status INTEGER NOT NULL DEFAULT 0,
    is_cancel INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cb_trans (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    trans_type INTEGER NOT NULL DEFAULT 2,
    trans_flag INTEGER NOT NULL DEFAULT 44,
    doc_date TEXT NOT NULL,
    doc_no TEXT NOT NULL,
    doc_time TEXT NOT NULL DEFAULT '',
    ap_ar_code TEXT NOT NULL DEFAULT 'WALKIN',
    pay_type INTEGER NOT NULL DEFAULT 1,
    total_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_net_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    cash_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    pay_cash_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    money_change NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    tranfer_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    card_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    wallet_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    coupon_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    point_qty NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    point_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    branch_code TEXT NOT NULL DEFAULT '00000',
    cashier_code TEXT NOT NULL DEFAULT 'OWNER-01',
    last_status INTEGER NOT NULL DEFAULT 0,
    is_cancel INTEGER NOT NULL DEFAULT 0,
    UNIQUE(doc_no, trans_flag)
);

CREATE TABLE IF NOT EXISTS cb_trans_detail (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    trans_type INTEGER NOT NULL DEFAULT 2,
    trans_flag INTEGER NOT NULL DEFAULT 44,
    doc_date TEXT NOT NULL,
    doc_no TEXT NOT NULL,
    doc_time TEXT NOT NULL DEFAULT '',
    line_number INTEGER NOT NULL DEFAULT 1,
    doc_type INTEGER NOT NULL DEFAULT 1,
    trans_number TEXT NOT NULL DEFAULT '',
    amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    sum_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    ap_ar_code TEXT NOT NULL DEFAULT 'WALKIN',
    last_status INTEGER NOT NULL DEFAULT 0,
    is_cancel INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gl_chart_of_account (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name_1 TEXT NOT NULL DEFAULT '',
    account_type INTEGER NOT NULL DEFAULT 1,
    account_level INTEGER NOT NULL DEFAULT 1,
    status INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gl_journal (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_date TEXT NOT NULL,
    doc_no TEXT NOT NULL,
    book_code TEXT NOT NULL DEFAULT 'POS',
    period_number INTEGER NOT NULL DEFAULT 1,
    account_year INTEGER NOT NULL DEFAULT 2026,
    description TEXT NOT NULL DEFAULT '',
    debit NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    trans_flag INTEGER NOT NULL DEFAULT 44,
    doc_format_code TEXT NOT NULL DEFAULT 'ABB',
    branch_code TEXT NOT NULL DEFAULT '00000',
    trans_direct INTEGER NOT NULL DEFAULT 0,
    journal_type INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gl_journal_detail (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_date TEXT NOT NULL,
    doc_no TEXT NOT NULL,
    book_code TEXT NOT NULL DEFAULT 'POS',
    line_number INTEGER NOT NULL DEFAULT 1,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL DEFAULT '',
    debit_or_credit INTEGER NOT NULL DEFAULT 0,
    debit NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    trans_flag INTEGER NOT NULL DEFAULT 44,
    journal_type INTEGER NOT NULL DEFAULT 0,
    branch_code TEXT NOT NULL DEFAULT '00000',
    period_number INTEGER NOT NULL DEFAULT 1,
    account_year INTEGER NOT NULL DEFAULT 2026
);

CREATE TABLE IF NOT EXISTS images (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id TEXT NOT NULL,
    guid_code TEXT NOT NULL DEFAULT '',
    image_order INTEGER NOT NULL DEFAULT 0,
    image_url TEXT NOT NULL DEFAULT '',
    image_file BLOB
);

CREATE TABLE IF NOT EXISTS sml_doc_images (
    roworder INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id TEXT NOT NULL,
    guid_code TEXT NOT NULL DEFAULT '',
    image_order INTEGER NOT NULL DEFAULT 0,
    image_url TEXT NOT NULL DEFAULT '',
    image_file BLOB,
    create_date_time_now TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
