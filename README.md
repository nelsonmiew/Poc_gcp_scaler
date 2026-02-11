# POC GCP Custom Scaler

Custom Cloud Run scaler that replaces CREMA for the POC project.

## Overview

This service polls RabbitMQ queue depth and scales the processor Cloud Run service accordingly.

**Architecture:**

```
Cloud Scheduler (every 30s)
    ↓ HTTP POST /scale
Custom Scaler (Cloud Run, min=1)
    ├─ GET RabbitMQ queue depth (HTTP)
    ├─ GET processor instance count (Cloud Run API)
    ├─ Calculate: Math.ceil(queueDepth / targetPerInstance)
    └─ UPDATE processor instance count (Cloud Run API)
```

## Features

- **Simple**: ~200 lines of TypeScript vs KEDA's thousands
- **Reliable**: Uses standard Cloud Run Admin API (no MANUAL mode issues)
- **Observable**: Structured JSON logs for all scaling decisions
- **Configurable**: Environment variables for all thresholds
- **Safe**: Dry-run mode for testing

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RABBITMQ_URL` | Yes | - | RabbitMQ connection URL |
| `PROJECT_ID` | Yes | - | GCP project ID |
| `REGION` | Yes | - | Cloud Run region |
| `PROCESSOR_SERVICE_NAME` | No | `poc-processor` | Processor service name |
| `TASK_QUEUE` | No | `tasks` | RabbitMQ queue name |
| `TARGET_PER_INSTANCE` | No | `3` | Messages per instance |
| `MIN_INSTANCES` | No | `0` | Minimum instances |
| `MAX_INSTANCES` | No | `5` | Maximum instances |
| `DRY_RUN` | No | `false` | Log only, don't update |
| `LOG_LEVEL` | No | `info` | Log level (debug/info/warn/error) |
| `PORT` | No | `8080` | HTTP server port |

## Scaling Logic

```typescript
targetInstances = Math.min(
  Math.max(
    Math.ceil(queueDepth / targetPerInstance),
    minInstances
  ),
  maxInstances
)
```

**Examples** (with `targetPerInstance=3`):
- 0 messages → 0 instances
- 1-3 messages → 1 instance
- 4-6 messages → 2 instances
- 7-9 messages → 3 instances

## Local Development

1. **Start RabbitMQ:**
   ```bash
   docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:4-management
   ```

2. **Set environment variables:**
   ```bash
   export RABBITMQ_URL="amqp://guest:guest@localhost:5672"
   export PROJECT_ID="gcp-cloudrun-test-486816"
   export REGION="us-central1"
   export DRY_RUN="true"
   ```

3. **Run service:**
   ```bash
   pnpm install
   pnpm dev
   ```

4. **Test scale endpoint:**
   ```bash
   curl -X POST http://localhost:8080/scale
   ```

## Deployment

Deployed via GitHub Actions to Cloud Run when pushed to `main`.

**Manual deployment:**

```bash
# Build image
docker build -t scaler:latest .

# Tag for Artifact Registry
docker tag scaler:latest \
  us-central1-docker.pkg.dev/gcp-cloudrun-test-486816/poc-registry/scaler:latest

# Push
docker push \
  us-central1-docker.pkg.dev/gcp-cloudrun-test-486816/poc-registry/scaler:latest

# Deploy via Terraform
cd ../Poc_gcp_gitops/terraform
terraform apply
```

## Monitoring

**View logs:**

```bash
gcloud logging tail 'resource.labels.service_name="poc-scaler"' \
  --format='value(textPayload)' \
  --project=gcp-cloudrun-test-486816
```

**Expected log output:**

```json
{"timestamp":"2026-02-11T10:30:00Z","level":"info","message":"Scaled processor","from":0,"to":3,"queueDepth":8,"reason":"scale_up"}
{"timestamp":"2026-02-11T10:30:30Z","level":"debug","message":"No scaling needed","currentInstances":3,"queueDepth":7}
{"timestamp":"2026-02-11T10:32:00Z","level":"info","message":"Scaled processor","from":3,"to":0,"queueDepth":0,"reason":"scale_down"}
```

## Troubleshooting

### Scaler not scaling processor

1. Check scaler logs for errors
2. Verify scaler has `roles/run.admin` permission
3. Verify processor is in MANUAL scaling mode
4. Check Cloud Scheduler job is enabled

### Queue depth always zero

1. Verify RabbitMQ management API is accessible
2. Check RabbitMQ credentials in Secret Manager
3. Verify queue name matches (`tasks` by default)

### Permission errors

```bash
# Grant scaler service account Cloud Run admin
gcloud projects add-iam-policy-binding gcp-cloudrun-test-486816 \
  --member="serviceAccount:poc-scaler@gcp-cloudrun-test-486816.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

## Benefits Over CREMA

- ✅ No MANUAL mode issues
- ✅ Simpler deployment (pure Terraform)
- ✅ No code changes to existing services
- ✅ Better observability
- ✅ Easier to debug (~200 lines vs thousands)
- ✅ Lower cost (~$2-3/month savings)
