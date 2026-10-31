package cloudflare

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// D1Client communicates with Cloudflare D1 via the official Cloudflare v4 REST API:
// POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query
type D1Client struct {
	AccountID  string
	DatabaseID string
	APIToken   string
	BaseURL    string
	HTTPClient *http.Client
}

type D1QueryRequest struct {
	SQL    string `json:"sql"`
	Params []any  `json:"params,omitempty"`
}

type D1APIResponse struct {
	Success bool `json:"success"`
	Errors  []struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"errors"`
	Result []struct {
		Success bool             `json:"success"`
		Results []map[string]any `json:"results"`
		Meta    map[string]any   `json:"meta"`
	} `json:"result"`
}

func NewD1ClientFromEnv() *D1Client {
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("CLOUDFLARE_API_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = "https://api.cloudflare.com/client/v4"
	}
	return &D1Client{
		AccountID:  strings.TrimSpace(os.Getenv("CLOUDFLARE_ACCOUNT_ID")),
		DatabaseID: strings.TrimSpace(os.Getenv("CLOUDFLARE_D1_DATABASE_ID")),
		APIToken:   strings.TrimSpace(os.Getenv("CLOUDFLARE_API_TOKEN")),
		BaseURL:    baseURL,
		HTTPClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func isPlaceholder(val string) bool {
	v := strings.ToLower(strings.TrimSpace(val))
	return v == "" || strings.HasPrefix(v, "your_") || strings.HasPrefix(v, "example_") || v == "00000000-0000-0000-0000-000000000000"
}

// IsConfigured returns true when real Cloudflare D1 credentials are provided.
func (c *D1Client) IsConfigured() bool {
	if c == nil {
		return false
	}
	return !isPlaceholder(c.AccountID) && !isPlaceholder(c.DatabaseID) && !isPlaceholder(c.APIToken)
}

func (c *D1Client) Endpoint() string {
	return fmt.Sprintf("%s/accounts/%s/d1/database/%s/query", strings.TrimRight(c.BaseURL, "/"), c.AccountID, c.DatabaseID)
}

// Query executes a parameterized SQL statement against Cloudflare D1.
func (c *D1Client) Query(ctx context.Context, sqlStmt string, params ...any) ([]map[string]any, error) {
	if !c.IsConfigured() {
		return nil, nil
	}
	reqBody, err := json.Marshal(D1QueryRequest{
		SQL:    sqlStmt,
		Params: params,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Endpoint(), bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("cloudflare d1 http %d: %s", resp.StatusCode, string(raw))
	}

	var parsed D1APIResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	if !parsed.Success {
		if len(parsed.Errors) > 0 {
			return nil, fmt.Errorf("cloudflare d1 error %d: %s", parsed.Errors[0].Code, parsed.Errors[0].Message)
		}
		return nil, fmt.Errorf("cloudflare d1 query unsuccessful")
	}
	if len(parsed.Result) == 0 {
		return []map[string]any{}, nil
	}
	return parsed.Result[0].Results, nil
}
