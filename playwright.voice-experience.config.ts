import { defineConfig, devices } from '@playwright/test';
const port=Number(process.env.PLAYWRIGHT_DEV_PORT||3218);
export default defineConfig({
 testDir:'./tests',testMatch:['voice-experience.spec.ts','live-voice-e2e.spec.ts'],
 timeout:120000,globalTimeout:720000,retries:0,workers:1,
 reporter:[['list'],['json',{outputFile:'test-results/voice-experience/results.json'}]],
 use:{baseURL:`http://localhost:${port}`,trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium-simulated-audio',use:{...devices['Desktop Chrome']}}],
 webServer:{command:`node node_modules/next/dist/bin/next dev -p ${port}`,url:`http://localhost:${port}`,reuseExistingServer:false,timeout:180000,
 env:{NEXT_PUBLIC_VOICE_EXPERIENCE_V2:'1',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'voice-local-anon',SUPABASE_SERVICE_ROLE_KEY:'voice-local-service',NEXT_TELEMETRY_DISABLED:'1'}},
});
