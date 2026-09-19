import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSISTANT_EMAIL,
  ASSISTANT_NAME,
  assistantActorLabel,
  isAssistantActivity,
} from "./actor.ts";

describe("assistant actor", () => {
  it("labels the plant assistant as AI", () => {
    assert.equal(assistantActorLabel(), "AI");
    assert.equal(ASSISTANT_NAME, "AI");
  });

  it("recognizes assistant messages by role or email", () => {
    assert.equal(
      isAssistantActivity({ actorRole: "assistant", actorEmail: ASSISTANT_EMAIL }),
      true,
    );
    assert.equal(
      isAssistantActivity({ actorRole: "staff", actorEmail: ASSISTANT_EMAIL }),
      true,
    );
    assert.equal(
      isAssistantActivity({ actorRole: "staff", actorEmail: "tech@host.test" }),
      false,
    );
  });
});
