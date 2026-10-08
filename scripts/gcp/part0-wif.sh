#!/usr/bin/env bash
# GCP Part 0 for MyAvatar.ge: keyless Vercel OIDC → Workload Identity Federation → service-account impersonation,
# least privilege (docs/handoffs/2026-10-08-gcp-part0-report.md). Run as the project owner (Cloud Shell, or any gcloud;
# bash 3.2 compatible).
#
#   MODE=audit ./scripts/gcp/part0-wif.sh   # read-only: prints project, billing, APIs, WIF, SA, IAM, bucket state
#   MODE=plan  ./scripts/gcp/part0-wif.sh   # read-only: prints every gcloud command apply would run, runs none
#   MODE=apply ./scripts/gcp/part0-wif.sh   # makes the changes (only after the owner approved the plan)
#
# Never creates a service-account key. Prints no tokens; every value it prints is a non-secret identifier.
# Safe to re-run: apply checks before it creates and bindings are idempotent.
set -euo pipefail
# No interactive prompts: gcloud must never offer to enable an API or change anything on a "y" (audit stays read-only).
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

MODE="${MODE:-audit}"
PROJECT_ID="${PROJECT_ID:-gen-lang-client-0671348730}"
# Vercel identity (given by the owner 2026-10-08; the team slug is what Vercel's API names as the scope of the team id).
VERCEL_TEAM_SLUG="${VERCEL_TEAM_SLUG:-kintsurashviligaga-ops-projects}"
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-team_YGQHjuCUs0f7tKoLtrCgSIFG}"
VERCEL_PROJECT_NAME="${VERCEL_PROJECT_NAME:-avatar-g-frontend-v3}"
VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH}"
# Environments allowed to impersonate. Preview first; add production only with the owner's separate approval.
VERCEL_ENVIRONMENTS="${VERCEL_ENVIRONMENTS:-preview}"
POOL_ID="${POOL_ID:-vercel}"
PROVIDER_ID="${PROVIDER_ID:-vercel-oidc}"
SA_NAME="${SA_NAME:-myavatar-veo}"
BUCKET="${BUCKET:-myavatar-veo-outputs}"
LOCATION="${LOCATION:-us-central1}"          # Veo on Vertex: us-central1
RETENTION_DAYS="${RETENTION_DAYS:-30}"
INVOKER_ROLE_ID="${INVOKER_ROLE_ID:-myavatarVeoInvoker}"
SIGNER_ROLE_ID="${SIGNER_ROLE_ID:-myavatarUrlSigner}"

APIS=(aiplatform.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
      serviceusage.googleapis.com storage.googleapis.com)
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
ISSUER="https://oidc.vercel.com/${VERCEL_TEAM_SLUG}"   # Team issuer mode
JWT_AUD="https://vercel.com/${VERCEL_TEAM_SLUG}"       # default `aud` of a Vercel OIDC token (no custom audience)

hr() { printf '\n── %s\n' "$*"; }
q() { "$@" 2>&1 || true; }   # audit: show the error (e.g. PERMISSION_DENIED / NOT_FOUND) instead of stopping

case "$MODE" in audit|plan|apply) ;; *) echo "MODE must be audit, plan or apply" >&2; exit 2;; esac

# The owner named the one Google account for this project (2026-10-08). Never read or change GCP as anyone else.
EXPECTED_ACCOUNT="${EXPECTED_ACCOUNT:-myavatar.ge@gmail.com}"
ACTIVE_ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }   # not ${x,,}: macOS ships bash 3.2
if [[ "$(lower "$ACTIVE_ACCOUNT")" != "$(lower "$EXPECTED_ACCOUNT")" ]]; then
  echo "✗ gcloud is signed in as '${ACTIVE_ACCOUNT:-nobody}', not ${EXPECTED_ACCOUNT}. Stop." >&2
  echo "  Cloud Shell: open it as ${EXPECTED_ACCOUNT}, or run: gcloud auth login ${EXPECTED_ACCOUNT}" >&2
  exit 3
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
POOL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
VERTEX_AGENT="service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com"

