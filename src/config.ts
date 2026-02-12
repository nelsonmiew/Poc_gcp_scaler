export interface ScalerConfig {
  rabbitmqUrl: string;
  taskQueue: string;
  targetPerInstance: number;
  minInstances: number;
  maxInstances: number;
  projectId: string;
  region: string;
  processorServiceName: string;
  dryRun: boolean;
  logLevel: string;
  pollingIntervalMs: number;
}

export function loadConfig(): ScalerConfig {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  };

  const config: ScalerConfig = {
    rabbitmqUrl: required("RABBITMQ_URL"),
    taskQueue: process.env.TASK_QUEUE ?? "tasks",
    targetPerInstance: Number.parseInt(
      process.env.TARGET_PER_INSTANCE ?? "3",
      10,
    ),
    minInstances: Number.parseInt(process.env.MIN_INSTANCES ?? "0", 10),
    maxInstances: Number.parseInt(process.env.MAX_INSTANCES ?? "5", 10),
    projectId: required("PROJECT_ID"),
    region: required("REGION"),
    processorServiceName: process.env.PROCESSOR_SERVICE_NAME ?? "poc-processor",
    dryRun: process.env.DRY_RUN === "true",
    logLevel: process.env.LOG_LEVEL ?? "info",
    pollingIntervalMs: Number.parseInt(
      process.env.POLLING_INTERVAL_MS ?? "2000",
      10,
    ),
  };

  // Validate configuration
  if (config.targetPerInstance <= 0) {
    throw new Error("TARGET_PER_INSTANCE must be > 0");
  }
  if (config.minInstances < 0) {
    throw new Error("MIN_INSTANCES must be >= 0");
  }
  if (config.maxInstances < config.minInstances) {
    throw new Error("MAX_INSTANCES must be >= MIN_INSTANCES");
  }
  if (config.pollingIntervalMs < 1000 || config.pollingIntervalMs > 60000) {
    throw new Error("POLLING_INTERVAL_MS must be between 1000 and 60000");
  }

  return config;
}
