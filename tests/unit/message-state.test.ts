import { describe, expect, it } from "vitest";
import { canTransitionMessage } from "@pacaembu/contracts";

describe("message state machine", () => {
  it("allows only the active preparatory-cycle transitions", () => {
    expect(canTransitionMessage("received", "processing")).toBe(true);
    expect(canTransitionMessage("processing", "draft")).toBe(true);
    expect(canTransitionMessage("draft", "failed")).toBe(true);
    expect(canTransitionMessage("draft", "sent")).toBe(false);
    expect(canTransitionMessage("failed", "processing")).toBe(false);
  });
});
