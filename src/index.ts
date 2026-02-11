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

// Scale endpoint (for Cloud Scheduler compatibility)
// Note: This endpoint is called by an orphaned Cloud Scheduler job
// The service also runs a continuous 15-second scaling loop
app.post("/scale", async (c) => {
  logger.info("Scale request received");

  try {
    const result = await scale(config);
    logger.info("Scaling complete", {
      queueDepth: result.queueDepth,
      currentInstances: result.currentInstances,
      targetInstances: result.targetInstances,
      scaled: result.scaled,
    });

    return c.json({
      success: true,
      queueDepth: result.queueDepth,
      currentInstances: result.currentInstances,
      targetInstances: result.targetInstances,
      scaled: result.scaled,
    });
  } catch (error) {
    logger.error("Scaling failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

// Scaling function that runs continuously
let scalingInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;

async function runScalingLoop() {
  if (isShuttingDown) return;

  try {
    logger.info("Running scaling check");
    const result = await scale(config);
    logger.info("Scaling check complete", {
      queueDepth: result.queueDepth,
      currentInstances: result.currentInstances,
      targetInstances: result.targetInstances,
      scaled: result.scaled,
    });
  } catch (error) {
    logger.error("Scaling failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("SIGTERM received, starting graceful shutdown");

  // Stop the scaling loop
  if (scalingInterval) {
    clearInterval(scalingInterval);
    scalingInterval = null;
  }

  // Give time for current scaling operation to complete
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
  scalingInterval: "15 seconds",
});

serve({
  fetch: app.fetch,
  port,
});

logger.info("Custom scaler service started", { port });

// Start scaling loop - runs every 15 seconds
logger.info("Starting continuous scaling loop (every 15 seconds)");
runScalingLoop(); // Run immediately on startup
scalingInterval = setInterval(runScalingLoop, 15000);
