import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),profile=await fs.mkdtemp(path.join(os.tmpdir(),'ledger-startup-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
context.setDefaultTimeout(10000);
try {
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
 const errors=[];
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{chrome.storage.local.get=()=>new Promise(resolve=>{window.releaseStartup=()=>resolve({});});});
 await page.goto(`chrome-extension://${id}/popup.html`);await page.waitForFunction(()=>typeof window.releaseStartup==='function');
 for(const button of ['capture','clear','save'])assert.equal(await page.locator(`#${button}`).isDisabled(),true);
 await page.locator('#capture').dispatchEvent('click');await page.locator('#clear').dispatchEvent('click');
 assert.equal(await page.locator('#capture-form').count(),0);
 await page.evaluate(()=>window.releaseStartup());await page.waitForSelector('#capture-form');
 for(const button of ['capture','clear','save'])assert.equal(await page.locator(`#${button}`).isEnabled(),true);
 await page.locator('#capture').click();await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Capture works on web pages'));
 assert.equal(await page.locator('#clear').isEnabled(),true);
 const failed=await context.newPage();failed.on('pageerror',error=>errors.push(error.message));
 await failed.addInitScript(()=>{chrome.storage.local.get=async()=>{throw new Error('Simulated storage failure');};});
 await failed.goto(`chrome-extension://${id}/popup.html`);await failed.getByText(/Could not load your tracker/).waitFor();
 for(const button of ['capture','clear','save'])assert.equal(await failed.locator(`#${button}`).isDisabled(),true);
 await failed.locator('#capture').dispatchEvent('click');await failed.locator('#clear').dispatchEvent('click');
 await failed.waitForTimeout(100);assert.deepEqual(errors,[]);
 console.log('✓ Slow startup, early clicks, successful initialization, and failed initialization handled without uncaught errors.');
}finally{await context.close();}
