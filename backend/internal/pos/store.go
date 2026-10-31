package pos

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/domepos/backend/internal/cloudflare"
	"github.com/domepos/backend/internal/money"
)

type SeedItem struct {
	Code     string
	Barcode  string
	Name     string
	NameEn   string
	Category string
	Unit     string
	Price    string
}

var DefaultCafeCatalog = []SeedItem{
	{Code: "CAFE-ESP-01", Barcode: "8859001001011", Name: "อเมริกาโน่เย็น คั่วกลาง", NameEn: "Iced Medium Roast Americano", Category: "COFFEE", Unit: "แก้ว", Price: "75.00"},
	{Code: "CAFE-ESP-02", Barcode: "8859001001028", Name: "คาเฟ่ลาเต้เย็น นมสดฮอกไกโด", NameEn: "Iced Hokkaido Milk Latte", Category: "COFFEE", Unit: "แก้ว", Price: "85.00"},
	{Code: "CAFE-ESP-03", Barcode: "8859001001035", Name: "เดอร์ตี้คอฟฟี่ นมเย็นจัดช็อตเข้ม", NameEn: "Signature Dirty Coffee", Category: "COFFEE", Unit: "แก้ว", Price: "110.00"},
	{Code: "CAFE-ESP-04", Barcode: "8859001001042", Name: "เอสเปรสโซ่เย็น สไตล์ไทยเข้มข้น", NameEn: "Thai Style Iced Espresso", Category: "COFFEE", Unit: "แก้ว", Price: "80.00"},
	{Code: "CAFE-ESP-05", Barcode: "8859001001059", Name: "คาราเมลมัคคิอาโต้เย็น", NameEn: "Iced Caramel Macchiato", Category: "COFFEE", Unit: "แก้ว", Price: "95.00"},
	{Code: "CAFE-TEA-01", Barcode: "8859001002018", Name: "อุจิมัทฉะลาเต้พรีเมียม", NameEn: "Ceremonial Uji Matcha Latte", Category: "TEA", Unit: "แก้ว", Price: "115.00"},
	{Code: "CAFE-TEA-02", Barcode: "8859001002025", Name: "โฮจิฉะคั่วหอมลาเต้เย็น", NameEn: "Roasted Hojicha Latte", Category: "TEA", Unit: "แก้ว", Price: "105.00"},
	{Code: "CAFE-TEA-03", Barcode: "8859001002032", Name: "ชาไทยครีมชีสพ่นไฟ", NameEn: "Thai Tea Brulee Cream Cheese", Category: "TEA", Unit: "แก้ว", Price: "90.00"},
	{Code: "CAFE-TEA-04", Barcode: "8859001002049", Name: "ยูซุน้ำผึ้งโซดาสดชื่น", NameEn: "Yuzu Honey Sparkling Soda", Category: "TEA", Unit: "แก้ว", Price: "95.00"},
	{Code: "BEER-IPA-01", Barcode: "8859001003015", Name: "คราฟต์เบียร์ Hazy IPA สด (Pint 473ml)", NameEn: "Tropical Hazy IPA Draft Pint", Category: "BEER", Unit: "แก้ว", Price: "220.00"},
	{Code: "BEER-WZN-01", Barcode: "8859001003022", Name: "ไวเซ่นเบียร์สดข้าวสาลีเยอรมัน (Pint)", NameEn: "Bavarian Wheat Weizen Draft Pint", Category: "BEER", Unit: "แก้ว", Price: "190.00"},
	{Code: "BEER-PIL-01", Barcode: "8859001003039", Name: "พิลสเนอร์คราฟต์เบียร์สด (Pint)", NameEn: "Crisp Bohemian Pilsner Pint", Category: "BEER", Unit: "แก้ว", Price: "170.00"},
	{Code: "BEER-TWR-01", Barcode: "8859001003046", Name: "ทาวเวอร์เบียร์สดคราฟต์ 3 ลิตร", NameEn: "Craft Draft Beer Tower 3L", Category: "BEER", Unit: "ทาวเวอร์", Price: "890.00"},
	{Code: "CAFE-BAK-01", Barcode: "8859001004012", Name: "ครัวซองต์เนยสดฝรั่งเศส AOP", NameEn: "French AOP Butter Croissant", Category: "BAKERY", Unit: "ชิ้น", Price: "85.00"},
	{Code: "CAFE-BAK-02", Barcode: "8859001004029", Name: "ชีสเค้กหน้าไหม้บาสก์โฮมเมด", NameEn: "Basque Burnt Cheesecake", Category: "BAKERY", Unit: "ชิ้น", Price: "135.00"},
	{Code: "CAFE-BAK-03", Barcode: "8859001004036", Name: "เพนโอช็อกโกแลตดาร์ก 70%", NameEn: "Dark Chocolate Pain au Chocolat", Category: "BAKERY", Unit: "ชิ้น", Price: "95.00"},
	{Code: "BITE-SNK-01", Barcode: "8859001005019", Name: "เฟรนช์ฟรายส์ทรัฟเฟิลพาเมซานชีส", NameEn: "Truffle Parmesan Fries", Category: "BITES", Unit: "จาน", Price: "140.00"},
	{Code: "BITE-SNK-02", Barcode: "8859001005026", Name: "ปีกไก่ทอดน้ำปลาพริกแห้งกรอบ", NameEn: "Crispy Fish Sauce Chicken Wings", Category: "BITES", Unit: "จาน", Price: "165.00"},
	{Code: "BITE-SNK-03", Barcode: "8859001005033", Name: "ไส้กรอกเยอรมันรวมย่างเตาถ่าน", NameEn: "Grilled German Sausage Platter", Category: "BITES", Unit: "จาน", Price: "240.00"},
}

type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Database string
	SSLMode  string
}

func LoadDBConfigFromEnv() DBConfig {
	host := firstEnv("PG_HOST", "UAT_PG_HOST", "127.0.0.1")
	port := firstEnv("PG_PORT", "UAT_PG_PORT", "5432")
	user := firstEnv("PG_USER", "UAT_PG_USER", "postgres")
	pass := firstEnv("PG_PASSWORD", "UAT_PG_PASSWORD", "")
	dbName := firstEnv("PG_DATABASE", "", "domepos")
	// IRON RULE: Never connect to or modify smldemo! Always force domepos.
	if strings.EqualFold(dbName, "smldemo") || dbName == "" {
		dbName = "domepos"
	}
	sslMode := firstEnv("PG_SSLMODE", "", "disable")
	return DBConfig{
		Host:     host,
		Port:     port,
		User:     user,
		Password: pass,
		Database: dbName,
		SSLMode:  sslMode,
	}
}

func firstEnv(k1, k2, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k1)); v != "" {
		return v
	}
	if k2 != "" {
		if v := strings.TrimSpace(os.Getenv(k2)); v != "" {
			return v
		}
	}
	return fallback
}

func (c DBConfig) ConnString(dbName string) string {
	u := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(c.User, c.Password),
		Host:   fmt.Sprintf("%s:%s", c.Host, c.Port),
		Path:   "/" + dbName,
	}
	q := u.Query()
	q.Set("sslmode", c.SSLMode)
	u.RawQuery = q.Encode()
	return u.String()
}

type Store struct {
	Pool   *pgxpool.Pool
	DBName string
	D1     *cloudflare.D1Client
	R2     *cloudflare.R2Client
	Hub    *RealtimeHub

	mu sync.Mutex
}

// InitStore ensures database `domepos` exists, runs all DDL migrations, and seeds initial DOME Pos data.
func InitStore(ctx context.Context, cfg DBConfig) (*Store, error) {
	if strings.EqualFold(cfg.Database, "smldemo") || cfg.Database == "" {
		cfg.Database = "domepos"
	}

	// 1. Connect to maintenance DB `postgres` and auto-create `domepos` if missing.
	maintCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	adminConn, err := pgx.Connect(maintCtx, cfg.ConnString("postgres"))
	if err == nil {
		var exists bool
		_ = adminConn.QueryRow(maintCtx, `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)`, cfg.Database).Scan(&exists)
		if !exists {
			// Safe identifier: only alphanumeric and underscore allowed
			if isValidDBIdentifier(cfg.Database) {
				_, _ = adminConn.Exec(maintCtx, fmt.Sprintf(`CREATE DATABASE %s ENCODING 'UTF8'`, cfg.Database))
			}
		}
		_ = adminConn.Close(maintCtx)
	}

	// 2. Connect pool to `domepos`
	poolCfg, err := pgxpool.ParseConfig(cfg.ConnString(cfg.Database))
	if err != nil {
		return nil, fmt.Errorf("parse pool config: %w", err)
	}
	poolCfg.MaxConns = 12
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("connect pool %s: %w", cfg.Database, err)
	}

	s := &Store{
		Pool:   pool,
		DBName: cfg.Database,
		D1:     cloudflare.NewD1ClientFromEnv(),
		R2:     cloudflare.NewR2ClientFromEnv(),
		Hub:    NewRealtimeHub(),
	}
	s.StartRealtimeLoop(ctx)

	if err := s.MigrateAndSeed(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

func isValidDBIdentifier(name string) bool {
	if name == "" || len(name) > 48 {
		return false
	}
	for _, r := range name {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_') {
			return false
		}
	}
	return true
}

