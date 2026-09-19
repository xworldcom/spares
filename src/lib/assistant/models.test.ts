import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ASSISTANT_MODEL,
  isAllowedAssistantModel,
  resolveAssistantModel,
} from "./models.ts";

describe("assistant models", () => {
  it("keeps an unknown model on the default", () => {
    assert.equal(resolveAssistantModel("gpt-4o"), DEFAULT_ASSISTANT_MODEL);
    assert.equal(resolveAssistantModel(""), DEFAULT_ASSISTANT_MODEL);
    assert.equal(resolveAssistantModel(undefined), DEFAULT_ASSISTANT_MODEL);
  });

  it("accepts a curated id", () => {
    assert.equal(isAllowedAssistantModel("google/gemini-3.8-flash"), true);
    assert.equal(resolveAssistantModel("anthropic/claude-sonnet-5"), "anthropic/claude-sonnet-5");
  });
});
