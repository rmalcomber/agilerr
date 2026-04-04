package main

import (
	"bytes"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

type AgilerrService struct {
	app        *pocketbase.PocketBase
	config     Config
	httpClient *http.Client
}

func (s *AgilerrService) EnsureAdmin() error {
	if strings.TrimSpace(s.config.AdminEmail) == "" || strings.TrimSpace(s.config.AdminPassword) == "" {
		return errors.New("admin credentials must be configured")
	}

	superusers, err := s.app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		return err
	}

	admin, err := s.app.FindAuthRecordByEmail(superusers, s.config.AdminEmail)
	if err != nil {
		admin = core.NewRecord(superusers)
	}

	admin.SetEmail(s.config.AdminEmail)
	admin.SetPassword(s.config.AdminPassword)
	if err := s.app.Save(admin); err != nil {
		return err
	}

	users, err := s.app.FindCollectionByNameOrId(collectionUsers)
	if err != nil {
		return err
	}

	adminUser, err := s.app.FindAuthRecordByEmail(users, s.config.AdminEmail)
	if err != nil {
		adminUser = core.NewRecord(users)
	}

	adminUser.SetEmail(s.config.AdminEmail)
	adminUser.SetPassword(s.config.AdminPassword)
	adminUser.Set("name", "Administrator")

	return s.app.Save(adminUser)
}

func (s *AgilerrService) RegisterRoutes(e *core.ServeEvent) {
	group := e.Router.Group("/api/agilerr").Bind(apis.RequireAuth(collectionUsers))

	group.GET("/me", s.handleMe)
	group.GET("/projects", s.handleProjectsList)
	group.POST("/projects", s.handleProjectCreate)
	group.GET("/projects/{projectId}", s.handleProjectTree)
	group.PATCH("/projects/{projectId}", s.handleProjectUpdate)
	group.GET("/projects/{projectId}/suggest", s.handleSuggestions)
	group.POST("/projects/{projectId}/units", s.handleUnitCreate)
	group.PATCH("/units/{unitId}", s.handleUnitUpdate)
	group.POST("/units/{unitId}/move", s.handleUnitMove)
	group.DELETE("/units/{unitId}", s.handleUnitDelete)
	group.GET("/units/{unitId}/comments", s.handleCommentsList)
	group.POST("/units/{unitId}/comments", s.handleCommentCreate)
	group.POST("/smart-add", s.handleSmartAdd)
}

func (s *AgilerrService) handleMe(e *core.RequestEvent) error {
	return e.JSON(http.StatusOK, map[string]any{
		"user": recordToUser(e.Auth),
	})
}

func (s *AgilerrService) handleProjectsList(e *core.RequestEvent) error {
	records, err := s.app.FindRecordsByFilter(collectionProjects, "", "name", 0, 0)
	if err != nil {
		return serverError(e, err)
	}

	projects := make([]ProjectDTO, 0, len(records))
	for _, record := range records {
		projects = append(projects, recordToProject(record))
	}

	return e.JSON(http.StatusOK, map[string]any{"projects": projects})
}

func (s *AgilerrService) handleProjectCreate(e *core.RequestEvent) error {
	var req CreateProjectRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return badRequest(e, "project name is required", nil)
	}

	collection, err := s.app.FindCollectionByNameOrId(collectionProjects)
	if err != nil {
		return serverError(e, err)
	}

	record := core.NewRecord(collection)
	record.Set("name", req.Name)
	record.Set("description", strings.TrimSpace(req.Description))
	record.Set("color", firstNonEmpty(strings.TrimSpace(req.Color), defaultProjectColor))
	record.Set("tags", normalizeTags(req.Tags))
	record.Set("unitColors", normalizeUnitColors(req.UnitColors))

	if err := s.app.Save(record); err != nil {
		return badRequest(e, "failed to save project", err)
	}
	record = record.Fresh()

	return e.JSON(http.StatusCreated, map[string]any{"project": recordToProject(record)})
}

