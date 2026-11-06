import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'tests/e2e', timeout:180_000, workers:1,
 use:{baseURL:'http://127.0.0.1:4173',headless:true,actionTimeout:15_000,viewport:{width:390,height:844},
 launchOptions:process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}},
 reporter:[['list'],['json',{outputFile:'test-results/results.json'}]],
 webServer:{command:'pnpm preview --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:true}
});
