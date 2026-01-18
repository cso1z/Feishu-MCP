#!/usr/bin/env node

import { resolve } from "path";
import { config } from "dotenv";
import { startServer } from "./index.js";
import { Logger } from "./utils/logger.js";

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
