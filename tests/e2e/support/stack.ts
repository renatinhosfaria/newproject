// Test-only process: one isolated API harness (own PostgreSQL schema, synthetic
// fixtures, deterministic mock) behind a same-origin proxy. `/api/` goes to the
// API and everything else to the shared Next.js server, mirroring the reverse
// proxy used outside tests. Control commands arrive through stdin, never HTTP.
import http from "node:http";
import { createInterface } from "node:readline";
import { createHarness, type TestHarness } from "../../helpers/harness.js";
import type { MockScenario } from "../../helpers/agent-adapter.js";
import { maintenance } from "../../../db/maintenance.js";

const scenario = (process.argv[2] || undefined) as MockScenario | undefined;
const webUrl = process.env.E2E_WEB_URL;
if (!webUrl) throw new Error("E2E_WEB_URL is required");

const sseResponses = new Set<http.ServerResponse>();
let blockSse = false;
let apiUrl = "";
let harness: TestHarness | undefined;

const proxy = http.createServer((req, res) => {
  const path = req.url ?? "/";
  const isApi = path.startsWith("/api/");
  const isSse = isApi && /^\/api\/agent-sessions\/[^/]+\/events/.test(path);
  if (isSse && blockSse) {
    // Deterministic network failure: the browser sees a reset connection.
    req.socket.destroy();
    return;
  }
  const upstream = http.request(
    new URL(path, isApi ? apiUrl : webUrl),
    { method: req.method, headers: req.headers },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      if (isSse) {
        sseResponses.add(res);
        res.on("close", () => sseResponses.delete(res));
      }
      response.pipe(res);
    },
  );
  upstream.on("error", () => res.destroy());
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
});

async function command(name: string, args: string[]): Promise<unknown> {
  const h = harness!;
  switch (name) {
    case "drop-sse":
      for (const res of sseResponses) res.destroy();
      return sseResponses.size;
    case "block-sse":
      blockSse = true;
      return true;
    case "unblock-sse":
      blockSse = false;
      return true;
    case "release":
      h.releaseAgent();
      return true;
    case "disable-agent":
    case "enable-agent":
      // Workspace policy change while a run is active (owner fixture access).
      await h.ownerPool.query(
        "UPDATE workspace_agents SET enabled = $1 WHERE agent_id = (SELECT id FROM agents WHERE key = 'atendimento')",
        [name === "enable-agent"],
      );
      return true;
    case "revoke-sessions":
      await h.ownerPool.query(
        "UPDATE auth_sessions SET revoked_at = $1 WHERE revoked_at IS NULL",
        [h.clock.now()],
      );
      return true;
    case "expire-events": {
      // Same boundary the retention job uses; the run and its result remain.
      await h.ownerPool.query(
        "UPDATE agent_runs SET events_expire_at = $1 WHERE run_id = $2 AND status IN ('completed','failed','cancelled')",
        [h.clock.now(), args[0]],
      );
      await maintenance(h.ownerPool, h.clock.now());
      return true;
    }
    default:
      throw new Error(`unknown command ${name}`);
  }
}

let closing: Promise<void> | undefined;
function shutdown(): Promise<void> {
  closing ??= (async () => {
    for (const res of sseResponses) res.destroy();
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await harness?.close();
  })();
  return closing;
}

async function main(): Promise<void> {
  await new Promise<void>((resolve) =>
    proxy.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("no address");
  const origin = `http://127.0.0.1:${address.port}`;
  harness = await createHarness({
    allowedOrigin: origin,
    mockScenario: scenario,
  });
  await harness.app.listen(0, "127.0.0.1");
  apiUrl = await harness.app.getUrl();
  process.stdout.write(
    `${JSON.stringify({ type: "ready", baseURL: origin, fixtures: harness.fixtures })}\n`,
  );
  const lines = createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    const {
      id,
      cmd,
      args = [],
    } = JSON.parse(line) as {
      id: number;
      cmd: string;
      args?: string[];
    };
    command(cmd, args).then(
      (result) =>
        process.stdout.write(`${JSON.stringify({ id, ok: true, result })}\n`),
      (error: Error) =>
        process.stdout.write(
          `${JSON.stringify({ id, ok: false, error: error.message })}\n`,
        ),
    );
  });
  lines.on("close", () => {
    void shutdown().finally(() => process.exit(0));
  });
}

for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    void shutdown().finally(() => process.exit(0));
  });

main().catch(async (error: Error) => {
  process.stderr.write(`stack failed: ${error.message}\n`);
  await shutdown().catch(() => {});
  process.exit(1);
});
