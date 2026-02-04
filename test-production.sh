#!/bin/bash

# CORRECT production URL from Vercel Dashboard
URL="https://avatar-g-frontend-v3.vercel.app"

echo "🧪 Avatar G R2 - Production Test"
echo "================================="
echo "URL: $URL"
echo ""

# Test 1: Env vars
echo "1️⃣ Environment Variables..."
curl -s "${URL}/api/debug-r2"
echo ""
echo ""

# Test 2: Upload
echo "2️⃣ File Upload..."
echo "Production test $(date)" > /tmp/prod-test.txt

curl -s -X POST \
  "${URL}/api/upload?service=prod&jobId=test-$(date +%s)" \
  -F "file=@/tmp/prod-test.txt"
echo ""

rm /tmp/prod-test.txt
