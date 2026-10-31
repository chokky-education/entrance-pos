package cloudflare

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// R2Client provides S3-compatible AWS Signature V4 uploads and downloads for Cloudflare R2
// with automatic in-memory fallback when running offline/local tests.
type R2Client struct {
	AccountID       string
	AccessKeyID     string
	SecretAccessKey string
	BucketName      string
	PublicURL       string
	EndpointOverride string
	HTTPClient      *http.Client

	mu       sync.RWMutex
	memStore map[string]r2Object
}

type r2Object struct {
	Data        []byte
	ContentType string
	UpdatedAt   time.Time
}

func NewR2ClientFromEnv() *R2Client {
	accID := strings.TrimSpace(os.Getenv("R2_ACCOUNT_ID"))
	if accID == "" {
		accID = strings.TrimSpace(os.Getenv("CLOUDFLARE_ACCOUNT_ID"))
	}
	bucket := strings.TrimSpace(os.Getenv("R2_BUCKET_NAME"))
	if bucket == "" {
		bucket = "domepos-media"
	}
	pubURL := strings.TrimRight(strings.TrimSpace(os.Getenv("R2_PUBLIC_URL")), "/")
	if pubURL == "" {
		pubURL = strings.TrimRight(strings.TrimSpace(os.Getenv("NEXT_PUBLIC_R2_PUBLIC_URL")), "/")
	}
	if pubURL == "" {
		pubURL = fmt.Sprintf("https://r2.domepos.cloudflarestorage.com/%s", bucket)
	}
	return &R2Client{
		AccountID:        accID,
		AccessKeyID:      strings.TrimSpace(os.Getenv("R2_ACCESS_KEY_ID")),
		SecretAccessKey:  strings.TrimSpace(os.Getenv("R2_SECRET_ACCESS_KEY")),
		BucketName:       bucket,
		PublicURL:        pubURL,
		EndpointOverride: strings.TrimRight(strings.TrimSpace(os.Getenv("R2_ENDPOINT_URL")), "/"),
		HTTPClient:       &http.Client{Timeout: 20 * time.Second},
		memStore:         make(map[string]r2Object),
	}
}

func (r *R2Client) IsConfigured() bool {
	if r == nil {
		return false
	}
	return !isPlaceholder(r.AccountID) && !isPlaceholder(r.AccessKeyID) && !isPlaceholder(r.SecretAccessKey)
}

func (r *R2Client) host() string {
	if r.EndpointOverride != "" {
		trimmed := strings.TrimPrefix(strings.TrimPrefix(r.EndpointOverride, "https://"), "http://")
		return strings.Split(trimmed, "/")[0]
	}
	return fmt.Sprintf("%s.r2.cloudflarestorage.com", r.AccountID)
}

func (r *R2Client) objectEndpoint(key string) string {
	cleanKey := strings.TrimLeft(key, "/")
	if r.EndpointOverride != "" {
		return fmt.Sprintf("%s/%s/%s", r.EndpointOverride, r.BucketName, cleanKey)
	}
	return fmt.Sprintf("https://%s.r2.cloudflarestorage.com/%s/%s", r.AccountID, r.BucketName, cleanKey)
}

func (r *R2Client) ObjectPublicURL(key string) string {
	cleanKey := strings.TrimLeft(key, "/")
	return fmt.Sprintf("%s/%s", strings.TrimRight(r.PublicURL, "/"), cleanKey)
}

// PutObject stores bytes in Cloudflare R2 (via AWS SigV4 PUT) and caches locally for fast retrieval.
func (r *R2Client) PutObject(ctx context.Context, key, contentType string, data []byte) (string, error) {
	cleanKey := strings.TrimLeft(strings.TrimSpace(key), "/")
	if cleanKey == "" {
		return "", fmt.Errorf("r2 key is required")
	}
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}

	r.mu.Lock()
	r.memStore[cleanKey] = r2Object{
		Data:        append([]byte(nil), data...),
		ContentType: contentType,
		UpdatedAt:   time.Now().UTC(),
	}
	r.mu.Unlock()

	if r.IsConfigured() {
		req, err := http.NewRequestWithContext(ctx, http.MethodPut, r.objectEndpoint(cleanKey), bytes.NewReader(data))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", contentType)
		r.signV4(req, data, time.Now().UTC())
		resp, err := r.HTTPClient.Do(req)
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}
	}

	return r.ObjectPublicURL(cleanKey), nil
}

