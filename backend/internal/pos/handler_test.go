package pos

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/joho/godotenv"

	"github.com/domepos/backend/internal/cloudflare"
)

func setupTestStore(t *testing.T) (*Store, http.Handler) {
	t.Helper()
	_ = godotenv.Load("../../.env.local", "../.env.local", ".env.local")
	cfg := LoadDBConfigFromEnv()
	if cfg.Database != "domepos" {
		t.Fatalf("expected database=domepos, got %s", cfg.Database)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	store, err := InitStore(ctx, cfg)
	if err != nil {
		t.Fatalf("InitStore failed: %v", err)
	}
	t.Cleanup(func() {
		store.Close()
	})
	return store, NewRouter(store)
}

func doJSONRequest(t *testing.T, router http.Handler, method, path string, body any) (int, map[string]any) {
	t.Helper()
	var reqBody []byte
	if body != nil {
		var err error
		reqBody, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body failed: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(reqBody))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var out map[string]any
	dec := json.NewDecoder(rec.Body)
	dec.UseNumber()
	_ = dec.Decode(&out)
	return rec.Code, out
}

func TestDomePosEndToEnd(t *testing.T) {
	store, router := setupTestStore(t)
	ctx := context.Background()

	// 1. Health check
	status, health := doJSONRequest(t, router, http.MethodGet, "/health", nil)
	if status != http.StatusOK || health["database"] != "domepos" {
		t.Fatalf("unexpected health response: status=%d body=%v", status, health)
	}

	// 2. Bootstrap check
	status, boot := doJSONRequest(t, router, http.MethodGet, "/api/v1/pos/bootstrap", nil)
	if status != http.StatusOK || boot["ok"] != true {
		t.Fatalf("bootstrap failed: status=%d body=%v", status, boot)
	}
	products, _ := boot["products"].([]any)
	if len(products) < 19 {
		t.Fatalf("expected at least 19 seeded items in products, got %d", len(products))
	}

	// 3. Sync check
	status, syncRes := doJSONRequest(t, router, http.MethodGet, "/api/v1/pos/sync?since_seq=0", nil)
	if status != http.StatusOK || syncRes["ok"] != true {
		t.Fatalf("sync failed: status=%d body=%v", status, syncRes)
	}

	// 4. Open shift, receive money, send money
	periodGUID := fmt.Sprintf("SHIFT-TEST-%d", time.Now().UnixNano())
	status, openRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/shift", map[string]any{
		"action":       "open_shift",
		"period_guid":  periodGUID,
		"pos_id":       "POS-01",
		"cashier_code": "CASHIER-01",
		"cashier_name": "พนักงานทดสอบ",
		"float_amount": "1500.00",
	})
	if status != http.StatusOK || openRes["status"] != "OPENED" {
		t.Fatalf("open_shift failed: status=%d body=%v", status, openRes)
	}

	status, rcvRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/shift", map[string]any{
		"action":       "receive_money",
		"pos_id":       "POS-01",
		"cashier_code": "CASHIER-01",
		"amount":       "250.00",
		"remark":       "เติมเงินทอนย่อย",
	})
	if status != http.StatusOK || rcvRes["status"] != "RECORDED" {
		t.Fatalf("receive_money failed: status=%d body=%v", status, rcvRes)
	}

	status, sndRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/shift", map[string]any{
		"action":       "send_money",
		"pos_id":       "POS-01",
		"cashier_code": "CASHIER-01",
		"amount":       "100.00",
		"remark":       "นำฝากระหว่างวัน",
	})
	if status != http.StatusOK || sndRes["status"] != "RECORDED" {
		t.Fatalf("send_money failed: status=%d body=%v", status, sndRes)
	}

	// 5. Post POS Bill & verify exact big.Rat calculation + GL balance + idempotency
	billGUID := fmt.Sprintf("BILL-TEST-%d", time.Now().UnixNano())
	docNo := fmt.Sprintf("ABB-T%d", time.Now().UnixNano()%100000000)
	billPayload := map[string]any{
		"bill_guid":     billGUID,
		"doc_no":        docNo,
		"pos_id":        "POS-01",
		"cashier_code":  "CASHIER-01",
		"cust_code":     "MEM-001",
		"vat_type":      1,
		"vat_rate":      "7.00",
		"bill_discount": "10.00",
		"tendered_cash": "500.00",
		"items": []map[string]any{
			{
				"item_code": "CAFE-ESP-01",
				"item_name": "อเมริกาโน่เย็น คั่วกลาง",
				"unit_code": "แก้ว",
				"qty":       "2",
				"price":     "75.00",
				"discount":  "0.00",
			},
			{
				"item_code": "BEER-IPA-01",
				"item_name": "คราฟต์เบียร์ Hazy IPA สด (Pint 473ml)",
				"unit_code": "แก้ว",
				"qty":       "1",
				"price":     "220.00",
				"discount":  "0.00",
			},
		},
		"payments": []map[string]any{
			{"method": "CASH", "amount": "200.00"},
			{"method": "QR", "amount": "160.00", "reference": "QR-REF-01"},
		},
	}

	status, billRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/bills", billPayload)
	if status != http.StatusOK || billRes["ok"] != true {
		t.Fatalf("post bill failed: status=%d body=%v", status, billRes)
	}
	if billRes["total_amount"] != "360.00" {
		t.Fatalf("expected total_amount=360.00, got %v", billRes["total_amount"])
	}
	if billRes["total_before_vat"] != "336.45" || billRes["total_vat_value"] != "23.55" {
		t.Fatalf("expected before_vat=336.45 vat=23.55, got before=%v vat=%v", billRes["total_before_vat"], billRes["total_vat_value"])
	}

	// Verify GL debit == credit in database
	var sumDebit, sumCredit string
	err := store.Pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(debit), 0)::numeric(18,2)::text, COALESCE(SUM(credit), 0)::numeric(18,2)::text
		FROM gl_journal_detail WHERE doc_no = $1 AND trans_flag = 44`, docNo).Scan(&sumDebit, &sumCredit)
	if err != nil {
		t.Fatalf("query gl_journal_detail failed: %v", err)
	}
	if sumDebit != "360.00" || sumCredit != "360.00" {
		t.Fatalf("GL out of balance for %s: debit=%s credit=%s", docNo, sumDebit, sumCredit)
	}

	// Idempotency check
	status, dupRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/bills", billPayload)
	if status != http.StatusOK || dupRes["duplicate"] != true {
		t.Fatalf("expected duplicate=true on second submission, got: %v", dupRes)
	}

	// 6. Restore check
	status, restoreRes := doJSONRequest(t, router, http.MethodGet, "/api/v1/pos/restore?machine_code=POS-01&limit=10", nil)
	if status != http.StatusOK || restoreRes["ok"] != true {
		t.Fatalf("restore failed: status=%d body=%v", status, restoreRes)
	}

	// 7. Upsert & delete item
	testCode := fmt.Sprintf("TEST-ITEM-%d", time.Now().UnixNano()%100000)
	status, upsertRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/shift", map[string]any{
		"action":    "upsert_item",
		"code":      testCode,
		"name_1":    "กาแฟส้มยูซุพิเศษ",
		"unit_code": "แก้ว",
		"category":  "COFFEE",
		"price":     "125.50",
	})
	if status != http.StatusOK || upsertRes["status"] != "UPSERTED" {
		t.Fatalf("upsert_item failed: status=%d body=%v", status, upsertRes)
	}

	// 8. Upload binary image for item & fetch it back
	pngBytes := cloudflare.GeneratePlaceholderPNG(testCode)
	imgReq := httptest.NewRequest(http.MethodPost, "/api/v1/pos/image?code="+testCode, bytes.NewReader(pngBytes))
	imgReq.Header.Set("Content-Type", "image/png")
	imgReq.Header.Set("X-Item-Code", testCode)
	imgRec := httptest.NewRecorder()
	router.ServeHTTP(imgRec, imgReq)
	if imgRec.Code != http.StatusOK {
		t.Fatalf("image upload failed: status=%d body=%s", imgRec.Code, imgRec.Body.String())
	}

	getImgReq := httptest.NewRequest(http.MethodGet, "/api/v1/pos/image?code="+testCode, nil)
	getImgRec := httptest.NewRecorder()
	router.ServeHTTP(getImgRec, getImgReq)
	if getImgRec.Code != http.StatusOK || getImgRec.Body.Len() == 0 {
		t.Fatalf("image get failed: status=%d len=%d", getImgRec.Code, getImgRec.Body.Len())
	}

	status, delRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/shift", map[string]any{
		"action": "delete_item",
		"code":   testCode,
	})
	if status != http.StatusOK || delRes["status"] != "DELETED" {
		t.Fatalf("delete_item failed: status=%d body=%v", status, delRes)
	}

	// 9. Cancel Bill & verify GL reversal (trans_flag = 45)
	status, cancelRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/shift", map[string]any{
		"action":       "cancel_bill",
		"doc_no":       docNo,
		"reason":       "ทดสอบยกเลิกบิล",
		"cancelled_by": "OWNER-01",
	})
	if status != http.StatusOK || cancelRes["status"] != "CANCELLED" {
		t.Fatalf("cancel_bill failed: status=%d body=%v", status, cancelRes)
	}

	cancelDocNo, _ := cancelRes["cancel_doc_no"].(string)
	var revDebit, revCredit string
	err = store.Pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(debit), 0)::numeric(18,2)::text, COALESCE(SUM(credit), 0)::numeric(18,2)::text
		FROM gl_journal_detail WHERE doc_no = $1 AND trans_flag = 45`, cancelDocNo).Scan(&revDebit, &revCredit)
	if err != nil || revDebit != "360.00" || revCredit != "360.00" {
		t.Fatalf("expected reversed GL debit=360.00 credit=360.00, got debit=%s credit=%s err=%v", revDebit, revCredit, err)
	}

	// 10. Save config
	status, cfgRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/config", map[string]any{
		"section":   "startup",
		"shop_name": "DOME Pos Cafe & Craft Beer",
		"vat_type":  1,
		"vat_rate":  "7.00",
	})
	if status != http.StatusOK || cfgRes["status"] != "SAVED" {
		t.Fatalf("save config failed: status=%d body=%v", status, cfgRes)
	}

	// 11. Close shift
	status, closeRes := doJSONRequest(t, router, http.MethodPost, "/api/v1/pos/shift", map[string]any{
		"action":       "close_shift",
		"period_guid":  periodGUID,
		"pos_id":       "POS-01",
		"cashier_code": "CASHIER-01",
		"actual_cash":  "1650.00",
	})
	if status != http.StatusOK || closeRes["status"] != "CLOSED" {
		t.Fatalf("close_shift failed: status=%d body=%v", status, closeRes)
	}
}
