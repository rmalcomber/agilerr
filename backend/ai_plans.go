package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type AIPlanProposal struct {
	ID          string           `json:"id"`
	Type        string           `json:"type"`
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Tags        []string         `json:"tags"`
	Children    []AIPlanProposal `json:"children,omitempty"`
}

type AIProjectDraft struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
}

type AIPlanSessionDTO struct {
	ID                   string           `json:"id"`
	ProjectID            string           `json:"projectId"`
	ContextType          string           `json:"contextType"`
	ContextID            string           `json:"contextId"`
	TargetType           string           `json:"targetType"`
	IncludeGrandchildren bool             `json:"includeGrandchildren"`
	Status               string           `json:"status"`
	Summary              string           `json:"summary"`
	LatestAssistant      string           `json:"latestAssistant"`
	ProjectDraft         *AIProjectDraft  `json:"projectDraft,omitempty"`
	Proposals            []AIPlanProposal `json:"proposals"`
	Created              time.Time        `json:"created"`
	Updated              time.Time        `json:"updated"`
}

type AIPlanMessageDTO struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Created   time.Time `json:"created"`
	Updated   time.Time `json:"updated"`
}

type aiPlanOpenRequest struct {
	ContextUnitID        string `json:"contextUnitId"`
	TargetType           string `json:"targetType"`
	IncludeGrandchildren bool   `json:"includeGrandchildren"`
}

type aiPlanMessageRequest struct {
	Message              string `json:"message"`
	IncludeGrandchildren bool   `json:"includeGrandchildren"`
}

type aiPlanApplyRequest struct {
	Proposals           []AIPlanProposal `json:"proposals"`
	AcceptedProposalIDs []string         `json:"acceptedProposalIds"`
	Done                bool             `json:"done"`
}

type aiProjectDraftRequest struct {
	Prompt   string              `json:"prompt"`
	Draft    AIProjectDraft      `json:"draft"`
	Messages []AIPlanChatMessage `json:"messages"`
}

type AIPlanChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type aiPlannerResult struct {
	Ready            bool             `json:"ready"`
	AssistantMessage string           `json:"assistantMessage"`
	ProjectDraft     *AIProjectDraft  `json:"projectDraft,omitempty"`
	Proposals        []AIPlanProposal `json:"proposals,omitempty"`
}

type aiPlanStateResponse struct {
	Session          *AIPlanSessionDTO  `json:"session,omitempty"`
	Messages         []AIPlanMessageDTO `json:"messages"`
	ProjectDraft     *AIProjectDraft    `json:"projectDraft,omitempty"`
	Proposals        []AIPlanProposal   `json:"proposals"`
	AssistantMessage string             `json:"assistantMessage"`
	Ready            bool               `json:"ready"`
	HasHistory       bool               `json:"hasHistory"`
}

func (s *AgilerrService) handleProjectDraftAI(e *core.RequestEvent) error {
	if !s.isSystemAdmin(e.Auth) && !e.Auth.GetBool("createProjects") {
		return e.ForbiddenError("Create project permission is required.", nil)
	}
	var req aiProjectDraftRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" {
		return badRequest(e, "prompt is required", nil)
	}

	result, err := s.runProjectDraftPlanner(req)
	if err != nil {
		log.Printf("project ai add failed: %v", err)
		return e.JSON(http.StatusServiceUnavailable, map[string]any{
			"error": "Connecting to the OpenAI API failed.",
		})
	}

	return e.JSON(http.StatusOK, map[string]any{
		"assistantMessage": result.AssistantMessage,
		"ready":            result.Ready,
		"projectDraft":     result.ProjectDraft,
	})
}

func (s *AgilerrService) handleProjectDraftAIStream(e *core.RequestEvent) error {
	if !s.isSystemAdmin(e.Auth) && !e.Auth.GetBool("createProjects") {
		return e.ForbiddenError("Create project permission is required.", nil)
	}
	var req aiProjectDraftRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" {
		return badRequest(e, "prompt is required", nil)
	}

	messages := []AIPlanChatMessage{
		{
			Role:    "system",
			Content: "You help define Agile project metadata. Ask one concise clarification question at a time until the project is clear enough. Reply with JSON only using keys: ready, assistantMessage, projectDraft. projectDraft must contain name, description, and tags. Keep descriptions concise and markdown-friendly.",
		},
		{
			Role:    "user",
			Content: fmt.Sprintf("I need help fleshing out a project. Current draft:\nName: %s\nDescription:\n%s\nTags: %s\nNeed: %s", req.Draft.Name, req.Draft.Description, strings.Join(req.Draft.Tags, ", "), req.Prompt),
		},
	}
	for _, msg := range req.Messages {
		role := strings.TrimSpace(strings.ToLower(msg.Role))
		if role != "user" && role != "assistant" {
			continue
		}
		content := strings.TrimSpace(msg.Content)
		if content == "" {
			continue
		}
		messages = append(messages, AIPlanChatMessage{Role: role, Content: content})
	}

	result, err := s.streamPlannerResponse(e, messages)
	if err != nil {
		log.Printf("project ai add stream failed: %v", err)
		return nil
	}
	return sendSSEDone(e, map[string]any{
		"assistantMessage": result.AssistantMessage,
		"ready":            result.Ready,
		"projectDraft":     result.ProjectDraft,
	})
}

