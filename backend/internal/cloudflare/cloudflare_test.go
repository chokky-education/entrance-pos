package cloudflare

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestD1ClientQuery(t *testing.T) {
	var receivedSQL string
	var receivedAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		var req D1QueryRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		receivedSQL = req.SQL
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"errors":[],"result":[{"success":true,"results":[{"code":"CAFE-ESP-01","price":"75.00"}]}]}`))
	}))
	defer srv.Close()

	client := &D1Client{
		AccountID:  "cf-acc-12345",
		DatabaseID: "cf-d1-db-67890",
		APIToken:   "cf-test-token-abc",
		BaseURL:    srv.URL,
		HTTPClient: srv.Client(),
	}
	if !client.IsConfigured() {
		t.Fatal("expected D1Client to be configured")
	}

	rows, err := client.Query(context.Background(), "SELECT code, price FROM ic_inventory WHERE code = ?", "CAFE-ESP-01")
	if err != nil {
		t.Fatalf("unexpected D1 query error: %v", err)
	}
	if receivedAuth != "Bearer cf-test-token-abc" {
		t.Fatalf("unexpected auth header: %s", receivedAuth)
	}
	if !strings.Contains(receivedSQL, "SELECT code, price") {
		t.Fatalf("unexpected SQL: %s", receivedSQL)
	}
	if len(rows) != 1 || rows[0]["code"] != "CAFE-ESP-01" {
		t.Fatalf("unexpected D1 result rows: %+v", rows)
	}
}

func TestR2ClientPutAndGetSigV4(t *testing.T) {
	var sawSigV4 bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 ") {
			sawSigV4 = true
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	r2 := &R2Client{
		AccountID:        "cf-r2-acc-123",
		AccessKeyID:      "r2-access-key",
		SecretAccessKey:  "r2-secret-key", // pragma: allowlist secret (fake test value)
		BucketName:       "domepos-media",
		PublicURL:        "https://media.domepos.test/domepos-media",
		EndpointOverride: srv.URL,
		HTTPClient:       srv.Client(),
		memStore:         make(map[string]r2Object),
	}

	pngBytes := GeneratePlaceholderPNG("CAFE-ESP-01")
	pubURL, err := r2.PutObject(context.Background(), "products/CAFE-ESP-01.png", "image/png", pngBytes)
	if err != nil {
		t.Fatalf("PutObject failed: %v", err)
	}
	if !sawSigV4 {
		t.Fatal("expected R2 PutObject to sign request with AWS4-HMAC-SHA256")
	}
	if pubURL != "https://media.domepos.test/domepos-media/products/CAFE-ESP-01.png" {
		t.Fatalf("unexpected public URL: %s", pubURL)
	}

	gotBytes, ct, ok := r2.GetObject(context.Background(), "products/CAFE-ESP-01.png")
	if !ok || ct != "image/png" || len(gotBytes) != len(pngBytes) {
		t.Fatalf("unexpected GetObject result: ok=%v ct=%s len=%d", ok, ct, len(gotBytes))
	}
}
