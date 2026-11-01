package pos

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/domepos/backend/internal/money"
)

func (s *Store) queryMapSlice(ctx context.Context, sqlStmt string, args ...any) ([]map[string]any, error) {
	rows, err := s.Pool.Query(ctx, sqlStmt, args...)
	if err != nil {
		return []map[string]any{}, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return []map[string]any{}, err
	}
	if list == nil {
		return []map[string]any{}, nil
	}
	return list, nil
}

// GetBootstrap returns all POS configuration, catalog, and status data.
func (s *Store) GetBootstrap(ctx context.Context) (map[string]any, error) {
	startupRows, _ := s.queryMapSlice(ctx, `
		SELECT pos_config_number, shop_name, branch_name, tax_id, pos_terminal_no,
		       cust_code_default, is_member, member_discount::text AS member_discount, max_pos_money::text AS max_pos_money,
		       round_change_decimal, format_round, vat_type, vat_rate::text AS vat_rate, service_charge_rate::text AS service_charge_rate,
		       pos_header, pos_footer, pos_bill_type, pos_change_price_config,
		       pos_change_discount_config, pos_cancel_bill, show_tax_detail, barcode_picture, check_float_money
		FROM posconfig ORDER BY roworder LIMIT 1`)
	var startup map[string]any
	if len(startupRows) > 0 {
		startup = startupRows[0]
	} else {
		startup = map[string]any{
			"pos_config_number": "POS-CFG-01",
			"shop_name":         "DOME Pos Cafe & Craft Beer",
			"vat_type":          1,
			"vat_rate":          "7.00",
			"cust_code_default": "WALKIN",
		}
	}

	machines, _ := s.queryMapSlice(ctx, `
		SELECT machinecode, pos_id, COALESCE(machine_name, '') AS machine_name, status, pos_config_number, price_number,
		       doc_format, doc_format_vat_full, doc_format_cancel, doc_format_fillmoney, doc_format_cashiersettle,
		       pos_ic_wht, pos_ic_shelf, pos_type_invoice, pos_save_e_journal, slip_number,
		       doc_running_inv, doc_format_code, branch_code, department_code, use_credit_sale,
		       COALESCE(printer_name, '') AS printer_name, COALESCE(customer_display, '') AS customer_display,
		       COALESCE(cash_drawer_enabled, 1) AS cash_drawer_enabled
		FROM pos_id ORDER BY machinecode`)

	qrRows, _ := s.queryMapSlice(ctx, `
		SELECT pos_id, promp_pay_telephone_number, promp_pay_wallet_id,
		       merchant_name, company_biller_id, company_terminal_id, company_store_id, config_type
		FROM erp_thai_qr_config ORDER BY roworder LIMIT 1`)
	qr := map[string]any{
		"pos_id":                     "ALL",
		"promp_pay_telephone_number": "0812345678",
		"merchant_name":              "DOME POS CAFE",
	}
	if len(qrRows) > 0 {
		qr = qrRows[0]
	}

	pointRows, _ := s.queryMapSlice(ctx, `
		SELECT condition_code, baht_per_point::text AS baht_per_point, points_per_baht_redeem::text AS points_per_baht_redeem,
		       min_redeem_points::text AS min_redeem_points, birth_month_multiplier::text AS birth_month_multiplier,
		       birth_day_multiplier::text AS birth_day_multiplier, birth_month_use, birth_day_use,
		       vip_tier_silver_min::text AS vip_tier_silver_min, vip_tier_gold_min::text AS vip_tier_gold_min,
		       vip_tier_platinum_min::text AS vip_tier_platinum_min
		FROM pos_point_condition ORDER BY roworder LIMIT 1`)
	point := map[string]any{
		"condition_code":         "POINT-STD",
		"baht_per_point":         "100.00",
		"points_per_baht_redeem": "1.00",
		"min_redeem_points":      "10.00",
	}
	if len(pointRows) > 0 {
		point = pointRows[0]
	}

	promotions, _ := s.queryMapSlice(ctx, `
		SELECT promo_code, promo_name, promo_type, COALESCE(promo_type_code, 7) AS promo_type_code,
		       COALESCE(description, '') AS description, target_barcode,
		       min_qty::text AS min_qty, min_spend::text AS min_spend,
		       discount_amount::text AS discount_amount, discount_pct::text AS discount_pct,
		       COALESCE(discount_text, '') AS discount_text, free_qty::text AS free_qty,
		       COALESCE(unit_stand, 1)::text AS unit_stand, COALESCE(unit_divide, 1)::text AS unit_divide,
		       COALESCE(strict_unit_ratio, 1) AS strict_unit_ratio, COALESCE(allow_mix_match, 1) AS allow_mix_match,
		       COALESCE(auto_add_free_item, 1) AS auto_add_free_item, COALESCE(max_qty_per_bill, 0)::text AS max_qty_per_bill,
		       COALESCE(customer_only, 0) AS customer_only, COALESCE(date_begin, '2026-01-01') AS date_begin,
		       COALESCE(date_end, '2030-12-31') AS date_end, COALESCE(time_start, '00:00') AS time_start,
		       COALESCE(time_end, '23:59') AS time_end, COALESCE(day_filter, 'ALL') AS day_filter,
		       COALESCE(items_include_json, '{}') AS items_include_json,
		       COALESCE(reward_item_code, '') AS reward_item_code, COALESCE(reward_item_name, '') AS reward_item_name,
		       is_active
		FROM pos_promotions ORDER BY promo_type_code ASC, promo_code ASC`)

	coupons, _ := s.queryMapSlice(ctx, `
		SELECT number, amount::text AS amount, balance_amount::text AS balance_amount, last_status,
		       COALESCE(TO_CHAR(date, 'YYYY-MM-DD'), '') AS date,
		       COALESCE(TO_CHAR(date_expire, 'YYYY-MM-DD'), '') AS date_expire,
		       remark, coupon_type, single_use, cust_code, coupon_group
		FROM coupon_list ORDER BY roworder DESC LIMIT 100`)

	memberGroups, _ := s.queryMapSlice(ctx, `
		SELECT group_code, group_name, group_type, primary_member_code,
		       tier_level, discount_pct::text AS discount_pct, pool_points, shared_points::text AS shared_points, member_count
		FROM pos_member_groups ORDER BY group_code`)

	products, _ := s.queryMapSlice(ctx, `
		SELECT i.code, i.code AS item_code,
		       COALESCE(b.barcode, i.code) AS barcode,
		       COALESCE(i.name_1, i.code) AS name_1,
		       COALESCE(i.name_1, i.code) AS name,
		       COALESCE(i.name_eng_1, '') AS name_en,
		       COALESCE(b.unit_code, i.unit_standard, 'แก้ว') AS unit_code,
		       COALESCE(b.unit_code, i.unit_standard, 'แก้ว') AS unit,
		       COALESCE(b.price, 0)::text AS retail_price,
		       COALESCE(b.price, 0)::text AS price,
		       COALESCE(b.price_2, b.price, 0)::text AS wholesale_price,
		       COALESCE(b.price_member, b.price, 0)::text AS member_price,
		       COALESCE(i.group_main, 'COFFEE') AS category,
		       COALESCE(i.group_main, 'COFFEE') AS category_code,
		       COALESCE(i.image_url, '') AS image_url
		FROM ic_inventory i
		LEFT JOIN LATERAL (
			SELECT barcode, unit_code, price, price_2, price_member
			FROM ic_inventory_barcode
			WHERE ic_code = i.code
			ORDER BY roworder LIMIT 1
		) b ON true
		WHERE COALESCE(i.status, 1) = 1
		ORDER BY i.roworder ASC, i.code ASC LIMIT 200`)

	settlements, _ := s.queryMapSlice(ctx, `
		SELECT docno, COALESCE(TO_CHAR(docdate, 'YYYY-MM-DD'), '') AS docdate, doc_time, cashiercode, machinecode, pos_id,
		       cashamount::text AS cashamount, creditcardamount::text AS creditcardamount,
		       coupongamount::text AS coupongamount, transferamount::text AS transferamount,
		       trans_type, remark, total_amount::text AS total_amount
		FROM poscashiersettle ORDER BY roworder DESC LIMIT 50`)

	recentBills, _ := s.queryMapSlice(ctx, `
		SELECT COALESCE(doc_no, '') AS doc_no, COALESCE(doc_date::text, '') AS doc_date, COALESCE(doc_time, '') AS doc_time,
		       COALESCE(cust_code, 'WALKIN') AS cust_code, COALESCE(pos_id, 'POS-01') AS pos_id,
		       COALESCE(cashier_code, 'OWNER-01') AS cashier_code, COALESCE(payment_method, 'CASH') AS payment_method,
		       COALESCE(total_before_vat, 0)::text AS total_before_vat, COALESCE(total_vat_value, 0)::text AS total_vat_value,
		       COALESCE(total_amount, 0)::text AS total_amount, COALESCE(last_status, 0) AS last_status,
		       COALESCE(is_cancel, 0) AS is_cancel, COALESCE(trans_flag, 44) AS trans_flag,
		       COALESCE(remark, '') AS remark
		FROM ic_trans
		WHERE trans_flag = 44
		ORDER BY doc_date DESC, roworder DESC LIMIT 50`)

	tempMembers, _ := s.queryMapSlice(ctx, `
		SELECT telephone, temp_name, source_terminal_id, bill_count,
		       total_spend::text AS total_spend, pending_points::text AS pending_points,
		       status, target_member_code, target_group_id
		FROM pos_temp_members ORDER BY created_at DESC LIMIT 50`)

	cfMeta := map[string]any{
		"database_provider": "cloudflare-d1",
		"storage_provider":  "cloudflare-r2",
		"d1_configured":     s.D1 != nil && s.D1.IsConfigured(),
		"r2_configured":     s.R2 != nil && s.R2.IsConfigured(),
		"r2_bucket":         s.R2.BucketName,
		"r2_public_url":     s.R2.PublicURL,
	}

	payload := map[string]any{
		"ok":              true,
		"startup":         startup,
		"pos_config":      startup,
		"machines":        machines,
		"pos_machines":    machines,
		"qr":              qr,
		"qr_config":       qr,
		"point":           point,
		"point_condition": point,
		"promotions":      promotions,
		"coupons":         coupons,
		"member_groups":   memberGroups,
		"products":        products,
		"items":           products,
		"settlements":     settlements,
		"recent_bills":    recentBills,
		"temp_members":    tempMembers,
		"cloudflare":      cfMeta,
	}
	payload["data"] = map[string]any{
		"startup":         startup,
		"pos_config":      startup,
		"machines":        machines,
		"pos_machines":    machines,
		"qr":              qr,
		"qr_config":       qr,
		"point":           point,
		"point_condition": point,
		"promotions":      promotions,
		"coupons":         coupons,
		"member_groups":   memberGroups,
		"products":        products,
		"items":           products,
		"settlements":     settlements,
		"recent_bills":    recentBills,
		"temp_members":    tempMembers,
		"cloudflare":      cfMeta,
	}
	return payload, nil
}