func (s *AgilerrService) handleProjectUpdate(e *core.RequestEvent) error {
	projectRecord, err := findProject(s.app, e.Request.PathValue("projectId"))
	if err != nil {
		return notFound(e, "project not found")
	}

	var req CreateProjectRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}

	req.Name = firstNonEmpty(strings.TrimSpace(req.Name), projectRecord.GetString("name"))
	if req.Name == "" {
		return badRequest(e, "project name is required", nil)
	}

	projectRecord.Set("name", req.Name)
	projectRecord.Set("description", strings.TrimSpace(req.Description))
	projectRecord.Set("color", firstNonEmpty(strings.TrimSpace(req.Color), projectRecord.GetString("color"), defaultProjectColor))
	projectRecord.Set("tags", normalizeTags(req.Tags))
	projectRecord.Set("unitColors", normalizeUnitColors(req.UnitColors))

	if err := s.app.Save(projectRecord); err != nil {
		return badRequest(e, "failed to update project", err)
	}
	if err := s.syncProjectItemColors(projectRecord); err != nil {
		return serverError(e, err)
	}
	projectRecord = projectRecord.Fresh()

	return e.JSON(http.StatusOK, map[string]any{"project": recordToProject(projectRecord)})
}

func (s *AgilerrService) handleProjectTree(e *core.RequestEvent) error {
	projectID := e.Request.PathValue("projectId")

	projectRecord, err := findProject(s.app, projectID)
	if err != nil {
		return notFound(e, "project not found")
	}

	unitRecords, err := loadProjectRecords(s.app, projectID)
	if err != nil {
		return serverError(e, err)
	}

	unitIDs := make([]string, 0, len(unitRecords))
	units := make([]UnitDTO, 0, len(unitRecords))
	for _, record := range unitRecords {
		unitIDs = append(unitIDs, record.Id)
		units = append(units, recordToUnit(record))
	}

	commentRecords, err := loadProjectComments(s.app, unitIDs)
	if err != nil {
		return serverError(e, err)
	}

	comments := make([]CommentDTO, 0, len(commentRecords))
	for _, record := range commentRecords {
		comments = append(comments, recordToComment(record))
	}

	userRecords, err := loadAllUsers(s.app)
	if err != nil {
		return serverError(e, err)
	}

	users := make([]UserDTO, 0, len(userRecords))
	for _, record := range userRecords {
		users = append(users, recordToUser(record))
	}

	sort.Slice(units, func(i, j int) bool {
		if units[i].Status == units[j].Status {
			if units[i].Position == units[j].Position {
				return units[i].Created.Before(units[j].Created)
			}
			return units[i].Position < units[j].Position
		}
		return units[i].Status < units[j].Status
	})

	sort.Slice(comments, func(i, j int) bool {
		return comments[i].Created.Before(comments[j].Created)
	})

	project := recordToProject(projectRecord)
	return e.JSON(http.StatusOK, ProjectTreeResponse{
		Project:  project,
		Units:    units,
		Comments: comments,
		Users:    users,
		Tags:     uniqueTags(project, units),
	})
}

func (s *AgilerrService) handleUnitCreate(e *core.RequestEvent) error {
	projectID := e.Request.PathValue("projectId")

	var req SaveUnitRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}
	req.ProjectID = projectID
	req.Tags = normalizeTags(req.Tags)
	req.Status = firstNonEmpty(strings.TrimSpace(req.Status), "todo")
	req.Priority = strings.ToLower(strings.TrimSpace(req.Priority))
	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	if strings.EqualFold(req.Type, "bug") && req.Status == "todo" {
		req.Status = "triage"
	}

	projectRecord, err := findProject(s.app, projectID)
	if err != nil {
		return notFound(e, "project not found")
	}
	if err := validateUnitPayload(req); err != nil {
		return badRequest(e, err.Error(), err)
	}

	parent, err := fetchParent(s.app, req.ParentID)
	if err != nil {
		return badRequest(e, err.Error(), err)
	}
	if err := validateHierarchy(parent, req); err != nil {
		return badRequest(e, err.Error(), err)
	}

	collection, err := s.app.FindCollectionByNameOrId(collectionUnits)
	if err != nil {
		return serverError(e, err)
	}

	record := core.NewRecord(collection)
	record.Set("project", req.ProjectID)
	record.Set("parent", strings.TrimSpace(req.ParentID))
	record.Set("type", strings.ToLower(req.Type))
	record.Set("status", strings.ToLower(req.Status))
	record.Set("priority", req.Priority)
	record.Set("title", req.Title)
	record.Set("description", req.Description)
	record.Set("color", projectColorForType(projectRecord, req.Type))
	record.Set("tags", req.Tags)
	record.Set("position", float64(time.Now().UnixMilli()))
	record.Set("createdBy", e.Auth.Id)

	if err := s.app.Save(record); err != nil {
		return badRequest(e, "failed to save unit", err)
	}
	record = record.Fresh()

	return e.JSON(http.StatusCreated, map[string]any{"unit": recordToUnit(record)})
}

