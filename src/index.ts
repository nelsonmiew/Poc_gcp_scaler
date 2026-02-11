import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { scale } from "./scaler.js";

const app = new Hono();
const config = loadConfig();

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "healthy" });
});

// Scale endpoint (called by Cloud Scheduler)
app.post("/scale", async (c) => {
  try {
    logger.info("Scale request received");

    const result = await scale(config);

    return c.json({
      status: "success",
      ...result,
    });
  } catch (error) {
    logger.error("Scaling failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Graceful shutdown
let isShuttingDown = false;

process.on("SIGTERM", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("SIGTERM received, starting graceful shutdown");

  // Give time for in-flight requests to complete
  await new Promise((resolve) => setTimeout(resolve, 5000));

  logger.info("Graceful shutdown complete");
  process.exit(0);
});

// Start server
const port = Number.parseInt(process.env.PORT ?? "8080", 10);

logger.info("Starting custom scaler service", {
  port,
  projectId: config.projectId,
  region: config.region,
  processorServiceName: config.processorServiceName,
  taskQueue: config.taskQueue,
  targetPerInstance: config.targetPerInstance,
  minInstances: config.minInstances,
  maxInstances: config.maxInstances,
  dryRun: config.dryRun,
});

serve({
  fetch: app.fetch,
  port,
});

logger.info("Custom scaler service started", { port });
