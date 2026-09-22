import { expect } from "vitest";
import type { TestHarness } from "./harness.js";

export async function waitForRun(h: TestHarness, id: string, status: string) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const result = await h.ownerPool.query(
      "SELECT * FROM agent_runs WHERE run_id=$1",
      [id],
    );
    if (result.rows[0]?.status === status) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const result = await h.ownerPool.query(
    "SELECT * FROM agent_runs WHERE run_id=$1",
    [id],
  );
  expect(result.rows[0]?.status).toBe(status);
  throw new Error("run did not reach expected state");
}

export function post(
  h: TestHarness,
  cookie: string,
  path: string,
  body: unknown,
  key = "agent-test-key-0001",
) {
  return h.http
    .post(path)
    .set("Cookie", cookie)
    .set("Origin", h.origin)
    .set("Idempotency-Key", key)
    .send(body);
}