func (s *AgilerrService) handleUnitUpdate(e *core.RequestEvent) error {
	unitRecord, err := findUnit(s.app, e.Request.PathValue("unitId"))
	if err != nil {
		return notFound(e, "unit not found")
	}

	var req SaveUnitRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}

	req.ProjectID = firstNonEmpty(strings.TrimSpace(req.ProjectID), unitRecord.GetString("project"))
	req.ParentID = strings.TrimSpace(req.ParentID)
	req.Type = firstNonEmpty(strings.TrimSpace(req.Type), unitRecord.GetString("type"))
	req.Status = firstNonEmpty(strings.TrimSpace(req.Status), unitRecord.GetString("status"))
	req.Priority = firstNonEmpty(strings.TrimSpace(req.Priority), unitRecord.GetString("priority"))
	req.Title = firstNonEmpty(strings.TrimSpace(req.Title), unitRecord.GetString("title"))
	req.Description = strings.TrimSpace(req.Description)
	req.Tags = normalizeTags(req.Tags)

	if err := validateUnitPayload(req); err != nil {
		return badRequest(e, err.Error(), err)
	}
	projectRecord, err := findProject(s.app, req.ProjectID)
	if err != nil {
		return notFound(e, "project not found")
	}

	parent, err := fetchParent(s.app, req.ParentID)
	if err != nil {
		return badRequest(e, err.Error(), err)
	}
	if parent != nil && parent.Id == unitRecord.Id {
		return badRequest(e, "a unit cannot be its own parent", nil)
	}
	if err := validateHierarchy(parent, req); err != nil {
		return badRequest(e, err.Error(), err)
	}

	unitRecord.Set("project", req.ProjectID)
	unitRecord.Set("parent", req.ParentID)
	unitRecord.Set("type", req.Type)
	unitRecord.Set("status", req.Status)
	unitRecord.Set("priority", req.Priority)
	unitRecord.Set("title", req.Title)
	unitRecord.Set("description", req.Description)
	unitRecord.Set("color", projectColorForType(projectRecord, req.Type))
	unitRecord.Set("tags", req.Tags)

	if err := s.app.Save(unitRecord); err != nil {
		return badRequest(e, "failed to update unit", err)
	}
	unitRecord = unitRecord.Fresh()

	return e.JSON(http.StatusOK, map[string]any{"unit": recordToUnit(unitRecord)})
}

func (s *AgilerrService) handleUnitMove(e *core.RequestEvent) error {
	unitRecord, err := findUnit(s.app, e.Request.PathValue("unitId"))
	if err != nil {
		return notFound(e, "unit not found")
	}

	var req MoveUnitRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}
	req.Status = strings.ToLower(strings.TrimSpace(req.Status))
	if !contains(unitStatuses, req.Status) {
		return badRequest(e, "invalid status", nil)
	}
	if unitRecord.GetString("type") == "bug" {
		if !contains(unitStatuses, req.Status) {
			return badRequest(e, "invalid bug status", nil)
		}
	} else if req.Status == "triage" {
		return badRequest(e, "triage status is only valid for bugs", nil)
	}

	unitRecord.Set("status", req.Status)
	unitRecord.Set("position", float64(time.Now().UnixMilli()))

	if err := s.app.Save(unitRecord); err != nil {
		return badRequest(e, "failed to move unit", err)
	}
	unitRecord = unitRecord.Fresh()

	return e.JSON(http.StatusOK, map[string]any{"unit": recordToUnit(unitRecord)})
}