// GetSync returns the catalog delta/snapshot from ic_inventory + ic_inventory_barcode.
func (s *Store) GetSync(ctx context.Context, cursor string) (map[string]any, error) {
	products, err := s.queryMapSlice(ctx, `
		SELECT i.code AS item_code, i.code AS code,
		       COALESCE(NULLIF(b.barcode, ''), i.code) AS barcode,
		       COALESCE(NULLIF(i.name_1, ''), i.code) AS name,
		       COALESCE(NULLIF(i.name_eng_1, ''), '') AS name_en,
		       COALESCE(NULLIF(b.unit_code, ''), i.unit_standard, 'แก้ว') AS unit_code,
		       COALESCE(NULLIF(b.unit_code, ''), i.unit_standard, 'แก้ว') AS unit,
		       COALESCE(u.stand_value, 1)::text AS unit_stand,
		       COALESCE(NULLIF(u.divide_value, 0), 1)::text AS unit_divide,
		       COALESCE(b.price, 0)::text AS retail_price,
		       COALESCE(b.price, 0)::text AS price,
		       COALESCE(NULLIF(b.price_2, 0), b.price, 0)::text AS wholesale_price,
		       COALESCE(NULLIF(b.price_member, 0), b.price, 0)::text AS member_price,
		       COALESCE(i.tax_type, 0) AS tax_type,
		       COALESCE(i.group_main, 'COFFEE') AS category_code,
		       COALESCE(i.group_main, 'COFFEE') AS category,
		       COALESCE(i.image_url, '') AS image_url
		FROM ic_inventory i
		LEFT JOIN ic_inventory_barcode b ON b.ic_code = i.code
		LEFT JOIN ic_unit_use u ON u.ic_code = i.code AND u.code = COALESCE(NULLIF(b.unit_code, ''), i.unit_standard)
		WHERE COALESCE(i.status, 1) = 1
		ORDER BY i.roworder ASC, i.code ASC`)
	if err != nil {
		return nil, err
	}

	changes := make([]map[string]any, 0, len(products))
	for _, p := range products {
		k, _ := p["item_code"].(string)
		changes = append(changes, map[string]any{
			"entity": "product",
			"key":    k,
			"rows":   []map[string]any{p},
		})
	}

	nextCursor := fmt.Sprintf("domepos-cur-%d", len(products))
	nowISO := time.Now().UTC().Format(time.RFC3339)

	// If caller passes the exact same cursor, return empty changes (caught up)
	if cursor != "" && cursor == nextCursor {
		changes = []map[string]any{}
	}

	dataObj := map[string]any{
		"cursor":      nextCursor,
		"has_more":    false,
		"server_time": nowISO,
		"changes":     changes,
		"products":    products,
	}
	return map[string]any{
		"ok":          true,
		"cursor":      nextCursor,
		"has_more":    false,
		"server_time": nowISO,
		"changes":     changes,
		"products":    products,
		"data":        dataObj,
	}, nil
}

