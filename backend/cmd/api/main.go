package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/domepos/backend/internal/pos"
)

func main() {
	_ = godotenv.Load(".env.local", "../.env.local", "../../.env.local", ".env")

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	cfg := pos.LoadDBConfigFromEnv()
	store, err := pos.InitStore(ctx, cfg)
	cancel()
	if err != nil {
		log.Fatalf("[domepos-api] database initialization failed (db=%s): %v", cfg.Database, err)
	}
	defer store.Close()

	port := strings.TrimSpace(os.Getenv("HTTP_PORT"))
	if port == "" {
		port = strings.TrimSpace(os.Getenv("PORT"))
	}
	if port == "" {
		port = "8085"
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           pos.NewRouter(store),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("[domepos-api] listening on http://127.0.0.1:%s (db=%s, d1=%v, r2=%v)",
			port, store.DBName, store.D1.IsConfigured(), store.R2.IsConfigured())
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[domepos-api] server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
}