func (s *AgilerrService) handleAIPlanOpen(e *core.RequestEvent) error {
	projectID := e.Request.PathValue("projectId")
	if _, err := findProject(s.app, projectID); err != nil {
		return notFound(e, "project not found")
	}
	if err := s.requireProjectPermission(e, projectID, func(p ProjectPermissions) bool { return p.AddWithAI }, "AI add permission is required."); err != nil {
		return err
	}

	var req aiPlanOpenRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}

	targetType := strings.ToLower(strings.TrimSpace(req.TargetType))
	contextType, contextID, err := s.resolveAIPlanContext(projectID, strings.TrimSpace(req.ContextUnitID), targetType)
	if err != nil {
		return badRequest(e, err.Error(), err)
	}

	sessionRecord, err := s.findLatestAIPlanSession(projectID, contextType, contextID, targetType)
	if err != nil {
		return serverError(e, err)
	}
	if sessionRecord == nil {
		sessionRecord, err = s.createAIPlanSession(projectID, contextType, contextID, targetType, req.IncludeGrandchildren)
		if err != nil {
			return serverError(e, err)
		}
	}

	if req.IncludeGrandchildren != sessionRecord.GetBool("includeGrandchildren") {
		sessionRecord.Set("includeGrandchildren", req.IncludeGrandchildren)
		sessionRecord.Set("status", firstNonEmpty(sessionRecord.GetString("status"), "active"))
		if err := s.app.Save(sessionRecord); err != nil {
			return serverError(e, err)
		}
		sessionRecord = sessionRecord.Fresh()
	}

	messages, err := loadAIPlanMessages(s.app, sessionRecord.Id)
	if err != nil {
		return serverError(e, err)
	}

	dto := recordToAIPlanSession(sessionRecord)
	return e.JSON(http.StatusOK, aiPlanStateResponse{
		Session:          &dto,
		Messages:         messages,
		ProjectDraft:     dto.ProjectDraft,
		Proposals:        dto.Proposals,
		AssistantMessage: dto.LatestAssistant,
		Ready:            len(dto.Proposals) > 0 || dto.ProjectDraft != nil,
		HasHistory:       dto.Summary != "" || len(messages) > 0,
	})
}

func (s *AgilerrService) handleAIPlanMessage(e *core.RequestEvent) error {
	sessionRecord, err := s.app.FindRecordById(collectionAIPlanSessions, e.Request.PathValue("sessionId"))
	if err != nil {
		return notFound(e, "ai plan session not found")
	}
	if err := s.requireProjectPermission(e, sessionRecord.GetString("project"), func(p ProjectPermissions) bool { return p.AddWithAI }, "AI add permission is required."); err != nil {
		return err
	}

	var req aiPlanMessageRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		return badRequest(e, "message is required", nil)
	}

	sessionRecord.Set("includeGrandchildren", req.IncludeGrandchildren)
	sessionRecord.Set("status", "active")
	if err := s.app.Save(sessionRecord); err != nil {
		return serverError(e, err)
	}
	if _, err := s.saveAIPlanMessage(sessionRecord.Id, "user", req.Message); err != nil {
		return serverError(e, err)
	}

	result, err := s.runPersistentPlanner(sessionRecord)
	if err != nil {
		log.Printf("ai add failed for session %s: %v", sessionRecord.Id, err)
		return e.JSON(http.StatusServiceUnavailable, map[string]any{
			"error": "Connecting to the OpenAI API failed.",
		})
	}

	if _, err := s.saveAIPlanMessage(sessionRecord.Id, "assistant", result.AssistantMessage); err != nil {
		return serverError(e, err)
	}

	sessionRecord = sessionRecord.Fresh()
	sessionRecord.Set("latestAssistant", result.AssistantMessage)
	sessionRecord.Set("proposals", normalizeAIPlanProposals(result.Proposals))
	if result.ProjectDraft != nil {
		sessionRecord.Set("projectDraft", normalizeAIProjectDraft(*result.ProjectDraft))
	} else {
		sessionRecord.Set("projectDraft", nil)
	}
	if err := s.app.Save(sessionRecord); err != nil {
		return serverError(e, err)
	}
	sessionRecord = sessionRecord.Fresh()

	messages, err := loadAIPlanMessages(s.app, sessionRecord.Id)
	if err != nil {
		return serverError(e, err)
	}
	dto := recordToAIPlanSession(sessionRecord)

	return e.JSON(http.StatusOK, aiPlanStateResponse{
		Session:          &dto,
		Messages:         messages,
		ProjectDraft:     dto.ProjectDraft,
		Proposals:        dto.Proposals,
		AssistantMessage: result.AssistantMessage,
		Ready:            result.Ready,
		HasHistory:       dto.Summary != "" || len(messages) > 0,
	})
}

