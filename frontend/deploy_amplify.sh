#!/usr/bin/env bash
# Build the React app and deploy dist/ to AWS Amplify (manual deployment, no Git).
# Usage: ./deploy_amplify.sh [APP_ID]
set -euo pipefail
cd "$(dirname "$0")"
APP_ID="${1:-d3jq7crkpzupwr}"
BRANCH=main
export AWS_REGION="${AWS_REGION:-us-east-1}"

npm run build
ZIP="$(mktemp -d)/site.zip"
(cd dist && zip -qr "$ZIP" .)

read -r JOB URL < <(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" \
  --query '[jobId,zipUploadUrl]' --output text)
curl -sf -T "$ZIP" -H 'Content-Type: application/zip' "$URL"
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB" >/dev/null

while :; do
  STATUS=$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB" \
    --query job.summary.status --output text)
  echo "job $JOB: $STATUS"
  case "$STATUS" in SUCCEED) break ;; FAILED|CANCELLED) exit 1 ;; esac
  sleep 5
done
echo "Live: https://$BRANCH.$APP_ID.amplifyapp.com"
