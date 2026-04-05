package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	_ = godotenv.Load()

	cfg := loadConfig()
	app := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: cfg.DataDir,
	})

	if err := app.Bootstrap(); err != nil {
		log.Fatal(err)
	}

	service := &AgilerrService{
		app:        app,
		config:     cfg,
		httpClient: &http.Client{Timeout: cfg.OpenAITimeout},
	}

	if err := service.EnsureSchema(); err != nil {
		log.Fatal(err)
	}

	if err := service.EnsureAdmin(); err != nil {
		log.Fatal(err)
	}

	if err := service.EnsureDemoData(); err != nil {
		log.Fatal(err)
	}

	if len(os.Args) > 1 && strings.TrimSpace(os.Args[1]) == "mcp" {
		if err := service.RunMCPServer(); err != nil {
			log.Fatal(err)
		}
		return
	}

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		service.RegisterRoutes(e)
		service.RegisterFrontendRoutes(e)
		return e.Next()
	})

	log.Printf("Agilerr backend listening on %s", cfg.HTTPAddr)
	if cfg.GeneratedHTTPAddr {
		log.Printf("HTTP_ADDR was not set. Generated local default: %s", cfg.HTTPAddr)
	}
	if cfg.GeneratedAPIKey {
		log.Printf("AGILERR_API_KEY was not set. Generated API key for this run: %s", cfg.APIKey)
	}
	if err := apis.Serve(app, apis.ServeConfig{
		HttpAddr:        cfg.HTTPAddr,
		ShowStartBanner: false,
		AllowedOrigins:  cfg.AllowedOrigins,
	}); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
