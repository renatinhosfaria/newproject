import { access } from "node:fs/promises";
import { spawn } from "node:child_process";

await import("./check-integration-db.mjs");

try {
  await access("tests/integration");
} catch {
  console.error(
    "Integration tests are not present; add tests under tests/integration before running them.",
  );
  process.exit(1);
}

const vitest = process.platform === "win32" ? "vitest.cmd" : "vitest";
const child = spawn(vitest, ["run", "--project", "integration"], {
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
