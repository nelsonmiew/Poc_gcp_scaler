import { logger } from "./logger.js";

export async function getQueueDepth(params: {
  url: string;
  queue: string;
}): Promise<number> {
  try {
    // Convert AMQP URL to management API URL
    const managementUrl = params.url
      .replace("amqp://", "http://")
      .replace(":5672", ":15672");

    // Extract credentials from URL
    const urlObj = new URL(managementUrl);
    const username = urlObj.username || "guest";
    const password = urlObj.password || "guest";

    // Build management API URL
    const queueUrl = `${urlObj.protocol}//${urlObj.host}/api/queues/%2F/${params.queue}`;

    logger.debug("Fetching queue depth", {
      queueUrl,
      queue: params.queue,
    });

    const response = await fetch(queueUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch queue depth: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { messages?: number };
    const depth = data.messages ?? 0;

    logger.debug("Queue depth retrieved", {
      queue: params.queue,
      depth,
    });

    return depth;
  } catch (error) {
    logger.error("Failed to get queue depth", {
      error: error instanceof Error ? error.message : String(error),
      queue: params.queue,
    });
    throw error;
  }
}
