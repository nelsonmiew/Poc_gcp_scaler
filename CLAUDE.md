# Custom Cloud Run Scaler - Development Guidelines

## Project Context

This service is part of the **Cloud Run + CREMA Replacement** — a custom scaler that polls RabbitMQ queue depth and directly updates Cloud Run processor instances via the Cloud Run Admin API.

**Purpose:** Replace CREMA (Cloud Run External Metrics Autoscaler) with a simpler, more reliable solution that:
- Uses standard Cloud Run API (no MANUAL mode issues)
- Pure TypeScript implementation (~200 lines vs KEDA's Java codebase)
- Direct control over scaling logic
- Better observability and debugging

## Technology Stack

- **TypeScript 5.7+** with strict mode
- **Node.js 22+** (ESM only)
- **Hono** - HTTP framework
- **google-auth-library** - Cloud Run API client
- **Biome** - Lint and format

## Architecture

```
Cloud Scheduler (every 30s)
    ↓ HTTP POST /scale
Custom Scaler (this service)
    ├─ GET queue depth from RabbitMQ HTTP API
    ├─ Calculate target instances: ceil(depth / 3)
    ├─ GET current processor instance count
    └─ PATCH processor scaling (if different)
```

## Core Files

- `src/index.ts` - HTTP server with `/scale` and `/health` endpoints
- `src/scaler.ts` - Main scaling logic
- `src/cloudrun.ts` - Cloud Run Admin API wrapper
- `src/rabbitmq.ts` - RabbitMQ Management API wrapper
- `src/config.ts` - Environment variable parsing
- `src/logger.ts` - Structured JSON logger

## Scaling Algorithm

```typescript
targetInstances = Math.min(
  Math.max(
    Math.ceil(queueDepth / targetPerInstance),
    minInstances
  ),
  maxInstances
)
```

**Default thresholds:**
- `targetPerInstance = 3`
- `minInstances = 0`
- `maxInstances = 5`

**Examples:**
- 0 messages → 0 instances
- 1-3 messages → 1 instance
- 4-6 messages → 2 instances
- 7-9 messages → 3 instances

## Environment Variables

All configuration via environment variables:

```typescript
RABBITMQ_URL          // Required: amqp://user:pass@host:5672
PROJECT_ID            // Required: gcp-cloudrun-test-486816
REGION                // Required: us-central1
PROCESSOR_SERVICE_NAME // Optional: poc-processor
TASK_QUEUE            // Optional: tasks
TARGET_PER_INSTANCE   // Optional: 3
MIN_INSTANCES         // Optional: 0
MAX_INSTANCES         // Optional: 5
DRY_RUN               // Optional: false (set true for testing)
LOG_LEVEL             // Optional: info
PORT                  // Optional: 8080
```

## Development Workflow

### Local Testing

1. **Start RabbitMQ:**
   ```bash
   docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:4-management
   ```

2. **Set environment:**
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

4. **Test scaling:**
   ```bash
   # Trigger scale operation
   curl -X POST http://localhost:8080/scale

   # Check health
   curl http://localhost:8080/health
   ```

### Code Quality

Before committing:

```bash
pnpm lint       # Check with Biome
pnpm lint:fix   # Auto-fix issues
pnpm typecheck  # Verify TypeScript
```

## Cloud Run API Integration

### Get Instance Count

```typescript
GET /v2/projects/{projectId}/locations/{region}/services/{serviceName}

Returns: { scaling: { manualInstanceCount: number } }
```

### Update Instance Count

```typescript
PATCH /v2/projects/{projectId}/locations/{region}/services/{serviceName}
Body: { template: { scaling: { manualInstanceCount: number } } }
Params: { updateMask: "template.scaling.manualInstanceCount" }
```

**Key insight:** We use `template.scaling.manualInstanceCount` (not `scaling.manualInstanceCount` at root level) because Cloud Run Gen2 uses template-based configuration.

## RabbitMQ Management API

**Get Queue Depth:**

```typescript
GET http://host:15672/api/queues/%2F/{queueName}
Authorization: Basic base64(username:password)

Returns: { messages: number }
```

**Important:**
- Management API uses port 15672 (not 5672)
- URL path uses `%2F` for default vhost `/`
- Credentials extracted from AMQP URL

## Logging

All logs are structured JSON for Cloud Logging:

```json
{
  "timestamp": "2026-02-11T10:30:00Z",
  "level": "info",
  "message": "Scaled processor",
  "from": 0,
  "to": 3,
  "queueDepth": 8,
  "reason": "scale_up"
}
```

**Log levels:**
- `debug` - Queue depth, calculations, no-op decisions
- `info` - Scaling actions, startup/shutdown
- `warn` - Unexpected conditions
- `error` - API failures, exceptions

## Error Handling

- **RabbitMQ errors:** Log and throw (Cloud Scheduler will retry)
- **Cloud Run errors:** Log and throw (likely IAM permission issue)
- **Calculation errors:** Should never happen (validated config)

**Retry strategy:**
- Cloud Scheduler retries 3 times with exponential backoff
- Service doesn't implement internal retries (let scheduler handle it)

## Deployment

### Via GitHub Actions

Push to `main` branch triggers:
1. Lint and typecheck
2. Build Docker image
3. Push to Artifact Registry
4. Dispatch event to `Poc_gcp_gitops` for Terraform apply

### Manual Deployment

```bash
# Build and push image
docker build -t scaler:latest .
docker tag scaler:latest \
  us-central1-docker.pkg.dev/gcp-cloudrun-test-486816/poc-registry/scaler:latest
docker push \
  us-central1-docker.pkg.dev/gcp-cloudrun-test-486816/poc-registry/scaler:latest

# Deploy via Terraform
cd ../Poc_gcp_gitops/terraform
terraform apply
```

## Monitoring

### View Logs

```bash
gcloud logging tail 'resource.labels.service_name="poc-scaler"' \
  --format='value(textPayload)' \
  --project=gcp-cloudrun-test-486816
```

### Verify Scaling

```bash
# Check processor instance count
gcloud run services describe poc-processor \
  --region=us-central1 \
  --project=gcp-cloudrun-test-486816 \
  --format='value(spec.template.scaling.manualInstanceCount)'
```

### Cloud Scheduler Status

```bash
gcloud scheduler jobs describe poc-scaler-trigger \
  --location=us-central1 \
  --project=gcp-cloudrun-test-486816
```

## Troubleshooting

### Scaler not updating processor

1. **Check scaler logs for errors**
2. **Verify IAM permissions:**
   ```bash
   gcloud projects get-iam-policy gcp-cloudrun-test-486816 \
     --flatten="bindings[].members" \
     --filter="bindings.members:serviceAccount:poc-scaler@*"
   ```
   Should show `roles/run.admin`

3. **Verify processor is in MANUAL mode:**
   ```bash
   gcloud run services describe poc-processor \
     --region=us-central1 \
     --format='value(spec.template.scaling)'
   ```

### Queue depth always zero

1. **Test RabbitMQ API directly:**
   ```bash
   curl -u guest:guest \
     http://RABBITMQ_HOST:15672/api/queues/%2F/tasks
   ```

2. **Check RabbitMQ credentials in Secret Manager:**
   ```bash
   gcloud secrets versions access latest \
     --secret=rabbitmq-url \
     --project=gcp-cloudrun-test-486816
   ```

### Permission denied errors

Grant scaler service account Cloud Run admin:

```bash
gcloud projects add-iam-policy-binding gcp-cloudrun-test-486816 \
  --member="serviceAccount:poc-scaler@gcp-cloudrun-test-486816.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

## Code Conventions

### Follow ESM Standards

```typescript
// ✅ Good: .js extensions in imports
import { scale } from "./scaler.js";

// ❌ Wrong: missing .js
import { scale } from "./scaler";
```

### Async/Await Pattern

```typescript
// ✅ Good: top-level await
const queueDepth = await getQueueDepth({ url, queue });

// ❌ Avoid: promise chains
getQueueDepth({ url, queue }).then(depth => { ... });
```

### Type Safety

```typescript
// ✅ Good: strict types
const result: ScaleResult = await scale(config);

// ❌ Avoid: any
const result: any = await scale(config);
```

## Testing Strategy

### Current State

- No unit tests yet (POC phase)
- Manual testing via local RabbitMQ
- DRY_RUN mode for safe production testing

### Future Testing

When moving to production:

1. **Unit tests** for scaling algorithm
2. **Integration tests** with mock RabbitMQ API
3. **E2E tests** with actual Cloud Run services

## Key Differences from CREMA

| Aspect | CREMA | Custom Scaler |
|--------|-------|---------------|
| **Language** | Java (KEDA) | TypeScript |
| **Lines of code** | ~10,000+ | ~200 |
| **Deployment** | Complex (Terraform + gcloud CLI) | Pure Terraform |
| **Config** | YAML + Parameter Manager | Environment variables |
| **Scaling mode** | Requires MANUAL mode | Uses MANUAL mode |
| **API** | KEDA metrics API | Direct Cloud Run API |
| **Debugging** | KEDA logs, metrics-api | Simple JSON logs |
| **Latency** | ~60-90s | ~30-60s |

## Success Metrics

- ✅ Processor scales up within 60 seconds of queue growth
- ✅ Processor scales down to zero when idle
- ✅ No errors in logs for 24+ hours
- ✅ End-to-end message processing works
- ✅ Simpler ops (no CREMA troubleshooting)

## Future Enhancements

If this POC succeeds:

1. **Predictive scaling** - Scale up before queue grows (based on patterns)
2. **Multiple queues** - Support scaling based on multiple queue depths
3. **Custom metrics** - Expose Prometheus metrics for Grafana
4. **Webhooks** - Slack notifications for scaling events
5. **A/B testing** - Compare different scaling algorithms
