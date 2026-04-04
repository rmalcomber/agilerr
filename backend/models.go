package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	collectionUsers          = "users"
	collectionProjects       = "projects"
	collectionUnits          = "units"
	collectionComments       = "comments"
	collectionAIPlanSessions = "ai_plan_sessions"
	collectionAIPlanMessages = "ai_plan_messages"
)

var (
	unitTypes            = []string{"epic", "feature", "story", "task", "bug"}
	unitStatuses         = []string{"triage", "todo", "in_progress", "review", "done"}
	standardUnitStatuses = []string{"todo", "in_progress", "review", "done"}
	bugPriorities        = []string{"critical", "high", "medium", "low"}
	allowedChildType     = map[string]string{"epic": "feature", "feature": "story", "story": "task"}
	defaultProjectColor  = "#2563eb"
	defaultUnitColors    = map[string]string{
		"epic":    "#c2410c",
		"feature": "#2563eb",
		"story":   "#0f766e",
		"task":    "#7c3aed",
		"bug":     "#dc2626",
	}
	defaultStatusColors = map[string]string{
		"triage":      "#f59e0b",
		"todo":        "#64748b",
		"in_progress": "#38bdf8",
		"review":      "#a78bfa",
		"done":        "#22c55e",
	}
)

type UnitColorSettings map[string]string
type StatusColorSettings map[string]string

type ProjectDTO struct {
	ID           string              `json:"id"`
	Name         string              `json:"name"`
	Description  string              `json:"description"`
	Color        string              `json:"color"`
	Tags         []string            `json:"tags"`
	UnitColors   UnitColorSettings   `json:"unitColors"`
	StatusColors StatusColorSettings `json:"statusColors"`
	Created      time.Time           `json:"created"`
	Updated      time.Time           `json:"updated"`
}

type UnitDTO struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"projectId"`
	ParentID    string    `json:"parentId,omitempty"`
	AssigneeID  string    `json:"assigneeId,omitempty"`
	Type        string    `json:"type"`
	Status      string    `json:"status"`
	Priority    string    `json:"priority,omitempty"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Color       string    `json:"color"`
	Tags        []string  `json:"tags"`
	Position    float64   `json:"position"`
	CreatedBy   string    `json:"createdBy"`
	Created     time.Time `json:"created"`
	Updated     time.Time `json:"updated"`
}

type CommentDTO struct {
	ID       string    `json:"id"`
	UnitID   string    `json:"unitId"`
	AuthorID string    `json:"authorId"`
	Body     string    `json:"body"`
	Mentions []Mention `json:"mentions"`
	Created  time.Time `json:"created"`
	Updated  time.Time `json:"updated"`
}

type UserDTO struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Gravatar string `json:"gravatar"`
}

type Mention struct {
	Type  string `json:"type"`
	ID    string `json:"id"`
	Label string `json:"label"`
}

type ProjectTreeResponse struct {
	Project  ProjectDTO   `json:"project"`
	Units    []UnitDTO    `json:"units"`
	Comments []CommentDTO `json:"comments"`
	Users    []UserDTO    `json:"users"`
	Tags     []string     `json:"tags"`
}

type CreateProjectRequest struct {
	Name         string              `json:"name"`
	Description  string              `json:"description"`
	Color        string              `json:"color"`
	Tags         []string            `json:"tags"`
	UnitColors   UnitColorSettings   `json:"unitColors"`
	StatusColors StatusColorSettings `json:"statusColors"`
}