func (s *AgilerrService) handleUnitDelete(e *core.RequestEvent) error {
	unitRecord, err := findUnit(s.app, e.Request.PathValue("unitId"))
	if err != nil {
		return notFound(e, "unit not found")
	}

	children, err := s.app.FindAllRecords(collectionUnits, dbx.HashExp{"parent": unitRecord.Id})
	if err != nil {
		return serverError(e, err)
	}
	if len(children) > 0 {
		return badRequest(e, "delete child units before deleting this unit", nil)
	}

	comments, err := s.app.FindAllRecords(collectionComments, dbx.HashExp{"unit": unitRecord.Id})
	if err != nil {
		return serverError(e, err)
	}
	for _, comment := range comments {
		if err := s.app.Delete(comment); err != nil {
			return serverError(e, err)
		}
	}

	if err := s.app.Delete(unitRecord); err != nil {
		return serverError(e, err)
	}

	return e.NoContent(http.StatusNoContent)
}

func (s *AgilerrService) handleCommentsList(e *core.RequestEvent) error {
	unitID := e.Request.PathValue("unitId")
	if _, err := findUnit(s.app, unitID); err != nil {
		return notFound(e, "unit not found")
	}

	records, err := s.app.FindRecordsByFilter(collectionComments, "unit = {:unit}", "created", 0, 0, dbx.Params{"unit": unitID})
	if err != nil {
		return serverError(e, err)
	}

	comments := make([]CommentDTO, 0, len(records))
	for _, record := range records {
		comments = append(comments, recordToComment(record))
	}

	return e.JSON(http.StatusOK, map[string]any{"comments": comments})
}

func (s *AgilerrService) handleCommentCreate(e *core.RequestEvent) error {
	unitRecord, err := findUnit(s.app, e.Request.PathValue("unitId"))
	if err != nil {
		return notFound(e, "unit not found")
	}

	var req CreateCommentRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}
	req.Body = strings.TrimSpace(req.Body)
	req.Mentions = normalizeMentions(req.Mentions)
	if req.Body == "" {
		return badRequest(e, "comment body is required", nil)
	}

	collection, err := s.app.FindCollectionByNameOrId(collectionComments)
	if err != nil {
		return serverError(e, err)
	}

	record := core.NewRecord(collection)
	record.Set("unit", unitRecord.Id)
	record.Set("author", e.Auth.Id)
	record.Set("body", req.Body)
	record.Set("mentions", req.Mentions)

	if err := s.app.Save(record); err != nil {
		return badRequest(e, "failed to save comment", err)
	}
	record = record.Fresh()

	return e.JSON(http.StatusCreated, map[string]any{"comment": recordToComment(record)})
}

func (s *AgilerrService) handleSuggestions(e *core.RequestEvent) error {
	projectID := e.Request.PathValue("projectId")
	query := strings.ToLower(strings.TrimSpace(e.Request.URL.Query().Get("q")))

	unitRecords, err := loadProjectRecords(s.app, projectID)
	if err != nil {
		return serverError(e, err)
	}
	userRecords, err := loadAllUsers(s.app)
	if err != nil {
		return serverError(e, err)
	}

	type simpleItem struct {
		ID    string `json:"id"`
		Label string `json:"label"`
	}

	tagsMap := map[string]bool{}
	units := make([]simpleItem, 0)
	for _, unit := range unitRecords {
		dto := recordToUnit(unit)
		if query == "" || strings.Contains(strings.ToLower(dto.Title), query) {
			units = append(units, simpleItem{ID: dto.ID, Label: dto.Title})
		}
		for _, tag := range dto.Tags {
			if query == "" || strings.Contains(strings.ToLower(tag), query) {
				tagsMap[tag] = true
			}
		}
	}

	users := make([]simpleItem, 0)
	for _, user := range userRecords {
		dto := recordToUser(user)
		if query == "" || strings.Contains(strings.ToLower(dto.Name), query) || strings.Contains(strings.ToLower(dto.Email), query) {
			users = append(users, simpleItem{ID: dto.ID, Label: dto.Name})
		}
	}

	tags := make([]string, 0, len(tagsMap))
	for tag := range tagsMap {
		tags = append(tags, tag)
	}
	sort.Strings(tags)

	return e.JSON(http.StatusOK, map[string]any{
		"units": units,
		"users": users,
		"tags":  tags,
	})
}

