import { logger } from "./logger.js";

export async function getQueueDepth(params: {
  url: string;
  queue: string;
}): Promise<number> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

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

    // Sanitize URL for logging (hide password)
    const sanitizedUrl = queueUrl.replace(
      /\/\/[^:]+:[^@]+@/,
      "//<credentials>@",
    );

    logger.debug("Fetching queue depth", {
      url: sanitizedUrl,
      queue: params.queue,
    });

    // Set 10 second timeout for the request
    timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(queueUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response
        .text()
        .catch(() => "Unable to read response body");
      logger.error("RabbitMQ Management API returned error", {
        status: response.status,
        statusText: response.statusText,
        url: sanitizedUrl,
        queue: params.queue,
        responseBody: responseText,
      });
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
    // Sanitize URL for logging (hide password)
    const sanitizedUrl = params.url.replace(
      /\/\/[^:]+:[^@]+@/,
      "//<credentials>@",
    );

    logger.error("Failed to get queue depth", {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : "Unknown",
      queue: params.queue,
      originalUrl: sanitizedUrl,
    });
    throw error;
  } finally {
    // Clean up timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
