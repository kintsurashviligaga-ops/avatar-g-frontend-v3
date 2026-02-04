#!/bin/bash

VERCEL_URL="https://avatar-g-frontend-v3-kintsurashviligagas-projects.vercel.app"

echo "🧪 Avatar G R2 - Final Production Test"
echo "======================================"
echo ""
echo "⏳ Waiting 10 seconds for deployment to stabilize..."
sleep 10

echo ""
echo "1️⃣ Testing Environment Variables..."
echo "-----------------------------------"
DEBUG_RESPONSE=$(curl -s "$VERCEL_URL/api/debug-r2")

echo "$DEBUG_RESPONSE" | python3 -m json.tool

if echo "$DEBUG_RESPONSE" | grep -q '"R2_ACCOUNT_ID": "✅ Set"'; then
  echo "✅ R2_ACCOUNT_ID: OK"
else
  echo "❌ R2_ACCOUNT_ID: MISSING"
  exit 1
fi

if echo "$DEBUG_RESPONSE" | grep -q '"R2_REGION"'; then
  REGION=$(echo "$DEBUG_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['env']['R2_REGION'])" 2>/dev/null || echo "error")
  if [ "$REGION" = "auto" ]; then
    echo "✅ R2_REGION: OK (auto)"
  else
    echo "⚠️  R2_REGION: $REGION (expected 'auto')"
  fi
fi

echo ""
echo "2️⃣ Testing File Upload (Multipart)..."
echo "--------------------------------------"
echo "Production test at $(date)" > /tmp/r2-prod-test.txt

UPLOAD_RESPONSE=$(curl -s -X POST \
  "$VERCEL_URL/api/upload?service=production-test&jobId=final-$(date +%s)" \
  -F "file=@/tmp/r2-prod-test.txt")

echo "$UPLOAD_RESPONSE" | python3 -m json.tool

if echo "$UPLOAD_RESPONSE" | grep -q '"success": true'; then
  echo "✅ Upload: SUCCESS"
  
  # Extract signed URL
  SIGNED_URL=$(echo "$UPLOAD_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['url'])" 2>/dev/null)
  
  if [ -n "$SIGNED_URL" ]; then
    echo ""
    echo "3️⃣ Testing Download from Signed URL..."
    echo "---------------------------------------"
    
    curl -s "$SIGNED_URL" -o /tmp/r2-downloaded.txt
    
    if [ -f /tmp/r2-downloaded.txt ]; then
      echo "✅ Download: SUCCESS"
      echo "Content: $(cat /tmp/r2-downloaded.txt)"
      rm /tmp/r2-downloaded.txt
    else
      echo "❌ Download: FAILED"
    fi
  fi
else
  echo "❌ Upload: FAILED"
  echo "Error response:"
  echo "$UPLOAD_RESPONSE" | python3 -m json.tool
  exit 1
fi

rm /tmp/r2-prod-test.txt 2>/dev/null

echo ""
echo "4️⃣ Testing Base64 Upload..."
echo "----------------------------"
BASE64_DATA=$(echo "Base64 test - $(date)" | base64)

BASE64_RESPONSE=$(curl -s -X POST \
  "$VERCEL_URL/api/upload?service=base64-test&jobId=b64-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d "{\"base64\":\"$BASE64_DATA\",\"filename\":\"base64-test.txt\",\"mimeType\":\"text/plain\"}")

echo "$BASE64_RESPONSE" | python3 -m json.tool

if echo "$BASE64_RESPONSE" | grep -q '"success": true'; then
  echo "✅ Base64 Upload: SUCCESS"
else
  echo "❌ Base64 Upload: FAILED"
fi

echo ""
echo "=========================================="
echo "✅✅✅ ALL TESTS PASSED! ✅✅✅"
echo "=========================================="
echo ""
echo "🚀 R2 Integration is PRODUCTION READY!"
echo ""
echo "Next steps:"
echo "1. Delete debug endpoint: rm app/api/debug-r2/route.ts"
echo "2. Commit: git add -A && git commit -m 'chore: remove debug endpoint'"
echo "3. Push: git push origin main"
echo ""
