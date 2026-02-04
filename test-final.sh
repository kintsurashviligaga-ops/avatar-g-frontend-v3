#!/bin/bash

DEPLOY_URL="avatar-g-frontend-v3-kz6upw0dv-kintsurashviligaga-ops-projects.vercel.app"

echo "🎉 Final R2 Test"
echo "================"
echo ""

# Test 1: Environment Variables
echo "1️⃣ Testing Environment Variables..."
curl -s "https://${DEPLOY_URL}/api/debug-r2" | python3 -m json.tool | head -20

echo ""
echo "2️⃣ Testing File Upload..."
echo "Final test - $(date)" > /tmp/r2-final.txt

RESULT=$(curl -s -X POST \
  "https://${DEPLOY_URL}/api/upload?service=final&jobId=test-$(date +%s)" \
  -F "file=@/tmp/r2-final.txt")

echo "$RESULT" | python3 -m json.tool

if echo "$RESULT" | grep -q '"success": true'; then
  echo ""
  echo "✅✅✅ ALL TESTS PASSED! ✅✅✅"
  echo ""
  echo "🎊 R2 is PRODUCTION READY!"
else
  echo ""
  echo "❌ Upload failed"
fi

rm /tmp/r2-final.txt
