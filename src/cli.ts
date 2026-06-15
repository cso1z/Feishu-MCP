#!/usr/bin/env node

import { resolve } from "path";
import { config } from "dotenv";
import { Logger } from "./utils/logger.js";
import { printVersionIfRequested } from "./utils/packageVersion.js";

if (printVersionIfRequested(process.argv.slice(2))) {
  process.exit(0);
}

const { startServer } = await import("./index.js");

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
