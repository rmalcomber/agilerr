package main

import "testing"

func TestValidateHierarchy(t *testing.T) {
	if err := validateUnitPayload(SaveUnitRequest{
		Type:   "epic",
		Status: "todo",
		Title:  "Ship project setup",
	}); err != nil {
		t.Fatalf("expected valid payload, got %v", err)
	}

	if err := validateUnitPayload(SaveUnitRequest{
		Type:   "initiative",
		Status: "todo",
		Title:  "bad",
	}); err == nil {
		t.Fatal("expected invalid type error")
	}
}

func TestNormalizeTags(t *testing.T) {
	got := normalizeTags([]string{" API ", "api", "UI", "", "ui"})
	if len(got) != 2 || got[0] != "API" || got[1] != "UI" {
		t.Fatalf("unexpected tags: %#v", got)
	}
}
