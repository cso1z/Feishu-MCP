#!/usr/bin/env node

import { resolve } from "path";
import { createRequire } from "module";
import { config } from "dotenv";
import { startServer } from "./index.js";
import { Logger } from "./utils/logger.js";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const require = createRequire(import.meta.url);
  const packageJson = require("../package.json") as { version: string };
  console.log(packageJson.version);
  process.exit(0);
}

// Load .env from the current working directory
config({ path: resolve(process.cwd(), ".env") });

startServer().catch((error: unknown) => {
  if (error instanceof Error) {
    Logger.error("Failed to start server:", error.message);
  } else {
    Logger.error("Failed to start server with unknown error:", error);
  }
  process.exit(1);
});
