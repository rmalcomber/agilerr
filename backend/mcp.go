package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const mcpProtocolVersion = "2025-03-26"

type mcpRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type mcpResponse struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id,omitempty"`
	Result  any       `json:"result,omitempty"`
	Error   *mcpError `json:"error,omitempty"`
}

type mcpError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

func (s *AgilerrService) RunMCPServer() error {
	log.Printf("Agilerr MCP server running over stdio")
	reader := bufio.NewReader(os.Stdin)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}

		line = bytesTrimSpace(line)
		if len(line) == 0 {
			continue
		}

		var req mcpRequest
		if err := json.Unmarshal(line, &req); err != nil {
			if err := writeMCPMessage(writer, mcpResponse{
				JSONRPC: "2.0",
				Error:   &mcpError{Code: -32700, Message: "parse error"},
			}); err != nil {
				return err
			}
			continue
		}

		resp := s.handleMCPRequest(req)
		if resp == nil {
			continue
		}
		if err := writeMCPMessage(writer, resp); err != nil {
			return err
		}
	}
}

func (s *AgilerrService) RegisterMCPRoutes(e *core.ServeEvent) {
	e.Router.GET("/mcp", s.handleMCPHTTPInfo)
	e.Router.OPTIONS("/mcp", s.handleMCPHTTPOptions)
	e.Router.Group("/mcp").BindFunc(s.requireAPIAccess).POST("", s.handleMCPHTTP)
}

func (s *AgilerrService) handleMCPHTTPInfo(e *core.RequestEvent) error {
	e.Response.Header().Set("Allow", "POST, OPTIONS")
	return e.JSON(http.StatusMethodNotAllowed, map[string]any{
		"error":           "use POST for MCP over HTTP",
		"protocolVersion": mcpProtocolVersion,
		"auth":            "Provide X-API-Key or a valid PocketBase auth token.",
	})
}

func (s *AgilerrService) handleMCPHTTPOptions(e *core.RequestEvent) error {
	e.Response.Header().Set("Allow", "POST, OPTIONS")
	return e.NoContent(http.StatusNoContent)
}

func (s *AgilerrService) handleMCPHTTP(e *core.RequestEvent) error {
	body, err := io.ReadAll(e.Request.Body)
	if err != nil {
		return e.JSON(http.StatusBadRequest, mcpResponse{
			JSONRPC: "2.0",
			Error:   &mcpError{Code: -32700, Message: "failed to read request body"},
		})
	}

	body = bytesTrimSpace(body)
	if len(body) == 0 {
		return e.JSON(http.StatusBadRequest, mcpResponse{
			JSONRPC: "2.0",
			Error:   &mcpError{Code: -32700, Message: "request body is required"},
		})
	}

	if body[0] == '[' {
		var requests []mcpRequest
		if err := json.Unmarshal(body, &requests); err != nil {
			return e.JSON(http.StatusBadRequest, mcpResponse{
				JSONRPC: "2.0",
				Error:   &mcpError{Code: -32700, Message: "parse error"},
			})
		}
		if len(requests) == 0 {
			return e.JSON(http.StatusBadRequest, mcpResponse{
				JSONRPC: "2.0",
				Error:   &mcpError{Code: -32600, Message: "invalid request"},
			})
		}

		responses := make([]mcpResponse, 0, len(requests))
		for _, req := range requests {
			resp := s.handleMCPRequest(req)
			if resp != nil {
				responses = append(responses, *resp)
			}
		}
		if len(responses) == 0 {
			return e.NoContent(http.StatusAccepted)
		}
		return e.JSON(http.StatusOK, responses)
	}

	var request mcpRequest
	if err := json.Unmarshal(body, &request); err != nil {
		return e.JSON(http.StatusBadRequest, mcpResponse{
			JSONRPC: "2.0",
			Error:   &mcpError{Code: -32700, Message: "parse error"},
		})
	}

	response := s.handleMCPRequest(request)
	if response == nil {
		return e.NoContent(http.StatusAccepted)
	}
	return e.JSON(http.StatusOK, response)
}