type SaveUnitRequest struct {
	ProjectID   string   `json:"projectId"`
	ParentID    string   `json:"parentId"`
	AssigneeID  string   `json:"assigneeId"`
	Type        string   `json:"type"`
	Status      string   `json:"status"`
	Priority    string   `json:"priority"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Color       string   `json:"color"`
	Tags        []string `json:"tags"`
}

type MoveUnitRequest struct {
	Status string `json:"status"`
}

type CreateCommentRequest struct {
	Body     string    `json:"body"`
	Mentions []Mention `json:"mentions"`
}

func normalizeTags(tags []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		key := strings.ToLower(tag)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, tag)
	}
	return out
}

func normalizeMentions(mentions []Mention) []Mention {
	out := make([]Mention, 0, len(mentions))
	for _, mention := range mentions {
		mention.Type = strings.TrimSpace(strings.ToLower(mention.Type))
		mention.ID = strings.TrimSpace(mention.ID)
		mention.Label = strings.TrimSpace(mention.Label)
		if mention.ID == "" || mention.Label == "" {
			continue
		}
		if mention.Type != "user" && mention.Type != "unit" {
			continue
		}
		out = append(out, mention)
	}
	return out
}

func validateUnitPayload(req SaveUnitRequest) error {
	req.Type = strings.ToLower(strings.TrimSpace(req.Type))
	req.Status = strings.ToLower(strings.TrimSpace(req.Status))
	req.Priority = strings.ToLower(strings.TrimSpace(req.Priority))
	req.AssigneeID = strings.TrimSpace(req.AssigneeID)
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		return errors.New("title is required")
	}
	if !contains(unitTypes, req.Type) {
		return fmt.Errorf("invalid unit type %q", req.Type)
	}
	if !contains(unitStatuses, req.Status) {
		return fmt.Errorf("invalid status %q", req.Status)
	}
	if req.Type == "bug" {
		if req.Priority != "" && !contains(bugPriorities, req.Priority) {
			return fmt.Errorf("invalid priority %q", req.Priority)
		}
		return nil
	}
	if req.Status == "triage" {
		return errors.New("triage status is only valid for bugs")
	}
	if req.Priority != "" {
		return errors.New("priority is only valid for bugs")
	}
	return nil
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func recordToProject(record *core.Record) ProjectDTO {
	return ProjectDTO{
		ID:           record.Id,
		Name:         record.GetString("name"),
		Description:  record.GetString("description"),
		Color:        record.GetString("color"),
		Tags:         decodeStringSlice(record, "tags"),
		UnitColors:   decodeUnitColors(record, "unitColors"),
		StatusColors: decodeStatusColors(record, "statusColors"),
		Created:      record.GetDateTime("created").Time(),
		Updated:      record.GetDateTime("updated").Time(),
	}
}

func recordToUnit(record *core.Record) UnitDTO {
	return UnitDTO{
		ID:          record.Id,
		ProjectID:   record.GetString("project"),
		ParentID:    record.GetString("parent"),
		AssigneeID:  record.GetString("assignee"),
		Type:        record.GetString("type"),
		Status:      record.GetString("status"),
		Priority:    record.GetString("priority"),
		Title:       record.GetString("title"),
		Description: record.GetString("description"),
		Color:       record.GetString("color"),
		Tags:        decodeStringSlice(record, "tags"),
		Position:    record.GetFloat("position"),
		CreatedBy:   record.GetString("createdBy"),
		Created:     record.GetDateTime("created").Time(),
		Updated:     record.GetDateTime("updated").Time(),
	}
}

func recordToComment(record *core.Record) CommentDTO {
	return CommentDTO{
		ID:       record.Id,
		UnitID:   record.GetString("unit"),
		AuthorID: record.GetString("author"),
		Body:     record.GetString("body"),
		Mentions: decodeMentions(record, "mentions"),
		Created:  record.GetDateTime("created").Time(),
		Updated:  record.GetDateTime("updated").Time(),
	}
}

func recordToUser(record *core.Record) UserDTO {
	email := record.Email()
	return UserDTO{
		ID:       record.Id,
		Email:    email,
		Name:     firstNonEmpty(record.GetString("name"), email),
		Gravatar: gravatarURL(email),
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func decodeStringSlice(record *core.Record, field string) []string {
	raw, ok := record.GetRaw(field).(string)
	if ok {
		var parsed []string
		if json.Unmarshal([]byte(raw), &parsed) == nil {
			return normalizeTags(parsed)
		}
	}
	var parsed []string
	_ = record.UnmarshalJSONField(field, &parsed)
	return normalizeTags(parsed)
}

func decodeMentions(record *core.Record, field string) []Mention {
	var parsed []Mention
	_ = record.UnmarshalJSONField(field, &parsed)
	return normalizeMentions(parsed)
}

func normalizeUnitColors(colors map[string]string) UnitColorSettings {
	out := make(UnitColorSettings, len(defaultUnitColors))
	for unitType, fallback := range defaultUnitColors {
		out[unitType] = fallback
	}
	for unitType, color := range colors {
		unitType = strings.ToLower(strings.TrimSpace(unitType))
		color = strings.TrimSpace(color)
		if contains(unitTypes, unitType) && color != "" {
			out[unitType] = color
		}
	}
	return out
}

func normalizeStatusColors(colors map[string]string) StatusColorSettings {
	out := make(StatusColorSettings, len(defaultStatusColors))
	for status, fallback := range defaultStatusColors {
		out[status] = fallback
	}
	for status, color := range colors {
		status = strings.ToLower(strings.TrimSpace(status))
		color = strings.TrimSpace(color)
		if contains(unitStatuses, status) && color != "" {
			out[status] = color
		}
	}
	return out
}

func decodeUnitColors(record *core.Record, field string) UnitColorSettings {
	var parsed map[string]string
	_ = record.UnmarshalJSONField(field, &parsed)
	return normalizeUnitColors(parsed)
}

func decodeStatusColors(record *core.Record, field string) StatusColorSettings {
	var parsed map[string]string
	_ = record.UnmarshalJSONField(field, &parsed)
	return normalizeStatusColors(parsed)
}

func projectColorForType(project *core.Record, unitType string) string {
	if project == nil {
		return defaultUnitColors[unitType]
	}
	return normalizeUnitColors(decodeUnitColors(project, "unitColors"))[unitType]
}

func uniqueTags(project ProjectDTO, units []UnitDTO) []string {
	all := append([]string{}, project.Tags...)
	for _, unit := range units {
		all = append(all, unit.Tags...)
	}
	return normalizeTags(all)
}

func mapUsersByID(users []*core.Record) map[string]UserDTO {
	out := make(map[string]UserDTO, len(users))
	for _, user := range users {
		out[user.Id] = recordToUser(user)
	}
	return out
}

func loadAllUsers(app core.App) ([]*core.Record, error) {
	return app.FindAllRecords(collectionUsers)
}

func loadProjectRecords(app core.App, projectID string) ([]*core.Record, error) {
	return app.FindAllRecords(collectionUnits, dbx.HashExp{"project": projectID})
}

func loadProjectComments(app core.App, unitIDs []string) ([]*core.Record, error) {
	if len(unitIDs) == 0 {
		return []*core.Record{}, nil
	}
	records, err := app.FindAllRecords(collectionComments)
	if err != nil {
		return nil, err
	}
	allowed := make(map[string]bool, len(unitIDs))
	for _, unitID := range unitIDs {
		allowed[unitID] = true
	}
	filtered := make([]*core.Record, 0)
	for _, record := range records {
		if allowed[record.GetString("unit")] {
			filtered = append(filtered, record)
		}
	}
	return filtered, nil
}

func findProject(app core.App, projectID string) (*core.Record, error) {
	return app.FindRecordById(collectionProjects, projectID)
}

func findUnit(app core.App, unitID string) (*core.Record, error) {
	return app.FindRecordById(collectionUnits, unitID)
}

func parentMatchesType(parentType, childType string) bool {
	return allowedChildType[parentType] == childType
}

func validateHierarchy(parent *core.Record, req SaveUnitRequest) error {
	if req.Type == "bug" {
		if parent != nil {
			return errors.New("bugs cannot have a parent")
		}
		return nil
	}
	if parent == nil {
		if req.Type != "epic" {
			return errors.New("top-level items must be epics")
		}
		return nil
	}
	if parent.GetString("project") != req.ProjectID {
		return errors.New("parent belongs to a different project")
	}
	if parent.GetString("type") == "bug" {
		return errors.New("bugs cannot have child items")
	}
	if !parentMatchesType(parent.GetString("type"), req.Type) {
		return fmt.Errorf("%s items can only contain %s children", parent.GetString("type"), allowedChildType[parent.GetString("type")])
	}
	return nil
}

func fetchParent(app core.App, parentID string) (*core.Record, error) {
	if strings.TrimSpace(parentID) == "" {
		return nil, nil
	}
	parent, err := app.FindRecordById(collectionUnits, parentID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("parent unit not found")
		}
		return nil, err
	}
	return parent, nil
}
