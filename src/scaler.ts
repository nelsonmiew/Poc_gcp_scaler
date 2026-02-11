import * as cloudrun from "./cloudrun.js";
import type { ScalerConfig } from "./config.js";
import { logger } from "./logger.js";
import * as rabbitmq from "./rabbitmq.js";

export interface ScaleResult {
  queueDepth: number;
  currentInstances: number;
  targetInstances: number;
  scaled: boolean;
}

export async function scale(config: ScalerConfig): Promise<ScaleResult> {
  logger.debug("Starting scale operation");

  // 1. Get RabbitMQ queue depth
  const queueDepth = await rabbitmq.getQueueDepth({
    url: config.rabbitmqUrl,
    queue: config.taskQueue,
  });

  // 2. Calculate target instance count
  const targetInstances = Math.min(
    Math.max(
      Math.ceil(queueDepth / config.targetPerInstance),
      config.minInstances,
    ),
    config.maxInstances,
  );

  logger.debug("Calculated target instances", {
    queueDepth,
    targetPerInstance: config.targetPerInstance,
    minInstances: config.minInstances,
    maxInstances: config.maxInstances,
    targetInstances,
  });

  // 3. Get current processor instance count
  const currentInstances = await cloudrun.getInstanceCount({
    projectId: config.projectId,
    region: config.region,
    serviceName: config.processorServiceName,
  });

  // 4. Update if different
  if (targetInstances !== currentInstances) {
    const reason =
      targetInstances > currentInstances ? "scale_up" : "scale_down";

    if (config.dryRun) {
      logger.info("[DRY RUN] Would scale processor", {
        from: currentInstances,
        to: targetInstances,
        queueDepth,
        reason,
      });
    } else {
      await cloudrun.updateInstanceCount({
        projectId: config.projectId,
        region: config.region,
        serviceName: config.processorServiceName,
        instanceCount: targetInstances,
      });

      logger.info("Scaled processor", {
        from: currentInstances,
        to: targetInstances,
        queueDepth,
        reason,
      });
    }
  } else {
    logger.debug("No scaling needed", {
      currentInstances,
      targetInstances,
      queueDepth,
    });
  }

  return {
    queueDepth,
    currentInstances,
    targetInstances,
    scaled: targetInstances !== currentInstances,
  };
}
