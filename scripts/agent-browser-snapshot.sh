#!/usr/bin/env bash
# The Chromium snapshot Agent G's browser starts from (lib/agent/browser/vercelHost, env BROWSER_SNAPSHOT_ID).
# Run INSIDE a fresh Vercel Sandbox (universal image, Ubuntu 26.04, 2 vCPU, network allow-all for this one-time setup),
# then snapshot that sandbox. First made 2026-11-06 as snap_C3jB9DDygiD4u6AjeRMczoOEaFMe (iad1, 1.1 GB; snapshots expire
# after 7 days unless made with an expiration, so make it again with this script, or with expiration 0 from the SDK).
#
# Playwright does not know Ubuntu 26.04 yet: the 24.04 build of Chromium's headless shell runs on it.
set -euo pipefail
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
mkdir -p /vercel/sandbox/browser && cd /vercel/sandbox/browser
npm init -y >/dev/null
npm i --no-audit --no-fund playwright-core@1.58.2           # the version this repo pins (package-lock)
node node_modules/playwright-core/cli.js install --only-shell chromium
sudo DEBIAN_FRONTEND=noninteractive bash -c 'apt-get update -q && apt-get install -y -q --no-install-recommends \
  libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 \
  libglib2.0-0t64 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
  libxkbcommon0 libxrandr2 libfontconfig1 libfreetype6 \
  fonts-noto-core fonts-noto-color-emoji fonts-dejavu-core fonts-liberation fonts-freefont-ttf \
  && apt-get clean && rm -rf /var/lib/apt/lists/*'
rm -rf /vercel/.npm/_cacache
# Check: Georgian text and a screenshot (the driver itself is written in per task by lib/agent/browser/runner).
node -e "require('playwright-core').chromium.launch().then(async b => { const p = await b.newPage(); await p.setContent('<p>ქართული</p>'); console.log(await p.innerText('p')); await b.close(); })"
