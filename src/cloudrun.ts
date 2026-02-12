import { GoogleAuth } from "google-auth-library";
import { logger } from "./logger.js";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

interface ServiceResponse {
  scaling?: {
    manualInstanceCount?: number;
  };
}

export async function getInstanceCount(params: {
  projectId: string;
  region: string;
  serviceName: string;
}): Promise<number> {
  try {
    const client = await auth.getClient();
    const url = `https://run.googleapis.com/v2/projects/${params.projectId}/locations/${params.region}/services/${params.serviceName}`;

    logger.debug("Getting instance count", {
      service: params.serviceName,
      region: params.region,
    });

    const response = await client.request({ url });
    const service = response.data as ServiceResponse;

    const count = service.scaling?.manualInstanceCount ?? 0;

    logger.debug("Instance count retrieved", {
      service: params.serviceName,
      count,
    });

    return count;
  } catch (error) {
    logger.error("Failed to get instance count", {
      error: error instanceof Error ? error.message : String(error),
      service: params.serviceName,
    });
    throw error;
  }
}

export async function updateInstanceCount(params: {
  projectId: string;
  region: string;
  serviceName: string;
  instanceCount: number;
}): Promise<void> {
  try {
    const client = await auth.getClient();
    const url = `https://run.googleapis.com/v2/projects/${params.projectId}/locations/${params.region}/services/${params.serviceName}`;

    logger.info("Updating instance count", {
      service: params.serviceName,
      targetCount: params.instanceCount,
    });

    await client.request({
      url,
      method: "PATCH",
      params: {
        updateMask: "scaling.scalingMode,scaling.manualInstanceCount",
      },
      data: {
        scaling: {
          scalingMode: "MANUAL",
          manualInstanceCount: params.instanceCount,
        },
      },
    });

    logger.info("Instance count updated successfully", {
      service: params.serviceName,
      count: params.instanceCount,
    });
  } catch (error) {
    logger.error("Failed to update instance count", {
      error: error instanceof Error ? error.message : String(error),
      service: params.serviceName,
      targetCount: params.instanceCount,
    });
    throw error;
  }
}
