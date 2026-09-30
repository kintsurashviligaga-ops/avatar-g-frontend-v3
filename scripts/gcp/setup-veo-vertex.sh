#!/usr/bin/env bash
# Provision Veo on Vertex AI for MyAvatar.ge (docs/VEO_VERTEX_SETUP.md). Safe to re-run: every step checks first.
#
#   PROJECT_ID=my-project BUCKET=myavatar-veo-outputs ./scripts/gcp/setup-veo-vertex.sh          # key mode
#   PROJECT_ID=my-project BUCKET=myavatar-veo-outputs AUTH=wif VERCEL_TEAM=my-team ./scripts/gcp/setup-veo-vertex.sh
#
# Needs: gcloud logged in as a project owner, and BILLING ALREADY LINKED to the project
# (https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID) — Vertex AI refuses to enable without it.
# Prints the Vercel variables at the end; it never uploads anything to Vercel itself.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${BUCKET:?set BUCKET (bucket name, no gs://)}"
LOCATION="${LOCATION:-us-central1}"          # Veo on Vertex is us-central1 only (2026-09)
SA_NAME="${SA_NAME:-myavatar-veo}"
AUTH="${AUTH:-key}"                          # key | wif
KEY_FILE="${KEY_FILE:-./${SA_NAME}-key.json}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"       # signed URLs live 7 days; outputs are kept a little longer

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
VERTEX_AGENT="service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com"

billing="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || echo false)"
if [[ "$billing" != "True" && "$billing" != "true" ]]; then
  echo "✗ Billing is not linked to $PROJECT_ID. Attach a card first:"
  echo "  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
  exit 1
fi

echo "→ enabling APIs"
gcloud services enable aiplatform.googleapis.com storage.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

echo "→ bucket gs://$BUCKET ($LOCATION, private, ${RETENTION_DAYS}-day lifecycle)"
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$LOCATION" --uniform-bucket-level-access --public-access-prevention
fi
lifecycle="$(mktemp)"
printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":%d}}]}\n' "$RETENTION_DAYS" > "$lifecycle"
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file="$lifecycle"
rm -f "$lifecycle"

echo "→ service account $SA_EMAIL"
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --display-name="MyAvatar Veo renderer"
fi
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" --role="roles/aiplatform.user" --condition=None >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA_EMAIL" --role="roles/storage.objectAdmin" >/dev/null
# Veo writes its output as the Vertex AI Service Agent. The agent exists once the API has been used; create it now.
gcloud beta services identity create --service=aiplatform.googleapis.com --project="$PROJECT_ID" >/dev/null 2>&1 || true
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$VERTEX_AGENT" --role="roles/storage.objectAdmin" >/dev/null

if [[ "$AUTH" == "wif" ]]; then
  : "${VERCEL_TEAM:?set VERCEL_TEAM (the Vercel team slug) for keyless auth}"
  POOL_ID="${POOL_ID:-vercel}"
  PROVIDER_ID="${PROVIDER_ID:-vercel-oidc}"
  ISSUER="https://oidc.vercel.com/${VERCEL_TEAM}"
  echo "→ workload identity pool $POOL_ID / provider $PROVIDER_ID ($ISSUER)"
  if ! gcloud iam workload-identity-pools describe "$POOL_ID" --location=global >/dev/null 2>&1; then
    gcloud iam workload-identity-pools create "$POOL_ID" --location=global --display-name="Vercel"
  fi
  if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --workload-identity-pool="$POOL_ID" --location=global >/dev/null 2>&1; then
    gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
      --workload-identity-pool="$POOL_ID" --location=global \
      --issuer-uri="$ISSUER" --allowed-audiences="https://vercel.com/${VERCEL_TEAM}" \
      --attribute-mapping="google.subject=assertion.sub,attribute.project=assertion.project_id,attribute.environment=assertion.environment"
  fi
  gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/*" >/dev/null
  # Keyless signing of the 7-day playback URLs goes through IAM signBlob as the service account itself.
  gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --role="roles/iam.serviceAccountTokenCreator" \
    --member="serviceAccount:$SA_EMAIL" >/dev/null
  cat <<EOF

✓ Done. Add to Vercel (Production), then redeploy:
  GCP_PROJECT_ID=$PROJECT_ID
  GCP_VEO_BUCKET=gs://$BUCKET
  GCP_PROJECT_NUMBER=$PROJECT_NUMBER
  GCP_SERVICE_ACCOUNT_EMAIL=$SA_EMAIL
  GCP_WORKLOAD_IDENTITY_POOL_ID=$POOL_ID
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=$PROVIDER_ID
EOF
else
  if [[ ! -f "$KEY_FILE" ]]; then
    gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="$SA_EMAIL"
  fi
  cat <<EOF

✓ Done. Add to Vercel (Production, mark GCP_SERVICE_ACCOUNT_KEY as Sensitive), then redeploy:
  GCP_PROJECT_ID=$PROJECT_ID
  GCP_VEO_BUCKET=gs://$BUCKET
  GCP_SERVICE_ACCOUNT_KEY=<base64 of $KEY_FILE>     # base64 < "$KEY_FILE" | tr -d '\n'

⚠ $KEY_FILE is a long-lived secret: paste it into Vercel, then delete it. Never commit it.
EOF
fi
echo "Check: GET /api/video/engine → \"transport\": \"vertex\""
