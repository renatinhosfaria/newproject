import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type TestHarness } from "../helpers/harness.js";
import { loginAs } from "../helpers/auth.js";
import { post, waitForRun } from "../helpers/runs.js";
import { ManualSseScheduler } from "../helpers/sse-scheduler.js";
import { listenSse, readSse, SseParser } from "../helpers/sse.js";
import { EventStore } from "../../apps/api/src/agents/event-store.js";
import { maintenance } from "../../db/maintenance.js";

describe("authorized durable SSE over real HTTP", () => {
  let h: TestHarness;
  afterEach(async () => {
    await h?.close();
  });
  async function setup(config: Parameters<typeof createHarness>[0] = {}) {
    h = await createHarness(config);
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const lead = await post(h, cookie, "/api/leads", {
      name: "Lead sintético SSE",
    });
    const conversation = await post(h, cookie, "/api/conversations", {
      lead_id: lead.body.id,
    });
    const session = await post(h, cookie, "/api/agent-sessions", {
      agent_id: "atendimento",
      conversation_id: conversation.body.id,
    });
    expect(session.status).toBe(201);
    h.clock.advance(123);
    const run = await post(
      h,
      cookie,
      `/api/agent-sessions/${session.body.id}/messages`,
      { content: "Rascunho sintético SSE" },
    );
    expect(run.status).toBe(202);
    if (config.mockScenario === "hold") {
      for (let attempt = 0; attempt < 250; attempt++) {
        if (
          (
            await h.ownerPool.query(
              "SELECT 1 FROM agent_events WHERE run_id=$1 AND sequence=4",
              [run.body.run_id],
            )
          ).rowCount
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    const origin = await listenSse(h);
    const base = `${origin}/api/agent-sessions/${session.body.id}/events`;
    return {
      cookie,
      sessionId: session.body.id as string,
      runId: run.body.run_id as string,
      base,
      url: `${base}?run_id=${run.body.run_id}`,
    };
  }
  it("replays committed events after cursor, reconnects without duplicates and closes terminal", async () => {
    const { cookie, runId, url } = await setup();
    await waitForRun(h, runId, "completed");
    const replay = await readSse(
      url,
      { Cookie: cookie, "Last-Event-ID": `${runId}:2` },
      { signal: AbortSignal.timeout(5000) },
    );
    expect(replay.map((e) => e.sequence)).toEqual([3, 4, 5, 6]);
    expect(replay.at(-1)?.type).toBe("agent.run.completed");
    expect(new Set(replay.map((e) => e.id)).size).toBe(replay.length);
    expect(
      await readSse(
        url,
        { Cookie: cookie, "Last-Event-ID": `${runId}:6` },
        { signal: AbortSignal.timeout(5000) },
      ),
    ).toEqual([]);
    const all = await readSse(
      url,
      { Cookie: cookie },
      { signal: AbortSignal.timeout(5000) },
    );
    expect(all.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(all[0]).not.toHaveProperty("payload");
  });
  it("validates authorization and cursor before writing SSE headers", async () => {
    const { cookie, runId, url, base, sessionId } = await setup();
    await waitForRun(h, runId, "completed");
    const other = await post(
      h,
      cookie,
      `/api/agent-sessions/${sessionId}/messages`,
      { content: "outro" },
      "sse-other-run-0002",
    );
    await waitForRun(h, other.body.run_id, "completed");
    const foreign = await loginAs(h, h.fixtures.brokerB);
    const outsider = await loginAs(h, h.fixtures.brokerC);
    for (const [headers, status] of [
      [{}, 401],
      [{ Cookie: foreign }, 404],
      [{ Cookie: outsider }, 404],
      [{ Cookie: cookie, "Last-Event-ID": "bad" }, 422],
      [{ Cookie: cookie, "Last-Event-ID": `${runId}:999` }, 422],
      [{ Cookie: cookie, "Last-Event-ID": `${other.body.run_id}:1` }, 422],
    ] as [Record<string, string>, number][]) {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      expect(await response.text()).not.toContain("Rascunho sintético SSE");
    }
    expect((await fetch(base, { headers: { Cookie: cookie } })).status).toBe(
      422,
    );
  }, 10000);
  it("polls concurrent commits during replay and resumes after disconnect", async () => {
    const { cookie, runId, url, base } = await setup({ mockScenario: "hold" });
    await waitForRun(h, runId, "running");
    const first = await readSse(
      base,
      { Cookie: cookie },
      {
        signal: AbortSignal.timeout(5000),
        until: (e) => e.sequence === 2,
      },
    );
    expect(first.map((e) => e.sequence)).toEqual([1, 2]);
    const rest = await readSse(
      url,
      { Cookie: cookie, "Last-Event-ID": `${runId}:2` },
      {
        signal: AbortSignal.timeout(5000),
        until: (e) => {
          if (e.sequence === 3) h.releaseAgent();
          return false;
        },
      },
    );
    expect(rest.map((e) => e.sequence)).toEqual([3, 4, 5, 6]);
    expect(rest.at(-1)?.type).toBe("agent.run.completed");
  });
  it("returns 410 exactly seven days after terminal while history survives event maintenance", async () => {
    const { runId, url, sessionId } = await setup();
    const run = await waitForRun(h, runId, "completed");
    expect(
      new Date(run.events_expire_at).getTime() -
        new Date(run.updated_at).getTime(),
    ).toBe(7 * 86400000);
    h.clock.advance(7 * 86400000 - 1);
    const fresh = await loginAs(h, h.fixtures.brokerA);
    const retained = await readSse(
      url,
      { Cookie: fresh },
      { signal: AbortSignal.timeout(5000) },
    );
    expect(retained.at(-1)?.type).toBe("agent.run.completed");
    h.clock.advance(1);
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const foreign = await loginAs(h, h.fixtures.brokerB);
    for (const [actor, status] of [
      [cookie, 410],
      [foreign, 404],
    ] as const) {
      const response = await fetch(url, {
        headers: { Cookie: actor, "Last-Event-ID": `${runId}:2` },
      });
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain(
        "application/problem+json",
      );
    }
    await maintenance(h.ownerPool, h.clock.now());
    expect(
      (
        await h.ownerPool.query("SELECT 1 FROM agent_events WHERE run_id=$1", [
          runId,
        ])
      ).rowCount,
    ).toBe(0);
    const detail = await h.http
      .get(`/api/agent-sessions/${sessionId}`)
      .set("Cookie", cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.runs[0]).toMatchObject({
      input_content: "Rascunho sintético SSE",
      result: { type: "draft" },
    });
    expect(
      (
        await fetch(url, {
          headers: { Cookie: cookie, "Last-Event-ID": `${runId}:2` },
        })
      ).status,
    ).toBe(410);
  });
  async function openHeld(
    url: string,
    cookie: string,
    signal = AbortSignal.timeout(5000),
  ) {
    const response = await fetch(url, { headers: { Cookie: cookie }, signal });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "no-cache, no-transform",
    );
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const reader = response.body!.getReader();
    const parser = new SseParser();
    const decoder = new TextDecoder();
    let last = 0;
    while (last < 4) {
      const next = await reader.read();
      expect(next.done).toBe(false);
      const events = parser.push(decoder.decode(next.value));
      last = events.at(-1)?.sequence ?? last;
    }
    return reader;
  }
  it("sends heartbeat at 15s with controlled timers and releases timers on abort", async () => {
    const scheduler = new ManualSseScheduler();
    const { cookie, url } = await setup({
      mockScenario: "hold",
      sseScheduler: scheduler,
    });
    const abort = new AbortController();
    const reader = await openHeld(url, cookie, abort.signal);
    expect(scheduler.size).toBe(2);
    let early = false;
    const next = reader.read().then((chunk) => {
      early = true;
      return chunk;
    });
    await scheduler.advance(14999);
    expect(early).toBe(false);
    await scheduler.advance(1);
    expect(new TextDecoder().decode((await next).value)).toBe(
      ": heartbeat\n\n",
    );
    await Promise.all([scheduler.fire(250), scheduler.fire(15000)]);
    const overlap = await Promise.race([
      reader.read().then((chunk) => new TextDecoder().decode(chunk.value)),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("missing heartbeat"), 500),
      ),
    ]);
    expect(overlap).toBe(": heartbeat\n\n");
    abort.abort();
    await reader.cancel().catch(() => {});
    for (let i = 0; i < 100 && scheduler.size; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(scheduler.size).toBe(0);
  }, 10000);
  it.each([
    "auth",
    "expiry",
    "membership",
    "user",
    "workspace",
    "broker",
    "agent-session",
  ])("closes before another batch after %s revocation", async (change) => {
    const scheduler = new ManualSseScheduler();
    const { cookie, url, sessionId } = await setup({
      mockScenario: "hold",
      sseScheduler: scheduler,
    });
    const reader = await openHeld(url, cookie);
    const actor = h.fixtures.brokerA;
    if (change === "auth")
      await h.ownerPool.query("UPDATE auth_sessions SET revoked_at=$1", [
        h.clock.now(),
      ]);
    if (change === "expiry") h.clock.advance(8 * 3600000);
    if (change === "membership")
      await h.ownerPool.query(
        "UPDATE workspace_memberships SET status='suspended' WHERE id=$1",
        [actor.membershipId],
      );
    if (change === "user")
      await h.ownerPool.query(
        "UPDATE users SET status='suspended' WHERE id=$1",
        [actor.userId],
      );
    if (change === "workspace")
      await h.ownerPool.query(
        "UPDATE workspaces SET status='suspended' WHERE id=$1",
        [actor.workspaceId],
      );
    if (change === "broker")
      await h.ownerPool.query(
        "UPDATE brokers SET status='suspended' WHERE id=$1",
        [actor.brokerId],
      );
    if (change === "agent-session")
      await h.ownerPool.query(
        "UPDATE agent_sessions SET status='stopped' WHERE id=$1",
        [sessionId],
      );
    // Exercise the heartbeat callback directly too: it must not rely on a
    // previous poll noticing the revocation.
    await scheduler.fire(change === "auth" ? 15000 : 250);
    expect(await reader.read()).toMatchObject({ done: true });
    expect(scheduler.size).toBe(0);
  });
  it("requires a run_id when multiple runs are active", async () => {
    const { cookie, sessionId, base } = await setup({ executorPaused: true });
    const second = await post(
      h,
      cookie,
      `/api/agent-sessions/${sessionId}/messages`,
      { content: "segundo" },
      "sse-second-active-key",
    );
    expect(second.status).toBe(202);
    const response = await fetch(base, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(5000),
    });
    expect(response.status).toBe(422);
  });
  it("rejects foreign cursor IDs without revealing retention or data", async () => {
    const { cookie, runId, sessionId, url } = await setup();
    await waitForRun(h, runId, "completed");
    const foreign = await loginAs(h, h.fixtures.brokerB);
    const otherSession = await post(h, foreign, "/api/agent-sessions", {
      agent_id: "atendimento",
    });
    const foreignRun = await post(
      h,
      foreign,
      `/api/agent-sessions/${otherSession.body.id}/messages`,
      { content: "privado" },
    );
    await waitForRun(h, foreignRun.body.run_id, "completed");
    const response = await fetch(url, {
      headers: {
        Cookie: cookie,
        "Last-Event-ID": `${foreignRun.body.run_id}:1`,
      },
    });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("privado");
    const wrongTarget = await fetch(
      url.replace(runId, foreignRun.body.run_id),
      { headers: { Cookie: cookie } },
    );
    expect(wrongTarget.status).toBe(404);
    const ownedSession = await post(
      h,
      cookie,
      "/api/agent-sessions",
      { agent_id: "atendimento" },
      "sse-other-session-key",
    );
    const ownedRun = await post(
      h,
      cookie,
      `/api/agent-sessions/${ownedSession.body.id}/messages`,
      { content: "outro" },
    );
    await waitForRun(h, ownedRun.body.run_id, "completed");
    expect(
      (
        await fetch(url, {
          headers: {
            Cookie: cookie,
            "Last-Event-ID": `${ownedRun.body.run_id}:1`,
          },
        })
      ).status,
    ).toBe(422);
    expect(sessionId).not.toBe(ownedSession.body.id);
  });
  it("replays a failed terminal and retains history across app restart", async () => {
    const { cookie, runId, sessionId } = await setup({
      mockScenario: "unavailable",
    });
    await waitForRun(h, runId, "failed");
    await h.restartApp();
    const origin = await listenSse(h);
    const events = await readSse(
      `${origin}/api/agent-sessions/${sessionId}/events?run_id=${runId}`,
      { Cookie: cookie },
      { signal: AbortSignal.timeout(5000) },
    );
    expect(events.map((e) => e.type)).toEqual(["agent.run.failed"]);
    expect(events[0].data).toMatchObject({
      code: "HERMES_PROFILE_UNAVAILABLE",
    });
  });

  it("drains every bounded batch before closing a terminal run", async () => {
    const scheduler = new ManualSseScheduler();
    const { cookie, url, runId } = await setup({
      executorPaused: true,
      sseScheduler: scheduler,
    });
    await h.ownerPool.query(
      `INSERT INTO agent_events(workspace_id,broker_id,session_id,run_id,sequence,type,payload,request_id,occurred_at)
      SELECT workspace_id,broker_id,session_id,run_id,n,CASE WHEN n=205 THEN 'agent.run.completed' ELSE 'agent.tool.called' END,'{}',request_id,$2
      FROM agent_runs CROSS JOIN generate_series(1,205) AS n WHERE run_id=$1`,
      [runId, h.clock.now()],
    );
    await h.ownerPool.query(
      "UPDATE agent_runs SET status='completed',events_expire_at=$2 WHERE run_id=$1",
      [runId, new Date(h.clock.now().getTime() + 7 * 86400000)],
    );
    const events = await readSse(
      url,
      { Cookie: cookie },
      {
        signal: AbortSignal.timeout(5000),
        until: async (event) => {
          if (event.sequence % 100 === 0) await scheduler.fire(250);
          return false;
        },
      },
    );
    expect(events).toHaveLength(205);
    expect(events[0].sequence).toBe(1);
    expect(events.at(-1)).toMatchObject({
      sequence: 205,
      type: "agent.run.completed",
    });
    expect(new Set(events.map((event) => event.sequence)).size).toBe(205);
    expect(scheduler.size).toBe(0);
  });
  it("maintenance preserves live events even when their expiry metadata is old", async () => {
    const { runId, cookie, sessionId } = await setup({ executorPaused: true });
    await h.ownerPool.query(
      "UPDATE agent_runs SET status='running',events_expire_at=$2 WHERE run_id=$1",
      [runId, new Date(h.clock.now().getTime() - 1)],
    );
    await h.ownerPool.query(
      `INSERT INTO agent_events(workspace_id,broker_id,session_id,run_id,sequence,type,payload,request_id)
      SELECT workspace_id,broker_id,session_id,run_id,1,'agent.run.started','{}',request_id FROM agent_runs WHERE run_id=$1`,
      [runId],
    );
    await maintenance(h.ownerPool, h.clock.now());
    expect(
      (
        await h.ownerPool.query(
          "SELECT sequence FROM agent_events WHERE run_id=$1",
          [runId],
        )
      ).rows,
    ).toEqual([{ sequence: 1 }]);
    const detail = await h.http
      .get(`/api/agent-sessions/${sessionId}`)
      .set("Cookie", cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.runs[0]).toMatchObject({
      status: "running",
      input_content: "Rascunho sintético SSE",
    });
  });
  it("closes a cancelled run replay and drops streams during application shutdown", async () => {
    const scheduler = new ManualSseScheduler();
    const { cookie, url, runId, sessionId } = await setup({
      mockScenario: "hold",
      sseScheduler: scheduler,
    });
    const reader = await openHeld(url, cookie);
    await h.restartApp();
    expect(await reader.read()).toMatchObject({ done: true });
    expect(scheduler.size).toBe(0);
    await waitForRun(h, runId, "cancelled");
    const origin = await listenSse(h);
    const events = await readSse(
      `${origin}/api/agent-sessions/${sessionId}/events?run_id=${runId}`,
      { Cookie: cookie, "Last-Event-ID": `${runId}:4` },
      { signal: AbortSignal.timeout(5000) },
    );
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({
      status: "cancelled",
      code: "RUN_CANCELLED",
    });
    expect(scheduler.size).toBe(0);
  });
  it("does not create timers if the socket closes during preflight authorization", async () => {
    const scheduler = new ManualSseScheduler();
    const { cookie, url } = await setup({
      executorPaused: true,
      sseScheduler: scheduler,
    });
    const store = h.app.get(EventStore);
    const prepare = store.prepare.bind(store);
    let entered!: () => void;
    let release!: () => void;
    const preparing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi
      .spyOn(store, "prepare")
      .mockImplementation(async (...args) => {
        const state = await prepare(...args);
        entered();
        await gate;
        return state;
      });
    const disconnected = new Promise<void>((resolve) => {
      h.app
        .getHttpServer()
        .once(
          "request",
          (_request: unknown, response: import("node:http").ServerResponse) =>
            response.once("close", resolve),
        );
    });
    const abort = new AbortController();
    const request = fetch(url, {
      headers: { Cookie: cookie },
      signal: abort.signal,
    }).catch(() => undefined);
    try {
      await preparing;
      abort.abort();
      await disconnected;
      release();
      await request;
      await new Promise((resolve) => setImmediate(resolve));
      expect(scheduler.size).toBe(0);
    } finally {
      release();
      spy.mockRestore();
    }
  });
});
