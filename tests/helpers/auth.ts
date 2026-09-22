import type { Fixture } from "./fixtures.js";
import type { TestHarness } from "./harness.js";

export async function loginAs(h: TestHarness, actor: Fixture): Promise<string> {
  const response = await h.http
    .post("/api/auth/login")
    .set("Origin", "http://localhost:3000")
    .send({
      email: actor.email,
      password: actor.password,
      workspace_id: actor.workspaceId,
    });
  if (response.status !== 200)
    throw new Error(
      `login failed (${response.status}): ${JSON.stringify(response.body)}`,
    );
  const value = response.headers["set-cookie"];
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) throw new Error("login response did not set the session cookie");
  return String(header).split(";", 1)[0];
}
