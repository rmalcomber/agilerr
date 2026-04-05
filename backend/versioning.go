package main

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	appSchemaVersion     = 1
	appMetaKeySchema     = "schema_version"
	appMetaKeyBinary     = "last_binary_version"
	appMetaKeyStartedAt  = "last_started_at"
	defaultBinaryVersion = "dev"
)

var (
	BinaryVersion = defaultBinaryVersion
)

type appMigration struct {
	Version int
	Name    string
	Run     func(*AgilerrService) error
}

var appMigrations = []appMigration{}

func normalizedBinaryVersion() string {
	version := strings.TrimSpace(BinaryVersion)
	if version == "" {
		return defaultBinaryVersion
	}
	return version
}

func (s *AgilerrService) EnsureDatabaseVersion() error {
	currentVersion, err := s.loadStoredSchemaVersion()
	if err != nil {
		return err
	}

	if currentVersion == 0 {
		if err := s.setAppMetaValue(appMetaKeySchema, strconv.Itoa(appSchemaVersion)); err != nil {
			return err
		}
		if err := s.recordBinaryStartup(); err != nil {
			return err
		}
		s.app.Logger().Info(
			"Initialized Agilerr database version state",
			"schemaVersion", appSchemaVersion,
			"binaryVersion", normalizedBinaryVersion(),
		)
		return nil
	}

	if currentVersion > appSchemaVersion {
		return fmt.Errorf(
			"database schema version %d is newer than this binary supports (%d). Please upgrade the Agilerr binary",
			currentVersion,
			appSchemaVersion,
		)
	}

	if currentVersion < appSchemaVersion {
		if err := s.runAppMigrations(currentVersion, appSchemaVersion); err != nil {
			return err
		}
		if err := s.setAppMetaValue(appMetaKeySchema, strconv.Itoa(appSchemaVersion)); err != nil {
			return err
		}
		s.app.Logger().Info(
			"Upgraded Agilerr database schema",
			"from", currentVersion,
			"to", appSchemaVersion,
			"binaryVersion", normalizedBinaryVersion(),
		)
	}

	return s.recordBinaryStartup()
}

func (s *AgilerrService) runAppMigrations(fromVersion, toVersion int) error {
	for nextVersion := fromVersion + 1; nextVersion <= toVersion; nextVersion++ {
		migration, ok := findAppMigration(nextVersion)
		if !ok {
			return fmt.Errorf("missing migration for schema version %d", nextVersion)
		}
		if err := migration.Run(s); err != nil {
			return fmt.Errorf("run migration %d (%s): %w", migration.Version, migration.Name, err)
		}
	}
	return nil
}

func findAppMigration(version int) (appMigration, bool) {
	for _, migration := range appMigrations {
		if migration.Version == version {
			return migration, true
		}
	}
	return appMigration{}, false
}

func (s *AgilerrService) loadStoredSchemaVersion() (int, error) {
	value, err := s.getAppMetaValue(appMetaKeySchema)
	if err != nil {
		return 0, err
	}
	if strings.TrimSpace(value) == "" {
		return 0, nil
	}
	version, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("parse stored schema version %q: %w", value, err)
	}
	return version, nil
}

func (s *AgilerrService) recordBinaryStartup() error {
	if err := s.setAppMetaValue(appMetaKeyBinary, normalizedBinaryVersion()); err != nil {
		return err
	}
	return s.setAppMetaValue(appMetaKeyStartedAt, time.Now().UTC().Format(time.RFC3339))
}

func (s *AgilerrService) getAppMetaValue(key string) (string, error) {
	record, err := s.findAppMetaRecord(key)
	if err != nil || record == nil {
		return "", err
	}
	return record.GetString("value"), nil
}

func (s *AgilerrService) setAppMetaValue(key, value string) error {
	collection, err := s.app.FindCollectionByNameOrId(collectionAppMeta)
	if err != nil {
		return err
	}
	record, err := s.findAppMetaRecord(key)
	if err != nil {
		return err
	}
	if record == nil {
		record = core.NewRecord(collection)
		record.Set("key", key)
	}
	record.Set("value", value)
	return s.app.Save(record)
}

func (s *AgilerrService) findAppMetaRecord(key string) (*core.Record, error) {
	records, err := s.app.FindAllRecords(collectionAppMeta, dbx.HashExp{"key": key})
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, nil
	}
	return records[0], nil
}