// GetRestore returns the open shift (pos_period status=1), cash movements (poscashiersettle),
// and the 30 most recent POS bills from ic_trans (trans_flag=44) with payment methods and payload.
func (s *Store) GetRestore(ctx context.Context, machineCode string) (map[string]any, error) {
	if machineCode == "" {
		machineCode = "POS-01"
	}

	shiftRows, _ := s.queryMapSlice(ctx, `
		SELECT period_guid, machine_code,
		       COALESCE(TO_CHAR(begin_date, 'YYYY-MM-DD'), '') AS begin_date,
		       begin_time,
		       COALESCE(TO_CHAR(end_date, 'YYYY-MM-DD'), '') AS end_date,
		       end_time,
		       status, period_status, begin_user_code,
		       begin_user_code AS cashier_code,
		       float_amount::text AS float_amount,
		       float_amount::text AS opening_cash
		FROM pos_period
		WHERE status = 1 AND (machine_code = $1 OR $1 = '')
		ORDER BY roworder DESC LIMIT 1`, machineCode)

	var shift any = nil
	if len(shiftRows) > 0 {
		shift = shiftRows[0]
	}

	movements, _ := s.queryMapSlice(ctx, `
		SELECT docno, COALESCE(TO_CHAR(docdate, 'YYYY-MM-DD'), '') AS docdate, doc_time,
		       cashiercode, machinecode, pos_id, trans_type,
		       cashamount::text AS cashamount, creditcardamount::text AS creditcardamount,
		       coupongamount::text AS coupongamount, transferamount::text AS transferamount,
		       total_amount::text AS total_amount, remark
		FROM poscashiersettle
		ORDER BY roworder DESC LIMIT 50`)

	billRows, _ := s.queryMapSlice(ctx, `
		SELECT t.doc_no,
		       COALESCE(TO_CHAR(t.doc_date, 'YYYY-MM-DD'), '') AS doc_date,
		       COALESCE(t.doc_time, '') AS doc_time,
		       COALESCE(t.pos_id, 'POS-01') AS pos_id,
		       COALESCE(t.cashier_code, 'OWNER-01') AS cashier_code,
		       COALESCE(t.cust_code, 'WALKIN') AS cust_code,
		       COALESCE(t.payment_method, 'CASH') AS payment_method,
		       COALESCE(t.total_value, 0)::text AS total_value,
		       COALESCE(t.total_discount, 0)::text AS bill_discount,
		       COALESCE(t.total_before_vat, 0)::text AS total_before_vat,
		       COALESCE(t.total_vat_value, 0)::text AS total_vat_value,
		       COALESCE(t.total_amount, 0)::text AS total_amount,
		       COALESCE(t.sum_point, 0)::text AS points_earned,
		       COALESCE(t.last_status, 0) AS last_status,
		       COALESCE(t.is_cancel, 0) AS is_cancel,
		       COALESCE(t.remark, '') AS remark,
		       COALESCE(ib.bill_guid, 'GUID-' || t.doc_no) AS bill_guid,
		       COALESCE(ib.status, CASE WHEN COALESCE(t.is_cancel, 0) = 1 THEN 'CANCELLED' ELSE 'PROCESSED' END) AS inbox_status,
		       COALESCE(ib.payload::text, '{}') AS payload_text
		FROM ic_trans t
		LEFT JOIN pos_bill_inbox ib ON ib.doc_no = t.doc_no
		WHERE t.trans_flag = 44
		ORDER BY t.doc_date DESC, t.roworder DESC
		LIMIT 30`)

	bills := make([]map[string]any, 0, len(billRows))
	for _, b := range billRows {
		docNo, _ := b["doc_no"].(string)
		isCancel := fmt.Sprintf("%v", b["is_cancel"]) == "1" || fmt.Sprintf("%v", b["last_status"]) == "1"
		statusStr := "done"
		statusCode := "PROCESSED"
		if isCancel {
			statusStr = "cancelled"
			statusCode = "CANCELLED"
		}

		var payloadObj map[string]any
		if pt, ok := b["payload_text"].(string); ok && pt != "" && pt != "{}" {
			_ = json.Unmarshal([]byte(pt), &payloadObj)
		}
		if payloadObj == nil {
			detailLines, _ := s.queryMapSlice(ctx, `
				SELECT item_code, barcode, item_name AS name, unit_code,
				       qty::text AS qty, price::text AS price, discount_amount::text AS discount, sum_amount::text AS sum_amount
				FROM ic_trans_detail WHERE doc_no = $1 AND trans_flag = 44 ORDER BY line_number`, docNo)
			payloadObj = map[string]any{
				"bill_guid":     b["bill_guid"],
				"doc_no":        docNo,
				"doc_date":      b["doc_date"],
				"doc_time":      b["doc_time"],
				"pos_id":        b["pos_id"],
				"cashier_code":  b["cashier_code"],
				"cust_code":     b["cust_code"],
				"bill_discount": b["bill_discount"],
				"remark":        b["remark"],
				"lines":         detailLines,
				"payments": []map[string]any{
					{"method": b["payment_method"], "amount": b["total_amount"]},
				},
			}
		}

		bills = append(bills, map[string]any{
			"bill_guid":        b["bill_guid"],
			"doc_no":           docNo,
			"doc_date":         b["doc_date"],
			"doc_time":         b["doc_time"],
			"pos_id":           b["pos_id"],
			"cashier_code":     b["cashier_code"],
			"cust_code":        b["cust_code"],
			"payment_method":   b["payment_method"],
			"bill_discount":    b["bill_discount"],
			"total_before_vat": b["total_before_vat"],
			"total_vat_value":  b["total_vat_value"],
			"total_amount":     b["total_amount"],
			"points_earned":    b["points_earned"],
			"last_status":      b["last_status"],
			"is_cancel":        b["is_cancel"],
			"status":           statusStr,
			"status_code":      statusCode,
			"remark":           b["remark"],
			"lines":            payloadObj["lines"],
			"payments":         payloadObj["payments"],
			"payload":          payloadObj,
		})
	}

	dataObj := map[string]any{
		"shift":       shift,
		"movements":   movements,
		"settlements": movements,
		"bills":       bills,
	}
	return map[string]any{
		"ok":          true,
		"shift":       shift,
		"movements":   movements,
		"settlements": movements,
		"bills":       bills,
		"data":        dataObj,
	}, nil
}

