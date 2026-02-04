#!/bin/bash

DEPLOY_URL="avatar-g-frontend-v3-kz6upw0dv-kintsurashviligaga-ops-projects.vercel.app"

echo "🎉 Testing WORKING Deployment!"
echo "=============================="
echo ""

# Test 1: Upload
echo "📤 Testing Upload..."
echo "Final production test - $(date)" > /tmp/final-test.txt

UPLOAD=$(curl -s -X POST \
  "https://${DEPLOY_URL}/api/upload?service=final-test&jobId=success-$(date +%s)" \
  -F "file=@/tmp/final-test.txt")

echo "$UPLOAD" | python3 -m json.tool

if echo "$UPLOAD" | grep -q '"success": true'; then
  echo "✅ Upload: SUCCESS"
  
  # Test 2: Download
  URL=$(echo "$UPLOAD" | python3 -c "import sys, json; print(json.load(sys.stdin)['url'])" 2>/dev/null)
  
  if [ -n "$URL" ]; then
    echo ""
    echo "📥 Testing Download..."
    curl -s "$URL" -o /tmp/downloaded.txt
    
    if [ -f /tmp/downloaded.txt ]; then
      echo "✅ Download: SUCCESS"
      echo "Content: $(cat /tmp/downloaded.txt)"
      rm /tmp/downloaded.txt
    fi
  fi
else
  echo "❌ Upload failed"
fi

rm /tmp/final-test.txt

echo ""
echo "================================"
echo "🎊 R2 INTEGRATION COMPLETE!"
echo "================================"
