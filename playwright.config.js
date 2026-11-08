import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',fullyParallel:true,workers:3,timeout:45000,
 use:{baseURL:'http://localhost:4173',browserName:'chromium',timezoneId:'Asia/Shanghai',locale:'zh-CN',headless:true},
 webServer:{command:'npm start',url:'http://localhost:4173',reuseExistingServer:!process.env.CI},
 reporter:[['list'],['html',{open:'never'}]],
});