func (s *AgilerrService) handleMCPRequest(req mcpRequest) *mcpResponse {
	if req.JSONRPC != "" && req.JSONRPC != "2.0" {
		return &mcpResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &mcpError{Code: -32600, Message: "invalid jsonrpc version"},
		}
	}
	switch req.Method {
	case "initialize":
		return &mcpResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]any{
				"protocolVersion": mcpProtocolVersion,
				"capabilities": map[string]any{
					"tools": map[string]any{
						"listChanged": false,
					},
				},
				"serverInfo": map[string]any{
					"name":    "agilerr-mcp",
					"version": "1.0.0",
				},
				"instructions": "Use this server to discover Agilerr projects and create backlog items through MCP.",
			},
		}
	case "notifications/initialized":
		return nil
	case "ping":
		return &mcpResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  map[string]any{},
		}
	case "tools/list":
		return &mcpResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]any{
				"tools": s.mcpTools(),
			},
		}
	case "tools/call":
		result, err := s.handleMCPToolCall(req.Params)
		if err != nil {
			return &mcpResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &mcpError{Code: -32000, Message: err.Error()},
			}
		}
		return &mcpResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  result,
		}
	default:
		if req.ID == nil {
			return nil
		}
		return &mcpResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &mcpError{Code: -32601, Message: "method not found"},
		}
	}
}

func (s *AgilerrService) mcpTools() []mcpTool {
	return []mcpTool{
		{
			Name:        "list_projects",
			Description: "List all Agilerr projects with their ids and metadata.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
		},
		{
			Name:        "list_project_items",
			Description: "List items in a project so an agent can inspect ids before creating child items.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectId": map[string]any{
						"type":        "string",
						"description": "The Agilerr project id.",
					},
				},
				"required": []string{"projectId"},
			},
		},
		{
			Name:        "add_item",
			Description: "Create a new Agilerr item in a project, optionally under a parent item.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectId":   map[string]any{"type": "string", "description": "The Agilerr project id."},
					"parentId":    map[string]any{"type": "string", "description": "Optional parent item id."},
					"type":        map[string]any{"type": "string", "enum": []string{"epic", "feature", "story", "task", "bug"}},
					"status":      map[string]any{"type": "string", "enum": []string{"triage", "todo", "in_progress", "review", "done"}},
					"priority":    map[string]any{"type": "string", "enum": []string{"critical", "high", "medium", "low"}},
					"title":       map[string]any{"type": "string"},
					"description": map[string]any{"type": "string"},
					"tags":        map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					"assigneeId":  map[string]any{"type": "string", "description": "Optional user id to assign."},
				},
				"required": []string{"projectId", "type", "title"},
			},
		},
	}
}

func (s *AgilerrService) handleMCPToolCall(raw json.RawMessage) (map[string]any, error) {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, errors.New("invalid tools/call params")
	}

	switch params.Name {
	case "list_projects":
		projects, err := s.mcpListProjects()
		if err != nil {
			return mcpToolError(err), nil
		}
		return mcpToolText(projects), nil
	case "list_project_items":
		var args struct {
			ProjectID string `json:"projectId"`
		}
		if err := json.Unmarshal(params.Arguments, &args); err != nil {
			return nil, errors.New("invalid arguments for list_project_items")
		}
		items, err := s.mcpListProjectItems(strings.TrimSpace(args.ProjectID))
		if err != nil {
			return mcpToolError(err), nil
		}
		return mcpToolText(items), nil
	case "add_item":
		var args SaveUnitRequest
		if err := json.Unmarshal(params.Arguments, &args); err != nil {
			return nil, errors.New("invalid arguments for add_item")
		}
		created, err := s.mcpAddItem(args)
		if err != nil {
			return mcpToolError(err), nil
		}
		return mcpToolText(created), nil
	default:
		return nil, fmt.Errorf("unknown tool %q", params.Name)
	}
}

