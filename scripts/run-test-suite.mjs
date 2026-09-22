import { spawn } from "node:child_process";

await import("./check-integration-db.mjs");

const vitest = process.platform === "win32" ? "vitest.cmd" : "vitest";
const child = spawn(vitest, ["run"], { stdio: "inherit" });
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
