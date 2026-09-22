import { createApp } from "./app.js";

async function main(): Promise<void> {
  const app = await createApp({
    nodeEnv: process.env.NODE_ENV,
    allowedOrigin: process.env.APP_ORIGIN,
    databaseUrl: process.env.DATABASE_URL,
  });
  const port = Number(process.env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    await app.close();
    throw new Error("API_PORT must be a valid TCP port");
  }
  try {
    await app.listen(port, process.env.API_HOST ?? "127.0.0.1");
  } catch (error) {
    await app.close();
    throw error;
  }
}

await main();
