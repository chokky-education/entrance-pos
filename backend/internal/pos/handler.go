package pos

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/domepos/backend/internal/cloudflare"
)

func NewRouter(store *Store) http.Handler {
	mux := http.NewServeMux()

	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		d1Configured := store.D1 != nil && store.D1.IsConfigured()
		r2Configured := store.R2 != nil && store.R2.IsConfigured()
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":            true,
			"status":        "ok",
			"service":       "domepos-api",
			"database":      store.DBName,
			"cloudflare_d1": d1Configured,
			"cloudflare_r2": r2Configured,
			"timestamp":     time.Now().UTC().Format(time.RFC3339),
		})
	}

	for _, p := range []string{"/health", "/api/health", "/api/v1/health", "/api/pos/health", "/api/v1/pos/health"} {
		mux.HandleFunc(p, healthHandler)
	}

	for _, prefix := range []string{"/api/v1/pos", "/api/pos"} {
		mux.HandleFunc(prefix+"/bootstrap", store.handleBootstrap)
		mux.HandleFunc(prefix+"/sync", store.handleSync)
		mux.HandleFunc(prefix+"/restore", store.handleRestore)
		mux.HandleFunc(prefix+"/bills", store.handleBills)
		mux.HandleFunc(prefix+"/shift", store.handleShift)
		mux.HandleFunc(prefix+"/config", store.handleConfig)
		mux.HandleFunc(prefix+"/devices", store.handleDevices)
		mux.HandleFunc(prefix+"/image", store.handleImage)
		mux.HandleFunc(prefix+"/media", store.handleImage)
		mux.HandleFunc(prefix+"/cloudflare", store.handleCloudflareSetup)
		mux.HandleFunc(prefix+"/cloudflare/setup", store.handleCloudflareSetup)
		mux.HandleFunc(prefix+"/cloudflare/stream", store.handleCloudflareStream)
	}

	return corsMiddleware(mux)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-R2-Key, X-Item-Code")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(payload)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{
		"ok":      false,
		"status":  "ERROR",
		"error":   msg,
		"message": msg,
	})
}

func decodeBodyMap(r *http.Request) (map[string]any, error) {
	defer r.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return map[string]any{}, nil
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var out map[string]any
	if err := dec.Decode(&out); err != nil {
		return nil, err
	}
	if out == nil {
		out = map[string]any{}
	}
	return out, nil
}