func (s *Store) Close() {
	if s.Pool != nil {
		s.Pool.Close()
	}
}

var schemaDDL = []string{
	`CREATE TABLE IF NOT EXISTS posconfig (
		roworder SERIAL PRIMARY KEY,
		pos_config_number VARCHAR(50) UNIQUE NOT NULL,
		shop_name VARCHAR(255) NOT NULL DEFAULT 'DOME Pos Cafe & Craft Beer',
		branch_name VARCHAR(255) NOT NULL DEFAULT 'สาขาหลัก (00000)',
		tax_id VARCHAR(30) NOT NULL DEFAULT '0105566000001',
		pos_terminal_no VARCHAR(50) NOT NULL DEFAULT 'POS-TERM-01',
		cust_code_default VARCHAR(50) NOT NULL DEFAULT 'WALKIN',
		is_member INT NOT NULL DEFAULT 1,
		member_discount NUMERIC(18,2) NOT NULL DEFAULT 5.00,
		max_pos_money NUMERIC(18,2) NOT NULL DEFAULT 50000.00,
		round_change_decimal INT NOT NULL DEFAULT 0,
		format_round INT NOT NULL DEFAULT 0,
		vat_type INT NOT NULL DEFAULT 1,
		vat_rate NUMERIC(18,2) NOT NULL DEFAULT 7.00,
		service_charge_rate NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		pos_header TEXT NOT NULL DEFAULT 'ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ (ABB)',
		pos_footer TEXT NOT NULL DEFAULT 'ขอบคุณที่แวะมาดื่มกาแฟและคราฟต์เบียร์ที่ DOME Pos',
		pos_bill_type INT NOT NULL DEFAULT 0,
		pos_change_price_config INT NOT NULL DEFAULT 1,
		pos_change_discount_config INT NOT NULL DEFAULT 1,
		pos_cancel_bill INT NOT NULL DEFAULT 1,
		show_tax_detail INT NOT NULL DEFAULT 1,
		barcode_picture INT NOT NULL DEFAULT 1,
		check_float_money INT NOT NULL DEFAULT 1,
		updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS pos_id (
		roworder SERIAL PRIMARY KEY,
		machinecode VARCHAR(50) UNIQUE NOT NULL,
		pos_id VARCHAR(50) NOT NULL DEFAULT 'POS-01',
		machine_name VARCHAR(150) NOT NULL DEFAULT 'เคาน์เตอร์หลัก (เจ้าของร้าน DOME Pos)',
		status INT NOT NULL DEFAULT 1,
		pos_config_number VARCHAR(50) NOT NULL DEFAULT 'POS-CFG-01',
		price_number INT NOT NULL DEFAULT 1,
		doc_format VARCHAR(50) NOT NULL DEFAULT 'ABB1-@YY@MM-#####',
		doc_format_vat_full VARCHAR(50) NOT NULL DEFAULT 'TAX1-@YY@MM-#####',
		doc_format_cancel VARCHAR(50) NOT NULL DEFAULT 'CNM1-@YY@MM-#####',
		doc_format_fillmoney VARCHAR(50) NOT NULL DEFAULT 'RCV1-@YY@MM-#####',
		doc_format_cashiersettle VARCHAR(50) NOT NULL DEFAULT 'SND1-@YY@MM-#####',
		pos_ic_wht VARCHAR(50) NOT NULL DEFAULT 'MMA01',
		pos_ic_shelf VARCHAR(50) NOT NULL DEFAULT 'SH-01',
		pos_type_invoice INT NOT NULL DEFAULT 0,
		pos_save_e_journal INT NOT NULL DEFAULT 1,
		slip_number VARCHAR(50) NOT NULL DEFAULT 'SLIP-80MM',
		doc_running_inv VARCHAR(50) NOT NULL DEFAULT 'ABB',
		doc_format_code VARCHAR(50) NOT NULL DEFAULT 'ABB',
		branch_code VARCHAR(50) NOT NULL DEFAULT '00000',
		department_code VARCHAR(50) NOT NULL DEFAULT 'CAFE',
		use_credit_sale INT NOT NULL DEFAULT 1,
		printer_name VARCHAR(120) NOT NULL DEFAULT 'EPSON TM-T82III (80mm Auto-Cut)',
		customer_display VARCHAR(120) NOT NULL DEFAULT 'จอแสดงราคาฝั่งลูกค้า + QR Display',
		cash_drawer_enabled INT NOT NULL DEFAULT 1
	)`,
	`CREATE TABLE IF NOT EXISTS erp_thai_qr_config (
		roworder SERIAL PRIMARY KEY,
		pos_id VARCHAR(50) UNIQUE NOT NULL DEFAULT 'ALL',
		promp_pay_telephone_number VARCHAR(30) NOT NULL DEFAULT '0812345678',
		promp_pay_wallet_id VARCHAR(30) NOT NULL DEFAULT '',
		merchant_name VARCHAR(150) NOT NULL DEFAULT 'DOME POS CAFE',
		company_biller_id VARCHAR(50) NOT NULL DEFAULT '',
		company_terminal_id VARCHAR(50) NOT NULL DEFAULT 'TERM-01',
		company_store_id VARCHAR(50) NOT NULL DEFAULT 'DOME-01',
		config_type INT NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS pos_point_condition (
		roworder SERIAL PRIMARY KEY,
		condition_code VARCHAR(50) UNIQUE NOT NULL DEFAULT 'POINT-STD',
		baht_per_point NUMERIC(18,2) NOT NULL DEFAULT 100.00,
		points_per_baht_redeem NUMERIC(18,2) NOT NULL DEFAULT 1.00,
		min_redeem_points NUMERIC(18,2) NOT NULL DEFAULT 10.00,
		birth_month_multiplier NUMERIC(18,2) NOT NULL DEFAULT 2.00,
		birth_day_multiplier NUMERIC(18,2) NOT NULL DEFAULT 3.00,
		birth_month_use INT NOT NULL DEFAULT 1,
		birth_day_use INT NOT NULL DEFAULT 1,
		vip_tier_silver_min NUMERIC(18,2) NOT NULL DEFAULT 500.00,
		vip_tier_gold_min NUMERIC(18,2) NOT NULL DEFAULT 2000.00,
		vip_tier_platinum_min NUMERIC(18,2) NOT NULL DEFAULT 5000.00
	)`,
	`CREATE TABLE IF NOT EXISTS pos_promotions (
		promo_code VARCHAR(50) PRIMARY KEY,
		promo_name VARCHAR(200) NOT NULL,
		promo_type VARCHAR(50) NOT NULL DEFAULT 'STEP_SPEND',
		promo_type_code INT NOT NULL DEFAULT 7,
		description TEXT NOT NULL DEFAULT '',
		target_barcode VARCHAR(64) NOT NULL DEFAULT '',
		min_qty NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		min_spend NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		discount_pct NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		discount_text VARCHAR(64) NOT NULL DEFAULT '',
		free_qty NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		unit_stand NUMERIC(18,2) NOT NULL DEFAULT 1.00,
		unit_divide NUMERIC(18,2) NOT NULL DEFAULT 1.00,
		strict_unit_ratio INT NOT NULL DEFAULT 1,
		allow_mix_match INT NOT NULL DEFAULT 1,
		auto_add_free_item INT NOT NULL DEFAULT 1,
		max_qty_per_bill NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		customer_only INT NOT NULL DEFAULT 0,
		date_begin VARCHAR(30) NOT NULL DEFAULT '2026-01-01',
		date_end VARCHAR(30) NOT NULL DEFAULT '2030-12-31',
		time_start VARCHAR(10) NOT NULL DEFAULT '00:00',
		time_end VARCHAR(10) NOT NULL DEFAULT '23:59',
		day_filter VARCHAR(50) NOT NULL DEFAULT 'ALL',
		items_include_json TEXT NOT NULL DEFAULT '{}',
		reward_item_code VARCHAR(64) NOT NULL DEFAULT '',
		reward_item_name VARCHAR(200) NOT NULL DEFAULT '',
		is_active INT NOT NULL DEFAULT 1
	)`,
	`CREATE TABLE IF NOT EXISTS coupon_list (
		roworder SERIAL PRIMARY KEY,
		number VARCHAR(64) UNIQUE NOT NULL,
		amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		balance_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		last_status INT NOT NULL DEFAULT 0,
		date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		date_expire TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '365 days'),
		remark VARCHAR(255) NOT NULL DEFAULT '',
		coupon_type INT NOT NULL DEFAULT 0,
		single_use INT NOT NULL DEFAULT 1,
		cust_code VARCHAR(50) NOT NULL DEFAULT '',
		coupon_group VARCHAR(50) NOT NULL DEFAULT 'DOME-PROMO'
	)`,
	`CREATE TABLE IF NOT EXISTS pos_member_groups (
		group_code VARCHAR(50) PRIMARY KEY,
		group_name VARCHAR(200) NOT NULL,
		group_type VARCHAR(50) NOT NULL DEFAULT 'CAFE_MEMBER',
		primary_member_code VARCHAR(50) NOT NULL DEFAULT 'WALKIN',
		tier_level VARCHAR(50) NOT NULL DEFAULT 'GOLD',
		discount_pct NUMERIC(18,2) NOT NULL DEFAULT 5.00,
		pool_points INT NOT NULL DEFAULT 1,
		shared_points NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		member_count INT NOT NULL DEFAULT 1
	)`,
	`CREATE TABLE IF NOT EXISTS pos_temp_members (
		telephone VARCHAR(50) PRIMARY KEY,
		temp_name VARCHAR(200) NOT NULL DEFAULT '',
		source_terminal_id VARCHAR(50) NOT NULL DEFAULT 'POS-01',
		bill_count INT NOT NULL DEFAULT 1,
		total_spend NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		pending_points NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
		target_member_code VARCHAR(50) NOT NULL DEFAULT '',
		target_group_id VARCHAR(50) NOT NULL DEFAULT '',
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS pos_period (
		roworder SERIAL PRIMARY KEY,
		period_guid VARCHAR(64) UNIQUE NOT NULL,
		machine_code VARCHAR(50) NOT NULL DEFAULT 'POS-01',
		begin_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		begin_time VARCHAR(20) NOT NULL DEFAULT '08:00',
		end_date TIMESTAMP,
		end_time VARCHAR(20) NOT NULL DEFAULT '',
		status INT NOT NULL DEFAULT 1,
		period_status INT NOT NULL DEFAULT 0,
		begin_user_code VARCHAR(50) NOT NULL DEFAULT 'OWNER-01',
		end_user_code VARCHAR(50) NOT NULL DEFAULT '',
		float_amount NUMERIC(18,2) NOT NULL DEFAULT 2000.00
	)`,
	`ALTER TABLE pos_period ADD COLUMN IF NOT EXISTS status INT NOT NULL DEFAULT 1`,
	`ALTER TABLE pos_period ADD COLUMN IF NOT EXISTS period_status INT NOT NULL DEFAULT 0`,
	`ALTER TABLE pos_period ADD COLUMN IF NOT EXISTS float_amount NUMERIC(18,2) NOT NULL DEFAULT 2000.00`,
	`CREATE TABLE IF NOT EXISTS poscashiersettle (
		roworder SERIAL PRIMARY KEY,
		docno VARCHAR(64) UNIQUE NOT NULL,
		docdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		doc_time VARCHAR(20) NOT NULL DEFAULT '',
		cashiercode VARCHAR(50) NOT NULL DEFAULT 'OWNER-01',
		machinecode VARCHAR(50) NOT NULL DEFAULT 'POS-01',
		pos_id VARCHAR(50) NOT NULL DEFAULT 'POS-01',
		cashamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		creditcardamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		coupongamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		chqamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		transferamount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		trans_type INT NOT NULL DEFAULT 1,
		remark VARCHAR(255) NOT NULL DEFAULT '',
		total_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_cancel NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_in NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_out NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		branch_code VARCHAR(50) NOT NULL DEFAULT '00000'
	)`,
	`CREATE TABLE IF NOT EXISTS pos_bill_inbox (
		bill_guid VARCHAR(64) PRIMARY KEY,
		machine_code VARCHAR(50) NOT NULL DEFAULT 'POS-01',
		doc_no VARCHAR(50) UNIQUE NOT NULL,
		payload JSONB NOT NULL DEFAULT '{}'::jsonb,
		received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
		status VARCHAR(30) NOT NULL DEFAULT 'PROCESSED',
		status_code SMALLINT NOT NULL DEFAULT 1,
		error TEXT NOT NULL DEFAULT '',
		processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
		earned_points NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		cancelled_at TIMESTAMPTZ,
		cancel_reason TEXT NOT NULL DEFAULT '',
		cancelled_by VARCHAR(100) NOT NULL DEFAULT ''
	)`,
	`ALTER TABLE pos_bill_inbox ALTER COLUMN bill_guid TYPE VARCHAR(64) USING bill_guid::text`,
	`ALTER TABLE pos_bill_inbox ALTER COLUMN status TYPE VARCHAR(30) USING status::text`,
	`ALTER TABLE pos_bill_inbox ADD COLUMN IF NOT EXISTS status_code SMALLINT NOT NULL DEFAULT 1`,
	`CREATE TABLE IF NOT EXISTS pos_sync_change (
		entity VARCHAR(20) NOT NULL,
		entity_key VARCHAR(100) NOT NULL,
		xid BIGINT NOT NULL DEFAULT 1,
		changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (entity, entity_key)
	)`,
	`CREATE TABLE IF NOT EXISTS pos_stock_queue (
		item_code VARCHAR(50) PRIMARY KEY,
		queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS ic_unit (
		roworder SERIAL PRIMARY KEY,
		code VARCHAR(50) UNIQUE NOT NULL,
		name_1 VARCHAR(150) NOT NULL DEFAULT ''
	)`,
	`CREATE TABLE IF NOT EXISTS ic_inventory (
		roworder SERIAL PRIMARY KEY,
		code VARCHAR(50) UNIQUE NOT NULL,
		name_1 VARCHAR(255) NOT NULL DEFAULT '',
		name_eng_1 VARCHAR(255) NOT NULL DEFAULT '',
		unit_standard VARCHAR(50) NOT NULL DEFAULT 'แก้ว',
		unit_cost VARCHAR(50) NOT NULL DEFAULT 'แก้ว',
		group_main VARCHAR(50) NOT NULL DEFAULT 'COFFEE',
		item_type INT NOT NULL DEFAULT 0,
		tax_type INT NOT NULL DEFAULT 0,
		unit_type INT NOT NULL DEFAULT 0,
		status INT NOT NULL DEFAULT 1,
		balance_qty NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		average_cost NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		image_url TEXT NOT NULL DEFAULT ''
	)`,
	`ALTER TABLE ic_inventory ADD COLUMN IF NOT EXISTS name_eng_1 VARCHAR(255) NOT NULL DEFAULT ''`,
	`ALTER TABLE ic_inventory ADD COLUMN IF NOT EXISTS group_main VARCHAR(50) NOT NULL DEFAULT 'COFFEE'`,
	`ALTER TABLE ic_inventory ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`,
	`CREATE TABLE IF NOT EXISTS ic_unit_use (
		roworder SERIAL PRIMARY KEY,
		ic_code VARCHAR(50) NOT NULL,
		code VARCHAR(50) NOT NULL,
		stand_value NUMERIC(18,2) NOT NULL DEFAULT 1.00,
		divide_value NUMERIC(18,2) NOT NULL DEFAULT 1.00,
		ratio NUMERIC(18,2) NOT NULL DEFAULT 1.00,
		row_order INT NOT NULL DEFAULT 1,
		status INT NOT NULL DEFAULT 1,
		UNIQUE(ic_code, code)
	)`,
	`CREATE TABLE IF NOT EXISTS ic_inventory_barcode (
		roworder SERIAL PRIMARY KEY,
		ic_code VARCHAR(50) NOT NULL,
		barcode VARCHAR(64) UNIQUE NOT NULL,
		description VARCHAR(255) NOT NULL DEFAULT '',
		unit_code VARCHAR(50) NOT NULL DEFAULT 'แก้ว',
		price NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		price_2 NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		price_member NUMERIC(18,2) NOT NULL DEFAULT 0.00
	)`,
	`CREATE TABLE IF NOT EXISTS ar_customer (
		roworder SERIAL PRIMARY KEY,
		code VARCHAR(50) UNIQUE NOT NULL,
		name_1 VARCHAR(255) NOT NULL DEFAULT '',
		telephone VARCHAR(50) NOT NULL DEFAULT '',
		tax_id VARCHAR(30) NOT NULL DEFAULT '',
		address TEXT NOT NULL DEFAULT '',
		point_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		ar_tier_code VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
		price_level INT NOT NULL DEFAULT 1,
		status INT NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS ic_trans (
		roworder SERIAL PRIMARY KEY,
		trans_type INT NOT NULL DEFAULT 2,
		trans_flag INT NOT NULL DEFAULT 44,
		doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
		doc_no VARCHAR(50) NOT NULL,
		doc_time VARCHAR(20) NOT NULL DEFAULT '',
		cust_code VARCHAR(50) NOT NULL DEFAULT 'WALKIN',
		branch_code VARCHAR(50) NOT NULL DEFAULT '00000',
		department_code VARCHAR(50) NOT NULL DEFAULT 'CAFE',
		inquiry_type INT NOT NULL DEFAULT 1,
		vat_type INT NOT NULL DEFAULT 1,
		vat_rate NUMERIC(18,2) NOT NULL DEFAULT 7.00,
		total_value NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_discount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_before_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_vat_value NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_after_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_except_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		total_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		is_pos INT NOT NULL DEFAULT 1,
		pos_id VARCHAR(50) NOT NULL DEFAULT 'POS-01',
		cashier_code VARCHAR(50) NOT NULL DEFAULT 'OWNER-01',
		payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH',
		sum_point NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		last_status INT NOT NULL DEFAULT 0,
		is_cancel INT NOT NULL DEFAULT 0,
		doc_ref VARCHAR(50) NOT NULL DEFAULT '',
		doc_ref_date DATE,
		remark TEXT NOT NULL DEFAULT '',
		UNIQUE(doc_no, trans_flag)
	)`,
	`CREATE TABLE IF NOT EXISTS ic_trans_detail (
		roworder SERIAL PRIMARY KEY,
		trans_type INT NOT NULL DEFAULT 2,
		trans_flag INT NOT NULL DEFAULT 44,
		doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
		doc_no VARCHAR(50) NOT NULL,
		doc_time VARCHAR(20) NOT NULL DEFAULT '',
		line_number INT NOT NULL DEFAULT 1,
		calc_flag INT NOT NULL DEFAULT -1,
		item_code VARCHAR(50) NOT NULL,
		item_name VARCHAR(255) NOT NULL DEFAULT '',
		barcode VARCHAR(64) NOT NULL DEFAULT '',
		unit_code VARCHAR(50) NOT NULL DEFAULT 'แก้ว',
		wh_code VARCHAR(50) NOT NULL DEFAULT 'MMA01',
		shelf_code VARCHAR(50) NOT NULL DEFAULT 'SH-01',
		qty NUMERIC(18,2) NOT NULL DEFAULT 1.00,
		stand_value NUMERIC(18,2) NOT NULL DEFAULT 1.00,
		divide_value NUMERIC(18,2) NOT NULL DEFAULT 1.00,
		price NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		price_exclude_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		discount VARCHAR(64) NOT NULL DEFAULT '0.00',
		discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		sum_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		sum_amount_exclude_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		vat_value NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		tax_type INT NOT NULL DEFAULT 0,
		vat_type INT NOT NULL DEFAULT 1,
		item_type INT NOT NULL DEFAULT 0,
		is_pos INT NOT NULL DEFAULT 1,
		last_status INT NOT NULL DEFAULT 0,
		is_cancel INT NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS cb_trans (
		roworder SERIAL PRIMARY KEY,
		trans_type INT NOT NULL DEFAULT 2,
		trans_flag INT NOT NULL DEFAULT 44,
		doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
		doc_no VARCHAR(50) NOT NULL,
		doc_time VARCHAR(20) NOT NULL DEFAULT '',
		ap_ar_code VARCHAR(50) NOT NULL DEFAULT 'WALKIN',
		pay_type INT NOT NULL DEFAULT 1,
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
		branch_code VARCHAR(50) NOT NULL DEFAULT '00000',
		cashier_code VARCHAR(50) NOT NULL DEFAULT 'OWNER-01',
		last_status INT NOT NULL DEFAULT 0,
		is_cancel INT NOT NULL DEFAULT 0,
		UNIQUE(doc_no, trans_flag)
	)`,
	`CREATE TABLE IF NOT EXISTS cb_trans_detail (
		roworder SERIAL PRIMARY KEY,
		trans_type INT NOT NULL DEFAULT 2,
		trans_flag INT NOT NULL DEFAULT 44,
		doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
		doc_no VARCHAR(50) NOT NULL,
		doc_time VARCHAR(20) NOT NULL DEFAULT '',
		line_number INT NOT NULL DEFAULT 1,
		doc_type INT NOT NULL DEFAULT 1,
		trans_number VARCHAR(50) NOT NULL DEFAULT '',
		amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		sum_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		ap_ar_code VARCHAR(50) NOT NULL DEFAULT 'WALKIN',
		last_status INT NOT NULL DEFAULT 0,
		is_cancel INT NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS gl_chart_of_account (
		roworder SERIAL PRIMARY KEY,
		code VARCHAR(50) UNIQUE NOT NULL,
		name_1 VARCHAR(255) NOT NULL DEFAULT '',
		account_type INT NOT NULL DEFAULT 1,
		account_level INT NOT NULL DEFAULT 1,
		status INT NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS gl_journal (
		roworder SERIAL PRIMARY KEY,
		doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
		doc_no VARCHAR(50) NOT NULL,
		book_code VARCHAR(50) NOT NULL DEFAULT 'POS',
		period_number INT NOT NULL DEFAULT 1,
		account_year INT NOT NULL DEFAULT 2026,
		description TEXT NOT NULL DEFAULT '',
		debit NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		credit NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		trans_flag INT NOT NULL DEFAULT 44,
		doc_format_code VARCHAR(50) NOT NULL DEFAULT 'ABB',
		branch_code VARCHAR(50) NOT NULL DEFAULT '00000',
		trans_direct INT NOT NULL DEFAULT 0,
		journal_type INT NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS gl_journal_detail (
		roworder SERIAL PRIMARY KEY,
		doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
		doc_no VARCHAR(50) NOT NULL,
		book_code VARCHAR(50) NOT NULL DEFAULT 'POS',
		line_number INT NOT NULL DEFAULT 1,
		account_code VARCHAR(50) NOT NULL,
		account_name VARCHAR(255) NOT NULL DEFAULT '',
		debit_or_credit INT NOT NULL DEFAULT 0,
		debit NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		credit NUMERIC(18,2) NOT NULL DEFAULT 0.00,
		trans_flag INT NOT NULL DEFAULT 44,
		journal_type INT NOT NULL DEFAULT 0,
		branch_code VARCHAR(50) NOT NULL DEFAULT '00000',
		period_number INT NOT NULL DEFAULT 1,
		account_year INT NOT NULL DEFAULT 2026
	)`,
	`CREATE TABLE IF NOT EXISTS images (
		roworder SERIAL PRIMARY KEY,
		image_id VARCHAR(128) NOT NULL,
		guid_code VARCHAR(64) NOT NULL DEFAULT '',
		image_order SMALLINT NOT NULL DEFAULT 0,
		image_url TEXT NOT NULL DEFAULT '',
		image_file BYTEA
	)`,
	`CREATE TABLE IF NOT EXISTS sml_doc_images (
		roworder SERIAL PRIMARY KEY,
		image_id VARCHAR(128) NOT NULL,
		guid_code VARCHAR(64) NOT NULL DEFAULT '',
		image_order SMALLINT NOT NULL DEFAULT 0,
		image_url TEXT NOT NULL DEFAULT '',
		image_file BYTEA,
		create_date_time_now TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
}

func (s *Store) MigrateAndSeed(ctx context.Context) error {
	for _, stmt := range schemaDDL {
		if _, err := s.Pool.Exec(ctx, stmt); err != nil {
			// Best effort for idempotent ALTER TABLE statements
			if strings.HasPrefix(strings.TrimSpace(stmt), "CREATE TABLE") {
				return fmt.Errorf("ddl failed: %w", err)
			}
		}
	}

	// Seed posconfig
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO posconfig (
			pos_config_number, shop_name, branch_name, tax_id, pos_terminal_no,
			cust_code_default, is_member, member_discount, max_pos_money,
			round_change_decimal, format_round, vat_type, vat_rate, service_charge_rate,
			pos_header, pos_footer, pos_bill_type, pos_change_price_config,
			pos_change_discount_config, pos_cancel_bill, show_tax_detail, barcode_picture, check_float_money
		) VALUES (
			'POS-CFG-01', 'DOME Pos Cafe & Craft Beer', 'สาขาหลัก (00000)', '0105566000001', 'POS-TERM-01',
			'WALKIN', 1, 5.00, 50000.00,
			0, 0, 1, 7.00, 0.00,
			'ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ (ABB)',
			'ขอบคุณที่แวะมาดื่มกาแฟและคราฟต์เบียร์ที่ DOME Pos',
			0, 1, 1, 1, 1, 1, 1
		) ON CONFLICT (pos_config_number) DO NOTHING`)

	// Seed pos_id
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO pos_id (
			machinecode, pos_id, machine_name, status, pos_config_number, price_number,
			doc_format, doc_format_vat_full, doc_format_cancel, doc_format_fillmoney, doc_format_cashiersettle,
			pos_ic_wht, pos_ic_shelf, pos_type_invoice, pos_save_e_journal, slip_number,
			doc_running_inv, doc_format_code, branch_code, department_code, use_credit_sale,
			printer_name, customer_display, cash_drawer_enabled
		) VALUES (
			'POS-01', 'POS-01', 'เคาน์เตอร์หลัก (เจ้าของร้าน DOME Pos)', 1, 'POS-CFG-01', 1,
			'ABB1-@YY@MM-#####', 'TAX1-@YY@MM-#####', 'CNM1-@YY@MM-#####', 'RCV1-@YY@MM-#####', 'SND1-@YY@MM-#####',
			'MMA01', 'SH-01', 0, 1, 'SLIP-80MM', 'ABB', 'ABB', '00000', 'CAFE', 1,
			'EPSON TM-T82III (80mm Auto-Cut)', 'จอแสดงราคาฝั่งลูกค้า + QR Display', 1
		) ON CONFLICT (machinecode) DO NOTHING`)

	// Seed erp_thai_qr_config
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO erp_thai_qr_config (
			pos_id, promp_pay_telephone_number, promp_pay_wallet_id, merchant_name,
			company_biller_id, company_terminal_id, company_store_id, config_type
		) VALUES (
			'ALL', '0812345678', '', 'DOME POS CAFE', '', 'TERM-01', 'DOME-01', 0
		) ON CONFLICT (pos_id) DO NOTHING`)

	// Seed pos_point_condition
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO pos_point_condition (
			condition_code, baht_per_point, points_per_baht_redeem, min_redeem_points,
			birth_month_multiplier, birth_day_multiplier, birth_month_use, birth_day_use,
			vip_tier_silver_min, vip_tier_gold_min, vip_tier_platinum_min
		) VALUES (
			'POINT-STD', 100.00, 1.00, 10.00, 2.00, 3.00, 1, 1, 500.00, 2000.00, 5000.00
		) ON CONFLICT (condition_code) DO NOTHING`)

	// Seed pos_promotions
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO pos_promotions (
			promo_code, promo_name, promo_type, promo_type_code, description, target_barcode,
			min_qty, min_spend, discount_amount, discount_pct, discount_text, free_qty, is_active
		) VALUES
		('PROMO-CAFE-01', 'คู่หูยามเช้า กาแฟสด + ครัวซองต์ ลดทันที 15 บาท', 'BUNDLE_QTY', 2, 'สั่งกาแฟสดคู่ครัวซองต์ ลด 15 บาท', '8859001001011', 2, 150.00, 15.00, 0.00, '15', 0, 1),
		('PROMO-BEER-01', 'Happy Hour คราฟต์เบียร์ครบ 500 บาท ลด 50 บาท', 'STEP_SPEND', 7, 'สั่งคราฟต์เบียร์ครบ 500 บาท ลดทันที 50 บาท', '8859001003015', 1, 500.00, 50.00, 0.00, '50', 0, 1)
		ON CONFLICT (promo_code) DO NOTHING`)

	// Seed coupon_list
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO coupon_list (number, amount, balance_amount, last_status, remark, coupon_type, single_use, coupon_group)
		VALUES
		('DOME-50', 50.00, 50.00, 0, 'คูปองส่วนลดร้านกาแฟ DOME Pos 50 บาท', 0, 1, 'DOME-PROMO'),
		('WELCOME-20', 20.00, 20.00, 0, 'คูปองต้อนรับลูกค้าใหม่ 20 บาท', 0, 0, 'DOME-PROMO')
		ON CONFLICT (number) DO NOTHING`)

	// Seed pos_member_groups
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO pos_member_groups (group_code, group_name, group_type, primary_member_code, tier_level, discount_pct, pool_points, shared_points, member_count)
		VALUES ('GRP-CAFE-VIP', 'สมาชิก DOME Pos Coffee & Craft Club', 'CAFE_MEMBER', 'WALKIN', 'GOLD', 5.00, 1, 100.00, 1)
		ON CONFLICT (group_code) DO NOTHING`)

	// Seed ar_customer
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO ar_customer (code, name_1, telephone, ar_tier_code, point_balance, status)
		VALUES
		('WALKIN', 'ลูกค้าหน้าร้าน (Walk-in)', '0812345678', 'MEMBER', 10.00, 0),
		('CASH', 'ลูกค้าเงินสด (Walk-in POS)', '', 'MEMBER', 0.00, 0),
		('AR0001', 'ลูกค้าทั่วไป (Walk-in POS)', '', 'MEMBER', 0.00, 0)
		ON CONFLICT (code) DO NOTHING`)

	// Seed gl_chart_of_account
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO gl_chart_of_account (code, name_1, account_type, account_level, status)
		VALUES
		('11110', 'เงินสด', 1, 1, 0),
		('11120', 'เงินฝากธนาคาร', 1, 1, 0),
		('21340', 'ภาษีขาย', 2, 1, 0),
		('41100', 'รายได้จากการขาย', 4, 1, 0)
		ON CONFLICT (code) DO NOTHING`)

	// Seed initial coffee/beer/bakery menu items
	for _, it := range DefaultCafeCatalog {
		imgURL := fmt.Sprintf("/api/pos/image?e=product&k=%s&v=1", url.QueryEscape(it.Code))
		_, _ = s.Pool.Exec(ctx, `INSERT INTO ic_unit (code, name_1) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING`, it.Unit)
		_, _ = s.Pool.Exec(ctx, `
			INSERT INTO ic_inventory (code, name_1, name_eng_1, unit_standard, unit_cost, group_main, item_type, tax_type, status, image_url)
			VALUES ($1, $2, $3, $4, $4, $5, 0, 0, 1, $6)
			ON CONFLICT (code) DO NOTHING`,
			it.Code, it.Name, it.NameEn, it.Unit, it.Category, imgURL)
		_, _ = s.Pool.Exec(ctx, `
			INSERT INTO ic_unit_use (ic_code, code, stand_value, divide_value, ratio, row_order, status)
			VALUES ($1, $2, 1.00, 1.00, 1.00, 1, 1)
			ON CONFLICT (ic_code, code) DO NOTHING`, it.Code, it.Unit)
		_, _ = s.Pool.Exec(ctx, `
			INSERT INTO ic_inventory_barcode (ic_code, barcode, description, unit_code, price, price_2, price_member)
			VALUES ($1, $2, $3, $4, $5::numeric, $5::numeric, $5::numeric)
			ON CONFLICT (barcode) DO NOTHING`,
			it.Code, it.Barcode, it.Name, it.Unit, it.Price)
		_, _ = s.Pool.Exec(ctx, `
			INSERT INTO pos_sync_change (entity, entity_key, xid)
			VALUES ('product', $1, 1)
			ON CONFLICT (entity, entity_key) DO NOTHING`, it.Code)
	}

	// Ensure initial open shift exists for solo-owner mode
	var shiftCount int
	_ = s.Pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM pos_period WHERE status = 1`).Scan(&shiftCount)
	if shiftCount == 0 {
		today := time.Now().Format("2006-01-02")
		_, _ = s.Pool.Exec(ctx, `
			INSERT INTO pos_period (period_guid, machine_code, begin_date, begin_time, status, period_status, begin_user_code, float_amount)
			VALUES ('SHIFT-POS-01-INIT', 'POS-01', $1::timestamp, '08:00', 1, 0, 'OWNER-01', 2000.00)
			ON CONFLICT (period_guid) DO NOTHING`, today)
		_, _ = s.Pool.Exec(ctx, `
			INSERT INTO poscashiersettle (
				docno, docdate, doc_time, cashiercode, machinecode, pos_id,
				cashamount, trans_type, remark, total_amount, total_balance, total_in, branch_code
			) VALUES (
				'RCV-INIT-0001', $1::timestamp, '08:00', 'OWNER-01', 'POS-01', 'POS-01',
				2000.00, 1, 'เงินทอนเริ่มต้นเปิดร้าน DOME Pos', 2000.00, 2000.00, 2000.00, '00000'
			) ON CONFLICT (docno) DO NOTHING`, today)
	}

	return nil
}

// PosBillLineInput represents a single item line in POST /api/v1/pos/bills.
type PosBillLineInput struct {
	ItemCode string    `json:"item_code"`
	Code     string    `json:"code"`
	Barcode  string    `json:"barcode"`
	Name     string    `json:"name"`
	ItemName string    `json:"item_name"`
	UnitCode string    `json:"unit_code"`
	Unit     string    `json:"unit"`
	Category string    `json:"category"`
	Qty      money.Dec `json:"qty"`
	Price    money.Dec `json:"price"`
	Discount money.Dec `json:"discount"`
}

// PosPaymentInput represents a single tender line in POST /api/v1/pos/bills.
type PosPaymentInput struct {
	Method string    `json:"method"`
	Amount money.Dec `json:"amount"`
}

// PosBillRequest is the payload sent to POST /api/v1/pos/bills.
type PosBillRequest struct {
	BillGUID       string             `json:"bill_guid"`
	DocNo          string             `json:"doc_no"`
	DocDate        string             `json:"doc_date"`
	DocTime        string             `json:"doc_time"`
	PosID          string             `json:"pos_id"`
	MachineCode    string             `json:"machine_code"`
	CashierCode    string             `json:"cashier_code"`
	CustCode       string             `json:"cust_code"`
	BillDiscount   money.Dec          `json:"bill_discount"`
	CouponCode     string             `json:"coupon_code"`
	CouponAmount   money.Dec          `json:"coupon_amount"`
	PointsRedeemed money.Dec          `json:"points_redeemed"`
	Remark         string             `json:"remark"`
	Lines          []PosBillLineInput `json:"lines"`
	Items          []PosBillLineInput `json:"items"`
	Details        []PosBillLineInput `json:"details"`
	Payments       []PosPaymentInput  `json:"payments"`
}

type PosBillResponse struct {
	OK             bool           `json:"ok"`
	Status         string         `json:"status"`
	BillGUID       string         `json:"bill_guid"`
	DocNo          string         `json:"doc_no"`
	TotalBeforeVat string         `json:"total_before_vat"`
	TotalVatValue  string         `json:"total_vat_value"`
	TotalAmount    string         `json:"total_amount"`
	MoneyChange    string         `json:"money_change"`
	PointsEarned   int64          `json:"points_earned"`
	EarnedPoints   string         `json:"earned_points"`
	Duplicate      bool           `json:"duplicate"`
	WalletSync     map[string]any `json:"wallet_sync,omitempty"`
	Data           map[string]any `json:"data"`
}

// ProcessBill saves a POS sale idempotently by bill_guid, auto-inserts unknown items,
// computes totals and VAT 7% using *big.Rat, and posts balanced GL entries (Dr == Cr).
func (s *Store) ProcessBill(ctx context.Context, rawBody []byte) (PosBillResponse, error) {
	var req PosBillRequest
	if err := json.Unmarshal(rawBody, &req); err != nil {
		return PosBillResponse{}, fmt.Errorf("ข้อมูลบิลไม่ถูกต้อง: %w", err)
	}
	if len(req.Lines) == 0 && len(req.Items) > 0 {
		req.Lines = req.Items
	}
	if len(req.Lines) == 0 && len(req.Details) > 0 {
		req.Lines = req.Details
	}
	for i := range req.Lines {
		if req.Lines[i].Name == "" && req.Lines[i].ItemName != "" {
			req.Lines[i].Name = req.Lines[i].ItemName
		}
	}
	now := time.Now()
	docNo := strings.TrimSpace(req.DocNo)
	if docNo == "" {
		docNo = fmt.Sprintf("DOME-%s-%04d", now.Format("060102"), now.UnixNano()%10000)
	}
	if len(docNo) > 25 {
		docNo = docNo[:25]
	}
	billGUID := strings.TrimSpace(req.BillGUID)
	if billGUID == "" {
		billGUID = "GUID-" + docNo
	}
	docDate := strings.TrimSpace(req.DocDate)
	if docDate == "" {
		docDate = now.Format("2006-01-02")
	}
	docTime := strings.TrimSpace(req.DocTime)
	if docTime == "" {
		docTime = now.Format("15:04")
	}
	posID := firstNonEmptyStr(req.PosID, req.MachineCode, "POS-01")
	cashier := firstNonEmptyStr(req.CashierCode, "OWNER-01")
	custCode := firstNonEmptyStr(req.CustCode, "WALKIN")
	if len(req.Lines) == 0 {
		return PosBillResponse{}, errors.New("บิลต้องมีรายการสินค้าอย่างน้อย 1 รายการ")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Check idempotency in pos_bill_inbox by bill_guid
	var existingDocNo, existingStatus, existingPts string
	err := s.Pool.QueryRow(ctx, `
		SELECT doc_no, status, COALESCE(earned_points, 0)::text
		FROM pos_bill_inbox WHERE bill_guid = $1`, billGUID).Scan(&existingDocNo, &existingStatus, &existingPts)
	if err == nil {
		var existingTot, existingBefVat, existingVat string
		_ = s.Pool.QueryRow(ctx, `
			SELECT COALESCE(total_amount, 0)::text, COALESCE(total_before_vat, 0)::text, COALESCE(total_vat_value, 0)::text
			FROM ic_trans WHERE doc_no = $1 AND trans_flag = 44`, existingDocNo).Scan(&existingTot, &existingBefVat, &existingVat)
		ptsInt := money.CalcPointsEarned(existingTot, "100.00")
		ptsStr := fmt.Sprintf("%d", ptsInt)
		ws := map[string]any{
			"wallet_points_minted": ptsStr,
			"pointsMinted":         ptsStr,
		}
		dataStatus := "done"
		if strings.EqualFold(existingStatus, "CANCELLED") {
			dataStatus = "cancelled"
		}
		return PosBillResponse{
			OK:             true,
			Status:         existingStatus,
			BillGUID:       billGUID,
			DocNo:          existingDocNo,
			TotalBeforeVat: existingBefVat,
			TotalVatValue:  existingVat,
			TotalAmount:    existingTot,
			MoneyChange:    "0.00",
			PointsEarned:   ptsInt,
			EarnedPoints:   ptsStr,
			Duplicate:      true,
			WalletSync:     ws,
			Data: map[string]any{
				"bill_guid":         billGUID,
				"doc_no":            existingDocNo,
				"status":            dataStatus,
				"status_code":       existingStatus,
				"total_before_vat":  existingBefVat,
				"total_vat_value":   existingVat,
				"total_amount":      existingTot,
				"points_earned":     ptsInt,
				"earned_points":     ptsStr,
				"duplicate":         true,
				"wallet_sync":       ws,
			},
		}, nil
	}

	// Prepare line inputs for *big.Rat calculation
	calcLines := make([]money.LineCalcInput, len(req.Lines))
	for i, l := range req.Lines {
		qRat := l.Qty.Rat()
		if qRat.Sign() <= 0 {
			qRat = money.ParseRat("1")
		}
		calcLines[i] = money.LineCalcInput{
			Qty:      qRat,
			Price:    l.Price.Rat(),
			Discount: l.Discount.Rat(),
		}
	}

	var vatType int = 1
	var vatRateStr string = "7.00"
	var bahtPerPointStr string = "100.00"
	_ = s.Pool.QueryRow(ctx, `SELECT COALESCE(vat_type, 1), COALESCE(vat_rate, 7.00)::text FROM posconfig ORDER BY roworder LIMIT 1`).Scan(&vatType, &vatRateStr)
	_ = s.Pool.QueryRow(ctx, `SELECT COALESCE(baht_per_point, 100.00)::text FROM pos_point_condition ORDER BY roworder LIMIT 1`).Scan(&bahtPerPointStr)

	billDiscRat := req.BillDiscount.Rat()
	if req.CouponAmount.Rat().Sign() > 0 {
		billDiscRat.Add(billDiscRat, req.CouponAmount.Rat())
	}

	totals := money.CalcBillTotals(calcLines, billDiscRat, vatType, money.ParseRat(vatRateStr))

	payInputs := make([]money.PaymentInput, len(req.Payments))
	for i, p := range req.Payments {
		payInputs[i] = money.PaymentInput{
			Method: p.Method,
			Amount: p.Amount.Rat(),
		}
	}
	payBreakdown, err := money.CalcPaymentBreakdown(money.ParseRat(totals.TotalAmount), payInputs)
	if err != nil {
		return PosBillResponse{}, err
	}

	glLines, glTotal, err := money.BuildPosSaleGLLines(totals, payBreakdown)
	if err != nil {
		return PosBillResponse{}, err
	}

	// Points earned (every 100 baht = 1 point for Wallet, and pos_point_condition)
	pointsEarned := money.CalcPointsEarned(totals.TotalAmount, "100.00")
	pointsStr := fmt.Sprintf("%d", pointsEarned)

	// Normalize payload JSON for pos_bill_inbox
	req.BillGUID = billGUID
	req.DocNo = docNo
	req.DocDate = docDate
	req.DocTime = docTime
	req.PosID = posID
	req.CashierCode = cashier
	req.CustCode = custCode
	normPayload, _ := json.Marshal(req)

	err = pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		// Ensure customer exists
		_, _ = tx.Exec(ctx, `
			INSERT INTO ar_customer (code, name_1, status)
			VALUES ($1, $1, 0) ON CONFLICT (code) DO NOTHING`, custCode)

		// Auto-insert missing items into ic_inventory, ic_unit, ic_unit_use, ic_inventory_barcode
		for i, l := range req.Lines {
			code := firstNonEmptyStr(l.ItemCode, l.Code, fmt.Sprintf("ITEM-%02d", i+1))
			unit := firstNonEmptyStr(l.UnitCode, l.Unit, "แก้ว")
			name := firstNonEmptyStr(l.Name, code)
			barcode := firstNonEmptyStr(l.Barcode, code)
			cat := firstNonEmptyStr(l.Category, inferCategoryFromCode(code))
			priceStr := totals.Lines[i].Price

			if _, err := tx.Exec(ctx, `INSERT INTO ic_unit (code, name_1) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING`, unit); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO ic_inventory (code, name_1, unit_standard, unit_cost, group_main, item_type, tax_type, status)
				VALUES ($1, $2, $3, $3, $4, 0, 0, 1)
				ON CONFLICT (code) DO NOTHING`, code, name, unit, cat); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO ic_unit_use (ic_code, code, stand_value, divide_value, ratio, row_order, status)
				VALUES ($1, $2, 1.00, 1.00, 1.00, 1, 1)
				ON CONFLICT (ic_code, code) DO NOTHING`, code, unit); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO ic_inventory_barcode (ic_code, barcode, description, unit_code, price, price_2, price_member)
				VALUES ($1, $2, $3, $4, $5::numeric, $5::numeric, $5::numeric)
				ON CONFLICT (barcode) DO NOTHING`, code, barcode, name, unit, priceStr); err != nil {
				return err
			}
			_, _ = tx.Exec(ctx, `INSERT INTO pos_stock_queue (item_code) VALUES ($1) ON CONFLICT (item_code) DO UPDATE SET queued_at = CURRENT_TIMESTAMP`, code)
		}

		// 1. Insert pos_bill_inbox (status='PROCESSED', status_code=1)
		if _, err := tx.Exec(ctx, `
			INSERT INTO pos_bill_inbox (
				bill_guid, machine_code, doc_no, payload, status, status_code, processed_at, earned_points
			) VALUES ($1, $2, $3, $4::jsonb, 'PROCESSED', 1, CURRENT_TIMESTAMP, $5::numeric)
			ON CONFLICT (bill_guid) DO UPDATE SET
				status = 'PROCESSED',
				status_code = 1,
				processed_at = CURRENT_TIMESTAMP,
				earned_points = EXCLUDED.earned_points`,
			billGUID, posID, docNo, string(normPayload), pointsStr); err != nil {
			return err
		}

		// 2. Insert ic_trans (trans_flag = 44)
		_, _ = tx.Exec(ctx, `DELETE FROM ic_trans_detail WHERE doc_no = $1 AND trans_flag = 44`, docNo)
		_, _ = tx.Exec(ctx, `DELETE FROM ic_trans WHERE doc_no = $1 AND trans_flag = 44`, docNo)
		if _, err := tx.Exec(ctx, `
			INSERT INTO ic_trans (
				trans_type, trans_flag, doc_date, doc_no, doc_time, cust_code, branch_code, department_code,
				inquiry_type, vat_type, vat_rate, total_value, total_discount, total_before_vat,
				total_vat_value, total_after_vat, total_except_vat, total_amount,
				is_pos, pos_id, cashier_code, payment_method, sum_point, last_status, is_cancel, remark
			) VALUES (
				2, 44, $1::date, $2, $3, $4, '00000', 'CAFE',
				1, $5, $6::numeric, $7::numeric, $8::numeric, $9::numeric,
				$10::numeric, $11::numeric, 0.00, $12::numeric,
				1, $13, $14, $15, $16::numeric, 0, 0, $17
			)`,
			docDate, docNo, docTime, custCode,
			vatType, vatRateStr, totals.TotalValue, totals.TotalDiscount, totals.TotalBeforeVat,
			totals.TotalVatValue, totals.TotalAfterVat, totals.TotalAmount,
			posID, cashier, payBreakdown.PrimaryMethod, pointsStr, strings.TrimSpace(req.Remark)); err != nil {
			return err
		}

		// 3. Insert ic_trans_detail
		for i, l := range req.Lines {
			code := firstNonEmptyStr(l.ItemCode, l.Code, fmt.Sprintf("ITEM-%02d", i+1))
			unit := firstNonEmptyStr(l.UnitCode, l.Unit, "แก้ว")
			name := firstNonEmptyStr(l.Name, code)
			barcode := firstNonEmptyStr(l.Barcode, code)
			lc := totals.Lines[i]
			if _, err := tx.Exec(ctx, `
				INSERT INTO ic_trans_detail (
					trans_type, trans_flag, doc_date, doc_no, doc_time, line_number, calc_flag,
					item_code, item_name, barcode, unit_code, wh_code, shelf_code,
					qty, stand_value, divide_value, price, price_exclude_vat,
					discount, discount_amount, sum_amount, sum_amount_exclude_vat, vat_value,
					tax_type, vat_type, item_type, is_pos, last_status, is_cancel
				) VALUES (
					2, 44, $1::date, $2, $3, $4, -1,
					$5, $6, $7, $8, 'MMA01', 'SH-01',
					$9::numeric, 1.00, 1.00, $10::numeric, $11::numeric,
					$12, $13::numeric, $14::numeric, $15::numeric, $16::numeric,
					0, $17, 0, 1, 0, 0
				)`,
				docDate, docNo, docTime, i+1,
				code, name, barcode, unit,
				lc.Qty, lc.Price, lc.PriceExcludeVat,
				lc.DiscountAmount, lc.DiscountAmount, lc.SumAmount, lc.SumAmountExclVat, lc.VatValue,
				vatType); err != nil {
				return err
			}
		}

		// 4. Insert cb_trans & cb_trans_detail
		_, _ = tx.Exec(ctx, `DELETE FROM cb_trans_detail WHERE doc_no = $1 AND trans_flag = 44`, docNo)
		_, _ = tx.Exec(ctx, `DELETE FROM cb_trans WHERE doc_no = $1 AND trans_flag = 44`, docNo)
		if _, err := tx.Exec(ctx, `
			INSERT INTO cb_trans (
				trans_type, trans_flag, doc_date, doc_no, doc_time, ap_ar_code, pay_type,
				total_amount, total_net_amount, cash_amount, pay_cash_amount, money_change,
				tranfer_amount, card_amount, wallet_amount, coupon_amount, point_qty, point_amount,
				branch_code, cashier_code, last_status, is_cancel
			) VALUES (
				2, 44, $1::date, $2, $3, $4, 1,
				$5::numeric, $5::numeric, $6::numeric, $7::numeric, $8::numeric,
				$9::numeric, $10::numeric, $11::numeric, $12::numeric, $13::numeric, 0.00,
				'00000', $14, 0, 0
			)`,
			docDate, docNo, docTime, custCode,
			totals.TotalAmount, payBreakdown.NetCash, payBreakdown.PayCash, payBreakdown.MoneyChange,
			payBreakdown.NetTransfer, payBreakdown.NetCard, payBreakdown.NetWallet,
			req.CouponAmount.String(), req.PointsRedeemed.String(), cashier); err != nil {
			return err
		}

		cbLineNo := 0
		for _, d := range []struct {
			docType int
			amt     string
		}{
			{1, payBreakdown.NetTransfer},
			{3, payBreakdown.NetCard},
			{21, payBreakdown.NetWallet},
		} {
			if money.ParseRat(d.amt).Sign() <= 0 {
				continue
			}
			cbLineNo++
			if _, err := tx.Exec(ctx, `
				INSERT INTO cb_trans_detail (
					trans_type, trans_flag, doc_date, doc_no, doc_time, line_number,
					doc_type, amount, sum_amount, ap_ar_code, last_status, is_cancel
				) VALUES (2, 44, $1::date, $2, $3, $4, $5, $6::numeric, $6::numeric, $7, 0, 0)`,
				docDate, docNo, docTime, cbLineNo, d.docType, d.amt, custCode); err != nil {
				return err
			}
		}

		// 5. Post balanced double-entry GL journal (gl_journal & gl_journal_detail)
		_, _ = tx.Exec(ctx, `DELETE FROM gl_journal_detail WHERE doc_no = $1 AND trans_flag = 44`, docNo)
		_, _ = tx.Exec(ctx, `DELETE FROM gl_journal WHERE doc_no = $1 AND trans_flag = 44`, docNo)
		glDesc := fmt.Sprintf("ขายหน้าร้าน DOME Pos เลขที่ %s (%s)", docNo, payBreakdown.PrimaryMethod)
		if _, err := tx.Exec(ctx, `
			INSERT INTO gl_journal (
				doc_date, doc_no, book_code, period_number, account_year,
				description, debit, credit, trans_flag, doc_format_code, branch_code, trans_direct
			) VALUES ($1::date, $2, 'POS', EXTRACT(MONTH FROM $1::date)::int, EXTRACT(YEAR FROM $1::date)::int, $3, $4::numeric, $4::numeric, 44, 'ABB', '00000', 0)`,
			docDate, docNo, glDesc, glTotal); err != nil {
			return err
		}

		for idx, gl := range glLines {
			if _, err := tx.Exec(ctx, `
				INSERT INTO gl_journal_detail (
					doc_date, doc_no, book_code, line_number,
					account_code, account_name, debit_or_credit, debit, credit,
					trans_flag, journal_type, branch_code, period_number, account_year
				) VALUES (
					$1::date, $2, 'POS', $3,
					$4, $5, $6, $7::numeric, $8::numeric,
					44, 0, '00000', EXTRACT(MONTH FROM $1::date)::int, EXTRACT(YEAR FROM $1::date)::int
				)`,
				docDate, docNo, idx+1,
				gl.AccountCode, gl.AccountName, gl.DebitOrCredit, gl.Debit, gl.Credit); err != nil {
				return err
			}
		}

		// 6. Update customer point balance
		_, _ = tx.Exec(ctx, `
			UPDATE ar_customer SET point_balance = COALESCE(point_balance, 0) + $2::numeric
			WHERE code = $1`, custCode, pointsStr)

		return nil
	})
	if err != nil {
		return PosBillResponse{}, err
	}

	// Best-effort mirror to Cloudflare D1 when configured
	if s.D1 != nil && s.D1.IsConfigured() {
		_, _ = s.D1.Query(ctx, `INSERT OR REPLACE INTO pos_bill_inbox (bill_guid, machine_code, doc_no, payload, status, status_code, earned_points) VALUES (?, ?, ?, ?, 'PROCESSED', 1, ?)`,
			billGUID, posID, docNo, string(normPayload), pointsStr)
	}

	ws := map[string]any{
		"wallet_points_minted": pointsStr,
		"pointsMinted":         pointsStr,
	}

	return PosBillResponse{
		OK:             true,
		Status:         "PROCESSED",
		BillGUID:       billGUID,
		DocNo:          docNo,
		TotalBeforeVat: totals.TotalBeforeVat,
		TotalVatValue:  totals.TotalVatValue,
		TotalAmount:    totals.TotalAmount,
		MoneyChange:    payBreakdown.MoneyChange,
		PointsEarned:   pointsEarned,
		EarnedPoints:   pointsStr,
		Duplicate:      false,
		WalletSync:     ws,
		Data: map[string]any{
			"bill_guid":         billGUID,
			"doc_no":            docNo,
			"status":            "done",
			"status_code":       "PROCESSED",
			"total_before_vat":  totals.TotalBeforeVat,
			"total_vat_value":   totals.TotalVatValue,
			"total_amount":      totals.TotalAmount,
			"money_change":      payBreakdown.MoneyChange,
			"points_earned":     pointsEarned,
			"earned_points":     pointsStr,
			"duplicate":         false,
			"wallet_sync":       ws,
		},
	}, nil
}