func (s *AgilerrService) handleAIPlanMessageStream(e *core.RequestEvent) error {
	sessionRecord, err := s.app.FindRecordById(collectionAIPlanSessions, e.Request.PathValue("sessionId"))
	if err != nil {
		return notFound(e, "ai plan session not found")
	}
	if err := s.requireProjectPermission(e, sessionRecord.GetString("project"), func(p ProjectPermissions) bool { return p.AddWithAI }, "AI add permission is required."); err != nil {
		return err
	}

	var req aiPlanMessageRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		return badRequest(e, "message is required", nil)
	}

	sessionRecord.Set("includeGrandchildren", req.IncludeGrandchildren)
	sessionRecord.Set("status", "active")
	if err := s.app.Save(sessionRecord); err != nil {
		return serverError(e, err)
	}
	if _, err := s.saveAIPlanMessage(sessionRecord.Id, "user", req.Message); err != nil {
		return serverError(e, err)
	}

	chat, err := s.buildPersistentPlannerMessages(sessionRecord)
	if err != nil {
		return serverError(e, err)
	}
	result, err := s.streamPlannerResponse(e, chat)
	if err != nil {
		log.Printf("ai add stream failed for session %s: %v", sessionRecord.Id, err)
		return nil
	}

	if _, err := s.saveAIPlanMessage(sessionRecord.Id, "assistant", result.AssistantMessage); err != nil {
		return serverError(e, err)
	}

	sessionRecord = sessionRecord.Fresh()
	sessionRecord.Set("latestAssistant", result.AssistantMessage)
	sessionRecord.Set("proposals", normalizeAIPlanProposals(result.Proposals))
	if err := s.app.Save(sessionRecord); err != nil {
		return serverError(e, err)
	}
	sessionRecord = sessionRecord.Fresh()

	messages, err := loadAIPlanMessages(s.app, sessionRecord.Id)
	if err != nil {
		return serverError(e, err)
	}
	dto := recordToAIPlanSession(sessionRecord)
	return sendSSEDone(e, aiPlanStateResponse{
		Session:          &dto,
		Messages:         messages,
		ProjectDraft:     dto.ProjectDraft,
		Proposals:        dto.Proposals,
		AssistantMessage: result.AssistantMessage,
		Ready:            result.Ready,
		HasHistory:       dto.Summary != "" || len(messages) > 0,
	})
}

func (s *AgilerrService) handleAIPlanApply(e *core.RequestEvent) error {
	sessionRecord, err := s.app.FindRecordById(collectionAIPlanSessions, e.Request.PathValue("sessionId"))
	if err != nil {
		return notFound(e, "ai plan session not found")
	}
	if err := s.requireProjectPermission(e, sessionRecord.GetString("project"), func(p ProjectPermissions) bool { return p.AddWithAI }, "AI add permission is required."); err != nil {
		return err
	}

	var req aiPlanApplyRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", err)
	}

	proposals := normalizeAIPlanProposals(req.Proposals)
	if len(proposals) == 0 {
		proposals = recordToAIPlanSession(sessionRecord).Proposals
	}
	if len(req.AcceptedProposalIDs) == 0 && !req.Done {
		return badRequest(e, "select at least one proposal or mark the session done", nil)
	}

	projectRecord, err := findProject(s.app, sessionRecord.GetString("project"))
	if err != nil {
		return notFound(e, "project not found")
	}

	actor, err := s.findAPIActor()
	if err != nil {
		return serverError(e, err)
	}

	accepted := make(map[string]bool, len(req.AcceptedProposalIDs))
	for _, id := range req.AcceptedProposalIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			accepted[id] = true
		}
	}

	remaining := make([]AIPlanProposal, 0, len(proposals))
	created := make([]UnitDTO, 0)
	for _, proposal := range proposals {
		if accepted[proposal.ID] {
			baseParentID := ""
			if sessionRecord.GetString("contextType") == "unit" {
				baseParentID = sessionRecord.GetString("contextId")
			}
			built, err := s.createAIProposalTree(projectRecord, actor.Id, baseParentID, proposal)
			if err != nil {
				return badRequest(e, err.Error(), err)
			}
			created = append(created, built...)
			continue
		}
		remaining = append(remaining, proposal)
	}

	sessionRecord.Set("proposals", remaining)
	sessionRecord.Set("latestAssistant", firstNonEmpty(sessionRecord.GetString("latestAssistant"), ""))
	if req.Done {
		summary, err := s.summarizeAIPlanSession(sessionRecord, created)
		if err != nil {
			log.Printf("ai add summary failed for session %s: %v", sessionRecord.Id, err)
			summary = fallbackAIPlanSummary(sessionRecord, created)
		}
		sessionRecord.Set("summary", summary)
		sessionRecord.Set("status", "done")
		sessionRecord.Set("latestAssistant", "")
		sessionRecord.Set("proposals", []AIPlanProposal{})
		if err := s.app.Save(sessionRecord); err != nil {
			return serverError(e, err)
		}
		if err := s.clearAIPlanMessages(sessionRecord.Id); err != nil {
			return serverError(e, err)
		}
	} else {
		sessionRecord.Set("status", "active")
		if err := s.app.Save(sessionRecord); err != nil {
			return serverError(e, err)
		}
	}

	sessionRecord = sessionRecord.Fresh()
	messages, err := loadAIPlanMessages(s.app, sessionRecord.Id)
	if err != nil {
		return serverError(e, err)
	}
	dto := recordToAIPlanSession(sessionRecord)
	return e.JSON(http.StatusOK, map[string]any{
		"created": created,
		"state": aiPlanStateResponse{
			Session:          &dto,
			Messages:         messages,
			ProjectDraft:     dto.ProjectDraft,
			Proposals:        dto.Proposals,
			AssistantMessage: dto.LatestAssistant,
			Ready:            len(dto.Proposals) > 0,
			HasHistory:       dto.Summary != "" || len(messages) > 0,
		},
	})
}