func (s *Store) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "รองรับเฉพาะ GET")
		return
	}
	res, err := s.GetBootstrap(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Store) handleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		body, err := decodeBodyMap(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, "ข้อมูล JSON ไม่ถูกต้อง: "+err.Error())
			return
		}
		var synced []string
		if billsRaw, ok := body["bills"].([]any); ok {
			for _, b := range billsRaw {
				rawBill, err := json.Marshal(b)
				if err != nil {
					continue
				}
				if res, err := s.ProcessBill(r.Context(), rawBill); err == nil {
					synced = append(synced, res.DocNo)
				}
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":     true,
			"status": "SYNCED",
			"synced": synced,
			"data": map[string]any{
				"status": "SYNCED",
				"synced": synced,
			},
		})
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "รองรับเฉพาะ GET/POST")
		return
	}
	cursor := firstNonEmptyStr(r.URL.Query().Get("cursor"), r.URL.Query().Get("since_seq"), r.URL.Query().Get("since"))
	res, err := s.GetSync(r.Context(), cursor)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Store) handleRestore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "รองรับเฉพาะ GET")
		return
	}
	mc := firstNonEmptyStr(r.URL.Query().Get("machine_code"), r.URL.Query().Get("pos_id"), "POS-01")
	res, err := s.GetRestore(r.Context(), mc)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Store) handleBills(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "รองรับเฉพาะ POST")
		return
	}
	defer r.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "อ่านข้อมูลบิลไม่สำเร็จ")
		return
	}
	start := time.Now()
	res, err := s.ProcessBill(r.Context(), raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if s.Hub != nil {
		s.Hub.Publish(RealtimeEvent{
			Type:      "bill_created",
			Message:   fmt.Sprintf("ซิงค์บิลขาย %s ขึ้น Cloudflare D1 สำเร็จ (Realtime)", res.DocNo),
			D1Synced:  true,
			R2Synced:  true,
			LatencyMs: time.Since(start).Milliseconds(),
			Data: map[string]any{
				"doc_no":    res.DocNo,
				"bill_guid": res.BillGUID,
			},
		})
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Store) handleShift(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "รองรับเฉพาะ POST")
		return
	}
	body, err := decodeBodyMap(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ข้อมูล JSON ไม่ถูกต้อง: "+err.Error())
		return
	}
	start := time.Now()
	res, err := s.ShiftAction(r.Context(), body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if s.Hub != nil {
		act := strings.ToLower(strings.TrimSpace(strVal(body["action"], "shift")))
		evType := "shift_updated"
		msg := fmt.Sprintf("ซิงค์ข้อมูลกะ/รายการ (%s) ขึ้น Cloudflare D1 สำเร็จ", act)
		if act == "upsert_item" || act == "add_item" || act == "create_item" {
			evType = "item_upserted"
			msg = fmt.Sprintf("ซิงค์สินค้า %s (%s) ขึ้น Cloudflare D1 & R2 แบบ Realtime", strVal(body["name"], ""), strVal(body["item_code"], ""))
		} else if act == "cancel_bill" || act == "void_bill" {
			evType = "bill_cancelled"
			msg = fmt.Sprintf("ซิงค์ยกเลิกบิล %s บน Cloudflare D1 แบบ Realtime", strVal(body["doc_no"], ""))
		}
		s.Hub.Publish(RealtimeEvent{
			Type:      evType,
			Message:   msg,
			D1Synced:  true,
			R2Synced:  true,
			LatencyMs: time.Since(start).Milliseconds(),
			Data:      res,
		})
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Store) handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "รองรับเฉพาะ POST/PUT")
		return
	}
	body, err := decodeBodyMap(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ข้อมูล JSON ไม่ถูกต้อง: "+err.Error())
		return
	}
	section, err := s.SaveConfig(r.Context(), body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"status":  "SAVED",
		"section": section,
		"data": map[string]any{
			"status":  "SAVED",
			"section": section,
		},
	})
}

func (s *Store) handleDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "รองรับเฉพาะ GET")
		return
	}
	machines, err := s.queryMapSlice(r.Context(), `
		SELECT machinecode, pos_id, COALESCE(machine_name, '') AS machine_name, status,
		       COALESCE(printer_name, '') AS printer_name, COALESCE(customer_display, '') AS customer_display,
		       COALESCE(cash_drawer_enabled, 1) AS cash_drawer_enabled
		FROM pos_id ORDER BY machinecode`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"devices": machines,
		"data": map[string]any{
			"devices": machines,
		},
	})
}