# The provider only accepts tokens of this team + project + listed environments (ids, so a rename cannot widen it).
env_list="$(printf "'%s'," ${VERCEL_ENVIRONMENTS//,/ })"; env_list="[${env_list%,}]"
CONDITION="assertion.owner_id == '${VERCEL_TEAM_ID}' && assertion.project_id == '${VERCEL_PROJECT_ID}' && assertion.environment in ${env_list}"
MAPPING="google.subject=assertion.sub,attribute.owner_id=assertion.owner_id,attribute.project_id=assertion.project_id,attribute.environment=assertion.environment"

subject_principals() {
  local e
  for e in ${VERCEL_ENVIRONMENTS//,/ }; do
    printf 'principal://iam.googleapis.com/%s/subject/owner:%s:project:%s:environment:%s\n' \
      "$POOL" "$VERCEL_TEAM_SLUG" "$VERCEL_PROJECT_NAME" "$e"
  done
}

if [[ "$MODE" == "audit" ]]; then
  hr "identity"
  q gcloud config get-value account
  hr "project"
  q gcloud projects describe "$PROJECT_ID" --format='table(projectId,projectNumber,name,lifecycleState)'
  hr "billing link"
  q gcloud billing projects describe "$PROJECT_ID" --format='table(billingAccountName,billingEnabled)'
  acct="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null || true)"
  if [[ -n "$acct" ]]; then
    q gcloud billing accounts describe "${acct#billingAccounts/}" --format='table(name,displayName,open,masterBillingAccount)'
    q gcloud billing budgets list --billing-account="${acct#billingAccounts/}" --format='table(displayName,amount.specifiedAmount.units,thresholdRules[].thresholdPercent.list())'
  fi
  echo "(trial credit balance/expiry is not exposed by gcloud: Console → Billing → Credits)"
  hr "APIs (enabled ones are listed; a missing name is disabled)"
  q gcloud services list --enabled --project "$PROJECT_ID" --format='value(config.name)' \
    --filter="config.name:($(IFS=' '; echo "${APIS[*]}" | sed 's/ / OR /g'))"
  hr "workload identity pools / providers"
  # --show-deleted: a pool deleted in the last 30 days still holds its id, and create would fail on it.
  q gcloud iam workload-identity-pools list --location=global --project "$PROJECT_ID" --show-deleted \
    --format='table(name.basename(),state,disabled)'
  for p in $(gcloud iam workload-identity-pools list --location=global --project "$PROJECT_ID" --format='value(name.basename())' 2>/dev/null); do
    q gcloud iam workload-identity-pools providers list --workload-identity-pool="$p" --location=global --project "$PROJECT_ID" \
      --show-deleted --format='yaml(name,state,oidc.issuerUri,oidc.allowedAudiences,attributeMapping,attributeCondition)'
  done
  hr "service accounts"
  q gcloud iam service-accounts list --project "$PROJECT_ID" --format='table(email,disabled)'
  hr "policy on $SA_EMAIL (who may impersonate / sign as it)"
  q gcloud iam service-accounts get-iam-policy "$SA_EMAIL" --project "$PROJECT_ID" --format=yaml
  hr "user-managed keys on every service account (ours must have none)"
  for sa in $(gcloud iam service-accounts list --project "$PROJECT_ID" --format='value(email)' 2>/dev/null); do
    echo "$sa:"
    q gcloud iam service-accounts keys list --iam-account "$sa" --project "$PROJECT_ID" --managed-by=user --format='table(name.basename(),validAfterTime,disabled)'
  done
  hr "API keys (metadata only: names and restrictions, never the key string)"
  q gcloud services api-keys list --project "$PROJECT_ID" \
    --format='table(name.basename(),displayName,createTime,restrictions.apiTargets[].service.list())'
  hr "project roles held by service accounts"
  q gcloud projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' \
    --filter='bindings.members:serviceAccount' --format='table(bindings.role,bindings.members)'
  hr "custom roles"
  q gcloud iam roles list --project "$PROJECT_ID" --format='table(name.basename(),title,stage)'
  hr "buckets"
  q gcloud storage buckets list --project "$PROJECT_ID" --format='table(name,location,uniform_bucket_level_access,public_access_prevention)'
  hr "gs://$BUCKET"
  q gcloud storage buckets describe "gs://$BUCKET" --format='yaml(name,location,uniform_bucket_level_access,public_access_prevention,lifecycle_config)'
  q gcloud storage buckets get-iam-policy "gs://$BUCKET" --format=yaml
  exit 0
fi

# plan prints, apply runs. Commands that may legitimately "fail" because the thing already exists are guarded.
run() { if [[ "$MODE" == "plan" ]]; then printf '  %q' "$@"; echo; else "$@"; fi; }
exists() { [[ "$MODE" == "apply" ]] && "$@" >/dev/null 2>&1; }

if [[ "$MODE" == "apply" ]]; then
  billing="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || echo false)"
  [[ "$(lower "$billing")" == "true" ]] || { echo "✗ billing is not linked to $PROJECT_ID — stop" >&2; exit 1; }
  # Step 5 provisions the Vertex AI Service Agent, which only `gcloud beta` can do (Cloud Shell has it).
  gcloud beta services identity create --help >/dev/null 2>&1 ||
    { echo "✗ needs the gcloud beta component: gcloud components install beta — stop before changing anything" >&2; exit 1; }
fi
[[ "$MODE" == "plan" ]] && echo "PLAN for $PROJECT_ID ($PROJECT_NUMBER) — nothing below has been run"

hr "1. APIs"
run gcloud services enable "${APIS[@]}" --project "$PROJECT_ID"

hr "2. bucket gs://$BUCKET ($LOCATION, uniform access, public access prevented, ${RETENTION_DAYS}-day delete)"
exists gcloud storage buckets describe "gs://$BUCKET" ||
  run gcloud storage buckets create "gs://$BUCKET" --project "$PROJECT_ID" --location="$LOCATION" \
    --uniform-bucket-level-access --public-access-prevention
lifecycle="$(mktemp)"
printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":%d}}]}\n' "$RETENTION_DAYS" > "$lifecycle"
run gcloud storage buckets update "gs://$BUCKET" --lifecycle-file="$lifecycle"

hr "3. service account $SA_EMAIL (no keys)"
exists gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" ||
  run gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT_ID" --display-name="MyAvatar Veo renderer (WIF only, no keys)"

hr "4. custom roles: Veo invoker (project) and URL signer (on the SA itself)"
# predictLongRunning and fetchPredictOperation on publishers/google/models/veo-* are both checked as endpoints.predict.
exists gcloud iam roles describe "$INVOKER_ROLE_ID" --project "$PROJECT_ID" ||
  run gcloud iam roles create "$INVOKER_ROLE_ID" --project "$PROJECT_ID" --title="MyAvatar Veo invoker" \
    --permissions=aiplatform.endpoints.predict --stage=GA
# V4 signed URLs under WIF are signed through IAM signBlob as the SA; signBlob is all it needs (not TokenCreator).
exists gcloud iam roles describe "$SIGNER_ROLE_ID" --project "$PROJECT_ID" ||
  run gcloud iam roles create "$SIGNER_ROLE_ID" --project "$PROJECT_ID" --title="MyAvatar signed-URL signer" \
    --permissions=iam.serviceAccounts.signBlob --stage=GA

hr "5. grants"
run gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" \
  --role="projects/$PROJECT_ID/roles/$INVOKER_ROLE_ID" --condition=None
run gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" \
  --role="projects/$PROJECT_ID/roles/$SIGNER_ROLE_ID"
# App: uploads inputs (create, never overwrite: ifGenerationMatch=0) and signs read URLs (signer needs objects.get).
for role in roles/storage.objectCreator roles/storage.objectViewer; do
  run gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA_EMAIL" --role="$role"
done
# Vertex AI Service Agent: reads the gs:// inputs and writes Veo's sample_N.mp4 outputs.
run gcloud beta services identity create --service=aiplatform.googleapis.com --project="$PROJECT_ID" || true
# A service agent created a moment ago can take a minute to become visible to IAM ("does not exist").
retry() { local n; for n in 1 2 3 4 5 6 7 8 9; do "$@" && return 0; echo "  (not visible to IAM yet, retry $n/9 in 10 s)" >&2; sleep 10; done; "$@"; }
for role in roles/storage.objectCreator roles/storage.objectViewer; do
  retry run gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$VERTEX_AGENT" --role="$role"
done

hr "6. workload identity pool $POOL_ID / provider $PROVIDER_ID"
exists gcloud iam workload-identity-pools describe "$POOL_ID" --location=global --project "$PROJECT_ID" ||
  run gcloud iam workload-identity-pools create "$POOL_ID" --location=global --project "$PROJECT_ID" --display-name="Vercel" \
    --description="Vercel OIDC for ${VERCEL_PROJECT_NAME}"
provider_args=(--workload-identity-pool="$POOL_ID" --location=global --project "$PROJECT_ID" --issuer-uri="$ISSUER"
  --allowed-audiences="$JWT_AUD" --attribute-mapping="$MAPPING" --attribute-condition="$CONDITION")
if exists gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --workload-identity-pool="$POOL_ID" --location=global --project "$PROJECT_ID"; then
  run gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" "${provider_args[@]}"
else
  run gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" "${provider_args[@]}"
fi

hr "7. who may impersonate $SA_EMAIL: exactly one subject per allowed environment"
while read -r principal; do
  run gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project "$PROJECT_ID" --role=roles/iam.workloadIdentityUser --member="$principal"
done < <(subject_principals)

hr "8. remove the broad grants an earlier setup-veo-vertex.sh run would have left (ignored when absent)"
stale=(
  "roles/iam.workloadIdentityUser|principalSet://iam.googleapis.com/${POOL}/*"
  "roles/iam.serviceAccountTokenCreator|serviceAccount:${SA_EMAIL}"
)
for s in "${stale[@]}"; do
  if [[ "$MODE" == "plan" ]]; then
    run gcloud iam service-accounts remove-iam-policy-binding "$SA_EMAIL" --project "$PROJECT_ID" --role="${s%%|*}" --member="${s#*|}"
  else
    gcloud iam service-accounts remove-iam-policy-binding "$SA_EMAIL" --project "$PROJECT_ID" --role="${s%%|*}" --member="${s#*|}" >/dev/null 2>&1 || true
  fi
done
for m in "serviceAccount:$SA_EMAIL" "serviceAccount:$VERTEX_AGENT"; do
  if [[ "$MODE" == "plan" ]]; then
    run gcloud storage buckets remove-iam-policy-binding "gs://$BUCKET" --member="$m" --role=roles/storage.objectAdmin
  else
    gcloud storage buckets remove-iam-policy-binding "gs://$BUCKET" --member="$m" --role=roles/storage.objectAdmin >/dev/null 2>&1 || true
  fi
done
if [[ "$MODE" == "plan" ]]; then
  run gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" --role=roles/aiplatform.user
else
  gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" --role=roles/aiplatform.user --condition=None >/dev/null 2>&1 || true
fi
rm -f "$lifecycle"

cat <<EOF

Vercel → Settings → Security → OIDC Federation: Enabled, Issuer Mode = Team.
Vercel → Settings → Environment Variables, environment(s): ${VERCEL_ENVIRONMENTS} only. None of these is a secret.
  GCP_PROJECT_ID=$PROJECT_ID
  GCP_PROJECT_NUMBER=$PROJECT_NUMBER
  GCP_SERVICE_ACCOUNT_EMAIL=$SA_EMAIL
  GCP_WORKLOAD_IDENTITY_POOL_ID=$POOL_ID
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=$PROVIDER_ID
  GCP_VEO_BUCKET=gs://$BUCKET
  GCP_VEO_LOCATION=$LOCATION
  VEO_TRANSPORT=vertex
Do NOT set GCP_SERVICE_ACCOUNT_KEY. Then: MODE=audit $0 and paste its output back.
EOF
