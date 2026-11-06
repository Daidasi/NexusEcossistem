import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',timeout:60000,use:{baseURL:process.env.NEXUS_E2E_URL??'http://127.0.0.1:3000',trace:'retain-on-failure'},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'android-layout',use:{...devices['Pixel 7']}}],reporter:[['list'],['html',{open:'never'}]]});
