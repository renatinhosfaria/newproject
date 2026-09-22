import { describe, expect, it } from "vitest";
import {
  MessageAuthorSchema,
  MessageDirectionSchema,
  MessageStatusSchema,
  canTransitionMessage,
} from "@pacaembu/contracts";

describe("message state machine", () => {
  it("keeps the preparatory-cycle message DTO status vocabulary exact", () => {
    expect(MessageDirectionSchema.options).toEqual(["inbound", "outbound"]);
    expect(MessageAuthorSchema.options).toEqual([
      "lead",
      "broker",
      "agent",
      "system",
    ]);
    expect(MessageStatusSchema.options).toEqual([
      "received",
      "processing",
      "draft",
      "failed",
    ]);
  });

  it("allows only the active preparatory-cycle transitions", () => {
    expect(canTransitionMessage("received", "processing")).toBe(true);
    expect(canTransitionMessage("processing", "draft")).toBe(true);
    expect(canTransitionMessage("draft", "failed")).toBe(true);
    expect(canTransitionMessage("draft", "sent")).toBe(false);
    expect(canTransitionMessage("failed", "processing")).toBe(false);
  });
});
