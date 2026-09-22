import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type TestHarness } from "../helpers/harness.js";

describe("container health", () => {
  let h: TestHarness | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it("keeps liveness independent and requires the latest migration for readiness", async () => {
    h = await createHarness();
    const live = await h.http.get("/api/health/live");
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: "ok" });
    const ready = await h.http.get("/api/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: "ready" });

    await h.ownerPool.query(
      "DELETE FROM schema_migrations WHERE version='0012'",
    );
    const unavailable = await h.http.get("/api/health/ready");
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(unavailable.body)).not.toContain("postgres://");
    expect(JSON.stringify(unavailable.body)).not.toContain("pacaembu_app");
    expect((await h.http.get("/api/health/live")).status).toBe(200);
  });
});