// ShiftAction handles open_shift, close_shift, receive_money, send_money, cancel_bill, upsert_item, delete_item.
func (s *Store) ShiftAction(ctx context.Context, body map[string]any) (map[string]any, error) {
	action := strings.ToLower(strings.TrimSpace(strVal(body["action"], "receive_money")))
	now := time.Now()
	docDate := strVal(firstVal(body, "docdate", "doc_date"), now.Format("2006-01-02"))
	docTime := strVal(firstVal(body, "doc_time", "doctime"), now.Format("15:04"))
	machineCode := strings.ToUpper(strVal(firstVal(body, "machinecode", "machine_code", "pos_id"), "POS-01"))
	cashierCode := strVal(firstVal(body, "cashiercode", "cashier_code"), "OWNER-01")
	posID := strVal(body["pos_id"], machineCode)

	switch action {
	case "cancel_bill":
		docNo := strVal(firstVal(body, "doc_no", "docno"), "")
		reason := strVal(body["reason"], "ลูกค้าขอยกเลิกบิล / คีย์รายการผิด")
		return s.CancelBill(ctx, docNo, reason, cashierCode)

	case "open_shift", "receive_money":
		amtRat, err := money.ParseValidRat(firstVal(body, "float_amount", "cashamount", "amount", "opening_cash"), "2000.00")
		if err != nil {
			return nil, err
		}
		cashAmt := money.FormatRat(amtRat, 2)
		docNo := strVal(firstVal(body, "docno", "doc_no"), fmt.Sprintf("RCV-%s-%04d", now.Format("060102"), now.UnixNano()%10000))
		remark := strVal(body["remark"], "เปิดกะขาย / รับเงินทอนเข้าลิ้นชัก")
		periodGuid := fmt.Sprintf("SHIFT-%s-%s", machineCode, docNo)

		err = pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
			if action == "open_shift" {
				// Close any older shift first and insert active shift with status=1, period_status=0
				_, _ = tx.Exec(ctx, `UPDATE pos_period SET status = 0, period_status = 1, end_date = $2::timestamp, end_time = $3, end_user_code = $4 WHERE machine_code = $1 AND status = 1`,
					machineCode, docDate, docTime, cashierCode)
				if _, err := tx.Exec(ctx, `
					INSERT INTO pos_period (
						period_guid, machine_code, begin_date, begin_time, status, period_status, begin_user_code, float_amount
					) VALUES ($1, $2, $3::timestamp, $4, 1, 0, $5, $6::numeric)
					ON CONFLICT (period_guid) DO UPDATE SET status = 1, period_status = 0, float_amount = EXCLUDED.float_amount`,
					periodGuid, machineCode, docDate, docTime, cashierCode, cashAmt); err != nil {
					return err
				}
			}
			_, err := tx.Exec(ctx, `
				INSERT INTO poscashiersettle (
					docno, docdate, doc_time, cashiercode, machinecode, pos_id,
					cashamount, creditcardamount, coupongamount, chqamount, transferamount,
					trans_type, remark, total_amount, total_cancel, total_balance, total_in, total_out, branch_code
				) VALUES (
					$1, $2::timestamp, $3, $4, $5, $6,
					$7::numeric, 0, 0, 0, 0,
					1, $8, $7::numeric, 0, $7::numeric, $7::numeric, 0, '00000'
				) ON CONFLICT (docno) DO UPDATE SET
					cashamount = EXCLUDED.cashamount,
					total_amount = EXCLUDED.total_amount,
					total_in = EXCLUDED.total_in,
					remark = EXCLUDED.remark`,
				docNo, docDate, docTime, cashierCode, machineCode, posID, cashAmt, remark)
			return err
		})
		if err != nil {
			return nil, err
		}
		statusLabel := "RECORDED"
		if action == "open_shift" {
			statusLabel = "OPENED"
		}
		return map[string]any{
			"ok":           true,
			"status":       statusLabel,
			"action":       action,
			"docno":        docNo,
			"period_guid":  periodGuid,
			"float_amount": cashAmt,
		}, nil

	case "close_shift", "send_money":
		cashRat, err := money.ParseValidRat(firstVal(body, "cashamount", "cash_counted", "amount"), "0.00")
		if err != nil {
			return nil, err
		}
		cardRat, err := money.ParseValidRat(body["creditcardamount"], "0.00")
		if err != nil {
			return nil, err
		}
		cpnRat, err := money.ParseValidRat(body["coupongamount"], "0.00")
		if err != nil {
			return nil, err
		}
		trfRat, err := money.ParseValidRat(body["transferamount"], "0.00")
		if err != nil {
			return nil, err
		}
		sumRat := money.ParseRat("0")
		sumRat.Add(sumRat, cashRat)
		sumRat.Add(sumRat, cardRat)
		sumRat.Add(sumRat, cpnRat)
		sumRat.Add(sumRat, trfRat)
		if sumRat.Sign() <= 0 {
			if totFallback, err := money.ParseValidRat(body["total_amount"], "0.00"); err == nil {
				sumRat = totFallback
			}
		}

		cashAmt := money.FormatRat(cashRat, 2)
		cardAmt := money.FormatRat(cardRat, 2)
		cpnAmt := money.FormatRat(cpnRat, 2)
		trfAmt := money.FormatRat(trfRat, 2)
		totAmt := money.FormatRat(sumRat, 2)

		docNo := strVal(firstVal(body, "docno", "doc_no"), fmt.Sprintf("SND-%s-%04d", now.Format("060102"), now.UnixNano()%10000))
		remark := strVal(body["remark"], "ปิดกะแคชเชียร์ / นำส่งเงินขาย POS")

		err = pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
			if action == "close_shift" {
				if _, err := tx.Exec(ctx, `
					UPDATE pos_period
					SET status = 0, period_status = 1, end_date = $2::timestamp, end_time = $3, end_user_code = $4
					WHERE machine_code = $1 AND status = 1`,
					machineCode, docDate, docTime, cashierCode); err != nil {
					return err
				}
			}
			_, err := tx.Exec(ctx, `
				INSERT INTO poscashiersettle (
					docno, docdate, doc_time, cashiercode, machinecode, pos_id,
					cashamount, creditcardamount, coupongamount, chqamount, transferamount,
					trans_type, remark, total_amount, total_cancel, total_balance, total_in, total_out, branch_code
				) VALUES (
					$1, $2::timestamp, $3, $4, $5, $6,
					$7::numeric, $8::numeric, $9::numeric, 0, $10::numeric,
					2, $11, $12::numeric, 0, $12::numeric, 0, $12::numeric, '00000'
				) ON CONFLICT (docno) DO UPDATE SET
					cashamount = EXCLUDED.cashamount,
					total_amount = EXCLUDED.total_amount,
					total_out = EXCLUDED.total_out,
					remark = EXCLUDED.remark`,
				docNo, docDate, docTime, cashierCode, machineCode, posID,
				cashAmt, cardAmt, cpnAmt, trfAmt, remark, totAmt)
			return err
		})
		if err != nil {
			return nil, err
		}
		statusLabel := "RECORDED"
		if action == "close_shift" {
			statusLabel = "CLOSED"
		}
		return map[string]any{
			"ok":           true,
			"status":       statusLabel,
			"action":       action,
			"docno":        docNo,
			"total_amount": totAmt,
		}, nil

	case "upsert_item":
		code := strings.ToUpper(strings.TrimSpace(strVal(firstVal(body, "code", "item_code"), "")))
		if code == "" {
			code = fmt.Sprintf("CAFE-NEW-%04d", now.Unix()%10000)
		}
		name := strVal(firstVal(body, "name", "name_1"), code)
		nameEn := strVal(firstVal(body, "name_en", "nameEn", "name_eng_1"), "")
		if nameEn == "" { // the POS edit form omits name_en: keep the stored one, new items fall back to name
			_ = s.Pool.QueryRow(ctx, `SELECT COALESCE(name_eng_1, '') FROM ic_inventory WHERE code = $1`, code).Scan(&nameEn)
			if nameEn == "" {
				nameEn = name
			}
		}
		unit := strVal(firstVal(body, "unit", "unit_code", "unit_standard"), "แก้ว")
		barcode := strVal(body["barcode"], code)
		category := strings.ToUpper(strVal(firstVal(body, "category", "category_code", "group_main"), inferCategoryFromCode(code)))
		priceRat, err := money.ParseValidRat(firstVal(body, "price", "retail_price"), "75.00")
		if err != nil {
			return nil, err
		}
		priceStr := money.FormatRat(priceRat, 2)
		imageURL := strVal(body["image_url"], fmt.Sprintf("/api/pos/image?e=product&k=%s&v=%d", url.QueryEscape(code), now.Unix()))

		err = pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `INSERT INTO ic_unit (code, name_1) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING`, unit); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO ic_inventory (code, name_1, name_eng_1, unit_standard, unit_cost, group_main, item_type, tax_type, status, image_url)
				VALUES ($1, $2, $3, $4, $4, $5, 0, 0, 1, $6)
				ON CONFLICT (code) DO UPDATE SET
					name_1 = EXCLUDED.name_1,
					name_eng_1 = EXCLUDED.name_eng_1,
					unit_standard = EXCLUDED.unit_standard,
					unit_cost = EXCLUDED.unit_cost,
					group_main = EXCLUDED.group_main,
					status = 1,
					image_url = EXCLUDED.image_url`,
				code, name, nameEn, unit, category, imageURL); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO ic_unit_use (ic_code, code, stand_value, divide_value, ratio, row_order, status)
				VALUES ($1, $2, 1.00, 1.00, 1.00, 1, 1)
				ON CONFLICT (ic_code, code) DO UPDATE SET status = 1`, code, unit); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO ic_inventory_barcode (ic_code, barcode, description, unit_code, price, price_2, price_member)
				VALUES ($1, $2, $3, $4, $5::numeric, $5::numeric, $5::numeric)
				ON CONFLICT (barcode) DO UPDATE SET
					ic_code = EXCLUDED.ic_code,
					description = EXCLUDED.description,
					unit_code = EXCLUDED.unit_code,
					price = EXCLUDED.price,
					price_2 = EXCLUDED.price_2,
					price_member = EXCLUDED.price_member`,
				code, barcode, name, unit, priceStr); err != nil {
				return err
			}
			_, _ = tx.Exec(ctx, `
				INSERT INTO pos_sync_change (entity, entity_key, xid, changed_at)
				VALUES ('product', $1, $2, CURRENT_TIMESTAMP)
				ON CONFLICT (entity, entity_key) DO UPDATE SET xid = EXCLUDED.xid, changed_at = CURRENT_TIMESTAMP`,
				code, now.Unix())
			return nil
		})
		if err != nil {
			return nil, err
		}

		if s.D1 != nil && s.D1.IsConfigured() {
			_, _ = s.D1.Query(ctx, `INSERT OR REPLACE INTO ic_inventory (code, name_1, name_eng_1, unit_standard, unit_cost, group_main, status, image_url) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
				code, name, nameEn, unit, unit, category, imageURL)
		}

		itemObj := map[string]any{
			"code":          code,
			"item_code":     code,
			"barcode":       barcode,
			"name":          name,
			"name_1":        name,
			"name_en":       nameEn,
			"unit":          unit,
			"unit_code":     unit,
			"category":      category,
			"category_code": category,
			"price":         priceStr,
			"retail_price":  priceStr,
			"image_url":     imageURL,
			"status":        1,
		}
		return map[string]any{
			"ok":     true,
			"status": "UPSERTED",
			"action": "upsert_item",
			"item":   itemObj,
			"data":   itemObj,
		}, nil

	case "delete_item":
		code := strings.ToUpper(strings.TrimSpace(strVal(firstVal(body, "code", "item_code"), "")))
		if code == "" {
			return nil, errors.New("กรุณาระบุรหัสสินค้าที่ต้องการลบ")
		}
		err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `UPDATE ic_inventory SET status = 0 WHERE code = $1`, code); err != nil {
				return err
			}
			_, _ = tx.Exec(ctx, `
				INSERT INTO pos_sync_change (entity, entity_key, xid, changed_at)
				VALUES ('product', $1, $2, CURRENT_TIMESTAMP)
				ON CONFLICT (entity, entity_key) DO UPDATE SET xid = EXCLUDED.xid, changed_at = CURRENT_TIMESTAMP`,
				code, now.Unix())
			return nil
		})
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"ok":        true,
			"status":    "DELETED",
			"action":    "delete_item",
			"item_code": code,
		}, nil

	default:
		return nil, fmt.Errorf("ไม่รู้จักคำสั่งกะขาย: %s", action)
	}
}