func (s *AgilerrService) handleSmartAdd(e *core.RequestEvent) error {
	var req SmartAddRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}

	result, err := s.runSmartAdd(req)
	if err != nil {
		return e.JSON(http.StatusServiceUnavailable, map[string]any{
			"error": err.Error(),
		})
	}

	return e.JSON(http.StatusOK, result)
}

func (s *AgilerrService) runSmartAdd(req SmartAddRequest) (SmartAddResponse, error) {
	if strings.TrimSpace(s.config.OpenAIAPIKey) == "" {
		return SmartAddResponse{}, errors.New("smart add is not configured because OPENAI_API_KEY is missing")
	}

	type chatMessage struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	payload := struct {
		Model       string        `json:"model"`
		Temperature float64       `json:"temperature"`
		Messages    []chatMessage `json:"messages"`
	}{
		Model:       s.config.OpenAIModel,
		Temperature: 0.3,
		Messages: []chatMessage{
			{
				Role: "system",
				Content: "You help shape Agile backlog items. Reply with JSON only using keys: ready, assistantMessage, suggestedTitle, suggestedDescription. Ask concise clarification questions until the item is actionable. When enough context exists, set ready=true and return polished markdown-friendly title and description.",
			},
			{
				Role: "user",
				Content: fmt.Sprintf("Unit type: %s\nCurrent title: %s\nCurrent description:\n%s", req.UnitType, req.Title, req.Description),
			},
		},
	}

	for _, msg := range req.Messages {
		payload.Messages = append(payload.Messages, chatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return SmartAddResponse{}, err
	}

	endpoint, err := url.JoinPath(strings.TrimRight(s.config.OpenAIBaseURL, "/"), "/v1/chat/completions")
	if err != nil {
		return SmartAddResponse{}, err
	}

	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return SmartAddResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.config.OpenAIAPIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return SmartAddResponse{}, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return SmartAddResponse{}, err
	}
	if resp.StatusCode >= 300 {
		return SmartAddResponse{}, fmt.Errorf("smart add request failed: %s", strings.TrimSpace(string(raw)))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return SmartAddResponse{}, err
	}
	if len(parsed.Choices) == 0 {
		return SmartAddResponse{}, errors.New("smart add returned no choices")
	}

	content := strings.TrimSpace(parsed.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var result SmartAddResponse
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return SmartAddResponse{}, fmt.Errorf("smart add returned invalid JSON: %w", err)
	}
	return result, nil
}

func (s *AgilerrService) syncProjectItemColors(projectRecord *core.Record) error {
	unitRecords, err := loadProjectRecords(s.app, projectRecord.Id)
	if err != nil {
		return err
	}
	for _, record := range unitRecords {
		record.Set("color", projectColorForType(projectRecord, record.GetString("type")))
		if err := s.app.SaveNoValidate(record); err != nil {
			return err
		}
	}
	return nil
}

func gravatarURL(email string) string {
	sum := md5.Sum([]byte(strings.ToLower(strings.TrimSpace(email))))
	return "https://www.gravatar.com/avatar/" + hex.EncodeToString(sum[:]) + "?d=identicon&s=120"
}

func badRequest(e *core.RequestEvent, message string, err error) error {
	if err == nil {
		return e.JSON(http.StatusBadRequest, map[string]any{"error": message})
	}
	return e.JSON(http.StatusBadRequest, map[string]any{"error": message, "details": err.Error()})
}

func notFound(e *core.RequestEvent, message string) error {
	return e.JSON(http.StatusNotFound, map[string]any{"error": message})
}

func serverError(e *core.RequestEvent, err error) error {
	return e.JSON(http.StatusInternalServerError, map[string]any{"error": "internal server error", "details": err.Error()})
}
