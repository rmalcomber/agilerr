//go:build embedui

package main

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

//go:embed web/dist
var embeddedFrontend embed.FS

func (s *AgilerrService) RegisterFrontendRoutes(e *core.ServeEvent) {
	dist, err := fs.Sub(embeddedFrontend, "web/dist")
	if err != nil {
		s.app.Logger().Error("failed to load embedded frontend", "error", err)
		return
	}

	fileServer := http.FileServer(http.FS(dist))

	serveIndex := func(re *core.RequestEvent) error {
		indexHTML, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			return re.NotFoundError("Embedded frontend is unavailable.", err)
		}
		re.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
		return re.HTML(http.StatusOK, string(indexHTML))
	}

	e.Router.GET("/{path...}", func(re *core.RequestEvent) error {
		requestPath := strings.TrimPrefix(re.Request.PathValue("path"), "/")
		if requestPath == "" {
			return serveIndex(re)
		}

		cleanPath := path.Clean(requestPath)
		if cleanPath == "." {
			return serveIndex(re)
		}

		if file, err := dist.Open(cleanPath); err == nil {
			_ = file.Close()
			fileServer.ServeHTTP(re.Response, re.Request)
			return nil
		}

		return serveIndex(re)
	})
}