// GetObject retrieves an object from local cache or Cloudflare R2.
func (r *R2Client) GetObject(ctx context.Context, key string) ([]byte, string, bool) {
	cleanKey := strings.TrimLeft(strings.TrimSpace(key), "/")
	r.mu.RLock()
	obj, ok := r.memStore[cleanKey]
	r.mu.RUnlock()
	if ok && len(obj.Data) > 0 {
		return obj.Data, obj.ContentType, true
	}

	if r.IsConfigured() {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.objectEndpoint(cleanKey), nil)
		if err == nil {
			r.signV4(req, nil, time.Now().UTC())
			resp, err := r.HTTPClient.Do(req)
			if err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					raw, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
					if err == nil && len(raw) > 0 {
						ct := resp.Header.Get("Content-Type")
						if ct == "" {
							ct = http.DetectContentType(raw)
						}
						return raw, ct, true
					}
				}
			}
		}
	}
	return nil, "", false
}

// signV4 signs an HTTP request using AWS Signature V4 for Cloudflare R2 (region "auto", service "s3").
func (r *R2Client) signV4(req *http.Request, payload []byte, now time.Time) {
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	region := "auto"
	service := "s3"

	sum := sha256.Sum256(payload)
	payloadHash := hex.EncodeToString(sum[:])

	req.Header.Set("Host", r.host())
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadHash)

	signedHeaders := []string{"host", "x-amz-content-sha256", "x-amz-date"}
	sort.Strings(signedHeaders)

	var canonicalHeaders strings.Builder
	for _, h := range signedHeaders {
		var val string
		if h == "host" {
			val = r.host()
		} else {
			val = strings.TrimSpace(req.Header.Get(h))
		}
		canonicalHeaders.WriteString(h + ":" + val + "\n")
	}

	signedHeadersStr := strings.Join(signedHeaders, ";")
	canonicalURI := req.URL.EscapedPath()
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalQuery := req.URL.RawQuery

	canonicalReq := strings.Join([]string{
		req.Method,
		canonicalURI,
		canonicalQuery,
		canonicalHeaders.String(),
		signedHeadersStr,
		payloadHash,
	}, "\n")

	canonSum := sha256.Sum256([]byte(canonicalReq))
	credentialScope := fmt.Sprintf("%s/%s/%s/aws4_request", dateStamp, region, service)
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		hex.EncodeToString(canonSum[:]),
	}, "\n")

	kDate := hmacSHA256([]byte("AWS4"+r.SecretAccessKey), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	signature := hex.EncodeToString(hmacSHA256(kSigning, []byte(stringToSign)))

	authHeader := fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		r.AccessKeyID, credentialScope, signedHeadersStr, signature,
	)
	req.Header.Set("Authorization", authHeader)
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}

// GeneratePlaceholderPNG creates a lightweight 64x64 PNG thumbnail for a menu item or member.
func GeneratePlaceholderPNG(key string) []byte {
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	upper := strings.ToUpper(key)
	bg := color.RGBA{R: 180, G: 83, B: 9, A: 255} // Amber Coffee default
	switch {
	case strings.HasPrefix(upper, "BEER-"):
		bg = color.RGBA{R: 202, G: 138, B: 4, A: 255} // Craft Beer Gold
	case strings.HasPrefix(upper, "CAFE-TEA"):
		bg = color.RGBA{R: 5, G: 150, B: 105, A: 255} // Matcha Emerald
	case strings.HasPrefix(upper, "CAFE-BAK"):
		bg = color.RGBA{R: 234, G: 88, B: 12, A: 255} // Bakery Orange
	case strings.HasPrefix(upper, "BITE-"):
		bg = color.RGBA{R: 225, G: 29, B: 72, A: 255} // Bites Rose
	}
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			img.Set(x, y, bg)
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}