// SaveConfig updates POS configuration sections (startup, machine, qr, point, coupon, promotion).
func (s *Store) SaveConfig(ctx context.Context, body map[string]any) (string, error) {
	section := strings.ToLower(strings.TrimSpace(strVal(body["section"], "startup")))

	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		switch section {
		case "startup":
			cfgNum := strVal(body["pos_config_number"], "POS-CFG-01")
			memberDiscRat, err := money.ParseValidRat(body["member_discount"], "5.00")
			if err != nil {
				return err
			}
			maxMoneyRat, err := money.ParseValidRat(body["max_pos_money"], "50000.00")
			if err != nil {
				return err
			}
			vatRateRat, err := money.ParseValidRat(body["vat_rate"], "7.00")
			if err != nil {
				return err
			}
			svcRateRat, err := money.ParseValidRat(body["service_charge_rate"], "0.00")
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO posconfig (
					pos_config_number, shop_name, branch_name, tax_id, pos_terminal_no,
					cust_code_default, is_member, member_discount, max_pos_money,
					round_change_decimal, format_round, vat_type, vat_rate, service_charge_rate,
					pos_header, pos_footer, pos_bill_type, pos_change_price_config,
					pos_change_discount_config, pos_cancel_bill, show_tax_detail, barcode_picture, check_float_money, updated_at
				) VALUES (
					$1, $2, $3, $4, $5,
					$6, $7, $8::numeric, $9::numeric,
					$10, $11, $12, $13::numeric, $14::numeric,
					$15, $16, $17, $18,
					$19, $20, $21, $22, $23, CURRENT_TIMESTAMP
				) ON CONFLICT (pos_config_number) DO UPDATE SET
					shop_name = EXCLUDED.shop_name,
					branch_name = EXCLUDED.branch_name,
					tax_id = EXCLUDED.tax_id,
					pos_terminal_no = EXCLUDED.pos_terminal_no,
					cust_code_default = EXCLUDED.cust_code_default,
					is_member = EXCLUDED.is_member,
					member_discount = EXCLUDED.member_discount,
					max_pos_money = EXCLUDED.max_pos_money,
					vat_type = EXCLUDED.vat_type,
					vat_rate = EXCLUDED.vat_rate,
					service_charge_rate = EXCLUDED.service_charge_rate,
					pos_header = EXCLUDED.pos_header,
					pos_footer = EXCLUDED.pos_footer,
					updated_at = CURRENT_TIMESTAMP`,
				cfgNum,
				strVal(body["shop_name"], "DOME Pos Cafe & Craft Beer"),
				strVal(body["branch_name"], "สาขาหลัก (00000)"),
				strVal(body["tax_id"], ""),
				strVal(body["pos_terminal_no"], ""),
				strVal(body["cust_code_default"], "WALKIN"),
				intVal(body["is_member"], 1),
				money.FormatRat(memberDiscRat, 2),
				money.FormatRat(maxMoneyRat, 2),
				intVal(body["round_change_decimal"], 0),
				intVal(body["format_round"], 0),
				intVal(body["vat_type"], 1),
				money.FormatRat(vatRateRat, 2),
				money.FormatRat(svcRateRat, 2),
				strVal(body["pos_header"], "ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ (ABB)"),
				strVal(body["pos_footer"], "ขอบคุณที่ใช้บริการ DOME Pos"),
				intVal(body["pos_bill_type"], 0),
				intVal(body["pos_change_price_config"], 1),
				intVal(body["pos_change_discount_config"], 1),
				intVal(body["pos_cancel_bill"], 1),
				intVal(body["show_tax_detail"], 1),
				intVal(body["barcode_picture"], 1),
				intVal(body["check_float_money"], 1),
			)
			return err

		case "machine", "machines":
			mc := strings.ToUpper(strVal(body["machinecode"], "POS-01"))
			_, err := tx.Exec(ctx, `
				INSERT INTO pos_id (
					machinecode, pos_id, machine_name, status, pos_config_number, price_number,
					doc_format, doc_format_vat_full, doc_format_cancel, doc_format_fillmoney, doc_format_cashiersettle,
					pos_ic_wht, pos_ic_shelf, pos_type_invoice, pos_save_e_journal, slip_number,
					doc_running_inv, doc_format_code, branch_code, department_code, use_credit_sale,
					printer_name, customer_display, cash_drawer_enabled
				) VALUES (
					$1, $2, $3, $4, $5, $6,
					$7, $8, $9, $10, $11,
					$12, $13, $14, $15, $16,
					$17, $18, $19, $20, $21,
					$22, $23, $24
				) ON CONFLICT (machinecode) DO UPDATE SET
					pos_id = EXCLUDED.pos_id,
					machine_name = EXCLUDED.machine_name,
					status = EXCLUDED.status,
					doc_format = EXCLUDED.doc_format,
					pos_ic_wht = EXCLUDED.pos_ic_wht,
					pos_ic_shelf = EXCLUDED.pos_ic_shelf,
					printer_name = EXCLUDED.printer_name,
					customer_display = EXCLUDED.customer_display,
					cash_drawer_enabled = EXCLUDED.cash_drawer_enabled`,
				mc,
				strVal(body["pos_id"], mc),
				strVal(body["machine_name"], "จุดแคชเชียร์หน้าร้าน DOME Pos"),
				intVal(body["status"], 1),
				strVal(body["pos_config_number"], "POS-CFG-01"),
				intVal(body["price_number"], 1),
				strVal(body["doc_format"], "ABB1-@YY@MM-#####"),
				strVal(body["doc_format_vat_full"], "TAX1-@YY@MM-#####"),
				strVal(body["doc_format_cancel"], "CNM1-@YY@MM-#####"),
				strVal(body["doc_format_fillmoney"], "RCV1-@YY@MM-#####"),
				strVal(body["doc_format_cashiersettle"], "SND1-@YY@MM-#####"),
				strVal(body["pos_ic_wht"], "MMA01"),
				strVal(body["pos_ic_shelf"], "SH-01"),
				intVal(body["pos_type_invoice"], 0),
				intVal(body["pos_save_e_journal"], 1),
				strVal(body["slip_number"], "SLIP-80MM"),
				strVal(body["doc_running_inv"], "ABB"),
				strVal(body["doc_format_code"], "ABB"),
				strVal(body["branch_code"], "00000"),
				strVal(body["department_code"], "CAFE"),
				intVal(body["use_credit_sale"], 1),
				strVal(body["printer_name"], "Thermal 80mm Auto-Cut"),
				strVal(body["customer_display"], "QR Display"),
				intVal(body["cash_drawer_enabled"], 1),
			)
			return err

		case "qr":
			_, err := tx.Exec(ctx, `
				INSERT INTO erp_thai_qr_config (
					pos_id, promp_pay_telephone_number, promp_pay_wallet_id,
					merchant_name, company_biller_id, company_terminal_id, company_store_id, config_type
				) VALUES ('ALL', $1, $2, $3, $4, $5, $6, $7)
				ON CONFLICT (pos_id) DO UPDATE SET
					promp_pay_telephone_number = EXCLUDED.promp_pay_telephone_number,
					promp_pay_wallet_id = EXCLUDED.promp_pay_wallet_id,
					merchant_name = EXCLUDED.merchant_name,
					company_biller_id = EXCLUDED.company_biller_id,
					company_terminal_id = EXCLUDED.company_terminal_id,
					company_store_id = EXCLUDED.company_store_id,
					config_type = EXCLUDED.config_type`,
				strVal(body["promp_pay_telephone_number"], ""),
				strVal(body["promp_pay_wallet_id"], ""),
				strVal(body["merchant_name"], "DOME POS CAFE"),
				strVal(body["company_biller_id"], ""),
				strVal(body["company_terminal_id"], ""),
				strVal(body["company_store_id"], ""),
				intVal(body["config_type"], 0),
			)
			return err

		case "point":
			bppRat, err := money.ParseValidRat(body["baht_per_point"], "100.00")
			if err != nil {
				return err
			}
			pprRat, err := money.ParseValidRat(body["points_per_baht_redeem"], "1.00")
			if err != nil {
				return err
			}
			minRRat, err := money.ParseValidRat(body["min_redeem_points"], "10.00")
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO pos_point_condition (
					condition_code, baht_per_point, points_per_baht_redeem, min_redeem_points
				) VALUES ('POINT-STD', $1::numeric, $2::numeric, $3::numeric)
				ON CONFLICT (condition_code) DO UPDATE SET
					baht_per_point = EXCLUDED.baht_per_point,
					points_per_baht_redeem = EXCLUDED.points_per_baht_redeem,
					min_redeem_points = EXCLUDED.min_redeem_points`,
				money.FormatRat(bppRat, 2),
				money.FormatRat(pprRat, 2),
				money.FormatRat(minRRat, 2),
			)
			return err

		default:
			return fmt.Errorf("ไม่รู้จักหมวดตั้งค่า POS: %s", section)
		}
	})
	if err != nil {
		return "", err
	}
	return section, nil
}

func firstVal(m map[string]any, keys ...string) any {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return v
		}
	}
	return nil
}

func strVal(v any, fallback string) string {
	if v == nil {
		return fallback
	}
	s := strings.TrimSpace(fmt.Sprintf("%v", v))
	if s == "" || s == "<nil>" {
		return fallback
	}
	return s
}

func intVal(v any, fallback int) int {
	switch val := v.(type) {
	case int:
		return val
	case int64:
		return int(val)
	case json.Number:
		if i, err := val.Int64(); err == nil {
			return int(i)
		}
	case string:
		r := money.ParseRat(val)
		if r.Sign() != 0 {
			return int(r.Num().Int64() / r.Denom().Int64())
		}
	case bool:
		if val {
			return 1
		}
		return 0
	}
	return fallback
}