func (s *AgilerrService) resolveAIPlanContext(projectID, contextUnitID, targetType string) (string, string, error) {
	if targetType == "project" {
		return "project", projectID, nil
	}
	if targetType == "bug" {
		return "project", projectID, nil
	}
	if targetType == "epic" {
		return "project", projectID, nil
	}
	unitRecord, err := findUnit(s.app, contextUnitID)
	if err != nil {
		return "", "", errors.New("parent item not found")
	}
	if unitRecord.GetString("project") != projectID {
		return "", "", errors.New("parent item belongs to a different project")
	}
	return "unit", unitRecord.Id, nil
}

func (s *AgilerrService) createAIPlanSession(projectID, contextType, contextID, targetType string, includeGrandchildren bool) (*core.Record, error) {
	collection, err := s.app.FindCollectionByNameOrId(collectionAIPlanSessions)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("contextType", contextType)
	record.Set("contextId", contextID)
	record.Set("targetType", targetType)
	record.Set("includeGrandchildren", includeGrandchildren)
	record.Set("status", "active")
	record.Set("summary", "")
	record.Set("latestAssistant", "")
	record.Set("proposals", []AIPlanProposal{})
	if err := s.app.Save(record); err != nil {
		return nil, err
	}
	return record.Fresh(), nil
}

func (s *AgilerrService) findLatestAIPlanSession(projectID, contextType, contextID, targetType string) (*core.Record, error) {
	records, err := s.app.FindAllRecords(collectionAIPlanSessions, dbx.HashExp{"project": projectID})
	if err != nil {
		return nil, err
	}
	filtered := make([]*core.Record, 0)
	for _, record := range records {
		if record.GetString("contextType") == contextType && record.GetString("contextId") == contextID && record.GetString("targetType") == targetType {
			filtered = append(filtered, record)
		}
	}
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].GetDateTime("updated").Time().After(filtered[j].GetDateTime("updated").Time())
	})
	if len(filtered) == 0 {
		return nil, nil
	}
	return filtered[0], nil
}

