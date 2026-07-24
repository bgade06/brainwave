import "dotenv/config";
import { createApp } from "./app.js";
import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseReady,
} from "./config/database.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
await connectDatabase(env.MONGODB_URI);

const server = createApp({
  config: env,
  readinessCheck: isDatabaseReady,
}).listen(env.PORT, () => {
  console.log(`Brainwave API listening on port ${env.PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