func (s *AgilerrService) mcpListProjects() (string, error) {
	records, err := s.app.FindRecordsByFilter(collectionProjects, "", "name", 0, 0)
	if err != nil {
		return "", err
	}
	projects := make([]ProjectDTO, 0, len(records))
	for _, record := range records {
		projects = append(projects, recordToProject(record))
	}
	data, err := json.MarshalIndent(projects, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (s *AgilerrService) mcpListProjectItems(projectID string) (string, error) {
	if projectID == "" {
		return "", errors.New("projectId is required")
	}
	if _, err := findProject(s.app, projectID); err != nil {
		return "", errors.New("project not found")
	}
	records, err := loadProjectRecords(s.app, projectID)
	if err != nil {
		return "", err
	}
	items := make([]UnitDTO, 0, len(records))
	for _, record := range records {
		items = append(items, recordToUnit(record))
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Type == items[j].Type {
			return items[i].Title < items[j].Title
		}
		return items[i].Type < items[j].Type
	})
	data, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (s *AgilerrService) mcpAddItem(req SaveUnitRequest) (string, error) {
	req.ProjectID = strings.TrimSpace(req.ProjectID)
	req.ParentID = strings.TrimSpace(req.ParentID)
	req.AssigneeID = strings.TrimSpace(req.AssigneeID)
	req.Type = strings.ToLower(strings.TrimSpace(req.Type))
	req.Status = strings.ToLower(strings.TrimSpace(req.Status))
	req.Priority = strings.ToLower(strings.TrimSpace(req.Priority))
	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	req.Tags = normalizeTags(req.Tags)
	if req.Status == "" {
		req.Status = "todo"
	}
	if req.Type == "bug" && req.Status == "todo" {
		req.Status = "triage"
	}

	projectRecord, err := findProject(s.app, req.ProjectID)
	if err != nil {
		return "", errors.New("project not found")
	}
	if err := validateUnitPayload(req); err != nil {
		return "", err
	}
	if err := validateAssignee(s.app, req.AssigneeID); err != nil {
		return "", err
	}

	parent, err := fetchParent(s.app, req.ParentID)
	if err != nil {
		return "", err
	}
	if err := validateHierarchy(parent, req); err != nil {
		return "", err
	}

	collection, err := s.app.FindCollectionByNameOrId(collectionUnits)
	if err != nil {
		return "", err
	}
	actor, err := s.findAPIActor()
	if err != nil {
		return "", err
	}

	record := core.NewRecord(collection)
	record.Set("project", req.ProjectID)
	record.Set("parent", req.ParentID)
	record.Set("assignee", req.AssigneeID)
	record.Set("type", req.Type)
	record.Set("status", req.Status)
	record.Set("priority", req.Priority)
	record.Set("title", req.Title)
	record.Set("description", req.Description)
	record.Set("color", projectColorForType(projectRecord, req.Type))
	record.Set("tags", req.Tags)
	record.Set("position", float64(nowUnixMilli()))
	record.Set("createdBy", actor.Id)

	if err := s.app.Save(record); err != nil {
		return "", err
	}

	dto := recordToUnit(record.Fresh())
	data, err := json.MarshalIndent(dto, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func mcpToolText(text string) map[string]any {
	return map[string]any{
		"content": []map[string]any{
			{
				"type": "text",
				"text": text,
			},
		},
		"isError": false,
	}
}

func mcpToolError(err error) map[string]any {
	return map[string]any{
		"content": []map[string]any{
			{
				"type": "text",
				"text": err.Error(),
			},
		},
		"isError": true,
	}
}

func writeMCPMessage(writer *bufio.Writer, message any) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}
	if _, err := writer.Write(append(data, '\n')); err != nil {
		return err
	}
	return writer.Flush()
}

func bytesTrimSpace(input []byte) []byte {
	return []byte(strings.TrimSpace(string(input)))
}

func nowUnixMilli() int64 {
	return time.Now().UnixMilli()
}
