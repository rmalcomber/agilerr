package main

import (
	"crypto/rand"
	"encoding/hex"
	"math/big"
	"os"
	"time"
)

type Config struct {
	HTTPAddr          string
	GeneratedHTTPAddr bool
	DataDir           string
	AllowedOrigins    []string

	AdminEmail      string
	AdminPassword   string
	APIKey          string
	GeneratedAPIKey bool

	OpenAIAPIKey  string
	OpenAIBaseURL string
	OpenAIModel   string
	OpenAITimeout time.Duration
}

func loadConfig() Config {
	origins := splitCSV(envOrDefault("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"))
	httpAddr, generatedHTTPAddr := envOrGeneratedHTTPAddr("HTTP_ADDR")
	apiKey, generatedAPIKey := envOrGeneratedSecret("AGILERR_API_KEY", 24)

	return Config{
		HTTPAddr:          httpAddr,
		GeneratedHTTPAddr: generatedHTTPAddr,
		DataDir:           envOrDefault("PB_DATA_DIR", "./pb_data"),
		AllowedOrigins:    origins,
		AdminEmail:        envOrDefault("ADMIN_EMAIL", "admin@agilerr.local"),
		AdminPassword:     envOrDefault("ADMIN_PASSWORD", "change-me-now"),
		APIKey:            apiKey,
		GeneratedAPIKey:   generatedAPIKey,
		OpenAIAPIKey:      os.Getenv("OPENAI_API_KEY"),
		OpenAIBaseURL:     envOrDefault("OPENAI_BASE_URL", "https://api.openai.com"),
		OpenAIModel:       envOrDefault("OPENAI_MODEL", "gpt-5-mini"),
		OpenAITimeout:     30 * time.Second,
	}
}

func envOrGeneratedHTTPAddr(key string) (string, bool) {
	if value := envOrDefault(key, ""); value != "" {
		return value, false
	}
	port, err := randomPort(20000, 59999)
	if err != nil {
		return "127.0.0.1:38473", true
	}
	return "127.0.0.1:" + port, true
}

func envOrGeneratedSecret(key string, bytesLen int) (string, bool) {
	if value := envOrDefault(key, ""); value != "" {
		return value, false
	}
	buf := make([]byte, bytesLen)
	if _, err := rand.Read(buf); err != nil {
		return "agilerr-fallback-key-change-me", true
	}
	return hex.EncodeToString(buf), true
}

func randomPort(min, max int64) (string, error) {
	if max <= min {
		max = min + 1
	}
	n, err := rand.Int(rand.Reader, big.NewInt(max-min+1))
	if err != nil {
		return "", err
	}
	return big.NewInt(min + n.Int64()).String(), nil
}
