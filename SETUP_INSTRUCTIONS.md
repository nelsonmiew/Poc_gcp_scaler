# Setup Instructions for Poc_gcp_scaler

## Summary

✅ **All files are ready!** The following has been set up:

1. **TypeScript Configuration**: Fixed `tsconfig.json` to use ES2024 (TypeScript-compatible)
2. **Dependencies**: Installed via `pnpm install`
3. **Linting & Type Checking**: All checks pass
4. **GitHub Actions CI/CD**: Workflow created at `.github/workflows/ci.yml`
5. **Dockerfile**: Multi-stage build with security best practices
6. **Git Repository**: Initialized with initial commit
7. **Terraform Deployment**: Already configured in `Poc_gcp_gitops`

## Next Steps: Push to GitHub

### 1. Create GitHub Repository

Go to https://github.com/new and create a new repository:

- **Repository name**: `Poc_gcp_scaler`
- **Description**: Custom Cloud Run scaler for POC processor - replaces CREMA
- **Visibility**: Public or Private (your choice)
- **DO NOT** initialize with README, .gitignore, or license (we already have these)

### 2. Push Your Code

Once the repository is created, run these commands:

```bash
cd /home/nelson/workspaces/git_nelsonmiew/poc-gcp-crema/Poc_gcp_scaler

# Add GitHub remote (replace with your actual URL)
git remote add origin https://github.com/nelsonmiew/Poc_gcp_scaler.git

# Push to main branch
git push -u origin main
```

### 3. Configure GitHub Secrets & Variables

Go to your repository settings: `Settings` → `Secrets and variables` → `Actions`

#### Required Secrets

| Secret Name              | Description                                    | Example Value |
|-------------------------|------------------------------------------------|---------------|
| `WIF_PROVIDER`          | Workload Identity Federation provider          | `projects/123.../providers/github-provider` |
| `WIF_SERVICE_ACCOUNT`   | Service account for deployment                 | `github-actions@project.iam.gserviceaccount.com` |
| `GCP_POC_INFRA_REPO_PAT` | Personal Access Token for triggering gitops   | `ghp_...` |

#### Required Variables

| Variable Name    | Description              | Example Value                 |
|-----------------|--------------------------|-------------------------------|
| `GCP_PROJECT_ID` | Google Cloud Project ID  | `gcp-cloudrun-test-486816`    |

### 4. Verify CI/CD Pipeline

Once pushed, the GitHub Actions workflow will automatically:

1. ✅ Run linting (Biome)
2. ✅ Run type checking (TypeScript)
3. ✅ Build the application
4. 🐳 Build Docker image (on main branch only)
5. 📤 Push to Artifact Registry
6. 🚀 Trigger Terraform deployment in `Poc_gcp_gitops`

Check the Actions tab to see the pipeline running: `https://github.com/nelsonmiew/Poc_gcp_scaler/actions`

### 5. Terraform Deployment

The Terraform configuration in `Poc_gcp_gitops` is already set up:

- **Resource**: `google_cloud_run_v2_service.scaler` (in `terraform/scaler.tf`)
- **Variables**: `var.scaler_image_tag` (defaults to "latest")
- **Scaling**: min=1, max=1 (always running)
- **Scheduler**: Cloud Scheduler triggers `/scale` endpoint every 30 seconds

When your GitHub Actions workflow completes, it will dispatch to `Poc_gcp_gitops` which will:

1. Update the scaler image tag
2. Run `terraform apply`
3. Deploy the new scaler version to Cloud Run

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

## Testing Locally

Before pushing, you can test locally:

```bash
# Set environment variables
export PROJECT_ID="gcp-cloudrun-test-486816"
export REGION="us-central1"
export RABBITMQ_URL="amqp://guest:guest@localhost:5672"
export DRY_RUN="true"

# Start RabbitMQ
docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:4-management

# Run the scaler
pnpm dev

# In another terminal, trigger scaling
curl -X POST http://localhost:8080/scale
```

## Troubleshooting

### Docker Build Fails

Check that the Dockerfile is present and `pnpm build` works:

```bash
pnpm build
ls dist/
```

### GitHub Actions Fails

1. Check that all secrets and variables are set correctly
2. Verify Workload Identity Federation is configured
3. Check the Actions logs for specific errors

### Terraform Apply Fails

1. Check `Poc_gcp_gitops` repository Actions tab
2. Verify the image exists in Artifact Registry:
   ```bash
   gcloud artifacts docker images list \
     us-central1-docker.pkg.dev/gcp-cloudrun-test-486816/poc-images/scaler
   ```

## Files Created/Modified

- ✅ `.github/workflows/ci.yml` - CI/CD pipeline
- ✅ `.dockerignore` - Docker build optimization
- ✅ `.gitignore` - Git ignore rules (fixed pnpm-lock.yaml)
- ✅ `tsconfig.json` - Fixed ES2024 target and NodeNext module
- ✅ `pnpm-lock.yaml` - Now tracked in git (was incorrectly ignored)
- ✅ Initial git commit created

## Related Repositories

- **Poc_gcp_gitops**: Contains Terraform configuration for deploying the scaler
- **Poc_gcp_server**: WebSocket server that scaler monitors
- **Poc_gcp_processor**: Worker pool that scaler scales

## Need Help?

Refer to:
- `CLAUDE.md` - Development guidelines
- `README.md` - Project documentation
- PRD.md (in root) - Full project requirements

---

**Remember**: This is a proof-of-concept. Prioritize simplicity and validating the infrastructure pattern.
