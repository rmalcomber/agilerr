package main

import (
	"crypto/md5"
	"encoding/hex"
	"errors"
	"net/http"
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

type HardDeleteRequest struct {
	ProjectIDs []string `json:"projectIds"`
	UnitIDs    []string `json:"unitIds"`
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

func (s *AgilerrService) EnsureDemoData() error {
	existingProjects, err := s.app.FindAllRecords(collectionProjects)
	if err != nil {
		return err
	}
	if len(existingProjects) > 0 {
		return nil
	}

	adminUser, err := s.findAPIActor()
	if err != nil {
		return err
	}

	projectCollection, err := s.app.FindCollectionByNameOrId(collectionProjects)
	if err != nil {
		return err
	}
	projectRecord := core.NewRecord(projectCollection)
	projectRecord.Set("name", "Demo Project")
	projectRecord.Set("description", "Seeded example project for first-run exploration of backlog, kanban, bugs, and AI planning.")
	projectRecord.Set("color", defaultProjectColor)
	projectRecord.Set("tags", []string{"demo", "sample", "onboarding"})
	projectRecord.Set("unitColors", normalizeUnitColors(nil))
	projectRecord.Set("statusColors", normalizeStatusColors(nil))
	projectRecord.Set("deletedAt", "")
	if err := s.app.Save(projectRecord); err != nil {
		return err
	}
	projectRecord = projectRecord.Fresh()

	unitsCollection, err := s.app.FindCollectionByNameOrId(collectionUnits)
	if err != nil {
		return err
	}

	createSeedItem := func(parentID, unitType, status, title, description string, tags []string) (*core.Record, error) {
		record := core.NewRecord(unitsCollection)
		record.Set("project", projectRecord.Id)
		record.Set("parent", parentID)
		record.Set("type", unitType)
		record.Set("status", status)
		record.Set("title", title)
		record.Set("description", description)
		record.Set("color", projectColorForType(projectRecord, unitType))
		record.Set("tags", normalizeTags(tags))
		record.Set("position", float64(time.Now().UnixMilli()))
		record.Set("createdBy", adminUser.Id)
		record.Set("deletedAt", "")
		if err := s.app.Save(record); err != nil {
			return nil, err
		}
		return record.Fresh(), nil
	}

	epic, err := createSeedItem("", "epic", "in_progress", "Foundations and Delivery", "Core work to stand up Agilerr, validate the flow, and show how the hierarchy works.", []string{"platform", "mvp"})
	if err != nil {
		return err
	}
	feature, err := createSeedItem(epic.Id, "feature", "todo", "Board Navigation", "Create a clear path through dashboard, kanban, backlog, API, and MCP documentation.", []string{"ux", "navigation"})
	if err != nil {
		return err
	}
	story, err := createSeedItem(feature.Id, "story", "review", "As a scrum user I can understand project state quickly", "Show a dashboard with useful counts, assigned work, and fast entry points into the board and backlog.", []string{"dashboard", "workflow"})
	if err != nil {
		return err
	}
	if _, err := createSeedItem(story.Id, "task", "todo", "Tighten dashboard metrics", "Review the dashboard cards and make sure the counts and quick links feel useful during a demo.", []string{"dev", "polish"}); err != nil {
		return err
	}
	if _, err := createSeedItem("", "bug", "triage", "Bug reports should start in triage", "Verify that new bugs stay out of the main backlog tree and enter the dedicated bug workflow in triage.", []string{"bugs", "triage"}); err != nil {
		return err
	}

	return nil
}

func (s *AgilerrService) RegisterRoutes(e *core.ServeEvent) {
	group := e.Router.Group("/api/agilerr").BindFunc(s.requireAPIAccess)
	s.RegisterMCPRoutes(e)

	group.GET("/me", s.handleMe)
	group.GET("/docs-config", s.handleDocsConfig)
	group.GET("/projects", s.handleProjectsList)
	group.POST("/projects", s.handleProjectCreate)
	group.GET("/projects/{projectId}/delete-preview", s.handleProjectDeletePreview)
	group.DELETE("/projects/{projectId}", s.handleProjectDelete)
	group.GET("/projects/{projectId}", s.handleProjectTree)
	group.PATCH("/projects/{projectId}", s.handleProjectUpdate)
	group.GET("/projects/{projectId}/suggest", s.handleSuggestions)
	group.POST("/projects/{projectId}/units", s.handleUnitCreate)
	group.POST("/ai-plans/project-draft", s.handleProjectDraftAI)
	group.POST("/ai-plans/project-draft/stream", s.handleProjectDraftAIStream)
	group.POST("/projects/{projectId}/ai-plans/open", s.handleAIPlanOpen)
	group.POST("/ai-plans/{sessionId}/message", s.handleAIPlanMessage)
	group.POST("/ai-plans/{sessionId}/message/stream", s.handleAIPlanMessageStream)
	group.POST("/ai-plans/{sessionId}/apply", s.handleAIPlanApply)
	group.PATCH("/units/{unitId}", s.handleUnitUpdate)
	group.POST("/units/{unitId}/move", s.handleUnitMove)
	group.GET("/units/{unitId}/delete-preview", s.handleUnitDeletePreview)
	group.DELETE("/units/{unitId}", s.handleUnitDelete)
	group.GET("/units/{unitId}/comments", s.handleCommentsList)
	group.POST("/units/{unitId}/comments", s.handleCommentCreate)
	group.GET("/deleted", s.handleDeletedList)
	group.POST("/deleted/purge", s.handleDeletedPurge)
}

func (s *AgilerrService) requireAPIAccess(e *core.RequestEvent) error {
	apiKey := strings.TrimSpace(e.Request.Header.Get("X-API-Key"))
	if apiKey != "" {
		if strings.TrimSpace(s.config.APIKey) == "" || apiKey != strings.TrimSpace(s.config.APIKey) {
			return apis.NewUnauthorizedError("invalid api key", nil)
		}
		userRecord, err := s.findAPIActor()
		if err != nil {
			return apis.NewUnauthorizedError("api key actor is unavailable", err)
		}
		e.Auth = userRecord
		return e.Next()
	}
	if e.Auth == nil {
		return e.UnauthorizedError("The request requires a valid auth token or API key.", nil)
	}
	if e.Auth.Collection().Name != collectionUsers {
		return e.ForbiddenError("The authorized record is not allowed to perform this action.", nil)
	}
	return e.Next()
}

func (s *AgilerrService) findAPIActor() (*core.Record, error) {
	users, err := s.app.FindCollectionByNameOrId(collectionUsers)
	if err != nil {
		return nil, err
	}
	return s.app.FindAuthRecordByEmail(users, s.config.AdminEmail)
}

func (s *AgilerrService) handleMe(e *core.RequestEvent) error {
	return e.JSON(http.StatusOK, map[string]any{
		"user": recordToUser(e.Auth),
	})
}

func (s *AgilerrService) handleDocsConfig(e *core.RequestEvent) error {
	apiKey := strings.TrimSpace(s.config.APIKey)
	return e.JSON(http.StatusOK, map[string]any{
		"configured":       apiKey != "",
		"headerName":       "X-API-Key",
		"apiKey":           apiKey,
		"apiKeyMasked":     maskSecret(apiKey),
		"openAIConfigured": strings.TrimSpace(s.config.OpenAIAPIKey) != "",
	})
}

func (s *AgilerrService) handleProjectsList(e *core.RequestEvent) error {
	records, err := s.app.FindRecordsByFilter(collectionProjects, "deletedAt = ''", "name", 0, 0)
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
	record.Set("statusColors", normalizeStatusColors(req.StatusColors))
	record.Set("deletedAt", "")

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
	projectRecord.Set("statusColors", normalizeStatusColors(req.StatusColors))

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
	req.AssigneeID = strings.TrimSpace(req.AssigneeID)
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
	if err := validateAssignee(s.app, req.AssigneeID); err != nil {
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
	record.Set("assignee", req.AssigneeID)
	record.Set("type", strings.ToLower(req.Type))
	record.Set("status", strings.ToLower(req.Status))
	record.Set("priority", req.Priority)
	record.Set("title", req.Title)
	record.Set("description", req.Description)
	record.Set("color", projectColorForType(projectRecord, req.Type))
	record.Set("tags", req.Tags)
	record.Set("position", float64(time.Now().UnixMilli()))
	record.Set("createdBy", e.Auth.Id)
	record.Set("deletedAt", "")

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
	req.AssigneeID = strings.TrimSpace(firstNonEmpty(req.AssigneeID, unitRecord.GetString("assignee")))
	req.Title = firstNonEmpty(strings.TrimSpace(req.Title), unitRecord.GetString("title"))
	req.Description = strings.TrimSpace(req.Description)
	req.Tags = normalizeTags(req.Tags)

	if err := validateUnitPayload(req); err != nil {
		return badRequest(e, err.Error(), err)
	}
	if err := validateAssignee(s.app, req.AssigneeID); err != nil {
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
	unitRecord.Set("assignee", req.AssigneeID)
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

func validateAssignee(app *pocketbase.PocketBase, assigneeID string) error {
	if strings.TrimSpace(assigneeID) == "" {
		return nil
	}
	if _, err := app.FindRecordById(collectionUsers, assigneeID); err != nil {
		return errors.New("assignee not found")
	}
	return nil
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
	if err := s.softDeleteUnitTree(unitRecord); err != nil {
		return serverError(e, err)
	}

	return e.NoContent(http.StatusNoContent)
}

func (s *AgilerrService) handleProjectDeletePreview(e *core.RequestEvent) error {
	projectRecord, err := findProject(s.app, e.Request.PathValue("projectId"))
	if err != nil {
		return notFound(e, "project not found")
	}
	unitRecords, err := loadProjectRecords(s.app, projectRecord.Id)
	if err != nil {
		return serverError(e, err)
	}
	childTitles := make([]string, 0, len(unitRecords))
	for _, record := range unitRecords {
		childTitles = append(childTitles, record.GetString("title"))
	}
	sort.Strings(childTitles)
	return e.JSON(http.StatusOK, map[string]any{
		"preview": DeletePreviewDTO{
			ID:           projectRecord.Id,
			Kind:         "project",
			Title:        projectRecord.GetString("name"),
			ChildTitles:  childTitles,
			TotalDeleted: 1 + len(childTitles),
		},
	})
}

func (s *AgilerrService) handleProjectDelete(e *core.RequestEvent) error {
	projectRecord, err := findProject(s.app, e.Request.PathValue("projectId"))
	if err != nil {
		return notFound(e, "project not found")
	}
	if err := s.softDeleteProject(projectRecord); err != nil {
		return serverError(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (s *AgilerrService) handleUnitDeletePreview(e *core.RequestEvent) error {
	unitRecord, err := findUnit(s.app, e.Request.PathValue("unitId"))
	if err != nil {
		return notFound(e, "item not found")
	}
	descendants, err := s.collectUnitDescendants(unitRecord.Id)
	if err != nil {
		return serverError(e, err)
	}
	childTitles := make([]string, 0, len(descendants))
	for _, record := range descendants {
		childTitles = append(childTitles, record.GetString("title"))
	}
	sort.Strings(childTitles)
	return e.JSON(http.StatusOK, map[string]any{
		"preview": DeletePreviewDTO{
			ID:           unitRecord.Id,
			Kind:         "unit",
			Title:        unitRecord.GetString("title"),
			ChildTitles:  childTitles,
			TotalDeleted: 1 + len(childTitles),
		},
	})
}

func (s *AgilerrService) handleDeletedList(e *core.RequestEvent) error {
	projectRecords, err := s.app.FindAllRecords(collectionProjects, dbx.Not(dbx.HashExp{"deletedAt": ""}))
	if err != nil {
		return serverError(e, err)
	}
	unitRecords, err := s.app.FindAllRecords(collectionUnits, dbx.Not(dbx.HashExp{"deletedAt": ""}))
	if err != nil {
		return serverError(e, err)
	}
	items := make([]DeletedItemDTO, 0, len(projectRecords)+len(unitRecords))
	for _, record := range projectRecords {
		items = append(items, DeletedItemDTO{ID: record.Id, Kind: "project", Title: record.GetString("name")})
	}
	for _, record := range unitRecords {
		items = append(items, DeletedItemDTO{ID: record.Id, Kind: "unit", Title: record.GetString("title")})
	}
	sort.Slice(items, func(i, j int) bool { return strings.ToLower(items[i].Title) < strings.ToLower(items[j].Title) })
	return e.JSON(http.StatusOK, map[string]any{"items": items})
}

func (s *AgilerrService) handleDeletedPurge(e *core.RequestEvent) error {
	var req HardDeleteRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}

	projectIDs := normalizeIDList(req.ProjectIDs)
	unitIDs := normalizeIDList(req.UnitIDs)

	for _, projectID := range projectIDs {
		projectRecord, err := findProjectAny(s.app, projectID)
		if err != nil {
			continue
		}
		if !isDeleted(projectRecord) {
			continue
		}
		if err := s.hardDeleteProject(projectRecord); err != nil {
			return serverError(e, err)
		}
	}

	for _, unitID := range unitIDs {
		unitRecord, err := findUnitAny(s.app, unitID)
		if err != nil {
			continue
		}
		if !isDeleted(unitRecord) {
			continue
		}
		if err := s.hardDeleteUnitTree(unitRecord); err != nil {
			return serverError(e, err)
		}
	}

	return e.JSON(http.StatusOK, map[string]any{"ok": true})
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

func maskSecret(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "Not configured"
	}
	if len(value) <= 8 {
		return strings.Repeat("*", len(value))
	}
	return value[:4] + strings.Repeat("*", len(value)-8) + value[len(value)-4:]
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

func normalizeIDList(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func deleteTimestamp() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func (s *AgilerrService) collectUnitDescendants(rootID string) ([]*core.Record, error) {
	all, err := s.app.FindAllRecords(collectionUnits)
	if err != nil {
		return nil, err
	}
	childrenByParent := map[string][]*core.Record{}
	for _, record := range all {
		childrenByParent[record.GetString("parent")] = append(childrenByParent[record.GetString("parent")], record)
	}
	var descendants []*core.Record
	var walk func(string)
	walk = func(parentID string) {
		for _, child := range childrenByParent[parentID] {
			descendants = append(descendants, child)
			walk(child.Id)
		}
	}
	walk(rootID)
	return descendants, nil
}

func (s *AgilerrService) softDeleteProject(projectRecord *core.Record) error {
	unitRecords, err := s.app.FindAllRecords(collectionUnits, dbx.HashExp{"project": projectRecord.Id})
	if err != nil {
		return err
	}
	deletedAt := deleteTimestamp()
	projectRecord.Set("deletedAt", deletedAt)
	if err := s.app.Save(projectRecord); err != nil {
		return err
	}
	for _, record := range unitRecords {
		record.Set("deletedAt", deletedAt)
		if err := s.app.SaveNoValidate(record); err != nil {
			return err
		}
	}
	return nil
}

func (s *AgilerrService) softDeleteUnitTree(unitRecord *core.Record) error {
	descendants, err := s.collectUnitDescendants(unitRecord.Id)
	if err != nil {
		return err
	}
	deletedAt := deleteTimestamp()
	unitRecord.Set("deletedAt", deletedAt)
	if err := s.app.Save(unitRecord); err != nil {
		return err
	}
	for _, record := range descendants {
		record.Set("deletedAt", deletedAt)
		if err := s.app.SaveNoValidate(record); err != nil {
			return err
		}
	}
	return nil
}

func (s *AgilerrService) hardDeleteProject(projectRecord *core.Record) error {
	unitRecords, err := s.app.FindAllRecords(collectionUnits, dbx.HashExp{"project": projectRecord.Id})
	if err != nil {
		return err
	}
	unitIDs := make([]string, 0, len(unitRecords))
	for _, record := range unitRecords {
		unitIDs = append(unitIDs, record.Id)
	}
	commentRecords, err := loadProjectComments(s.app, unitIDs)
	if err != nil {
		return err
	}
	for _, comment := range commentRecords {
		if err := s.app.Delete(comment); err != nil {
			return err
		}
	}
	sessions, err := s.app.FindAllRecords(collectionAIPlanSessions, dbx.HashExp{"project": projectRecord.Id})
	if err != nil {
		return err
	}
	for _, session := range sessions {
		messages, err := s.app.FindAllRecords(collectionAIPlanMessages, dbx.HashExp{"session": session.Id})
		if err != nil {
			return err
		}
		for _, message := range messages {
			if err := s.app.Delete(message); err != nil {
				return err
			}
		}
		if err := s.app.Delete(session); err != nil {
			return err
		}
	}
	for _, record := range unitRecords {
		if err := s.app.Delete(record); err != nil {
			return err
		}
	}
	return s.app.Delete(projectRecord)
}

func (s *AgilerrService) hardDeleteUnitTree(unitRecord *core.Record) error {
	allUnits, err := s.app.FindAllRecords(collectionUnits)
	if err != nil {
		return err
	}
	childrenByParent := map[string][]*core.Record{}
	deleteIDs := map[string]bool{}
	var deleteOrder []*core.Record
	for _, record := range allUnits {
		childrenByParent[record.GetString("parent")] = append(childrenByParent[record.GetString("parent")], record)
	}
	var walk func(*core.Record)
	walk = func(record *core.Record) {
		deleteIDs[record.Id] = true
		for _, child := range childrenByParent[record.Id] {
			walk(child)
		}
		deleteOrder = append(deleteOrder, record)
	}
	walk(unitRecord)

	commentRecords, err := s.app.FindAllRecords(collectionComments)
	if err != nil {
		return err
	}
	for _, comment := range commentRecords {
		if deleteIDs[comment.GetString("unit")] {
			if err := s.app.Delete(comment); err != nil {
				return err
			}
		}
	}
	for _, record := range deleteOrder {
		if err := s.app.Delete(record); err != nil {
			return err
		}
	}
	return nil
}
