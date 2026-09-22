import net from "node:net";

const databaseUrl = process.env.DATABASE_URL_TEST;

if (!databaseUrl) {
  console.error(
    "Integration tests require DATABASE_URL_TEST; PostgreSQL was not configured.",
  );
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  console.error("Integration tests require a valid DATABASE_URL.");
  process.exit(1);
}

if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
  console.error(
    "DATABASE_URL must use the postgres:// or postgresql:// scheme.",
  );
  process.exit(1);
}

if (!parsed.pathname.endsWith("_test")) {
  console.error("Integration tests require a database name ending in _test.");
  process.exit(1);
}

const host = parsed.hostname || "127.0.0.1";
const port = Number(parsed.port || 5432);

await new Promise((resolve) => {
  const socket = net.createConnection({ host, port });
  const timeout = setTimeout(() => {
    socket.destroy();
    console.error(
      `Integration tests require PostgreSQL at ${host}:${port}; connection timed out.`,
    );
    process.exitCode = 1;
    resolve();
  }, 1500);

  socket.once("connect", () => {
    clearTimeout(timeout);
    socket.end();
    resolve();
  });
  socket.once("error", () => {
    clearTimeout(timeout);
    console.error(
      `Integration tests require PostgreSQL at ${host}:${port}; connection failed.`,
    );
    process.exitCode = 1;
    resolve();
  });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