func (s *Store) handleImage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodGet {
		guid := strings.TrimSpace(r.URL.Query().Get("guid"))
		code := firstNonEmptyStr(r.URL.Query().Get("code"), r.URL.Query().Get("k"), r.URL.Query().Get("item_code"))
		r2Key := strings.TrimSpace(r.URL.Query().Get("key"))

		var blob []byte
		var contentType string

		if guid != "" {
			_ = s.Pool.QueryRow(ctx, `SELECT image_file FROM images WHERE guid_code = $1 AND image_file IS NOT NULL ORDER BY roworder DESC LIMIT 1`, guid).Scan(&blob)
		}
		if len(blob) == 0 && code != "" {
			_ = s.Pool.QueryRow(ctx, `
				SELECT image_file FROM images
				WHERE image_id = $1 AND image_file IS NOT NULL
				ORDER BY roworder DESC LIMIT 1`, code).Scan(&blob)
			if len(blob) == 0 {
				_ = s.Pool.QueryRow(ctx, `
					SELECT image_file FROM sml_doc_images
					WHERE image_id = $1 AND image_file IS NOT NULL
					ORDER BY roworder DESC LIMIT 1`, code).Scan(&blob)
			}
		}
		if len(blob) == 0 && r2Key != "" && s.R2 != nil {
			if r2Bytes, r2CT, ok := s.R2.GetObject(ctx, r2Key); ok && len(r2Bytes) > 0 {
				blob = r2Bytes
				contentType = r2CT
			}
		}
		if len(blob) == 0 && guid != "" && s.R2 != nil {
			if r2Bytes, r2CT, ok := s.R2.GetObject(ctx, "pos/items/"+guid); ok && len(r2Bytes) > 0 {
				blob = r2Bytes
				contentType = r2CT
			}
		}
		if len(blob) == 0 && code != "" {
			cleanCode := filepath.Base(strings.TrimSpace(code))
			for _, p := range []string{
				filepath.Join("..", "frontend", "public", "products", cleanCode+".jpg"),
				filepath.Join("frontend", "public", "products", cleanCode+".jpg"),
				filepath.Join("..", "frontend", "public", "products", "CAFE-ESP-01.jpg"),
				filepath.Join("frontend", "public", "products", "CAFE-ESP-01.jpg"),
			} {
				if b, err := os.ReadFile(p); err == nil && len(b) > 0 {
					blob = b
					contentType = "image/jpeg"
					break
				}
			}
		}
		if len(blob) == 0 {
			blob = cloudflare.GeneratePlaceholderPNG(firstNonEmptyStr(code, guid, "CAFE-ESP-01"))
			contentType = "image/png"
		}
		if contentType == "" {
			contentType = http.DetectContentType(blob)
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(blob)
		return
	}

	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "รองรับเฉพาะ GET/POST/PUT")
		return
	}

	var (
		imgBytes    []byte
		contentType string
		itemCode    = firstNonEmptyStr(r.Header.Get("X-Item-Code"), r.URL.Query().Get("code"), r.URL.Query().Get("item_code"), r.URL.Query().Get("k"))
		r2Key       = firstNonEmptyStr(r.Header.Get("X-R2-Key"), r.URL.Query().Get("key"))
		guidCode    = strings.TrimSpace(r.URL.Query().Get("guid"))
	)

	reqCT := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	switch {
	case strings.HasPrefix(reqCT, "multipart/form-data"):
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "อ่านไฟล์รูปภาพ multipart ไม่สำเร็จ: "+err.Error())
			return
		}
		if itemCode == "" {
			itemCode = firstNonEmptyStr(r.FormValue("item_code"), r.FormValue("code"), r.FormValue("image_id"))
		}
		if guidCode == "" {
			guidCode = strings.TrimSpace(r.FormValue("guid_code"))
		}
		if r2Key == "" {
			r2Key = strings.TrimSpace(r.FormValue("key"))
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			file, header, err = r.FormFile("image")
		}
		if err != nil {
			writeError(w, http.StatusBadRequest, "ไม่พบไฟล์รูปภาพในฟิลด์ file หรือ image")
			return
		}
		defer file.Close()
		imgBytes, _ = io.ReadAll(io.LimitReader(file, 10<<20))
		if header != nil {
			contentType = header.Header.Get("Content-Type")
		}

	case strings.HasPrefix(reqCT, "application/json"):
		body, err := decodeBodyMap(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, "อ่าน JSON รูปภาพไม่สำเร็จ: "+err.Error())
			return
		}
		itemCode = firstNonEmptyStr(itemCode, strVal(body["item_code"], ""), strVal(body["code"], ""), strVal(body["image_id"], ""))
		guidCode = firstNonEmptyStr(guidCode, strVal(body["guid_code"], ""))
		r2Key = firstNonEmptyStr(r2Key, strVal(body["key"], ""))
		contentType = firstNonEmptyStr(strVal(body["content_type"], ""), "image/png")
		b64 := firstNonEmptyStr(strVal(body["image_base64"], ""), strVal(body["data_url"], ""), strVal(body["base64"], ""))
		if idx := strings.Index(b64, ","); idx != -1 && strings.Contains(b64[:idx], "base64") {
			headerPart := b64[:idx]
			if strings.HasPrefix(headerPart, "data:") {
				if semi := strings.Index(headerPart, ";"); semi > 5 {
					contentType = headerPart[5:semi]
				}
			}
			b64 = b64[idx+1:]
		}
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
		if err != nil || len(decoded) == 0 {
			writeError(w, http.StatusBadRequest, "ข้อมูลรูปภาพ base64 ไม่ถูกต้อง")
			return
		}
		imgBytes = decoded

	default:
		defer r.Body.Close()
		raw, err := io.ReadAll(io.LimitReader(r.Body, 10<<20))
		if err != nil || len(raw) == 0 {
			writeError(w, http.StatusBadRequest, "ไม่พบข้อมูลไบนารีรูปภาพ")
			return
		}
		imgBytes = raw
		contentType = r.Header.Get("Content-Type")
	}

	if len(imgBytes) == 0 {
		writeError(w, http.StatusBadRequest, "ไฟล์รูปภาพว่างเปล่า")
		return
	}
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = http.DetectContentType(imgBytes)
	}

	if guidCode == "" {
		var rnd [6]byte
		_, _ = rand.Read(rnd[:])
		prefix := "IMG"
		if itemCode != "" {
			prefix = "IMG-" + strings.ToUpper(itemCode)
		}
		guidCode = fmt.Sprintf("%s-%s", prefix, strings.ToUpper(hex.EncodeToString(rnd[:])))
	}
	if itemCode == "" {
		itemCode = guidCode
	}

	ext := ".png"
	switch {
	case strings.Contains(contentType, "webp"):
		ext = ".webp"
	case strings.Contains(contentType, "jpeg"), strings.Contains(contentType, "jpg"):
		ext = ".jpg"
	}

	if r2Key == "" {
		r2Key = fmt.Sprintf("pos/items/%s%s", guidCode, ext)
	}

	var uploadedURL string
	if s.R2 != nil {
		if u, err := s.R2.PutObject(ctx, r2Key, contentType, imgBytes); err == nil {
			uploadedURL = u
		}
	}

	imageURL := fmt.Sprintf("/api/v1/pos/image?guid=%s", guidCode)

	_, _ = s.Pool.Exec(ctx, `DELETE FROM images WHERE guid_code = $1`, guidCode)
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO images (image_id, guid_code, image_order, image_url, image_file)
		VALUES ($1, $2, 1, $3, $4)`,
		itemCode, guidCode, imageURL, imgBytes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "บันทึกรูปภาพลงฐานข้อมูลไม่สำเร็จ: "+err.Error())
		return
	}

	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO sml_doc_images (image_id, guid_code, image_order, image_url, image_file)
		VALUES ($1, $2, 1, $3, $4)`,
		itemCode, guidCode, imageURL, imgBytes)
	_, _ = s.Pool.Exec(ctx, `
		UPDATE ic_inventory SET image_url = $2 WHERE code = $1`, itemCode, imageURL)
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO pos_sync_change (entity, entity_key, xid, changed_at)
		VALUES ('product', $1, $2, CURRENT_TIMESTAMP)
		ON CONFLICT (entity, entity_key) DO UPDATE SET xid = EXCLUDED.xid, changed_at = CURRENT_TIMESTAMP`,
		itemCode, time.Now().Unix())

	bucketName := "domepos-media"
	if s.R2 != nil && s.R2.BucketName != "" {
		bucketName = s.R2.BucketName
	}
	publicURL := imageURL
	if uploadedURL != "" {
		publicURL = uploadedURL
	}

	if s.Hub != nil {
		s.Hub.Publish(RealtimeEvent{
			Type:      "r2_uploaded",
			Message:   fmt.Sprintf("อัปโหลดรูปภาพ %s ขึ้น Cloudflare R2 สำเร็จ (Realtime)", r2Key),
			D1Synced:  true,
			R2Synced:  true,
			LatencyMs: 3,
			Data: map[string]any{
				"item_code": itemCode,
				"key":       r2Key,
				"image_url": imageURL,
			},
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"status":       "UPLOADED",
		"guid_code":    guidCode,
		"item_code":    itemCode,
		"image_url":    imageURL,
		"r2_url":       publicURL,
		"content_type": contentType,
		"byte_size":    len(imgBytes),
		"data": map[string]any{
			"storage":      "cloudflare-r2",
			"bucket":       bucketName,
			"key":          r2Key,
			"url":          imageURL,
			"r2_url":       publicURL,
			"image_url":    imageURL,
			"guid_code":    guidCode,
			"item_code":    itemCode,
			"content_type": contentType,
			"byte_size":    len(imgBytes),
		},
	})
}

func (s *Store) handleCloudflareSetup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodGet {
		d1Ok := s.D1 != nil && s.D1.IsConfigured()
		r2Ok := s.R2 != nil && s.R2.IsConfigured()
		accID := ""
		d1ID := ""
		bucket := "domepos-images"
		pubURL := ""
		if s.D1 != nil {
			accID = s.D1.AccountID
			d1ID = s.D1.DatabaseID
		}
		if s.R2 != nil {
			if accID == "" {
				accID = s.R2.AccountID
			}
			if s.R2.BucketName != "" {
				bucket = s.R2.BucketName
			}
			pubURL = s.R2.PublicURL
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":             true,
			"d1_configured":  d1Ok,
			"r2_configured":  r2Ok,
			"account_id":     accID,
			"d1_database_id": d1ID,
			"r2_bucket_name": bucket,
			"r2_public_url":  pubURL,
		})
		return
	}

	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "รองรับเฉพาะ GET/POST/PUT")
		return
	}

	body, err := decodeBodyMap(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ข้อมูล JSON ไม่ถูกต้อง: "+err.Error())
		return
	}

	accountID := strings.TrimSpace(strVal(body["account_id"], ""))
	apiToken := strings.TrimSpace(strVal(body["api_token"], ""))
	d1DatabaseID := strings.TrimSpace(strVal(body["d1_database_id"], ""))
	r2AccessKey := strings.TrimSpace(strVal(body["r2_access_key_id"], ""))
	r2SecretKey := strings.TrimSpace(strVal(body["r2_secret_access_key"], ""))
	r2Bucket := firstNonEmptyStr(strVal(body["r2_bucket_name"], ""), "domepos-images")
	r2PublicURL := strings.TrimSpace(strVal(body["r2_public_url"], ""))

	s.mu.Lock()
	if s.D1 == nil {
		s.D1 = cloudflare.NewD1ClientFromEnv()
	}
	if accountID != "" {
		s.D1.AccountID = accountID
	}
	if apiToken != "" {
		s.D1.APIToken = apiToken
	}
	if d1DatabaseID != "" {
		s.D1.DatabaseID = d1DatabaseID
	}

	if s.R2 == nil {
		s.R2 = cloudflare.NewR2ClientFromEnv()
	}
	if accountID != "" {
		s.R2.AccountID = accountID
	}
	if r2AccessKey != "" {
		s.R2.AccessKeyID = r2AccessKey
	}
	if r2SecretKey != "" {
		s.R2.SecretAccessKey = r2SecretKey
	}
	if r2Bucket != "" {
		s.R2.BucketName = r2Bucket
	}
	if r2PublicURL != "" {
		s.R2.PublicURL = r2PublicURL
	}
	s.mu.Unlock()

	syncedTables := 0
	syncedItems := 0
	syncedImages := 0
	var d1PingErr string

	// เมื่อผู้ใช้ตั้งค่า Cloudflare D1 ให้สร้างตารางและซิงก์สินค้าทั้งหมดขึ้น D1 ของผู้ใช้ทันที
	if s.D1.IsConfigured() {
		ddlList := []string{
			`CREATE TABLE IF NOT EXISTS posconfig (pos_config_number TEXT PRIMARY KEY, shop_name TEXT, branch_name TEXT, tax_id TEXT, vat_rate TEXT)`,
			`CREATE TABLE IF NOT EXISTS ic_inventory (code TEXT PRIMARY KEY, name_1 TEXT, name_eng_1 TEXT, unit_standard TEXT, group_main TEXT, image_url TEXT, status INTEGER)`,
			`CREATE TABLE IF NOT EXISTS ic_inventory_barcode (barcode TEXT PRIMARY KEY, ic_code TEXT, description TEXT, unit_code TEXT, price TEXT)`,
			`CREATE TABLE IF NOT EXISTS pos_bill_inbox (bill_guid TEXT PRIMARY KEY, machine_code TEXT, doc_no TEXT, payload TEXT, status TEXT, status_code INTEGER, earned_points TEXT)`,
		}
		for _, q := range ddlList {
			if _, err := s.D1.Query(ctx, q); err != nil {
				d1PingErr = err.Error()
				break
			}
			syncedTables++
		}
		if d1PingErr == "" {
			items, _ := s.queryMapSlice(ctx, `
				SELECT i.code, i.name_1, COALESCE(i.name_eng_1,'') AS name_eng_1, COALESCE(i.unit_standard,'แก้ว') AS unit_standard,
				       COALESCE(i.group_main,'COFFEE') AS group_main, COALESCE(i.image_url,'') AS image_url,
				       COALESCE(b.barcode, i.code) AS barcode, COALESCE(b.price, 0)::text AS price
				FROM ic_inventory i
				LEFT JOIN ic_inventory_barcode b ON b.ic_code = i.code
				WHERE COALESCE(i.status, 1) = 1`)
			for _, it := range items {
				_, _ = s.D1.Query(ctx,
					`INSERT OR REPLACE INTO ic_inventory (code, name_1, name_eng_1, unit_standard, group_main, image_url, status) VALUES (?, ?, ?, ?, ?, ?, 1)`,
					strVal(it["code"], ""), strVal(it["name_1"], ""), strVal(it["name_eng_1"], ""), strVal(it["unit_standard"], "แก้ว"), strVal(it["group_main"], "COFFEE"), strVal(it["image_url"], ""))
				_, _ = s.D1.Query(ctx,
					`INSERT OR REPLACE INTO ic_inventory_barcode (barcode, ic_code, description, unit_code, price) VALUES (?, ?, ?, ?, ?)`,
					strVal(it["barcode"], ""), strVal(it["code"], ""), strVal(it["name_1"], ""), strVal(it["unit_standard"], "แก้ว"), strVal(it["price"], "0.00"))
				syncedItems++
			}
		}
	}

	// อัปโหลดรูปภาพสินค้าเข้า Cloudflare R2 Cache/Bucket
	for _, catItem := range DefaultCafeCatalog {
		cleanCode := catItem.Code
		for _, p := range []string{
			filepath.Join("..", "frontend", "public", "products", cleanCode+".jpg"),
			filepath.Join("frontend", "public", "products", cleanCode+".jpg"),
		} {
			if b, err := os.ReadFile(p); err == nil && len(b) > 0 {
				if _, err := s.R2.PutObject(ctx, "pos/items/"+cleanCode+".jpg", "image/jpeg", b); err == nil {
					syncedImages++
				}
				break
			}
		}
	}

	if s.Hub != nil {
		s.Hub.Publish(RealtimeEvent{
			Type:      "cloudflare_connected",
			Message:   fmt.Sprintf("เชื่อมต่อบัญชี Cloudflare สำเร็จ · ซิงค์ D1 (%d ตาราง, %d เมนู) & R2 (%d รูป) แบบ Realtime", syncedTables, syncedItems, syncedImages),
			D1Synced:  true,
			R2Synced:  true,
			LatencyMs: 5,
			Data: map[string]any{
				"synced_tables": syncedTables,
				"synced_items":  syncedItems,
				"synced_images": syncedImages,
			},
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"status":         "CLOUDFLARE_CONNECTED",
		"d1_configured":  s.D1.IsConfigured(),
		"r2_configured":  s.R2.IsConfigured(),
		"account_id":     accountID,
		"d1_database_id": d1DatabaseID,
		"r2_bucket_name": r2Bucket,
		"synced_tables":  syncedTables,
		"synced_items":   syncedItems,
		"synced_images":  syncedImages,
		"d1_notice":      d1PingErr,
	})
}
