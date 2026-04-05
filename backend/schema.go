package main

import (
	"errors"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

func (s *AgilerrService) EnsureSchema() error {
	users, err := s.ensureUsersCollection()
	if err != nil {
		return err
	}
	if err := s.app.ReloadCachedCollections(); err != nil {
		return err
	}

	projects, err := s.ensureProjectsCollection()
	if err != nil {
		return err
	}
	if err := s.app.ReloadCachedCollections(); err != nil {
		return err
	}

	units, err := s.ensureUnitsCollection(projects.Id, users.Id)
	if err != nil {
		return err
	}
	if err := s.app.ReloadCachedCollections(); err != nil {
		return err
	}

	_, err = s.ensureCommentsCollection(units.Id, users.Id)
	if err != nil {
		return err
	}
	if err := s.app.ReloadCachedCollections(); err != nil {
		return err
	}

	_, err = s.ensureMembershipsCollection()
	if err != nil {
		return err
	}
	if err := s.app.ReloadCachedCollections(); err != nil {
		return err
	}

	_, err = s.ensureAIPlanSessionsCollection()
	if err != nil {
		return err
	}
	if err := s.app.ReloadCachedCollections(); err != nil {
		return err
	}

	_, err = s.ensureAIPlanMessagesCollection()
	if err != nil {
		return err
	}
	return s.app.ReloadCachedCollections()
}

func (s *AgilerrService) ensureUsersCollection() (*core.Collection, error) {
	col, err := s.app.FindCollectionByNameOrId(collectionUsers)
	if err != nil {
		col = core.NewAuthCollection(collectionUsers)
	}

	self := types.Pointer("@request.auth.id = id")

	col.CreateRule = nil
	col.ViewRule = self
	col.UpdateRule = self
	col.DeleteRule = nil
	col.ListRule = nil
	col.Fields.Add(
		&core.TextField{Name: "name", Required: true, Min: 1, Max: 120},
		&core.BoolField{Name: "isSystemAdmin"},
		&core.BoolField{Name: "createProjects"},
		&core.BoolField{Name: "mustChangePassword"},
	)

	return col, s.app.Save(col)
}

func (s *AgilerrService) ensureProjectsCollection() (*core.Collection, error) {
	col, err := s.app.FindCollectionByNameOrId(collectionProjects)
	if err != nil {
		col = core.NewBaseCollection(collectionProjects)
	} else if col.Type != core.CollectionTypeBase {
		return nil, errors.New("projects collection exists with an incompatible type")
	}

	authenticated := types.Pointer("@request.auth.id != ''")

	col.ListRule = authenticated
	col.ViewRule = authenticated
	col.CreateRule = authenticated
	col.UpdateRule = authenticated
	col.DeleteRule = authenticated
	col.Fields.Add(
		&core.TextField{Name: "name", Required: true, Min: 1, Max: 160},
		&core.TextField{Name: "description", Max: 12000},
		&core.TextField{Name: "color", Required: true, Min: 4, Max: 24},
		&core.JSONField{Name: "tags"},
		&core.JSONField{Name: "unitColors"},
		&core.JSONField{Name: "statusColors"},
		&core.TextField{Name: "deletedAt", Max: 64},
	)

	return col, s.app.Save(col)
}

func (s *AgilerrService) ensureUnitsCollection(_ string, _ string) (*core.Collection, error) {
	col, err := s.app.FindCollectionByNameOrId(collectionUnits)
	if err != nil {
		col = core.NewBaseCollection(collectionUnits)
	} else if col.Type != core.CollectionTypeBase {
		return nil, errors.New("units collection exists with an incompatible type")
	}

	if col.Id == "" {
		if err := s.app.Save(col); err != nil {
			return nil, err
		}
	}

	authenticated := types.Pointer("@request.auth.id != ''")

	col.ListRule = authenticated
	col.ViewRule = authenticated
	col.CreateRule = authenticated
	col.UpdateRule = authenticated
	col.DeleteRule = authenticated
	col.Fields.Add(
		&core.TextField{Name: "project", Required: true, Min: 1, Max: 32},
		&core.TextField{Name: "parent", Max: 32},
		&core.TextField{Name: "assignee", Max: 32},
		&core.SelectField{Name: "type", Required: true, Values: unitTypes},
		&core.SelectField{Name: "status", Required: true, Values: unitStatuses},
		&core.SelectField{Name: "priority", Values: bugPriorities},
		&core.TextField{Name: "title", Required: true, Min: 1, Max: 200},
		&core.TextField{Name: "description", Max: 12000},
		&core.TextField{Name: "color", Required: true, Min: 4, Max: 24},
		&core.JSONField{Name: "tags"},
		&core.NumberField{Name: "position"},
		&core.TextField{Name: "createdBy", Max: 32},
		&core.TextField{Name: "deletedAt", Max: 64},
	)

	return col, s.app.Save(col)
}

func (s *AgilerrService) ensureCommentsCollection(_ string, _ string) (*core.Collection, error) {
	col, err := s.app.FindCollectionByNameOrId(collectionComments)
	if err != nil {
		col = core.NewBaseCollection(collectionComments)
	} else if col.Type != core.CollectionTypeBase {
		return nil, errors.New("comments collection exists with an incompatible type")
	}

	authenticated := types.Pointer("@request.auth.id != ''")

	col.ListRule = authenticated
	col.ViewRule = authenticated
	col.CreateRule = authenticated
	col.UpdateRule = authenticated
	col.DeleteRule = authenticated
	col.Fields.Add(
		&core.TextField{Name: "unit", Required: true, Min: 1, Max: 32},
		&core.TextField{Name: "author", Required: true, Min: 1, Max: 32},
		&core.TextField{Name: "body", Required: true, Min: 1, Max: 20000},
		&core.JSONField{Name: "mentions"},
	)

	return col, s.app.Save(col)
}

func (s *AgilerrService) ensureMembershipsCollection() (*core.Collection, error) {
	col, err := s.app.FindCollectionByNameOrId(collectionMemberships)
	if err != nil {
		col = core.NewBaseCollection(collectionMemberships)
	} else if col.Type != core.CollectionTypeBase {
		return nil, errors.New("project memberships collection exists with an incompatible type")
	}

	authenticated := types.Pointer("@request.auth.id != ''")

	col.ListRule = authenticated
	col.ViewRule = authenticated
	col.CreateRule = authenticated
	col.UpdateRule = authenticated
	col.DeleteRule = authenticated
	col.Fields.Add(
		&core.TextField{Name: "user", Required: true, Min: 1, Max: 32},
		&core.TextField{Name: "project", Required: true, Min: 1, Max: 32},
		&core.JSONField{Name: "permissions"},
	)

	return col, s.app.Save(col)
}

func (s *AgilerrService) ensureAIPlanSessionsCollection() (*core.Collection, error) {
	col, err := s.app.FindCollectionByNameOrId(collectionAIPlanSessions)
	if err != nil {
		col = core.NewBaseCollection(collectionAIPlanSessions)
	} else if col.Type != core.CollectionTypeBase {
		return nil, errors.New("ai plan sessions collection exists with an incompatible type")
	}

	authenticated := types.Pointer("@request.auth.id != ''")

	col.ListRule = authenticated
	col.ViewRule = authenticated
	col.CreateRule = authenticated
	col.UpdateRule = authenticated
	col.DeleteRule = authenticated
	col.Fields.Add(
		&core.TextField{Name: "project", Required: true, Min: 1, Max: 32},
		&core.TextField{Name: "contextType", Required: true, Min: 1, Max: 32},
		&core.TextField{Name: "contextId", Required: true, Min: 1, Max: 32},
		&core.SelectField{Name: "targetType", Required: true, Values: []string{"project", "epic", "feature", "story", "bug"}},
		&core.BoolField{Name: "includeGrandchildren"},
		&core.SelectField{Name: "status", Required: true, Values: []string{"active", "done"}},
		&core.TextField{Name: "summary", Max: 20000},
		&core.TextField{Name: "latestAssistant", Max: 20000},
		&core.JSONField{Name: "projectDraft"},
		&core.JSONField{Name: "proposals"},
	)

	return col, s.app.Save(col)
}

func (s *AgilerrService) ensureAIPlanMessagesCollection() (*core.Collection, error) {
	col, err := s.app.FindCollectionByNameOrId(collectionAIPlanMessages)
	if err != nil {
		col = core.NewBaseCollection(collectionAIPlanMessages)
	} else if col.Type != core.CollectionTypeBase {
		return nil, errors.New("ai plan messages collection exists with an incompatible type")
	}

	authenticated := types.Pointer("@request.auth.id != ''")

	col.ListRule = authenticated
	col.ViewRule = authenticated
	col.CreateRule = authenticated
	col.UpdateRule = authenticated
	col.DeleteRule = authenticated
	col.Fields.Add(
		&core.TextField{Name: "session", Required: true, Min: 1, Max: 32},
		&core.TextField{Name: "role", Required: true, Min: 1, Max: 32},
		&core.TextField{Name: "content", Required: true, Min: 1, Max: 20000},
	)

	return col, s.app.Save(col)
}