// CancelBill marks the original bill as cancelled (is_cancel=1, last_status=1),
// creates a reversal trans_flag=45 row, posts reversed GL journal lines, and updates pos_bill_inbox status='CANCELLED'.
func (s *Store) CancelBill(ctx context.Context, docNo, reason, cancelledBy string) (map[string]any, error) {
	docNo = strings.TrimSpace(docNo)
	if docNo == "" {
		return nil, errors.New("กรุณาระบุเลขที่บิลที่ต้องการยกเลิก")
	}
	if reason == "" {
		reason = "ยกเลิกบิลขาย POS"
	}
	if cancelledBy == "" {
		cancelledBy = "OWNER-01"
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cancelDocNo := "CNM-" + docNo
	if len(cancelDocNo) > 25 {
		cancelDocNo = cancelDocNo[:25]
	}

	var billGUID string
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		_ = tx.QueryRow(ctx, `
			UPDATE pos_bill_inbox
			SET status = 'CANCELLED', status_code = 9, cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP), cancel_reason = $2, cancelled_by = $3
			WHERE doc_no = $1 RETURNING bill_guid`, docNo, reason, cancelledBy).Scan(&billGUID)

		tag, err := tx.Exec(ctx, `UPDATE ic_trans SET is_cancel = 1, last_status = 1 WHERE doc_no = $1 AND trans_flag = 44`, docNo)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 && billGUID == "" {
			return fmt.Errorf("ไม่พบบิลเลขที่ %s", docNo)
		}

		_, _ = tx.Exec(ctx, `UPDATE ic_trans_detail SET is_cancel = 1, last_status = 1 WHERE doc_no = $1 AND trans_flag = 44`, docNo)
		_, _ = tx.Exec(ctx, `UPDATE cb_trans SET is_cancel = 1, last_status = 1 WHERE doc_no = $1 AND trans_flag = 44`, docNo)
		_, _ = tx.Exec(ctx, `UPDATE cb_trans_detail SET is_cancel = 1, last_status = 1 WHERE doc_no = $1 AND trans_flag = 44`, docNo)

		// Create trans_flag = 45 cancel document
		_, _ = tx.Exec(ctx, `DELETE FROM ic_trans WHERE trans_flag = 45 AND (doc_ref = $1 OR doc_no = $2)`, docNo, cancelDocNo)
		if _, err := tx.Exec(ctx, `
			INSERT INTO ic_trans (
				trans_type, trans_flag, doc_date, doc_no, doc_time, cust_code, branch_code, department_code,
				inquiry_type, vat_type, vat_rate, total_value, total_discount, total_before_vat,
				total_vat_value, total_after_vat, total_except_vat, total_amount,
				is_pos, pos_id, cashier_code, payment_method, last_status, is_cancel, doc_ref, doc_ref_date, remark
			)
			SELECT
				2, 45, doc_date, $2, doc_time, cust_code, branch_code, department_code,
				inquiry_type, vat_type, vat_rate, total_value, total_discount, total_before_vat,
				total_vat_value, total_after_vat, total_except_vat, total_amount,
				1, pos_id, cashier_code, payment_method, 0, 0, doc_no, doc_date, $3
			FROM ic_trans
			WHERE doc_no = $1 AND trans_flag = 44`, docNo, cancelDocNo, reason); err != nil {
			return err
		}

		// Read original GL lines and create reversed GL journal under cancelDocNo (trans_flag = 45)
		rows, err := tx.Query(ctx, `
			SELECT account_code, account_name, debit_or_credit, debit::text, credit::text
			FROM gl_journal_detail WHERE doc_no = $1 AND trans_flag = 44 ORDER BY line_number`, docNo)
		if err != nil {
			return err
		}
		var origGL []money.GLLine
		for rows.Next() {
			var g money.GLLine
			if err := rows.Scan(&g.AccountCode, &g.AccountName, &g.DebitOrCredit, &g.Debit, &g.Credit); err != nil {
				rows.Close()
				return err
			}
			origGL = append(origGL, g)
		}
		rows.Close()

		if len(origGL) > 0 {
			revGL, revTotal, err := money.ReverseGLLines(origGL)
			if err != nil {
				return err
			}
			_, _ = tx.Exec(ctx, `DELETE FROM gl_journal_detail WHERE doc_no = $1 AND trans_flag = 45`, cancelDocNo)
			_, _ = tx.Exec(ctx, `DELETE FROM gl_journal WHERE doc_no = $1 AND trans_flag = 45`, cancelDocNo)
			if _, err := tx.Exec(ctx, `
				INSERT INTO gl_journal (
					doc_date, doc_no, book_code, period_number, account_year,
					description, debit, credit, trans_flag, doc_format_code, branch_code, trans_direct
				) VALUES (CURRENT_DATE, $1, 'POS', EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int, $2, $3::numeric, $3::numeric, 45, 'CNM', '00000', 0)`,
				cancelDocNo, "กลับรายการยกเลิกบิลขาย POS "+docNo, revTotal); err != nil {
				return err
			}
			for i, rl := range revGL {
				if _, err := tx.Exec(ctx, `
					INSERT INTO gl_journal_detail (
						doc_date, doc_no, book_code, line_number,
						account_code, account_name, debit_or_credit, debit, credit,
						trans_flag, journal_type, branch_code, period_number, account_year
					) VALUES (
						CURRENT_DATE, $1, 'POS', $2,
						$3, $4, $5, $6::numeric, $7::numeric,
						45, 0, '00000', EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int
					)`,
					cancelDocNo, i+1, rl.AccountCode, rl.AccountName, rl.DebitOrCredit, rl.Debit, rl.Credit); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	if s.D1 != nil && s.D1.IsConfigured() {
		_, _ = s.D1.Query(ctx, `UPDATE pos_bill_inbox SET status = 'CANCELLED', status_code = 9 WHERE doc_no = ?`, docNo)
	}

	resData := map[string]any{
		"bill_guid":      billGUID,
		"doc_no":         docNo,
		"cancel_doc_no":  cancelDocNo,
		"status":         "cancelled",
		"status_code":    "CANCELLED",
	}
	return map[string]any{
		"ok":               true,
		"status":           "CANCELLED",
		"cancelled_doc_no": docNo,
		"cancel_doc_no":    cancelDocNo,
		"data":             resData,
	}, nil
}

func firstNonEmptyStr(vals ...string) string {
	for _, v := range vals {
		if t := strings.TrimSpace(v); t != "" {
			return t
		}
	}
	return ""
}

func inferCategoryFromCode(code string) string {
	u := strings.ToUpper(strings.TrimSpace(code))
	switch {
	case strings.HasPrefix(u, "BEER-"):
		return "BEER"
	case strings.HasPrefix(u, "CAFE-TEA"):
		return "TEA"
	case strings.HasPrefix(u, "CAFE-BAK"):
		return "BAKERY"
	case strings.HasPrefix(u, "BITE-"):
		return "BITES"
	default:
		return "COFFEE"
	}
}
