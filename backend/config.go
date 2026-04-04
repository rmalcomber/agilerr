package main

import (
	"os"
	"time"
)

type Config struct {
	HTTPAddr       string
	DataDir        string
	AllowedOrigins []string

	AdminEmail    string
	AdminPassword string

	OpenAIAPIKey  string
	OpenAIBaseURL string
	OpenAIModel   string
	OpenAITimeout time.Duration
}

func loadConfig() Config {
	origins := splitCSV(envOrDefault("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"))

	return Config{
		HTTPAddr:       envOrDefault("HTTP_ADDR", "0.0.0.0:5040"),
		DataDir:        envOrDefault("PB_DATA_DIR", "./pb_data"),
		AllowedOrigins: origins,
		AdminEmail:     envOrDefault("ADMIN_EMAIL", "admin@agilerr.local"),
		AdminPassword:  envOrDefault("ADMIN_PASSWORD", "change-me-now"),
		OpenAIAPIKey:   os.Getenv("OPENAI_API_KEY"),
		OpenAIBaseURL:  envOrDefault("OPENAI_BASE_URL", "https://api.openai.com"),
		OpenAIModel:    envOrDefault("OPENAI_MODEL", "gpt-5-mini"),
		OpenAITimeout:  30 * time.Second,
	}
}