func loadAIPlanMessages(app core.App, sessionID string) ([]AIPlanMessageDTO, error) {
	records, err := app.FindAllRecords(collectionAIPlanMessages, dbx.HashExp{"session": sessionID})
	if err != nil {
		return nil, err
	}
	out := make([]AIPlanMessageDTO, 0, len(records))
	for _, record := range records {
		out = append(out, AIPlanMessageDTO{
			ID:        record.Id,
			SessionID: record.GetString("session"),
			Role:      record.GetString("role"),
			Content:   record.GetString("content"),
			Created:   record.GetDateTime("created").Time(),
			Updated:   record.GetDateTime("updated").Time(),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Created.Before(out[j].Created) })
	return out, nil
}

func (s *AgilerrService) saveAIPlanMessage(sessionID, role, content string) (*core.Record, error) {
	collection, err := s.app.FindCollectionByNameOrId(collectionAIPlanMessages)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Set("session", sessionID)
	record.Set("role", strings.TrimSpace(role))
	record.Set("content", strings.TrimSpace(content))
	if err := s.app.Save(record); err != nil {
		return nil, err
	}
	return record.Fresh(), nil
}

func (s *AgilerrService) clearAIPlanMessages(sessionID string) error {
	records, err := s.app.FindAllRecords(collectionAIPlanMessages, dbx.HashExp{"session": sessionID})
	if err != nil {
		return err
	}
	for _, record := range records {
		if err := s.app.Delete(record); err != nil {
			return err
		}
	}
	return nil
}

func recordToAIPlanSession(record *core.Record) AIPlanSessionDTO {
	var projectDraft *AIProjectDraft
	var parsedDraft AIProjectDraft
	if err := record.UnmarshalJSONField("projectDraft", &parsedDraft); err == nil && (parsedDraft.Name != "" || parsedDraft.Description != "" || len(parsedDraft.Tags) > 0) {
		clean := normalizeAIProjectDraft(parsedDraft)
		projectDraft = &clean
	}

	var proposals []AIPlanProposal
	_ = record.UnmarshalJSONField("proposals", &proposals)
	proposals = normalizeAIPlanProposals(proposals)

	return AIPlanSessionDTO{
		ID:                   record.Id,
		ProjectID:            record.GetString("project"),
		ContextType:          record.GetString("contextType"),
		ContextID:            record.GetString("contextId"),
		TargetType:           record.GetString("targetType"),
		IncludeGrandchildren: record.GetBool("includeGrandchildren"),
		Status:               record.GetString("status"),
		Summary:              record.GetString("summary"),
		LatestAssistant:      record.GetString("latestAssistant"),
		ProjectDraft:         projectDraft,
		Proposals:            proposals,
		Created:              record.GetDateTime("created").Time(),
		Updated:              record.GetDateTime("updated").Time(),
	}
}

func normalizeAIProjectDraft(draft AIProjectDraft) AIProjectDraft {
	draft.Name = strings.TrimSpace(draft.Name)
	draft.Description = strings.TrimSpace(draft.Description)
	draft.Tags = normalizeTags(draft.Tags)
	return draft
}

func normalizeAIPlanProposals(proposals []AIPlanProposal) []AIPlanProposal {
	out := make([]AIPlanProposal, 0, len(proposals))
	for _, proposal := range proposals {
		proposal.ID = firstNonEmpty(strings.TrimSpace(proposal.ID), uuid.NewString())
		proposal.Type = strings.ToLower(strings.TrimSpace(proposal.Type))
		proposal.Title = strings.TrimSpace(proposal.Title)
		proposal.Description = strings.TrimSpace(proposal.Description)
		proposal.Tags = normalizeTags(proposal.Tags)
		proposal.Children = normalizeAIPlanProposals(proposal.Children)
		if proposal.Title == "" {
			continue
		}
		out = append(out, proposal)
	}
	return out
}

func (s *AgilerrService) runProjectDraftPlanner(req aiProjectDraftRequest) (aiPlannerResult, error) {
	if strings.TrimSpace(s.config.OpenAIAPIKey) == "" {
		return aiPlannerResult{}, errors.New("OPENAI_API_KEY is missing")
	}

	messages := []AIPlanChatMessage{
		{
			Role:    "system",
			Content: "You help define Agile project metadata. Ask one concise clarification question at a time until the project is clear enough. Reply with JSON only using keys: ready, assistantMessage, projectDraft. projectDraft must contain name, description, and tags. Keep descriptions concise and markdown-friendly.",
		},
		{
			Role:    "user",
			Content: fmt.Sprintf("I need help fleshing out a project. Current draft:\nName: %s\nDescription:\n%s\nTags: %s\nNeed: %s", req.Draft.Name, req.Draft.Description, strings.Join(req.Draft.Tags, ", "), req.Prompt),
		},
	}
	for _, msg := range req.Messages {
		role := strings.TrimSpace(strings.ToLower(msg.Role))
		if role != "user" && role != "assistant" {
			continue
		}
		content := strings.TrimSpace(msg.Content)
		if content == "" {
			continue
		}
		messages = append(messages, AIPlanChatMessage{Role: role, Content: content})
	}

	return s.runPlannerChat(messages)
}

func (s *AgilerrService) runPersistentPlanner(sessionRecord *core.Record) (aiPlannerResult, error) {
	if strings.TrimSpace(s.config.OpenAIAPIKey) == "" {
		return aiPlannerResult{}, errors.New("OPENAI_API_KEY is missing")
	}

	chat, err := s.buildPersistentPlannerMessages(sessionRecord)
	if err != nil {
		return aiPlannerResult{}, err
	}

	result, err := s.runPlannerChat(chat)
	if err != nil {
		return aiPlannerResult{}, err
	}
	result.ProjectDraft = nil
	result.Proposals = normalizeAIPlanProposals(result.Proposals)
	return result, nil
}

func (s *AgilerrService) buildPersistentPlannerMessages(sessionRecord *core.Record) ([]AIPlanChatMessage, error) {
	if strings.TrimSpace(s.config.OpenAIAPIKey) == "" {
		return nil, errors.New("OPENAI_API_KEY is missing")
	}

	dto := recordToAIPlanSession(sessionRecord)
	messages, err := loadAIPlanMessages(s.app, sessionRecord.Id)
	if err != nil {
		return nil, err
	}

	contextPrompt, err := s.buildAIPlanContextPrompt(dto)
	if err != nil {
		return nil, err
	}

	shapeDescription := "Reply with JSON only using keys: ready, assistantMessage, proposals. proposals must be an array of items with id, type, title, description, tags, and optional children."
	if dto.TargetType == "bug" {
		shapeDescription = "Reply with JSON only using keys: ready, assistantMessage, proposals. proposals must be an array of bugs with id, type='bug', title, description, and tags. Do not include priority. Do not include children."
	}

	chat := []AIPlanChatMessage{
		{
			Role:    "system",
			Content: "You help flesh out Agile backlog planning. Ask one concise clarification question at a time until enough business context exists. Keep the tone practical and direct. " + shapeDescription,
		},
		{
			Role:    "system",
			Content: contextPrompt,
		},
	}
	if dto.Summary != "" {
		chat = append(chat, AIPlanChatMessage{
			Role:    "system",
			Content: "Prior planning summary:\n" + dto.Summary,
		})
	}
	for _, msg := range messages {
		chat = append(chat, AIPlanChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}
	return chat, nil
}

func (s *AgilerrService) buildAIPlanContextPrompt(session AIPlanSessionDTO) (string, error) {
	projectRecord, err := findProject(s.app, session.ProjectID)
	if err != nil {
		return "", err
	}
	project := recordToProject(projectRecord)
	targetLabel := targetTypePhrase(session.TargetType)
	includeGrandchildren := "false"
	grandchildInstruction := "Do not generate grandchildren."
	if session.IncludeGrandchildren && allowsAIGrandchildren(session.TargetType) {
		includeGrandchildren = "true"
		grandchildInstruction = fmt.Sprintf("You may also generate one extra level of grandchildren under each %s, but never generate tasks.", targetLabel)
	}

	if session.ContextType == "project" {
		if session.TargetType == "bug" {
			return fmt.Sprintf("You need to help me flesh out project bugs. Project: %s\nProject description:\n%s\nProject tags: %s\nCreate only project-level bugs. New bugs must remain in triage after creation. %s Include grandchildren: %s", project.Name, project.Description, strings.Join(project.Tags, ", "), grandchildInstruction, includeGrandchildren), nil
		}
		siblings, err := s.aiSiblingTitles(session.ProjectID, "", session.TargetType)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("You need to help me flesh out my %s for this project. Project: %s\nProject description:\n%s\nProject tags: %s\nExisting sibling titles: %s\nCreate only direct %s for the project. %s Include grandchildren: %s", targetLabel, project.Name, project.Description, strings.Join(project.Tags, ", "), strings.Join(siblings, ", "), targetLabel, grandchildInstruction, includeGrandchildren), nil
	}

	parentRecord, err := findUnit(s.app, session.ContextID)
	if err != nil {
		return "", err
	}
	parent := recordToUnit(parentRecord)
	parentLabel := backendTypeLabel(parent.Type)
	siblings, err := s.aiSiblingTitles(session.ProjectID, parent.ID, session.TargetType)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("You need to help me flesh out my %s. This is the parent %s: %s\nParent description:\n%s\nParent tags: %s\nExisting sibling titles: %s\nCreate only direct %s under this parent. %s Include grandchildren: %s", targetLabel, parentLabel, parent.Title, parent.Description, strings.Join(parent.Tags, ", "), strings.Join(siblings, ", "), targetLabel, grandchildInstruction, includeGrandchildren), nil
}

func targetTypePhrase(targetType string) string {
	switch targetType {
	case "epic":
		return "epics"
	case "feature":
		return "features"
	case "story":
		return "user stories"
	case "bug":
		return "bugs"
	default:
		return targetType + "s"
	}
}

func backendTypeLabel(unitType string) string {
	switch unitType {
	case "story":
		return "User Story"
	case "epic":
		return "Epic"
	case "feature":
		return "Feature"
	case "task":
		return "Task"
	case "bug":
		return "Bug"
	default:
		if unitType == "" {
			return "Item"
		}
		return strings.ToUpper(unitType[:1]) + unitType[1:]
	}
}

func allowsAIGrandchildren(targetType string) bool {
	return targetType == "epic" || targetType == "feature"
}

func (s *AgilerrService) aiSiblingTitles(projectID, parentID, targetType string) ([]string, error) {
	if targetType == "bug" || targetType == "project" {
		return []string{"none"}, nil
	}
	records, err := loadProjectRecords(s.app, projectID)
	if err != nil {
		return nil, err
	}
	titles := make([]string, 0)
	for _, record := range records {
		if record.GetString("type") != targetType {
			continue
		}
		if strings.TrimSpace(record.GetString("parent")) != strings.TrimSpace(parentID) {
			continue
		}
		title := strings.TrimSpace(record.GetString("title"))
		if title != "" {
			titles = append(titles, title)
		}
	}
	sort.Strings(titles)
	if len(titles) == 0 {
		return []string{"none"}, nil
	}
	if len(titles) > 20 {
		titles = titles[:20]
	}
	return titles, nil
}

func (s *AgilerrService) runPlannerChat(messages []AIPlanChatMessage) (aiPlannerResult, error) {
	payload := struct {
		Model    string              `json:"model"`
		Messages []AIPlanChatMessage `json:"messages"`
	}{
		Model:    s.config.OpenAIModel,
		Messages: messages,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return aiPlannerResult{}, err
	}

	endpoint, err := url.JoinPath(strings.TrimRight(s.config.OpenAIBaseURL, "/"), "/v1/chat/completions")
	if err != nil {
		return aiPlannerResult{}, err
	}

	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return aiPlannerResult{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.config.OpenAIAPIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return aiPlannerResult{}, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return aiPlannerResult{}, err
	}
	if resp.StatusCode >= 300 {
		return aiPlannerResult{}, fmt.Errorf("planner request failed: %s", strings.TrimSpace(string(raw)))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return aiPlannerResult{}, err
	}
	if len(parsed.Choices) == 0 {
		return aiPlannerResult{}, errors.New("planner returned no choices")
	}

	content := strings.TrimSpace(parsed.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var result aiPlannerResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return aiPlannerResult{}, fmt.Errorf("planner returned invalid JSON: %w", err)
	}
	if result.ProjectDraft != nil {
		draft := normalizeAIProjectDraft(*result.ProjectDraft)
		result.ProjectDraft = &draft
	}
	result.Proposals = normalizeAIPlanProposals(result.Proposals)
	return result, nil
}

func (s *AgilerrService) streamPlannerResponse(e *core.RequestEvent, messages []AIPlanChatMessage) (aiPlannerResult, error) {
	if strings.TrimSpace(s.config.OpenAIAPIKey) == "" {
		return aiPlannerResult{}, errors.New("OPENAI_API_KEY is missing")
	}
	payload := struct {
		Model    string              `json:"model"`
		Messages []AIPlanChatMessage `json:"messages"`
		Stream   bool                `json:"stream"`
	}{
		Model:    s.config.OpenAIModel,
		Messages: messages,
		Stream:   true,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return aiPlannerResult{}, err
	}
	endpoint, err := url.JoinPath(strings.TrimRight(s.config.OpenAIBaseURL, "/"), "/v1/chat/completions")
	if err != nil {
		return aiPlannerResult{}, err
	}
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return aiPlannerResult{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.config.OpenAIAPIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return aiPlannerResult{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		sendSSEError(e, "Connecting to the OpenAI API failed.")
		return aiPlannerResult{}, fmt.Errorf("planner request failed: %s", strings.TrimSpace(string(raw)))
	}

	prepareSSE(e)
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 8192), 1024*1024)
	var accumulated strings.Builder
	var displayBuffer strings.Builder
	lastFlush := time.Now()
	flushDisplay := func(force bool) error {
		if displayBuffer.Len() == 0 {
			return nil
		}
		if !force && displayBuffer.Len() < 24 && time.Since(lastFlush) < 90*time.Millisecond {
			return nil
		}
		if err := sendSSEChunk(e, displayBuffer.String()); err != nil {
			return err
		}
		displayBuffer.Reset()
		lastFlush = time.Now()
		return nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data: "))
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content == "" {
				continue
			}
			accumulated.WriteString(choice.Delta.Content)
			displayBuffer.WriteString(choice.Delta.Content)
			if strings.ContainsAny(choice.Delta.Content, ".!?\n") {
				if err := flushDisplay(true); err != nil {
					return aiPlannerResult{}, err
				}
				continue
			}
			if err := flushDisplay(false); err != nil {
				return aiPlannerResult{}, err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		sendSSEError(e, "Connecting to the OpenAI API failed.")
		return aiPlannerResult{}, err
	}
	if err := flushDisplay(true); err != nil {
		return aiPlannerResult{}, err
	}
	return parsePlannerResult(accumulated.String())
}

func parsePlannerResult(content string) (aiPlannerResult, error) {
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var result aiPlannerResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return aiPlannerResult{}, fmt.Errorf("planner returned invalid JSON: %w", err)
	}
	if result.ProjectDraft != nil {
		draft := normalizeAIProjectDraft(*result.ProjectDraft)
		result.ProjectDraft = &draft
	}
	result.Proposals = normalizeAIPlanProposals(result.Proposals)
	return result, nil
}

func prepareSSE(e *core.RequestEvent) {
	e.Response.Header().Set("Content-Type", "text/event-stream")
	e.Response.Header().Set("Cache-Control", "no-cache")
	e.Response.Header().Set("Connection", "keep-alive")
}

func sendSSEChunk(e *core.RequestEvent, chunk string) error {
	return sendSSEEvent(e, "chunk", chunk)
}

func sendSSEDone(e *core.RequestEvent, payload any) error {
	return sendSSEEvent(e, "done", payload)
}

func sendSSEError(e *core.RequestEvent, message string) error {
	return sendSSEEvent(e, "error", map[string]any{"error": message})
}

func sendSSEEvent(e *core.RequestEvent, event string, payload any) error {
	var data []byte
	switch v := payload.(type) {
	case string:
		data, _ = json.Marshal(v)
	default:
		var err error
		data, err = json.Marshal(v)
		if err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(e.Response, "event: %s\ndata: %s\n\n", event, data); err != nil {
		return err
	}
	if flusher, ok := e.Response.(http.Flusher); ok {
		flusher.Flush()
	}
	return nil
}

func (s *AgilerrService) createAIProposalTree(projectRecord *core.Record, actorID, parentID string, proposal AIPlanProposal) ([]UnitDTO, error) {
	record, err := s.createAIProposalUnit(projectRecord, actorID, parentID, proposal)
	if err != nil {
		return nil, err
	}
	created := []UnitDTO{recordToUnit(record)}
	nextExpectedChild := nextAIChildType(proposal.Type)
	if nextExpectedChild == "" {
		return created, nil
	}
	for _, child := range proposal.Children {
		child.Type = firstNonEmpty(strings.ToLower(strings.TrimSpace(child.Type)), nextExpectedChild)
		if child.Type != nextExpectedChild {
			continue
		}
		childCreated, err := s.createAIProposalTree(projectRecord, actorID, record.Id, child)
		if err != nil {
			return nil, err
		}
		created = append(created, childCreated...)
	}
	return created, nil
}

func nextAIChildType(unitType string) string {
	switch unitType {
	case "epic":
		return "feature"
	case "feature":
		return "story"
	default:
		return ""
	}
}

func (s *AgilerrService) createAIProposalUnit(projectRecord *core.Record, actorID, parentID string, proposal AIPlanProposal) (*core.Record, error) {
	req := SaveUnitRequest{
		ProjectID:   projectRecord.Id,
		ParentID:    parentID,
		Type:        strings.ToLower(strings.TrimSpace(proposal.Type)),
		Status:      "todo",
		Title:       strings.TrimSpace(proposal.Title),
		Description: strings.TrimSpace(proposal.Description),
		Tags:        normalizeTags(proposal.Tags),
	}
	if req.Type == "bug" {
		req.Status = "triage"
	}
	if err := validateUnitPayload(req); err != nil {
		return nil, err
	}
	parent, err := fetchParent(s.app, req.ParentID)
	if err != nil {
		return nil, err
	}
	if err := validateHierarchy(parent, req); err != nil {
		return nil, err
	}

	collection, err := s.app.FindCollectionByNameOrId(collectionUnits)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Set("project", req.ProjectID)
	record.Set("parent", req.ParentID)
	record.Set("type", req.Type)
	record.Set("status", req.Status)
	record.Set("priority", req.Priority)
	record.Set("title", req.Title)
	record.Set("description", req.Description)
	record.Set("color", projectColorForType(projectRecord, req.Type))
	record.Set("tags", req.Tags)
	record.Set("position", float64(time.Now().UnixMilli()))
	record.Set("createdBy", actorID)
	if err := s.app.Save(record); err != nil {
		return nil, err
	}
	return record.Fresh(), nil
}

func (s *AgilerrService) summarizeAIPlanSession(sessionRecord *core.Record, created []UnitDTO) (string, error) {
	if strings.TrimSpace(s.config.OpenAIAPIKey) == "" {
		return fallbackAIPlanSummary(sessionRecord, created), nil
	}
	messages, err := loadAIPlanMessages(s.app, sessionRecord.Id)
	if err != nil {
		return "", err
	}

	createdSummary := make([]string, 0, len(created))
	for _, item := range created {
		createdSummary = append(createdSummary, fmt.Sprintf("%s: %s", item.Type, item.Title))
	}
	chat := []AIPlanChatMessage{
		{
			Role:    "system",
			Content: "Summarize this Agile planning conversation in compact prose for future context. Mention what was decided, any rejected or deferred areas if obvious, and keep it under 180 words.",
		},
	}
	for _, msg := range messages {
		chat = append(chat, AIPlanChatMessage{Role: msg.Role, Content: msg.Content})
	}
	if len(createdSummary) > 0 {
		chat = append(chat, AIPlanChatMessage{
			Role:    "user",
			Content: "Approved and created items:\n" + strings.Join(createdSummary, "\n"),
		})
	}

	payload := struct {
		Model    string              `json:"model"`
		Messages []AIPlanChatMessage `json:"messages"`
	}{
		Model:    s.config.OpenAIModel,
		Messages: chat,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	endpoint, err := url.JoinPath(strings.TrimRight(s.config.OpenAIBaseURL, "/"), "/v1/chat/completions")
	if err != nil {
		return "", err
	}
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.config.OpenAIAPIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("summary request failed: %s", strings.TrimSpace(string(raw)))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("summary returned no choices")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}

func fallbackAIPlanSummary(sessionRecord *core.Record, created []UnitDTO) string {
	dto := recordToAIPlanSession(sessionRecord)
	parts := []string{fmt.Sprintf("Planning context: %s for %s.", dto.TargetType, dto.ContextType)}
	if dto.LatestAssistant != "" {
		parts = append(parts, "Latest assistant guidance: "+dto.LatestAssistant)
	}
	if len(created) > 0 {
		titles := make([]string, 0, len(created))
		for _, item := range created {
			titles = append(titles, fmt.Sprintf("%s %q", item.Type, item.Title))
		}
		parts = append(parts, "Created: "+strings.Join(titles, ", ")+".")
	}
	return strings.Join(parts, " ")
}
